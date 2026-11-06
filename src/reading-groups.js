const READING_LABELS = { "㉧": "음독", "㉭": "훈독", "㉫": "특수 읽기" };
export function parseExamples(raw) {
  const groups = [];
  let current = { marker: "", label: "예시", items: [] };
  const flush = () => {
    if (current.items.length) groups.push(current);
  };
  String(raw ?? "").trim()
    .split("\n")
    .map((v) => v.trim())
    .forEach((line) => {
      if (!line || line === "-") return;
      if (READING_LABELS[line]) {
        flush();
        current = {
          marker: line,
          label: READING_LABELS[line],
          items: [],
        };
      } else {
        current.items.push(line);
      }
    });
  flush();
  return groups;
}
export function parseReadings(raw) {
  const value = String(raw ?? "").trim();
  if (!value || value === "無し") return [];
  return value
    .split(/\s*\|\s*/)
    .map((part) => {
      const m = part.trim().match(/^(㉧|㉭|㉫)\s*(.*)$/);
      return m
        ? { marker: m[1], label: READING_LABELS[m[1]], value: m[2] }
        : { marker: "", label: "읽기", value: part.trim() };
    })
    .filter((v) => v.value && v.value !== "無し");
}
export const examplePattern = /^([^()（）]+)[(（]([ぁ-ゖァ-ヶー]+)[)）](.*)$/u;
