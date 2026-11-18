export const displayLabel = value => String(value ?? "").trim()
  .replace(/^중학\s*(\d+)$/, "중학교 $1학년")
  .replace(/^고교\s*(\d+)$/, "고등학교 $1학년")
  .replace(/^중학(?=\s|$)/, "중학교")
  .replace(/^고교(?=\s|$)/, "고등학교")
  .replace("초등학교 ", "초");

export function fillPopoverMeta(container, values) {
  const chips = values.filter(Boolean).map(value => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = displayLabel(value);
    return chip;
  });
  container.replaceChildren(...chips);
}

export function placeKanjiPopover(element, rect) {
  const pad = 14;
  const box = element.getBoundingClientRect();
  const above = rect.top - box.height;
  const top = Math.max(pad, Math.min(above >= pad ? above : rect.bottom, window.innerHeight - box.height - pad));
  const left = Math.max(pad, Math.min(rect.left + (rect.width - box.width) / 2, window.innerWidth - box.width - pad));
  element.style.top = top + "px";
  element.style.left = left + "px";
}
