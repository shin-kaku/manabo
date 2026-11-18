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
    await expect(page.locator("[data-directory-grid] a")).toHaveCount(96);
    expect(calls).toBe(0);
    await page.locator("#navStory").click();
    await expect(page.locator("#storyCopy")).not.toBeEmpty();
    await expect(page.locator("#learningStatus")).toBeHidden();
    await expect.poll(() => calls).toBe(1);
    await page.locator("#navGame").click();
    await page.locator("#navStory").click();
    expect(calls).toBe(1);
    release();
    await expect(page.locator("#storyFont")).toHaveAttribute("media", "all");
  } finally { release(); }
});

test("a stalled reading response times out and a fresh retry recovers", async ({ page }) => {
  await fixtures(page);
  await page.clock.install();
  let stalled = true, calls = 0;
  await page.route("**/data/stories.json", route => {
    calls++;
    if (!stalled) return route.fulfill({ json: stories });
  });
  await page.goto("/reading/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#learningMessage")).toContainText("불러오는 중");
  await expect.poll(() => calls).toBe(1);
  await page.clock.fastForward(20001);
  await expect(page.locator("#learningRetry")).toBeVisible();
  await expect(page.locator("#learningStatus")).toHaveAttribute("role", "alert");
  stalled = false;
  await page.locator("#learningRetry").click();
  await expect(page.locator("#storyCopy .kanji-link").first()).toBeVisible();
  await expect(page.locator("#learningStatus")).toBeHidden();
  expect(calls).toBe(2);
});

test("directory failure keeps initial links usable and retries with a fresh index request", async ({ page }) => {
  await fixtures(page);
  let calls = 0;
  await page.route("**/data/kanji-index.json", route => {
    calls++;
    if (calls === 1) return route.fulfill({ status: 503, body: "" });
    return route.continue();
  });
  await page.goto("/kanji/");
  const retry = page.locator("[data-directory-retry]");
  await expect(retry).toBeVisible();
  await expect(page.locator("[data-directory-grid] a")).toHaveCount(96);
  await expect(page.locator("[data-directory-message]")).toContainText("불러오지 못했습니다");
  await retry.click();
  await expect(retry).toBeHidden();
  await expect(page.locator("[data-directory-count]")).toHaveText(rows.filter(row => Number(row.문부성) > 0).length.toLocaleString("ko-KR") + "자");
  await page.locator("#directory-q").fill("犬");
  await expect(page.locator("[data-directory-grid] a")).toHaveCount(1);
  expect(calls).toBe(2);
});

test("a late-order legacy link opens an entry without fetching the full dictionary", async ({ page }) => {
  await fixtures(page);
  const character = rows.at(-1)["한자"];
  let calls = 0;
  await page.route("**/data/kanji.json", route => { calls++; return route.abort(); });
  await page.goto(`/kanji/#kanji=${encodeURIComponent(character)}`);
  await expect(page.locator("[data-entry-kanji]")).toHaveAttribute("data-entry-kanji", character);
  expect(decodeURIComponent(new URL(page.url()).pathname)).toBe(`/kanji/${character}/`);
  await expect(page.locator("[data-directory-grid]")).toHaveCount(0);
  expect(calls).toBe(0);
});
