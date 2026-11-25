import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url)));

test("back and reload restore the expanded directory before returning to the selected kanji", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/kanji/");
  const links = page.locator("[data-directory-grid] a");
  const more = page.locator("[data-directory-more]");
  await more.click();
  await expect(links).toHaveCount(192);
  await more.click();
  await expect(links).toHaveCount(288);
  const target = links.nth(250);
  await expect(target.locator("span")).toHaveText("皮");
  await target.evaluate(link => link.scrollIntoView({ block: "center", behavior: "instant" }));
  const before = await page.evaluate(() => scrollY);
  expect(before).toBeGreaterThan(1000);
  await target.click();
  await expect(page.locator("[data-entry-kanji]")).toHaveAttribute("data-entry-kanji", "皮");
  await page.goBack();
  await expect(links).toHaveCount(288);
  await expect(target).toBeInViewport();
  await expect.poll(() => page.evaluate(y => Math.abs(scrollY - y), before)).toBeLessThan(5);
  await page.reload();
  await expect(links).toHaveCount(288);
  await expect(target).toBeInViewport();
  await expect.poll(() => page.evaluate(y => Math.abs(scrollY - y), before)).toBeLessThan(5);

  await page.locator("#directory-q").fill("皮");
  await expect(links).toHaveCount(1);
  await expect(links.first()).toBeInViewport();
  await expect.poll(() => page.evaluate(() => history.state.directoryScroll)).toBe(0);
});

test("detail back preserves the directory search, filters and sort", async ({ page }) => {
  await page.goto("/kanji/");
  const filters = {
    sort: "memory",
    jlpt: "JLPT N2",
    grade: "초등학교 6학년",
    strokes: "18",
  };
  for (const [field, value] of Object.entries(filters)) {
    await page.locator(`#directory-${field}`).selectOption(value);
  }
  await page.locator("#directory-q").fill("문 문");
  const result = page.locator("[data-directory-grid] a");
  await expect(result).toHaveCount(1);
  await expect(result.locator("span")).toHaveText("簡");
  const listUrl = page.url();
  await result.click();
  await expect(page.locator("[data-entry-kanji]")).toHaveAttribute("data-entry-kanji", "簡");
  await page.goBack();
  await expect(page).toHaveURL(listUrl);
  await expect(page.locator("#directory-q")).toHaveValue("문 문");
  for (const [field, value] of Object.entries(filters)) {
    await expect(page.locator(`#directory-${field}`)).toHaveValue(value);
  }
  await expect(result).toHaveCount(1);
  await expect(result).toBeInViewport();
});

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
