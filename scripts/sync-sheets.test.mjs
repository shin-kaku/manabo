import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareKanji } from "./sync-sheets.mjs";

const kanjiFile = new URL("../public/data/kanji.json", import.meta.url);
const rows = JSON.parse(await readFile(kanjiFile, "utf8"));
const stories = [{ id: "test", category: "grade", level: "1", title: "test", versions: [{ label: "test", body: "test" }] }];

test("published catalog and reference entries remain valid; private fields are excluded", () => {
  const input = rows.map((row) => ({ ...row, internalNote: "private" }));
  const prepared = prepareKanji(input, rows.length);
  assert.equal(prepared.length, rows.length);
  assert.ok(prepared.some((row) => row["학년"] === "참고" && row["등급"] === ""));
  assert.ok(prepared.every((row) => !Object.hasOwn(row, "internalNote")));
});

test("missing or incorrectly typed required fields are rejected", () => {
  for (const field of ["한자", "훈, 음", "훈", "음", "학년", "등급", "풀이", "이미지 1", "암기순", "문부성", "획"]) {
    for (const invalid of [undefined, null, {}, [], true, ""]) {
      const input = rows.slice();
      input[0] = { ...rows[0], [field]: invalid };
      assert.throws(() => prepareKanji(input), Error, `${field}: ${JSON.stringify(invalid)}`);
    }
  }
});

test("invalid values and duplicate characters are rejected", () => {
  for (const [field, invalid] of [
    ["한자", "ABC"], ["한자", "漢字"], ["학년", "초등학교 7학년"],
    ["등급", "JLPT N6"], ["이미지 1", "not a URL"],
    ["이미지 1", "javascript:alert(1)"], ["이미지 1", "file:///image.png"],
    ["획", -1], ["획", 1.5], ["획", "7"], ["암기순", 0],
  ]) {
    const input = rows.slice();
    input[0] = { ...rows[0], [field]: invalid };
    assert.throws(() => prepareKanji(input), Error, `${field}: ${invalid}`);
  }
  const duplicate = rows.slice();
  duplicate[1] = { ...rows[1], 한자: ` ${rows[0]["한자"]} ` };
  assert.throws(() => prepareKanji(duplicate), /중복/);
});

test("truncation is rejected using both the absolute minimum and previous count", () => {
  for (const input of [undefined, {}, [], rows.slice(0, 1), rows.slice(0, 1999)]) {
    assert.throws(() => prepareKanji(input), /최소/);
  }
  assert.equal(prepareKanji(rows.slice(0, 2000)).length, 2000);
  const previousAtBoundary = Math.floor(rows.length / 0.9);
  assert.equal(prepareKanji(rows, previousAtBoundary).length, rows.length);
  assert.throws(() => prepareKanji(rows, previousAtBoundary + 1), /10%/);
});

async function fixture(t, incoming) {
  const root = await mkdtemp(join(tmpdir(), "manabo-sync-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const script = join(root, "scripts/sync-sheets.mjs");
  const data = join(root, "public/data");
  await mkdir(join(root, "scripts"), { recursive: true });
  await mkdir(data, { recursive: true });
  await copyFile(new URL("./sync-sheets.mjs", import.meta.url), script);
  await copyFile(kanjiFile, join(data, "kanji.json"));
  await writeFile(join(data, "stories.json"), `${JSON.stringify(stories)}\n`);
  await writeFile(join(root, "payload.json"), JSON.stringify({ ok: true, kanji: incoming, stories }));
  const preload = join(root, "fetch-fixture.mjs");
  await writeFile(preload, `import { readFile } from 'node:fs/promises';
globalThis.fetch = async () => new Response(await readFile(new URL('./payload.json', import.meta.url)), { status: 200 });\n`);
  const run = () => execFileSync(process.execPath, ["--import", preload, script], {
    env: { ...process.env, MANABO_SHEETS_API_URL: "https://example.invalid/fixture" },
    encoding: "utf8", stdio: "pipe",
  });
  return { data, run };
}

for (const failure of ["truncated", "large reduction", "invalid field"]) {
  test(`failed CLI sync preserves both existing files: ${failure}`, async (t) => {
    const incoming = failure === "truncated" ? rows.slice(0, 1)
      : failure === "large reduction" ? rows.slice(0, 2050)
      : rows.map((row) => ({ ...row }));
    if (failure === "invalid field") delete incoming[0]["훈, 음"];
    const { data, run } = await fixture(t, incoming);
    const before = await Promise.all(["kanji.json", "stories.json"].map((name) => readFile(join(data, name))));
    assert.throws(run, (error) => error.status === 1 && /동기화 실패/.test(error.stderr));
    for (const [i, name] of ["kanji.json", "stories.json"].entries()) {
      assert.deepEqual(await readFile(join(data, name)), before[i]);
    }
    assert.deepEqual((await readdir(data)).sort(), ["kanji.json", "stories.json"]);
  });
}

test("valid CLI sync replaces both files and omits private fields", async (t) => {
  const incoming = rows.map((row) => ({ ...row, internalNote: "private" }));
  const { data, run } = await fixture(t, incoming);
  assert.match(run(), /동기화 완료/);
  assert.deepEqual(JSON.parse(await readFile(join(data, "kanji.json"), "utf8")), prepareKanji(incoming));
  assert.deepEqual(JSON.parse(await readFile(join(data, "stories.json"), "utf8")), stories);
  assert.deepEqual((await readdir(data)).sort(), ["kanji.json", "stories.json"]);
});
