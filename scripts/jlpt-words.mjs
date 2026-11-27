import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createRubyResolver } from "../src/example-ruby.js";
import { mnemonicComponents } from "../src/kanji-components.js";
import { driveFileId } from "../src/image-sources.js";
import { examplePattern, parseReadings } from "../src/reading-groups.js";
import { levels, normalizeKana } from "../src/jlpt-quiz.js";
import { writeGeneratedFile } from "./generated-file.mjs";
import { readAuthenticatedSheets } from "./sheets-source.mjs";

const han = text => [...new Set(String(text ?? "").match(/[一-鿿]/gu) ?? [])];
const markers = { "㉧": "음", "㉭": "훈", "㉫": "특수" };
const characterReadings = row => [...new Set(parseReadings(row["음, 훈"]).flatMap(group => group.value.split(/[、,\s]+/))
  .filter(r => /^[ぁ-ゖァ-ヶー]+$/u.test(r)).map(normalizeKana))];

export function wordLevel(word, characters) {
  const glyphs = han(word);
  if (!glyphs.length || glyphs.some(k => !characters.get(k)?.level)) return null;
  return glyphs.map(k => characters.get(k).level).sort()[0];
}

export function convertWords(rows, report = () => {}) {
  const resolveRuby = createRubyResolver(rows.map(row => ({
    한자: row["한자"], 발음: row["음, 훈"], 예시단어: row["예시 단어"],
  })));
  const characters = new Map(rows.map(row => [row["한자"], {
    k: row["한자"], level: /^JLPT (N[1-5])$/.exec(row["등급"])?.[1], hunEum: row["훈, 음"],
  }]));
  const words = new Map();
  const eligible = Object.fromEntries(levels.map(level => [level, []]));
  const sourcesWithOwnN5 = new Set();
  const log = (reason, row, line) => report({ reason, row: row._row, kanji: row["한자"], line });
  for (const row of rows) {
    const raw = String(row["예시 단어"] ?? "").trim();
    if (!raw) { log("예시 단어 없음", row, raw); continue; }
    let type = "";
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line === "-") continue;
      if (Object.hasOwn(markers, line)) {
        type = markers[line];
        if (type === "특수") log("특수 읽기 구분 표식", row, rawLine);
        continue;
      }
      const match = /^(\S+?)[(（]([～○ぁ-ゖァ-ヶー]+)[)）]\s*(\S.*)$/u.exec(line);
      if (!match || !type) { log("예시 형식 확인", row, rawLine); continue; }
      const [, word, reading, meaning] = match;
      let entry = words.get(word);
      if (!entry) {
        const level = wordLevel(word, characters);
        entry = { word, reading, meaning, type, level, kanji: han(word).map(k => characters.get(k)),
          sourceKanji: [], sentence: null };
        words.set(word, entry);
        if (level) {
          if (examplePattern.test(line)) {
            const parts = resolveRuby(word, reading);
            if (parts.length > 1) entry.ruby = parts;
          }
          eligible[level].push(entry);
        } else log(han(word).some(k => !characters.has(k)) ? "미등록 한자 포함" : "급수 없음", row, rawLine);
      } else if (reading !== entry.reading) {
        entry.otherReadings ??= [];
        if (!entry.otherReadings.includes(reading)) entry.otherReadings.push(reading);
      }
      if (!entry.sourceKanji.includes(row["한자"])) entry.sourceKanji.push(row["한자"]);
      if (entry.level === "N5") sourcesWithOwnN5.add(row["한자"]);
    }
  }
  for (const row of rows) {
    // A standalone glyph can also have a valid reading only recorded in column T.
    const single = words.get(row["한자"]);
    if (single) {
      const others = new Set([...(single.otherReadings ?? []).map(normalizeKana), ...characterReadings(row)]);
      others.delete(normalizeKana(single.reading));
      if (others.size) single.otherReadings = [...others];
    }
    if (characters.get(row["한자"]).level === "N5" && !sourcesWithOwnN5.has(row["한자"])) {
      log("순수 N5 예시 없음", row, row["예시 단어"]);
    }
  }
  return { eligible, spellings: [...words.keys()] };
}

