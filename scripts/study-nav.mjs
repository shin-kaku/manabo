const tabs = [
  ["navKanji", "한자 도감", "/kanji/"],
  ["navGame", "한자 학습", "/learn/"],
  ["navBooks", "한자 교재", "/book/"],
];

export function studyNavigation(current = "") {
  const links = tabs.map(([id, label, href]) => {
    const active = id === current;
    return `<a id="${id}" class="site-tab${active ? " active" : ""}" href="${href}"${active ? ' aria-current="page"' : ""}>${label}</a>`;
  });
  return `<div class="site-nav-wrap"><nav class="site-nav" aria-label="콘텐츠 전환">${links.join("\n")}</nav></div>`;
}
