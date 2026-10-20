import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const kanji = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url), "utf8"));
const stories = JSON.parse(await readFile(new URL("../../public/data/stories.json", import.meta.url), "utf8"));
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ZkAAAAASUVORK5CYII=", "base64");

async function mockData(page, options = {}) {
  const state = { kanjiStatus: 200, storiesStatus: 200, kanji, stories, kanjiCalls: 0, storiesCalls: 0, ...options };
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).hostname === "127.0.0.1") return route.continue();
    return route.fulfill({ status: 200, contentType: route.request().resourceType() === "image" ? "image/png" : "text/plain", body: route.request().resourceType() === "image" ? pixel : "" });
  });
  await page.route("**/data/*.json", (route) => {
    const resource = new URL(route.request().url()).pathname.includes("kanji") ? "kanji" : "stories";
    state[`${resource}Calls`]++;
    return route.fulfill({ status: state[`${resource}Status`], json: state[resource] });
  });
  return state;
}
const ready = (page) => expect(page.locator("#learningStatus")).toBeHidden();
async function openDetail(page, ch = "文") {
  await page.goto(`/kanji/#kanji=${encodeURIComponent(ch)}`);
  await expect(page.locator("#detailOverlay")).toBeVisible();
}
const activeIn = (page, selector) => page.evaluate((selector) => document.querySelector(selector).contains(document.activeElement), selector);