// Use the same reviewed parts, extra connections and shape additions as Starpath.
export function spellingData(rows, spellings, catalog, overrides, shapes) {
  const explanations = new Map(catalog.map(row => [row["한자"], row["풀이"]]));
  const glyphs = {};
  for (const row of rows) {
    const k = row["한자"];
    let parts = mnemonicComponents(row["풀이"] ?? explanations.get(k)).filter(ch => ch !== k);
    const correction = overrides.parts[k];
    if (correction && [...new Set(correction.sheet)].join("") === parts.join("")) parts = correction.game;
    glyphs[k] = {
      level: /^JLPT (N[1-5])$/.exec(row["등급"])?.[1] ?? "",
      readings: characterReadings(row),
      parts: [...new Set([...parts, ...(overrides.links[k] ?? []), ...(shapes[k]?.add ?? [])])],
      related: han(row["마나보 제안 연관 한자"]).filter(ch => ch !== k),
    };
  }
  return { glyphs, spellings };
}

// Some isolated shapes have fewer than three related substitutions. Compare the
// actual still stroke silhouettes offline; ship only the nearest familiar glyphs.
async function addVisualNeighbors(dictionary, catalog, media, publicDir) {
  const samples = [];
  for (const row of catalog) {
    const k = row["한자"], level = dictionary.glyphs[k]?.level;
    if (!level) continue;
    const url = media.items.stroke[driveFileId(row["움직이는 획순"])]?.detail?.url;
    if (!/^\/media\/stroke\/[\da-f]{64}\.svg$/.test(url ?? "")) continue;
    const svg = readFileSync(join(publicDir, url), "utf8");
    const still = svg.match(/<path\b[^>]*\bclass="still"[^>]*\/>/)?.[0];
    const viewBox = svg.match(/\bviewBox="([\d.\s-]+)"/)?.[1];
    if (!still || !viewBox) continue;
    const image = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="${viewBox}">${still}</svg>`);
    const pixels = await sharp(image).flatten({ background: "white" }).resize(12, 12).greyscale().raw().toBuffer();
    samples.push({ k, level, pixels, strokes: row["획"] });
  }
  if (!samples.length) throw Error("획순 SVG에서 완성된 글자 모양을 읽지 못했습니다.");
  const existing = new Set(dictionary.spellings);
  for (const a of samples) {
    const distances = [];
    for (const b of samples) {
      if (a.k === b.k || levels.indexOf(b.level) > levels.indexOf(a.level)) continue;
      let distance = 80 * (a.strokes - b.strokes) ** 2;
      for (let i = 0; i < a.pixels.length; i++) distance += (a.pixels[i] - b.pixels[i]) ** 2;
      distances.push({ k: b.k, distance });
    }
    const nearest = distances.sort((a, b) => a.distance - b.distance).map(item => item.k);
    dictionary.glyphs[a.k].similar = [...new Set([...nearest.slice(0, 8), ...nearest.filter(k => !existing.has(k)).slice(0, 6)])];
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = new URL("../", import.meta.url);
  const read = path => JSON.parse(readFileSync(path, "utf8"));
  const input = process.argv.slice(2);
  if (input.length && (input.length !== 2 || input[0] !== "--input")) {
    throw Error("사용법: npm run data:jlpt [-- --input <도감 DB 행 JSON>]");
  }
  const rows = input.length ? read(input[1]) : (await readAuthenticatedSheets({
    credentials: process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON,
    spreadsheetId: process.env.MANABO_SHEETS_SPREADSHEET_ID,
    kanjiOnly: true,
  })).kanji;
  if (!rows.length || rows.some(r => !r["한자"] || !Number.isInteger(r._row) || !Object.hasOwn(r, "예시 단어"))
      || new Set(rows.map(r => r["한자"])).size !== rows.length) throw Error("도감 DB 행과 원본 행 번호를 확인하세요.");
  const { eligible, spellings } = convertWords(rows, item => console.warn(JSON.stringify(item)));
  const catalog = read(new URL("public/data/kanji.json", root));
  const dictionary = spellingData(rows, spellings, catalog,
    read(new URL("previews/starpath/data/overrides.json", root)), read(new URL("previews/starpath/data/shapes.json", root)).shapes);
  await addVisualNeighbors(dictionary, catalog, read(new URL("public/data/media.json", root)), fileURLToPath(new URL("public/", root)));
  const directory = fileURLToPath(new URL("public/data/jlpt-words/", root));
  const counts = Object.fromEntries(levels.map(level => [level, eligible[level].length]));
  if (levels.some(level => !counts[level])) throw Error("한 개 이상의 급수에 단어가 없습니다.");
  mkdirSync(directory, { recursive: true });
  for (const [name, data] of Object.entries({ ...eligible, spelling: dictionary, counts })) {
    writeGeneratedFile(join(directory, name + ".json"), JSON.stringify(data) + "\n");
  }
  console.log(JSON.stringify({ uniqueWords: spellings.length, counts }));
}
