import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { collectSources, hash, optimize, validateSvg, assetPath, emptyCatalog } from "./media-core.mjs";
import { syncMedia } from "./sync-media.mjs";
import { mediaCandidates } from "../src/media.js";
import { mergeKanji, prepareKanji } from "./sync-sheets.mjs";

const sourceUrl = id => `https://drive.google.com/file/d/${id}/view`;
const row = { 한자: "文", "이미지 1": sourceUrl("one"), "이미지 2": sourceUrl("two"), "획순 이미지": sourceUrl("png"), "획순 SVG": sourceUrl("svg") };
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path id="p" d="M0 0L50 50" stroke="black"><animate attributeName="stroke-dashoffset" from="100" to="0" dur="1s" repeatCount="indefinite"/></path></svg>');

test("three media kinds use file identity and SVG supersedes raster strokes", () => {
  assert.deepEqual(collectSources([row, row]), [{ kind: "image1", id: "one" }, { kind: "image2", id: "two" }, { kind: "stroke", id: "svg" }]);
});

test("SVG animation bytes survive; scripts, external resources and malformed XML fail", async () => {
  assert.deepEqual((await optimize(svg, "stroke"))[0].bytes, svg);
  for (const unsafe of ['<svg><script>alert(1)</script></svg>', '<svg onload="x()"/>', '<svg><image href="https://example.com/x"/></svg>', '<svg><style>@import "x";</style></svg>', '<!DOCTYPE svg><svg/>', '<svg><path></svg>']) assert.throws(() => validateSvg(Buffer.from(unsafe)));
  assert.throws(() => assetPath("/tmp", "/media/../../escape"));
});

test("raster variants retain aspect ratio, cap decode size, and keep image2 lossless after resize", async () => {
  const original = await sharp({ create: { width: 1200, height: 1500, channels: 3, background: "white" } }).png().toBuffer();
  for (const kind of ["image1", "image2"]) {
    const result = await optimize(original, kind);
    assert.deepEqual(result.map(v => [v.width, v.height]), [[384, 480], [768, 960]]);
    const decoded = await sharp(result[1].bytes).raw().toBuffer();
    assert.ok(decoded.every(value => value === 255));
  }
});

