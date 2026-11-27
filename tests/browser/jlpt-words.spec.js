import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { normalizeKana } from "../../src/jlpt-quiz.js";

const words = JSON.parse(readFileSync(new URL("../../public/data/jlpt-words/N5.json", import.meta.url)));
const path = "/learn/words/";
const setting = (page, name, value) => page.locator(`#vocab-settings label:has(input[name="${name}"][value="${value}"])`);
const optionRows = page => page.locator(".exam-answer").evaluateAll(labels =>
  new Set(labels.map(label => Math.round(label.getBoundingClientRect().top))).size);

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try {
      const key = "manabo-analytics-consent-v1";
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ choice: "denied", at: Date.now() }));
    } catch { /* Storage can be blocked. */ }
  });
  await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
});

test("the words card opens a local quiz, remembers settings, and requests only the selected levels", async ({ page }) => {
  const requests = [];
  page.on("request", req => {
    if (req.url().includes("/data/jlpt-words/")) requests.push(new URL(req.url()).pathname.split("/").pop());
  });
  await page.goto("/learn/");
  await expect(page.locator("#quizOptions .quiz-guide .learning-action")).toHaveText("여러 방식");
  await expect(page.locator("#choose-reading")).toHaveAccessibleDescription("급수 한자를 모두 담은 한 문장. 막힘없이 읽으면 그 급수는 정복");
  const card = page.locator(".quiz-shelf").getByRole("link", { name: "단어", exact: true });
  await expect(card).toHaveAccessibleDescription("JLPT 시험지 그대로, 동그라미 치며 읽기와 표기를 익히는 실전 연습");
  await card.click();
  await expect(page).toHaveURL(/\/learn\/words\/$/);
  await expect(page).toHaveTitle("단어 | 마나보");
  await expect(page.getByRole("heading", { name: "단어", exact: true })).toBeVisible();
  const start = page.locator("#vocab-start");
  const summary = page.locator("#vocab-summary");
  await expect(start).toBeEnabled();
  await expect(summary).toHaveText("254단어 중 20문제");
  for (const [name, value] of [["mode", "reading"], ["level", "N5"], ["count", "20"]]) {
    await expect(setting(page, name, value).locator("input")).toBeChecked();
  }
  await setting(page, "mode", "reading").click();
  await expect(start).toBeDisabled();
  await expect(summary).toHaveText("모드와 급수를 하나 이상 골라 주세요");
  await setting(page, "mode", "reading").click();
  await setting(page, "level", "N5").click();
  await expect(start).toBeDisabled();
  await expect(summary).toHaveText("모드와 급수를 하나 이상 골라 주세요");
  await setting(page, "level", "N4").click();
  await expect(summary).toHaveText("670단어 중 20문제");
  await setting(page, "level", "N3").click();
  await expect(summary).toHaveText("2,205단어 중 20문제");
  await setting(page, "count", "10").click();
  await expect(summary).toHaveText("2,205단어 중 10문제");
  await page.reload();
  await expect(setting(page, "level", "N5").locator("input")).not.toBeChecked();
  await expect(setting(page, "level", "N4").locator("input")).toBeChecked();
  await expect(setting(page, "level", "N3").locator("input")).toBeChecked();
  await expect(setting(page, "count", "10").locator("input")).toBeChecked();
  await expect(summary).toHaveText("2,205단어 중 10문제");
  expect(requests).toEqual([]);
  await page.evaluate(() => {
    let seed = 12345;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  });
  await start.click();
  await expect(page.locator("#exam-counter")).toHaveText("1/10");
  expect(requests.sort()).toEqual(["N3.json", "N4.json"]);
  expect(await optionRows(page)).toBe(1);
  const seen = new Set();
  for (let i = 0; i < 10; i++) {
    const level = await page.locator("#exam-level").innerText();
    await expect(page.locator("#exam-section")).toHaveText((level === "N4" ? "もんだい" : "問題") + (i + 1));
    await expect(page.locator("#exam-instruction")).toContainText(level === "N4" ? "つぎの ことばの 読み方" : "次の言葉の読み方");
    seen.add(level);
    await page.keyboard.press("1");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
  }
  expect(seen).toEqual(new Set(["N4", "N3"]));
});

