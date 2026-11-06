import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { collectSources, hash, optimize, validateSvg, assetPath, emptyCatalog } from "./media-core.mjs";
import { syncMedia } from "./sync-media.mjs";
import { mediaCandidates, strokeMediaEntry } from "../src/media.js";
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

test("SVG local quoted references survive while external references stay rejected", () => {
  for (const url of ['url(#clip)', 'url("#clip")', "url('#clip')", 'url(  "#clip"  )', String.raw`url(#grad\:a)`, String.raw`url("#grad\:a")`, String.raw`url(#grad\20 a)`]) {
    const input = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="clip"><path d="M0 0L1 1"/></clipPath></defs><style>path{clip-path:${url}}</style><use href=" #clip"/></svg>`);
    assert.deepEqual(validateSvg(input), input);
  }
  for (const url of ['url(https://example.com/a)', 'url("https://example.com/a")', "url('https://example.com/a')", 'url(  //example.com/a )', 'url(other.svg#clip)', 'url("#clip)', 'url()']) {
    assert.throws(() => validateSvg(Buffer.from(`<svg><style>path{fill:${url}}</style></svg>`)));
  }
  for (const href of ['https://example.com/a', '//example.com/a', 'other.svg#clip', '  https://example.com/a']) {
    assert.throws(() => validateSvg(Buffer.from(`<svg><use href="${href}"/></svg>`)));
  }
});

test("malformed SVG URLs with repeated hexadecimal escapes are rejected promptly", () => {
  const input = `<svg><style>path{fill:url("#${String.raw`\abcdef`.repeat(1000)}"invalid)}</style></svg>`;
  // Isolate the validator so a regex regression fails within the timeout instead
  // of blocking the test runner (and a production Google sync) indefinitely.
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import { validateSvg } from ${JSON.stringify(new URL("./media-core.mjs", import.meta.url).href)};
    assert.throws(() => validateSvg(Buffer.from(${JSON.stringify(input)})));
  `], { encoding: "utf8", timeout: 5000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
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
  rows[0] = { ...rows[0], "이미지 2": sourceUrl("two"), "움직이는 획순": sourceUrl("animation"), "획순 SVG": sourceUrl("svg") };
  delete rows[0]["획순 이미지"];
  const [saved] = prepareKanji(rows);
  assert.equal(saved["이미지 2"], sourceUrl("two"));
  assert.equal(saved["획순 SVG"], sourceUrl("svg"));
  assert.equal(saved["움직이는 획순"], sourceUrl("animation"));
  rows[0]["움직이는 획순"] = "not a URL";
  assert.throws(() => prepareKanji(rows), /움직이는 획순/);
});

test("a missing exported R field cannot discard a published animation; a blank R clears it", () => {
  const previous = [{ 한자: "車", "움직이는 획순": sourceUrl("r") }];
  assert.throws(() => mergeKanji(previous, [{ 한자: "車" }]), /움직이는 획순 필드가 누락/);
  const cleared = { 한자: "車", "움직이는 획순": "" };
  assert.deepEqual(mergeKanji(previous, [cleared]), [cleared]);
  assert.deepEqual(mergeKanji([{ 한자: "車" }], [{ 한자: "車" }]), [{ 한자: "車" }]);
});

test("R animation and Q diagram both sync; the detail card prefers R and retains Q", async t => {
  const directory = await mkdtemp(join(tmpdir(), "manabo-r-q-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const kanji = { 한자: "車", "움직이는 획순": sourceUrl("animation"), "획순 이미지": sourceUrl("q") };
  const animated = await readFile(new URL("../public/strokes/車.svg", import.meta.url));
  const sources = new Map([["animation", animated], ["q", svg]]);
  const metadata = new Map([...sources].map(([id, bytes]) => [id, { md5Checksum: hash(bytes, "md5"), size: bytes.length }]));
  const { catalog } = await syncMedia({ rows: [kanji], enabledKinds: ["stroke"], directory, metadata, readSource: async id => sources.get(id) });
  const r = catalog.items.stroke.animation.detail.url, q = catalog.items.stroke.q.detail.url;
  assert.deepEqual(mediaCandidates(kanji, "stroke", "detail", catalog), [r, q]);
  assert.equal(strokeMediaEntry(kanji, r, catalog).strokeCount, 7);
  assert.equal(strokeMediaEntry(kanji, q, catalog).strokeTheme, undefined);
  delete catalog.items.stroke.animation;
  assert.deepEqual(mediaCandidates(kanji, "stroke", "detail", catalog), [q]);
});

test("Drive sync preserves the embedded color scheme only for opted-in stroke SVGs", async t => {
  const directory = await mkdtemp(join(tmpdir(), "manabo-stroke-theme-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const optedIn = Buffer.from(svg.toString().replace("<svg ", '<svg data-stroke-theme="auto" '));
  const explicit = Buffer.from(optedIn.toString().replace("<svg ", '<svg data-stroke-views="explicit" '));
  for (const [bytes, expected] of [[explicit, "explicit"], [optedIn, "auto"], [svg, undefined]]) {
    const metadata = new Map([["svg", { md5Checksum: hash(bytes, "md5"), size: bytes.length }]]);
    const { catalog } = await syncMedia({ rows: [row], enabledKinds: ["stroke"], directory, metadata, readSource: async () => bytes });
    const url = mediaCandidates(row, "stroke", "detail", catalog)[0];
    assert.equal(strokeMediaEntry(row, url, catalog)?.strokeTheme, expected);
    assert.equal(strokeMediaEntry(row, "https://example.com/fallback.png", catalog), undefined);
    assert.deepEqual(await readFile(assetPath(directory, url)), bytes);
  }
});

test("all five SVG trials retain numbered strokes, native themes and reduced motion", async () => {
  for (const [kanji, count] of Object.entries({ 車: 7, 犬: 4, 見: 7, 空: 8, 校: 10 })) {
    const file = await readFile(new URL(`../public/strokes/${kanji}.svg`, import.meta.url));
    const xml = validateSvg(file).toString("utf8");
    assert.equal((xml.match(/<animate\b/g) || []).length, count, kanji);
    assert.equal((await optimize(file, "stroke"))[0].strokeCount, count);
    for (const view of ["light", "dark", "light-still", "dark-still", "still"]) {
      assert.ok(xml.includes(`id="${view}"`));
    }
    assert.deepEqual([...xml.matchAll(/<text\b[^>]*>(\d+)<\/text>/g)].map(match => Number(match[1])),
      Array.from({ length: count }, (_, i) => i + 1));
    assert.match(xml, /data-stroke-theme="auto"/);
    assert.match(xml, /#bc002d/i);
    assert.match(xml, /prefers-reduced-motion:\s*reduce/);
    assert.match(xml, /<path\b[^>]*\bclass="still"[^>]*\bd="[^"]+"/);
  }
});
