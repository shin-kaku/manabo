import "./study-lookup.js";
import { setupEntryNavigation } from "./study-path.js";

function updateStrokeImages() {
  const dark = document.documentElement.dataset.theme === "dark";
  const variant = dark ? "dark" : "light";
  for (const picture of document.querySelectorAll("picture[data-entry-stroke]")) {
    const url = picture.dataset.entryStroke;
    picture.querySelector("source").srcset = url + "?view=" + variant + "-still#" + variant + "-still";
    picture.querySelector("img").src = url + (dark ? "?view=dark#dark" : "#light");
  }
}
for (const img of document.querySelectorAll("img[data-media-fallbacks]")) {
  let fallbacks = JSON.parse(img.dataset.mediaFallbacks);
  img.addEventListener("art-change", event => { fallbacks = event.detail; });
  function useFallback() {
    if (!img.complete || img.naturalWidth || !fallbacks.length) return;
    const next = fallbacks.shift();
    const picture = img.closest("picture[data-entry-stroke]");
    if (picture) {
      delete picture.dataset.entryStroke;
      picture.querySelector("source").remove();
      img.classList.add("entry-static-stroke");
    }
    const zoom = img.closest("[data-entry-zoom]");
    if (zoom) zoom.href = next;
    img.src = next;
  }
  img.addEventListener("error", useFallback);
  useFallback();
}
updateStrokeImages();
new MutationObserver(updateStrokeImages).observe(document.documentElement, {
  attributes: true, attributeFilter: ["data-theme"],
});

const entry = document.querySelector("[data-entry-kanji]");
if (entry) setupEntryNavigation(entry);

for (const group of document.querySelectorAll(".entry-art-switch")) {
  group.addEventListener("click", event => {
    const button = event.target.closest("button[data-art-kind]");
    if (!button) return;
    const [url, ...fallbacks] = JSON.parse(group.dataset[button.dataset.artKind]);
    const figure = group.closest("figure");
    const img = figure.querySelector(".entry-art");
    img.dispatchEvent(new CustomEvent("art-change", { detail: fallbacks }));
    figure.querySelector("[data-entry-zoom]").href = url;
    img.src = url;
    for (const option of group.querySelectorAll("button")) {
      option.setAttribute("aria-pressed", String(option === button));
    }
  });
}
