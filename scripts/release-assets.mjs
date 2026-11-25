import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const manifestName = "release-assets.json";
const retainedCount = 3;
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const sorted = entries => Object.fromEntries(Object.keys(entries).sort().map(key => [key, entries[key]]));

function checkPath(name) {
  const parts = name.split("/");
  if (parts.shift() !== "assets" || !parts.length ||
      parts.some(part => !part || part === "." || part === ".." || /[\\%?#:\x00-\x1f\x7f]/u.test(part))) {
    throw Error(`Invalid release asset path: ${name}`);
  }
}

function readGenerations(manifest) {
  if (manifest?.schema !== 1 || !Array.isArray(manifest.generations) ||
      !manifest.generations.length || manifest.generations.length > retainedCount) {
    throw Error("Invalid release asset manifest");
  }
  return manifest.generations.map(files => {
    if (!files || typeof files !== "object" || Array.isArray(files) || !Object.keys(files).length) {
      throw Error("Empty or invalid release asset generation");
    }
    for (const [name, hash] of Object.entries(files)) {
      checkPath(name);
      if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) throw Error(`Invalid SHA-256 for ${name}`);
    }
    return sorted(files);
  });
}

async function optionalFile(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return null;
  }
}

async function builtFiles(directory) {
  const files = {};
  async function walk(prefix) {
    const entries = await readdir(join(directory, prefix), { withFileTypes: true });
    for (const entry of entries) {
      const name = `${prefix}/${entry.name}`;
      checkPath(name);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) files[name] = digest(await readFile(join(directory, name)));
      else throw Error(`Unexpected release asset file type: ${name}`);
    }
  }
  if (!(await lstat(join(directory, "assets"))).isDirectory()) throw Error("Expected dist/assets directory");
  await walk("assets");
  return files;
}

export async function prepareReleaseAssets({
  directory = resolve("dist"),
  origin = "https://kanjimanabo.com",
  request = fetch,
  bootstrapDirectory = fileURLToPath(new URL("../deploy/asset-bootstrap/", import.meta.url)),
} = {}) {
  const base = new URL(origin);
  if (!["https:", "http:"].includes(base.protocol) || base.username || base.password) throw Error("Invalid release origin");
  async function get(name) {
    const url = new URL("/" + name.split("/").map(encodeURIComponent).join("/"), base);
    const response = await request(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30000) });
    if (response.redirected || (response.url && response.url !== url.href)) throw Error(`Unexpected release asset redirect: ${name}`);
    return response;
  }

  const response = await get(manifestName);
  let published;
  if (response.status === 404) published = JSON.parse(await readFile(join(bootstrapDirectory, manifestName), "utf8"));
  else if (response.ok) published = await response.json();
  else throw Error(`Could not read published asset manifest: HTTP ${response.status}`);

  const available = await builtFiles(directory);
  const current = { ...available };
  const previousPreparation = await optionalFile(join(directory, manifestName));
  if (previousPreparation) {
    // On retry, copied historical files are not members of the newly built generation.
    const [original, ...restored] = readGenerations(JSON.parse(previousPreparation));
    for (const generation of restored) for (const name of Object.keys(generation)) {
      if (!Object.hasOwn(original, name)) delete current[name];
    }
  }
  const generations = readGenerations({ schema: 1, generations: [current] });
  const identities = new Set([JSON.stringify(generations[0])]);
  for (const generation of readGenerations(published)) {
    const identity = JSON.stringify(generation);
    if (!identities.has(identity) && generations.length < retainedCount) {
      identities.add(identity);
      generations.push(generation);
    }
  }
  const needed = new Map();
  for (const generation of generations) for (const [name, hash] of Object.entries(generation)) {
    if ((needed.has(name) && needed.get(name) !== hash) || (available[name] && available[name] !== hash)) {
      throw Error(`Conflicting contents for release asset: ${name}`);
    }
    needed.set(name, hash);
  }

  const manifest = { schema: 1, generations };
  const work = await mkdtemp(join(directory, ".prepare-assets-"));
  const originalDir = join(work, "original");
  const stagedDir = join(work, "assets");
  const assetDir = join(directory, "assets");
  let originalMoved = false;
  try {
    // Verify the complete candidate tree before changing anything in the deployable tree.
    for (const [name, hash] of needed) {
      const target = join(work, name);
      await mkdir(dirname(target), { recursive: true });
      if (available[name] === hash) {
        await copyFile(join(directory, name), target);
        continue;
      }
      let bytes = await optionalFile(join(bootstrapDirectory, name));
      if (!bytes) {
        const asset = await get(name);
        if (!asset.ok) throw Error(`Could not restore ${name}: HTTP ${asset.status}`);
        bytes = Buffer.from(await asset.arrayBuffer());
      }
      if (digest(bytes) !== hash) throw Error(`Incorrect SHA-256 for ${name}`);
      await writeFile(target, bytes);
    }
    await writeFile(join(work, manifestName), JSON.stringify(manifest) + "\n");
    await rename(assetDir, originalDir);
    originalMoved = true;
    await rename(stagedDir, assetDir);
    try {
      await rename(join(work, manifestName), join(directory, manifestName));
    } catch (error) {
      await rename(assetDir, stagedDir);
      throw error;
    }
    originalMoved = false;
  } finally {
    // Preserve the original directory if the commit failed, even if rollback itself fails.
    if (originalMoved) await rename(originalDir, assetDir);
    await rm(work, { recursive: true, force: true });
  }
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manifest = await prepareReleaseAssets();
  console.log(`Prepared ${manifest.generations.length} frontend asset generations.`);
}
