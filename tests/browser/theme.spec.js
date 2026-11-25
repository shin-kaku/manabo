import { test, expect } from "@playwright/test";

async function prepare(page) {
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
}

for (const width of [390, 1280]) test(`theme menu persists across learning pages at ${width}px`, async ({ page }, testInfo) => {
  await prepare(page);
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator(".site-info-menu summary").click();
  const button = page.getByRole("button", { name: "다크모드로 전환" });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "화이트모드로 전환" })).toBeFocused();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`theme-home-dark-${width}.png`) });
  await page.keyboard.press("Escape");
  await expect(page.locator(".site-info-menu summary")).toBeFocused();
  for (const path of ["/kanji/", "/kanji/林/", "/reading/", "/quiz/", "/quiz/choice/", "/book/", "/materials/", "/about/"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("body")).toHaveCSS("color", "rgb(245, 245, 245)");
    await page.locator(".site-info-menu summary").click();
    await expect(page.getByRole("button", { name: "화이트모드로 전환" })).toBeVisible();
    if (path === "/kanji/") {
      await expect(page.locator("[data-directory-grid] a").first()).toBeVisible();
      await expect(page.locator(".info-page")).toHaveCSS("background-color", "rgb(20, 20, 20)");
      await page.screenshot({ path: testInfo.outputPath(`theme-kanji-dark-${width}.png`) });
    }
  }
  await page.getByRole("button", { name: "화이트모드로 전환" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(241, 241, 241)");
});

test("saved dark theme applies even before the menu module loads", async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => localStorage.setItem("manabo-theme-v1", "dark"));
  await page.route("**/src/site-info.js", route => route.abort());
  await page.goto("/contact/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
});

test("blocked storage still permits theme switching", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } });
  });
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.goto("/");
  await page.locator(".site-info-menu summary").click();
  await page.getByRole("button", { name: "다크모드로 전환" }).click();
  await expect(page.getByRole("button", { name: "화이트모드로 전환" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("another open tab follows the saved theme without reloading", async ({ page, context }) => {
  await prepare(page);
  const other = await context.newPage();
  await prepare(other);
  await page.goto("/");
  await other.goto("/privacy-policy/");
  await page.locator(".site-info-menu summary").click();
  await page.getByRole("button", { name: "다크모드로 전환" }).click();
  await expect(other.locator("html")).toHaveAttribute("data-theme", "dark");
  await other.locator(".site-info-menu summary").click();
  await other.getByRole("button", { name: "화이트모드로 전환" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("quiz screenshots follow the selected site theme", async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/quiz/");
  for (const [index, suffix] of [".webp", "-dark.webp", ".webp"].entries()) {
    if (index > 0) {
      await page.locator(".site-info-menu summary").click();
      await page.locator("[data-theme-toggle]").click();
      await page.keyboard.press("Escape");
    }
    for (const [mode, label] of [["choice", "사지선다"], ["reading", "한자음 독해"]]) {
      const image = page.locator(".quiz-shelf").getByRole("link", { name: label, exact: true }).locator("picture img");
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate(img =>
        img.complete && img.naturalWidth ? new URL(img.currentSrc).pathname : ""
      )).toBe(`/images/quiz-preview-${mode}${suffix}`);
    }
  }
});
