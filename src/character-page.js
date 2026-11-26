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
    img.removeAttribute("srcset");
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

for (const toggle of document.querySelectorAll(".entry-art-switch")) {
  const figure = toggle.closest("figure");
  const img = figure.querySelector(".entry-art");

  function fitLineArt() {
    if (toggle.getAttribute("aria-checked") === "true" || !img.naturalWidth) return;
    // Keep every part of the drawing visible while using its white margin to
    // enlarge it. Some drawings have much less margin than others.
    try {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.fillStyle = "white";
      context.fillRect(0, 0, size, size);
      context.drawImage(img, 0, 0, size, size);
      const pixels = context.getImageData(0, 0, size, size).data;
      let radius = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        if (pixels[i] < 245 || pixels[i + 1] < 245 || pixels[i + 2] < 245) {
          radius = Math.max(radius, Math.abs(x + .5 - size / 2), Math.abs(y + .5 - size / 2));
        }
      }
      const scale = radius ? Math.max(1, Math.min(1.3, (size / 2 - 2) / radius)) : 1;
      img.style.setProperty("--entry-line-scale", String(scale));
    } catch {
      // Cross-origin fallback images may not be readable by canvas.
      img.style.setProperty("--entry-line-scale", "1");
    }
  }
  img.addEventListener("load", fitLineArt);
  if (img.complete) fitLineArt();

  toggle.addEventListener("click", () => {
    const checked = toggle.getAttribute("aria-checked") !== "true";
    const kind = checked ? "tcg" : "ml";
    const [url, ...fallbacks] = JSON.parse(toggle.dataset[kind]);
    img.dispatchEvent(new CustomEvent("art-change", { detail: fallbacks }));
    figure.querySelector("[data-entry-zoom]").href = url;
    const srcset = toggle.dataset[`${kind}Srcset`];
    if (srcset) img.srcset = srcset;
    else img.removeAttribute("srcset");
    img.src = url;
    toggle.setAttribute("aria-checked", String(checked));
  });
}
