import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const stories = JSON.parse(await readFile(new URL("../../public/data/stories.json", import.meta.url), "utf8"));

test("materials and complete reading text are usable without JavaScript or data requests", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route("**/data/*.json", (route) => route.abort());
  await page.goto("/materials/");
  await expect(page.getByRole("heading", { name: "한자 학습 자료 모음", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "초등학교 1학년 · 80자", exact: true }).click();
  await expect(page.locator(".material-entry")).toHaveCount(80);
  await page.getByRole("link", { name: "車", exact: true }).click();
  await expect(page.locator('[id="char-車"]')).toBeInViewport();
  await expect(page.locator('[id="char-車"]')).toContainText("自動車(じどうしゃ) 자동차");
  await page.goto("/materials/reading/story-10/");
  const source = stories.find((story) => story.id === "story-10");
  expect((await page.locator(".material-story").innerText()).replace(/\s+/g, " ").trim()).toBe(source.versions[0].body.replace(/\s+/g, " ").trim());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});

test("a reading material opens the matching interactive story and a new selection survives reload", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.fulfill({ body: "" }));
  await page.goto("/materials/reading/story-12/");
  await page.getByRole("link", { name: "한자를 누르며 독해 연습하기" }).click();
  await expect(page.locator("#storyTitle")).toHaveText(stories.find((story) => story.id === "story-12").title);
  await page.locator("#jlptStoryLevels button").first().click();
  await page.reload();
  await expect(page.locator("#storyTitle")).toHaveText(stories.find((story) => story.category === "JLPT").title);
});
