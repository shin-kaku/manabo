import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writeGeneratedFile } from "./generated-file.mjs";
import { studyNavigation } from "./study-nav.mjs";
import { escapeHtml as e } from "./html.mjs";
export { escapeHtml } from "./html.mjs";

const root = new URL("../", import.meta.url);
const origin = "https://kanjimanabo.com";
const kanji = JSON.parse(readFileSync(new URL("public/data/kanji.json", root), "utf8"));
const characters = kanji.map(row => row["한자"]);
if (new Set(characters).size !== characters.length || characters.some(ch => !/^\p{Script=Han}$/u.test(ch))) {
  throw new Error("도감의 한자 식별자는 중복 없는 한 글자여야 합니다.");
}
// The browser and the page generator must resolve the same character URLs after a Sheets sync.
writeGeneratedFile(new URL("src/catalog-characters.json", root), JSON.stringify(characters.join("")) + "\n");
const { characterPages, comparisonPath } = await import("./character-pages.mjs");
const { directoryPageTemplate, materialDirectory } = await import("./material-directory.mjs");
const { directoryFields } = await import("../src/material-directory-data.js");

const grades = [
  ["primary-1", "초등학교 1학년"], ["primary-2", "초등학교 2학년"],
  ["primary-3", "초등학교 3학년"], ["primary-4", "초등학교 4학년"],
  ["primary-5", "초등학교 5학년"], ["primary-6", "초등학교 6학년"],
  ["middle-1", "중학 1"], ["middle-2", "중학 2"],
  ["high-1", "고교 1"], ["high-2", "고교 2"], ["reference", "참고"],
];
const levels = ["N5", "N4", "N3", "N2", "N1"].map((level) => [level.toLowerCase(), `JLPT ${level}`]);

if (kanji.some((row) => !grades.some(([, name]) => row["학년"] === name))) {
  throw new Error("도감에 새 학년 필터를 먼저 추가해 주세요.");
}
if (kanji.some((row) => row["등급"] && !levels.some(([, name]) => row["등급"] === name))) {
  throw new Error("도감에 새 JLPT 필터를 먼저 추가해 주세요.");
}

export const materialTemplatePath = fileURLToPath(new URL("src/materials.html", root));

function wordQuizDirections(rows) {
  const gradeByCharacter = new Map(rows.map(row => [row["한자"], row["등급"]]));
  const learned = new Set();
  const directions = {};
  for (const [slug, grade] of levels) {
    learned.add(grade);
    const form = (kanjiForm, kanaForm) =>
      (kanjiForm.match(/\p{Script=Han}/gu) ?? []).every(ch => learned.has(gradeByCharacter.get(ch))) ? kanjiForm : kanaForm;
    const separator = slug === "n5" || slug === "n4" ? " " : "";
    const phrase = (...parts) => parts.join(separator);
    const next = form("次の", "つぎの");
    const word = form("言葉", "ことば");
    const reading = form("読み", "よみ") + form("方", "かた");
    const select = phrase(form("一番", "いちばん"), form("良い", "よい"), "ものを、1・2・3・4から",
      form("一つ", "ひとつ"), form("選んで", "えらんで"), "ください。");
    directions[slug.toUpperCase()] = {
      reading: phrase(next, word + "の", reading + "として", select),
      spelling: phrase(next, word + "を", form("漢字", "かんじ") + "で", form("書く", "かく") + "とき、", select),
    };
  }
  return directions;
}

export function writeMaterialPages() {
  const template = readFileSync(materialTemplatePath, "utf8");
  const media = JSON.parse(readFileSync(new URL("public/data/media.json", root), "utf8"));
  const wordCounts = JSON.parse(readFileSync(new URL("public/data/jlpt-words/counts.json", root), "utf8"));
  const wordQuiz = {
    path: "learn/words", title: "단어",
    description: "JLPT 급수별 단어의 읽기와 한자 표기를 시험지 형식으로 연습하고 틀린 단어를 복습하세요.",
    body: readFileSync(new URL("src/jlpt-words.html", root), "utf8")
      .replace("[[WORD_COUNTS]]", () => e(JSON.stringify(wordCounts)))
      .replace("[[WORD_DIRECTIONS]]", () => e(JSON.stringify(wordQuizDirections(kanji))))
      .replace(/\[\[(N[1-5])\]\]/g, (_, level) => wordCounts[level].toLocaleString("ko-KR")),
  };
  const textbook = { path: "book", title: "한자 교재", description: "준비중", body: "<h1>준비중</h1>" };
  const pages = [materialDirectory(kanji, levels, grades), textbook, wordQuiz, ...characterPages(kanji, media)];
  const zoomScript = readFileSync(new URL("src/entry-art-zoom.js", root), "utf8");
  const entryTemplate = template.replace("</head>", '<link rel="stylesheet" href="/src/character-pages.css">\n</head>')
    .replace("</body>", '<script type="module" src="/src/character-page.js"></script>\n</body>');
  // Keep the return link usable with its filters while the detail modules load.
  const catalogReturn = `<div class="story-view"><a class="story-exit" data-entry-catalog href="/kanji/"><span aria-hidden="true">←</span> 한자 도감으로</a></div>
<script>
  {
    const source = new URLSearchParams(location.search);
    const filters = new URLSearchParams();
    for (const key of ${JSON.stringify(directoryFields)}) {
      const value = source.get(key);
      if (value) filters.set(key, value);
    }
    if (filters.size) document.querySelector("[data-entry-catalog]").search = filters.toString();
  }
</script>`;
  const entryDetailTemplate = entryTemplate.replace("</head>", () => `<script>${zoomScript}</script>\n</head>`)
    .replace('<main class="info-page material-page">',
      () => `${catalogReturn}\n<main class="info-page material-page entry-detail">`);
  const directoryTemplate = directoryPageTemplate(template, studyNavigation("navKanji"));
  const wordTemplate = template.replace("</header>", "</header>\n" + studyNavigation("navGame"))
    .replace('<main class="info-page material-page">', '<div class="story-view"><a class="story-exit" href="/learn/">← 한자 학습으로</a></div>\n<main class="info-page vocab-page">')
    .replace('<div class="info-back">{{BACK}}</div>', "")
    .replace("</head>", '<link rel="stylesheet" href="/src/study-quiz.css">\n</head>')
    .replace("</body>", '<script type="module" src="/src/jlpt-words.js"></script>\n</body>');
  const textbookTemplate = template.replace("</header>", "</header>\n" + studyNavigation("navBooks"))
    .replace('<div class="info-back">{{BACK}}</div>', "");
  for (const page of pages) {
    let pageTemplate = template;
    if (page.path === "kanji") pageTemplate = directoryTemplate;
    else if (page.path === wordQuiz.path) pageTemplate = wordTemplate;
    else if (page.path === textbook.path) pageTemplate = textbookTemplate;
    else if (page.path === comparisonPath) pageTemplate = entryTemplate;
    else if (page.path.startsWith("kanji/")) pageTemplate = entryDetailTemplate;
    const values = { TITLE: e(`${page.title} | 마나보`), DESCRIPTION: e(page.description), URL: `${origin}/${page.path}/`, BODY: page.body,
      BACK: page.back ?? "",
    };
    const html = pageTemplate.replace(/\{\{(TITLE|DESCRIPTION|URL|BODY|BACK)\}\}/g, (_, key) => values[key]);
    const directory = new URL(`${page.path}/`, root);
    mkdirSync(directory, { recursive: true });
    writeGeneratedFile(new URL("index.html", directory), html);
  }
  return pages;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(writeMaterialPages().map(page => page.path)));
}
