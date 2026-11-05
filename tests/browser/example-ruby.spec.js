import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url), "utf8"));
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ZkAAAAASUVORK5CYII=", "base64");

for (const width of [1280, 390]) {
  test(`detail examples show accent ruby and retain kanji navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
    await page.route("**/*", route => {
      if (new URL(route.request().url()).hostname === "127.0.0.1") return route.continue();
      return route.fulfill({ contentType: route.request().resourceType() === "image" ? "image/png" : "text/plain", body: route.request().resourceType() === "image" ? pixel : "" });
    });
    await page.route("**/data/kanji.json", route => route.fulfill({ json: rows.map(row => row["한자"] === "文" ? { ...row, "예시단어": "㉧\n文化(ぶんか) 문화\n学校(がっこう) 학교\n-\n㉭\n食べる(たべる) 먹다\n今日(きょう) 오늘" } : row) }));
    await page.goto("/kanji/#kanji=%E6%96%87");
    const words = page.locator("#detailOverlay .example-word");
    await expect(words).toHaveCount(4);
    await expect(words.nth(0).locator("rt")).toHaveText(["ぶん", "か"]);
    await expect(words.nth(1).locator("rt")).toHaveText(["がっ", "こう"]);
    await expect(words.nth(2).locator("rt")).toHaveText(["た"]);
    await expect(words.nth(3).locator("rt")).toHaveText(["きょう"]);
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