for (const path of ["/kanji/", "/quiz/"]) {
  test(`${path} works while stories is unavailable and never requests it`, async ({ page }) => {
    const state = await mockData(page, { storiesStatus: 503 });
    await page.goto(path);
    await ready(page);
    expect(state.storiesCalls).toBe(0);
    if (path === "/kanji/") await expect(page.locator("#grid .card")).toHaveCount(96);
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

for (const [path, failed] of [["/reading/", "stories"], ["/reading/", "kanji"], ["/quiz/", "kanji"], ["/kanji/", "kanji"]]) {
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
    const grades = new Set(kanji.map((row) => row["학년"]).filter((value) => value && value !== "참고"));
    await expect(page.locator("#grade option")).toHaveCount(grades.size + 1);
    await expect(page.locator("#gameGrade option")).toHaveCount(grades.size + 1);
    if (path === "/reading/") {
      await expect(page.locator("#grid .card")).toHaveCount(0);
      await expect(page.locator("#storyCopy .kanji-link").first()).toBeVisible();
      await expect(page.locator(".story-level")).toHaveCount(stories.length);
    }
  });
}

test("same-document navigation loads dependencies, retains successful data, and recovers reading", async ({ page }) => {
  const state = await mockData(page, { storiesStatus: 503 });
  await page.goto("/quiz/");
  await ready(page);
  await page.locator("#navStory").click();
  await expect(page.locator("#learningRetry")).toBeVisible();
  await page.locator("#navKanji").click();
  await ready(page);
  await expect(page.locator("#grid .card")).toHaveCount(96);
  expect(state.kanjiCalls).toBe(1);
  state.storiesStatus = 200;
  await page.locator("#navStory").click();
  await ready(page);
  expect(state.storiesCalls).toBe(2);
  await page.locator("#storyCopy .kanji-link").first().click();
  await page.locator("#popoverGo").click();
  await expect(page.locator("#detailOverlay")).toBeVisible();
  await page.locator("#detailOverlay .detail-image-meta button").first().click();
  await expect(page).toHaveURL(/\/kanji\/\?grade=/);
  await ready(page);
  await expect(page.locator("#detailOverlay")).toBeHidden();
  await expect(page.locator("#grid .card").first()).toBeVisible();
});

test("N5 reset survives reload and preserves unrelated URL state", async ({ page }) => {
  await mockData(page);
  await page.goto("/kanji/?jlpt=JLPT+N5&utm_source=test#other");
  await ready(page);
  await expect(page.locator("#jlpt")).toHaveValue("JLPT N5");
  await page.locator("#reset").click();
  expect(new URL(page.url()).searchParams.has("jlpt")).toBe(false);
  expect(new URL(page.url()).searchParams.get("utm_source")).toBe("test");
  expect(new URL(page.url()).hash).toBe("#other");
  await page.reload();
  await ready(page);
  await expect(page.locator("#jlpt")).toHaveValue("");
  await expect(page.locator("#sort")).toHaveValue("ministry");
  await expect(page.locator("#resultCount")).toHaveText(kanji.filter((row) => row["문부성"] !== "").length.toLocaleString("ko-KR"));
});

test("direct filters, detail JLPT links and back/forward keep URL and UI synchronized", async ({ page }) => {
  await mockData(page);
  await page.goto("/kanji/?unrelated=keep");
  await ready(page);
  await page.locator("#jlpt").selectOption("JLPT N5");
  await page.goBack();
  await ready(page);
  await expect(page.locator("#jlpt")).toHaveValue("");
  await page.goForward();
  await ready(page);
  await expect(page.locator("#jlpt")).toHaveValue("JLPT N5");
  await page.locator("#grade").selectOption("초등학교 1학년");
  await page.goBack();
  await ready(page);
  await expect(page.locator("#grade")).toHaveValue("");
  await expect(page.locator("#jlpt")).toHaveValue("JLPT N5");
  await page.goForward();
  await ready(page);
  await expect(page.locator("#grade")).toHaveValue("초등학교 1학년");
  await page.locator("#grid button.front").first().press("Enter");
  await page.locator("#grid .card-detail-button").first().press("Enter");
  await page.locator("#detailOverlay .detail-image-meta button").filter({ hasText: "JLPT" }).click();
  await ready(page);
  await expect(page.locator("#grade")).toHaveValue("");
  expect(new URL(page.url()).searchParams.get("unrelated")).toBe("keep");
  expect(new URL(page.url()).searchParams.get("jlpt")).toBe(await page.locator("#jlpt").inputValue());
});

for (const sort of ["strokes", "sound"]) {
  test(`active empty ${sort} index remains visible and can be cleared`, async ({ page }) => {
    await mockData(page);
    await page.goto("/kanji/");
    await ready(page);
    await page.locator("#sort").selectOption(sort);
    const label = sort === "strokes" ? "1획" : "나";
    const selected = page.locator("#sortIndex").getByRole("button", { name: label, exact: true });
    await selected.click();
    await page.locator("#search").fill("犬");
    await expect(page.locator("#resultCount")).toHaveText("0");
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await selected.click();
    await expect(page.locator("#resultCount")).toHaveText("1");
    await expect(page.locator("#grid .glyph")).toHaveText("犬");
  });
}

for (const hash of ["%", "未登録", encodeURIComponent("文")]) {
  test(`direct hash ${hash} does not corrupt data initialization`, async ({ page }) => {
    await mockData(page);
    await page.goto(`/kanji/#kanji=${hash}`);
    await ready(page);
    await expect(page.locator("#grid .card")).toHaveCount(96);
    if (hash === encodeURIComponent("文")) {
      await expect(page.locator("#detailOverlay")).toBeVisible();
      await page.keyboard.press("Escape");
      await page.locator("#reset").click();
      expect(new URL(page.url()).hash).toBe("");
      await page.reload();
      await ready(page);
      await expect(page.locator("#detailOverlay")).toBeHidden();
    } else await expect(page.locator("#detailOverlay")).toBeHidden();
  });
}

test("same-document hash changes and repeated reset do not duplicate filters or cards", async ({ page }) => {
  const state = await mockData(page);
  await page.goto("/reading/");
  await ready(page);
  await expect(page.locator("#grid .card")).toHaveCount(0);
  await page.evaluate(() => { location.hash = "kanji=%"; });
  await ready(page);
  await expect(page.locator("#learningRetry")).toBeHidden();
  await page.evaluate(() => { location.hash = "kanji=" + encodeURIComponent("文"); });
  await expect(page.locator("#detailOverlay")).toBeVisible();
  await page.keyboard.press("Escape");
  const count = await page.locator("#grade option").count();
  for (let i = 0; i < 3; i++) await page.locator("#reset").click();
  await expect(page.locator("#grade option")).toHaveCount(count);
  await expect(page.locator("#grid .card")).toHaveCount(96);
  expect(state.kanjiCalls).toBe(1);
});

test("detail modal traps Tab/Shift+Tab, popover closes first, and opener focus restores", async ({ page }) => {
  await mockData(page);
  await page.goto("/kanji/");
  await ready(page);
  const card = page.locator('#grid .card[data-kanji="文"]');
  await card.locator(".front").press("Space");
  const opener = card.locator(".card-detail-button");
  await opener.press("Enter");
  await expect(page.locator("#detailClose")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await activeIn(page, "#detailOverlay")).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.locator("#detailClose")).toBeFocused();
  await page.locator("#detailOverlay .kanji-link").first().click();
  await expect(page.locator("#kanjiPopover")).toBeVisible();
  expect(await page.locator("#kanjiPopover").evaluate((node) => node.inert)).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.locator("#kanjiPopover")).toBeHidden();
  await expect(page.locator("#detailOverlay")).toBeVisible();
  await page.locator("#detailClose").click();
  await expect(opener).toBeFocused();
  expect(await page.locator("body").evaluate((node) => node.classList.contains("detail-open"))).toBe(false);
  await opener.click();
  await page.locator("#detailOverlay .kanji-link").first().click();
  await page.locator("#detailOverlay").click({ position: { x: 4, y: 4 } });
  await expect(page.locator("#detailOverlay")).toBeHidden();
  await expect(page.locator("#kanjiPopover")).toBeHidden();
});

