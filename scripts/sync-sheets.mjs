import process from "node:process";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  realpath,
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
// Preserve the catalog's existing minimum and maximum 10% reduction policy.
const MIN_KANJI_COUNT = 2000;
const MIN_RETAINED_RATIO = 0.9;
const GRADE_PATTERN = /^(?:초등학교 [1-6]학년|중학 [1-3]|고교 [1-3]|참고)$/;

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
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
  if (typeof value !== "string") throw new Error(`${label}: 문자열이어야 합니다.`);
  if (!value.trim()) throw new Error(`${label}: 값이 비어 있습니다.`);
}

function requireStringField(row, field, label, allowEmpty = false) {
  if (!Object.hasOwn(row, field)) throw new Error(`${label}의 ${field}: 키가 없습니다.`);
  if (typeof row[field] !== "string") throw new Error(`${label}의 ${field}: 문자열이어야 합니다.`);
  if (!allowEmpty && !row[field].trim()) throw new Error(`${label}의 ${field}: 값이 비어 있습니다.`);
}

function requireImageUrl(value, label) {
  let url;
  try { url = new URL(value); } catch { /* Rejected below. */ }
  if (!url || !["http:", "https:"].includes(url.protocol) || !url.hostname) {
    throw new Error(`${label}: HTTP(S) 주소여야 합니다.`);
  }
}

async function readPreviousRows(path, prepare, label) {
  if (!await pathExists(path)) return null;
  try {
    return prepare(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    throw new Error(`${label} 기존 파일 검증 실패: ${error instanceof SyntaxError ? "올바른 JSON이 아닙니다." : error.message}`);
  }
}

export function prepareKanji(rows, previousCount = 0) {
  if (!Array.isArray(rows) || rows.length < MIN_KANJI_COUNT) {
    throw new Error(`한자 데이터는 최소 ${MIN_KANJI_COUNT}개가 필요합니다.`);
  }
  if (rows.length < previousCount * MIN_RETAINED_RATIO) {
    throw new Error(`한자 개수가 기존 ${previousCount}개에서 ${rows.length}개로 10% 넘게 감소했습니다.`);
  }
  const seen = new Set();
  const memoryNumbers = new Set();
  const ministryNumbers = new Set();
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`한자 ${index + 1}번 항목이 객체가 아닙니다.`);
    }
    const label = `한자 ${index + 1}번 항목 (${typeof row["한자"] === "string" ? row["한자"].slice(0, 4) : "식별자 없음"})`;
    for (const field of ["한자", "훈, 음", "훈", "학년", "풀이", "이미지 1"]) {
      requireStringField(row, field, label);
    }
    const character = row["한자"].trim();
    if (!/^\p{Script=Han}$/u.test(character)) {
      throw new Error(`${label}의 한자는 한 글자여야 합니다.`);
    }
    if (seen.has(character)) throw new Error(`중복 한자가 있습니다: ${character}`);
    seen.add(character);
    if (!GRADE_PATTERN.test(row["학년"])) {
      throw new Error(`${label}의 학년이 올바르지 않습니다.`);
    }
    const isReference = row["학년"] === "참고";
    for (const field of ["암기순", "문부성"]) {
      const value = row[field];
      if (field === "문부성" && isReference && value === "") continue;
      const numbers = field === "암기순" ? memoryNumbers : ministryNumbers;
      if (numbers.has(value)) throw new Error(`${label}의 ${field}: 번호가 중복됩니다.`);
      numbers.add(value);
    }
    if (typeof row["음"] !== "string" || (!isReference && !row["음"].trim())) {
      throw new Error(`${label}의 음이 올바르지 않습니다.`);
    }
    if (typeof row["등급"] !== "string" ||
        !(/^JLPT N[1-5]$/.test(row["등급"]) || (isReference && row["등급"] === ""))) {
      throw new Error(`${label}의 등급이 올바르지 않습니다.`);
    }
    for (const field of ["암기순", "획"]) {
      if (!Number.isSafeInteger(row[field]) || row[field] < 1) {
        throw new Error(`${label}의 ${field}는 양의 정수여야 합니다.`);
      }
    }
    if (!(Number.isSafeInteger(row["문부성"]) && row["문부성"] > 0) &&
        !(isReference && row["문부성"] === "")) {
      throw new Error(`${label}의 문부성 순서가 올바르지 않습니다.`);
    }
    requireImageUrl(row["이미지 1"], `${label}의 이미지 1`);
    requireStringField(row, "획순 이미지", label);
    requireImageUrl(row["획순 이미지"], `${label}의 획순 이미지`);
    // Only 壴 currently has an intentionally empty reference reading.
    requireStringField(row, "발음", label, isReference && character === "壴");
    const reading = row["발음"].trim();
    if (reading && !(isReference && reading === "無し") &&
        !reading.split(/\s*\|\s*/).every((part) => /^(㉧|㉭|㉫)\s*\S+/.test(part))) {
      throw new Error(`${label}의 발음: 읽기 표식과 값이 필요합니다.`);
    }
    if (!isReference && reading === "無し") throw new Error(`${label}의 발음: 일반 한자의 읽기가 없습니다.`);
    requireStringField(row, "예시단어", label, isReference);
    const examples = row["예시단어"].split("\n").map((line) => line.trim())
      .filter((line) => line && !["-", "㉧", "㉭", "㉫"].includes(line));
    if ((!isReference && !examples.length) || examples.some((line) => !/^\S+[（(][^()（）]+[)）]\s*\S+/.test(line))) {
      throw new Error(`${label}의 예시단어: 단어(읽기) 뜻 형식이 필요합니다.`);
    }
    return pick(row, KANJI_FIELDS);
  });
}

