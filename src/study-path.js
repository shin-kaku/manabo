import characters from "./catalog-characters.json" with { type: "json" };

const knownCharacters = new Set(characters);
export const characterDetailPath = ch => knownCharacters.has(ch) ? `/kanji/${ch}/` : "";
export const studyDirectory = "/kanji/";

export function studyQuery(search) {
  const input = new URLSearchParams(search);
  const output = new URLSearchParams();
  for (const key of ["jlpt", "grade", "strokes", "q", "sort"]) {
    const value = input.get(key);
    if (value) output.set(key, value);
  }
  return output.size ? "?" + output : "";
}

export function studyDetailHref(ch, search = "", previous = "") {
  const path = characterDetailPath(ch);
  const query = studyQuery(search);
  if (!path) return "/kanji/" + query + "#kanji=" + encodeURIComponent(ch);
  return path + query + (previous ? "#from=" + encodeURIComponent(previous) : "");
}

export function setupEntryNavigation(entry) {
  const current = entry.dataset.entryKanji;
  const source = new URLSearchParams(window.location.hash.slice(1)).get("from");
  let trail = window.history.state?.kanjiTrail || "";
  if (source !== null) {
    trail = [...source].every(ch => knownCharacters.has(ch)) ? source : "";
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState({ ...window.history.state, kanjiTrail: trail }, "", url);
  }
  const search = location.search;
  for (const anchor of entry.querySelectorAll("a[data-study-kanji]")) {
    anchor.href = studyDetailHref(anchor.dataset.studyKanji, search, trail + current);
  }
  const previous = document.querySelector("[data-previous-kanji]");
  if (trail && previous) {
    const steps = [...trail];
    const ch = steps.pop();
    previous.href = studyDetailHref(ch, search, steps.join(""));
    previous.setAttribute("aria-label", "이전 한자 " + ch);
    previous.hidden = false;
  }
  const catalog = document.querySelector("[data-entry-catalog]");
  if (catalog) catalog.href = studyDirectory + studyQuery(search);
}
