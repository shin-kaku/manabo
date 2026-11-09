import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { driveFileId, strokeSources } from "../src/image-sources.js";
import { createRubyResolver } from "../src/example-ruby.js";
import { mnemonicComponents } from "../src/kanji-components.js";
import { examplePattern, parseExamples } from "../src/reading-groups.js";

const fields = ["암기순", "문부성", "한자", "훈, 음", "훈", "음", "학년", "등급", "획"];
const numeric = (value) => {
  const raw = String(value ?? "").trim();
  const number = Number(raw);
  return raw && Number.isFinite(number) ? number : Infinity;
};

export function writeKanjiListData(directory = resolve("public/data")) {
  const kanjiBytes = readFileSync(resolve(directory, "kanji.json"));
  const mediaBytes = readFileSync(resolve(directory, "media.json"));
  const rows = JSON.parse(kanjiBytes);
  const media = JSON.parse(mediaBytes);
  const version = createHash("sha256").update("kanji-detail-v1\0").update(kanjiBytes).update(mediaBytes).digest("hex");
  const related = new Map();
  for (const row of rows.slice().sort((a, b) => numeric(a["획"]) - numeric(b["획"]) || numeric(a["암기순"]) - numeric(b["암기순"]))) {
    for (const component of mnemonicComponents(row["풀이"])) {
      if (!related.has(component)) related.set(component, []);
      related.get(component).push(row["한자"].trim());
    }
  }
  const resolveRuby = createRubyResolver(rows);
  const blockSize = 64;
  const dir = resolve(directory, "kanji-detail", version);
  mkdirSync(dir, { recursive: true });
  for (let offset = 0; offset < rows.length; offset += blockSize) {
    const blockRows = rows.slice(offset, offset + blockSize);
    const items = { image1: {}, image2: {}, stroke: {} };
    const ruby = {};
    const components = {};
    for (const row of blockRows) {
      const sources = { image1: [row["이미지 1"]], image2: [row["이미지 2"]], stroke: strokeSources(row) };
      for (const [kind, links] of Object.entries(sources)) {
        for (const link of links) {
          const id = driveFileId(link);
          if (media.items[kind]?.[id]) items[kind][id] = media.items[kind][id];
        }
      }
      for (const component of mnemonicComponents(row["풀이"])) components[component] = related.get(component);
      for (const group of parseExamples(row["예시단어"])) {
        for (const line of group.items) {
          const match = line.match(examplePattern);
          if (match) ruby[JSON.stringify([match[1], match[2]])] = resolveRuby(match[1], match[2]);
        }
      }
    }
    writeFileSync(resolve(dir, `${offset / blockSize}.json`),
      JSON.stringify({ version, rows: blockRows, media: { schema: 1, items }, ruby, related: components }));
  }
  const list = rows.map((row, i) => ({
    ...Object.fromEntries(fields.map(field => [field, row[field]])),
    detailBlock: Math.floor(i / blockSize),
  }));
  writeFileSync(resolve(directory, "kanji-index.json"), JSON.stringify({ schema: 1, version, rows: list }));
}
