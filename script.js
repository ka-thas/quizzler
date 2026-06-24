const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Set text on an element and render any LaTeX math it contains.
// Supports $...$ and \(...\) for inline, $$...$$ and \[...\] for display.
function setMathText(element, text) {
    element.textContent = text ?? "";
    if (typeof renderMathInElement === "function") {
        renderMathInElement(element, {
            delimiters: [
                { left: "$$", right: "$$", display: true },
                { left: "\\[", right: "\\]", display: true },
                { left: "$", right: "$", display: false },
                { left: "\\(", right: "\\)", display: false },
            ],
            throwOnError: false,
        });
    }
}

// ---------- Elements ----------
const settingsPage = document.getElementById("settings");
const quizPage = document.getElementById("quiz");
const themeToggle = document.getElementById("theme-toggle");
const themePills = document.getElementById("theme-pills");
const themeHint = document.getElementById("theme-hint");
const participantToggle = document.getElementById("participant-toggle");
const participantHint = document.getElementById("participant-hint");
const shuffleToggle = document.getElementById("shuffle-toggle");
const shuffleHint = document.getElementById("shuffle-hint");
const startQuiz = document.getElementById("start-quiz");
const backToSettings = document.getElementById("back-to-settings");
const quizTitle = document.getElementById("quiz-title");
const progress = document.getElementById("progress");
const slide = document.getElementById("slide");
const slideNumber = document.getElementById("slide-number");
const slideQuestion = document.getElementById("slide-question");
const slideMedia = document.getElementById("slide-media");
const slideAnswer = document.getElementById("slide-answer");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const revealBtn = document.getElementById("reveal");
const maxQuestionsInput = document.getElementById("max-questions");
const maxQuestionsHint = document.getElementById("max-questions-hint");

// ---------- State ----------
let data = {};
let currentCollection = [];
let selectedThemes = new Set();
const themePillButtons = {};
let questions = [];
let index = 0;
let revealed = false;
let participantMode = localStorage.getItem("participant") === "true";
let shuffleMode = localStorage.getItem("shuffle") === "true";
let maxQuestions = parseInt(localStorage.getItem("maxQuestions"), 10) || 0;

// ---------- Theme ----------
function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    themeToggle.innerHTML = `<i data-lucide="${theme === "dark" ? "sun" : "moon"}"></i>`;
    lucide.createIcons();
}
applyTheme(document.documentElement.getAttribute("data-theme") || "light");
themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
});

// ---------- Participant display toggle ----------
function applyParticipantMode() {
    participantToggle.setAttribute("aria-checked", String(participantMode));
    document.body.classList.toggle("participant", participantMode);
    participantHint.textContent = participantMode
        ? "On — large projector view for the room; answers hidden until revealed."
        : "Off — compact host view, answers visible.";
}
participantToggle.addEventListener("click", () => {
    participantMode = !participantMode;
    localStorage.setItem("participant", String(participantMode));
    applyParticipantMode();
});
applyParticipantMode();

// ---------- Shuffle toggle ----------
function applyShuffleMode() {
    shuffleToggle.setAttribute("aria-checked", String(shuffleMode));
    shuffleHint.textContent = shuffleMode
        ? "On — questions are randomized each time you start."
        : "Off — questions appear in their original order.";
}
shuffleToggle.addEventListener("click", () => {
    shuffleMode = !shuffleMode;
    localStorage.setItem("shuffle", String(shuffleMode));
    applyShuffleMode();
});
applyShuffleMode();

// ---------- Max questions ----------
function applyMaxQuestions() {
    if (maxQuestions > 0) {
        maxQuestionsInput.value = maxQuestions;
        maxQuestionsHint.textContent = `Capped at ${maxQuestions} questions.`;
    } else {
        maxQuestionsInput.value = "";
        maxQuestionsHint.textContent = "All questions included.";
    }
}
maxQuestionsInput.addEventListener("input", () => {
    const val = parseInt(maxQuestionsInput.value, 10);
    maxQuestions = val > 0 ? val : 0;
    if (maxQuestions) localStorage.setItem("maxQuestions", String(maxQuestions));
    else localStorage.removeItem("maxQuestions");
    applyMaxQuestions();
});
applyMaxQuestions();

// ---------- Load collections ----------
async function fetchCollections() {
    const manifest = await fetch("data.json").then((r) => r.json());
    const entries = Object.entries(manifest);
    const loaded = await Promise.all(
        entries.map(([, path]) => fetch(path).then((r) => r.json()))
    );
    data = {};
    entries.forEach(([name], i) => { data[name] = loaded[i]; });

    const saved = new Set(JSON.parse(localStorage.getItem("themes") || "[]"));
    selectedThemes = new Set();
    themePills.innerHTML = "";
    for (const name in data) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "theme-pill";
        btn.textContent = data[name].title || name;
        btn.dataset.theme = name;
        btn.setAttribute("aria-pressed", "false");
        btn.addEventListener("click", () => toggleTheme(name));
        themePillButtons[name] = btn;
        themePills.appendChild(btn);
        if (saved.has(name)) setTheme(name, true);
    }
    updateThemeHint();
}

