import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { convertWords, wordLevel } from "./jlpt-words.mjs";
import {
  levels, makeSession, normalizeKana, readingDistractors, retryQuestions, spellingDistractors, spellingIndex,
} from "../src/jlpt-quiz.js";

const data = name => JSON.parse(readFileSync(new URL("../public/data/jlpt-words/" + name + ".json", import.meta.url)));
const dictionary = spellingIndex(data("spelling"));
const words = Object.fromEntries(levels.map(level => [level, data(level)]));
function seeded(n) {
  return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 2 ** 32; };
}

test("a word takes its hardest kanji level, ignoring kana and 々 and rejecting missing ranks", () => {
  const ranks = new Map([["学", { level: "N5" }], ["宮", { level: "N2" }], ["吊", {}]]);
  assert.equal(wordLevel("学々ぶ", ranks), "N5");
  assert.equal(wordLevel("学宮", ranks), "N2");
  for (const word of ["がっこう", "々", "学吊り", "学噌"]) assert.equal(wordLevel(word, ranks), null);
});

test("sheet conversion merges source rows, tracks alternate readings and reports the original row and text", () => {
  const rows = [
    { _row: 9, 한자: "学", 등급: "JLPT N5", "훈, 음": "배울 학",
      "예시 단어": "㉧\n学校(がっこう) 학교\n-\n㉭\n学ぶ(まなぶ) 배우다\n  형식 오류  \n学噌(がくそ) 예외" },
    { _row: 18, 한자: "校", 등급: "JLPT N5", "훈, 음": "학교 교", "예시 단어": "㉧\n学校（がっこう） 학교" },
    { _row: 35, 한자: "台", 등급: "JLPT N4", "훈, 음": "대 대", "음, 훈": "㉧ だい、たい",
      "예시 단어": "㉧\n台(だい) 대\n-\n㉫\n台(うてな) 누대\n-\n台学(たいがく) 예시" },
    { _row: 89, 한자: "耳", 등급: "JLPT N5", "예시 단어": "" },
  ];
  const logs = [];
  const { eligible, spellings } = convertWords(rows, item => logs.push(item));
  const school = eligible.N5.find(w => w.word === "学校");
  assert.deepEqual(school, { word: "学校", reading: "がっこう", meaning: "학교", level: "N5", type: "음",
    kanji: [{ k: "学", level: "N5", hunEum: "배울 학" }, { k: "校", level: "N5", hunEum: "학교 교" }],
    sourceKanji: ["学", "校"], sentence: null });
  assert.equal(eligible.N5.find(w => w.word === "学ぶ").type, "훈");
  assert.equal(eligible.N4.find(w => w.word === "台学").type, "특수");
  assert.deepEqual(new Set(eligible.N4.find(w => w.word === "台").otherReadings), new Set(["うてな", "たい"]));
  assert.deepEqual(logs.find(l => l.reason === "예시 형식 확인"),
    { reason: "예시 형식 확인", row: 9, kanji: "学", line: "  형식 오류  " });
  assert.deepEqual(logs.filter(l => l.row === 89).map(l => l.reason), ["예시 단어 없음", "순수 N5 예시 없음"]);
  assert.ok(logs.some(l => l.reason === "특수 읽기 구분 표식" && l.row === 35));
  assert.ok(spellings.includes("学噌") && !eligible.N5.some(w => w.word === "学噌"));
});

test("quiz ruby preserves the written word and its complete reading", () => {
  const find = word => words.N5.find(entry => entry.word === word);
  assert.deepEqual(find("学校").ruby, [{ text: "学", reading: "がっ" }, { text: "校", reading: "こう" }]);
  assert.deepEqual(find("食べる").ruby, [{ text: "食", reading: "た" }, { text: "べ" }, { text: "る" }]);
  for (const entry of Object.values(words).flat()) {
    if (!entry.ruby) continue;
    assert.equal(entry.ruby.map(part => part.text).join(""), entry.word);
    assert.equal(normalizeKana(entry.ruby.map(part => part.reading ?? part.text).join("")), normalizeKana(entry.reading), entry.word);
  }
});

