import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readAuthenticatedSheets, sheetValuesToPayload } from "./sheets-source.mjs";

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

test("word conversion reads only the kanji sheet and keeps physical row numbers", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
  const credentials = JSON.stringify({ client_email: "test@example.invalid", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
  const request = async url => {
    const endpoint = new URL(url);
    if (endpoint.pathname === "/token") return Response.json({ access_token: "local-test-only" });
    if (endpoint.pathname.endsWith("batchGet")) {
      assert.deepEqual(endpoint.searchParams.getAll("ranges"), ["'한자: 도감 DB'!A1:U3"]);
      return Response.json({ valueRanges: [{ values: [headers, [], [1, 2, 3, "学"]] }] });
    }
    return Response.json({ sheets: [{ properties: { title: "한자: 도감 DB", gridProperties: { rowCount: 3, columnCount: 21 } } }] });
  };
  const result = await readAuthenticatedSheets({ credentials, spreadsheetId: "fixture", request, kanjiOnly: true });
  assert.equal(result.kanji[0]._row, 3);
  assert.equal(result.kanji[0]["한자"], "学");
  assert.equal(result.stories, undefined);
});