export function prepareStories(rows) {
  if (!Array.isArray(rows) || rows.length < 1) {
    throw new Error("독해 데이터가 비어 있거나 배열이 아닙니다.");
  }
  const seen = new Set();
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`독해 ${index + 1}번 항목이 객체가 아닙니다.`);
    }
    for (const field of STORY_FIELDS) {
      requireStringField(row, field, `독해 ${index + 1}번 항목 (${typeof row.id === "string" ? row.id : "ID 없음"})`);
    }
    if (row.id !== row.id.trim()) throw new Error(`독해 ${index + 1}번 항목의 id: 앞뒤 공백은 허용되지 않습니다.`);
    if (seen.has(row.id)) throw new Error(`중복 독해 ID가 있습니다: ${row.id}`);
    seen.add(row.id);
    if (!["학년별", "JLPT"].includes(row.category)) throw new Error(`독해 ${row.id}의 category: 지원하지 않는 분류입니다.`);
    const validLevel = row.category === "학년별"
      ? GRADE_PATTERN.test(row.level) && row.level !== "참고"
      : /^JLPT N(?:[1-5](?:-[1-9]\d*|\([1-9]\d*\))?|4·5)$/.test(row.level);
    if (!validLevel) throw new Error(`독해 ${row.id}의 level: 지원하지 않는 학년/등급입니다.`);
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

export function protectStoryIds(previous, incoming, allowedRemovals = []) {
  const nextIds = new Set(incoming.map((row) => row.id));
  const previousIds = new Set((previous || []).map((row) => row.id));
  const removed = [...previousIds].filter((id) => !nextIds.has(id));
  const allowed = new Set(allowedRemovals);
  if (allowed.size !== allowedRemovals.length || [...allowed].some((id) => !removed.includes(id))) {
    throw new Error("독해 삭제 확인 ID: 실제 삭제되는 기존 ID만 각각 한 번 지정하세요.");
  }
  const unconfirmed = removed.filter((id) => !allowed.has(id));
  if (unconfirmed.length) throw new Error(`독해 기존 ID 삭제/감소가 감지되었습니다: ${unconfirmed.join(", ")}`);
}