test("image modal traps keys and restores underlying detail modal and scroll lock", async ({ page }) => {
  await mockData(page);
  await openDetail(page);
  const zoom = page.getByRole("button", { name: "文 암기 이미지 크게 보기", exact: true });
  await zoom.click();
  await expect(page.locator("#imageClose")).toBeFocused();
  for (const key of ["Shift+Tab", "Tab"]) {
    await page.keyboard.press(key);
    await expect(page.locator("#imageClose")).toBeFocused();
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("#imageOverlay")).toBeHidden();
  await expect(page.locator("#detailOverlay")).toBeVisible();
  await expect(zoom).toBeFocused();
  expect(await page.locator("body").evaluate((node) => node.classList.contains("detail-open"))).toBe(true);
  await page.locator("#detailClose").click();
  expect(await page.locator("body").evaluate((node) => node.classList.contains("detail-open"))).toBe(false);
});

test("missing opener falls back safely; parent/backdrop/history close removes child popover", async ({ page }) => {
  await mockData(page);
  await page.goto("/quiz/");
  await ready(page);
  await page.locator("#navKanji").click();
  await ready(page);
  await page.locator("#grid button.front").first().click();
  await page.locator("#grid .card-detail-button").first().click();
  await page.evaluate(() => document.querySelector("#grid .card").remove());
  await page.keyboard.press("Escape");
  await expect(page.locator("#navKanji")).toBeFocused();
  await page.locator("#grid button.front").first().click();
  await page.locator("#grid .card-detail-button").first().click();
  await page.locator("#detailOverlay .kanji-link").first().click();
  await page.locator("#popoverGo").click();
  await expect(page.locator("#detailBack")).toBeVisible();
  await page.locator("#detailBack").click();
  await expect(page.locator("#kanjiPopover")).toBeHidden();
  await page.locator("#detailOverlay .kanji-link").first().click();
  await page.goBack();
  await ready(page);
  await expect(page.locator("#detailOverlay")).toBeHidden();
  await expect(page.locator("#kanjiPopover")).toBeHidden();
  await expect(page.locator("#gameView")).toBeVisible();
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

test("modal with no focusable controls still contains keyboard focus", async ({ page }) => {
  await mockData(page);
  await openDetail(page);
  await page.evaluate(() => {
    const lateControl = document.createElement("button");
    lateControl.id = "lateBackgroundControl";
    lateControl.textContent = "background";
    document.body.append(lateControl);
    const dialog = document.querySelector('#detailOverlay [role="dialog"]');
    for (const button of dialog.querySelectorAll("button")) button.disabled = true;
    dialog.focus();
  });
  await expect(page.locator("#lateBackgroundControl")).toHaveAttribute("inert", "");
  for (const key of ["Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    expect(await activeIn(page, "#detailOverlay")).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("#detailOverlay")).toBeHidden();
});

test("unsupported filter values are ignored without breaking the list", async ({ page }) => {
  await mockData(page);
  await page.goto("/kanji/?grade=invalid&jlpt=invalid");
  await ready(page);
  await expect(page.locator("#grade")).toHaveValue("");
  await expect(page.locator("#jlpt")).toHaveValue("");
  await expect(page.locator("#grid .card")).toHaveCount(96);
});
