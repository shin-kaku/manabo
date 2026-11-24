import { studyDetailHref } from "./study-path.js";

export const directoryPageSize = 96;
export const directoryFields = ["q", "jlpt", "grade", "strokes", "sort"];
export const defaultDirectorySort = "ministry";
export const directorySortNames = [
  ["memory", "마나보 추천순"], ["ministry", "상용한자순"],
  ["strokes", "획순"], ["sound", "가나다순"],
];

const collator = new Intl.Collator("ko", { sensitivity: "base", numeric: true });
const primaryReading = value => String(value ?? "").trim().split(/\s*[,|/]\s*/)[0];
function compareReading(a, b) {
  const first = primaryReading(a);
  const second = primaryReading(b);
  if (!first || !second) return Number(!first) - Number(!second);
  return collator.compare(first, second);
}
function numberOrInfinity(value) {
  const text = String(value ?? "").trim();
  const n = Number(text);
  return text && Number.isFinite(n) ? n : Infinity;
}
const memoryOrder = (a, b) => numberOrInfinity(a["암기순"]) - numberOrInfinity(b["암기순"]);
const ministryOrder = (a, b) => numberOrInfinity(a["문부성"]) - numberOrInfinity(b["문부성"]) || memoryOrder(a, b);
const strokeOrder = (a, b) => numberOrInfinity(a["획"]) - numberOrInfinity(b["획"]);
const readingOrder = (a, b) => compareReading(a["음"], b["음"]) || compareReading(a["훈"], b["훈"]);
const sorts = new Map([
  ["memory", memoryOrder],
  ["ministry", ministryOrder],
  ["strokes", (a, b) => strokeOrder(a, b) || readingOrder(a, b) || memoryOrder(a, b)],
  ["sound", (a, b) => readingOrder(a, b) || strokeOrder(a, b) || memoryOrder(a, b)],
]);

export function directoryRows(rows, mode = defaultDirectorySort) {
  const sort = sorts.has(mode) ? mode : defaultDirectorySort;
  const entries = sort === "ministry"
    ? rows.filter(row => Number.isFinite(numberOrInfinity(row["문부성"])))
    : rows.slice();
  return entries.sort(sorts.get(sort));
}

function matchesText(row, query, compactLabel) {
  if (compactLabel && row["훈, 음"].split("|").some(label => label.replace(/\s+/g, "") === compactLabel)) return true;
  return [row["한자"], row["훈, 음"], row["훈"], row["음"]]
    .map(value => String(value ?? "").trim()).join(" ").toLowerCase().includes(query);
}

export function filterDirectory(rows, filters) {
  const query = (filters.q || "").trim().toLowerCase();
  const strokeQuery = query.match(/^(\d+)\s*획?$/);
  const expand = filters.sort === "memory" && query && !strokeQuery;
  const compact = expand ? query.replace(/\s+/g, "") : "";
  const matchedCharacters = new Set();
  const direct = [];
  const related = [];

  // In memory order a component can lead only to later entries in the learning sequence.
  for (const row of rows) {
    const matches = !query || (strokeQuery
      ? Number(row["획"]) === Number(strokeQuery[1])
      : matchesText(row, query, compact));
    if (!matches && !(expand && Array.from(row.components || "").some(ch => matchedCharacters.has(ch)))) continue;
    // A filtered-out character can still connect two entries, as in 門 → 間 → 簡.
    if (expand) matchedCharacters.add(row["한자"]);
    if (filters.jlpt && row["등급"] !== filters.jlpt) continue;
    if (filters.grade && row["학년"] !== filters.grade) continue;
    if (filters.strokes && Number(row["획"]) !== Number(filters.strokes)) continue;
    if (matches) direct.push(row);
    else related.push(row);
  }
  return direct.concat(related);
}

export const directoryHref = studyDetailHref;

export function directoryMeaning(row) {
  return row["훈, 음"].split(/\s*\|\s*/).join("\n");
}
