import { expect } from "@playwright/test";

export async function expectWindowedCards(page) {
  await expect.poll(() => page.locator("#grid .card").count()).toBeGreaterThan(0);
  expect(await page.locator("#grid .card").count()).toBeLessThanOrEqual(96);
}
