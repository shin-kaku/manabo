import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assetPath, hash, mapLimit, verifiedAsset } from "./media-core.mjs";

export async function restoreAsset(directory, url, { origin = "https://kanjimanabo.com", request = fetch } = {}) {
  if (await verifiedAsset(directory, url)) return false;
  const path = assetPath(directory, url);
  const response = await request(new URL(url, origin), { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`미디어 복원 실패 HTTP ${response.status}: ${url}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 25 * 1024 * 1024) throw new Error("미디어 복원 용량 제한 초과");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (hash(bytes) !== url.split("/").at(-1).split(".")[0]) throw new Error(`미디어 복원 체크섬 불일치: ${url}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return true;
}

// Generated binaries stay out of Git. A clean code build restores the exact,
// hash-verified files referenced by the committed catalog from the last release.
export async function restoreMedia({ directory = resolve("public"), origin = "https://kanjimanabo.com", request = fetch } = {}) {
  const catalog = JSON.parse(await readFile(resolve(directory, "data/media.json"), "utf8"));
  const urls = [...new Set(Object.values(catalog.items).flatMap(group => Object.values(group).flatMap(entry => [entry.card.url, entry.detail.url])))];
  let restored = 0;
  await mapLimit(urls, 6, async url => {
    if (await restoreAsset(directory, url, { origin, request })) restored++;
  });
  return { restored, total: urls.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) restoreMedia().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
