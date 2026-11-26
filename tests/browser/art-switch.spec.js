import { test, expect } from "@playwright/test";

test("detail defaults to ML and switches between both illustrations", async ({ page }) => {
  await page.goto("/kanji/木/");
  const art = page.locator(".entry-art");
  const zoom = page.locator("[data-entry-zoom]");
  const ml = page.getByRole("button", { name: "ML", exact: true });
  const tcg = page.getByRole("button", { name: "TCG", exact: true });
  await expect(ml).toHaveAttribute("aria-pressed", "true");
  const mlSource = await art.getAttribute("src");
  expect(mlSource).toMatch(/^\/media\/image2\//);
  await tcg.click();
  await expect(tcg).toHaveAttribute("aria-pressed", "true");
  await expect(art).toHaveAttribute("src", /\/media\/image1\//);
  await expect(zoom).toHaveAttribute("href", /\/media\/image1\//);
  await ml.click();
  await expect(ml).toHaveAttribute("aria-pressed", "true");
  await expect(art).toHaveAttribute("src", mlSource);
  await expect(zoom).toHaveAttribute("href", mlSource);
});
