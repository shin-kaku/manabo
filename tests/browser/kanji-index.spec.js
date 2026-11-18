import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url)));
const ministryRows = rows.filter(row => Number(row.문부성) > 0);
const referenceRows = rows.filter(row => row.학년 === "참고");
const totalLabel = items => items.length.toLocaleString("ko-KR") + "자";
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
    await expect(page.locator("[data-directory-count]")).toHaveText(totalLabel(mode === "ministry" ? ministryRows : rows));
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
    const matches = ministryRows.filter(row => query === "8획" ? Number(row.획) === 8 : [row.한자, row["훈, 음"], row.훈, row.음].join(" ").includes(query));
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
    await expect(page.locator("[data-directory-count]")).toHaveText(totalLabel(ministryRows));
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

test("input on the first paint survives a delayed directory module", async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route("**/src/material-directory.js*", async route => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/kanji/?jlpt=JLPT+N4", { waitUntil: "commit" });
    await page.locator("#directory-q").fill("수풀");
    await page.locator("#directory-strokes").selectOption("8");
  } finally { release(); }
  await expect(page.locator("[data-directory-count]")).toHaveText("1자");
  await expect(page.locator("[data-directory-grid] a")).toHaveText(/林/);
  expect(new URL(page.url()).searchParams.get("q")).toBe("수풀");
  await expect(page.locator("#directory-jlpt")).toHaveValue("JLPT N4");
});

test("reference grade selects an available sort across history, reset and bookmarked searches", async ({ page }) => {
  const sort = page.locator("#directory-sort");
  const grade = page.locator("#directory-grade");
  const ministry = sort.locator('option[value="ministry"]');
  const count = page.locator("[data-directory-count]");
  await page.goto("/kanji/");
  await expect(page.locator("[data-directory-more]")).toBeVisible();
  await grade.selectOption("참고");
  await expect(sort).toHaveValue("memory");
  await expect(ministry).toHaveJSProperty("disabled", true);
  await expect(count).toHaveText(totalLabel(referenceRows));
  await page.goBack();
  await expect(grade).toHaveValue("");
  await expect(sort).toHaveValue("ministry");
  await expect(ministry).toHaveJSProperty("disabled", false);
  await expect(count).toHaveText(totalLabel(ministryRows));
  await page.goForward();
  await expect(count).toHaveText(totalLabel(referenceRows));
  await page.locator("[data-directory-reset]").click();
  await expect(grade).toHaveValue("");
  await expect(sort).toHaveValue("ministry");
  await expect(ministry).toHaveJSProperty("disabled", false);
  await expect(count).toHaveText(totalLabel(ministryRows));

  const ref = referenceRows.find(row => !row.문부성);
  await page.goto("/kanji/?" + new URLSearchParams({ q: ref.한자, grade: "참고", sort: "ministry" }));
  await expect(sort).toHaveValue("memory");
  await expect(ministry).toHaveJSProperty("disabled", true);
  await expect(count).toHaveText("1자");
  await expect(page.locator(links)).toHaveAccessibleName(ref.한자 + " " + ref["훈, 음"]);
  await page.reload();
  await expect(count).toHaveText("1자");
  await page.goto("/kanji/?" + new URLSearchParams({ q: ref.한자 }));
  await expect(count).toHaveText("0자");
  await expect(page.locator(links)).toHaveCount(0);
  await sort.selectOption("memory");
  await expect(count).toHaveText("1자");
  await expect(page.locator(links)).toHaveAccessibleName(ref.한자 + " " + ref["훈, 음"]);
});
