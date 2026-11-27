import { levels, modes, modeNames, makeSession, normalizeKana, retryQuestions, spellingIndex, trapNotes } from "./jlpt-quiz.js";
import { characterDetailPath } from "./study-path.js";
import "./study-lookup.js";

const id = name => document.getElementById(name);
const form = id("vocab-settings");
const wordCounts = JSON.parse(form.dataset.wordCounts);
const answerForm = id("vocab-answer");
const sections = [id("vocab-setup"), id("vocab-exam"), id("vocab-result")];
const instruction = id("exam-instruction");
const directions = JSON.parse(instruction.dataset.directions);
const settingsKey = "manabo-jlpt-words-settings-v1";
const cache = new Map();
let session, lastSettings, loading = false;

function element(tag, text, className) {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function japanese(tag, text, className) {
  const el = element(tag, text, className);
  el.lang = "ja";
  return el;
}
function showSection(target) {
  for (const s of sections) s.hidden = s.id !== target;
}
function settings() {
  const values = new FormData(form);
  return { modes: values.getAll("mode"), levels: values.getAll("level"), count: Number(values.get("count")) };
}
function validateSettings({ modes, levels, count } = settings()) {
  const valid = modes.length > 0 && levels.length > 0;
  id("vocab-start").disabled = !valid || loading;
  const summary = id("vocab-summary");
  if (!valid) {
    summary.textContent = "모드와 급수를 하나 이상 골라 주세요";
    return;
  }
  const available = levels.reduce((sum, level) => sum + wordCounts[level], 0);
  summary.textContent = available.toLocaleString("ko-KR") + "단어 중 " + Math.min(count, available) + "문제";
}
function restoreSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey));
    if (!saved || !Array.isArray(saved.modes) || !saved.modes.every(m => modes.includes(m)) ||
        !Array.isArray(saved.levels) || !saved.levels.every(l => levels.includes(l)) ||
        ![...form.elements.namedItem("count")].some(input => Number(input.value) === saved.count)) return;
    for (const input of form.querySelectorAll("input")) {
      if (input.name === "count") input.checked = Number(input.value) === saved.count;
      else input.checked = saved[input.name === "mode" ? "modes" : "levels"].includes(input.value);
    }
  } catch { /* The form works without browser storage. */ }
}
form.addEventListener("change", () => {
  const selected = settings();
  try { localStorage.setItem(settingsKey, JSON.stringify(selected)); } catch { /* Storage is optional. */ }
  id("vocab-status").textContent = "";
  validateSettings(selected);
});
restoreSettings();
validateSettings();

function load(name) {
  if (!cache.has(name)) {
    cache.set(name, fetch("/data/jlpt-words/" + name + ".json").then(async response => {
      if (!response.ok) throw Error("HTTP " + response.status);
      const data = await response.json();
      return name === "spelling" ? spellingIndex(data) : data;
    }).catch(error => { cache.delete(name); throw error; }));
  }
  return cache.get(name);
}
async function start(selected) {
  if (loading || !selected.modes.length || !selected.levels.length) return;
  const fields = [...form.querySelectorAll("fieldset")];
  loading = true;
  showSection("vocab-setup");
  for (const field of fields) field.disabled = true;
  id("vocab-start").disabled = true;
  form.setAttribute("aria-busy", "true");
  id("vocab-status").textContent = "단어를 불러오는 중이에요.";
  let errorMessage = "";
  try {
    const [groups, lexicon] = await Promise.all([
      Promise.all(selected.levels.map(load)),
      selected.modes.includes("spelling") ? load("spelling") : null,
    ]);
    const questions = makeSession(groups.flat(), selected, lexicon);
    if (questions.length) {
      lastSettings = selected;
      begin(questions, selected.levels);
    } else errorMessage = "이 범위에는 출제할 단어가 없어요. 다른 급수를 골라 주세요.";
  } catch {
    errorMessage = "단어를 불러오지 못했어요. 연결을 확인한 뒤 시작하기를 다시 눌러 주세요.";
  } finally {
    loading = false;
    for (const field of fields) field.disabled = false;
    form.removeAttribute("aria-busy");
    validateSettings();
    id("vocab-status").textContent = errorMessage;
  }
}
form.addEventListener("submit", event => { event.preventDefault(); start(settings()); });

