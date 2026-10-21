import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const origin = "https://kanjimanabo.com";
const grades = [
  ["primary-1", "초등학교 1학년"], ["primary-2", "초등학교 2학년"],
  ["primary-3", "초등학교 3학년"], ["primary-4", "초등학교 4학년"],
  ["primary-5", "초등학교 5학년"], ["primary-6", "초등학교 6학년"],
  ["middle-1", "중학 1"], ["middle-2", "중학 2"],
  ["high-1", "고교 1"], ["high-2", "고교 2"], ["reference", "참고"],
];
export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[ch]);
const e = escapeHtml;
const paragraphs = (value) => String(value).split(/\n\s*\n/).filter(Boolean)
  .map((line) => `<p>${e(line)}</p>`).join("\n");
const lines = (value) => e(value).replace(/\n/g, "<br />");
const link = (href, label) => `<a href="${e(href)}">${e(label)}</a>`;
const list = (items) => `<ul class="material-links">${items.map((item) => `<li>${item}</li>`).join("\n")}</ul>`;

// Publish the existing, curated source data as readable documents, grouped by
// learning range. No new facts, summaries or mnemonic explanations are invented.
export function materialPages({ kanji, stories }) {
  if (!kanji.length || !stories.length) throw new Error("학습 자료가 비어 있습니다.");
  if (kanji.some((row) => !grades.some(([, name]) => row["학년"] === name))) {
    throw new Error("새 학년의 자료 경로를 먼저 지정해 주세요.");
  }
  const groups = grades.map(([slug, name]) => ({
    path: `materials/kanji/${slug}`, name,
    rows: kanji.filter((row) => row["학년"] === name).sort((a, b) => a["문부성"] - b["문부성"]),
  })).filter((group) => group.rows.length);
  const seen = new Set();
  for (const story of stories) {
    if (!/^[a-z0-9-]+$/.test(story.id) || seen.has(story.id)) throw new Error("독해 자료 ID가 잘못되었거나 중복입니다.");
    if (!story.versions?.length || story.versions.some((v) => !v.body?.trim())) throw new Error("독해 본문이 비어 있습니다.");
    seen.add(story.id);
  }
  const readingPath = (story) => `materials/reading/${story.id}`;
  const readingLink = (story) => link(`/${readingPath(story)}/`, `${story.level} · ${story.title}`);
  const pages = [{
    path: "materials", title: "한자 학습 자료 모음",
    description: "학년별 한자 뜻·일본어 읽기·암기 풀이·예시 단어와 한자 혼용 독해 본문을 읽어 보세요. 마나보의 학습 자료와 활용 방법을 안내합니다.",
    body: `<h1>한자 학습 자료 모음</h1>
<p class="info-lead">그림으로 기억한 한자를 읽기와 단어, 이야기로 연결해 보세요.</p>
<p>도감에서 살펴보던 ${kanji.length.toLocaleString("ko-KR")}자의 뜻·읽기·암기 풀이와 독해 ${stories.length}편의 본문을 모았습니다. 아래에서 학습 범위를 고르면 자료를 바로 읽을 수 있습니다.</p>
<h2 id="kanji-materials">학년별 한자 풀이와 단어</h2>
${list(groups.map((group) => link(`/${group.path}/`, `${group.name} · ${group.rows.length}자`)))}
<h2 id="reading-materials">한자 혼용 독해</h2>
<p>한국어 문장에 일본어 한자를 섞은 암기 연습용 창작 글입니다. 한국어 문맥으로 한자의 뜻을 떠올리는 데 활용하고, 일본어 발음은 도감의 읽기와 예시 단어에서 따로 확인해 주세요. 일본어 원문이나 JLPT 실전 독해 지문은 아닙니다.</p>
${["학년별", "JLPT"].map((category) => `<h3>${category}</h3>${list(stories.filter((story) => story.category === category).map(readingLink))}`).join("\n")}
<h2>자료를 활용하는 순서</h2>
<ol><li>한 학습 범위에서 모양이 헷갈리는 한자를 골라 뜻과 암기 풀이를 읽어 보세요. 풀이를 가리고 글자만 보며 뜻을 떠올려 봅니다.</li>
<li>읽기를 확인한 뒤 예시 단어를 소리 내어 읽어 보세요. 같은 한자도 단어에 따라 읽는 법이 달라질 수 있으니 단어와 함께 기억합니다.</li>
<li>독해에서 아는 한자를 찾아 뜻을 떠올려 보세요. 뜻을 몰랐던 한자는 도감으로 돌아가 풀이와 단어를 다시 확인합니다.</li>
<li>${link("/quiz/", "한자 문제")}에서 같은 범위를 선택해 복습하세요. 이 문제는 한국어 훈음을 고르는 연습이므로 일본어 읽기도 예시 단어로 따로 확인해 주세요.</li></ol>
<h2>암기 풀이를 읽을 때</h2>
<p>마나보의 풀이는 글자의 모양을 이야기와 연결하기 위해 운영자가 기획·작성한 기억 보조 설명입니다. 역사적 어원이나 글자의 실제 형성 과정을 설명하는 자료와는 다를 수 있습니다. 그림도 해당 풀이를 기억하도록 AI 도구를 활용해 제작했습니다.</p>
<p>학년·JLPT 표시는 학습 범위를 나누기 위한 참고 분류입니다. 잘못된 풀이·읽기·단어를 발견하면 ${link("/contact/", "문의하기")}로 한자와 문제가 되는 부분을 알려주세요.</p>`,
  }];
  for (const group of groups) {
    const related = stories.filter((story) => story.category === "학년별" && story.level === group.name);
    pages.push({
      path: group.path, title: `${group.name} 한자 풀이와 단어`,
      description: `${group.name} 범위 ${group.rows.length}자의 뜻과 일본어 읽기, 마나보 암기 풀이, 예시 단어를 함께 공부합니다.`,
      body: `<h1>${e(group.name)} 한자 풀이와 단어</h1>
<p>${group.rows.length}자의 뜻·읽기와 기억을 돕는 풀이를 모았습니다. 암기 풀이는 역사적 어원과 다를 수 있으며, 학년 분류는 마나보의 학습 범위입니다.</p>
${group.name === "참고" ? "<p>참고 범위에는 예시 단어가 등록되지 않은 항목이 있습니다.</p>" : ""}
<p>${link(`/kanji/?grade=${encodeURIComponent(group.name === "참고" ? "" : group.name)}`, "그림 카드로 공부하기")} · ${link("/materials/", "다른 학습 범위 보기")}</p>
<nav aria-label="이 페이지의 한자" class="material-character-index">${group.rows.map((row) => link(`#char-${encodeURIComponent(row["한자"])}`, row["한자"])).join(" ")}</nav>
${group.rows.map((row) => `<section class="material-entry" id="char-${e(row["한자"])}">
<h2><span lang="ja">${e(row["한자"])}</span> · ${e(row["훈, 음"])}</h2>
<dl>${row["발음"] ? `<dt>일본어 읽기</dt><dd lang="ja">${e(row["발음"])}</dd>` : ""}
<dt>암기 풀이</dt><dd>${lines(row["풀이"])}</dd>
${row["예시단어"] ? `<dt>예시 단어</dt><dd class="material-words">${lines(row["예시단어"])}</dd>` : ""}</dl>
<p>${link(`/kanji/#kanji=${encodeURIComponent(row["한자"])}`, `${row["한자"]} 그림과 상세 정보 보기`)}</p></section>`).join("\n")}
${related.length ? `<h2>이 범위의 독해</h2>${list(related.map(readingLink))}` : ""}`,
    });
  }
  for (const story of stories) {
    const group = groups.find((group) => story.category === "학년별" && group.name === story.level);
    pages.push({
      path: readingPath(story), title: `${story.title} | ${story.level} 한자 독해`,
      description: `${story.level} 한자 혼용 독해 「${story.title}」. 한국어 문맥에서 한자의 뜻을 떠올리는 마나보 암기 연습 자료입니다.`,
      body: `<p class="info-meta">${e(story.category)} · ${e(story.level)}</p><h1>${e(story.title)}</h1>
<p class="info-note">한국어 문장에 일본어 한자를 섞은 창작 학습 글입니다. 한자의 뜻을 떠올리는 연습에 활용하세요. 일본어 발음은 도감에서 따로 확인할 수 있습니다.</p>
<p>${link(`/reading/?story=${encodeURIComponent(story.id)}`, "한자를 누르며 독해 연습하기")} · ${link("/materials/#reading-materials", "독해 목록 보기")}${group ? ` · ${link(`/${group.path}/`, "이 범위의 한자 풀이")}` : ""}</p>
<article class="material-story" aria-label="독해 본문">${story.versions.map((version) => `${story.versions.length > 1 ? `<h2>${e(version.label)}</h2>` : ""}${paragraphs(version.body)}`).join("\n")}</article>
<p>모르는 한자는 ${link("/kanji/", "한자 도감")}에서 검색해 읽기와 예시 단어를 확인해 보세요.</p>`,
    });
  }
  return pages;
}

export const materialTemplatePath = fileURLToPath(new URL("src/materials.html", root));
export function writeMaterialPages() {
  const kanji = JSON.parse(readFileSync(new URL("public/data/kanji.json", root), "utf8"));
  const stories = JSON.parse(readFileSync(new URL("public/data/stories.json", root), "utf8"));
  const template = readFileSync(materialTemplatePath, "utf8");
  const pages = materialPages({ kanji, stories });
  for (const page of pages) {
    const values = { TITLE: e(`${page.title} | 마나보`), DESCRIPTION: e(page.description), URL: `${origin}/${page.path}/`, BODY: page.body,
      BACK: page.path === "materials" ? link("/", "← 홈으로 돌아가기") : link("/materials/", "← 학습 자료 모음"),
    };
    const html = template.replace(/\{\{(TITLE|DESCRIPTION|URL|BODY|BACK)\}\}/g, (_, key) => values[key]);
    const directory = new URL(`${page.path}/`, root);
    mkdirSync(directory, { recursive: true });
    writeFileSync(new URL("index.html", directory), html);
  }
  return pages;
}

export function writeSitemap(directory, pages) {
  const base = readFileSync(new URL("public/sitemap.xml", root), "utf8");
  const additional = pages.map((page) => `  <url><loc>${origin}/${page.path}/</loc></url>`).join("\n");
  writeFileSync(new URL("sitemap.xml", directory), base.replace("</urlset>", `${additional}\n</urlset>`));
}
