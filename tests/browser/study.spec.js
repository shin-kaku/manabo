import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const kanji = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url), "utf8"));
const ministryCount = kanji.filter(row => Number(row.문부성) > 0).length.toLocaleString("ko-KR") + "자";
const stories = JSON.parse(await readFile(new URL("../../public/data/stories.json", import.meta.url), "utf8"));
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ZkAAAAASUVORK5CYII=", "base64");

async function mockData(page, options = {}) {
  const state = { kanjiStatus: 200, storiesStatus: 200, kanji, stories, kanjiCalls: 0, storiesCalls: 0, ...options };
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).hostname === "127.0.0.1") return route.continue();
    return route.fulfill({ status: 200, contentType: route.request().resourceType() === "image" ? "image/png" : "text/plain", body: route.request().resourceType() === "image" ? pixel : "" });
  });
  await page.route(/\/data\/(?:kanji|stories)\.json$/, (route) => {
    const resource = new URL(route.request().url()).pathname.includes("kanji") ? "kanji" : "stories";
    state[`${resource}Calls`]++;
    return route.fulfill({ status: state[`${resource}Status`], json: state[resource] });
  });
  return state;
}
const ready = (page) => expect(page.locator("#learningStatus")).toBeHidden();
for (const path of ["/kanji/", "/quiz/"]) {
  test(`${path} works while stories is unavailable and never requests it`, async ({ page }) => {
    const state = await mockData(page, { storiesStatus: 503 });
    await page.goto(path);
    await ready(page);
    expect(state.storiesCalls).toBe(0);
    if (path === "/kanji/") await expect(page.locator("[data-directory-grid] a")).toHaveCount(96);
    else {
      await expect(page.locator("#grid .card")).toHaveCount(0);
      await page.locator("#gameStart").click();
      await expect(page.locator(".game-choice")).toHaveCount(4);
      await page.locator("#gamePicture").click();
      await expect(page.locator("#imageClose")).toBeFocused();
      await page.locator("#imageClose").click();
      await expect(page.locator("#gamePicture")).toBeFocused();
      await page.locator(".game-choice").first().click();
      await expect(page.locator("#gameNext")).toBeVisible();
    }
  });
}

for (const [path, failed] of [["/reading/", "stories"], ["/reading/", "kanji"], ["/quiz/", "kanji"]]) {
  test(`${path} visible ${failed} error retries real requests without duplicates`, async ({ page }) => {
    const state = await mockData(page, { [`${failed}Status`]: 503 });
    await page.goto(path);
    await expect(page.locator("#learningStatus")).toHaveAttribute("role", "alert");
    await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toBeVisible();
    await page.locator("#learningRetry").click();
    await expect.poll(() => state[`${failed}Calls`]).toBe(2);
    state[`${failed}Status`] = 200;
    await page.locator("#learningRetry").click();
    await ready(page);
    expect(state[`${failed}Calls`]).toBe(3);
    const grades = new Set(kanji.map((row) => row["학년"]).filter(Boolean));
    await expect(page.locator("#gameGrade option")).toHaveCount([...grades].filter(value => value !== "참고").length + 1);
    if (path === "/reading/") {
      await expect(page.locator("#grid .card")).toHaveCount(0);
      await expect(page.locator("#storyCopy .kanji-link").first()).toBeVisible();
      await expect(page.locator(".story-level")).toHaveCount(stories.length);
    }
  });
}

test("quiz and reading share loaded data and can open standalone kanji details", async ({ page }) => {
  const state = await mockData(page, { storiesStatus: 503 });
  await page.goto("/quiz/");
  await ready(page);
  await page.locator("#navStory").click();
  await expect(page.locator("#learningRetry")).toBeVisible();
  await page.locator("#navGame").click();
  await ready(page);
  state.storiesStatus = 200;
  await page.locator("#navStory").click();
  await expect(page.locator("#storyCopy .kanji-link").first()).toBeVisible();
  expect(state.storiesCalls).toBe(2);
  expect(state.kanjiCalls).toBe(1);
  const anchor = page.locator("#storyCopy .kanji-link").first();
  const character = await anchor.textContent();
  await anchor.click();
  await page.locator("#popoverGo").click();
  await expect(page.locator("[data-entry-kanji]")).toHaveAttribute("data-entry-kanji", character.trim());
  await page.locator(".entry-meta a").first().click();
  await expect(page.locator("[data-directory-grid] a").first()).toBeVisible();
});

