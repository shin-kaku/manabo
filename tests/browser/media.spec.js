import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { driveFileId } from "../../src/image-sources.js";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url)));
const row = rows.find(item => item.한자 === "文");
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ZkAAAAASUVORK5CYII=", "base64");
const small = `/media/image1/${"a".repeat(64)}.webp`;
const large = `/media/image1/${"b".repeat(64)}.webp`;
const stroke = `/media/stroke/${"c".repeat(64)}.svg`;
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100"><animate attributeName="fill" values="black;white;black" dur="4s" repeatCount="indefinite"/></rect></svg>';

async function prepare(page, { failedLocal = false, failedCatalog = false } = {}) {
  const requests = [];
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/*", route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/favicon.svg") return route.continue();
    if (request.resourceType() === "image") {
      requests.push(url);
      if (url.pathname === stroke) return route.fulfill({ contentType: "image/svg+xml", headers: { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" }, body: svg });
      if (failedLocal && url.pathname.startsWith("/media/")) return route.fulfill({ status: 404, body: "missing" });
      return route.fulfill({ contentType: "image/png", body: pixel });
    }
    if (url.hostname !== "127.0.0.1") return route.fulfill({ body: "" });
    return route.continue();
  });
  await page.route("**/data/kanji.json", route => route.fulfill({ json: [{ ...row, "획순 SVG": "https://drive.google.com/file/d/animated/view" }] }));
  await page.route("**/data/media.json", route => route.fulfill(failedCatalog ? { status: 503, body: "unavailable" } : { json: {
    schema: 1, items: {
      image1: { [driveFileId(row["이미지 1"])]: { card: { url: small }, detail: { url: large } } },
      stroke: { animated: { card: { url: stroke }, detail: { url: stroke } } },
    },
  } }));
  await page.goto("/kanji/");
  await expect(page.locator("#learningStatus")).toBeHidden();
  return requests;
}

for (const width of [390, 1280]) test(`card uses 480px, detail/zoom use 960px, SVG stays animated at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const requests = await prepare(page);
  expect(requests).toHaveLength(0);
  await page.locator("#grid .front").click();
  await expect(page.locator("#grid .visual img")).toHaveAttribute("src", small);
  await page.locator("#grid .card-detail-button").click();
  await expect(page.locator("#detailOverlay .visual img")).toHaveAttribute("src", large);
  const image = page.locator("#detailOverlay .stroke-order-image");
  await expect(image).toHaveAttribute("src", stroke);
  await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth)).toBe(100);
  await image.scrollIntoViewIfNeeded();
  const box = await image.boundingBox();
  const clip = { x: Math.max(0, box.x), y: Math.max(0, box.y), width: 100, height: 100 };
  const first = await page.screenshot({ clip });
  await expect.poll(async () => (await page.screenshot({ clip })).equals(first), { intervals: [250, 400, 650], timeout: 5000 }).toBe(false);
  await page.locator(".detail-image-zoom").click();
  await expect(page.locator("#imageOverlay img")).toHaveAttribute("src", large);
  expect(requests.every(url => url.hostname === "127.0.0.1")).toBe(true);
});

test("missing optimized image falls back once to Drive; missing catalog also retains images", async ({ page }) => {
  const requests = await prepare(page, { failedLocal: true });
  await page.locator("#grid .front").click();
  await expect.poll(() => page.locator("#grid .visual img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(requests.filter(url => url.pathname === small)).toHaveLength(1);
  expect(requests.filter(url => url.hostname === "drive.google.com")).toHaveLength(1);
});

test("unavailable media catalog does not prevent legacy images loading", async ({ page }) => {
  const requests = await prepare(page, { failedCatalog: true });
  await page.locator("#grid .front").click();
  await expect.poll(() => page.locator("#grid .visual img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(requests.some(url => url.hostname === "drive.google.com")).toBe(true);
});
