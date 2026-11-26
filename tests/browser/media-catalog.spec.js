import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { driveFileId } from "../../src/image-sources.js";

const rows = JSON.parse(await readFile(new URL("../../public/data/kanji.json", import.meta.url)));
const media = JSON.parse(await readFile(new URL("../../public/data/media.json", import.meta.url)));
const pool = ["木", "林", "森", "機"].map(glyph => rows.find(row => row.한자 === glyph));
const lookupPattern = "**/data/quiz-image/*.json";
const googleImage = /^https:\/\/(?:drive\.google\.com|lh3\.googleusercontent\.com)\//;
const imageStub = {
  contentType: "image/webp",
  body: await sharp({ create: { width: 960, height: 960, channels: 3, background: "white" } }).webp().toBuffer(),
};

function sources(glyph) {
  const row = pool.find(row => row.한자 === glyph);
  const id = driveFileId(row["이미지 1"]);
  return {
    lookup: `/data/quiz-image/${glyph.codePointAt(0).toString(16)}.json`,
    detail: media.items.image1[id].detail.url,
    thumbnail: `https://drive.google.com/thumbnail?id=${id}&sz=w1200`,
    backup: `https://lh3.googleusercontent.com/d/${id}=w1200`,
  };
}

async function watchQuiz(page) {
  const requests = { catalogs: [], lookups: [], images: [] };
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname === "/data/media.json") requests.catalogs.push(url.pathname);
    if (url.pathname.startsWith("/data/quiz-image/")) requests.lookups.push(url.pathname);
    if (url.pathname.startsWith("/media/image1/") || googleImage.test(url.href)) requests.images.push(url.href);
  });
  await page.route("**/data/kanji.json", route => route.fulfill({ json: pool }));
  // A clean checkout contains the lookup data but excludes generated image binaries.
  await page.route("**/media/image1/**", route => route.fulfill(imageStub));
  return requests;
}

async function startQuiz(page) {
  await page.goto("/learn/choice/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#gameStart")).toBeEnabled();
  await page.locator("#gameStart").click();
  await expect(page.locator(".game-choice")).toHaveCount(4);
  return page.locator("#gameGlyph").innerText();
}

async function openPicture(page, glyph) {
  await page.locator("#gamePicture").click();
  await expect(page.locator("#imageOverlay")).toBeVisible();
  await expect(page.locator("#imageClose")).toBeFocused();
  await expect(page.locator("#imageZoom")).toHaveAttribute("alt", `${glyph} 암기 이미지 크게 보기`);
}

async function expectDecoded(page, url) {
  const image = page.locator("#imageZoom");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth === 960 && img.currentSrc))
    .toBe(new URL(url, page.url()).href);
}

const reply = url => ({ contentType: "application/json", body: JSON.stringify(url) });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
});

test("the quiz hub and reader show their content without any picture address lookup", async ({ page }) => {
  const requests = await watchQuiz(page);
  await page.unroute("**/data/kanji.json");
  await page.goto("/learn/");
  await expect(page.locator("#choose-reading")).toBeVisible();
  await page.locator("#choose-reading").click();
  await expect(page.locator("#storyCopy p").first()).toBeVisible();
  const word = page.locator("#storyCopy .kanji-link").first();
  const glyph = await word.innerText();
  await word.click();
  await expect(page.locator("#popoverGlyph")).toHaveText(glyph);
  await expect(page.locator("#popoverMeaning")).toHaveText(rows.find(row => row.한자 === glyph)["훈, 음"]);
  await page.keyboard.press("Escape");
  await page.locator("#jlptStoryLevels button").last().click();
  await expect(page.locator("#jlptStoryLevels button").last()).toHaveAttribute("aria-current", "true");
  await page.waitForLoadState("networkidle");
  expect(requests).toEqual({ catalogs: [], lookups: [], images: [] });
});

test("only opening the picture fetches its generated single-glyph address and displays the matching WebP", async ({ page }) => {
  const requests = await watchQuiz(page);
  const glyph = await startQuiz(page);
  await page.waitForLoadState("networkidle");
  expect(requests).toEqual({ catalogs: [], lookups: [], images: [] });
  const { lookup, detail } = sources(glyph);
  const addressResponse = page.waitForResponse(r => new URL(r.url()).pathname === lookup);
  const webpResponse = page.waitForResponse(r => new URL(r.url()).pathname === detail);
  await openPicture(page, glyph);
  const address = await addressResponse;
  expect(address.status()).toBe(200);
  expect(await address.json()).toBe(detail);
  const webp = await webpResponse;
  expect(webp.status()).toBe(200);
  expect(await webp.headerValue("content-type")).toContain("image/webp");
  await expectDecoded(page, detail);
  await page.locator("#imageClose").click();
  await openPicture(page, glyph);
  await expectDecoded(page, detail);
  expect(requests.lookups).toEqual([lookup]);
  expect(requests.catalogs).toEqual([]);
  expect(new Set(requests.images)).toEqual(new Set([new URL(detail, page.url()).href]));
});

