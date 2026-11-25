import { imageCandidates } from "./image-sources.js";

const lookups = new Map();

export function quizImagePath(glyph) {
  const characters = typeof glyph === "string" ? Array.from(glyph.trim()) : [];
  if (characters.length !== 1) return "";
  return `/data/quiz-image/${characters[0].codePointAt(0).toString(16)}.json`;
}

export function isQuizImageUrl(value) {
  return typeof value === "string" && /^\/media\/image1\/[a-f0-9]{64}\.webp$/.test(value);
}

async function fetchQuizImageUrl(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(path, { signal: controller.signal });
    if (!response.ok) return null;
    const url = await response.json();
    return isQuizImageUrl(url) ? url : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function quizImageCandidates(row) {
  const fallbacks = imageCandidates(row["이미지 1"]);
  const path = quizImagePath(row["한자"]);
  if (!path) return fallbacks;
  if (!lookups.has(path)) {
    lookups.set(path, fetchQuizImageUrl(path).then(url => {
      if (!url) lookups.delete(path);
      return url;
    }));
  }
  const url = await lookups.get(path);
  return url ? [url, ...fallbacks.filter(fallback => fallback !== url)] : fallbacks;
}
