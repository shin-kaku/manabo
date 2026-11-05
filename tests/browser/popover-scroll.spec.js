import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url), "utf8"));

test("keyboard-opened kanji popover closes when its detail panel scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.fulfill({ body: "" }));
  await page.route("**/data/kanji.json", route => route.fulfill({ json: rows }));
  await page.goto("/kanji/#kanji=%E6%96%87");
  const anchor = page.locator("#detailOverlay .examples-info .kanji-link").first();
  await anchor.press("Enter");
  await expect(page.locator("#kanjiPopover")).toBeVisible();
  await expect(anchor).toHaveAttribute("aria-expanded", "true");
  const before = await anchor.boundingBox();
  await page.locator("#detailOverlay .back-body").evaluate(panel => {
    panel.scrollTop = panel.scrollTop > 50 ? 0 : 150;
  });
  await expect(page.locator("#kanjiPopover")).toBeHidden();
  await expect(anchor).toHaveAttribute("aria-expanded", "false");
  expect((await anchor.boundingBox()).y).not.toBe(before.y);
  await expect(page.locator("#detailOverlay")).toBeVisible();
});
