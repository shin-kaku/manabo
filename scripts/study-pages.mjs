import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
export const studyPages = [
  { path: "kanji", section: "kanji", title: "한자 도감", description: "부수별 추천순·학년·JLPT별로 학습 범위를 찾아보고, 그림과 암기 풀이로 일본어 한자를 익혀보세요." },
  { path: "reading", section: "story", title: "한자 독해", description: "학년·JLPT별 학습 글에서 문장 속 한자를 읽고, 모르는 한자를 눌러 뜻과 정보를 확인해 보세요." },
  { path: "quiz", section: "game", title: "한자 문제", description: "학년·JLPT별로 범위를 정해, 한자의 뜻과 음을 고르는 문제로 복습해 보세요." },
];

// All study pages share index.html, so layout changes only need one edit.
export function writeStudyPages() {
  const template = readFileSync(new URL("index.html", root), "utf8");
  for (const page of studyPages) {
    let html = template
      .replace(/<title>[^<]*<\/title>/, `<title>마나보 | ${page.title}</title>`)
      .replace(/(<meta\s+name="description"\s+content=")[^"]*("\s*\/>)/, `$1${page.description}$2`)
      .replace(/(<meta\s+property="og:title"\s+content=")[^"]*("\s*\/>)/, `$1마나보 | ${page.title}$2`)
      .replace(/(<meta\s+property="og:description"\s+content=")[^"]*("\s*\/>)/, `$1${page.description}$2`);
    for (const candidate of studyPages) {
      const view = `${candidate.section === "story" ? "story" : candidate.section === "game" ? "game" : "kanji"}View`;
      html = html.replace(new RegExp(`(<section id="${view}" class="[^"]*")(?: hidden)?(>)`), `$1${candidate === page ? "" : " hidden"}$2`);
      const id = candidate.section === "kanji" ? "navKanji" : candidate.section === "story" ? "navStory" : "navGame";
      html = html.replace(new RegExp(`(<a id="${id}" class=")[^"]*(" href="[^"]*")(?: aria-current="page")?`), `$1site-tab${candidate === page ? " active" : ""}$2${candidate === page ? ' aria-current="page"' : ""}`);
    }
    const directory = new URL(`${page.path}/`, root);
    mkdirSync(directory, { recursive: true });
    writeFileSync(new URL("index.html", directory), html);
  }
}

export const studyTemplatePath = fileURLToPath(new URL("index.html", root));