test("N5 reset survives reload and preserves unrelated URL state", async ({ page }) => {
  await mockData(page);
  await page.goto("/kanji/?jlpt=JLPT+N5&utm_source=test#other");
  await expect(page.locator("#directory-jlpt")).toHaveValue("JLPT N5");
  await page.locator("[data-directory-reset]").click();
  expect(new URL(page.url()).searchParams.has("jlpt")).toBe(false);
  expect(new URL(page.url()).searchParams.get("utm_source")).toBe("test");
  expect(new URL(page.url()).hash).toBe("#other");
  await page.reload();
  await expect(page.locator("#directory-jlpt")).toHaveValue("");
  await expect(page.locator("#directory-sort")).toHaveValue("ministry");
  await expect(page.locator("[data-directory-count]")).toHaveText(ministryCount);
});

for (const [filter, field, value] of [
  ["grade", "학년", "중학 1"], ["jlpt", "등급", "JLPT N3"], ["grade", "학년", "참고"],
]) {
  test(`legacy scoped detail preserves its ${value} catalog`, async ({ page }) => {
    await mockData(page);
    const matching = kanji.filter(row => row[field] === value && (value === "참고" || Number(row.문부성) > 0));
    const character = matching.at(-1)["한자"];
    await page.goto(`/kanji/?${filter}=${encodeURIComponent(value)}#kanji=${encodeURIComponent(character)}`);
    await expect(page.locator("[data-entry-kanji]")).toHaveAttribute("data-entry-kanji", character);
    const url = new URL(page.url());
    expect(decodeURIComponent(url.pathname)).toBe(`/kanji/${character}/`);
    expect(url.searchParams.get(filter)).toBe(value);
    await expect(page.locator("[data-previous-kanji]")).toBeHidden();
    const catalog = page.locator("[data-entry-catalog]");
    if (!(await catalog.isVisible())) await page.locator(".site-info-menu summary").click();
    await catalog.click();
    await page.reload();
    await expect(page.locator(`#directory-${filter}`)).toHaveValue(value);
    await expect(page.locator("[data-directory-count]")).toHaveText(matching.length.toLocaleString("ko-KR") + "자");
  });
}

test("selecting filters supports browser Back and Forward", async ({ page }) => {
  await mockData(page);
  await page.goto("/kanji/?unrelated=keep");
  const grade = page.locator("#directory-grade");
  const jlpt = page.locator("#directory-jlpt");
  await jlpt.selectOption("JLPT N5");
  await page.goBack();
  await expect(jlpt).toHaveValue("");
  await page.goForward();
  await expect(jlpt).toHaveValue("JLPT N5");
  await grade.selectOption("초등학교 1학년");
  await page.goBack();
  await expect(grade).toHaveValue("");
  await expect(jlpt).toHaveValue("JLPT N5");
  await page.goForward();
  await expect(grade).toHaveValue("초등학교 1학년");
  expect(new URL(page.url()).searchParams.get("unrelated")).toBe("keep");
  await page.locator("[data-directory-grid] a").first().press("Enter");
  await page.locator(".entry-meta a").filter({ hasText: "JLPT" }).click();
  await expect(grade).toHaveValue("");
  await expect(jlpt).toHaveValue("JLPT N5");
});

test("an active stroke filter can be cleared after an empty search", async ({ page }) => {
  await mockData(page);
  await page.goto("/kanji/");
  await page.locator("#directory-sort").selectOption("strokes");
  const strokes = page.locator("#directory-strokes");
  await strokes.selectOption("1");
  await page.locator("#directory-q").fill("犬");
  await expect(page.locator("[data-directory-count]")).toHaveText("0자");
  await expect(strokes).toHaveValue("1");
  await strokes.selectOption("");
  await expect(page.locator("[data-directory-grid] a span")).toHaveText("犬");
});

