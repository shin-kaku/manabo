import { test, expect } from "@playwright/test";

test("the development server opens the current Starpath from the study menu", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/learn/");
  const link = page.getByRole("link", { name: "한자 별길", exact: true });
  await expect(link.locator("img")).toBeVisible();
  await expect.poll(() => link.locator("img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await link.click();
  await expect(page).toHaveURL(/\/learn\/game\/$/);
  await expect(page.locator("#map .cur")).toHaveAttribute("data-k", "門");
  await page.goto("/learn/game/#%E7%81%AC");
  await expect(page.locator('#map .rel[data-k="魚"]')).toBeVisible();
  await page.locator('#map .rel[data-k="魚"]').click();
  await expect(page.locator("#map .cur")).toHaveAttribute("data-k", "魚");
  expect(errors).toEqual([]);
});
