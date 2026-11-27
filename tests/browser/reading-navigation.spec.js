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
  await page.locator("#choose-reading").click();
  await expect(page.locator("#storyTitle")).toHaveText(stories.find(story => story.id === "story-1").title);
});

test("keyboard story selection retains focus on the selected level", async ({ page, browserName }) => {
  await page.goto("/reading/");
  await expect(page.locator("#learningStatus")).toBeHidden();
  await page.locator("#jlptStoryLevels button").first().focus();
  await page.keyboard.press("Enter");
  const chosen = page.locator('#jlptStoryLevels button[aria-current="true"]');
  await expect(chosen).toBeFocused();
  // macOS WebKit uses Option+Tab to include every focusable control.
  const nextControl = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
  await page.keyboard.press(nextControl);
  await expect(page.locator("#jlptStoryLevels button").nth(1)).toBeFocused();
});

test("back from a kanji detail and reload keep the reader on the same passage", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reading/?story=story-2");
  const title = stories.find(story => story.id === "story-2").title;
  const word = page.locator('#storyCopy [data-target-kanji="勝"]');
  await expect(word).toHaveCount(1);
  await word.evaluate(button => button.scrollIntoView({ block: "center", behavior: "instant" }));
  await word.click();
  const before = await page.evaluate(() => scrollY);
  expect(before).toBeGreaterThan(1000);
  await page.locator("#popoverGo").click();
  await expect(page.locator("[data-entry-kanji]")).toHaveAttribute("data-entry-kanji", "勝");
  await page.goBack();
  await expect(page.locator("#storyTitle")).toHaveText(title);
  await expect(word).toBeInViewport();
  await expect.poll(() => page.evaluate(y => Math.abs(scrollY - y), before)).toBeLessThan(5);

  const shifted = await page.evaluate(() => {
    window.scrollBy({ top: 100, behavior: "instant" });
    return scrollY;
  });
  await expect.poll(() => page.evaluate(() => history.state?.readingScroll?.y)).toBe(shifted);
  await page.reload();
  await expect(word).toBeInViewport();
  await expect.poll(() => page.evaluate(y => Math.abs(scrollY - y), shifted)).toBeLessThan(5);
});

test("cold reader restoration survives a late change in the passage layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let releaseStylesheet;
  const held = new Promise(resolve => { releaseStylesheet = resolve; });
  let holdStylesheet = false;
  let requestHeld = false;
  await page.route("https://fonts.googleapis.com/css2**", async route => {
    if (holdStylesheet) {
      requestHeld = true;
      await held;
    }
    // Reproduce the change in height above the word without depending on an external font.
    await route.fulfill({ contentType: "text/css", body: "#storyCopy p:first-child { margin-bottom: 200px; }" });
  });

  const word = page.locator('#storyCopy [data-target-kanji="勝"]');
  const first = page.locator("#storyCopy p").first();
  await page.goto("/reading/?story=story-2");
  await expect(first).toHaveCSS("margin-bottom", "200px");
  await word.evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
  const before = await word.evaluate(el => ({ y: scrollY, top: el.getBoundingClientRect().top }));
  await expect.poll(() => page.evaluate(() => history.state?.readingScroll?.y)).toBe(before.y);
  holdStylesheet = true;
  await page.reload({ waitUntil: "commit" });
  try {
    await expect(word).toBeAttached();
    await expect.poll(() => requestHeld).toBe(true);
    await expect(first).not.toHaveCSS("margin-bottom", "200px");
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  } finally {
    releaseStylesheet();
  }
  await expect(first).toHaveCSS("margin-bottom", "200px");
  await expect.poll(() => word.evaluate(el => el.getBoundingClientRect().top)).toBeCloseTo(before.top, 0);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(before.y);
});

test("a new reader entry or different story starts at the beginning", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reading/?story=story-2");
  await expect(page.locator("#storyCopy p").first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.locator('#storyCopy [data-target-kanji="勝"]').evaluate(button => button.scrollIntoView());

  const level = page.locator('#jlptStoryLevels button:not([aria-current="true"])').first();
  await level.click();
  await expect(page.locator("#storyCopy p").first()).toBeInViewport();
  await page.locator("#storyView .story-exit").last().click();
  await expect(page.locator("#choose-reading")).toBeFocused();
  await page.locator("#choose-reading").click();
  await expect(page.locator("#storyTitle")).toHaveText(stories.find(story => story.id === "story-1").title);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);

  await page.addInitScript(() => {
    if (location.pathname === "/reading/") {
      history.replaceState({ ...history.state, readingScroll: { story: "story-2", y: 4000 } }, "");
    }
  });
  await page.reload();
  await expect(page.locator("#storyCopy p").first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
});

