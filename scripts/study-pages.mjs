import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { studyNavigation } from "./study-nav.mjs";
import { studySeo } from "../src/seo.js";
import { writeGeneratedFile } from "./generated-file.mjs";

const root = new URL("../", import.meta.url);
export const studyPages = [
  { path: "reading", section: "story", visible: ["storyView"] },
  { path: "learn", section: "game", visible: ["gameView", "quizOptions"] },
  { path: "learn/choice", section: "choice", visible: ["choiceBack", "gameView", "choice-card"] },
];

const studyFallback = {
  story: `<a href="/learn/">← 한자 학습으로</a>
<h2>독해</h2>
<p>“집 앞의 큰 木 아래에 앉아 本을 펼쳤다.” 이 문장에서 木은 나무이고, 本은 손에 든 책입니다. 한국어 문맥에 맞춰 뜻을 짐작한 다음 소리 내어 문장을 읽어 보세요.</p>
<p><a href="/materials/#reading-materials">학년·JLPT별 창작 독해 고르기</a></p>`,
  game: `<p class="quiz-guide">같은 한자도 <strong class="learning-action">여러 방식</strong>으로 만나면 더 오래 기억에 남아요.</p>
<h1>한자 학습</h1>
<ul><li><a href="/learn/choice/">사지선다</a></li><li><a href="/reading/">독해</a> · 한 문장에 급수 한자 전부. 문장 속 한자를 우리말로 막힘없이 읽으면 JLPT 정복</li><li>한자 게임 · 준비 중</li></ul>`,
  choice: `<a href="/learn/">← 한자 학습으로</a>
<h1>사지선다</h1>
<p>‘나무 목’과 ‘눈 목’ 가운데 <span lang="ja">目</span>의 훈음은 어느 쪽일까요?</p>
<details><summary>정답과 풀이 보기</summary><p>目의 훈음은 ‘눈 목’입니다. 눈으로 무엇을 보는 상황을 떠올려 보세요. ‘나무 목’은 木이라고 씁니다.</p></details>
<p><a href="/materials/kanji/primary-1/">초등학교 1학년 한자 목록</a> · <a href="/materials/">다른 학년의 한자 찾아보기</a></p>`,
};

// All study pages share src/study.html; the home page has its own introduction.
export function writeStudyPages() {
  const template = readFileSync(new URL("src/study.html", root), "utf8");
  for (const page of studyPages) {
    const seo = studySeo[page.section];
    const html = template
      .replace("{{STUDY_NAV}}", studyNavigation("navGame"))
      .replace(/<(?:section|div) id="(choiceBack|storyView|gameView|quizOptions|choice-card)"[^>]*>/g,
        (tag, id) => tag.replace(/ hidden(?=[\s>])/, "").replace(/>$/, page.visible.includes(id) ? ">" : " hidden>"))
      .replace("{{STUDY_FALLBACK}}", studyFallback[page.section])
      .replace(/<title>[^<]*<\/title>/, `<title>${seo.title}</title>`)
      .replace(/(<meta\s+name="description"\s+content=")[^"]*("\s*\/>)/, `$1${seo.description}$2`)
      .replace(/(<meta\s+property="og:title"\s+content=")[^"]*("\s*\/>)/, `$1${seo.ogTitle || seo.title}$2`)
      .replace(/(<meta\s+property="og:description"\s+content=")[^"]*("\s*\/>)/, `$1${seo.description}$2`)
      .replace(/(<link\s+rel="canonical"\s+href=")[^"]*("\s*\/>)/, `$1${seo.canonical}$2`)
      .replace(/(<meta\s+property="og:url"\s+content=")[^"]*("\s*\/>)/, `$1${seo.canonical}$2`);
    const directory = new URL(`${page.path}/`, root);
    mkdirSync(directory, { recursive: true });
    writeGeneratedFile(new URL("index.html", directory), html);
  }
}

export const studyTemplatePath = fileURLToPath(new URL("src/study.html", root));
