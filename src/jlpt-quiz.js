export const levels = ["N5", "N4", "N3", "N2", "N1"];
export const modes = ["reading", "spelling"];
export const modeNames = { reading: "읽기 고르기", spelling: "한자 고르기" };
export const normalizeKana = value => value.normalize("NFC").replace(/[ァ-ヶ]/gu,
  ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));

export const trapNotes = {
  "촉음": "작은 っ이 들어가는 위치를 확인하세요.",
  "장음": "길게 읽는 소리와 뒤에 오는 모음을 확인하세요.",
  "탁음": "글자 오른쪽 위의 ゛와 ゜를 확인하세요.",
  "요음": "작은 ゃ・ゅ・ょ와 큰 글자를 구별하세요.",
  "다른 단어": "같은 급수의 다른 단어를 읽는 소리예요.",
  "같은 읽기": "같은 소리로 읽을 수 있는 한자예요. 단어의 뜻과 표기를 함께 기억하세요.",
  "비슷한 모양": "모양이나 부품이 닮은 한자예요. 두 글자가 어디서 달라지는지 살펴보세요.",
};

function shuffled(items, random) {
  const result = Array.from(items);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const voicing = ["かが","きぎ","くぐ","けげ","こご","さざ","しじ","すず","せぜ","そぞ",
  "ただ","ちぢ","つづ","てで","とど","はばぱ","ひびぴ","ふぶぷ","へべぺ","ほぼぽ"];
const glides = { "ゃ": "や", "ゅ": "ゆ", "ょ": "よ", "や": "ゃ", "ゆ": "ゅ", "よ": "ょ" };
const uSound = /[うくぐすずつづぬふぶぷむゆゅるおこごそぞとどのほぼぽもよょろ]/u;
const eSound = /[えけげせぜてでねへべぺめれ]/u;

export function readingDistractors(entry, peers, random = Math.random) {
  const answer = normalizeKana(entry.reading);
  const blocked = new Set([answer, ...(entry.otherReadings ?? []).map(normalizeKana)]);
  const buckets = new Map();
  function add(trap, value) {
    if (!value || blocked.has(value)) return;
    if (!buckets.has(trap)) buckets.set(trap, new Set());
    buckets.get(trap).add(value);
  }
  for (let i = 0; i < answer.length; i++) {
    const ch = answer[i], prev = answer[i - 1] ?? "";
    const before = answer.slice(0, i), after = answer.slice(i + 1);
    if (ch === "っ") add("촉음", before + after);
    else if (i > 0 && prev !== "っ" && /[かきくけこさしすせそたちつてとぱぴぷぺぽ]/u.test(ch)) {
      add("촉음", before + "っ" + ch + after);
    }
    const longVowel = uSound.test(ch) ? "う" : eSound.test(ch) ? "い" : "";
    if ((ch === "う" && uSound.test(prev)) || (ch === "い" && eSound.test(prev)) || ch === "ー") {
      add("장음", before + after);
    } else if (longVowel && !/^[ゃゅょー]/u.test(after) && after[0] !== longVowel) {
      add("장음", before + ch + longVowel + after);
    }
    const group = voicing.find(set => set.includes(ch));
    for (const other of group ?? "") if (other !== ch) add("탁음", before + other + after);
    if (glides[ch] && /[きぎしじちぢにひびぴみり]/u.test(prev)) add("요음", before + glides[ch] + after);
  }
  const picked = [];
  function take(text, trap) {
    if (blocked.has(text)) return;
    blocked.add(text);
    picked.push({ text, trap });
  }
  const groups = shuffled(buckets, random).map(([trap, values]) => [trap, shuffled(values, random)]);
  for (const [trap, values] of groups) {
    take(values.pop(), trap);
    if (picked.length === 3) return picked;
  }
  for (const [trap, values] of groups) for (const value of values) {
    take(value, trap);
    if (picked.length === 3) return picked;
  }
  const alternatives = shuffled(peers, random).filter(peer => peer.level === entry.level && peer.word !== entry.word);
  alternatives.sort((a, b) => Math.abs(a.reading.length - answer.length) - Math.abs(b.reading.length - answer.length));
  for (const peer of alternatives) {
    take(normalizeKana(peer.reading), "다른 단어");
    if (picked.length === 3) break;
  }
  return picked;
}

function indexMember(map, key, glyph) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(glyph);
}

