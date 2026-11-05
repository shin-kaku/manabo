import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const stories = JSON.parse(await readFile(new URL("../../public/data/stories.json", import.meta.url), "utf8"));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.fulfill({ body: "" }));
});

test("reading tab follows the story in the URL after navigating back", async ({ page }) => {
  const original = stories.find(story => story.id === "story-12");
  await page.goto(`/reading/?story=${original.id}`);
  await expect(page.locator("#storyTitle")).toHaveText(original.title);
  await page.locator("#navKanji").click();
  await page.locator("#navStory").click();
  await page.locator("#gradeStoryLevels button").first().click();
  await expect(page.locator("#storyTitle")).not.toHaveText(original.title);
  await page.goBack();
  await expect(page.locator("#navKanji")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#learningStatus")).toBeHidden();
  await page.locator("#navStory").click();
  await expect(page).toHaveURL(new RegExp(`story=${original.id}`));
  await expect(page.locator("#storyTitle")).toHaveText(original.title);
});

test("keyboard story selection retains focus on the selected level", async ({ page }) => {
  await page.goto("/reading/");
  await expect(page.locator("#learningStatus")).toBeHidden();
  await page.locator("#jlptStoryLevels button").first().focus();
  await page.keyboard.press("Enter");
  const chosen = page.locator('#jlptStoryLevels button[aria-current="true"]');
  await expect(chosen).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#jlptStoryLevels button").nth(1)).toBeFocused();
});
