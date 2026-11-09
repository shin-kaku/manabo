import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { driveFileId } from "../../src/image-sources.js";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url)));
const media = JSON.parse(await readFile(new URL("../../public/data/media.json", import.meta.url)));
const kanji = glyph => rows.find(row => row["한자"] === glyph);
const strokeUrl = row => media.items.stroke[driveFileId(row["움직이는 획순"])].detail.url;

async function captureRequests(page) {
  const paths = new Set();
  page.on("request", request => paths.add(new URL(request.url()).pathname));
  await page.addInitScript(() => {
    localStorage.setItem("manabo-theme-v1", "light");
    localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() }));
  });
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue() : route.fulfill({ body: "" }));
  return paths;
}

test("the kanji catalog opens from the index and loads the first card's real detail and stroke on demand", async ({ page }) => {
  const paths = await captureRequests(page);
  await page.goto("/kanji/");
  const first = page.locator("#grid .card").first();
  await expect(first.locator(".front")).toBeVisible();
  expect([...paths].filter(path => path.startsWith("/data/"))).toEqual(["/data/kanji-index.json"]);
  expect([...paths].filter(path => path.startsWith("/media/"))).toEqual([]);

  const row = kanji(await first.getAttribute("data-kanji"));
  await first.locator(".front").click();
  await expect(first.locator(".mnemonic-info .desc")).toContainText(row["풀이"].trim());
  await first.locator(".card-detail-button").click();
  const detail = page.locator("#detailOverlay .detail-card");
  await expect(detail).toHaveAttribute("data-kanji", row["한자"]);
  await expect(detail.locator(".mnemonic-info .desc")).toContainText(row["풀이"].trim());
  const stroke = detail.locator(".stroke-order-image");
  await expect(stroke).toHaveAttribute("src", strokeUrl(row) + "#light");
  await expect.poll(() => stroke.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  expect([...paths].filter(path => path.startsWith("/data/kanji-detail/"))).toHaveLength(1);
  expect(paths.has("/data/kanji.json")).toBe(false);
  expect(paths.has("/data/media.json")).toBe(false);

  await page.keyboard.press("Escape");
  const target = kanji("機");
  await page.locator("#grade").selectOption(target["학년"]);
  await page.locator("#jlpt").selectOption(target["등급"]);
  await page.locator("#search").fill(target["한자"]);
  await expect(page.locator("#resultCount")).toHaveText("1");
  await expect(page.locator("#grid .card")).toHaveAttribute("data-kanji", target["한자"]);
});

test("a missing versioned detail falls back to the full data and opens the correct direct link", async ({ page }) => {
  const paths = await captureRequests(page);
  await page.route("**/data/kanji-detail/**", route => route.fulfill({ status: 404 }));
  const row = kanji("亀");
  await page.goto("/kanji/#kanji=" + encodeURIComponent(row["한자"]));
  const detail = page.locator("#detailOverlay .detail-card");
  await expect(detail).toHaveAttribute("data-kanji", row["한자"]);
  await expect(detail.locator(".mnemonic-info .desc")).toContainText(row["풀이"].trim());
  await expect(detail.locator(".stroke-order-image")).toHaveAttribute("src", strokeUrl(row) + "#light");
  expect(paths.has("/data/kanji.json")).toBe(true);
  expect(paths.has("/data/media.json")).toBe(true);
});
