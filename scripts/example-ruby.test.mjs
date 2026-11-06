import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRubyResolver } from "../src/example-ruby.js";
import { dictionaryRuby, reviewedRuby } from "../src/example-ruby-data.js";

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
    ["金持ち", "かねもち", ["金:かね", "持:も", "ち"]],
    ["気持ち", "きもち", ["気:き", "持:も", "ち"]],
    ["先輩", "せんぱい", ["先:せん", "輩:ぱい"]],
    ["一般", "いっぱん", ["一:いっ", "般:ぱん"]],
    ["出発", "しゅっぱつ", ["出:しゅっ", "発:ぱつ"]],
    ["人々", "ひとびと", ["人:ひと", "々:びと"]],
    ["津々浦々", "つつうらうら", ["津:つ", "々:つ", "浦:うら", "々:うら"]],
    ["飼い犬", "かいいぬ", ["飼:か", "い", "犬:いぬ"]],
    ["天皇", "てんのう", ["天:てん", "皇:のう"]],
    ["日本刀", "にほんとう", ["日:に", "本:ほん", "刀:とう"]],
  ]) assert.deepEqual(resolve(word, reading).map(p => p.text + (p.reading ? `:${p.reading}` : "")), expected);
});

test("reviewed readings cover missing dictionary rows without changing the supplied kana", () => {
  for (const [word, reading, expected] of [
    ["口腔", "こうくう", ["口:こう", "腔:くう"]],
    ["林檎", "りんご", ["林:りん", "檎:ご"]],
    ["橋梁", "きょうりょう", ["橋:きょう", "梁:りょう"]],
    ["切磋琢磨", "せっさたくま", ["切:せっ", "磋:さ", "琢:たく", "磨:ま"]],
    ["味噌汁", "みそしる", ["味:み", "噌:そ", "汁:しる"]],
    ["拉麺", "ラーメン", ["拉:ラー", "麺:メン"]],
    ["拉麺", "らーめん", ["拉:らー", "麺:めん"]],
    ["辣油", "ラーゆ", ["辣:ラー", "油:ゆ"]],
    ["麻雀", "マージャン", ["麻:マー", "雀:ジャン"]],
    ["神奈川", "かながわ", ["神:か", "奈:な", "川:がわ"]],
  ]) assert.deepEqual(resolve(word, reading).map(p => p.text + (p.reading ? `:${p.reading}` : "")), expected);
});

test("irregular roots stay together while other kanji and written kana are separate", () => {
  for (const [word, reading, expected] of [
    ["百合", "ゆり", ["百合:ゆり"]],
    ["秋刀魚", "さんま", ["秋刀魚:さんま"]],
    ["一人旅", "ひとりたび", ["一人:ひとり", "旅:たび"]],
    ["虫眼鏡", "むしめがね", ["虫:むし", "眼鏡:めがね"]],
    ["叔父さん", "おじさん", ["叔父:おじ", "さん"]],
    ["可愛い", "かわいい", ["可愛:かわい", "い"]],
    ["懐中時計", "かいちゅうどけい", ["懐:かい", "中:ちゅう", "時計:どけい"]],
    // These whole expressions are not in the static lookup table.
    ["大人用", "おとなよう", ["大人:おとな", "用:よう"]],
    ["今日だけ", "きょうだけ", ["今日:きょう", "だ", "け"]],
  ]) assert.deepEqual(resolve(word, reading).map(p => p.text + (p.reading ? `:${p.reading}` : "")), expected);
});

test("new examples provide exact stems, while whole-word special readings do not leak into kanji", () => {
  const sample = createRubyResolver([
    { "한자": "持", "발음": "㉧ じ | ㉭ もつ", "예시단어": "持つ(もつ) 가지다" },
    { "한자": "金", "발음": "㉭ かね" },
    { "한자": "甲", "발음": "㉧ こう | ㉫ あ" },
    { "한자": "乙", "발음": "㉧ おつ、いう" },
  ]);
  assert.deepEqual(sample("金持ち", "かねもち"), [{ text: "金", reading: "かね" }, { text: "持", reading: "も" }, { text: "ち" }]);
  assert.deepEqual(sample("甲乙", "あいう"), [{ text: "甲乙", reading: "あいう" }]);
});

test("irregular, unknown and ambiguous readings retain the complete supplied reading", () => {
  assert.deepEqual(resolve("今日", "きょう"), [{ text: "今日", reading: "きょう" }]);
  assert.deepEqual(resolve("未知", "でたらめ"), [{ text: "未知", reading: "でたらめ" }]);
  const ambiguous = createRubyResolver([{ "한자": "甲", "발음": "あ、あい" }, { "한자": "乙", "발음": "いう、う" }]);
  assert.deepEqual(ambiguous("甲乙", "あいう"), [{ text: "甲乙", reading: "あいう" }]);
  // A matching spelling must not reuse a lookup for a different pronunciation.
  assert.deepEqual(resolve("口腔", "でたらめ"), [{ text: "口腔", reading: "でたらめ" }]);
});

test("unresolvable repeated prefixes do not require an exponential search", () => {
  const sample = createRubyResolver([{ "한자": "甲", "발음": "あ、ああ" }]);
  const word = "甲".repeat(28), reading = "あ".repeat(42) + "い";
  assert.deepEqual(sample(word, reading), [{ text: word, reading }]);
});

test("reviewed data has unique keys and preserves both spelling and complete reading", () => {
  const keys = new Set(), hiragana = value => value.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  for (const [word, reading, parts] of [...dictionaryRuby, ...reviewedRuby]) {
    const key = `${word}\0${reading}`;
    assert.ok(!keys.has(key), `duplicate ruby entry: ${word} (${reading})`);
    keys.add(key);
    assert.equal(parts.map(p => p[0]).join(""), word);
    assert.equal(hiragana(parts.map(p => p[1] || p[0]).join("")), reading);
    assert.ok(parts.every(p => p[0] && (p.length === 1 || p[1])));
  }
});

test("all example ruby retains every source character and the complete pronunciation", () => {
  for (const row of rows) for (const match of row["예시단어"].matchAll(/^([^()（）\n]+)[(（]([ぁ-ゖァ-ヶー]+)[)）]/gmu)) {
    const parts = resolve(match[1], match[2]);
    assert.equal(parts.map(p => p.text).join(""), match[1]);
    const hiragana = value => value.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
    assert.equal(hiragana(parts.map(p => p.reading || p.text).join("")), hiragana(match[2]));
  }
});