test("reading distractors use different sound traps and fall back to same-level words", () => {
  const school = words.N5.find(w => w.word === "学校");
  const schoolTraps = readingDistractors(school, words.N5, seeded(3));
  assert.deepEqual(new Set(schoolTraps.map(x => x.trap)), new Set(["촉음", "장음", "탁음"]));
  const glides = { word: "京", reading: "きょう", level: "N1" };
  const observed = new Set();
  for (let i = 1; i <= 20; i++) for (const option of readingDistractors(glides, [], seeded(i))) observed.add(option.trap);
  assert.ok(observed.has("요음"));
  const item = { word: "亜", reading: "ア", otherReadings: ["い"], level: "N1" };
  const peers = ["い", "な", "に", "む", "ね"].map((reading, i) => ({ word: "他" + i, level: "N1", reading }));
  const fallback = readingDistractors(item, [...peers, { word: "他級", level: "N5", reading: "み" }], seeded(1));
  assert.equal(fallback.length, 3);
  assert.ok(fallback.every(o => o.trap === "다른 단어" && ["な", "に", "む", "ね"].includes(o.text)));
});

test("every eligible word has three distinct distractors in both directions, at a suitable level", () => {
  const random = seeded(20261127), counts = data("counts"), used = new Set();
  for (const level of levels) {
    assert.equal(words[level].length, counts[level]);
    for (const entry of words[level]) {
      assert.ok(!used.has(entry.word), entry.word);
      used.add(entry.word);
      assert.ok(entry.kanji.every(k => levels.indexOf(k.level) <= levels.indexOf(level)));
      assert.ok(entry.kanji.some(k => k.level === level));
      const forbidden = new Set([entry.reading, ...(entry.otherReadings ?? [])].map(normalizeKana));
      if (Array.from(entry.word).length === 1) {
        for (const kana of dictionary.glyphs[entry.word].readings) forbidden.add(kana);
      }
      const reading = readingDistractors(entry, words[level], random);
      assert.equal(new Set(reading.map(o => o.text)).size, 3, entry.word);
      assert.ok(reading.every(o => o.trap && !forbidden.has(o.text)), entry.word);
      const spelling = spellingDistractors(entry, dictionary, random);
      assert.equal(new Set(spelling.map(o => o.text)).size, 3, entry.word);
      const original = Array.from(entry.word);
      for (const { text, trap } of spelling) {
        assert.ok(trap && !dictionary.knownWords.has(text), entry.word + " → " + text);
        const chars = Array.from(text);
        assert.equal(chars.length, original.length);
        const changes = chars.filter((char, i) => char !== original[i]);
        assert.equal(changes.length, 1, text);
        const alternativeLevel = dictionary.glyphs[changes[0]]?.level;
        assert.ok(alternativeLevel && levels.indexOf(alternativeLevel) <= levels.indexOf(level), text);
      }
    }
  }
});

test("sessions cap at available words, split odd counts with reading first, and preserve questions on retry", () => {
  const selection = { modes: ["reading", "spelling"], levels: ["N5"], count: 11 };
  const pool = [...words.N5.slice(0, 9), ...words.N1.slice(0, 10)];
  const session = makeSession(pool, selection, dictionary, seeded(40));
  assert.deepEqual(session.map(q => q.mode), [...Array(5).fill("reading"), ...Array(4).fill("spelling")]);
  assert.equal(new Set(session.map(q => q.entry.word)).size, 9);
  assert.ok(session.every(q => q.entry.level === "N5" && q.options.length === 4));
  const missed = [session[0], session[3], session[7]];
  const retry = retryQuestions(missed, seeded(53));
  const keys = qs => qs.map(q => q.mode + q.entry.word).sort();
  assert.deepEqual(keys(retry), keys(missed));
  for (const q of [...session, ...retry]) {
    assert.equal(q.options.filter(o => o.trap === null).length, 1);
    assert.equal(q.options[q.correct].text, q.mode === "reading" ? normalizeKana(q.entry.reading) : q.entry.word);
  }
  assert.ok(new Set(session.map(q => q.correct)).size > 1);
});
