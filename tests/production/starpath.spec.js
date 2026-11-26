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
