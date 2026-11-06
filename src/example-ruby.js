import { dictionaryRuby, reviewedRuby } from "./example-ruby-data.js";

const isHan = (ch) => /\p{Script=Han}/u.test(ch);
const kana = (value) => value.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
const wordReadings = new Map([...dictionaryRuby, ...reviewedRuby].map(([word, reading, parts]) => [`${word}\0${reading}`, parts]));
const groupedReadings = new Map();
for (const parts of wordReadings.values()) for (const [text, reading] of parts) {
  if (!reading || Array.from(text).filter(isHan).length < 2) continue;
  const first = Array.from(text)[0], groups = groupedReadings.get(first) || new Map();
  groups.set(`${text}\0${reading}`, { text, reading });
  groupedReadings.set(first, groups);
}

// Keep the spelling/case of the supplied pronunciation even when the lookup
// dictionary uses hiragana for a word supplied in katakana (e.g. 拉麺).
function suppliedParts(parts, reading) {
  let offset = 0;
  return parts.map(([text, ruby]) => {
    const result = ruby ? { text, reading: reading.slice(offset, offset + ruby.length) } : { text };
    offset += (ruby || text).length;
    return result;
  });
}

// Align against the site's readings and the complete supplied word reading.
// Keep ambiguous/irregular words together rather than inventing a character split.
export function createRubyResolver(rows) {
  const readings = new Map(rows.map((row) => [row["한자"], [...new Set(
    String(row["발음"] || "").split("㉫")[0].split(/[㉧㉭|、,\s]+/).filter((r) => /^[ぁ-ゖァ-ヶー]+$/.test(r)).map(kana),
  )]]));
  // A single kanji in a supplied example has an exact boundary: the written
  // kana on either side fixes its reading, including stems such as 持つ -> も.
  for (const row of rows) {
    for (const match of String(row["예시단어"] || "").matchAll(/^([ぁ-ゖァ-ヶー]*)(\p{Script=Han})([ぁ-ゖァ-ヶー]*)[(（]([ぁ-ゖァ-ヶー]+)[)）]/gmu)) {
      const [, before, ch, after, reading] = match;
      const target = kana(reading), prefix = kana(before), suffix = kana(after);
      if (!target.startsWith(prefix) || !target.endsWith(suffix)) continue;
      const stem = target.slice(prefix.length, target.length - suffix.length);
      if (stem) readings.set(ch, [...new Set([...(readings.get(ch) || []), stem])]);
    }
  }
  const cache = new Map();
  return (word, reading) => {
    const key = `${word}\0${reading}`;
    if (cache.has(key)) return cache.get(key);
    const chars = Array.from(word), target = kana(reading), solutions = [];
    const reviewed = wordReadings.get(`${word}\0${target}`);
    if (reviewed) {
      const result = suppliedParts(reviewed, reading);
      cache.set(key, result);
      return result;
    }
    const failed = new Set();
    function walk(index, offset, parts) {
      if (solutions.length > 1) return;
      const state = `${index}:${offset}`;
      if (failed.has(state)) return;
      if (index === chars.length) {
        if (offset === target.length) solutions.push(parts);
        else failed.add(state);
        return;
      }
      const ch = chars[index];
      if (!isHan(ch)) {
        const before = solutions.length;
        if (target.startsWith(kana(ch), offset)) walk(index + 1, offset + ch.length, [...parts, { text: ch }]);
        if (solutions.length === before) failed.add(state);
        return;
      }
      const before = solutions.length;
      // Preserve only the irregular root of a longer word: 一人 + 旅, etc.
      for (const group of groupedReadings.get(ch)?.values() || []) {
        const length = Array.from(group.text).length;
        if (chars.slice(index, index + length).join("") === group.text && target.startsWith(group.reading, offset)) {
          walk(index + length, offset + group.reading.length, [...parts, { text: group.text, reading: reading.slice(offset, offset + group.reading.length) }]);
        }
      }
      const candidates = new Set(readings.get(ch === "々" ? chars[index - 1] : ch) || []);
      // A lone kanji bounded by written kana can be aligned directly, including
      // conjugated forms absent from the dictionary (見える, 食べた, etc.).
      if (!isHan(chars[index - 1] || "") && !isHan(chars[index + 1] || "")) {
        for (let end = offset + 1; end <= target.length; end++) candidates.add(target.slice(offset, end));
      }
      // Strip only okurigana actually present immediately after this kanji.
      const suffix = chars.slice(index + 1).join("").match(/^[ぁ-ゖァ-ヶー]+/)?.[0];
      if (suffix) {
        for (const r of [...candidates]) {
          for (let length = 1; length < r.length; length++) {
            if (kana(suffix).startsWith(r.slice(length))) candidates.add(r.slice(0, length));
          }
        }
      }
      // Compound readings may voice the next consonant or contract to small tsu.
      for (const r of [...candidates]) {
        if (index > 0 && isHan(chars[index - 1])) {
          const unvoiced = "かきくけこさしすせそたちつてとはひふへほ";
          const voiced = "がぎぐげござじずぜぞだぢづでどばびぶべぼ";
          const pos = unvoiced.indexOf(r[0]);
          if (pos >= 0) candidates.add(voiced[pos] + r.slice(1));
          const h = "はひふへほ".indexOf(r[0]);
          if (h >= 0 && /[んっ]/.test(target[offset - 1] || "")) candidates.add("ぱぴぷぺぽ"[h] + r.slice(1));
        }
        if (isHan(chars[index + 1] || "") && /[くきつち]$/.test(r)) {
          const contracted = r.slice(0, -1) + "っ";
          if (/^[かきくけこさしすせそたちつてとはひふへほぱぴぷぺぽ]/.test(target.slice(offset + contracted.length))) candidates.add(contracted);
        }
      }
      for (const r of candidates) {
        if (target.startsWith(r, offset)) walk(index + 1, offset + r.length, [...parts, { text: ch, reading: reading.slice(offset, offset + r.length) }]);
      }
      if (solutions.length === before) failed.add(state);
    }
    // Single-kanji words need no dictionary inference.
    if (chars.length === 1 && isHan(word)) solutions.push([{ text: word, reading }]);
    else walk(0, 0, []);
    const result = solutions.length === 1 ? solutions[0] : [{ text: word, reading }];
    cache.set(key, result);
    return result;
  };
}
