import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { driveFileId } from "../../src/image-sources.js";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url)));
const media = JSON.parse(await readFile(new URL("../../public/data/media.json", import.meta.url)));
const row = rows.find(row => row.한자 === "車");
const artPath = media.items.image2[driveFileId(row["이미지 2"])].detail.url;
const strokePath = media.items.stroke[driveFileId(row["움직이는 획순"])].detail.url;
const svg = await readFile(new URL("../../public/strokes/車.svg", import.meta.url));
const art = await sharp({ create: { width: 960, height: 960, channels: 3, background: "white" } }).webp().toBuffer();

for (const width of [320, 390, 768, 1280]) {
  test(`direct entry serves the 960px illustration, stroke and aligned metadata at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
    await page.route("**" + artPath, route => route.fulfill({ contentType: "image/webp", body: art }));
    await page.route("**" + strokePath + "*", route => route.fulfill({ contentType: "image/svg+xml", body: svg }));
    const dataRequests = [];
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/data/")) dataRequests.push(path);
    });
    await page.goto("/kanji/車/", { waitUntil: "domcontentloaded" });
    const image = page.locator(".entry-art");
    const stroke = page.locator(".entry-stroke");
    await expect(image).toHaveAttribute("src", artPath);
    await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth)).toBe(960);
    await expect.poll(() => stroke.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    expect(await stroke.evaluate(img => new URL(img.currentSrc).pathname)).toBe(strokePath);
    const entryBox = await page.locator("[data-entry-kanji]").boundingBox();
    const pairBox = await page.locator(".entry-pair").boundingBox();
    const leftMargin = pairBox.x - entryBox.x;
    const rightMargin = entryBox.x + entryBox.width - pairBox.x - pairBox.width;
    expect(Math.abs(leftMargin - rightMargin)).toBeLessThan(1);
    const meta = page.locator(".entry-header .entry-meta");
    await expect(meta.locator("a")).toHaveCount(3);
    const glyphBox = await page.locator(".entry-header h1 strong").boundingBox();
    const metaBox = await meta.boundingBox();
    expect(Math.abs(metaBox.y + metaBox.height / 2 - glyphBox.y - glyphBox.height / 2)).toBeLessThan(6);
    expect(metaBox.x).toBeGreaterThan(glyphBox.x + glyphBox.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.locator("[data-entry-zoom]")).toHaveAttribute("href", artPath);
    expect(dataRequests).toEqual([]);
  });
}
