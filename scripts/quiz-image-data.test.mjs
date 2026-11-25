import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeKanjiListData } from "./kanji-list-data.mjs";

test("quiz image lookups follow media updates, include supplementary glyphs and drop removed rows", t => {
  const dir = mkdtempSync(join(tmpdir(), "manabo-quiz-images-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const rows = ["共", "𠮷", "森"].map((glyph, index) => ({
    한자: glyph, "이미지 1": `https://drive.google.com/file/d/source-${index}/view`,
  }));
  const first = `/media/image1/${"a".repeat(64)}.webp`;
  const next = `/media/image1/${"b".repeat(64)}.webp`;
  const images = { "source-0": { detail: { url: first } }, "source-2": { detail: { url: "https://example.org/image.webp" } } };
  function generate() {
    writeFileSync(join(dir, "kanji.json"), JSON.stringify(rows));
    writeFileSync(join(dir, "media.json"), JSON.stringify({ schema: 1, items: { image1: images } }));
    writeKanjiListData(dir);
  }
  const lookup = filename => JSON.parse(readFileSync(join(dir, "quiz-image", filename), "utf8"));
  generate();
  assert.equal(lookup("5171.json"), first);
  assert.equal(lookup("20bb7.json"), null);
  assert.equal(lookup("68ee.json"), null);
  images["source-0"].detail.url = next;
  images["source-1"] = { detail: { url: first } };
  rows.pop();
  generate();
  assert.equal(lookup("5171.json"), next);
  assert.equal(lookup("20bb7.json"), first);
  assert.deepEqual(readdirSync(join(dir, "quiz-image")).sort(), ["20bb7.json", "5171.json"]);
});
