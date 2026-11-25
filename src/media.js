import { driveFileId, imageCandidates, strokeSources } from "./image-sources.js";

export function strokeMediaEntry(row, url, media) {
  for (const source of strokeSources(row)) {
    const entry = media?.items?.stroke?.[driveFileId(source)];
    if (entry?.detail?.url === url) return entry;
  }
}

export function mediaCandidates(row, kind = "image1", usage = "card", media) {
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
