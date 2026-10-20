import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareKanji, prepareStories, protectStoryIds, replaceDataFiles } from "./sync-sheets.mjs";

const kanjiFile = new URL("../public/data/kanji.json", import.meta.url);
const rows = JSON.parse(await readFile(kanjiFile, "utf8"));
const stories = JSON.parse(await readFile(new URL("../public/data/stories.json", import.meta.url), "utf8"));

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

async function fixture(t, incoming, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "manabo-sync-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const script = join(root, "scripts/sync-sheets.mjs");
  const data = join(root, "public/data");
  await mkdir(join(root, "scripts"), { recursive: true });
  await mkdir(data, { recursive: true });
  await copyFile(new URL("./sync-sheets.mjs", import.meta.url), script);
  if (options.kanjiBefore !== null) await writeFile(join(data, "kanji.json"), options.kanjiBefore ?? await readFile(kanjiFile));
  if (options.storiesBefore !== null) await writeFile(join(data, "stories.json"), options.storiesBefore ?? `${JSON.stringify(stories)}\n`);
  await writeFile(join(root, "payload.json"), JSON.stringify({ ok: true, kanji: incoming, stories: options.stories ?? stories }));
  const preload = join(root, "fetch-fixture.mjs");
  await writeFile(preload, `import { readFile } from 'node:fs/promises';
globalThis.fetch = async () => new Response(await readFile(new URL('./payload.json', import.meta.url)), { status: 200 });\n`);
  const run = (args = []) => execFileSync(process.execPath, ["--import", preload, script, ...args], {
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

async function assertRejected(t, incoming = rows, options = {}, pattern = /동기화 실패/) {
  const { data, run } = await fixture(t, incoming, options);
  const names = ["kanji.json", "stories.json"];
  const before = await Promise.all(names.map((name) => readFile(join(data, name))));
  assert.throws(run, (error) => error.status === 1 && pattern.test(error.stderr));
  for (const [i, name] of names.entries()) assert.deepEqual(await readFile(join(data, name)), before[i]);
  assert.deepEqual((await readdir(data)).sort(), names);
}

for (const field of ["발음", "예시단어", "획순 이미지"]) {
  for (const allRows of [false, true]) {
    test(`missing ${field} in ${allRows ? "all rows" : "one normal row"} preserves both files`, async (t) => {
      const incoming = structuredClone(rows);
      for (const row of allRows ? incoming : incoming.slice(0, 1)) delete row[field];
      await assertRejected(t, incoming, {}, new RegExp(`${field}: 키`));
    });
  }
  test(`bad ${field} type/content preserves both files`, async (t) => {
    for (const value of [{}, [], 123, "invalid"]) {
      const incoming = rows.slice();
      incoming[0] = { ...rows[0], [field]: value };
      await assertRejected(t, incoming, {}, new RegExp(field));
    }
  });
}

test("reference exceptions are field-specific", () => {
  assert.doesNotThrow(() => prepareKanji(rows));
  const referenceIndex = rows.findIndex((row) => row["학년"] === "참고" && row["한자"] !== "壴");
  for (const [field, value] of [["발음", ""], ["예시단어", {}], ["획순 이미지", ""], ["이미지 1", ""]]) {
    const incoming = rows.slice();
    incoming[referenceIndex] = { ...rows[referenceIndex], [field]: value };
    assert.throws(() => prepareKanji(incoming), new RegExp(field));
  }
});

for (const field of ["암기순", "문부성"]) {
  test(`duplicate ${field} preserves files`, async (t) => {
    const incoming = rows.slice();
    incoming[1] = { ...rows[1], [field]: rows[0][field] };
    await assertRejected(t, incoming, {}, new RegExp(`${field}: 번호가 중복`));
  });
}

test("story schema accepts current data and rejects invalid fields without coercion", () => {
  assert.equal(prepareStories(stories).length, stories.length);
  for (const field of ["id", "category", "level", "title"]) {
    for (const value of [{}, [], 3, "", null]) {
      const incoming = structuredClone(stories);
      incoming[0][field] = value;
      assert.throws(() => prepareStories(incoming), new RegExp(field));
    }
  }
  for (const update of [
    { category: "학넌별" }, { level: "N99" }, { versions: [] },
    { versions: [null] }, { versions: [{ label: "V1", body: {} }] },
    { versions: [{ label: [], body: "text" }] }, { id: ` ${stories[0].id} ` },
    { id: stories[1].id },
  ]) {
    const incoming = structuredClone(stories);
    Object.assign(incoming[0], update);
    assert.throws(() => prepareStories(incoming));
  }
});

test("story reduction, deletion, and equal-count ID replacement preserve both files", async (t) => {
  for (const incoming of [stories.slice(0, 1), stories.slice(1), [{ ...stories[0], id: "replacement" }, ...stories.slice(1)]]) {
    await assertRejected(t, rows, { stories: incoming }, /독해 기존 ID 삭제/);
  }
  await assertRejected(t, rows, { stories: [{ ...stories[0], category: "typo" }] }, /category/);
  await assertRejected(t, rows, { stories: [{ ...stories[0], versions: [{ label: "V1", body: {} }] }] }, /body/);
});

test("only exact, explicitly named story removals are allowed", async (t) => {
  const incoming = stories.slice(1);
  const { run } = await fixture(t, rows, { stories: incoming });
  assert.match(run([`--allow-story-removal=${stories[0].id}`]), /동기화 완료/);
  assert.throws(() => protectStoryIds(stories, incoming, ["unknown"]), /삭제 확인 ID/);
  assert.throws(() => protectStoryIds(stories, incoming, [stories[0].id, stories[0].id]), /삭제 확인 ID/);
});

test("first creation is allowed but corrupt or invalid previous files are preserved", async (t) => {
  const first = await fixture(t, rows, { kanjiBefore: null, storiesBefore: null });
  assert.match(first.run(), /동기화 완료/);
  for (const options of [{ kanjiBefore: "{" }, { storiesBefore: "{" },
    { storiesBefore: "[]" }, { storiesBefore: JSON.stringify([{ id: "bad" }]) }, { kanjiBefore: "[]" }]) {
    await assertRejected(t, rows, options);
  }
});

test("second file replacement failure rolls both files back byte for byte", async (t) => {
  const { data } = await fixture(t, rows);
  const names = ["kanji.json", "stories.json"];
  const before = await Promise.all(names.map((name) => readFile(join(data, name))));
  let calls = 0;
  await assert.rejects(replaceDataFiles(rows.slice().reverse(), stories.slice().reverse(), {
    directory: data,
    renameFile: async (from, to) => { if (++calls === 2) throw new Error("injected write failure"); await rename(from, to); },
  }), /파일 쓰기\/교체 실패/);
  for (const [i, name] of names.entries()) assert.deepEqual(await readFile(join(data, name)), before[i]);
  assert.deepEqual((await readdir(data)).sort(), names);
});

test("failed first creation removes any partially created file", async (t) => {
  const { data } = await fixture(t, rows, { kanjiBefore: null, storiesBefore: null });
  let calls = 0;
  await assert.rejects(replaceDataFiles(rows, stories, { directory: data,
    renameFile: async (from, to) => { if (++calls === 2) throw new Error("write failed"); await rename(from, to); },
  }));
  assert.deepEqual(await readdir(data), []);
});
