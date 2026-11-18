import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url)));

for (const mode of ["ministry", "memory"]) {
  test(`load more appends every ${mode} link once, in order, and focuses the next group`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
    const ordered = mode === "ministry"
      ? rows.filter(row => Number(row.문부성) > 0).sort((a, b) => a.문부성 - b.문부성)
      : rows.slice().sort((a, b) => a.암기순 - b.암기순);
    await page.goto(mode === "ministry" ? "/kanji/" : "/kanji/?sort=memory");
    const links = page.locator("[data-directory-grid] a");
    const more = page.locator("[data-directory-more]");
    await expect(more).toBeVisible();
    await expect(links).toHaveCount(96);
    const original = await links.first().elementHandle();
    for (let previous = 96; previous < ordered.length; previous += 96) {
      await more.click();
      await expect(links).toHaveCount(Math.min(previous + 96, ordered.length));
      await expect(links.nth(previous)).toBeFocused();
    }
    expect(await original.evaluate(node => node === document.querySelector("[data-directory-grid] a"))).toBe(true);
    await expect(more).toBeHidden();
    const glyphs = await links.locator("span[lang=ja]").allTextContents();
    expect(glyphs).toEqual(ordered.map(row => row.한자));
    expect(await links.evaluateAll(nodes => nodes.every(a => decodeURIComponent(a.pathname) === "/kanji/" + a.querySelector("span").textContent + "/"))).toBe(true);
  });
}
