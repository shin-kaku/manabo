import test from "node:test";
import assert from "node:assert/strict";
import { sheetValuesToPayload } from "./sheets-source.mjs";

const headers = ["이미지 번호","암기순","문부성","한자","훈, 음","훈","음","학년","등급","획","획순","마나보 제안 연관 한자","풀이","수정 내용","이미지(TCG)","이미지(ML)","획(인쇄용)","획(모션)","획(g2)","음, 훈","예시 단어"];
const stories = [
  [...Array(9).fill("JLPT"), ...Array(10).fill("학년 별")],
  Array.from({ length: 19 }, (_, i) => `level ${i}`),
  Array.from({ length: 19 }, (_, i) => `title ${i}`),
  Array.from({ length: 19 }, (_, i) => ` body ${i} \n`),
];
test("authenticated sheet mapping preserves data types and matches the published story shape", () => {
  const payload = sheetValuesToPayload([headers, [1, 2, 3, "木", " 나무 목 "]], stories);
  assert.equal(payload.kanji[0]["암기순"], 2);
  assert.equal(payload.kanji[0]["한자"], "木");
  assert.equal(payload.kanji[0]["훈, 음"], " 나무 목 ");
  assert.equal(payload.kanji[0]["이미지(ML)"], "");
  assert.deepEqual(payload.stories[9], { id: "story-10", category: "학년별", level: "level 9", title: "title 9", versions: [{ label: "V1", body: "body 9" }] });
});
test("changed source structures fail instead of silently dropping data", () => {
  assert.throws(() => sheetValuesToPayload([headers.slice(1)], stories), /열 구조/);
  assert.throws(() => sheetValuesToPayload([headers], [...stories, ["추가 데이터"]]), /새 행/);
  assert.throws(() => sheetValuesToPayload([headers], stories.map(row => row.slice(0, 18))), /열 구조/);
});
