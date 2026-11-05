import { readFile, readdir, stat, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assetPath, collectSources, verifiedAsset } from "./media-core.mjs";

export async function checkMedia(directory = resolve("dist")) {
  const catalog = JSON.parse(await readFile(join(directory, "data/media.json"), "utf8"));
  if (catalog.schema !== 1) throw new Error("미디어 카탈로그 버전 오류");
  const rows = JSON.parse(await readFile(join(directory, "data/kanji.json"), "utf8"));
  const { enabledKinds } = JSON.parse(await readFile(new URL("./media-config.json", import.meta.url), "utf8"));
  for (const { kind, id } of collectSources(rows, enabledKinds)) {
    if (!catalog.items[kind]?.[id]) throw new Error(`필수 최적화 미디어 누락: ${kind}:${id}`);
  }
  const needed = new Set();
  for (const group of Object.values(catalog.items)) for (const entry of Object.values(group)) for (const variant of [entry.card, entry.detail]) {
    const path = assetPath(directory, variant.url);
    if (!await verifiedAsset(directory, variant.url)) throw new Error(`미디어 누락 또는 손상: ${variant.url}`);
    needed.add(path);
  }
  let files = 0, bytes = 0;
  async function walk(root) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) { await walk(path); continue; }
      // Prune only unreferenced generated files inside this fresh dist build.
      if (path.startsWith(join(directory, "media") + "/") && !needed.has(path)) { await rm(path); continue; }
      const size = (await stat(path)).size;
      if (size > 25 * 1024 * 1024) throw new Error(`Cloudflare 파일당 25 MiB 초과: ${path}`);
      files++; bytes += size;
    }
  }
  await walk(directory);
  if (files > 20_000) throw new Error(`Cloudflare 무료 정적 파일 20,000개 초과: ${files}`);
  return { files, bytes, mediaFiles: needed.size, limit: 20_000 };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) checkMedia(resolve(process.argv[2] || "dist")).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