test("a failed word download can be retried and storage is optional", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } }));
  let attempts = 0;
  await page.route("**/jlpt-words/N5.json", route => ++attempts === 1 ? route.fulfill({ status: 503, body: "" }) : route.continue());
  await page.goto(path);
  await page.locator("#vocab-start").click();
  await expect(page.locator("#vocab-status")).toContainText("다시 눌러");
  await expect(page.locator("#vocab-start")).toBeEnabled();
  await page.locator("#vocab-start").click();
  await expect(page.locator("#exam-counter")).toHaveText("1/20");
  expect(attempts).toBe(2);
});

test("a short pool caps the session and restarts with the same settings", async ({ page }) => {
  await page.route("**" + path, async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace(/data-word-counts="[^"]+"/, `data-word-counts='{"N5":1}'`);
    await route.fulfill({ response, body: html });
  });
  await page.route("**/jlpt-words/N5.json", route => route.fulfill({ json: words.filter(w => w.word === "学校") }));
  await page.goto(path);
  await expect(page.locator("#vocab-summary")).toHaveText("1단어 중 1문제");
  await page.locator("#vocab-start").click();
  await expect(page.locator("#exam-counter")).toHaveText("1/1");
  await page.locator(".exam-answer").filter({ hasText: "がっこう" }).click();
  await page.keyboard.press("Enter");
  await expect(page.locator("#exam-submit")).toHaveText("결과 보기");
  await page.keyboard.press("Enter");
  await expect(page.locator("#result-score")).toHaveText("1 / 1");
  await page.getByRole("button", { name: "새 문제로 다시 풀기" }).click();
  await expect(page.locator("#exam-counter")).toHaveText("1/1");
  await expect(page.locator("#exam-section")).toHaveText("もんだい1");
  await expect(page.locator("#exam-feedback")).toBeHidden();
  await expect(page.locator("#exam-submit")).toBeDisabled();
});

