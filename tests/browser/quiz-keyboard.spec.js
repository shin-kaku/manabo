import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url), "utf8"));
const pool = rows.slice(0, 5).map((row, index) => ({ ...row,
  "학년": index < 4 ? "초등학교 1학년" : "초등학교 2학년", "등급": "JLPT N5" }));

test("keyboard focus follows quiz questions, results and settings", async ({ page, browserName }) => {
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.fulfill({ body: "" }));
  await page.route("**/data/kanji.json", route => route.fulfill({ json: pool }));
  await page.goto("/quiz/choice/");
  await expect(page.locator("#learningStatus")).toBeHidden();
  await page.locator('#gameGrade input[value="초등학교 1학년"]').check();
  await page.locator("#gameStart").focus();
  await page.keyboard.press("Enter");
  for (let index = 0; index < 4; index++) {
    await expect(page.locator("#gameProgress")).toHaveText(`${index + 1} / 4`);
    await expect(page.locator(".game-choice").first()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#gameNext")).toBeFocused();
    await page.keyboard.press("Enter");
  }
  await expect(page.locator("#gameQuestionLabel")).toHaveText("사지선다 완료");
  await expect(page.locator("#gameNext")).toBeFocused();
  // On macOS, Option+Tab adds buttons to WebKit's sequential keyboard navigation.
  const back = browserName === "webkit" && process.platform === "darwin" ? "Alt+Shift+Tab" : "Shift+Tab";
  await page.keyboard.press(back);
  await expect(page.locator("#gameSettingsButton")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#gameStart")).toBeFocused();
  await page.locator('#gameGrade input[value="초등학교 2학년"]').check();
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
