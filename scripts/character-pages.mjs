import { readFileSync } from "node:fs";
import { examplePattern, parseExamples, parseReadings } from "../src/reading-groups.js";
import { characterDetailPath, studyDetailHref, studyDirectory } from "../src/study-path.js";
import { mediaCandidates, strokeMediaEntry } from "../src/media.js";
import { driveFileId } from "../src/image-sources.js";
import { escapeHtml as e } from "./html.mjs";

export const comparisonPath = "kanji/compare/trees";
export const characterPath = characterDetailPath;

const treeNotes = [
  "가운데 줄기에서 가지와 뿌리가 뻗습니다.",
  "왼쪽 木의 마지막 획을 짧게 씁니다.",
  "위의 木을 쓴 뒤, 아래의 두 木을 왼쪽부터 씁니다.",
];
const captionHtml = ["나무 한 그루", '나란히 선 <span class="tree-count">두(2)</span> 그루', '위아래로 모인 <span class="tree-count">세(3)</span> 그루'];
const nativeWords = ["木（き） 나무", "林（はやし） 숲", "森（もり） 숲"];

function stroke(row, media) {
  const ch = e(row["한자"]);
  const [url, ...fallbacks] = mediaCandidates(row, "stroke", "detail", media);
  if (!url) return "";
  if (strokeMediaEntry(row, url, media)?.strokeTheme !== "explicit") {
    return `<img class="entry-stroke entry-static-stroke" data-media-fallbacks="${e(JSON.stringify(fallbacks))}" src="${e(url)}" alt="${ch} 획순" width="192" height="192">`;
  }
  return `<picture data-entry-stroke="${e(url)}"><source media="(prefers-reduced-motion: reduce)" srcset="${e(url)}?view=light-still#light-still"><img class="entry-stroke" data-media-fallbacks="${e(JSON.stringify(fallbacks))}" src="${e(url)}#light" alt="${ch} ${e(row["획"])}획의 번호와 쓰는 순서" width="192" height="192"></picture>`;
}

function art(row, media, compact) {
  const [card] = mediaCandidates(row, "image1", "card", media);
  const tcg = mediaCandidates(row, "image1", "detail", media);
  if (![card, tcg[0]].every(url => url?.startsWith("/media/image1/"))) throw Error("암기 그림 누락: " + row["한자"]);
  if (compact) return `<img class="entry-art" data-media-fallbacks="${e(JSON.stringify(tcg.slice(1)))}" width="480" height="480" src="${e(card)}" alt="${e(row["한자"])}의 모양과 뜻을 연결한 암기 그림">`;
  const ml = mediaCandidates(row, "image2", "detail", media);
  const selected = ml.length ? ml : tcg;
  function srcset(kind, field) {
    const entry = media?.items?.[kind]?.[driveFileId(row[field])];
    const variants = [entry?.card, entry?.detail];
    const path = new RegExp(`^/media/${kind}/[a-f0-9]{64}\\.webp$`);
    if (variants.some(item => !path.test(item?.url ?? "") || !Number.isSafeInteger(item.width) || item.width < 1)) return "";
    if (variants[0].width === variants[1].width) return "";
    return variants.map(item => `${item.url} ${item.width}w`).join(", ");
  }
  const mlSrcset = srcset("image2", "이미지 2");
  const tcgSrcset = srcset("image1", "이미지 1");
  const selectedSrcset = ml.length ? mlSrcset : tcgSrcset;
  const img = `<img class="entry-art" data-media-fallbacks="${e(JSON.stringify(selected.slice(1)))}" width="960" height="960" src="${e(selected[0])}"${selectedSrcset ? ` srcset="${e(selectedSrcset)}" sizes="(max-width: 640px) calc((100vw - 96px) / 2), 255px"` : ""} alt="${e(row["한자"])}의 모양과 뜻을 연결한 암기 그림">`;
  const toggle = ml.length ? `<button class="entry-art-switch" type="button" role="switch" aria-label="그림 B 선택" aria-checked="false" data-ml="${e(JSON.stringify(ml))}" data-tcg="${e(JSON.stringify(tcg))}" data-ml-srcset="${e(mlSrcset)}" data-tcg-srcset="${e(tcgSrcset)}"><span class="entry-art-label-a">그림A</span><span class="entry-art-switch-track" aria-hidden="true"><span></span></span><span class="entry-art-label-b">그림B</span></button>` : "";
  return `<a class="entry-zoom" data-entry-zoom href="${e(selected[0])}" aria-label="${e(row["한자"])} 암기 이미지 크게 보기">${img}</a><figcaption class="entry-art-caption">${toggle}</figcaption>`;
}