test("the quiz hub opens the reader and its JLPT and grade stories", async ({ page }) => {
  await page.goto("/learn/");
  await page.locator("#choose-reading").click();
  await expect(page).toHaveURL(/\/reading\/$/);
  await expect(page.locator("#storyTitle")).toHaveText(stories.find(story => story.id === "story-1").title);
  for (const [group, category] of [["#jlptStoryLevels", "JLPT"], ["#gradeStoryLevels", "학년별"]]) {
    const levels = stories.filter(story => story.category === category);
    const buttons = page.locator(group).getByRole("button");
    await expect(buttons).toHaveCount(levels.length);
    const last = levels.at(-1);
    await buttons.last().click();
    await expect(page.locator("#storyTitle")).toHaveText(last.title);
    expect(new URL(page.url()).searchParams.get("story")).toBe(last.id);
    await page.reload();
    await expect(page.locator("#storyTitle")).toHaveText(last.title);
    await expect(buttons.last()).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#navGame")).toHaveAttribute("aria-current", "page");
  }
});

test("exiting a bookmarked story at either end restores the reader link in the hub", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const exits = page.locator("#storyView").getByRole("link", { name: "한자 학습으로", exact: true });
  for (const position of [0, 1]) {
    await page.goto("/reading/?story=story-12");
    await expect(page.locator("#storyTitle")).toHaveText(stories.find(story => story.id === "story-12").title);
    await expect(exits).toHaveCount(2);
    await expect(exits.first()).toBeInViewport();
    await exits.nth(position).click();
    await expect(page).toHaveURL(/\/learn\/$/);
    await expect(page.locator("#choose-reading")).toBeFocused();
  }
});

test("the study gallery orders choice, words, reading and Starpath", async ({ page }) => {
  await page.goto("/learn/");
  const shelf = page.locator(".quiz-shelf");
  const choice = shelf.getByRole("link", { name: "사지선다", exact: true });
  const reading = shelf.getByRole("link", { name: "독해", exact: true });
  await expect(shelf.locator(".quiz-tile-caption strong")).toHaveText(["사지선다", "단어", "독해", "한자 별길"]);
  await expect(shelf.getByRole("link", { name: "단어", exact: true })).toHaveAttribute("href", "/learn/words/");
  await expect(choice).toHaveAttribute("href", "/learn/choice/");
  await expect(choice).toHaveAccessibleDescription("보는 순간 뜻과 음이 떠오를 때까지, 기억을 꺼내는 훈련");
  await expect(reading).toHaveAttribute("href", "/reading/");
  await expect(choice.locator("picture img")).toBeVisible();
  await expect(reading.locator("picture img")).toBeVisible();
  const starpath = shelf.getByRole("link", { name: "한자 별길", exact: true });
  await expect(starpath).toHaveAttribute("href", "/learn/game/");
  await expect(starpath.locator("picture img")).toBeVisible();
  await expect(page.locator("#choice-card")).toBeHidden();
  await choice.press("Enter");
  await expect(page).toHaveURL(/\/learn\/choice\/$/);
  await expect(page.locator("#choice-card")).toBeVisible();
  await expect(shelf).toBeHidden();
  const jlpt = page.locator("#gameJlpt");
  const grade = page.locator("#gameGrade");
  await expect(jlpt.locator('input[value=""]')).toBeChecked();
  await expect(grade.locator('input[value=""]')).toBeChecked();
  const n5 = jlpt.locator('input[value="JLPT N5"]');
  await jlpt.locator('label:has(input[value="JLPT N5"])').click();
  await expect(n5).toBeChecked();
  await expect(jlpt.locator('input[value=""]')).not.toBeChecked();
  await page.locator('#gameCount label:has(input[value="25"])').click();
  const start = page.locator("#gameStart");
  await start.click();
  await expect(page.locator("#gamePlay .game-choice")).toHaveCount(4);
  await expect(page.locator("#gameProgress")).toHaveText("1 / 25");
  await page.locator("#gameExit").click();
  await expect(start).toBeFocused();
  await expect(page).toHaveURL(/\/learn\/choice\/$/);
  await page.locator(".quiz-exit").click();
  await expect(page).toHaveURL(/\/learn\/$/);
  await expect(choice).toBeVisible();
});

