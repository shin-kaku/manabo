import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const stories = JSON.parse(await readFile(new URL("../../public/data/stories.json", import.meta.url), "utf8"));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.fulfill({ body: "" }));
});

test("reader restores a linked story from history and the quiz hub starts the default story", async ({ page }) => {
  const original = stories.find(story => story.id === "story-12");
  await page.goto(`/reading/?story=${original.id}`);
  await expect(page.locator("#storyTitle")).toHaveText(original.title);
  await page.locator("#navKanji").click();
  await expect(page.locator("#navKanji")).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`story=${original.id}`));
  await expect(page.locator("#storyTitle")).toHaveText(original.title);
  await page.goForward();
  await page.locator("#navGame").click();
  await expect(page.locator("#readingJlpt")).toHaveValue("story-1");
  await page.getByRole("button", { name: "독해 시작하기", exact: true }).click();
  await expect(page.locator("#storyTitle")).toHaveText(stories.find(story => story.id === "story-1").title);
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

test("quiz hub opens a chosen JLPT or grade story only when the reader is started", async ({ page }) => {
  await page.goto("/quiz/");
  const jlpt = page.locator("#readingJlpt");
  const grade = page.locator("#readingGrade");
  const start = page.getByRole("button", { name: "독해 시작하기", exact: true });
  const jlptStories = stories.filter(story => story.category === "JLPT");
  const gradeStories = stories.filter(story => story.category === "학년별");
  for (const [select, category] of [[jlpt, jlptStories], [grade, gradeStories]]) {
    const ids = await select.locator("option").evaluateAll(options => options.map(option => option.value).filter(Boolean));
    expect(ids).toEqual(category.map(story => story.id));
  }
  for (const [select, other, story] of [[grade, jlpt, gradeStories.at(-1)], [jlpt, grade, jlptStories.at(-1)]]) {
    await select.selectOption(story.id);
    await expect(other).toHaveValue("");
    await expect(page).toHaveURL(/\/quiz\/$/);
    await expect(page.locator("#storyView")).toBeHidden();
    await start.click();
    await expect(page.locator("#storyTitle")).toHaveText(story.title);
    expect(new URL(page.url()).searchParams.get("story")).toBe(story.id);
    await expect(page.locator("#navGame")).toHaveAttribute("aria-current", "page");
    await page.goBack();
    await expect(start).toBeVisible();
    await expect(select).toHaveValue(story.id);
  }
});

test("reader exits from either end to its quiz card, including bookmarked stories", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reading/?story=story-12");
  const exits = page.locator("#storyView").getByRole("link", { name: "독해 나가기", exact: true });
  const start = page.getByRole("button", { name: "독해 시작하기", exact: true });
  await expect(exits).toHaveCount(2);
  await expect(exits.first()).toBeInViewport();
  await expect(page.locator("#storyTitle")).toHaveText(stories.find(story => story.id === "story-12").title);
  for (const exit of [exits.first(), exits.last()]) {
    await exit.click();
    await expect(page).toHaveURL(/\/quiz\/#reading-setup$/);
    await expect(page.locator("#readingGrade")).toHaveValue("story-12");
    await expect(start).toBeFocused();
    await start.click();
    await expect(page.locator("#storyTitle")).toBeVisible();
  }
});

test("mobile quiz hub stacks three cards and its textbook tab opens a separate page", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/quiz/");
  const nav = page.getByRole("navigation", { name: "콘텐츠 전환" });
  await expect(nav.getByRole("link")).toHaveText(["한자 도감", "한자 퀴즈", "한자 교재"]);
  await expect(nav.locator('[aria-current="page"]')).toHaveText("한자 퀴즈");
  const cards = page.locator("#gameView .game-shell");
  await expect(cards.getByRole("heading")).toHaveText(["사지선다", "한자음 독해 문제", "일본어 한자 게임"]);
  const bounds = await cards.evaluateAll(items => items.map(card => {
    const { top, bottom, left, right } = card.getBoundingClientRect();
    return { top, bottom, left, right };
  }));
  for (const [index, box] of bounds.entries()) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(375);
    if (index > 0) expect(box.top).toBeGreaterThanOrEqual(bounds[index - 1].bottom);
  }
  await expect(cards.last()).toContainText("준비 중");
  await expect(cards.last().locator("a, button, input, select, [tabindex]")).toHaveCount(0);
  await nav.getByRole("link", { name: "한자 교재" }).click();
  await expect(page).toHaveURL(/\/textbook\/$/);
  await expect(page.getByRole("main")).toHaveText("준비중");
  for (const meta of ['meta[name="description"]', 'meta[property="og:description"]']) {
    await expect(page.locator(meta)).toHaveAttribute("content", "준비중");
  }
  await expect(nav.locator('[aria-current="page"]')).toHaveText("한자 교재");
  await nav.getByRole("link", { name: "한자 도감" }).click();
  await expect(nav.locator('[aria-current="page"]')).toHaveText("한자 도감");
});
