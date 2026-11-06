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

test("each grade and JLPT range links every member directly to its scoped catalog card", () => {
  const hub = pages.find((page) => page.path === "materials");
  const groups = pages.filter((page) => page.path.startsWith("materials/kanji/"));
  assert.equal(groups.length, 16);
  for (const group of groups) {
    assert.ok(hub.body.includes(`href="/${group.path}/"`), group.path);
    const name = group.title.replace(/ 한자 카드$/, "");
    const level = name.startsWith("JLPT ");
    const expected = data.kanji.filter((row) => row[level ? "등급" : "학년"] === name)
      .sort((a, b) => a["문부성"] - b["문부성"]).map((row) => row["한자"]);
    assert.ok(expected.length > 0, name);
    const cards = Array.from(group.body.matchAll(/<a id="char-([^"]+)" href="([^"]+)" lang="ja">([^<]+)<\/a>/g), ([, id, href, character]) => {
      assert.equal(id, character);
      const target = new URL(href, "https://kanjimanabo.com");
      assert.equal(target.pathname, "/kanji/");
      assert.deepEqual([...target.searchParams], [[level ? "jlpt" : "grade", name]]);
      assert.equal(decodeURIComponent(target.hash), `#kanji=${character}`);
      return character;
    });
    assert.deepEqual(cards, expected, name);
    assert.doesNotMatch(group.body, /material-entry|<dl>|href="#char-/);
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
