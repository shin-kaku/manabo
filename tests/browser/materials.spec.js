import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const stories = JSON.parse(await readFile(new URL("../../public/data/stories.json", import.meta.url), "utf8"));

test.describe("static character pages", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });

  test("character mnemonics keep the line breaks from the catalog", async ({ page }) => {
    const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url), "utf8"));
    for (const ch of ["見", "昆", "木"]) {
      await page.goto("/kanji/" + ch + "/");
      const source = rows.find(row => row["한자"] === ch)["풀이"];
      expect(await page.locator(".entry-explanation").innerText(), ch).toBe(source);
    }
  });

  test("a character page can return to the catalog without JavaScript or data requests", async ({ page }) => {
    await page.route("**/data/*.json", (route) => route.abort());
    await page.goto("/kanji/車/");
    await expect(page.locator("[data-entry-kanji]")).toHaveAttribute("data-entry-kanji", "車");
    await expect(page.locator(".entry-words").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "한자 도감으로", exact: true }).click();
    await expect(page.getByRole("heading", { name: "한자 도감", exact: true })).toBeVisible();
    await expect(page.locator("[data-directory-grid] a")).toHaveCount(96);
  });
});

test("the catalog return link carries filters before the detail module loads", async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.route("**/src/character-page.js", route => route.abort());
  await page.goto("/kanji/木/?q=木&jlpt=JLPT+N5&strokes=4&sort=memory&utm_source=test");
  await page.getByRole("link", { name: "한자 도감으로", exact: true }).click();
  const destination = new URL(page.url());
  expect(destination.pathname).toBe("/kanji/");
  expect(Object.fromEntries(destination.searchParams)).toEqual({ q: "木", jlpt: "JLPT N5", strokes: "4", sort: "memory" });
});

test("retired collection routes are missing and stories still open in the reader", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.fulfill({ body: "" }));
  for (const path of ["/materials", "/materials/", "/materials/kanji/", "/materials/kanji/primary-1/", "/materials/reading/story-12/"]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
  await page.goto("/reading/?story=story-12");
  await expect(page.locator("#storyTitle")).toHaveText(stories.find((story) => story.id === "story-12").title);
  await page.locator("#jlptStoryLevels button").first().click();
  await page.reload();
  await expect(page.locator("#storyTitle")).toHaveText(stories.find((story) => story.category === "JLPT").title);
});

test("the site menu contains neither the collection nor a duplicate catalog link", async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  for (const path of ["/", "/kanji/", "/kanji/木/", "/learn/", "/learn/words/", "/learn/game/", "/about/", "/copyright/", "/contact/", "/privacy-policy/"]) {
    await page.goto(path);
    const menu = page.locator(".site-info-menu");
    await expect(menu.locator('a[href^="/materials"], a[href="/kanji/"]')).toHaveCount(0);
    await expect(menu.locator('a[href="/about/"]')).toHaveCount(1);
  }
});

test("catalog and study guides have a seven-pixel gap above their titles at phone and desktop widths", async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  for (const [path, selector] of [["/kanji/", ".directory-guide"], ["/learn/", ".quiz-guide"]]) {
    await page.goto(path);
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(() => page.locator(selector).evaluate(guide =>
        Math.round(guide.nextElementSibling.getBoundingClientRect().top - guide.getBoundingClientRect().bottom),
      )).toBe(7);
    }
  }
});
