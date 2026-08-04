
# UVIE — Offline CBT Practice App for GST122 (Communication in English II)

UVIE is a fully offline, browser-based Computer-Based Test (CBT) practice
app. No install, no server, no internet connection required — just open
`index.html` in any modern browser.

---

## ⚠️ Important: Where the questions came from

**No GST122 course PDFs, slides, or notes were uploaded for this build.**
What was provided was the course's **week-by-week topic list** (module
names like "Week 3: Grammar — Concord", "Week 7: Comprehension Strategies
— SQ3R", etc.), taken from the course navigation menu — not the actual
lecture content.

All 150 questions, options, explanations, and memory tips in
`questions.js` were therefore written from **general knowledge of these
GST122-style topics** (communication theory, parts of speech, concord,
punctuation, essay types, SQ3R, word formation, stress/intonation,
inductive/deductive reasoning, listening skills, note-taking methods),
**not sourced from your specific lecturer's slides, wording, or
emphasis.**

**Before relying on this for your exam:**
- Cross-check the terminology and examples against your actual course
  material — some institutions define terms slightly differently or
  emphasize specific examples from lectures.
- Treat any question you're unsure about as a prompt to go check your
  notes, not as a guaranteed-accurate exam fact.
- If you can share the actual PDFs/slides later, the question bank in
  `questions.js` can be revised to match your syllabus exactly — it's a
  plain JavaScript array, easy to edit or regenerate.

---

## Getting Started

1. Unzip the project.
2. Double-click `index.html` — it opens directly in your default browser.
   (No build step, no `npm install`, no server needed.)
3. That's it. Everything runs client-side and works fully offline after
   the first load.

**Optional (recommended for smoothest experience):** if your browser
restricts local file access for JavaScript modules, serve the folder
with a simple local server instead of double-clicking:

```bash
# From inside the UVIE folder
python3 -m http.server 8000
# then open http://localhost:8000 in your browser
```

This isn't required for the app to work (it uses plain `<script>` tags,
not ES modules), but it's a good fallback if you ever see a blank page.

---

## Features

### Modes
- **Study Mode** — untimed, shows the correct answer, explanation, and a
  memory tip immediately after you answer each question.
- **Mock Exam Mode** — timed, exam-style. Explanations are hidden until
  you finish the quiz. Timer is automatically allocated at **5 minutes
  per 10 questions** (e.g. 50 questions = 25 minutes, 150 questions = 75
  minutes).
- **Weak-Topic Practice** — automatically pulls the questions you've
  historically gotten wrong most often, across all past quizzes.
- **Bookmarked Questions** — practice only the questions you've
  starred for extra review.

### Question selection
Choose how many questions to answer: 10, 20, 30, 40, 50, 60, 70, 80, 90,
100, 120, or 150 — plus optional filters by **topic** and **difficulty**
(easy / medium / hard).

### Per-question data
Every question includes: id, week, topic, difficulty, the question text,
four options, the correct answer, a written explanation, and a short
memory tip.

### Other features
- Random question selection + shuffled answer order every run
- Bookmark any question for later review
- Full answer review after each quiz (your answer vs. correct answer +
  explanation)
- "Practice Missed Questions" — instantly re-quiz on what you got wrong
- Progress bar + question counter during quizzes
- Topic and difficulty shown on every question
- Analytics page: total quizzes, best score, average score, total study
  time, and per-topic mastery percentages
- Continue an in-progress quiz if you close the app mid-way
- Settings page: reset all progress, export progress to a `.json` file,
  import progress from a previously exported file
- Everything is stored in your browser's `localStorage` — nothing is
  sent to any server, ever

---

## Project Structure

```
UVIE/
│
├── index.html      → App shell: nav bar + view container
├── style.css        → Dark navy glassmorphism theme, fully responsive
├── script.js         → App logic: routing, quiz engine, timer, bookmarks,
│                        review, analytics rendering, settings
├── questions.js      → The 150-question bank (see sourcing note above)
├── analytics.js      → Score/statistics calculations
├── storage.js         → localStorage wrapper (settings, bookmarks,
│                        history, import/export, in-progress state)
├── assets/            → (reserved for future icons/images — currently
│                        empty; the app uses emoji instead of image
│                        assets to stay dependency-free)
└── README.md          → This file
```

---

## Editing the question bank

Open `questions.js` in any text editor. Each question is a plain object:

```js
{ id:"w3-01", week:3, topic:"Concord", difficulty:"easy",
  question:"Concord (agreement) in grammar refers to:",
  options:["...", "...", "...", "..."],
  correct: 0,               // index (0-3) of the correct option
  explanation:"...",
  memoryTip:"..." }
```

Add, remove, or edit entries freely — the app reads the array at load
time, so changes take effect on the next page refresh. `correct` is the
index into `options` **before** shuffling; the app shuffles answer order
itself at quiz time, so you don't need to worry about answer position.

---

## Tech notes

- Pure HTML, CSS, and vanilla JavaScript — no frameworks, no build tools,
  no external dependencies of any kind.
- Works fully offline after the initial file load.
- Responsive down to small mobile screens.
- Tested logic includes: 150 unique question IDs, all four options
  present per question, syntax-validated JS across all files.