function begin(questions, selectedLevels = levels.filter(level => questions.some(q => q.entry.level === level))) {
  session = { questions, selectedLevels, index: 0, picks: [] };
  showSection("vocab-exam");
  showQuestion();
}
function current() { return session.questions[session.index]; }
function showQuestion() {
  const { entry, mode, options } = current();
  const number = session.index + 1;
  id("exam-level").textContent = entry.level;
  id("exam-counter").textContent = number + "/" + session.questions.length;
  id("exam-progress").max = session.questions.length;
  id("exam-progress").value = number;
  const sectionLabel = ["N5", "N4"].includes(entry.level) ? "もんだい" : "問題";
  id("exam-section").textContent = sectionLabel + number;
  instruction.textContent = directions[entry.level][mode];
  id("exam-word").textContent = mode === "reading" ? entry.word : normalizeKana(entry.reading);
  id("exam-meaning").textContent = mode === "spelling" ? entry.meaning : "";
  const field = id("exam-options");
  field.disabled = false;
  field.querySelectorAll("label").forEach(label => label.remove());
  for (const [i, option] of options.entries()) {
    const label = element("label", null, "exam-answer");
    const input = element("input");
    Object.assign(input, { type: "radio", name: "answer", value: String(i) });
    input.setAttribute("aria-label", (i + 1) + "번 " + option.text);
    const bubble = element("span", null, "answer-bubble");
    bubble.setAttribute("aria-hidden", "true");
    label.append(input, element("span", i + 1, "answer-number"), bubble, japanese("span", option.text, "answer-text"));
    field.append(label);
  }
  id("exam-feedback").hidden = true;
  id("exam-feedback").replaceChildren();
  id("exam-submit").textContent = "확인";
  id("exam-submit").disabled = true;
  id("exam-announcement").textContent = "";
  id("exam-prompt").focus();
}
answerForm.addEventListener("change", () => { id("exam-submit").disabled = false; });

function reviewCharacter(ch) {
  const path = characterDetailPath(ch);
  if (!path) return ch;
  const link = element("a", ch);
  link.href = path;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.dataset.studyKanji = ch;
  link.setAttribute("aria-label", ch + " 간단 정보 보기");
  link.setAttribute("aria-haspopup", "dialog");
  link.setAttribute("aria-expanded", "false");
  return link;
}

function definition(entry, withLookup = false) {
  const word = japanese("span", null, "example-word");
  const parts = entry.ruby ?? [{ text: entry.word, reading: entry.reading }];
  for (const { text, reading } of parts) {
    const base = withLookup ? Array.from(text, reviewCharacter) : [text];
    if (reading) {
      const ruby = element("ruby");
      ruby.append(...base, element("rp", "("), element("rt", reading), element("rp", ")"));
      word.append(ruby);
    } else word.append(...base);
  }
  const line = element("p", null, "answer-definition");
  line.append(word, element("span", entry.meaning));
  return line;
}

