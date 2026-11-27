import { escapeHtml as e } from "./html.mjs";
import { defaultDirectorySort, directoryFields, directoryHref, directoryMeaning, directoryPageSize, directoryRows, directorySortNames } from "../src/material-directory-data.js";

export function directoryPageTemplate(template, studyNav) {
  const prepaint = `<script>if (${JSON.stringify(directoryFields)}.some(key => new URLSearchParams(location.search).get(key))) document.documentElement.classList.add("directory-filter-pending");</script>`;
  const loadIndex = `<script data-kanji-index>
    if (!location.hash.startsWith("#kanji=")) window.kanjiIndexResponse = fetch("/data/kanji-index.json", {
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
  </script>`;
  return template.replace("</header>", "</header>\n" + studyNav)
    .replace('<div class="info-back">{{BACK}}</div>', "")
    .replace("</head>", '<link rel="stylesheet" href="/src/material-directory.css">\n' + prepaint + loadIndex + "\n</head>")
    .replace("</body>", '<script type="module" src="/src/material-directory.js"></script>\n</body>');
}

function select(label, name, options, selected = "") {
  const option = options.map(([value, text]) => `<option value="${e(value)}"${value === selected ? " selected" : ""}>${e(text)}</option>`).join("");
  return `<label for="directory-${name}">${label}<span class="select-field"><select id="directory-${name}" name="${name}">${option}</select></span></label>`;
}

export function materialDirectory(kanji, levels, grades) {
  const rows = directoryRows(kanji);
  const strokes = [...new Set(kanji.map(row => Number(row["획"])))].filter(n => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
  const links = rows.slice(0, directoryPageSize).map(row => {
    const ch = row["한자"];
    return `<a href="${e(directoryHref(ch))}" aria-label="${e(ch)} ${e(row["훈, 음"])}"><span lang="ja">${e(ch)}</span> <small lang="ko">${e(directoryMeaning(row))}</small></a>`;
  });
  const options = groups => [["", "전체"], ...groups.map(([, name]) => [name, name])];
  return {
    path: "kanji", title: "한자 도감",
    description: "한자, 뜻, 음 또는 획수로 검색하고 JLPT·학년·획수별로 학습할 글자를 고르세요.",
    body: `<section class="study-directory" data-study-directory>
<p class="directory-guide"><strong class="learning-action">한자를 누르면</strong> 그림으로 외우고, 풀이로 이해하고, 획순으로 써 볼 수 있어요.</p>
<h1>한자 도감</h1>
<form class="directory-controls" oninput="event.target.dataset.earlyEdit = ''" action="/kanji/" role="search" aria-label="한자 검색">
  <label class="directory-query" for="directory-q">한자 검색<input type="search" id="directory-q" name="q" placeholder="한자, 뜻, 음, 획수" autocomplete="off" enterkeyhint="search"></label>
  <div class="directory-filters">${select("JLPT", "jlpt", options(levels))}${select("학년", "grade", options(grades))}${select("획수", "strokes", [["", "전체"], ...strokes.map(n => [String(n), n + "획"])])}${select("정렬", "sort", directorySortNames, defaultDirectorySort)}</div>
</form>
<div class="directory-summary"><span data-directory-count role="status" aria-live="polite">${rows.length.toLocaleString("ko-KR")}자</span><a href="/kanji/" data-directory-reset>전체 보기</a></div>
<nav class="material-character-index directory-grid" data-directory-grid aria-label="한자 목록">${links.join("")}</nav>
<p data-directory-message role="status" hidden></p>
<button type="button" class="directory-more" data-directory-more hidden>더 보기</button><button type="button" data-directory-retry hidden>다시 시도</button>
<noscript><p>한자를 검색하거나 전체 목록을 보려면 자바스크립트를 켜 주세요.</p></noscript>
</section>`,
  };
}