function linkedText(text, known, current = "") {
  return Array.from(String(text ?? ""), ch => {
    if (ch === current || !known.has(ch)) return e(ch);
    const target = studyDetailHref(ch);
    return `<a lang="ja" data-study-kanji="${e(ch)}" href="${e(target)}" aria-label="${e(ch)} 간단 정보 보기" aria-haspopup="dialog" aria-expanded="false">${e(ch)}</a>`;
  }).join("");
}

function words(row, block, linkText) {
  return parseExamples(row["예시단어"]).map(group => {
    const items = group.items.map(line => {
      // The source also uses placeholders in readings, e.g. ○○郡(○○ぐん).
      const match = line.match(examplePattern) || line.match(/^([^()（）]+)[(（]([～○]+[ぁ-ゖァ-ヶー]+)[)）](.*)$/u);
      if (!match) return `<li>${linkText(line)}</li>`;
      const [, word, reading, gloss] = match;
      const parts = block.ruby[JSON.stringify([word, reading])] ?? [{ text: word, reading }];
      const wordHtml = parts.map(part => part.reading
        ? `<ruby>${linkText(part.text)}<rp>(</rp><rt>${e(part.reading)}</rt><rp>)</rp></ruby>`
        : linkText(part.text)).join("");
      return `<li><span class="example-word" lang="ja">${wordHtml}</span><span>${linkText(gloss.trim())}</span></li>`;
    }).join("");
    return `<section><h3>${e(group.label)}</h3><ul class="entry-words">${items}</ul></section>`;
  }).join("");
}

function relatedGame(ch) {
  return `<section class="entry-section entry-related"><h2>관련 한자</h2>
    <a class="entry-starpath-link" href="/learn/game/#${encodeURIComponent(ch)}" target="_blank" rel="noopener noreferrer"><span><span lang="ja">${e(ch)}</span>의 별자리 펼쳐 보기</span> <span aria-hidden="true">↗</span><span class="entry-new-window"> (새 창)</span></a>
    <p><span lang="ja">${e(ch)}</span>에서 시작해 같은 부수로 이어진 한자들을 하나씩 따라가 보세요. 한 글자를 알면 다음 글자가 보여요.</p>
    <p class="entry-starpath-guide">홈페이지 상단, [한자 학습] - [한자 별길]로 바로 찾아갈 수 있어요.</p></section>`;
}

function categoryLinks(row) {
  const grade = row["학년"];
  const shortGrade = String(grade ?? "").replace(/^(초등학교|중학|고교)\s*(\d+)(?:학년)?$/, (_, school, year) => school[0] + year);
  const categories = [
    ["jlpt", row["등급"], row["등급"]],
    ["grade", row["학년"], row["학년"]],
    ["strokes", row["획"], `${row["획"]}획`],
  ];
  return categories.filter(([, value]) => value !== "" && value != null).map(([key, value, label]) => {
    const text = key === "grade" && shortGrade !== grade
      ? `<span class="grade-full">${e(label)}</span><span class="grade-short">${e(shortGrade)}</span>`
      : e(label);
    return `<a href="${studyDirectory}?${key}=${encodeURIComponent(value)}" aria-label="${e(label)} 한자 모아 보기">${text}</a>`;
  }).join("");
}