function explanation(question, pick) {
  const { entry, options, correct } = question;
  const fragment = document.createDocumentFragment();
  const label = pick === correct ? "정답 · " : "오답 · 정답은 ";
  const answer = element("strong", label + (correct + 1) + "번 ");
  answer.append(japanese("span", options[correct].text));
  fragment.append(answer, definition(entry));
  const wrong = options[pick];
  if (pick !== correct) {
    const note = element("p", null, "word-trap");
    note.append(element("b", "내가 고른 답"), " ", japanese("span", wrong.text), " · ",
      element("strong", wrong.trap), " — " + trapNotes[wrong.trap]);
    fragment.append(note);
  }
  return fragment;
}
function gradeOrNext() {
  if (id("vocab-exam").hidden) return;
  if (session.picks.length > session.index) {
    if (session.index + 1 === session.questions.length) showResults();
    else { session.index++; showQuestion(); }
    return;
  }
  const selected = answerForm.querySelector('input[name="answer"]:checked');
  if (!selected) return;
  const q = current(), pick = Number(selected.value);
  session.picks.push(pick);
  const field = id("exam-options");
  const labels = field.querySelectorAll("label");
  labels[q.correct].classList.add("right");
  if (pick !== q.correct) labels[pick].classList.add("wrong");
  field.disabled = true;
  const feedback = id("exam-feedback");
  feedback.replaceChildren(explanation(q, pick));
  feedback.hidden = false;
  id("exam-announcement").textContent = (pick === q.correct ? "정답입니다. " : "오답입니다. ") + "정답은 " + (q.correct + 1) + "번 " + q.options[q.correct].text;
  id("exam-submit").textContent = session.index + 1 === session.questions.length ? "결과 보기" : "다음";
  id("exam-submit").focus();
}
answerForm.addEventListener("submit", event => { event.preventDefault(); gradeOrNext(); });
document.addEventListener("keydown", event => {
  if (id("vocab-exam").hidden || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      event.isComposing || event.target.closest("a, details, dialog, .site-header, .site-footer")) return;
  if (event.key === "Enter") {
    event.preventDefault();
    if (!event.repeat) gradeOrNext();
  } else if (/^[1-4]$/.test(event.key) && !id("exam-options").disabled) {
    event.preventDefault();
    const input = id("exam-options").querySelectorAll("input")[Number(event.key) - 1];
    input.checked = true;
    input.focus();
    id("exam-submit").disabled = false;
  }
});

function missed() { return session.questions.filter((q, i) => q.correct !== session.picks[i]); }
function resultEncouragement(percentage) {
  if (percentage === 100) return "완벽해요! 다음 급수에 도전해 볼까요?";
  if (percentage >= 80) return "거의 다 왔어요. 틀린 단어만 다시 보면 끝!";
  if (percentage >= 50) return "절반 넘게 맞혔어요. 함정만 조심하면 더 올라가요.";
  return "틀린 단어가 곧 공부할 단어예요. 오답부터 다시 풀어 봐요.";
}

function showResults() {
  showSection("vocab-result");
  const { questions, picks } = session;
  const mistakes = missed();
  const right = questions.length - mistakes.length;
  const percentage = Math.round(right / questions.length * 100);
  const activeModes = modes.filter(mode => questions.some(q => q.mode === mode));
  id("result-scope").textContent = session.selectedLevels.join(" · ") + " / " + activeModes.map(m => modeNames[m]).join(" + ");
  id("result-score").textContent = right + " / " + questions.length;
  id("result-percent").textContent = percentage + "%";
  id("result-progress").value = percentage;
  id("result-encouragement").textContent = resultEncouragement(percentage);
  const stats = element("dl");
  for (const mode of activeModes) {
    const total = questions.filter(q => q.mode === mode).length;
    const hit = total - mistakes.filter(q => q.mode === mode).length;
    stats.append(element("dt", modeNames[mode]), element("dd", hit + "/" + total + " · " + Math.round(hit / total * 100) + "%"));
  }
  const traps = new Map();
  const review = id("result-words");
  review.replaceChildren();
  for (const [i, q] of questions.entries()) {
    if (q.correct === picks[i]) continue;
    const wrong = q.options[picks[i]];
    const trap = wrong.trap;
    traps.set(trap, (traps.get(trap) ?? 0) + 1);
    const item = element("li");
    const note = element("span", null, "word-trap");
    note.append("내 답 ", japanese("span", wrong.text), " · " + trap);
    item.append(definition(q.entry, true), note);
    review.append(item);
  }
  const ranking = [...traps].sort((a, b) => b[1] - a[1]).map(([trap, count]) => trap + " " + count + "회");
  stats.append(element("dt", "자주 걸린 함정"), element("dd", ranking.join(" · ") || "없음"));
  id("result-stats").replaceChildren(stats);
  const hasMistakes = mistakes.length > 0;
  id("mistake-count").textContent = mistakes.length;
  id("mistake-review").hidden = !hasMistakes;
  id("mistake-empty").hidden = hasMistakes;
  id("retry-missed").hidden = !hasMistakes;
  id("result-title").focus();
}
id("retry-missed").addEventListener("click", () => begin(retryQuestions(missed())));
id("retry-session").addEventListener("click", () => start(lastSettings));
id("edit-settings").addEventListener("click", () => { showSection("vocab-setup"); id("setup-title").focus(); });
