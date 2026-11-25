import { characterDetailPath, studyDetailHref } from "./study-path.js";
import { getStudyIndex } from "./study-index.js";
import { isHistoryReturn, trackHistoryScroll } from "./scroll-history.js";
import { defaultDirectorySort, directoryFields, directoryHref, directoryMeaning, directoryPageSize, directoryRows, filterDirectory } from "./material-directory-data.js";

const directory = document.querySelector("[data-study-directory]");
const form = directory.querySelector("form");
const grid = directory.querySelector("[data-directory-grid]");
const count = directory.querySelector("[data-directory-count]");
const message = directory.querySelector("[data-directory-message]");
const more = directory.querySelector("[data-directory-more]");
const retry = directory.querySelector("[data-directory-retry]");
const reset = directory.querySelector("[data-directory-reset]");
const orders = new Map();
let requested = 0;
let lastRendered;
let pendingScroll = isHistoryReturn() && Number.isFinite(history.state?.directoryScroll)
  ? history.state.directoryScroll : null;
// Suppress native restoration against the first 96 links only when leaving the document.
// Within the directory, back/forward through filter entries keeps the browser's default.
window.addEventListener("pagehide", () => { history.scrollRestoration = "manual"; });
window.addEventListener("pageshow", () => requestAnimationFrame(() => {
  history.scrollRestoration = "auto";
}));
const scrollHistory = trackHistoryScroll(() => {
  if (pendingScroll !== null) return;
  const y = Math.max(0, Math.round(window.scrollY));
  if (history.state?.directoryScroll !== y) {
    history.replaceState({ ...history.state, directoryScroll: y }, "");
  }
});

function syncSortWithGrade() {
  const { grade, sort } = form.elements;
  const ministry = sort.querySelector('option[value="ministry"]');
  ministry.disabled = grade.value === "참고";
  if (!ministry.disabled || sort.value !== "ministry") return false;
  sort.value = "memory";
  return true;
}

function readControls() {
  const params = new URLSearchParams();
  for (const name of directoryFields) {
    const value = form.elements.namedItem(name).value.trim();
    if (value && !(name === "sort" && value === defaultDirectorySort)) params.set(name, value);
  }
  return params;
}

function restoreControls() {
  const params = new URLSearchParams(location.search);
  for (const name of directoryFields) {
    const control = form.elements.namedItem(name);
    if (control.hasAttribute("data-early-edit")) {
      control.removeAttribute("data-early-edit");
      continue;
    }
    control.value = params.get(name) || "";
    if (name === "sort" && !control.value) control.value = defaultDirectorySort;
  }
}

function visibleLimit() {
  const limit = history.state?.directoryCount;
  return Number.isInteger(limit) && limit >= directoryPageSize ? limit : directoryPageSize;
}

function remember(params, limit, push = false, scroll = history.state?.directoryScroll ?? 0) {
  const url = new URL(location.href);
  for (const name of directoryFields) {
    if (params.has(name)) url.searchParams.set(name, params.get(name));
    else url.searchParams.delete(name);
  }
  const state = { ...history.state, directoryCount: limit, directoryScroll: scroll };
  if (push && url.href !== location.href) history.pushState(state, "", url);
  else history.replaceState(state, "", url);
}

function resultLink(row, params) {
  const ch = row["한자"];
  const link = document.createElement("a");
  link.href = directoryHref(ch, params);
  const glyph = document.createElement("span");
  glyph.lang = "ja";
  glyph.textContent = ch;
  const meaning = document.createElement("small");
  meaning.lang = "ko";
  meaning.textContent = directoryMeaning(row);
  link.append(glyph, " ", meaning);
  link.setAttribute("aria-label", ch + " " + row["훈, 음"]);
  return link;
}

async function render(limit, append = false) {
  const params = readControls();
  const signature = JSON.stringify([params.toString(), limit]);
  const ticket = ++requested;
  if (signature === lastRendered) return;
  try {
    const sort = params.get("sort") || defaultDirectorySort;
    if (!orders.has(sort)) {
      const index = await getStudyIndex();
      orders.set(sort, directoryRows(index.rows, sort));
    }
    if (ticket !== requested) return;
    const matches = filterDirectory(orders.get(sort), Object.fromEntries(params));
    const start = append ? grid.childElementCount : 0;
    const links = matches.slice(start, limit).map(row => resultLink(row, params));
    if (append) grid.append(...links);
    else grid.replaceChildren(...links);
    count.textContent = matches.length.toLocaleString("ko-KR") + "자";
    message.textContent = matches.length ? "" : "조건에 맞는 한자가 없습니다.";
    message.hidden = matches.length > 0;
    retry.hidden = true;
    more.hidden = limit >= matches.length;
    if (append && links.length) links[0].focus({ preventScroll: true });
    document.documentElement.classList.remove("directory-filter-pending");
    lastRendered = signature;
    if (pendingScroll !== null) {
      // Only the hydrated grid is tall enough to reach a later page of results.
      window.scrollTo({ top: pendingScroll, behavior: "instant" });
      pendingScroll = null;
    }
  } catch {
    if (ticket !== requested) return;
    document.documentElement.classList.remove("directory-filter-pending");
    lastRendered = undefined;
    if (params.size) grid.replaceChildren();
    count.textContent = "";
    more.hidden = true;
    message.textContent = "한자 목록을 불러오지 못했습니다.";
    message.hidden = false;
    retry.hidden = false;
  }
}

function applyFilters(push = false) {
  scrollHistory.cancel();
  pendingScroll = null;
  syncSortWithGrade();
  remember(readControls(), directoryPageSize, push, 0);
  render(directoryPageSize);
  window.scrollTo({ top: 0, behavior: "instant" });
}

form.addEventListener("submit", event => { event.preventDefault(); applyFilters(); });
form.elements.q.addEventListener("input", () => applyFilters());
form.addEventListener("change", event => { if (event.target instanceof HTMLSelectElement) applyFilters(true); });
reset.addEventListener("click", event => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  form.reset();
  applyFilters(true);
});
grid.addEventListener("click", event => {
  if (event.target.closest("a") && !event.defaultPrevented && event.button === 0 &&
      !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    scrollHistory.flush();
    history.scrollRestoration = "manual";
  }
});
more.addEventListener("click", () => {
  pendingScroll = null;
  const limit = visibleLimit() + directoryPageSize;
  remember(readControls(), limit);
  render(limit, true);
});
retry.addEventListener("click", () => render(visibleLimit()));
function restoreDirectory(event) {
  if (event) {
    // Same-document filter changes must not replay a position from the initial navigation.
    scrollHistory.cancel();
    pendingScroll = null;
  }
  const ch = new URLSearchParams(location.hash.slice(1)).get("kanji");
  if (characterDetailPath(ch)) {
    location.replace(studyDetailHref(ch, location.search));
    return;
  }
  // The HTML form can receive input before its module has arrived.
  const hasEarlyInput = form.querySelector("[data-early-edit]");
  restoreControls();
  const sortChanged = syncSortWithGrade();
  if (hasEarlyInput || sortChanged) {
    pendingScroll = null;
    remember(readControls(), directoryPageSize, false, 0);
  }
  render(visibleLimit());
}
form.removeAttribute("oninput");
window.addEventListener("popstate", restoreDirectory);
window.addEventListener("hashchange", restoreDirectory);
restoreDirectory();
