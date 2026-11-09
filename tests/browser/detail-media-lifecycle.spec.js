import { test, expect } from "@playwright/test";

const illustration = `/media/image1/${"a".repeat(64)}.webp`;
const stroke = `/media/stroke/${"b".repeat(64)}.svg`;
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ZkAAAAASUVORK5CYII=", "base64");
const rows = [
  {
    한자: "文", "훈, 음": "글월 문", 암기순: 1, 획: 4, 풀이: "글자(字)를 적어요.",
    "이미지 1": "https://drive.google.com/file/d/illustration/view",
    "움직이는 획순": "https://drive.google.com/file/d/animation/view",
    "획순 이미지": "https://drive.google.com/file/d/diagram/view",
  },
  { 한자: "字", "훈, 음": "글자 자", 암기순: 2, 획: 6 },
];

async function prepare(page) {
  const pending = new Map();
  const fallbacks = [];
  await page.addInitScript(() => {
    localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() }));
    window.detailMediaErrors = 0;
  });
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.pathname === illustration || url.pathname === stroke) {
      pending.set(url.pathname, route);
      return;
    }
    if (["drive.google.com", "lh3.googleusercontent.com"].includes(url.hostname)) {
      fallbacks.push(url.href);
      return route.fulfill({ contentType: "image/png", body: pixel });
    }
    if (url.hostname !== "127.0.0.1") return route.fulfill({ body: "" });
    return route.continue();
  });
  await page.route("**/data/kanji-index.json", route => route.fulfill({ status: 404 }));
  await page.route("**/data/kanji.json", route => route.fulfill({ json: rows }));
  await page.route("**/data/media.json", route => route.fulfill({ json: {
    schema: 1,
    items: {
      image1: { illustration: { detail: { url: illustration } } },
      stroke: { animation: { detail: { url: stroke } } },
    },
  } }));
  await page.goto("/kanji/#kanji=%E6%96%87", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#detailOverlay")).toBeVisible();
  await page.locator("#detailOverlay .stroke-order-image").scrollIntoViewIfNeeded();
  await expect.poll(() => pending.size).toBe(2);
  const images = await page.locator("#detailOverlay .visual img, #detailOverlay .stroke-order-image").elementHandles();
  for (const image of images) {
    await image.evaluate(img => img.addEventListener("error", () => window.detailMediaErrors++, { once: true }));
  }
  return { images, fallbacks, fail: () => Promise.all([...pending.values()].map(route => route.fulfill({ status: 404, body: "missing" }))) };
}

for (const action of ["close", "replace"]) {
  test(`late media failures do not start fallback requests after detail ${action}`, async ({ page }) => {
    const { images, fallbacks, fail } = await prepare(page);
    if (action === "close") {
      await page.locator("#detailClose").click();
      await expect(page.locator("#detailOverlay")).toBeHidden();
    } else {
      await page.locator("#detailOverlay .kanji-link").first().click();
      await page.locator("#popoverGo").click();
      await expect(page.locator("#detailContent .detail-card")).toHaveAttribute("data-kanji", "字");
    }
    await fail();
    await expect.poll(() => page.evaluate(() => window.detailMediaErrors)).toBe(2);
    // Inspect the removed nodes too: a late error must not assign another URL.
    expect(await images[0].getAttribute("src")).toBe(illustration);
    expect(await images[1].getAttribute("src")).toBe(stroke);
    expect(fallbacks).toEqual([]);
  });
}

test("visible detail illustration and stroke retain working fallbacks", async ({ page }) => {
  const { images, fallbacks, fail } = await prepare(page);
  await fail();
  for (const image of images) {
    await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  expect(fallbacks).toHaveLength(2);
  expect(fallbacks.map(url => new URL(url).searchParams.get("id")).sort()).toEqual(["diagram", "illustration"]);
});
