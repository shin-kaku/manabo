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
<p>학년·JLPT별 독해 지문을 고르려면 자바스크립트를 켜 주세요.</p>`,
  game: `<p class="quiz-guide">같은 한자도 <strong class="learning-action">여러 방식</strong>으로 만나면 더 오래 기억에 남아요.</p>
<h1>한자 학습</h1>
<ul><li><a href="/learn/choice/">사지선다</a> · 보는 순간 뜻과 음이 떠오를 때까지, 기억을 꺼내는 훈련</li><li><a href="/learn/words/">단어</a> · JLPT 시험지 그대로, 동그라미 치며 읽기와 표기를 익히는 실전 연습</li><li><a href="/reading/">독해</a> · 급수 한자를 모두 담은 한 문장. 막힘없이 읽으면 그&nbsp;급수는 정복</li><li>한자 게임 · 준비 중</li></ul>`,
  choice: `<a href="/learn/">← 한자 학습으로</a>
<h1>사지선다</h1>
<p>‘나무 목’과 ‘눈 목’ 가운데 <span lang="ja">目</span>의 훈음은 어느 쪽일까요?</p>
<details><summary>정답과 풀이 보기</summary><p>目의 훈음은 ‘눈 목’입니다. 눈으로 무엇을 보는 상황을 떠올려 보세요. ‘나무 목’은 木이라고 씁니다.</p></details>
<p><a href="/kanji/">한자 도감에서 뜻과 음 확인하기</a></p>`,
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