test("unchanged metadata downloads nothing; same-ID replacement changes URL; corrupt download never publishes a catalog", async t => {
  const directory = await mkdtemp(join(tmpdir(), "manabo-media-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const rows = [{ 한자: "文", "이미지 1": sourceUrl("one") }];
  let buffer = await sharp({ create: { width: 32, height: 32, channels: 3, background: "red" } }).png().toBuffer();
  let calls = 0;
  const metadata = () => new Map([["one", { md5Checksum: hash(buffer, "md5"), size: buffer.length }]]);
  const run = previous => syncMedia({ rows, previous, directory, metadata: metadata(), readSource: async () => { calls++; return buffer; } });
  const first = await run(emptyCatalog());
  assert.equal(calls, 1);
  assert.equal(first.changed, 1);
  const cached = await run(first.catalog);
  assert.equal(calls, 1);
  assert.equal(cached.reused, 1);
  buffer = await sharp({ create: { width: 32, height: 32, channels: 3, background: "blue" } }).png().toBuffer();
  const changed = await run(first.catalog);
  assert.equal(calls, 2);
  assert.notEqual(changed.catalog.items.image1.one.card.url, first.catalog.items.image1.one.card.url);
  await assert.rejects(syncMedia({ rows, previous: first.catalog, directory, metadata: metadata(), readSource: async () => Buffer.from("partial") }), /체크섬/);
  await writeFile(assetPath(directory, changed.catalog.items.image1.one.card.url), "damaged");
  const repaired = await run(changed.catalog);
  assert.equal(repaired.changed, 1);
  assert.equal(calls, 3);
});

test("media candidates choose card/detail locally, fall back for rasters, and do not rasterize SVG", () => {
  const card = `/media/image1/${"a".repeat(64)}.webp`, detail = `/media/image1/${"b".repeat(64)}.webp`;
  const catalog = { items: { image1: { one: { card: { url: card }, detail: { url: detail } } } } };
  assert.equal(mediaCandidates(row, "image1", "card", catalog)[0], card);
  assert.equal(mediaCandidates(row, "image1", "detail", catalog)[0], detail);
  assert.deepEqual(mediaCandidates(row, "stroke", "detail", catalog), []);
  const legacyStroke = { "획순 이미지": sourceUrl("svg") };
  const svgUrl = `/media/stroke/${"c".repeat(64)}.svg`;
  assert.deepEqual(mediaCandidates(legacyStroke, "stroke", "detail", { items: { stroke: { svg: { detail: { url: svgUrl } } } } }), [svgUrl]);
  assert.match(mediaCandidates(row, "image2", "card", catalog)[0], /drive.google.com/);
});

test("sync preserves local order and only applies corrections to the known outdated source value", () => {
  const previous = [{ 한자: "文" }, { 한자: "六" }];
  const source = [{ 한자: "六", 예시단어: "old" }, { 한자: "文" }, { 한자: "字" }];
  const corrections = [{ kanji: "六", field: "예시단어", sourceValue: "old", value: "fixed" }];
  const merged = mergeKanji(previous, source, corrections);
  assert.deepEqual(merged.map(row => row.한자), ["文", "六", "字"]);
  assert.equal(merged[1].예시단어, "fixed");
  source[0].예시단어 = "new edit";
  assert.equal(mergeKanji(previous, source, corrections)[1].예시단어, "new edit");
  assert.throws(() => mergeKanji(previous, source.slice(1)), /삭제/);
});

test("optional image2 and SVG fields survive schema filtering, including SVG-only stroke rows", async () => {
  const rows = JSON.parse(await readFile(new URL("../public/data/kanji.json", import.meta.url)));
  rows[0] = { ...rows[0], "이미지 2": sourceUrl("two"), "획순 SVG": sourceUrl("svg") };
  delete rows[0]["획순 이미지"];
  const [saved] = prepareKanji(rows);
  assert.equal(saved["이미지 2"], sourceUrl("two"));
  assert.equal(saved["획순 SVG"], sourceUrl("svg"));
});

test("stroke trials yield to new Drive revisions and replacement Q links", () => {
  const catalogUrl = `/media/stroke/${"d".repeat(64)}.svg`;
  const id = "1eIu0c52kva7VvEE1eEECu2nVc2Gw34jv";
  const md5 = "f7bbe6f1f8ce1d52dd0b8bf3d28a1832";
  const candidates = (fileId, sourceMd5, kanji = "車") => mediaCandidates(
    { ...row, 한자: kanji, "획순 SVG": sourceUrl(fileId) }, "stroke", "detail",
    { items: { stroke: { [fileId]: { sourceMd5, detail: { url: catalogUrl } } } } },
  );
  assert.deepEqual(candidates(id, md5), ["/strokes/車.svg", catalogUrl]);
  assert.deepEqual(candidates(id, "0".repeat(32)), [catalogUrl]);
  assert.deepEqual(candidates("replacement", md5), [catalogUrl]);
  assert.deepEqual(candidates(id, md5, "文"), [catalogUrl]);
});

test("all five SVG trials retain each stroke and a reduced-motion glyph", async () => {
  for (const [kanji, count] of Object.entries({ 車: 7, 犬: 4, 見: 7, 空: 8, 校: 10 })) {
    const file = await readFile(new URL(`../public/strokes/${kanji}.svg`, import.meta.url));
    const xml = validateSvg(file).toString("utf8");
    assert.equal((xml.match(/<animate\b/g) || []).length, count, kanji);
    assert.match(xml, /prefers-reduced-motion:\s*reduce/);
    assert.match(xml, /<path\b[^>]*\bclass="still"[^>]*\bd="[^"]+"/);
  }
});
