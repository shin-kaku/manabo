import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url), "utf8"));
const pool = rows.slice(0, 5).map((row, index) => ({ ...row,
  "학년": index < 4 ? "초등학교 1학년" : "초등학교 2학년", "등급": "JLPT N5" }));

test("keyboard focus follows quiz questions, results and settings", async ({ page, browserName }) => {
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.fulfill({ body: "" }));
  await page.route("**/data/kanji.json", route => route.fulfill({ json: pool }));
  await page.goto("/learn/choice/");
  await expect(page.locator("#learningStatus")).toBeHidden();
  await page.locator('#gameGrade label:has(input[value="초등학교 1학년"])').click();
  await page.locator("#gameStart").focus();
  await page.keyboard.press("Enter");
  let missedGlyph;
  for (let index = 0; index < 4; index++) {
    await expect(page.locator("#gameProgress")).toHaveText(`${index + 1} / 4`);
    await expect(page.locator("#gameQuestion")).toBeFocused();
    await expect(page.locator("#gameNext")).toBeDisabled();
    const glyph = await page.locator("#gameGlyph").innerText();
    const meaning = pool.find(row => row["한자"] === glyph)["훈, 음"].trim();
    const answers = await page.locator(".game-choice .answer-text").allTextContents();
    const correct = answers.indexOf(meaning);
    expect(correct).toBeGreaterThanOrEqual(0);
    const pick = index ? correct : (correct + 1) % 4;
    if (!index) missedGlyph = glyph;
    await page.keyboard.press(String(pick + 1));
    await expect(page.locator(".game-choice input").nth(pick)).toBeChecked();
    await expect(page.locator("#gameFeedback")).toBeHidden();
    await page.keyboard.press("Enter");
    await expect(page.locator("#gameNext")).toBeFocused();
    await expect(page.locator("#gameFeedback")).toBeVisible();
    await expect(page.locator("#gameFeedbackText")).toHaveText(
      (index ? "정답 · " : "오답 · 정답은 ") + (correct + 1) + "번 " + meaning,
    );
    await page.keyboard.press("Enter");
  }
  await expect(page.locator("#gameResultTitle")).toBeFocused();
  await expect(page.locator("#gameResultScore")).toHaveText("3 / 4");
  await expect(page.locator("#gameResultPercent")).toHaveText("75%");
  await expect(page.locator("#gameResultNote")).toContainText("절반 이상 맞혔어요.");
  await expect(page.locator("#gameMistakeCount")).toHaveText("1");
  const missed = page.getByRole("button", { name: missedGlyph + " 간단 정보 보기", exact: true });
  await missed.press("Enter");
  await expect(page.getByRole("dialog", { name: "한자 간단 정보" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(missed).toBeFocused();
  await page.locator("#gameRetryMissed").click();
  await expect(page.locator("#gameProgress")).toHaveText("1 / 1");
  await expect(page.locator("#gameGlyph")).toHaveText(missedGlyph);
  await expect(page.locator(".game-choice")).toHaveCount(4);
  const answer = pool.find(row => row["한자"] === missedGlyph)["훈, 음"].trim();
  await page.locator(".game-choice").filter({ has: page.getByText(answer, { exact: true }) }).click();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(page.locator("#gameNoMistakes")).toBeVisible();
  await expect(page.locator("#gameResultNote")).toContainText("완벽해요!");
  await page.locator("#gameRetry").focus();
  // On macOS, Option+Tab adds buttons to WebKit's sequential keyboard navigation.
  const next = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
  await page.keyboard.press(next);
  await expect(page.locator("#gameSettingsButton")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#gameStart")).toBeFocused();
  await page.locator('#gameGrade label:has(input[value="초등학교 2학년"])').click();
  await page.locator("#gameStart").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#gameSetupError")).toBeVisible();
  await expect(page.locator('#gameGrade input[value="초등학교 2학년"]')).toBeFocused();
  await page.keyboard.press("ArrowUp");
  const validGrade = page.locator('#gameGrade input[value="초등학교 1학년"]');
  await expect(validGrade).toBeChecked();
  await expect(validGrade).toBeFocused();
  await page.locator("#gameStart").press("Enter");
  await expect(page.locator("#gameProgress")).toHaveText("1 / 4");
});