export function spellingIndex({ glyphs, spellings }) {
  const byReading = new Map(), byPart = new Map(), related = new Map();
  for (const [k, entry] of Object.entries(glyphs)) {
    for (const sound of entry.readings) indexMember(byReading, sound, k);
    for (const part of entry.parts) indexMember(byPart, part, k);
    for (const peer of entry.related) {
      indexMember(related, k, peer);
      indexMember(related, peer, k);
    }
  }
  return { glyphs, knownWords: new Set(spellings), byReading, byPart, related };
}

export function spellingDistractors(entry, index, random = Math.random) {
  const { glyphs, knownWords, byPart, byReading, related } = index;
  const chars = Array.from(entry.word);
  const candidates = new Map();
  for (const [i, original] of chars.entries()) {
    const glyph = glyphs[original];
    if (!glyph) continue;
    function add(replacements, trap, priority) {
      for (const k of replacements ?? []) {
        if (k === original || !glyphs[k]?.level) continue;
        const word = chars.slice(0, i).join("") + k + chars.slice(i + 1).join("");
        if (knownWords.has(word) || candidates.has(word)) continue;
        const familiarity = levels.indexOf(glyphs[k].level) <= levels.indexOf(entry.level) ? 0 : 3;
        candidates.set(word, { text: word, trap, rank: familiarity + priority });
      }
    }
    for (const sound of glyph.readings) add(byReading.get(sound), "같은 읽기", 0);
    add(related.get(original), "비슷한 모양", 1);
    add(glyph.parts, "비슷한 모양", 1);
    add(byPart.get(original), "비슷한 모양", 1);
    for (const part of glyph.parts) add(byPart.get(part), "비슷한 모양", 1);
    add(glyph.similar, "비슷한 모양", 2);
  }
  return shuffled(candidates.values(), random).sort((a, b) => a.rank - b.rank).slice(0, 3)
    .map(({ text, trap }) => ({ text, trap }));
}

export function makeSession(words, settings, spelling, random = Math.random) {
  const pool = shuffled(words.filter(w => settings.levels.includes(w.level)), random);
  const size = Math.min(settings.count, pool.length);
  const useReading = settings.modes.includes("reading"), useSpelling = settings.modes.includes("spelling");
  if (!useReading && !useSpelling) return [];
  const writingCount = useSpelling ? (useReading ? Math.floor(size / 2) : size) : 0;
  const used = new Set();
  function makeBlock(mode, limit) {
    const block = [];
    for (const entry of pool) {
      if (block.length >= limit) break;
      if (used.has(entry.word)) continue;
      const reading = mode === "reading";
      const distractors = reading ? readingDistractors(entry, pool, random) : spellingDistractors(entry, spelling, random);
      if (distractors.length !== 3) continue;
      const answer = reading ? normalizeKana(entry.reading) : entry.word;
      const options = shuffled([{ text: answer, trap: null }, ...distractors], random);
      block.push({ entry, mode, options, correct: options.findIndex(option => option.trap === null) });
      used.add(entry.word);
    }
    return block;
  }
  const writing = makeBlock("spelling", writingCount);
  return [...makeBlock("reading", useReading ? size - writing.length : 0), ...writing];
}

export function retryQuestions(missed, random = Math.random) {
  return modes.flatMap(mode => shuffled(missed.filter(q => q.mode === mode), random)).map(q => {
    const options = shuffled(q.options, random);
    return { ...q, options, correct: options.findIndex(option => option.trap === null) };
  });
}
