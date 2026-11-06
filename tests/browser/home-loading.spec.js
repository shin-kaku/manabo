import { test, expect } from "@playwright/test";

test("homepage renders and its controls work without waiting for the reading font", async ({ page }) => {
  let releaseFont;
  const fontGate = new Promise(resolve => { releaseFont = resolve; });
  const fontRequests = [];
  await page.route("https://fonts.googleapis.com/**", async route => {
    fontRequests.push(route.request().url());
    await fontGate;
    await route.fulfill({ contentType: "text/css", body: "" });
  });
  try {
    // A stalled optional font must not stop the parser before the body or delay controls.
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 10000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("마나보 학습 방법");
    await expect(page.locator(".analytics-banner")).toBeVisible();
    await page.locator(".site-info-menu summary").click();
    await page.getByRole("button", { name: "다크모드로 전환" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(fontRequests).toEqual([]);
    expect(await page.locator("main").evaluate(el => getComputedStyle(el).fontFamily)).not.toContain("Nanum Myeongjo");
  } finally {
    releaseFont();
  }
});
