import { test, expect } from "@playwright/test";

for (const path of ["/", "/kanji/", "/kanji/木/", "/learn/"]) {
  test(`image context menus are blocked on ${path}`, async ({ page }) => {
    await page.goto(path);
    const image = page.locator("img").first();
    await expect(image).toBeAttached();
    const blocked = await image.evaluate((element) => !element.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }),
    ));
    expect(blocked).toBe(true);
    const normalMenu = await page.locator("body").evaluate((element) => element.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }),
    ));
    expect(normalMenu).toBe(true);
    const dynamicBlocked = await page.evaluate(() => {
      const image = document.createElement("img");
      document.body.append(image);
      return !image.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
    });
    expect(dynamicBlocked).toBe(true);
  });
}

test("the enlarged character image also blocks the context menu", async ({ page }) => {
  await page.goto("/kanji/木/");
  await page.locator("[data-entry-zoom]").click();
  const image = page.locator(".entry-zoom-dialog img");
  await expect(image).toBeVisible();
  expect(await image.evaluate((element) => !element.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }),
  ))).toBe(true);
});