test("the setup displays each example within one sentence and aligns its grade note at desktop and phone widths", async ({ page }) => {
  await page.goto(path);
  await expect(page.locator("#vocab-settings legend small")).toHaveText(["(여러 개 고를 수 있어요)", "(여러 개 고를 수 있어요)"]);
  await expect(page.locator(".vocab-counts label")).toHaveText(["10문제", "20문제", "30문제", "40문제", "50문제"]);
  await expect(page.locator(".mode-note")).toHaveText([
    "한자 단어 ‘学校’를 보고 알맞은 읽기 ‘がっこう’를 골라요.",
    "히라가나 ‘がっこう’를 보고 알맞은 한자 표기 ‘学校’를 골라요.",
  ]);
  await expect(page.locator(".mode-option .mode-sample")).toHaveCount(0);
  for (const width of [1280, 681, 390, 375, 320]) {
    await page.setViewportSize({ width, height: 850 });
    const name = await page.locator("#vocab-level-label").boundingBox();
    const note = await page.locator("#vocab-level-note").boundingBox();
    const levels = await page.locator(".vocab-levels").boundingBox();
    if (width > 680) {
      expect(Math.abs(note.y + note.height / 2 - name.y - name.height / 2)).toBeLessThan(4);
      expect(Math.abs(note.x + note.width - levels.x - levels.width)).toBeLessThan(1);
    } else {
      expect(note.y).toBeGreaterThanOrEqual(name.y + name.height);
      expect(Math.abs(name.x - note.x)).toBeLessThan(1);
    }
    const summary = await page.locator("#vocab-summary").boundingBox();
    const start = await page.locator("#vocab-start").boundingBox();
    expect(summary.x + summary.width).toBeLessThan(start.x);
    expect(Math.abs(summary.y + summary.height / 2 - start.y - start.height / 2)).toBeLessThan(1);
    for (const mode of await page.locator(".mode-option").all()) {
      const enclosesText = await mode.evaluate(label => {
        const card = label.getBoundingClientRect();
        return [...label.querySelectorAll('.mode-note [lang="ja"]')].every(span => {
          const rect = span.getBoundingClientRect();
          const style = getComputedStyle(span);
          return rect.left >= card.left && rect.right <= card.right && rect.bottom <= card.bottom &&
            style.borderTopWidth === "0px" && style.backgroundColor === "rgba(0, 0, 0, 0)";
        });
      });
      expect(enclosesText).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (const count of [40, 50]) {
    await setting(page, "count", count).click();
    await page.reload();
    await expect(setting(page, "count", count).locator("input")).toBeChecked();
    await page.locator("#vocab-start").click();
    await expect(page.locator("#exam-counter")).toHaveText("1/" + count);
    await page.reload();
  }
});

test.describe("result copy at 375px", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  for (const [correct, encouragement] of [
    [0, "틀린 단어가 곧 공부할 단어예요. 오답부터 다시 풀어 봐요."],
    [4, "틀린 단어가 곧 공부할 단어예요. 오답부터 다시 풀어 봐요."],
    [5, "절반 넘게 맞혔어요. 함정만 조심하면 더 올라가요."],
    [8, "거의 다 왔어요. 틀린 단어만 다시 보면 끝!"],
    [10, "완벽해요! 다음 급수에 도전해 볼까요?"],
  ]) {
    test(`${correct * 10}% uses its encouragement and review count`, async ({ page }) => {
      await page.goto(path);
      await setting(page, "count", "10").tap();
      await page.locator("#vocab-start").tap();
      const submit = page.locator("#exam-submit");
      const feedback = page.locator("#exam-feedback > strong");
      const choices = page.locator(".exam-answer");
      await expect(choices).toHaveCount(4);
      for (let i = 0; i < 10; i++) {
        const word = await page.locator("#exam-word").innerText();
        const entry = words.find(w => w.word === word);
        const options = await page.locator(".answer-text").allTextContents();
        const reading = normalizeKana(entry.reading);
        const index = options.indexOf(reading);
        expect(index).toBeGreaterThanOrEqual(0);
        const isCorrect = i < correct;
        await choices.nth(isCorrect ? index : (index + 1) % 4).tap();
        await submit.tap();
        await expect(feedback).toHaveText((isCorrect ? "정답 · " : "오답 · 정답은 ") + (index + 1) + "번 " + reading);
        await submit.tap();
      }
      await expect(page.locator("#result-score")).toHaveText(correct + " / 10");
      await expect(page.locator("#result-percent")).toHaveText(correct * 10 + "%");
      const message = page.locator("#result-encouragement");
      await expect(message).toHaveText(encouragement);
      const bar = await page.locator("#result-progress").boundingBox();
      const messageBox = await message.boundingBox();
      expect(messageBox.y).toBeGreaterThan(bar.y + bar.height);
      await expect(page.locator("#result-stats dt").last()).toHaveText("자주 걸린 함정");
      const review = page.locator("#mistake-review");
      const empty = page.locator("#mistake-empty");
      await expect(review.locator("li")).toHaveCount(10 - correct);
      if (correct === 10) {
        await expect(review).toBeHidden();
        await expect(empty).toHaveText("틀린 단어가 없어요");
        await expect(empty).toBeVisible();
      } else {
        await expect(review.getByRole("heading")).toHaveText("틀린 단어 " + (10 - correct));
        await expect(review.locator(".word-trap").first()).toHaveText(/^내 답 .+ · .+/);
        await expect(empty).toBeHidden();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
});

test("instructions use kanji learned at each level and numbering continues when the mode changes", async ({ page }) => {
  await page.goto(path);
  await setting(page, "mode", "spelling").click();
  await setting(page, "count", 10).click();
  for (const level of ["N5", "N4", "N3", "N2", "N1"]) {
    for (const tile of await page.locator(".vocab-levels label").all()) {
      const input = tile.locator("input");
      if ((await input.isChecked()) !== (await input.inputValue() === level)) await tile.click();
    }
    await page.locator("#vocab-start").click();
    const expected = ["N5", "N4"].includes(level) ? "もんだい" : "問題";
    const basic = level === "N5" || level === "N4";
    const selection = basic ? "いちばん よい ものを、1・2・3・4から 一つ えらんで ください。" :
      "一番良いものを、1・2・3・4から一つ選んでください。";
    const reading = basic ? "つぎの ことばの " + (level === "N5" ? "読みかた" : "読み方") + "として " : "次の言葉の読み方として";
    const spelling = basic ? "つぎの ことばを " + (level === "N5" ? "かんじ" : "漢字") + "で 書くとき、 " : "次の言葉を漢字で書くとき、";
    await expect(page.locator("#exam-level")).toHaveText(level);
    await expect(page.locator("#exam-section")).toHaveText(expected + "1");
    await expect(page.locator("#exam-instruction")).toHaveText(reading + selection);
    await expect(page.locator("#exam-prompt")).not.toContainText(/[(（]\d+[)）]/);
    await expect(page.locator("#vocab-exam").getByRole("heading")).toHaveCount(0);
    const heading = await page.locator(".exam-heading").boundingBox();
    const stamp = await page.locator("#exam-level").boundingBox(), counter = await page.locator("#exam-counter").boundingBox();
    expect(Math.abs(stamp.x - heading.x)).toBeLessThan(1);
    expect(Math.abs(counter.x + counter.width - heading.x - heading.width)).toBeLessThan(1);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("1");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
    }
    await expect(page.locator("#exam-counter")).toHaveText("6/10");
    await expect(page.locator("#exam-section")).toHaveText(expected + "6");
    await expect(page.locator("#exam-instruction")).toHaveText(spelling + selection);
    await expect(page.locator("#exam-prompt")).not.toContainText(/[(（]\d+[)）]/);
    await page.reload();
  }
});

test("missed words use catalog ruby and the shared mouse and keyboard lookup, without a disclosure", async ({ page }) => {
  await page.route("**/jlpt-words/N5.json", route => route.fulfill({ json: words.filter(w => w.word === "学校") }));
  await page.goto(path);
  await page.locator("#vocab-start").click();
  await expect(page.locator("#vocab-exam ruby")).toHaveCount(0);
  await page.locator(".exam-answer").filter({ hasNotText: "がっこう" }).first().click();
  await page.locator("#exam-submit").click();
  const feedback = page.locator("#exam-feedback");
  await expect(feedback.locator("rt")).toHaveText(["がっ", "こう"]);
  await expect(feedback).not.toContainText("배울 학");
  await page.locator("#exam-submit").click();
  const review = page.locator("#result-words");
  await expect(review.locator("rt")).toHaveText(["がっ", "こう"]);
  await expect(review.locator("details, summary")).toHaveCount(0);
  const first = review.getByRole("link", { name: "学 간단 정보 보기" });
  const second = review.getByRole("link", { name: "校 간단 정보 보기" });
  const tooltip = page.getByRole("dialog", { name: "한자 간단 정보" });
  await first.hover();
  await expect(tooltip.locator(".popover-meaning")).toHaveText("배울 학");
  await expect(tooltip.locator(".popover-note")).not.toHaveText("불러오는 중…");
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
  await second.focus();
  await second.press("ArrowDown");
  const more = tooltip.getByRole("link", { name: "校 자세히 보기 (새 창)" });
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute("href", /校|%E6%A0%A1/);
  await page.keyboard.press("Escape");
  await expect(second).toBeFocused();
  const actions = page.locator(".result-actions");
  const container = await actions.boundingBox();
  const buttons = await Promise.all((await actions.locator("button").all()).map(b => b.boundingBox()));
  expect(buttons[0].y).toBe(buttons[2].y);
  expect(Math.abs((buttons[0].x + buttons[2].x + buttons[2].width) / 2 - container.x - container.width / 2)).toBeLessThan(1);
});

test.describe("mobile JLPT word practice", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("grade both sections, inspect the glossary and review just the missed word", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("manabo-theme-v1", "dark"));
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await setting(page, "mode", "spelling").tap();
    await setting(page, "count", "10").tap();
    await page.locator("#vocab-start").tap();
    const submit = page.locator("#exam-submit");
    let firstWord, firstTrap, firstCharacter;
    for (let i = 0; i < 10; i++) {
      const reading = i < 5;
      await expect(page.locator("#exam-counter")).toHaveText((i + 1) + "/10");
      await expect(page.locator("#exam-section")).toHaveText("もんだい" + (i + 1));
      await expect(submit).toBeDisabled();
      await expect(page.locator("#exam-level")).toHaveText("N5");
      await expect(page.locator("#vocab-exam rt")).toHaveCount(0);
      const prompt = await page.locator("#exam-word").innerText();
      const choices = await page.locator(".answer-text").allTextContents();
      expect(new Set(choices).size).toBe(4);
      const meaning = await page.locator("#exam-meaning").textContent();
      const entry = reading ? words.find(w => w.word === prompt) :
        words.find(w => normalizeKana(w.reading) === prompt && w.meaning === meaning && choices.includes(w.word));
      expect(entry).toBeTruthy();
      const right = choices.indexOf(reading ? normalizeKana(entry.reading) : entry.word);
      expect(right).toBeGreaterThanOrEqual(0);
      if (i === 0) {
        firstWord = entry.word;
        expect(await optionRows(page)).toBe(2);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.keyboard.press("Enter");
        await expect(page.locator("#exam-feedback")).toBeHidden();
        await page.keyboard.press(String((right + 1) % 4 + 1));
        await page.keyboard.press("Enter");
      } else {
        await page.locator(".exam-answer").nth(right).tap();
        await expect(page.locator("#exam-options input:checked")).toHaveCount(1);
        await submit.tap();
      }
      const feedback = page.locator("#exam-feedback");
      await expect(feedback.locator(".answer-definition")).toContainText(entry.meaning);
      await expect(feedback.locator("rt").first()).toBeVisible();
      if (i < 2) {
        const siteFont = await page.locator("body").evaluate(el => getComputedStyle(el).fontFamily);
        const feedbackFonts = await feedback.locator("strong, span, ruby, rt").evaluateAll(nodes =>
          [...new Set(nodes.map(el => getComputedStyle(el).fontFamily))]);
        expect(feedbackFonts).toEqual([siteFont]);
        await expect(page.locator("#exam-word")).not.toHaveCSS("font-family", siteFont);
      }
      await expect(feedback).not.toContainText(entry.kanji[0].level);
      await expect(feedback.locator("a")).toHaveCount(0);
      await expect(page.locator(".exam-answer.right .answer-text")).toHaveText(choices[right]);
      await expect(page.locator(".exam-answer.wrong")).toHaveCount(i === 0 ? 1 : 0);
      if (i === 0) {
        firstTrap = await feedback.locator(".word-trap strong").innerText();
        firstCharacter = entry.kanji[0];
        await submit.press("Enter");
      } else await submit.tap();
    }
    await expect(page.locator("#result-score")).toHaveText("9 / 10");
    await expect(page.locator("#result-percent")).toHaveText("90%");
    for (const stat of ["4/5 · 80%", "5/5 · 100%", firstTrap + " 1회"]) {
      await expect(page.locator("#result-stats")).toContainText(stat);
    }
    await expect(page.locator("#result-words li")).toHaveCount(1);
    await expect(page.locator("#result-words :is(details,summary)")).toHaveCount(0);
    await expect(page.locator("#result-words .word-trap")).toContainText(firstTrap);
    const actionBounds = await page.locator(".result-actions button").evaluateAll(buttons =>
      buttons.map(el => { const b = el.getBoundingClientRect(); return [b.x + b.width / 2, b.y, b.bottom]; }));
    expect(actionBounds.every(([center]) => Math.abs(center - 195) < 2)).toBe(true);
    expect(actionBounds[0][2]).toBeLessThan(actionBounds[1][1]);
    expect(actionBounds[1][2]).toBeLessThan(actionBounds[2][1]);
    const link = page.locator("#result-words a[data-study-kanji]").first();
    await link.tap();
    const tooltip = page.getByRole("dialog", { name: "한자 간단 정보" });
    await expect(tooltip.locator(".popover-meaning")).toHaveText(firstCharacter.hunEum);
    const rubricColor = await page.locator("#result-words rt").first().evaluate(rt => getComputedStyle(rt).color);
    const newPage = page.waitForEvent("popup");
    await tooltip.getByRole("link", { name: firstCharacter.k + " 자세히 보기 (새 창)" }).tap();
    const glossary = await newPage;
    await expect(glossary.locator("h1").first()).toContainText(firstCharacter.k);
    await expect(glossary.locator(".entry-words rt").first()).toHaveCSS("color", rubricColor);
    await glossary.close();
    await expect(page.locator("#result-score")).toHaveText("9 / 10");
    await page.locator("#retry-missed").tap();
    await expect(page.locator("#exam-counter")).toHaveText("1/1");
    await expect(page.locator("#exam-section")).toHaveText("もんだい1");
    await expect(page.locator("#exam-word")).toHaveText(firstWord);
    const kana = normalizeKana(words.find(w => w.word === firstWord).reading);
    await page.locator(".exam-answer").filter({ has: page.getByText(kana, { exact: true }) }).tap();
    await submit.tap();
    await submit.tap();
    await expect(page.locator("#result-percent")).toHaveText("100%");
    await expect(page.locator("#retry-missed")).toBeHidden();
    await page.locator("#edit-settings").tap();
    await expect(setting(page, "mode", "spelling").locator("input")).toBeChecked();
    await expect(setting(page, "count", "10").locator("input")).toBeChecked();
    await page.getByRole("link", { name: "한자 학습으로" }).tap();
    await expect(page.locator(".quiz-shelf a")).toHaveCount(4);
  });
});
