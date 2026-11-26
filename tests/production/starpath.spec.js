import { test, expect } from "@playwright/test";

test("shape links open the matching kanji and show its shape components", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const response = await page.request.get("/data/kanji.json");
  await expect(response).toBeOK();
  const entries = await response.json();
  await page.goto("/learn/");
  await page.locator('[data-analytics-choice="denied"]').click();
  for (const [part, glyph, components] of [
    ["灬", "魚", "⺈ 田 灬"],
    ["黒", "黙", "黒"],
  ]) {
    await page.goto("/learn/game/#" + encodeURIComponent(part));
    await page.locator(`#map .rel[data-k="${glyph}"]`).click();
    await page.locator(`#map .cur[data-k="${glyph}"]`).click();
    const entry = entries.find(row => row["한자"] === glyph);
    await expect(page.locator("#explanation")).toHaveText(entry["풀이"]);
    await page.locator("#extra summary").click();
    const shapes = page.locator("#extra-content section").filter({
      has: page.getByRole("heading", { name: "모양에서 찾은 부품", exact: true }),
    });
    await expect(shapes.locator(".uses")).toHaveText(components);
  }
});

for (const width of [390, 1280]) {
  test(`the published study menu opens a working Starpath game at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/learn/");
    await page.getByRole("link", { name: "한자 별길" }).click();
    await expect(page).toHaveURL(/\/learn\/game\/$/);
    const current = page.locator("#map .n.cur");
    await expect(current).toBeVisible();
    await current.click();
    await expect(page.locator("#reveal")).toBeVisible();
    await expect(page.locator("#glyph")).toHaveText("門");
    await page.locator("#close").click();
    await expect(page.locator("#reveal")).toBeHidden();
    await page.locator("#star-query").fill("木");
    await page.locator("#star-matches li").first().click();
    await expect(page.locator("#map-location")).toHaveText("木");
    await page.getByRole("link", { name: "한자 학습으로" }).click();
    await expect(page).toHaveURL(/\/learn\/$/);
    expect(errors).toEqual([]);
  });
}
