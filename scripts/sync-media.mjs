import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { driveClient } from "./drive-media.mjs";
import { restoreAsset } from "./restore-media.mjs";
import { collectSources, emptyCatalog, hash, mapLimit, optimize, RECIPE, saveVariants, verifiedAsset } from "./media-core.mjs";

export async function syncMedia({ rows, previous = emptyCatalog(), directory, metadata, readSource, recoverAsset, enabledKinds = ["image1", "image2", "stroke"], local = false, onProgress = () => {} }) {
  if (!enabledKinds.length || enabledKinds.some(kind => !["image1", "image2", "stroke"].includes(kind))) throw new Error("enabledKinds 설정 오류");
  const sources = collectSources(rows, enabledKinds);
  const next = emptyCatalog();
  let changed = 0, reused = 0, skipped = 0, completed = 0;
  const processSource = async source => {
    const meta = metadata.get(source.id);
    const old = previous.items?.[source.kind]?.[source.id];
    if (!meta && local && source.kind !== "image1") { skipped++; return null; }
    if (!meta || !/^[a-f0-9]{32}$/.test(meta.md5Checksum || "")) throw new Error(`${source.kind}:${source.id}: Drive 체크섬 또는 읽기 권한이 없습니다.`);
    if (Number(meta.size) > 30 * 1024 * 1024) throw new Error(`${source.id}: 원본 용량 제한 초과`);
    let entry;
    if (old?.sourceMd5 === meta.md5Checksum && old.recipe === RECIPE && recoverAsset) {
      for (const url of new Set([old.card.url, old.detail.url])) {
        if (!await verifiedAsset(directory, url)) {
          // A cache miss or a prior interrupted manifest commit can be repaired
          // from the published asset; if unavailable, regenerate from Drive.
          try { await recoverAsset(url); } catch { /* Original remains authoritative. */ }
        }
      }
    }
    if (old?.sourceMd5 === meta.md5Checksum && old.recipe === RECIPE &&
        await verifiedAsset(directory, old.card.url) && await verifiedAsset(directory, old.detail.url)) {
      entry = old;
      reused++;
    } else {
      const bytes = await readSource(source.id);
      // A same-URL overwrite during a run must not mix revisions in a release.
      if (hash(bytes, "md5") !== meta.md5Checksum) throw new Error(`${source.id}: 다운로드 도중 원본 변경 또는 체크섬 불일치. 다음 실행에서 재시도하세요.`);
      entry = { sourceMd5: meta.md5Checksum, recipe: RECIPE, ...await saveVariants(directory, source.kind, await optimize(bytes, source.kind)) };
      changed++;
    }
    onProgress(++completed, sources.length, changed, reused);
    return { ...source, entry };
  };
  // Small vectors do not allocate raster decode buffers. Keep raster work
  // bounded separately while avoiding a long first import of SVG files.
  const isSvg = source => metadata.get(source.id)?.mimeType === "image/svg+xml";
  const entries = [
    ...await mapLimit(sources.filter(source => !isSvg(source)), 3, processSource),
    ...await mapLimit(sources.filter(isSvg), 8, processSource),
  ];
  for (const result of entries) if (result) next.items[result.kind][result.id] = result.entry;
  return { catalog: next, changed, reused, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !arg.startsWith("--local=")) || args.length > 1) throw new Error("옵션: --local=원본-manifest.json");
  const directory = resolve("public");
  const path = resolve(directory, "data/media.json");
  const rows = JSON.parse(await readFile(resolve(directory, "data/kanji.json"), "utf8"));
  const { enabledKinds, sourceFolderIds = [] } = JSON.parse(await readFile(new URL("./media-config.json", import.meta.url), "utf8"));
  let previous = emptyCatalog();
  try { previous = JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const local = args[0]?.slice("--local=".length);
  let metadata, readSource;
  if (local) {
    const manifest = JSON.parse(await readFile(local, "utf8"));
    metadata = new Map(manifest.files.map(file => [file.driveFileId, { md5Checksum: file.md5, size: file.bytes, file }]));
    readSource = id => readFile(resolve(manifest.originalsDirectory, metadata.get(id).file.sourceFilename));
  } else {
    const client = await driveClient();
    metadata = await client.list(sourceFolderIds);
    readSource = id => client.download(id);
  }
  const result = await syncMedia({ rows, previous, directory, metadata, readSource, enabledKinds, local: Boolean(local),
    recoverAsset: local ? undefined : url => restoreAsset(directory, url),
    onProgress: (done, total, changed, reused) => { if (done % 100 === 0) console.log(`${done}/${total}: 변환 ${changed}, 재사용 ${reused}`); },
  });
  // Publish the manifest only after EVERY required asset has been verified/written.
  await mkdir(resolve(directory, "data"), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(result.catalog)}\n`);
  await rename(temp, path);
  console.log(JSON.stringify({ changed: result.changed, reused: result.reused, skipped: result.skipped, local: Boolean(local) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(`미디어 동기화 실패: ${error.message}`);
  process.exitCode = 1;
});
