import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeGeneratedFile } from "./generated-file.mjs";

test("unchanged generated pages preserve modification times while changed content is published", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "manabo-generated-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "index.html");
  assert.equal(writeGeneratedFile(path, "<p>한자</p>"), true);
  const previous = new Date("2020-01-01T00:00:00Z");
  utimesSync(path, previous, previous);
  const before = statSync(path).mtimeMs;
  assert.equal(writeGeneratedFile(path, "<p>한자</p>"), false);
  assert.equal(statSync(path).mtimeMs, before);
  assert.equal(writeGeneratedFile(path, "<p>독해</p>"), true);
  assert.equal(readFileSync(path, "utf8"), "<p>독해</p>");
  assert.notEqual(statSync(path).mtimeMs, before);
});

test("unexpected output read errors are not treated as missing files", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "manabo-generated-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.throws(() => writeGeneratedFile(directory, "content"), { code: "EISDIR" });
});
