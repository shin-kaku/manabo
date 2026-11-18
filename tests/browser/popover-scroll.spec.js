import { test, expect } from "@playwright/test";

test("keyboard-opened kanji popover closes when its anchor scrolls out of view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.fulfill({ body: "" }));
  await page.goto("/kanji/文/");
  const anchor = page.locator(".entry-words a[data-study-kanji]").first();
  await anchor.scrollIntoViewIfNeeded();
  await anchor.press("Enter");
  await expect(page.locator("dialog.study-lookup")).toBeVisible();
  await expect(anchor).toHaveAttribute("aria-expanded", "true");
  const before = await anchor.boundingBox();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(page.locator("dialog.study-lookup")).toBeHidden();
  await expect(anchor).toHaveAttribute("aria-expanded", "false");
  expect((await anchor.boundingBox()).y).not.toBe(before.y);
  await expect(page.locator("[data-entry-kanji]")).toBeVisible();
});
