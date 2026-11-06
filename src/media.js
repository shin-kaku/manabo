import { driveFileId, imageCandidates } from "./image-sources.js";

const animatedStrokeKanji = new Set(["車", "犬", "見", "空", "校"]);

let catalog;
let request;
export function loadMedia() {
  return request ||= (async () => {
    try {
      const response = await fetch("/data/media.json", { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return;
      const data = await response.json();
      if (data.schema === 1 && data.items) catalog = data;
    } catch { /* Legacy deployments and a temporary catalog failure retain Drive fallback. */ }
  })();
}

export function mediaCandidates(row, kind = "image1", usage = "card", media = catalog) {
  const field = { image1: "이미지 1", image2: "이미지 2", stroke: row["획순 SVG"] ? "획순 SVG" : "획순 이미지" }[kind];
  const source = row[field];
  const entry = media?.items?.[kind]?.[driveFileId(source)];
  const variant = entry?.[usage];
  const url = variant?.url;
  const local = typeof url === "string" && /^\/media\/(image1|image2|stroke)\/[a-f0-9]{64}\.(webp|svg)$/.test(url) ? [url] : [];
  // SVG must never be sent through Drive's raster thumbnail endpoint.
  const isSvg = kind === "stroke" && (row["획순 SVG"] || url?.endsWith(".svg"));
  const fallback = isSvg ? [] : imageCandidates(source);
  const candidates = [...new Set([...local, ...fallback])];
  if (kind === "stroke" && animatedStrokeKanji.has(row["한자"])) {
    const animation = `/strokes/${row["한자"]}.svg`;
    // Keep the numbered stroke diagram available to learners who reduce motion.
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? [...candidates, animation]
      : [animation, ...candidates];
  }
  return candidates;
}
