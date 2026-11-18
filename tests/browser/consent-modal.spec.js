import { test, expect } from "@playwright/test";

const consentKey = "manabo-analytics-consent-v1";
for (const entry of ["deep link", "list"]) {
  test(`pending consent stays separate from the image viewer (${entry})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.fulfill({ body: "" }));
    // Exercise the first activation while the progressively enhanced detail module is unavailable.
    await page.route("**/src/character-page.js*", route => route.abort());
    await page.goto(entry === "deep link" ? "/kanji/#kanji=%E6%96%87" : "/kanji/");
    const banner = page.locator(".analytics-banner");
    if (entry === "list") {
      await page.locator("#directory-q").fill("文");
      await page.locator("[data-directory-grid] a").first().press("Enter");
    }
    await expect(page.locator("[data-entry-kanji]")).toHaveAttribute("data-entry-kanji", "文");
    await expect(banner).toBeVisible();
    const trigger = page.locator("[data-entry-zoom]");
    await trigger.press("Enter");
    const viewer = page.locator("dialog.entry-zoom-dialog");
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole("button", { name: "닫기" })).toBeFocused();
    const refuse = banner.locator('[data-analytics-choice="denied"]');
    await refuse.evaluate(button => button.focus());
    await expect(refuse).not.toBeFocused();
    expect(await page.evaluate(key => localStorage.getItem(key), consentKey)).toBeNull();
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(trigger).toBeFocused();
    await refuse.click();
    const saved = await page.evaluate(key => localStorage.getItem(key), consentKey);
    expect(JSON.parse(saved).choice).toBe("denied");
    await page.reload();
    await expect(page.locator("[data-entry-kanji]")).toHaveAttribute("data-entry-kanji", "文");
    await expect(banner).toBeHidden();
    expect(await page.evaluate(key => localStorage.getItem(key), consentKey)).toBe(saved);
  });
}