function characterEntry(row, media, block, known) {
  const ch = row["한자"];
  const ko = row["훈, 음"];
  const linkText = text => linkedText(text, known, ch);
  const readings = parseReadings(row["발음"]).map(part =>
    `<dt>${e(part.label)}</dt><dd lang="ja">${linkText(part.value)}</dd>`).join("");
  const exampleGroups = words(row, block, linkText);
  const title = `${ch} · ${ko}`;
  const topics = ["암기 풀이", readings && "일본어 읽기", exampleGroups && "예시 단어"].filter(Boolean);
  const note = ch === "機" ? `<p>${linkText("機会와 機械는 둘 다 ")}<span lang="ja">きかい</span>${linkText("로 읽습니다. 기회를 뜻할 때는 会, 기계를 뜻할 때는 械를 씁니다.")}</p>` : "";
  return {
    path: characterPath(ch).slice(1,-1), title, description: `${title}의 ${row["획"]}획 획순을 따라 쓰고 ${topics.join(" · ")}를 확인하세요.`,
    back: '<a data-previous-kanji hidden>← 이전 한자</a>',
    body: `<article class="entry-page" data-entry-kanji="${e(ch)}"><div class="entry-header"><h1><strong lang="ja">${e(ch)}</strong> <span class="entry-meaning">${e(ko)}</span></h1><nav class="entry-meta" aria-label="학습 범위">${categoryLinks(row)}</nav></div>
      <div class="entry-pair"><figure>${art(row, media, false)}</figure><figure>${stroke(row, media)}<figcaption>획순 · ${e(row["획"])}획</figcaption></figure></div>
      <section class="entry-section"><h2>암기 풀이</h2><p>${linkText(row["풀이"])}</p></section>
      ${readings && `<section class="entry-section"><h2>일본어 읽기</h2><dl class="entry-readings">${readings}</dl></section>`}
      ${exampleGroups && `<section class="entry-section">
        <div class="entry-word-header"><h2>예시 단어</h2><p class="study-link-hint">모르는 한자는 눌러 뜻을 확인하세요.</p></div>
        <div class="entry-word-groups">${exampleGroups}</div>${note}
      </section>`}
      ${relatedGame(ch)}</article>`,
  };
}

export function characterPages(kanji, media) {
  // The catalog build generates these blocks first. Reuse its reviewed ruby and
  // ordered component lists exactly as the interactive catalog does.
  const data = new URL("../public/data/", import.meta.url);
  const readData = name => JSON.parse(readFileSync(new URL(name, data), "utf8"));
  const index = readData("kanji-index.json");
  const known = new Map(kanji.map(row => [row["한자"], row]));
  if (known.size !== kanji.length) throw Error("도감 원본에 한자가 중복되어 있습니다.");
  const remaining = new Set(known.keys());
  const pages = [];
  for (const id of new Set(index.rows.map(row => row.detailBlock))) {
    const block = readData(`kanji-detail/${index.version}/${id}.json`);
    for (const row of block.rows) {
      const ch = row["한자"];
      if (!remaining.delete(ch)) throw Error("상세 데이터에 없거나 중복된 원본 한자: " + ch);
      pages.push(characterEntry(row, media, block, known));
    }
  }
  if (remaining.size) throw Error("상세 데이터 누락: " + [...remaining].join(" "));
  const compareText = text => linkedText(text, known);
  const panels = ["木", "林", "森"].map((ch, i) => {
    const r = known.get(ch);
    if (!r) throw Error("비교 페이지 한자 누락: " + ch);
    return `<section class="tree-panel"><h2>${compareText(ch)}</h2><p class="tree-meaning">${e(r["훈, 음"])}</p>
      ${art(r, media, true)}<h3>${captionHtml[i]}</h3><p>${compareText(treeNotes[i])}</p><figure>${stroke(r, media)}<figcaption>${e(r["획"])}획</figcaption></figure><p class="tree-reading">${compareText(nativeWords[i])}</p><a class="tree-entry-link" href="${characterPath(ch)}">${ch} 자세히 보기</a></section>`;
  });
  pages.push({
    path: comparisonPath, title: "木·林·森 비교", description: "나무가 한 그루에서 세 그루로 늘어날 때 木·林·森의 모양과 획순, 일본어 읽기를 비교합니다.",
    back: '<a href="/">← 홈</a>',
    body: `<article class="entry-page"><h1 class="tree-comparison-title"><span lang="ja">${compareText("木 · 林 · 森")}</span> 비교</h1><p>${compareText("나무 한 그루를 그린 木이 어디에 몇 번 놓이는지 그림과 획순으로 비교해 보세요.")}</p><div class="tree-panels">${panels.join("")}</div><p>${compareText("林과 森을 함께 쓴 ")}<span lang="ja">${compareText("森林")}（しんりん）</span>은 숲·산림이라는 뜻입니다.</p></article>`,
  });
  return pages;
}
