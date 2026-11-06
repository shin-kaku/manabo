import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { driveFileId, strokeSources } from "../src/image-sources.js";

sharp.concurrency(1);
sharp.cache(false);
export const RECIPE = `webp-480-960-q85-lossless-lines-v1-sharp${sharp.versions.sharp}-vips${sharp.versions.vips}`;
export const KINDS = { image1: ["이미지 1"], image2: ["이미지 2"], stroke: ["움직이는 획순", "획순 SVG", "획순 이미지"] };
export const hash = (buffer, algorithm = "sha256") => createHash(algorithm).update(buffer).digest("hex");
export const emptyCatalog = () => ({ schema: 1, items: { image1: {}, image2: {}, stroke: {} } });

export function collectSources(rows, enabledKinds = Object.keys(KINDS)) {
  const sources = new Map();
  for (const row of rows) for (const [kind, fields] of Object.entries(KINDS)) {
    if (!enabledKinds.includes(kind)) continue;
    const urls = kind === "stroke" ? strokeSources(row) : fields.map(field => row[field]?.trim()).filter(Boolean);
    for (const url of urls) {
      const id = driveFileId(url);
      if (!id) throw new Error(`${row["한자"]} ${kind}: 자동 동기화에는 Drive 파일 URL이 필요합니다.`);
      sources.set(`${kind}:${id}`, { kind, id });
    }
  }
  return [...sources.values()].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`, "en"));
}

export function assetPath(directory, url) {
  if (!/^\/media\/(image1|image2|stroke)\/[a-f0-9]{64}\.(webp|svg)$/.test(url)) throw new Error("잘못된 미디어 경로");
  return resolve(directory, `.${url}`);
}

export async function verifiedAsset(directory, url) {
  try {
    const bytes = await readFile(assetPath(directory, url));
    return hash(bytes) === url.split("/").at(-1).split(".")[0];
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export function validateSvg(buffer) {
  if (buffer.length > 5 * 1024 * 1024) throw new Error("SVG가 5 MiB를 초과했습니다.");
  const svg = buffer.toString("utf8");
  // Match complete local references before rejecting the remaining URLs. An
  // optional quote in a negative lookahead can backtrack and reject url("#id").
  // Keep hexadecimal escapes unambiguous so malformed long URLs cannot cause
  // repeated backtracking across different escape lengths.
  const cssEscape = String.raw`\\(?:[0-9a-f]{6}\s?|[0-9a-f]{1,5}(?![0-9a-f])\s?|[^\r\n\f0-9a-f])`;
  const localCssUrl = new RegExp(String.raw`\burl\(\s*(?:"#(?:[^"\s()\\]|${cssEscape})+"|'#(?:[^'\s()\\]|${cssEscape})+'|#(?:[^\s"'()\\]|${cssEscape})+)\s*\)`, "gi");
  const nonLocalReferences = svg
    .replace(/\bhref\s*=\s*(?:"\s*#[^"\s]+"|'\s*#[^'\s]+')/gi, "")
    .replace(localCssUrl, "");
  if (XMLValidator.validate(svg) !== true || !/<svg[\s>]/i.test(svg) ||
      /<!DOCTYPE|<!ENTITY|<\s*(?:[\w-]+:)?(?:script|foreignObject|iframe|object|embed|image)\b|\bon\w+\s*=|@import|javascript\s*:|data\s*:/i.test(svg) ||
      /\bhref\s*=|\burl\s*\(/i.test(nonLocalReferences)) {
    throw new Error("독립 SVG만 허용합니다. 스크립트·외부 리소스·엔티티를 제거하세요.");
  }
  // Keep bytes unchanged: SMIL/CSS animations, IDs, viewBox and timing survive.
  // The /media/* CSP also sandboxes direct navigation to an SVG.
  return buffer;
}

const svgRoot = new XMLParser({ ignoreAttributes: false, stopNodes: ["svg"], processEntities: false });

export async function optimize(buffer, kind) {
  if (!Object.hasOwn(KINDS, kind)) throw new Error("지원하지 않는 미디어 종류");
  if (buffer.length > 30 * 1024 * 1024) throw new Error("원본 파일은 30 MiB 이하여야 합니다.");
  if (/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(buffer.toString("utf8", 0, 4096))) {
    if (kind !== "stroke") throw new Error("SVG는 획순 자료에만 사용할 수 있습니다.");
    const bytes = validateSvg(buffer);
    const variant = { label: "card", bytes, extension: "svg" };
    const attrs = svgRoot.parse(bytes).svg;
    if (attrs?.["@_data-stroke-theme"] === "auto") {
      variant.strokeTheme = attrs["@_data-stroke-views"] === "explicit" ? "explicit" : "auto";
      // The authoring tool emits exactly one numbered group per finished stroke.
      const numbers = [...bytes.toString("utf8").matchAll(/<g\b[^>]*?\sid=(["'])number_(\d+)\1/g)].map(match => Number(match[2]));
      if (numbers.length && numbers.every((n, i) => n === i + 1)) variant.strokeCount = numbers.length;
    }
    return [variant];
  }
  const metadata = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
  if (!["png", "jpeg", "webp"].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error("정지 PNG/JPEG/WebP 또는 애니메이션 획순 SVG가 필요합니다.");
  const variants = [];
  for (const [label, size] of [["card", 480], ["detail", 960]]) {
    const { data, info } = await sharp(buffer, { limitInputPixels: 40_000_000 })
      .rotate().resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85, effort: 4, lossless: kind !== "image1" })
      .toBuffer({ resolveWithObject: true });
    variants.push({ label, bytes: data, extension: "webp", width: info.width, height: info.height });
  }
  return variants;
}

export async function saveVariants(directory, kind, variants) {
  const entry = {};
  for (const variant of variants) {
    const url = `/media/${kind}/${hash(variant.bytes)}.${variant.extension}`;
    const path = assetPath(directory, url);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, variant.bytes);
    if (variant.strokeTheme) entry.strokeTheme = variant.strokeTheme;
    if (variant.strokeCount) entry.strokeCount = variant.strokeCount;
    entry[variant.label] = { url, bytes: variant.bytes.length, ...(variant.width ? { width: variant.width, height: variant.height } : {}) };
  }
  entry.detail ||= entry.card;
  return entry;
}

export async function mapLimit(items, limit, fn) {
  let cursor = 0;
  const results = new Array(items.length);
  let failure;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failure && cursor < items.length) {
      const index = cursor++;
      try { results[index] = await fn(items[index], index); }
      catch (error) { failure = error; }
    }
  }));
  if (failure) throw failure;
  return results;
}
