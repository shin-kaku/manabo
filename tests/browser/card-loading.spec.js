import { expectWindowedCards } from "./virtual-grid-helpers.js";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url), "utf8"));
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ZkAAAAASUVORK5CYII=", "base64");

test("list cards request their image on first flip and retain full detail content", async ({ page }) => {
  const images = [];
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/*", route => {
    const request = route.request();
    if (new URL(request.url()).hostname === "127.0.0.1") return route.continue();
    if (request.resourceType() === "image") images.push(request.url());
    return route.fulfill({ contentType: request.resourceType() === "image" ? "image/png" : "text/plain", body: request.resourceType() === "image" ? pixel : "" });
  });
  await page.route("**/data/kanji.json", route => route.fulfill({ json: rows }));
  await page.goto("/kanji/");
  await expectWindowedCards(page);
  await expect(page.locator("#grid .reading-info, #grid .examples-info")).toHaveCount(0);
  await expect(page.locator("#grid .visual img[src]")).toHaveCount(0);
  expect(images).toHaveLength(0);
  const card = page.locator("#grid .card").first();
  const ch = await card.getAttribute("data-kanji");
  await card.locator("button.front").click();
  await expect.poll(() => card.locator(".visual img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(images).toHaveLength(1);
  await card.locator(".back-flip-button").click();
  await card.locator("button.front").click();
  expect(images).toHaveLength(1);
  await card.locator(".card-detail-button").click();
  await expect(page.locator("#detailOverlay .detail-card")).toHaveAttribute("data-kanji", ch);
  await expect(page.locator("#detailOverlay .reading-info")).toBeVisible();
  await expect(page.locator("#detailOverlay .examples-info")).toBeVisible();
  await expect(page.locator("#detailOverlay .example-word rt").first()).toBeVisible();
  await expect(page.locator("#detailOverlay .stroke-order-image")).toBeVisible();
});
