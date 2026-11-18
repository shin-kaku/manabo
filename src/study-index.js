import { loadKanjiIndex } from "./kanji-list-data.js";

let pending;
export function getStudyIndex() {
  if (!pending) {
    pending = loadKanjiIndex().catch(error => {
      pending = undefined;
      throw error;
    });
  }
  return pending;
}
