import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url), "utf8"));
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ZkAAAAASUVORK5CYII=", "base64");
const examples = [
  ["文化", "ぶんか", "문화", ["ぶん", "か"]],
  ["学校", "がっこう", "학교", ["がっ", "こう"]],
  ["食べる", "たべる", "먹다", ["た"]],
  ["今日", "きょう", "오늘", ["きょう"]],
  ["気持ち", "きもち", "기분", ["き", "も"]],
  ["先輩", "せんぱい", "선배", ["せん", "ぱい"]],
  ["口腔", "こうくう", "구강", ["こう", "くう"]],
  ["虫眼鏡", "むしめがね", "돋보기", ["むし", "めがね"]],
  ["一人旅", "ひとりたび", "혼자 하는 여행", ["ひとり", "たび"]],
  ["飼い犬", "かいいぬ", "기르는 개", ["か", "いぬ"]],
  ["懐中時計", "かいちゅうどけい", "회중시계", ["かい", "ちゅう", "どけい"]],
  ["凸版印刷", "とっぱんいんさつ", "볼록판 인쇄", ["とっ", "ぱん", "いん", "さつ"]],
  ["月極駐車場", "つきぎめちゅうしゃじょう", "월정 주차장", ["つき", "ぎめ", "ちゅう", "しゃ", "じょう"]],
];

for (const width of [1280, 390, 320]) {
  test(`detail examples show accent ruby and retain kanji navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
    await page.route("**/*", route => {
      if (new URL(route.request().url()).hostname === "127.0.0.1") return route.continue();
      return route.fulfill({ contentType: route.request().resourceType() === "image" ? "image/png" : "text/plain", body: route.request().resourceType() === "image" ? pixel : "" });
    });
    await page.route("**/data/kanji.json", route => route.fulfill({ json: rows.map(row => row["한자"] === "文" ? { ...row, "예시단어": "㉧\n" + examples.map(([word, reading, meaning]) => `${word}(${reading}) ${meaning}`).join("\n") } : row) }));
    await page.goto("/kanji/#kanji=%E6%96%87");
    const words = page.locator("#detailOverlay .example-word");
    await expect(words).toHaveCount(examples.length);
    for (let i = 0; i < examples.length; i++) {
      await expect(words.nth(i).locator("rt")).toHaveText(examples[i][3]);
      const base = await words.nth(i).evaluate(el => {
        const clone = el.cloneNode(true);
        clone.querySelectorAll("rt,rp").forEach(node => node.remove());
        return clone.textContent;
      });
      expect(base).toBe(examples[i][0]);
      const bounds = await words.nth(i).boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    await expect(words.first().locator("rt").first()).toHaveCSS("color", "rgb(188, 0, 45)");
    await expect(page.locator("#detailOverlay .example-list").first()).toContainText("문화");
    await expect(page.locator("#grid ruby")).toHaveCount(0);
    await words.first().scrollIntoViewIfNeeded();
    const geometry = await words.first().locator("ruby").first().evaluate(el => {
      const rt = el.querySelector("rt").getBoundingClientRect();
      const base = document.createRange(); base.selectNode(el.firstChild);
      return { rtBottom: rt.bottom, baseTop: base.getBoundingClientRect().top, right: el.parentElement.getBoundingClientRect().right };
    });
    expect(geometry.rtBottom).toBeLessThanOrEqual(geometry.baseTop + 3);
    expect(geometry.right).toBeLessThanOrEqual(width);
    await page.locator("#detailOverlay .examples-info").screenshot({ path: testInfo.outputPath(`example-ruby-${width}.png`) });
    await words.first().getByRole("button", { name: "化 간단 정보 보기" }).click();
    await expect(page.locator("#kanjiPopover")).toBeVisible();
    await expect(page.locator("#popoverGlyph")).toHaveText("化");
  });
}
