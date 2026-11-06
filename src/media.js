import { driveFileId, imageCandidates } from "./image-sources.js";

// These trials apply only to the specific numbered diagrams they preview.
// A new Drive file or a new revision takes precedence on the next media sync.
const strokeTrials = new Map([
  ["車", { fileId: "1eIu0c52kva7VvEE1eEECu2nVc2Gw34jv", md5: "f7bbe6f1f8ce1d52dd0b8bf3d28a1832" }],
  ["犬", { fileId: "1FVraQ9n6CYdOjLjYZDj-z6pPr9Q3Mj6d", md5: "3480f9c678dd2e315e6f84c01d04d967" }],
  ["見", { fileId: "16RhIR-lwRqgDbXoDXy5YM17jdyNgQpl0", md5: "159037d684d8ad6c52281ca57f14d93e" }],
  ["空", { fileId: "1KS4Hj1-huH5Jl6NVvyFJHmg21dcQw-N2", md5: "cf65aa8ff66a4d28cca627de562a901d" }],
  ["校", { fileId: "16Fu7Hoq8zuK8r4qcLkzFkZddh3Enb-_D", md5: "ba6162512d0696e2193f37e44eba7368" }],
]);

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
  const fileId = driveFileId(source);
  const entry = media?.items?.[kind]?.[fileId];
  const variant = entry?.[usage];
  const url = variant?.url;
  const local = typeof url === "string" && /^\/media\/(image1|image2|stroke)\/[a-f0-9]{64}\.(webp|svg)$/.test(url) ? [url] : [];
  // SVG must never be sent through Drive's raster thumbnail endpoint.
  const isSvg = kind === "stroke" && (row["획순 SVG"] || url?.endsWith(".svg"));
  const fallback = isSvg ? [] : imageCandidates(source);
  const candidates = [...new Set([...local, ...fallback])];
  const trial = kind === "stroke" && strokeTrials.get(row["한자"]);
  if (trial && trial.fileId === fileId && trial.md5 === entry?.sourceMd5) {
    const animation = `/strokes/${row["한자"]}.svg`;
    // Keep the numbered stroke diagram available to learners who reduce motion.
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? [...candidates, animation]
      : [animation, ...candidates];
  }
  return candidates;
}
