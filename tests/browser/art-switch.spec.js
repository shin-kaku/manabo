import { test, expect } from "@playwright/test";

test("the style switch defaults to ML and changes to TCG and back", async ({ page }) => {
  await page.goto("/kanji/木/");
  const art = page.locator(".entry-art");
  const zoom = page.locator("[data-entry-zoom]");
  const toggle = page.getByRole("switch", { name: "그림체 변경" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  const mlSource = await art.getAttribute("src");
  expect(mlSource).toMatch(/^\/media\/image2\//);
  await expect.poll(() => art.evaluate(img => img.complete && new URL(img.currentSrc).pathname)).toContain("/media/image2/");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(art).toHaveAttribute("src", /\/media\/image1\//);
  await expect(zoom).toHaveAttribute("href", /\/media\/image1\//);
  await expect.poll(() => art.evaluate(img => img.complete && new URL(img.currentSrc).pathname)).toContain("/media/image1/");
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(art).toHaveAttribute("src", mlSource);
  await expect(zoom).toHaveAttribute("href", mlSource);
  await expect.poll(() => art.evaluate(img => img.complete && new URL(img.currentSrc).pathname)).toContain("/media/image2/");
});

for (const width of [320, 375, 390]) test(`the caption and switch fit on one line at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/kanji/木/");
  const toggle = page.getByRole("switch", { name: "그림체 변경" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  const card = await page.locator(".entry-art-switch").locator("xpath=ancestor::figure").boundingBox();
  const button = await toggle.boundingBox();
  expect(button.x).toBeGreaterThanOrEqual(card.x);
  expect(button.x + button.width).toBeLessThanOrEqual(card.x + card.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const caption = page.locator(".entry-art-caption");
  const captionBox = await caption.boundingBox();
  expect(captionBox.x).toBeGreaterThanOrEqual(card.x);
  expect(captionBox.x + captionBox.width).toBeLessThanOrEqual(card.x + card.width);
  expect(await caption.innerText()).toContain("암기 그림");
});
