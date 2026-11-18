import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url)));

test("load more appends every catalog link once, focuses the next group and retains the existing links", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.goto("/kanji/");
  const links = page.locator("[data-directory-grid] a");
  const more = page.locator("[data-directory-more]");
  await expect(more).toBeVisible();
  await expect(links).toHaveCount(96);
  const original = await links.first().elementHandle();
  for (let previous = 96; previous < rows.length; previous += 96) {
    await more.click();
    await expect(links).toHaveCount(Math.min(previous + 96, rows.length));
    await expect(links.nth(previous)).toBeFocused();
  }
  expect(await original.evaluate(node => node === document.querySelector("[data-directory-grid] a"))).toBe(true);
  await expect(more).toBeHidden();
  const glyphs = await links.locator("span[lang=ja]").allTextContents();
  expect(glyphs.slice().sort()).toEqual(rows.map(row => row.한자).sort());
  expect(await links.evaluateAll(nodes => nodes.every(a => decodeURIComponent(a.pathname) === "/kanji/" + a.querySelector("span").textContent + "/"))).toBe(true);
});
