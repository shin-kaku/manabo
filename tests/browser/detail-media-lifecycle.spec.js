import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { driveFileId } from "../../src/image-sources.js";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url)));
const media = JSON.parse(await readFile(new URL("../../public/data/media.json", import.meta.url)));
const car = rows.find(row => row.한자 === "車");
const illustrationId = driveFileId(car["이미지 2"]);
const illustration = media.items.image2[illustrationId].detail.url;
const illustrationCard = media.items.image2[illustrationId].card.url;
const animation = media.items.stroke[driveFileId(car["움직이는 획순"])].detail.url;
const diagram = media.items.stroke[driveFileId(car["획순 이미지"])].detail.url;
const svg = await readFile(new URL("../fixtures/strokes/車.svg", import.meta.url));

for (const reducedMotion of ["reduce", "no-preference"]) {
  test(`failed catalog images recover to the illustration source and original Q diagram under ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
    await page.route("**" + illustration, route => route.fulfill({ status: 404, body: "" }));
    await page.route("**" + illustrationCard, route => route.fulfill({ status: 404, body: "" }));
    await page.route("**" + animation + "*", route => route.fulfill({ status: 404, body: "" }));
    await page.route("**" + diagram + "*", route => route.fulfill({ contentType: "image/svg+xml", body: svg }));
    await page.route("https://drive.google.com/thumbnail?**", route => {
      expect(new URL(route.request().url()).searchParams.get("id")).toBe(illustrationId);
      return route.fulfill({ contentType: "image/svg+xml", body: svg });
    });
    await page.goto("/kanji/車/", { waitUntil: "domcontentloaded" });
    const art = page.locator(".entry-art");
    const stroke = page.locator(".entry-stroke");
    await expect.poll(() => art.evaluate(img => img.complete && img.naturalWidth > 0 && new URL(img.currentSrc).searchParams.get("id"))).toBe(illustrationId);
    await expect.poll(() => stroke.evaluate(img => img.complete && img.naturalWidth > 0 && new URL(img.currentSrc).pathname)).toBe(diagram);
    await expect(page.locator("[data-entry-zoom]")).toHaveAttribute("href", await art.getAttribute("src"));
    await expect(page.locator("[data-entry-kanji]")).toContainText(car.풀이);
  });
}

test("the mnemonic, readings and related links remain usable when all media sources fail", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/media/**", route => route.fulfill({ status: 404, body: "" }));
  await page.route(/^https:\/\/(?:drive\.google\.com|lh3\.googleusercontent\.com)\//, route => route.fulfill({ status: 404, body: "" }));
  await page.goto("/kanji/車/", { waitUntil: "domcontentloaded" });
  const entry = page.locator("[data-entry-kanji]");
  await expect(entry.getByRole("heading", { name: "암기 풀이" })).toBeVisible();
  await expect(entry).toContainText(car.풀이);
  await expect(entry.getByRole("heading", { name: "일본어 읽기" })).toBeVisible();
  const link = entry.locator(".entry-words a[data-study-kanji]").first();
  await link.click();
  await expect(page.locator("dialog.study-lookup[open] .popover-glyph")).toHaveText(await link.getAttribute("data-study-kanji"));
});