test("a quiz link clicked before the study script loads opens the reader", async ({ page }) => {
  let resume;
  const paused = new Promise(resolve => { resume = resolve; });
  await page.route(/\/(src\/main|assets\/main-[^/]+)\.js(?:\?.*)?$/, async route => {
    await paused;
    await route.continue();
  });
  try {
    await page.goto("/learn/", { waitUntil: "commit" });
    await page.locator("#choose-reading").click({ noWaitAfter: true });
    await page.waitForURL("**/reading/", { waitUntil: "commit" });
  } finally { resume(); }
  await expect(page.locator("#storyTitle")).toHaveText(stories.find(story => story.id === "story-1").title);
});

test("legacy quiz bookmarks open the matching page, and browser Back and Forward restore the gallery", async ({ page }) => {
  await page.goto("/quiz/#reading-setup");
  await expect(page).toHaveURL(/\/reading\/$/);
  await expect(page.locator("#storyTitle")).toHaveText(stories.find(story => story.id === "story-1").title);
  await page.goto("/quiz/choice/?via=bookmark");
  await expect(page).toHaveURL(/\/learn\/choice\/\?via=bookmark$/);
  await page.goto("/quiz/#choice-card");
  await expect(page).toHaveURL(/\/learn\/choice\/$/);
  await expect(page.locator("#gameStart")).toBeVisible();
  await page.locator(".quiz-exit").click();
  await expect(page.locator("#choose-choice")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/learn\/choice\/$/);
  await expect(page.locator("#gameStart")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/learn\/$/);
  await expect(page.locator("#choose-choice")).toBeVisible();
});

test.describe("mobile quiz selector", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("touch opens the reader directly and the textbook tab opens its own page", async ({ page }) => {
    await page.goto("/learn/");
    const nav = page.getByRole("navigation", { name: "콘텐츠 전환" });
    await expect(nav.getByRole("link")).toHaveText(["한자 도감", "한자 학습", "한자 교재"]);
    await expect(nav.locator('[aria-current="page"]')).toHaveText("한자 학습");
    const shelf = page.locator(".quiz-shelf");
    await expect(shelf.getByRole("link")).toHaveCount(4);
    await expect(shelf.getByRole("link", { name: "한자 별길", exact: true })).toHaveAttribute("href", "/learn/game/");
    await expect(page.locator("#gameStart")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.locator("#choose-reading").tap();
    await expect(page.locator("#storyTitle")).toHaveText(stories.find(story => story.id === "story-1").title);
    await nav.getByRole("link", { name: "한자 교재" }).tap();
    await expect(page).toHaveURL(/\/book\/$/);
    await expect(page.getByRole("main")).toHaveText("준비중");
    for (const meta of ['meta[name="description"]', 'meta[property="og:description"]']) {
      await expect(page.locator(meta)).toHaveAttribute("content", "준비중");
    }
    await expect(nav.locator('[aria-current="page"]')).toHaveText("한자 교재");
    await nav.getByRole("link", { name: "한자 도감" }).tap();
    await expect(nav.locator('[aria-current="page"]')).toHaveText("한자 도감");
  });
});

for (const width of [390, 820, 1440]) test(`switching study tabs keeps the catalog layout at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() => localStorage.setItem("manabo-theme-v1", "dark"));
  let reference;
  for (const path of ["/kanji/", "/learn/", "/book/"]) {
    await page.goto(path);
    const panelSelector = path === "/learn/" ? "#gameView" : ".info-page";
    const layout = await page.evaluate(selector => {
      const panel = document.querySelector(selector);
      const elements = [
        document.querySelector(".brand-icon"), document.querySelector(".site-info-menu summary"),
        ...document.querySelectorAll(".site-tab"), panel,
      ];
      const boxes = elements.map(element => {
        const { left, top, width } = element.getBoundingClientRect();
        return [Math.round(left), Math.round(top), Math.round(width)];
      });
      const { fontSize, lineHeight } = getComputedStyle(panel.querySelector("h1"));
      return { boxes, fontSize, lineHeight };
    }, panelSelector);
    reference ??= layout;
    expect(layout).toEqual(reference);
  }
});

for (const width of [390, 1280]) {
  test(`reading and choice place the learning link above the panel at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const positions = [];
    for (const [path, panel] of [["/reading/", ".story-layout"], ["/learn/choice/", "#gameView"]]) {
      await page.goto(path);
      const link = page.getByRole("link", { name: "한자 학습으로", exact: true }).first();
      await expect(link).toHaveAttribute("href", "/learn/");
      await expect(link).toBeInViewport();
      const box = await link.boundingBox();
      const content = await page.locator(panel).boundingBox();
      expect(content.y).toBeGreaterThanOrEqual(box.y + box.height);
      positions.push([box.x, box.y]);
    }
    expect(positions[1]).toEqual(positions[0]);
  });
}