for (const hash of ["%", "未登録"]) {
  test(`unknown legacy hash ${hash} leaves the default list usable`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await mockData(page);
    await page.goto(`/kanji/#kanji=${hash}`);
    await expect(page.locator("[data-directory-count]")).toHaveText(ministryCount);
    await page.locator("#directory-q").fill("犬");
    await expect(page.locator("[data-directory-grid] a")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test("a keyboard-opened lookup can be dismissed and followed to the previous kanji", async ({ page }) => {
  await mockData(page);
  await page.goto("/kanji/?q=木");
  await page.locator("[data-directory-grid] a").first().press("Enter");
  const detail = page.locator("[data-entry-kanji]");
  await expect(detail).toHaveAttribute("data-entry-kanji", "木");
  await expect(page.locator("[data-previous-kanji]")).toBeHidden();
  const anchor = page.locator('.entry-page [data-study-kanji="林"]').first();
  await anchor.press("Enter");
  const popover = page.locator("dialog.study-lookup");
  await expect(popover).toBeVisible();
  await expect(popover.locator(".popover-go")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(anchor).toBeFocused();
  await anchor.press("Enter");
  await popover.locator(".popover-go").press("Enter");
  await expect(detail).toHaveAttribute("data-entry-kanji", "林");
  expect(new URL(page.url()).searchParams.get("q")).toBe("木");
  await page.reload();
  await page.getByRole("link", { name: "이전 한자 木" }).press("Enter");
  await expect(detail).toHaveAttribute("data-entry-kanji", "木");
  await expect(page.locator("[data-previous-kanji]")).toBeHidden();
  await expect(popover).toBeHidden();
});

test("image zoom opens from the detail and returns keyboard focus to its opener", async ({ page }) => {
  await mockData(page);
  await page.goto("/kanji/文/");
  const trigger = page.locator("[data-entry-zoom]");
  await trigger.press("Enter");
  const viewer = page.getByRole("dialog", { name: "文 암기 이미지 크게 보기" });
  await expect(viewer.getByRole("button", { name: "닫기" })).toBeFocused();
  await expect(viewer.locator("img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("quiz completion, insufficient pool, and valid restart never retain stale results", async ({ page }) => {
  const smallPool = kanji.slice(0, 5).map((row, index) => ({ ...row,
    학년: index < 4 ? "초등학교 1학년" : "초등학교 2학년", 등급: "JLPT N5" }));
  await mockData(page, { kanji: smallPool });
  await page.goto("/quiz/");
  await ready(page);
  await page.locator("#gameGrade").selectOption("초등학교 1학년");
  await page.locator("#gameStart").click();
  await expect(page.locator("#gameProgress")).toHaveText("1 / 4");
  for (let i = 0; i < 4; i++) { await page.locator(".game-choice").first().click(); await page.locator("#gameNext").click(); }
  await expect(page.locator("#gameQuestionLabel")).toHaveText("게임 완료");
  await page.locator("#gameSettingsButton").click();
  await page.locator("#gameGrade").selectOption("초등학교 2학년");
  await page.locator("#gameStart").click();
  await expect(page.locator("#gameSetupError")).toBeVisible();
  await expect(page.locator("#gameSetup")).toBeVisible();
  await expect(page.locator("#gamePlay")).toBeHidden();
  await expect(page.getByText("같은 조건으로 다시", { exact: true })).toBeHidden();
  await page.locator("#gameGrade").selectOption("초등학교 1학년");
  await page.locator("#gameStart").click();
  await expect(page.locator("#gameSetupError")).toBeHidden();
  await expect(page.locator(".game-choice")).toHaveCount(4);
  await expect(page.locator("#gameProgress")).toHaveText("1 / 4");
});

test("unsupported filter values leave the default catalog usable", async ({ page }) => {
  await mockData(page);
  await page.goto("/kanji/?grade=invalid&jlpt=invalid");
  await expect(page.locator("#directory-grade")).toHaveValue("");
  await expect(page.locator("#directory-jlpt")).toHaveValue("");
  await expect(page.locator("[data-directory-count]")).toHaveText(ministryCount);
  await page.locator("#directory-q").fill("犬");
  await expect(page.locator("[data-directory-grid] a")).toHaveCount(1);
});
