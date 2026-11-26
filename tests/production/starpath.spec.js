import { test, expect } from "@playwright/test";

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

for (const viewport of [{ width: 320, height: 550 }, { width: 390, height: 620 }, { width: 693, height: 300 }, { width: 844, height: 390 }]) {
  test(`short ${viewport.width}×${viewport.height} viewport keeps the map usable and footer separate`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
    await page.goto("/learn/game/");
    const map = page.locator("#pick");
    const current = page.locator("#map .n.cur");
    await expect(current).toBeVisible();
    const [mapBox, backBox, footerBox] = await Promise.all([
      map.boundingBox(), page.locator("#choiceBack").boundingBox(), page.locator(".site-footer").boundingBox(),
    ]);
    expect(mapBox.height).toBeGreaterThanOrEqual(300);
    expect(backBox.y + backBox.height).toBeLessThanOrEqual(mapBox.y + 1);
    expect(footerBox.y).toBeGreaterThanOrEqual(mapBox.y + mapBox.height);
    await expect(page.locator(".game-footer-full")).toBeHidden();
    const footerMenu = page.locator(".game-footer-menu");
    await expect(footerMenu).toBeVisible();
    await current.click();
    await expect(page.locator("#reveal")).toBeVisible();
    await expect(page.locator("#glyph")).toHaveText("門");
    await page.locator("#close").click();
    await expect(page.locator("#reveal")).toBeHidden();
    await page.locator("#map .rel").first().click();
    await expect(page.locator("#map-location")).not.toHaveText("門");
    await page.locator("#star-query").fill("木");
    await page.locator("#star-matches li").first().click();
    await expect(page.locator("#map-location")).toHaveText("木");
    await footerMenu.locator("summary").click();
    await expect(footerMenu.getByRole("link", { name: "저작권 및 이용 안내" })).toBeVisible();
  });
}

test("compact footer does not depend on game JavaScript finishing", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 620 } });
  const page = await context.newPage();
  await page.goto("/learn/game/");
  await expect(page.locator(".game-footer-full")).toBeHidden();
  const footer = page.locator(".game-footer-menu");
  await expect(footer).toBeVisible();
  await footer.locator("summary").click();
  await expect(footer.getByRole("link", { name: "문의하기" })).toBeVisible();
  await context.close();
});
