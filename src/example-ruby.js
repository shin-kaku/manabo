const isHan = (ch) => /\p{Script=Han}/u.test(ch);
const kana = (value) => value.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

// Align against the site's readings and the complete supplied word reading.
// Keep ambiguous/irregular words together rather than inventing a character split.
export function createRubyResolver(rows) {
  const readings = new Map(rows.map((row) => [row["한자"], [...new Set(
    String(row["발음"] || "").split(/[㉧㉭㉫|、,\s]+/).filter((r) => /^[ぁ-ゖァ-ヶー]+$/.test(r)).map(kana),
  )]]));
  const cache = new Map();
  return (word, reading) => {
    const key = `${word}\0${reading}`;
    if (cache.has(key)) return cache.get(key);
    const chars = Array.from(word), target = kana(reading), solutions = [];
    function walk(index, offset, parts) {
      if (solutions.length > 1) return;
      if (index === chars.length) {
        if (offset === target.length) solutions.push(parts);
        return;
      }
      const ch = chars[index];
      if (!isHan(ch)) {
        if (target.startsWith(kana(ch), offset)) walk(index + 1, offset + ch.length, [...parts, { text: ch }]);
        return;
      }
      const candidates = new Set(readings.get(ch) || []);
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
        }
        if (isHan(chars[index + 1] || "") && /[くきつち]$/.test(r)) {
          const contracted = r.slice(0, -1) + "っ";
          if (/^[かきくけこさしすせそたちつてとはひふへほぱぴぷぺぽ]/.test(target.slice(offset + contracted.length))) candidates.add(contracted);
        }
      }
      for (const r of candidates) {
        if (target.startsWith(r, offset)) walk(index + 1, offset + r.length, [...parts, { text: ch, reading: reading.slice(offset, offset + r.length) }]);
      }
    }
    // Single-kanji words need no dictionary inference.
    if (chars.length === 1 && isHan(word)) solutions.push([{ text: word, reading }]);
    else walk(0, 0, []);
    const result = solutions.length === 1 ? solutions[0] : [{ text: word, reading }];
    cache.set(key, result);
    return result;
  };
}
