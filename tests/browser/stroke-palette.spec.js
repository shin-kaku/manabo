import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url)));
const car = rows.find(row => row.한자 === "車");
const carSvg = await readFile(new URL("../../public/strokes/車.svg", import.meta.url));
const animatedId = "test-car-animation";
const catalogUrl = `/media/stroke/${"a".repeat(64)}.svg`;

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
  return { first: pixel(433, 242), last: pixel(344, 495), redNumbers };
}

test("車 keeps the page's ink and guide colors when an embedded SVG prefers the opposite scheme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/data/kanji.json", route => route.fulfill({ json: [{
    ...car, "움직이는 획순": `https://drive.google.com/file/d/${animatedId}/view`,
  }] }));
  // Serve the R animation through its normal catalog path, independent of future Google edits.
  await page.route("**" + catalogUrl, route => route.fulfill({
    contentType: "image/svg+xml",
    body: carSvg,
  }));
  await page.route("**/data/media.json", route => route.fulfill({ json: { schema: 1, items: { stroke: {
    [animatedId]: { strokeTheme: "explicit", strokeCount: 7, detail: { url: catalogUrl } },
  } } } }));
  await page.goto("/kanji/#kanji=車");
  const image = page.locator("#detailOverlay .stroke-order-image");
  await expect(image).toBeVisible();
  await page.addStyleTag({ content: `
    :root[data-theme="light"] .stroke-order-image { color-scheme: dark !important; }
    :root[data-theme="dark"] .stroke-order-image { color-scheme: light !important; }
  ` });
  await image.evaluate(el => el.scrollIntoView({ block: "center" }));
  // During the first strokes the top is written and the final vertical is still a guide.
  await expect.poll(() => colors(image), { timeout: 12000 }).toEqual({
    first: "242a2b", last: "e5e8e7", redNumbers: true,
  });

  await page.locator("[data-theme-toggle]").first().dispatchEvent("click");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => colors(image), { timeout: 12000 }).toEqual({
    first: "e6e8e8", last: "3d4141", redNumbers: true,
  });

  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/kanji/?reduced#kanji=車");
  await expect.poll(() => image.evaluate(img => new URL(img.currentSrc, location.href).hash)).toBe("#dark-still");
  await page.addStyleTag({ content: ".stroke-order-image { color-scheme: light !important; }" });
  await image.evaluate(el => el.scrollIntoView({ block: "center" }));
  await expect.poll(() => colors(image), { timeout: 12000 }).toEqual({
    first: "e6e8e8", last: "e6e8e8", redNumbers: true,
  });
});
