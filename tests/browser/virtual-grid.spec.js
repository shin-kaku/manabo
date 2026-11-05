import { test, expect } from "@playwright/test";
import { expectWindowedCards } from "./virtual-grid-helpers.js";

const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ZkAAAAASUVORK5CYII=", "base64");
async function prepare(page) {
  const requests = { images: [], data: 0 }, errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("request", request => { if (request.url().includes("/data/kanji.json")) requests.data++; });
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
  await page.route("**/*", route => {
    const request = route.request();
    if (new URL(request.url()).pathname === "/favicon.svg") return route.continue();
    if (request.resourceType() === "image") requests.images.push(request.url());
    if (request.resourceType() !== "image" && new URL(request.url()).hostname === "127.0.0.1") return route.continue();
    return route.fulfill({ contentType: request.resourceType() === "image" ? "image/png" : "text/plain", body: request.resourceType() === "image" ? pixel : "" });
  });
  await page.goto("/kanji/");
  await expectWindowedCards(page);
  return { requests, errors };
}
const gridState = page => page.locator("#grid").evaluate(grid => ({
  count: grid.querySelectorAll(".card").length,
  elements: grid.querySelectorAll("*").length,
  indices: [...grid.querySelectorAll(".card")].map(card => Number(card.dataset.index)),
  height: grid.getBoundingClientRect().height,
  overflow: document.documentElement.scrollWidth > innerWidth,
  visible: [...grid.querySelectorAll(".card")].filter(card => {
    const r = card.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0;
  }).map(card => Number(card.dataset.index)),
}));

for (const width of [390, 768, 1280, 1600]) {
  test(`long rapid scrolling stays bounded and sends no image requests at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const { requests, errors } = await prepare(page);
    const measurements = [];
    for (const fraction of [0.05, 0.2, 0.5, 0.8, 1, 0.3, 0]) {
      await page.evaluate(fraction => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * fraction), fraction);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const state = await gridState(page);
      measurements.push({ fraction, cards: state.count, elements: state.elements });
      expect(state.count).toBeLessThanOrEqual(96);
      expect(state.elements).toBeLessThan(3000);
      expect(new Set(state.indices).size).toBe(state.count);
      expect(state.overflow).toBe(false);
      expect(state.visible.length).toBeGreaterThan(0);
    }
    await page.waitForTimeout(200);
    expect(requests.images).toHaveLength(0);
    expect(requests.data).toBe(1);
    expect(errors).toEqual([]);
    await expect(page.locator('#grid .card[data-index="0"]')).toBeAttached();
    console.log(JSON.stringify({ width, measurements, imageRequests: requests.images.length, dataRequests: requests.data }));
    if ([390, 1280].includes(width)) await page.screenshot({ path: `/private/tmp/manabo-virtual-grid-${width}.png` });
  });
}

test("rotation retains the current region and closing detail restores scroll and focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight * 0.55));
  await page.waitForTimeout(200);
  const before = await gridState(page);
  await page.setViewportSize({ width: 900, height: 500 });
  await page.waitForTimeout(200);
  const after = await gridState(page);
  expect(Math.abs(after.visible[0] - before.visible[0])).toBeLessThanOrEqual(3);
  expect(after.overflow).toBe(false);
  const card = page.locator(`#grid .card[data-index="${after.visible[3]}"]`);
  await card.locator(".front").click();
  await card.locator(".card-detail-button").click();
  const position = await page.evaluate(() => scrollY);
  await expect(page.locator("#detailOverlay")).toBeVisible();
  await page.locator("#detailClose").click();
  await expect(card.locator(".card-detail-button")).toBeFocused();
  expect(Math.abs(await page.evaluate(() => scrollY) - position)).toBeLessThan(2);
  await expectWindowedCards(page);
});

test("flipped state and a recently loaded image survive recycling without a repeat request", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { requests } = await prepare(page);
  const first = page.locator('#grid .card[data-index="0"]');
  await first.locator(".front").click();
  await expect.poll(() => first.locator("img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(requests.images).toHaveLength(1);
  await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, document.documentElement.scrollHeight * 0.8); });
  await expect(first).toHaveCount(0);
  await page.evaluate(() => scrollTo(0, 0));
  await expect(first).toHaveClass(/flipped/);
  await expect.poll(() => first.locator("img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.waitForTimeout(200);
  expect(requests.images).toHaveLength(1);
});

test("a recycled flipped card does not start a request while scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { requests } = await prepare(page);
  let heldRoute;
  await page.route("**/media/**", route => { requests.images.push(route.request().url()); heldRoute = route; });
  const first = page.locator('#grid .card[data-index="0"]');
  await first.locator(".front").click();
  await expect.poll(() => requests.images.length).toBe(1);
  await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, document.documentElement.scrollHeight * 0.8); });
  await expect(first).toHaveCount(0);
  await page.evaluate(async () => {
    for (let n = 0; n < 20; n++) {
      scrollTo(0, n % 2 ? document.documentElement.scrollHeight * 0.8 : 0);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
  });
  expect(requests.images).toHaveLength(1);
  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(() => requests.images.length).toBe(2);
  await heldRoute.fulfill({ contentType: "image/png", body: pixel }).catch(() => {});
});

test("filtering deep in the list resets the window and empty results recover", async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight * 0.9));
  await page.waitForTimeout(200);
  await page.locator("#search").fill("zzzz-no-kanji");
  await expect(page.locator("#grid .empty")).toBeVisible();
  await expect(page.locator("#grid .card")).toHaveCount(0);
  await page.locator("#search").fill("");
  await expect(page.locator('#grid .card[data-index="0"]')).toBeAttached();
  await expectWindowedCards(page);
});

test("keyboard navigation continues beyond the initial window in item order", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { requests } = await prepare(page);
  await page.locator('#grid .card[data-index="0"] .front').focus();
  for (let index = 1; index <= 30; index++) {
    await page.keyboard.press("Tab");
    await expect.poll(() => page.evaluate(() => document.activeElement.closest(".card")?.dataset.index)).toBe(String(index));
  }
  for (let index = 29; index >= 0; index--) {
    await page.keyboard.press("Shift+Tab");
    await expect.poll(() => page.evaluate(() => document.activeElement.closest(".card")?.dataset.index)).toBe(String(index));
  }
  await expectWindowedCards(page);
  expect(requests.images).toHaveLength(0);
});

test("visible flipped images use at most two concurrent requests", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1200 });
  await prepare(page);
  const held = [];
  let inFlight = 0, peak = 0;
  await page.route("**/media/**", route => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    held.push(async () => { inFlight--; await route.fulfill({ contentType: "image/png", body: pixel }); });
  });
  for (let i = 0; i < 4; i++) await page.locator(`#grid .card[data-index="${i}"] .front`).click();
  await expect.poll(() => held.length).toBe(2);
  await page.waitForTimeout(200);
  expect(held).toHaveLength(2);
  for (let i = 0; i < 4; i++) {
    await expect.poll(() => held.length).toBeGreaterThan(i);
    await held[i]();
  }
  expect(peak).toBe(2);
});
