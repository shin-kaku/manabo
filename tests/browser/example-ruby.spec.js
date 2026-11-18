import { test, expect } from "@playwright/test";

for (const width of [320, 390, 1280]) {
  test(`character example readings render as accent ruby above each glyph at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
    await page.goto("/kanji/文/", { waitUntil: "domcontentloaded" });
    const item = page.locator(".entry-words li").filter({ has: page.locator("span:last-child", { hasText: /^문화$/ }) });
    const word = item.locator(".example-word");
    await expect(word.locator("rt")).toHaveText(["ぶん", "か"]);
    await expect(word.locator("a[data-study-kanji='文']")).toHaveCount(0);
    await expect(word.locator("a[data-study-kanji='化']")).toHaveCount(1);
    const metrics = await word.evaluate(el => {
      const ruby = el.querySelector("ruby");
      const rt = ruby.querySelector("rt");
      const base = document.createRange();
      base.selectNode(ruby.firstChild);
      const marker = document.createElement("span");
      marker.style.color = "var(--accent)";
      el.append(marker);
      const accent = getComputedStyle(marker).color;
      marker.remove();
      return { accent, color: getComputedStyle(rt).color, rtBottom: rt.getBoundingClientRect().bottom, baseTop: base.getBoundingClientRect().top, right: el.getBoundingClientRect().right };
    });
    expect(metrics.color).toBe(metrics.accent);
    expect(metrics.rtBottom).toBeLessThanOrEqual(metrics.baseTop + 3);
    expect(metrics.right).toBeLessThanOrEqual(width);
    await word.locator("a[data-study-kanji='化']").click();
    await expect(page.locator("dialog.study-lookup[open] .popover-glyph")).toHaveText("化");
  });
}

test("irregular compounds and mixed kana retain their reviewed reading groups on real detail pages", async ({ page }) => {
  for (const [ch, example, readings] of [
    ["今", "今日", [["こん", "にち"], ["きょう"]]],
    ["食", "食べる", [["た"]]],
    ["虫", "虫眼鏡", [["むし", "めがね"]]],
    ["極", "月極駐車場", [["つき", "ぎめ", "ちゅう", "しゃ", "じょう"]]],
  ]) {
    await page.goto("/kanji/" + ch + "/", { waitUntil: "domcontentloaded" });
    const actual = await page.locator(".entry-words .example-word").evaluateAll((words, expected) => {
      const matches = [];
      for (const word of words) {
        const base = word.cloneNode(true);
        base.querySelectorAll("rt,rp").forEach(node => node.remove());
        if (base.textContent === expected) matches.push(Array.from(word.querySelectorAll("rt"), rt => rt.textContent));
      }
      return matches;
    }, example);
    expect(actual, example).toEqual(readings);
  }
});
