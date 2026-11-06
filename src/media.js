import { driveFileId, imageCandidates, strokeSources } from "./image-sources.js";

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

export function strokeMediaEntry(row, url, media = catalog) {
  for (const source of strokeSources(row)) {
    const entry = media?.items?.stroke?.[driveFileId(source)];
    if (entry?.detail?.url === url) return entry;
  }
}

export function mediaCandidates(row, kind = "image1", usage = "card", media = catalog) {
  const field = { image1: "이미지 1", image2: "이미지 2" }[kind];
  const sources = kind === "stroke" ? strokeSources(row) : [row[field]];
  const candidates = new Set();
  for (const source of sources) {
    const entry = media?.items?.[kind]?.[driveFileId(source)];
    const url = entry?.[usage]?.url;
    if (typeof url === "string" && /^\/media\/(image1|image2|stroke)\/[a-f0-9]{64}\.(webp|svg)$/.test(url)) candidates.add(url);
    // Drive's thumbnail endpoint rasterizes SVGs. Use the original numbered diagram as the fallback.
    const isSvg = kind === "stroke" && (source === row["움직이는 획순"]?.trim() ||
      source === row["획순 SVG"]?.trim() || url?.endsWith(".svg"));
    if (!isSvg) for (const fallback of imageCandidates(source)) candidates.add(fallback);
  }
  return [...candidates];
}
