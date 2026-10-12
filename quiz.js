// Shared Learn-mode quiz logic. Expects a global `SLUG` string and a global
// `LECTURES` object (from data.js) containing LECTURES[SLUG].terms = [{term, def}, ...]

const TERMS = LECTURES[SLUG].terms;

const STORAGE_KEY = "quizlearn_" + SLUG;
let levels = {};
try { levels = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch (e) { levels = {}; }

const MODE_KEY = "quizmode_" + SLUG;
let mode = localStorage.getItem(MODE_KEY) || "def2term"; // "def2term" | "term2def"

const MC_ONLY_KEY = "mcOnly_" + SLUG;
let mcOnly = localStorage.getItem(MC_ONLY_KEY) === "1";

const MASTERED = 3;
const ROUND_SIZE = 7;
let current = null;
let answered = false;
let currentOptionTexts = [];

function getLevel(i) { return levels[i] || 0; }
function setLevel(i, v) { levels[i] = Math.max(0, Math.min(MASTERED, v)); save(); }
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(levels)); }

function normalize(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}
function acceptableAnswers(term) {
  const m = term.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return [normalize(m[1]), normalize(m[2]), normalize(term)];
  return [normalize(term)];
}

function unmasteredIndices() {
  return TERMS.map((_, i) => i).filter(i => getLevel(i) < MASTERED);
}
function activeRoundIndices() {
  return unmasteredIndices().slice(0, ROUND_SIZE);
}
function pickIndex() {
  const pool = activeRoundIndices();
  if (pool.length === 0) return null;
  const weights = pool.map(i => MASTERED - getLevel(i));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let k = 0; k < pool.length; k++) {
    r -= weights[k];
    if (r <= 0) return pool[k];
  }
  return pool[pool.length - 1];
}

function updateProgress() {
  const masteredCount = TERMS.filter((_, i) => getLevel(i) >= MASTERED).length;
  const roundCount = activeRoundIndices().length;
  document.getElementById("progressLabel").textContent = masteredCount + " / " + TERMS.length + " mastered";
  document.getElementById("remainingLabel").textContent = roundCount > 0 ? "practicing " + roundCount + " terms this round" : "";
  document.getElementById("barFill").style.width = (masteredCount / TERMS.length * 100) + "%";
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomDistractorIndices(correctIdx, count) {
  const pool = TERMS.map((_, i) => i).filter(i => i !== correctIdx);
  shuffle(pool);
  return pool.slice(0, count);
}

function promptText(idx) { return mode === "term2def" ? TERMS[idx].term : TERMS[idx].def; }
function answerText(idx) { return mode === "term2def" ? TERMS[idx].def : TERMS[idx].term; }
function promptBadgeWord() { return mode === "term2def" ? "Term" : "Definition"; }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function applyModeButtons() {
  document.getElementById("modeDef2Term").classList.toggle("active", mode === "def2term");
  document.getElementById("modeTerm2Def").classList.toggle("active", mode === "term2def");
}

function setMode(m) {
  if (mode === m) return;
  mode = m;
  localStorage.setItem(MODE_KEY, m);
  applyModeButtons();
  renderQuestion();
}

function renderQuestion() {
  answered = false;
  updateProgress();
  const idx = pickIndex();
  if (idx === null) { renderDone(); return; }
  const level = getLevel(idx);
  // Writing out a full definition from memory isn't practical, so term->definition
  // mode always uses multiple choice; definition->term mode graduates to free-text
  // unless the user has forced multiple-choice-only mode.
  const type = (mcOnly || mode === "term2def") ? "mc" : (level < 2 ? "mc" : "written");
  current = { idx, type };
  const card = document.getElementById("card");

  if (type === "mc") {
    const optionIdx = shuffle(randomDistractorIndices(idx, 3).concat([idx]));
    currentOptionTexts = optionIdx.map(i => answerText(i));
    const correctText = answerText(idx);
    card.innerHTML =
      '<span class="badge">Multiple choice</span>' +
      '<div class="prompt">' + escapeHtml(promptText(idx)) + '</div>' +
      '<div class="options">' +
      currentOptionTexts.map((o, i) => '<button class="opt" data-i="' + i + '">' + escapeHtml(o) + '</button>').join("") +
      '</div>' +
      '<div id="feedbackArea"></div>';
    card.querySelectorAll(".opt").forEach(btn => {
      btn.addEventListener("click", () => handleMcAnswer(btn, correctText));
    });
  } else {
    card.innerHTML =
      '<span class="badge">Type the answer</span>' +
      '<div class="prompt">' + escapeHtml(promptText(idx)) + '</div>' +
      '<div class="write-row">' +
      '<input type="text" id="writtenInput" placeholder="Type the term..." autocomplete="off">' +
      '<button class="primary" id="submitWritten">Submit</button>' +
      '</div>' +
      '<div id="feedbackArea"></div>';
    const input = document.getElementById("writtenInput");
    input.focus();
    const submit = () => handleWrittenAnswer(input.value, TERMS[idx].term);
    document.getElementById("submitWritten").addEventListener("click", submit);
    input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
  }
}

function handleMcAnswer(btn, correctText) {
  if (answered) return;
  answered = true;
  const chosen = currentOptionTexts[Number(btn.dataset.i)];
  const correct = chosen === correctText;
  document.querySelectorAll(".opt").forEach((o, i) => {
    o.disabled = true;
    if (currentOptionTexts[i] === correctText) o.classList.add("correct");
    else if (o === btn) o.classList.add("incorrect");
  });
  finishAnswer(correct, correctText);
}

function handleWrittenAnswer(value, correctTerm) {
  if (answered) return;
  answered = true;
  const accepted = acceptableAnswers(correctTerm);
  const correct = accepted.includes(normalize(value));
  document.getElementById("writtenInput").disabled = true;
  document.getElementById("submitWritten").disabled = true;
  finishAnswer(correct, correctTerm);
}

function finishAnswer(correct, correctText) {
  const idx = current.idx;
  setLevel(idx, getLevel(idx) + (correct ? 1 : -1));
  const fb = document.getElementById("feedbackArea");
  fb.innerHTML =
    '<div class="feedback ' + (correct ? "correct" : "incorrect") + '">' +
    (correct ? "Correct!" : "Not quite.") +
    '<span class="answer">' + escapeHtml(correctText) + '</span>' +
    '</div>' +
    '<button class="primary continue-btn" id="continueBtn">Continue</button>';
  document.getElementById("continueBtn").addEventListener("click", renderQuestion);
  updateProgress();
}

function renderDone() {
  document.getElementById("card").innerHTML =
    '<div class="done"><h2>All terms mastered!</h2><p>Great work — you have learned every term in this set. Switch modes above to test yourself the other way, or reset to practice again.</p></div>';
}

document.getElementById("resetBtn").addEventListener("click", () => {
  if (confirm("Reset all progress for this lecture?")) {
    levels = {};
    save();
    renderQuestion();
  }
});
document.getElementById("modeDef2Term").addEventListener("click", () => setMode("def2term"));
document.getElementById("modeTerm2Def").addEventListener("click", () => setMode("term2def"));

const mcOnlyToggle = document.getElementById("mcOnlyToggle");
mcOnlyToggle.checked = mcOnly;
mcOnlyToggle.addEventListener("change", () => {
  mcOnly = mcOnlyToggle.checked;
  localStorage.setItem(MC_ONLY_KEY, mcOnly ? "1" : "0");
  renderQuestion();
});

applyModeButtons();
renderQuestion();
