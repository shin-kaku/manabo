import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url), "utf8"));
const stories = JSON.parse(await readFile(new URL("../../public/data/stories.json", import.meta.url), "utf8"));

async function fixtures(page) {
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.fulfill({ body: "" }));
  await page.route("**/data/kanji.json", route => route.fulfill({ json: rows }));
  await page.route("**/data/stories.json", route => route.fulfill({ json: stories }));
}

test("slow reading font never blocks kanji or reading data and is requested only once", async ({ page }) => {
  await fixtures(page);
  let release, calls = 0;
  const fontResponse = new Promise(resolve => { release = resolve; });
  await page.route("https://fonts.googleapis.com/**", async route => {
    calls++;
    await fontResponse;
    await route.fulfill({ contentType: "text/css", body: "" });
  });
  try {
    await page.goto("/kanji/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#grid .card")).toHaveCount(96);
    expect(calls).toBe(0);
    await page.locator("#navStory").click();
    await expect(page.locator("#storyCopy")).not.toBeEmpty();
    await expect(page.locator("#learningStatus")).toBeHidden();
    await expect.poll(() => calls).toBe(1);
    await page.locator("#navKanji").click();
    await page.locator("#navStory").click();
    expect(calls).toBe(1);
    release();
    await expect(page.locator("#storyFont")).toHaveAttribute("media", "all");
  } finally { release(); }
});

test("a stalled data request times out and a fresh retry recovers", async ({ page }) => {
  await fixtures(page);
  await page.clock.install();
  let stalled = true, calls = 0;
  await page.route("**/data/kanji.json", route => {
    calls++;
    if (!stalled) return route.fulfill({ json: rows });
    // Leave the response pending to exercise the real fetch abort path.
  });
  await page.goto("/kanji/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#learningMessage")).toContainText("불러오는 중");
  await page.clock.fastForward(20001);
  await expect(page.locator("#learningRetry")).toBeVisible();
  await expect(page.locator("#learningStatus")).toHaveAttribute("role", "alert");
  stalled = false;
  await page.locator("#learningRetry").click();
  await expect(page.locator("#grid .card")).toHaveCount(96);
  await expect(page.locator("#learningStatus")).toBeHidden();
  expect(calls).toBe(2);
});

test("a late-order direct detail link avoids creating thousands of preceding cards", async ({ page }) => {
  await fixtures(page);
  const last = rows.filter(row => row["문부성"] !== "").sort((a,b) => Number(a["문부성"]) - Number(b["문부성"])).at(-1);
  let calls = 0;
  await page.route("**/data/kanji.json", route => { calls++; return route.fulfill({ json: rows }); });
  await page.goto(`/kanji/#kanji=${encodeURIComponent(last["한자"])}`);
  await expect(page.locator("#detailOverlay")).toBeVisible();
  await expect(page.locator("#detailContent .card")).toHaveAttribute("data-kanji", last["한자"]);
  await expect(page.locator("#grid .card")).toHaveCount(96);
  expect(calls).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("#search")).toBeFocused();
});

test("infinite scroll still loads the next batch after fast initialization", async ({ page }) => {
  await fixtures(page);
  await page.goto("/kanji/");
  await expect(page.locator("#grid .card")).toHaveCount(96);
  await page.locator("#sentinel").scrollIntoViewIfNeeded();
  await expect(page.locator("#grid .card")).toHaveCount(192);
  expect(await page.locator("#grid .card").evaluateAll(cards => new Set(cards.map(card => card.dataset.kanji)).size)).toBe(192);
});
