import { getStudyIndex } from "./study-index.js";
import { studyDetailHref } from "./study-path.js";
import { fillPopoverMeta, placeKanjiPopover } from "./kanji-popover.js";
import "./study-lookup.css";

const linkSelector = "a[data-study-kanji]";
const directRegion = "[data-directory-grid], .material-character-index";
const dialog = document.createElement("dialog");
dialog.className = "kanji-popover study-lookup";
dialog.setAttribute("aria-label", "한자 간단 정보");
dialog.innerHTML = `
  <div class="popover-main">
    <div class="popover-glyph" lang="ja"></div>
    <div class="popover-meaning"></div>
  </div>
  <div class="popover-meta"></div>
  <p class="popover-note" aria-live="polite"></p>
  <a class="popover-go">자세히 보기 →</a>
  <button type="button" class="study-lookup-close" aria-label="간단 정보 닫기">×</button>`;
document.body.append(dialog);
const glyph = dialog.querySelector(".popover-glyph");
const meaning = dialog.querySelector(".popover-meaning");
const meta = dialog.querySelector(".popover-meta");
const note = dialog.querySelector(".popover-note");
const more = dialog.querySelector(".popover-go");
const close = dialog.querySelector("button");
let activeAnchor;
let mode = "hover";
let returningFocus = false;
let revision = 0;
let hoverTimer;

function dismiss(restoreFocus = false) {
  clearTimeout(hoverTimer);
  const anchor = activeAnchor;
  if (anchor?.hasAttribute("aria-haspopup")) anchor.setAttribute("aria-expanded", "false");
  activeAnchor = undefined;
  revision++;
  returningFocus = true;
  if (dialog.open) dialog.close();
  mode = "hover";
  if (restoreFocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
  returningFocus = false;
}

function position() {
  if (!activeAnchor || mode === "modal") return;
  const rect = activeAnchor.getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  const height = window.innerHeight;
  if (!activeAnchor.isConnected || rect.bottom <= 0 || rect.top >= height ||
      rect.right <= 0 || rect.left >= width || !activeAnchor.getClientRects().length) {
    dismiss();
    return;
  }
  placeKanjiPopover(dialog, rect);
}

async function fill(anchor) {
  const current = ++revision;
  const ch = anchor.dataset.studyKanji;
  glyph.textContent = ch;
  meaning.textContent = "";
  meta.textContent = "";
  note.textContent = "불러오는 중…";
  more.href = anchor.closest("[data-entry-kanji]") ? anchor.href : studyDetailHref(ch, new URL(anchor.href).search || location.search);
  more.setAttribute("aria-label", ch + " 자세히 보기");
  try {
    const index = await getStudyIndex();
    if (current !== revision) return;
    const summary = index.rows.find(row => row["한자"] === ch);
    if (summary) {
      meaning.textContent = summary["훈, 음"];
      fillPopoverMeta(meta, [summary["학년"], summary["등급"], summary["획"] && summary["획"] + "획"]);
      position();
    }
    const row = await index.detail(ch);
    if (current !== revision) return;
    note.textContent = row?.["풀이"] || "";
  } catch {
    if (current !== revision) return;
    note.textContent = "간단 정보를 불러오지 못했습니다. 자세히 보기에서 다시 확인할 수 있습니다.";
  }
  position();
}

function show(anchor, nextMode = "hover") {
  clearTimeout(hoverTimer);
  if (!anchor.isConnected || (mode !== "hover" && nextMode === "hover")) return;
  const changed = activeAnchor !== anchor;
  if (changed && activeAnchor?.hasAttribute("aria-haspopup")) activeAnchor.setAttribute("aria-expanded", "false");
  activeAnchor = anchor;
  if (anchor.hasAttribute("aria-haspopup")) anchor.setAttribute("aria-expanded", "true");
  if (nextMode === "modal" && mode !== "modal") {
    mode = "modal";
    // The hover version never takes focus. A deliberate activation on the
    // comparison page promotes that same information to a keyboard dialog.
    dialog.open = false;
    dialog.classList.remove("study-lookup-hover");
    dialog.style.removeProperty("left");
    dialog.style.removeProperty("top");
    dialog.showModal();
    close.focus({ preventScroll: true });
  } else if (nextMode !== "modal") {
    mode = nextMode;
    dialog.classList.add("study-lookup-hover");
    dialog.open = true;
  }
  if (changed) fill(anchor);
  position();
}

function anchorAt(node) {
  return node?.closest?.(linkSelector);
}
function overPanel(node) {
  return node instanceof Node && dialog.contains(node);
}

document.addEventListener("pointerover", event => {
  if (event.pointerType !== "mouse" || mode !== "hover") return;
  if (overPanel(event.target)) { clearTimeout(hoverTimer); return; }
  const anchor = anchorAt(event.target);
  if (!anchor || anchor.contains(event.relatedTarget)) return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => show(anchor), 200);
});
document.addEventListener("pointerout", event => {
  if (event.pointerType !== "mouse" || mode !== "hover") return;
  const anchor = anchorAt(event.target);
  if (!anchor && !overPanel(event.target)) return;
  const next = event.relatedTarget;
  if (overPanel(next) || (anchor && anchor.contains(next)) || activeAnchor?.contains(next)) return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    if (!dialog.contains(document.activeElement)) dismiss();
  }, 180);
});

document.addEventListener("click", event => {
  const anchor = anchorAt(event.target);
  if (!anchor || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (anchor.closest(directRegion)) return;
  event.preventDefault();
  if (anchor.closest("[data-entry-kanji]")) {
    show(anchor, "selected");
    more.focus({ preventScroll: true });
  } else {
    show(anchor, "modal");
  }
});
document.addEventListener("keydown", event => {
  const anchor = anchorAt(event.target);
  if (anchor && event.key === "ArrowDown" && mode !== "modal") {
    event.preventDefault();
    show(anchor);
    more.focus({ preventScroll: true });
  } else if (event.key === "Escape" && dialog.open) {
    event.preventDefault();
    dismiss(mode !== "hover" || overPanel(document.activeElement));
  }
});
document.addEventListener("focusin", event => {
  const anchor = anchorAt(event.target);
  if (!returningFocus && mode === "hover" && anchor?.matches(":focus-visible")) {
    anchor.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    show(anchor);
  }
});
document.addEventListener("focusout", event => {
  if (returningFocus || mode === "modal" || !activeAnchor || overPanel(event.relatedTarget)) return;
  if (activeAnchor.contains(event.target) || overPanel(event.target)) dismiss();
});
document.addEventListener("pointerdown", event => {
  if (mode !== "modal" && !overPanel(event.target) && !activeAnchor?.contains(event.target)) dismiss();
});
close.addEventListener("click", () => dismiss(true));
dialog.addEventListener("cancel", event => { event.preventDefault(); dismiss(true); });
dialog.addEventListener("click", event => {
  if (mode !== "modal" || event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dismiss(true);
});
window.addEventListener("scroll", position, { capture: true, passive: true });
window.addEventListener("resize", position);
window.addEventListener("pagehide", () => dismiss());
