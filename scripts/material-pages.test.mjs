import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { materialPages } from "./material-pages.mjs";

const data = Object.fromEntries(["kanji", "stories"].map((name) => [name,
  JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url), "utf8")),
]));
const pages = materialPages(data);
const plain = (html) => html.replace(/<[^>]*>/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

test("every source kanji and its full explanation and words survive publication exactly once", () => {
  const published = pages.filter((page) => page.path.startsWith("materials/kanji/"));
  assert.equal(published.reduce((count, page) => count + (page.body.match(/class="material-entry"/g) || []).length, 0), data.kanji.length);
  for (const row of data.kanji) {
    const page = published.find((page) => page.title === `${row["학년"]} 한자 풀이와 단어`);
    const article = page.body.split(`<section class="material-entry" id="char-${row["한자"]}">`)[1]?.split("</section>")[0];
    assert.ok(article, row["한자"]);
    for (const key of ["훈, 음", "풀이"]) {
      assert.ok(plain(article).includes(row[key].replace(/\s+/g, " ").trim()), `${row["한자"]}: ${key}`);
    }
    assert.doesNotMatch(article, /[㉧㉭㉫]|>無し</);
    for (const reading of row["발음"].split(/\s*\|\s*/)) {
      const value = reading.replace(/^[㉧㉭㉫]\s*/, "").trim();
      if (value && value !== "無し") assert.ok(plain(article).includes(value), row["한자"]);
    }
    const examples = Array.from(article.matchAll(/<li>([^]*?)<\/li>/g), ([, item]) => {
      const word = item.match(/^<span lang="ja">([^]*?)<\/span> ([^]*)$/);
      if (!word) return plain(item);
      const [, annotated, gloss] = word;
      const ruby = /<ruby>([^<]+)<rp>\(<\/rp><rt>([^<]+)<\/rt><rp>\)<\/rp><\/ruby>/g;
      return `${annotated.replace(ruby, "$1")}(${annotated.replace(ruby, "$2")}) ${plain(gloss)}`;
    });
    const sourceExamples = row["예시단어"].split("\n").map((line) => line.trim())
      .filter((line) => line && !["-", "㉧", "㉭", "㉫"].includes(line))
      .map((line) => line.replace(/^([^()（）]+)[(（]([ぁ-ゖァ-ヶー]+)[)）]\s*/u, "$1($2) ").replace(/\s+/g, " "));
    assert.deepEqual(examples, sourceExamples, row["한자"]);
  }
});

test("all reading versions retain their entire source text and have distinct reachable URLs", () => {
  const hub = pages.find((page) => page.path === "materials");
  assert.equal(new Set(pages.map((page) => page.path)).size, pages.length);
  for (const story of data.stories) {
    const page = pages.find((page) => page.path === `materials/reading/${story.id}`);
    assert.ok(hub.body.includes(`href="/${page.path}/"`));
    for (const version of story.versions) assert.ok(plain(page.body).includes(version.body.replace(/\s+/g, " ").trim()), story.id);
    assert.ok(page.body.includes(`/reading/?story=${story.id}`));
  }
});

test("source strings cannot turn into scripts, attributes or arbitrary output paths", () => {
  const story = { ...data.stories[0], title: '<img src=x onerror="alert(1)">', versions: [{ label: "V1", body: "<script>alert(1)</script> & 学" }] };
  const result = materialPages({ kanji: data.kanji.slice(0, 1), stories: [story] });
  for (const page of result) {
    assert.ok(!page.body.includes("<script>"));
    assert.ok(!page.body.includes("<img src=x"));
  }
  assert.ok(result.at(-1).body.includes("&lt;script&gt;"));
  for (const id of ["../escape", "a/b", 'a" onclick="x']) {
    assert.throws(() => materialPages({ ...data, stories: [{ ...story, id }] }), /ID/);
  }
});

test("empty, duplicate and unmapped material fails instead of silently dropping content", () => {
  assert.throws(() => materialPages({ ...data, kanji: [] }), /비어/);
  assert.throws(() => materialPages({ ...data, stories: [data.stories[0], data.stories[0]] }), /ID/);
  assert.throws(() => materialPages({ ...data, kanji: [{ ...data.kanji[0], 학년: "새 범위" }] }), /학년/);
  assert.throws(() => materialPages({ ...data, stories: [{ ...data.stories[0], versions: [] }] }), /본문/);
});