async function writeAndVerify(path, data) {
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(path, serialized, { encoding: "utf8", flag: "wx" });
  const verified = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(verified) || verified.length !== data.length) {
    throw new Error(`임시 파일 검증에 실패했습니다: ${path}`);
  }
}

export async function replaceDataFiles(kanji, stories, { directory = dataDirectory, renameFile = rename } = {}) {
  const kanjiPath = resolve(directory, "kanji.json");
  const storiesPath = resolve(directory, "stories.json");
  const dataDirectory = directory;
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
  let keepBackups = false;

  try {
    await writeAndVerify(kanjiTemp, kanji);
    await writeAndVerify(storiesTemp, stories);
    kanjiBackedUp = await pathExists(kanjiPath);
    storiesBackedUp = await pathExists(storiesPath);
    if (kanjiBackedUp) await copyFile(kanjiPath, kanjiBackup);
    if (storiesBackedUp) await copyFile(storiesPath, storiesBackup);
    replacementStarted = true;
    await renameFile(kanjiTemp, kanjiPath);
    await renameFile(storiesTemp, storiesPath);
  } catch (error) {
    if (replacementStarted) {
      const restored = await Promise.allSettled([
        kanjiBackedUp ? copyFile(kanjiBackup, kanjiPath) : rm(kanjiPath, { force: true }),
        storiesBackedUp ? copyFile(storiesBackup, storiesPath) : rm(storiesPath, { force: true }),
      ]);
      keepBackups = restored.some((result) => result.status === "rejected");
    }
    throw new Error(`파일 쓰기/교체 실패${keepBackups ? "; 복원 실패로 백업을 보존했습니다" : "; 이전 상태로 복원했습니다"}: ${error.message}`);
  } finally {
    await Promise.all(cleanup.filter((path) => !keepBackups || !path.endsWith(".backup")).map((path) => rm(path, { force: true })));
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !/^--allow-story-removal=\S+$/.test(arg))) {
    throw new Error("허용 옵션: --allow-story-removal=삭제할-ID (ID별 반복 지정)");
  }
  const allowedRemovals = args.map((arg) => arg.slice("--allow-story-removal=".length));
  if (await pathExists(envPath)) process.loadEnvFile(envPath);
  const url = String(process.env.MANABO_SHEETS_API_URL ?? "").trim();
  if (!url) {
    throw new Error(
      ".env.local에 MANABO_SHEETS_API_URL을 설정한 뒤 다시 실행하세요.",
    );
  }

  const previous = await readPreviousRows(kanjiPath, prepareKanji, "한자");
  const previousCount = previous?.length ?? 0;
  const previousStories = await readPreviousRows(storiesPath, prepareStories, "독해");

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Apps Script 요청 실패: HTTP ${response.status}`);
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error("Apps Script JSON 응답 해석에 실패했습니다."); }
  if (!payload || typeof payload !== "object" || payload.ok === false) {
    throw new Error("Apps Script 응답이 올바르지 않습니다.");
  }

  const kanji = prepareKanji(payload.kanji, previousCount);
  const stories = prepareStories(payload.stories);
  protectStoryIds(previousStories, stories, allowedRemovals);
  await replaceDataFiles(kanji, stories);

  console.log(`동기화 완료: ${new Date().toISOString()}`);
  console.log(`한자: ${kanji.length.toLocaleString("ko-KR")}개`);
  console.log(`독해: ${stories.length.toLocaleString("ko-KR")}개`);
}

if (process.argv[1] && await realpath(process.argv[1]) === await realpath(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`동기화 실패: ${error.message}`);
    console.error(error.message.includes("복원 실패") ? "보존한 백업에서 수동 복원이 필요합니다." : "기존 JSON 파일은 유지됩니다.");
    process.exitCode = 1;
  });
}
