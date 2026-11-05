import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRubyResolver } from "../src/example-ruby.js";

const rows = JSON.parse(await readFile(new URL("../public/data/kanji.json", import.meta.url), "utf8"));
const resolve = createRubyResolver(rows);

test("example ruby aligns individual kanji, okurigana and compound sound changes", () => {
  for (const [word, reading, expected] of [
    ["文化", "ぶんか", ["文:ぶん", "化:か"]],
    ["自動車", "じどうしゃ", ["自:じ", "動:どう", "車:しゃ"]],
    ["学校", "がっこう", ["学:がっ", "校:こう"]],
    ["食べる", "たべる", ["食:た", "べ", "る"]],
    ["見る", "みる", ["見:み", "る"]],
    ["見える", "みえる", ["見:み", "え", "る"]],
    ["手紙", "てがみ", ["手:て", "紙:がみ"]],
  ]) assert.deepEqual(resolve(word, reading).map(p => p.text + (p.reading ? `:${p.reading}` : "")), expected);
});

test("irregular, unknown and ambiguous readings retain the complete supplied reading", () => {
  assert.deepEqual(resolve("今日", "きょう"), [{ text: "今日", reading: "きょう" }]);
  assert.deepEqual(resolve("未知", "でたらめ"), [{ text: "未知", reading: "でたらめ" }]);
  const ambiguous = createRubyResolver([{ "한자": "甲", "발음": "あ、あい" }, { "한자": "乙", "발음": "いう、う" }]);
  assert.deepEqual(ambiguous("甲乙", "あいう"), [{ text: "甲乙", reading: "あいう" }]);
});

test("all example ruby retains every source character and the complete pronunciation", () => {
  for (const row of rows) for (const match of row["예시단어"].matchAll(/^([^()（）\n]+)[(（]([ぁ-ゖァ-ヶー]+)[)）]/gmu)) {
    const parts = resolve(match[1], match[2]);
    assert.equal(parts.map(p => p.text).join(""), match[1]);
    const hiragana = value => value.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
    assert.equal(hiragana(parts.map(p => p.reading || p.text).join("")), hiragana(match[2]));
  }
});
