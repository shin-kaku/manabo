import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { studySeo } from "../src/seo.js";
import { writeGeneratedFile } from "./generated-file.mjs";

const root = new URL("../", import.meta.url);
export const studyPages = [
  { path: "kanji", section: "kanji", title: "한자 도감" },
  { path: "reading", section: "story", title: "한자 독해" },
  { path: "quiz", section: "game", title: "한자 문제" },
];

const studyFallback = {
  kanji: `<h2>한자 도감 읽기</h2>
<p><span lang="ja">木</span>과 <span lang="ja">目</span>은 한국 한자음이 모두 ‘목’입니다. 木은 나무를, 目은 눈을 뜻합니다. 두 글자의 뜻을 먼저 구별한 뒤 예시 단어에서 일본어 읽기를 확인해 보세요.</p>
<p><a href="/materials/kanji/primary-1/#char-木">木의 풀이와 예시</a> · <a href="/materials/kanji/primary-1/#char-目">目의 풀이와 예시</a> · <a href="/materials/">학년별 도감 찾아보기</a></p>`,
  story: `<h2>한자 독해 읽기</h2>
<p>“집 앞의 큰 木 아래에 앉아 本을 펼쳤다.” 이 문장에서 木은 나무이고, 本은 손에 든 책입니다. 한국어 문맥에 맞춰 뜻을 짐작한 다음 소리 내어 문장을 읽어 보세요.</p>
<p><a href="/materials/#reading-materials">학년·JLPT별 창작 독해 고르기</a></p>`,
  game: `<h2>한자 한 문제 풀기</h2>
<p>‘나무 목’과 ‘눈 목’ 가운데 <span lang="ja">目</span>의 훈음은 어느 쪽일까요?</p>
<details><summary>정답과 풀이 보기</summary><p>目의 훈음은 ‘눈 목’입니다. 눈으로 무엇을 보는 상황을 떠올려 보세요. ‘나무 목’은 木이라고 씁니다.</p></details>
<p><a href="/materials/kanji/primary-1/#char-目">目의 읽기와 단어로 복습하기</a> · <a href="/materials/">다른 학년의 한자 찾아보기</a></p>`,
};

// All study pages share src/study.html; the home page has its own introduction.
export function writeStudyPages() {
  const template = readFileSync(new URL("src/study.html", root), "utf8");
  for (const page of studyPages) {
    let html = template
      .replace("{{STUDY_FALLBACK}}", studyFallback[page.section])
      .replace(/<title>[^<]*<\/title>/, `<title>${studySeo[page.section].title}</title>`)
      .replace(/(<meta\s+name="description"\s+content=")[^"]*("\s*\/>)/, `$1${studySeo[page.section].description}$2`)
      .replace(/(<meta\s+property="og:title"\s+content=")[^"]*("\s*\/>)/, `$1${studySeo[page.section].ogTitle || studySeo[page.section].title}$2`)
      .replace(/(<meta\s+property="og:description"\s+content=")[^"]*("\s*\/>)/, `$1${studySeo[page.section].description}$2`)
      .replace(/(<link\s+rel="canonical"\s+href=")[^"]*("\s*\/>)/, `$1${studySeo[page.section].canonical}$2`)
      .replace(/(<meta\s+property="og:url"\s+content=")[^"]*("\s*\/>)/, `$1https://kanjimanabo.com/${page.path}/$2`);
    for (const candidate of studyPages) {
      const view = `${candidate.section === "story" ? "story" : candidate.section === "game" ? "game" : "kanji"}View`;
      html = html.replace(new RegExp(`(<section id="${view}" class="[^"]*")(?: hidden)?(>)`), `$1${candidate === page ? "" : " hidden"}$2`);
      const id = candidate.section === "kanji" ? "navKanji" : candidate.section === "story" ? "navStory" : "navGame";
      html = html.replace(new RegExp(`(<a id="${id}" class=")[^"]*(" href="[^"]*")(?: aria-current="page")?`), `$1site-tab${candidate === page ? " active" : ""}$2${candidate === page ? ' aria-current="page"' : ""}`);
    }
    const directory = new URL(`${page.path}/`, root);
    mkdirSync(directory, { recursive: true });
    writeGeneratedFile(new URL("index.html", directory), html);
  }
}

export const studyTemplatePath = fileURLToPath(new URL("src/study.html", root));
