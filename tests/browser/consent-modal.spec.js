import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url), "utf8"));
const consentKey = "manabo-analytics-consent-v1";

for (const entry of ["deep link", "list"]) {
  test(`pending consent waits for the detail modal to close (${entry})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.fulfill({ body: "" }));
    await page.route("**/data/kanji.json", route => route.fulfill({ json: rows.filter(row => row["한자"] === "文") }));
    await page.route("**/data/media.json", route => route.fulfill({ json: { schema: 1, items: {} } }));
    await page.goto(entry === "deep link" ? "/kanji/#kanji=%E6%96%87" : "/kanji/");
    const banner = page.locator(".analytics-banner");
    const modal = page.locator("#detailOverlay");
    if (entry === "list") {
      await expect(banner).toBeVisible();
      const card = page.locator('#grid .card[data-kanji="文"]');
      await card.locator(".front").press("Space");
      await card.locator(".card-detail-button").press("Enter");
    }
    await expect(modal).toBeVisible();
    await expect(banner).toHaveJSProperty("inert", true);
    await expect(banner).toBeHidden();
    expect(await page.evaluate(key => localStorage.getItem(key), consentKey)).toBeNull();
    await expect(page.locator("#detailClose")).toBeFocused();
    for (const key of ["Shift+Tab", "Tab"]) {
      await page.keyboard.press(key);
      expect(await modal.evaluate(node => node.contains(document.activeElement))).toBe(true);
    }
    await page.locator("#detailClose").click();
    await expect(modal).toBeHidden();
    await expect(banner).toHaveJSProperty("inert", false);
    await expect(banner).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), consentKey)).toBeNull();

    await banner.getByRole("button", { name: "거부", exact: true }).click();
    const savedChoice = await page.evaluate(key => localStorage.getItem(key), consentKey);
    expect(JSON.parse(savedChoice).choice).toBe("denied");
    await page.goto("/kanji/#kanji=%E6%96%87");
    await page.reload();
    await expect(modal).toBeVisible();
    await expect(banner).toBeHidden();
    await page.locator("#detailClose").click();
    await expect(modal).toBeHidden();
    await expect(banner).toBeHidden();
    expect(await page.evaluate(key => localStorage.getItem(key), consentKey)).toBe(savedChoice);
  });
}