for (const mode of ["close", "same glyph", "next glyph"]) {
  test(`a slow address lookup respects the viewer after ${mode}`, async ({ page }) => {
    const requests = await watchQuiz(page);
    const pending = new Map();
    await page.route(lookupPattern, route => { pending.set(new URL(route.request().url()).pathname, route); });
    const first = await startQuiz(page);
    const firstImage = sources(first);
    await openPicture(page, first);
    await expect(page.locator("#imageFallback")).toHaveText(first);
    await expect(page.locator("#imageFallback")).toBeVisible();
    await expect.poll(() => pending.has(firstImage.lookup)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator("#gamePicture")).toBeFocused();
    let current = first;
    if (mode === "next glyph") {
      await page.locator(".game-choice").first().click();
      await page.locator("#gameNext").click();
      current = await page.locator("#gameGlyph").innerText();
      expect(current).not.toBe(first);
    }
    const currentImage = sources(current);
    if (mode !== "close") await openPicture(page, current);
    if (mode === "next glyph") {
      await expect.poll(() => pending.has(currentImage.lookup)).toBe(true);
      await pending.get(currentImage.lookup).fulfill(reply(currentImage.detail));
      await expectDecoded(page, currentImage.detail);
    }
    await pending.get(firstImage.lookup).fulfill(reply(firstImage.detail));
    await page.waitForLoadState("networkidle");
    if (mode === "close") {
      await expect(page.locator("#imageOverlay")).toBeHidden();
      expect(await page.locator("#imageZoom").getAttribute("src")).toBeNull();
      expect(requests.images).toEqual([]);
    } else {
      await expectDecoded(page, currentImage.detail);
      expect(requests.images).toEqual([new URL(currentImage.detail, page.url()).href]);
    }
    expect(requests.lookups).toEqual(mode === "next glyph" ? [firstImage.lookup, currentImage.lookup] : [firstImage.lookup]);
    expect(requests.catalogs).toEqual([]);
  });
}

for (const [kind, response] of [
  ["unavailable", { status: 503, body: "" }],
  ["invalid JSON", { contentType: "application/json", body: "{" }],
  ["unexpected address", reply("/media/stroke/not-an-image.svg")],
  ["timed out", null],
]) {
  test(`a lookup that is ${kind} falls back and retries the same glyph on reopening`, async ({ page }) => {
    const requests = await watchQuiz(page);
    await page.route(googleImage, route => route.fulfill(imageStub));
    if (!response) await page.clock.install();
    const glyph = await startQuiz(page);
    const { lookup, detail, thumbnail } = sources(glyph);
    let count = 0;
    await page.route(lookupPattern, route => {
      if (++count > 1) return route.fulfill(reply(detail));
      if (response) return route.fulfill(response);
    });
    await openPicture(page, glyph);
    await expect.poll(() => count).toBe(1);
    if (!response) await page.clock.fastForward(60_000);
    await expectDecoded(page, thumbnail);
    await page.locator("#imageClose").click();
    await openPicture(page, glyph);
    await expectDecoded(page, detail);
    expect(requests.lookups).toEqual([lookup, lookup]);
    expect(requests.catalogs).toEqual([]);
    expect(requests.images).toEqual([thumbnail, new URL(detail, page.url()).href]);
  });
}

test("a glyph without an optimized address can display its backup Drive image", async ({ page }) => {
  const requests = await watchQuiz(page);
  const glyph = await startQuiz(page);
  const { lookup, thumbnail, backup } = sources(glyph);
  await page.route(lookupPattern, route => route.fulfill(reply(null)));
  await page.route(googleImage, route => route.fulfill(route.request().url() === thumbnail ? { status: 404, body: "" } : imageStub));
  await openPicture(page, glyph);
  await expectDecoded(page, backup);
  expect(requests).toEqual({ catalogs: [], lookups: [lookup], images: [thumbnail, backup] });
});

test("a missing WebP tries both existing Drive sources and keeps a usable glyph when none load", async ({ page }) => {
  const requests = await watchQuiz(page);
  const glyph = await startQuiz(page);
  const { lookup, detail, thumbnail, backup } = sources(glyph);
  const fail = route => route.fulfill({ status: 404, body: "" });
  await page.route("**/media/image1/**", fail);
  await page.route(googleImage, fail);
  await openPicture(page, glyph);
  await expect.poll(() => requests.images).toEqual([new URL(detail, page.url()).href, thumbnail, backup]);
  await expect.poll(() => page.locator("#imageZoom").evaluate(img => img.complete && img.naturalWidth === 0)).toBe(true);
  await expect(page.locator("#imageZoom")).toBeHidden();
  await expect(page.locator("#imageFallback")).toBeVisible();
  await expect(page.locator("#imageFallback")).toHaveText(glyph);
  await page.locator("#imageClose").click();
  await expect(page.locator("#gamePicture")).toBeFocused();
  await page.locator(".game-choice").first().click();
  await expect(page.locator("#gameNext")).toBeFocused();
  expect(requests.lookups).toEqual([lookup]);
  expect(requests.catalogs).toEqual([]);
});
