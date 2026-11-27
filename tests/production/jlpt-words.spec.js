import { test, expect } from "@playwright/test";

test("the static study gallery opens the word quiz and serves every bundled level locally", async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.goto("/learn/");
  const card = page.locator(".quiz-shelf").getByRole("link", { name: "단어", exact: true });
  const cover = card.locator("img");
  await cover.scrollIntoViewIfNeeded();
  await expect.poll(() => cover.evaluate(img => img.naturalWidth)).toBe(960);
  await card.click();
  const counts = await (await page.request.get("/data/jlpt-words/counts.json")).json();
  const received = new Set();
  page.on("response", response => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith("/data/jlpt-words/") && response.ok()) received.add(path.split("/").pop());
  });
  for (const [level, count] of Object.entries(counts)) {
    const tile = page.locator(`.vocab-levels label:has(input[value="${level}"])`);
    await expect(tile).toContainText(count.toLocaleString("ko-KR") + "단어");
    if (level !== "N5") await tile.click();
  }
  await page.locator('input[value="reading"]').uncheck();
  await page.locator('input[value="spelling"]').check();
  await page.locator("#vocab-start").click();
  await expect(page.locator("#exam-level")).toHaveText(/^N[1-5]$/);
  const level = await page.locator("#exam-level").innerText();
  await expect(page.locator("#exam-section")).toHaveText(["N5", "N4"].includes(level) ? "もんだい1" : "問題1");
  await expect(page.locator("#exam-instruction")).toContainText(level === "N5" ? "かんじで 書く" : level === "N4" ? "漢字で 書く" : "漢字で書く");
  await expect(page.locator("#exam-prompt")).not.toContainText(/[(（]\d+[)）]/);
  await expect(page.locator("#exam-meaning")).not.toBeEmpty();
  await expect(page.locator(".exam-answer")).toHaveCount(4);
  expect([...received].sort()).toEqual(["N1.json", "N2.json", "N3.json", "N4.json", "N5.json", "spelling.json"]);
});