// Toggle / set a theme's selected state and reflect it on its pill.
function setTheme(name, on) {
    const btn = themePillButtons[name];
    if (!btn) return;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
    if (on) selectedThemes.add(name);
    else selectedThemes.delete(name);
}
function toggleTheme(name) {
    setTheme(name, !selectedThemes.has(name));
    localStorage.setItem("themes", JSON.stringify(Array.from(selectedThemes)));
    updateThemeHint();
}
function updateThemeHint() {
    const n = selectedThemes.size;
    themeHint.textContent = n === 0
        ? "Select one or more themes to include."
        : `${n} theme${n === 1 ? "" : "s"} selected.`;
    startQuiz.disabled = n === 0;
}

// Fisher-Yates in-place shuffle.
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ---------- Render quiz (one question at a time) ----------
// Accepts a list of theme names; their questions are combined into one quiz.
function renderQuiz(names) {
    currentCollection = names;
    questions = [];
    for (const name of names) {
        const collection = data[name];
        if (!collection) continue;
        for (const q of collection.questions || []) {
            questions.push(typeof q === "string" ? { q } : q);
        }
    }
    if (!participantMode) questions = questions.filter((q) => !q.img || !q.img.length);
    if (shuffleMode) shuffleArray(questions);
    if (maxQuestions > 0) questions = questions.slice(0, maxQuestions);
    quizTitle.textContent = names.length === 1
        ? (data[names[0]].title || names[0])
        : `${names.length} themes`;
    index = 0;
    showSlide();
}

// Render a question's images on the slide. Images are part of the "projector"
// view shown to the room, so they appear only in participant mode — the host's
// compact view stays text-only (and avoids loading the images at all).
function renderMedia(item) {
    slideMedia.innerHTML = "";
    if (!participantMode) return;
    const sources = Array.isArray(item.img) ? item.img : item.img ? [item.img] : [];
    for (const src of sources) {
        const img = document.createElement("img");
        img.src = src;
        img.alt = "";
        img.loading = "lazy";
        slideMedia.appendChild(img);
    }
}

function showSlide() {
    const item = questions[index] || { q: "" };
    revealed = false;
    const hasAnswer = Boolean(item.a);

    slideNumber.textContent = String(index + 1);
    setMathText(slideQuestion, item.q);
    renderMedia(item);
    setMathText(slideAnswer, item.a || "");
    slideAnswer.style.display = "none";

    revealBtn.disabled = !hasAnswer;
    revealBtn.textContent = "Show answer";
    prevBtn.disabled = false;
    nextBtn.disabled = false;
    progress.textContent = `${index + 1} / ${questions.length}`;
}

function toggleAnswer() {
    const item = questions[index];
    if (!item || !item.a) return;
    revealed = !revealed;
    slideAnswer.style.display = revealed ? "" : "none";
    revealBtn.textContent = revealed ? "Hide answer" : "Show answer";
}

function go(delta) {
    index = (index + delta + questions.length) % questions.length;
    showSlide();
}

revealBtn.addEventListener("click", toggleAnswer);
prevBtn.addEventListener("click", () => go(-1));
nextBtn.addEventListener("click", () => go(1));

// Keyboard: arrows to navigate, space/enter to reveal.
document.addEventListener("keydown", (e) => {
    if (quizPage.style.display !== "flex") return;
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleAnswer(); }
});

// Touch: swipe left/right to navigate.
let touchX = null;
slide.addEventListener("touchstart", (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
slide.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    touchX = null;
});

// ---------- Navigation ----------
function openQuiz(names) {
    const url = new URL(window.location);
    url.searchParams.set("quiz", names.join(","));
    history.pushState({}, "", url);
    renderQuiz(names);
    settingsPage.style.display = "none";
    quizPage.style.display = "flex";
}

startQuiz.addEventListener("click", () => {
    const names = Array.from(selectedThemes).filter((n) => data[n]);
    if (names.length) openQuiz(names);
});

backToSettings.addEventListener("click", () => {
    settingsPage.style.display = "flex";
    quizPage.style.display = "none";
    const url = new URL(window.location);
    url.searchParams.delete("quiz");
    history.pushState({}, "", url);
});

// ---------- Boot ----------
fetchCollections().then(() => {
    const param = new URLSearchParams(window.location.search).get("quiz");
    if (!param) return;
    const names = param.split(",").filter((n) => data[n]);
    if (!names.length) return;
    selectedThemes.forEach((n) => setTheme(n, false));
    names.forEach((n) => setTheme(n, true));
    updateThemeHint();
    openQuiz(names);
});
