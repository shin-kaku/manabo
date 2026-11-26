import { test, expect } from "@playwright/test";

for (const glyph of ["木", "難", "𠂢"]) {
  test(`the ${glyph} detail page opens its own Starpath in a new tab`, async ({ page }) => {
    await page.goto(`/kanji/${encodeURIComponent(glyph)}/`);
    const section = page.locator(".entry-related");
    await expect(section.getByRole("heading", { name: "관련 한자" })).toBeVisible();
    await expect(section.locator("[data-study-kanji]")).toHaveCount(0);
    await expect(section).toContainText(`${glyph}에서 시작해 같은 부수로 이어진 한자들을 하나씩 따라가 보세요. 한 글자를 알면 다음 글자가 보여요.`);
    await expect(section.locator(".entry-starpath-guide")).toHaveText("홈페이지 상단, [한자 학습] - [한자 별길]로 바로 찾아갈 수 있어요.");
    const link = section.getByRole("link", { name: `${glyph}의 별자리 펼쳐 보기 (새 창)` });
    await expect(link).toHaveAttribute("target", "_blank");
    const [game] = await Promise.all([page.waitForEvent("popup"), link.click()]);
    await expect(game.locator("#map .cur")).toHaveAttribute("data-k", glyph);
    await expect(page.locator("[data-entry-kanji]")).toHaveAttribute("data-entry-kanji", glyph);
  });
}

test("component links remain on the map and kanji cards show their original explanation", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const response = await page.request.get("/data/kanji.json");
  await expect(response).toBeOK();
  const entries = await response.json();
  await page.goto("/learn/");
  await page.locator('[data-analytics-choice="denied"]').click();
  for (const [part, glyph, components] of [
    ["灬", "魚", ["⺈", "田", "灬"]],
    ["黒", "黙", ["黒"]],
    ["氵", "汁", ["十", "氵"]],
    ["𠂉", "年", ["𠂉"]],
  ]) {
    await page.goto("/learn/game/#" + encodeURIComponent(part));
    await page.locator(`#map .rel[data-k="${glyph}"]`).click();
    for (const component of components) {
      await expect(page.locator(`#map .part[data-k="${component}"]`)).toBeVisible();
    }
    await page.locator(`#map .cur[data-k="${glyph}"]`).click();
    const entry = entries.find(row => row["한자"] === glyph);
    await expect(page.locator("#explanation")).toHaveText(entry["풀이"]);
    await expect(page.locator("#reveal details")).toHaveCount(0);
  }
  await page.goto("/learn/game/#" + encodeURIComponent("𠂉"));
  await page.locator('#map .cur[data-k="𠂉"]').click();
  await expect(page.locator("#meaning")).toHaveText("부품");
  await expect(page.locator("#reveal details")).toHaveCount(0);
});

for (const width of [390, 1280]) {
  test(`the published study menu opens a working Starpath game at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/learn/");
    await page.getByRole("link", { name: "한자 별길" }).click();
    await expect(page).toHaveURL(/\/learn\/game\/$/);
    const current = page.locator("#map .n.cur");
    await expect(current).toBeVisible();
    await current.click();
    await expect(page.locator("#reveal")).toBeVisible();
    await expect(page.locator("#glyph")).toHaveText("門");
    await page.locator("#close").click();
    await expect(page.locator("#reveal")).toBeHidden();
    await page.locator("#star-query").fill("木");
    await page.locator("#star-matches li").first().click();
    await expect(page.locator("#map-location")).toHaveText("木");
    await page.getByRole("link", { name: "한자 학습으로" }).click();
    await expect(page).toHaveURL(/\/learn\/$/);
    expect(errors).toEqual([]);
  });
}

for (const viewport of [{ width: 320, height: 550 }, { width: 390, height: 620 }, { width: 693, height: 300 }, { width: 844, height: 390 }]) {
  test(`short ${viewport.width}×${viewport.height} viewport keeps the map usable and footer separate`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem("manabo-analytics-consent-v1", JSON.stringify({ choice: "denied", at: Date.now() })));
    await page.goto("/learn/game/");
    const map = page.locator("#pick");
    const current = page.locator("#map .n.cur");
    await expect(current).toBeVisible();
    const [mapBox, backBox, footerBox] = await Promise.all([
      map.boundingBox(), page.locator("#choiceBack").boundingBox(), page.locator(".site-footer").boundingBox(),
    ]);
    expect(mapBox.height).toBeGreaterThanOrEqual(300);
    expect(backBox.y + backBox.height).toBeLessThanOrEqual(mapBox.y + 1);
    expect(footerBox.y).toBeGreaterThanOrEqual(mapBox.y + mapBox.height);
    await expect(page.locator(".game-footer-full")).toBeHidden();
    const footerMenu = page.locator(".game-footer-menu");
    await expect(footerMenu).toBeVisible();
    await current.click();
    await expect(page.locator("#reveal")).toBeVisible();
    await expect(page.locator("#glyph")).toHaveText("門");
    await page.locator("#close").click();
    await expect(page.locator("#reveal")).toBeHidden();
    await page.locator("#map .rel").first().click();
    await expect(page.locator("#map-location")).not.toHaveText("門");
    await page.locator("#star-query").fill("木");
    await page.locator("#star-matches li").first().click();
    await expect(page.locator("#map-location")).toHaveText("木");
    await footerMenu.locator("summary").click();
    await expect(footerMenu.getByRole("link", { name: "저작권 및 이용 안내" })).toBeVisible();
  });
}

test("compact footer does not depend on game JavaScript finishing", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 620 } });
  const page = await context.newPage();
  await page.goto("/learn/game/");
  await expect(page.locator(".game-footer-full")).toBeHidden();
  const footer = page.locator(".game-footer-menu");
  await expect(footer).toBeVisible();
  await footer.locator("summary").click();
  await expect(footer.getByRole("link", { name: "문의하기" })).toBeVisible();
  await context.close();
});

test("cards have no disclosures at any width and only desktop enables the hologram", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto("/learn/game/");
  await page.locator("#map .cur").click();
  const card = page.locator("#card");
  const disclosures = page.locator("#reveal details");
  await expect(page.locator("#reveal")).toHaveAttribute("data-phase", "open");
  await expect(disclosures).toHaveCount(0);
  await expect(page.locator("#detail-link")).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.locator("#landing").dispatchEvent("pointermove", { clientX: 500, clientY: 400, pointerType: "mouse" });
  await expect(card).toHaveAttribute("data-active", "");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(disclosures).toHaveCount(0);
  await expect(card).not.toHaveAttribute("data-active", "");
  await page.locator("#landing").dispatchEvent("pointerdown", { clientX: 150, clientY: 400, pointerType: "touch" });
  await expect(card).not.toHaveAttribute("data-active", "");

  await page.setViewportSize({ width: 1280, height: 844 });
  await expect(disclosures).toHaveCount(0);
});

test("a phone in landscape has no card disclosures or hologram interaction", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/learn/game/");
  await page.locator("#map .cur").click();
  await expect(page.locator("#reveal")).toHaveAttribute("data-phase", "open");
  await expect(page.locator("#reveal details")).toHaveCount(0);
  await page.locator("#landing").dispatchEvent("pointerdown", { clientX: 400, clientY: 150, pointerType: "touch" });
  await expect(page.locator("#card")).not.toHaveAttribute("data-active", "");
  await context.close();
});
