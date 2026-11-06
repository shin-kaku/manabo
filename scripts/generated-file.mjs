import { readFileSync, writeFileSync } from "node:fs";

// Re-running generators must not reload an open Vite page when its content
// has not changed (for example, when a second dev server or build starts).
export function writeGeneratedFile(path, content) {
  try {
    if (readFileSync(path, "utf8") === content) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  writeFileSync(path, content);
  return true;
}
