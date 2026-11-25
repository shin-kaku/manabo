import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { prepareReleaseAssets } from "./release-assets.mjs";

const manifestPath = "release-assets.json";
const current = { "assets/main-CBOxMmTo.js": "current" };
const previous = {
  "assets/main-CZCVprgO.js": "import './kanji/entry-A1234567.js'",
  "assets/kanji/entry-A1234567.js": "export default 42",
  "assets/kanji/entry-B1234567.css": ".glyph { display: grid }",
};
const older = { "assets/main-C1234567.js": "older" };
const expired = { "assets/main-D1234567.js": "expired" };
const hash = value => createHash("sha256").update(value).digest("hex");
const generation = files => Object.fromEntries(Object.entries(files).map(([name, body]) => [name, hash(body)]));
const history = (...files) => ({ schema: 1, generations: files.map(generation) });

async function writeFiles(dir, files) {
  for (const [name, bytes] of Object.entries(files)) {
    const path = join(dir, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
}

async function fixture(t, { built = current, published, assets = {}, manifestStatus = 200, seed } = {}) {
  const base = await mkdtemp(join(tmpdir(), "manabo-release-assets-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const directory = join(base, "dist");
  const bootstrapDirectory = join(base, "seed");
  await writeFiles(directory, built);
  if (seed) await writeFiles(bootstrapDirectory, seed);
  const requests = [];
  const origin = "https://manabo.example";
  async function request(url) {
    const target = new URL(url);
    assert.equal(target.origin, origin);
    const name = target.pathname.slice(1);
    requests.push(name);
    if (name === manifestPath) return Response.json(published ?? {}, { status: manifestStatus });
    return Object.hasOwn(assets, name) ? new Response(assets[name]) : new Response(null, { status: 404 });
  }
  return { directory, requests, run: () => prepareReleaseAssets({ directory, bootstrapDirectory, origin, request }) };
}

test("a release preserves two earlier bundles with their exact imported modules and CSS", async t => {
  const active = { ...current, "assets/shared-E1234567.js": "shared" };
  const pinned = { ...previous, "assets/shared-E1234567.js": "shared" };
  const { directory, run, requests } = await fixture(t, {
    built: active, published: history(pinned, older, expired), assets: { ...previous, ...older },
  });
  const expected = history(active, pinned, older);
  assert.deepEqual(await run(), expected);
  assert.deepEqual(JSON.parse(await readFile(join(directory, manifestPath))), expected);
  assert.deepEqual(requests.sort(), [manifestPath, ...Object.keys(previous), ...Object.keys(older)].sort());
  for (const [name, bytes] of Object.entries({ ...active, ...previous, ...older })) {
    assert.equal(await readFile(join(directory, name), "utf8"), bytes);
  }
  await assert.rejects(readFile(join(directory, Object.keys(expired)[0])), { code: "ENOENT" });
  assert.deepEqual(await run(), expected);
});

test("a content-only release keeps the same three distinct sets of frontend files", async t => {
  const { run } = await fixture(t, {
    published: history(current, previous, older), assets: { ...previous, ...older },
  });
  assert.deepEqual(await run(), history(current, previous, older));
});

test("the first deployment restores the original bundle from its bootstrap snapshot", async t => {
  const { directory, run, requests } = await fixture(t, {
    manifestStatus: 404, seed: { [manifestPath]: JSON.stringify(history(current, previous)), ...previous },
  });
  assert.deepEqual(await run(), history(current, previous));
  for (const [name, bytes] of Object.entries(previous)) {
    assert.equal(await readFile(join(directory, name), "utf8"), bytes);
  }
  assert.deepEqual(requests, [manifestPath]);
});

for (const [reason, options] of [
  ["the live manifest is temporarily unavailable", { manifestStatus: 503, seed: { [manifestPath]: JSON.stringify(history(current)) } }],
  ["the prior bundle is missing", { published: history(previous) }],
  ["the prior bundle has the wrong digest", { published: history(previous), assets: { ...previous, "assets/main-CZCVprgO.js": "wrong bytes" } }],
  ["two versions assign different content to one URL", { published: history({ "assets/main-CBOxMmTo.js": "different" }) }],
  ["the manifest contains a path outside its asset directory", { published: history({ "assets/../legacy.js": "invalid" }) }],
]) {
  test(`release preparation fails without publishing a manifest when ${reason}`, async t => {
    const { run, directory } = await fixture(t, options);
    await assert.rejects(run());
    await assert.rejects(readFile(join(directory, manifestPath)), { code: "ENOENT" });
    assert.equal(await readFile(join(directory, "assets/main-CBOxMmTo.js"), "utf8"), "current");
  });
}
