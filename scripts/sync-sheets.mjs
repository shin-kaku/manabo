import process from "node:process";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(projectRoot, ".env.local");
const dataDirectory = resolve(projectRoot, "public/data");
const kanjiPath = resolve(dataDirectory, "kanji.json");
const storiesPath = resolve(dataDirectory, "stories.json");

const KANJI_FIELDS = [
  "암기순",
  "문부성",
  "한자",
  "훈, 음",
  "훈",
  "음",
  "학년",
  "등급",
  "획",
  "풀이",
  "이미지 1",
  "획순 이미지",
  "발음",
  "예시단어",
];
const STORY_FIELDS = ["id", "category", "level", "title"];
const STORY_VERSION_FIELDS = ["label", "body"];

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function pick(source, fields) {
  return Object.fromEntries(
    fields
      .filter((field) => Object.hasOwn(source, field))
      .map((field) => [field, source[field]]),
  );
}

function requireText(value, label) {
  if (!String(value ?? "").trim()) throw new Error(`${label} 값이 없습니다.`);
}

function prepareKanji(rows) {
  if (!Array.isArray(rows) || rows.length < 1) {
    throw new Error("한자 데이터가 비어 있거나 배열이 아닙니다.");
  }
  const seen = new Set();
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`한자 ${index + 1}번 항목이 객체가 아닙니다.`);
    }
    requireText(row["한자"], `한자 ${index + 1}번 항목의 한자`);
    const character = String(row["한자"]).trim();
    if (seen.has(character)) throw new Error(`중복 한자가 있습니다: ${character}`);
    seen.add(character);
    return pick(row, KANJI_FIELDS);
  });
}

function prepareStories(rows) {
  if (!Array.isArray(rows) || rows.length < 1) {
    throw new Error("독해 데이터가 비어 있거나 배열이 아닙니다.");
  }
  const seen = new Set();
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`독해 ${index + 1}번 항목이 객체가 아닙니다.`);
    }
    for (const field of STORY_FIELDS) {
      requireText(row[field], `독해 ${index + 1}번 항목의 ${field}`);
    }
    if (seen.has(row.id)) throw new Error(`중복 독해 ID가 있습니다: ${row.id}`);
    seen.add(row.id);
    if (!Array.isArray(row.versions) || row.versions.length < 1) {
      throw new Error(`독해 ${row.id}의 versions가 비어 있습니다.`);
    }
    const story = pick(row, STORY_FIELDS);
    story.versions = row.versions.map((version, versionIndex) => {
      if (!version || typeof version !== "object" || Array.isArray(version)) {
        throw new Error(`독해 ${row.id}의 버전 ${versionIndex + 1}이 객체가 아닙니다.`);
      }
      requireText(version.label, `독해 ${row.id} 버전 ${versionIndex + 1}의 label`);
      requireText(version.body, `독해 ${row.id} 버전 ${versionIndex + 1}의 body`);
      return pick(version, STORY_VERSION_FIELDS);
    });
    return story;
  });
}

async function writeAndVerify(path, data) {
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(path, serialized, { encoding: "utf8", flag: "wx" });
  const verified = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(verified) || verified.length !== data.length) {
    throw new Error(`임시 파일 검증에 실패했습니다: ${path}`);
  }
}

async function replaceDataFiles(kanji, stories) {
  await mkdir(dataDirectory, { recursive: true });
  const suffix = `${process.pid}-${Date.now()}`;
  const kanjiTemp = resolve(dataDirectory, `.kanji.${suffix}.tmp`);
  const storiesTemp = resolve(dataDirectory, `.stories.${suffix}.tmp`);
  const kanjiBackup = resolve(dataDirectory, `.kanji.${suffix}.backup`);
  const storiesBackup = resolve(dataDirectory, `.stories.${suffix}.backup`);
  const cleanup = [kanjiTemp, storiesTemp, kanjiBackup, storiesBackup];
  let kanjiBackedUp = false;
  let storiesBackedUp = false;
  let replacementStarted = false;

  try {
    await writeAndVerify(kanjiTemp, kanji);
    await writeAndVerify(storiesTemp, stories);
    kanjiBackedUp = await pathExists(kanjiPath);
    storiesBackedUp = await pathExists(storiesPath);
    if (kanjiBackedUp) await copyFile(kanjiPath, kanjiBackup);
    if (storiesBackedUp) await copyFile(storiesPath, storiesBackup);
    replacementStarted = true;
    await rename(kanjiTemp, kanjiPath);
    await rename(storiesTemp, storiesPath);
  } catch (error) {
    if (replacementStarted) {
      if (kanjiBackedUp) await copyFile(kanjiBackup, kanjiPath);
      if (storiesBackedUp) await copyFile(storiesBackup, storiesPath);
    }
    throw error;
  } finally {
    await Promise.all(cleanup.map((path) => rm(path, { force: true })));
  }
}

async function main() {
  if (await pathExists(envPath)) process.loadEnvFile(envPath);
  const url = String(process.env.MANABO_SHEETS_API_URL ?? "").trim();
  if (!url) {
    throw new Error(
      ".env.local에 MANABO_SHEETS_API_URL을 설정한 뒤 다시 실행하세요.",
    );
  }

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Apps Script 요청 실패: HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (!payload || typeof payload !== "object" || payload.ok === false) {
    throw new Error(payload?.error || "Apps Script 응답이 올바르지 않습니다.");
  }

  const kanji = prepareKanji(payload.kanji);
  const stories = prepareStories(payload.stories);
  await replaceDataFiles(kanji, stories);

  console.log(`동기화 완료: ${new Date().toISOString()}`);
  console.log(`한자: ${kanji.length.toLocaleString("ko-KR")}개`);
  console.log(`독해: ${stories.length.toLocaleString("ko-KR")}개`);
}

main().catch((error) => {
  console.error(`동기화 실패: ${error.message}`);
  console.error("기존 JSON 파일은 유지됩니다.");
  process.exitCode = 1;
});
