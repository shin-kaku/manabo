import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url)));
const links = "[data-directory-grid] a";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
});

test("search and filters share one lightweight index without loading character media", async ({ page }) => {
  const paths = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/data/") || path.startsWith("/media/")) paths.push(path);
  });
  await page.goto("/kanji/");
  await expect(page.locator("[data-directory-more]")).toBeVisible();
  for (const [mode, first] of [["memory", "丶"], ["strokes", "丨"], ["sound", "苛"], ["ministry", "文"]]) {
    await page.locator("#directory-sort").selectOption(mode);
    await expect(page.locator(links + " > span").first()).toHaveText(first);
  }

  const target = rows.find(row => row.한자 === "機");
  await page.locator("#directory-jlpt").selectOption(target.등급);
  await page.locator("#directory-grade").selectOption(target.학년);
  await page.locator("#directory-strokes").selectOption(String(target.획));
  await page.locator("#directory-q").fill(target.한자);
  await expect(page.locator("[data-directory-count]")).toHaveText("1자");
  await expect(page.locator(links)).toHaveAccessibleName("機 " + target["훈, 음"]);
  await page.locator("[data-directory-reset]").click();
  for (const query of ["나무", "8획", "검색결과없음"]) {
    await page.locator("#directory-q").fill(query);
    const matches = rows.filter(row => query === "8획" ? Number(row.획) === 8 : [row.한자, row["훈, 음"], row.훈, row.음].join(" ").includes(query));
    await expect(page.locator("[data-directory-count]")).toHaveText(matches.length.toLocaleString("ko-KR") + "자");
    await expect(page.locator(links)).toHaveCount(Math.min(matches.length, 96));
  }
  await expect(page.locator("[data-directory-message]")).toContainText("조건에 맞는 한자가 없습니다.");
  expect(paths).toEqual(["/data/kanji-index.json"]);
});

test.describe("server-rendered study content", () => {
  test.use({ javaScriptEnabled: false });
  test("the initial list and each character's mnemonic, reading and examples work without JavaScript", async ({ page }) => {
    await page.goto("/kanji/");
    await expect(page.locator(links)).toHaveCount(96);
    const link = page.locator(links).first();
    const ch = await link.locator("[lang=ja]").textContent();
    const row = rows.find(item => item.한자 === ch);
    await expect(link.locator("small")).toHaveText(row["훈, 음"]);
    await link.click();
    const entry = page.locator("[data-entry-kanji]");
    await expect(entry).toHaveAttribute("data-entry-kanji", ch);
    await expect(entry.locator("h1")).toContainText(row["훈, 음"]);
    await expect(entry).toContainText(row.풀이.trim());
    for (const title of ["일본어 읽기", "예시 단어"]) await expect(entry.getByRole("heading", { name: title })).toBeVisible();
    await expect(entry.locator("ruby rt").first()).toBeVisible();
    await expect(entry.locator(".entry-stroke")).toHaveAttribute("alt", new RegExp(ch + " " + row.획 + "획"));
  });
});
