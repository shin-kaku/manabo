import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const carSvg = await readFile(new URL("../../public/strokes/車.svg", import.meta.url));

async function colors(image) {
  const png = await image.screenshot({ animations: "allow" });
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // Isolated interiors of 車's first horizontal and final vertical strokes, away from arrows.
  function pixel(x, y) {
    const col = Math.round(x * info.width / 708.66);
    const row = Math.round(y * info.height / 708.66);
    const offset = (row * info.width + col) * info.channels;
    return data.toString("hex", offset, offset + 3);
  }
  const redNumbers = data.some((r, i) =>
    i % info.channels === 0 && r === 188 && data[i + 1] === 0 && data[i + 2] === 45);
  return { first: pixel(433, 235), last: pixel(344, 495), redNumbers };
}

function closeColor(actual, expected) {
  return [0, 2, 4].every(i => Math.abs(parseInt(actual.slice(i, i + 2), 16) - parseInt(expected.slice(i, i + 2), 16)) <= 8);
}

async function colorsMatch(image, first, last) {
  const result = await colors(image);
  return result.redNumbers && closeColor(result.first, first) && closeColor(result.last, last);
}

test("車 keeps the page's ink and guide colors when an embedded SVG prefers the opposite scheme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/media/stroke/**", route => route.fulfill({
    contentType: "image/svg+xml", body: carSvg,
  }));
  await page.goto("/kanji/車/", { waitUntil: "domcontentloaded" });
  const image = page.locator(".entry-stroke");
  await expect(image).toBeVisible();
  await page.addStyleTag({ content: `
    :root[data-theme="light"] .entry-stroke { color-scheme: dark !important; }
    :root[data-theme="dark"] .entry-stroke { color-scheme: light !important; }
  ` });
  await image.evaluate(el => el.scrollIntoView({ block: "center" }));
  // During the first strokes the top is written and the final vertical is still a guide.
  await expect.poll(() => colorsMatch(image, "242a2b", "e5e8e7"), { timeout: 12000 }).toBe(true);

  await page.locator("[data-theme-toggle]").first().dispatchEvent("click");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => colorsMatch(image, "e6e8e8", "3d4141"), { timeout: 12000 }).toBe(true);

  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/kanji/車/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => image.evaluate(img => new URL(img.currentSrc, location.href).hash)).toBe("#dark-still");
  await page.addStyleTag({ content: ".entry-stroke { color-scheme: light !important; }" });
  await image.evaluate(el => el.scrollIntoView({ block: "center" }));
  await expect.poll(() => colorsMatch(image, "e6e8e8", "e6e8e8"), { timeout: 12000 }).toBe(true);
});
