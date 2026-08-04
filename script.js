/* ============================================================
   UVIE — script.js
   Main application logic: view routing, quiz engine (Study &
   Mock Exam modes), timer, shuffle, bookmarks, review, weak-
   topic practice, analytics rendering, and settings.
   ============================================================ */

(function () {
  "use strict";

  /* ---------------- App State ---------------- */
  const state = {
    view: "home",
    mode: null,              // "study" | "mock" | "weak" | "bookmarked"
    selectedCount: 20,
    selectedTopic: "all",
    selectedDifficulty: "all",
    quizQuestions: [],       // active question set for this run
    current: 0,
    answers: {},             // questionId -> { chosenIndex, correct, shuffledOptions, correctShuffledIndex }
    score: 0,
    startTime: null,
    timeLimitSeconds: null,
    timerInterval: null,
    remainingSeconds: null,
    finished: false
  };

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  const view = $("#view");

  /* ---------------- Utility ---------------- */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  function formatClock(totalSeconds) {
    if (totalSeconds === null || totalSeconds === undefined) return "--:--";
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${pad2(m)}:${pad2(s)}`;
  }

  function timeAllocationSeconds(numQuestions) {
    // 5 minutes per 10 questions, scaled proportionally
    return Math.round((numQuestions / 10) * 5 * 60);
  }

  function toast(message, type) {
    const el = $("#toast");
    el.textContent = message;
    el.className = "show " + (type || "");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.className = ""; }, 2600);
  }

  function getAllTopics() {
    const topics = new Set(QUESTIONS.map(q => q.topic));
    return Array.from(topics);
  }

  function questionsByFilter(topic, difficulty) {
    return QUESTIONS.filter(q => {
      const topicOk = topic === "all" || q.topic === topic;
      const diffOk = difficulty === "all" || q.difficulty === difficulty;
      return topicOk && diffOk;
    });
  }

  /* ---------------- Routing ---------------- */
  function navigate(v) {
    if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
    state.view = v;
    render();
  }

  function render() {
    $$(".nav-link").forEach(el => el.classList.toggle("active", el.dataset.view === state.view));
    switch (state.view) {
      case "home": return renderHome();
      case "setup": return renderSetup();
      case "quiz": return renderQuiz();
      case "results": return renderResults();
      case "review": return renderReview();
      case "bookmarks": return renderBookmarks();
      case "analytics": return renderAnalytics();
      case "settings": return renderSettings();
      default: return renderHome();
    }
  }

  /* ---------------- HOME ---------------- */
  function renderHome() {
    const inProgress = UvieStorage.getInProgress();
    let continueHtml = "";
    if (inProgress && inProgress.quizQuestions && inProgress.quizQuestions.length) {
      const answeredCount = Object.keys(inProgress.answers || {}).length;
      continueHtml = `
        <div class="glass continue-banner">
          <div class="info">
            <strong>Resume your last quiz</strong>
            <span>${inProgress.mode === "mock" ? "Mock Exam" : "Study Mode"} · ${answeredCount}/${inProgress.quizQuestions.length} answered</span>
          </div>
          <div class="btn-row" style="margin:0;">
            <button class="btn primary small" id="resumeBtn">Continue</button>
            <button class="btn ghost small" id="discardBtn">Discard</button>
          </div>
        </div>`;
    }

    view.innerHTML = `
      <div class="page-header">
        <div class="eyebrow">GST122 · Communication in English II</div>
        <h1>Welcome to UVIE</h1>
        <p>Your offline CBT practice companion. Choose a mode below to start testing yourself on the full ${QUESTIONS.length}-question bank across all 12 weeks.</p>
      </div>
      ${continueHtml}
      <div class="mode-grid">
        <div class="glass mode-card" data-mode="study">
          <div class="mode-icon">📘</div>
          <span class="badge">Learn</span>
          <h3>Study Mode</h3>
          <p>See the correct answer, explanation, and memory tip immediately after each question. No pressure, just learning.</p>
        </div>
        <div class="glass mode-card" data-mode="mock">
          <div class="mode-icon">⏱️</div>
          <span class="badge">Exam</span>
          <h3>Mock Exam Mode</h3>
          <p>Timed, exam-style conditions. Answers and explanations only appear after you submit. 5 minutes per 10 questions.</p>
        </div>
        <div class="glass mode-card" data-mode="weak">
          <div class="mode-icon">🎯</div>
          <span class="badge">Focus</span>
          <h3>Weak-Topic Practice</h3>
          <p>Automatically pulls the questions you've gotten wrong most often, so you spend time where it counts.</p>
        </div>
        <div class="glass mode-card" data-mode="bookmarked">
          <div class="mode-icon">🔖</div>
          <span class="badge">Saved</span>
          <h3>Bookmarked Questions</h3>
          <p>Practice only the questions you've flagged for extra review.</p>
        </div>
      </div>
    `;

    $$(".mode-card").forEach(card => {
      card.addEventListener("click", () => {
        const mode = card.dataset.mode;
        if (mode === "weak") {
          const weakIds = UvieStorage.getWeakQuestionIds(QUESTIONS, 100);
          if (weakIds.length === 0) {
            toast("No weak-topic data yet — complete a quiz first.", "error");
            return;
          }
          startQuizFromIds(weakIds, "weak");
          return;
        }
        if (mode === "bookmarked") {
          const marks = UvieStorage.getBookmarks();
          if (marks.length === 0) {
            toast("You haven't bookmarked any questions yet.", "error");
            return;
          }
          startQuizFromIds(marks, "bookmarked");
          return;
        }
        state.mode = mode;
        navigate("setup");
      });
    });

    const resumeBtn = $("#resumeBtn");
    if (resumeBtn) resumeBtn.addEventListener("click", () => {
      Object.assign(state, inProgress);
      navigate("quiz");
      resumeTimerIfNeeded();
    });
    const discardBtn = $("#discardBtn");
    if (discardBtn) discardBtn.addEventListener("click", () => {
      UvieStorage.clearInProgress();
      toast("Discarded previous quiz.");
      renderHome();
    });
  }

  /* ---------------- SETUP (question count / filters) ---------------- */
  const COUNT_OPTIONS = [10,20,30,40,50,60,70,80,90,100,120,150];

  function renderSetup() {
    const topics = getAllTopics();
    const modeLabel = state.mode === "mock" ? "Mock Exam" : "Study Mode";

    view.innerHTML = `
      <div class="page-header">
        <div class="eyebrow">${modeLabel} Setup</div>
        <h1>How many questions?</h1>
        <p>${state.mode === "mock" ? "Time is automatically allocated at 5 minutes per 10 questions." : "No timer in Study Mode — go at your own pace."}</p>
      </div>

      <div class="glass card">
        <div class="filter-row">
          <select class="filter-select" id="topicSelect">
            <option value="all">All Topics</option>
            ${topics.map(t => `<option value="${t}">${t}</option>`).join("")}
          </select>
          <select class="filter-select" id="diffSelect">
            <option value="all">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        <div class="count-grid" id="countGrid">
          ${COUNT_OPTIONS.map(n => `<div class="count-chip ${n === state.selectedCount ? "selected" : ""}" data-count="${n}">${n}</div>`).join("")}
        </div>

        <div class="timer-preview" id="timerPreview"></div>

        <div class="btn-row">
          <button class="btn ghost" id="backHomeBtn">← Back</button>
          <button class="btn primary" id="startQuizBtn">Start ${modeLabel}</button>
        </div>
      </div>
    `;

    updateTimerPreview();

    $("#topicSelect").value = state.selectedTopic;
    $("#diffSelect").value = state.selectedDifficulty;
    $("#topicSelect").addEventListener("change", e => { state.selectedTopic = e.target.value; updateTimerPreview(); });
    $("#diffSelect").addEventListener("change", e => { state.selectedDifficulty = e.target.value; updateTimerPreview(); });

    $$(".count-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        $$(".count-chip").forEach(c => c.classList.remove("selected"));
        chip.classList.add("selected");
        state.selectedCount = parseInt(chip.dataset.count, 10);
        updateTimerPreview();
      });
    });

    $("#backHomeBtn").addEventListener("click", () => navigate("home"));
    $("#startQuizBtn").addEventListener("click", () => {
      const pool = questionsByFilter(state.selectedTopic, state.selectedDifficulty);
      if (pool.length === 0) {
        toast("No questions match that filter combination.", "error");
        return;
      }
      const count = Math.min(state.selectedCount, pool.length);
      const chosen = shuffle(pool).slice(0, count);
      startQuiz(chosen, state.mode);
    });
  }

  function updateTimerPreview() {
    const pool = questionsByFilter(state.selectedTopic, state.selectedDifficulty);
    const count = Math.min(state.selectedCount, pool.length);
    const box = $("#timerPreview");
    if (!box) return;
    if (state.mode === "mock") {
      const secs = timeAllocationSeconds(count);
      box.innerHTML = `⏱️ <b>${count}</b> questions available &middot; time limit: <b>${formatClock(secs).replace(":", "m ")}s</b> (${Math.round(secs/60)} min)`;
    } else {
      box.innerHTML = `📘 <b>${count}</b> questions available in this filter &middot; untimed`;
    }
  }

  /* ---------------- Quiz start / engine ---------------- */
  function startQuiz(questionList, mode) {
    state.mode = mode;
    state.quizQuestions = questionList.map(q => {
      const optionIndices = shuffle([0,1,2,3]);
      const shuffledOptions = optionIndices.map(i => q.options[i]);
      const correctShuffledIndex = optionIndices.indexOf(q.correct);
      return { ...q, shuffledOptions, correctShuffledIndex };
    });
    state.current = 0;
    state.answers = {};
    state.score = 0;
    state.finished = false;
    state.startTime = Date.now();
    state.timeLimitSeconds = mode === "mock" ? timeAllocationSeconds(state.quizQuestions.length) : null;
    state.remainingSeconds = state.timeLimitSeconds;

    persistInProgress();
    navigate("quiz");
    if (mode === "mock") startTimer();
  }

  function startQuizFromIds(ids, mode) {
    const set = ids.map(id => QUESTIONS.find(q => q.id === id)).filter(Boolean);
    startQuiz(shuffle(set), mode);
  }

  function persistInProgress() {
    UvieStorage.saveInProgress({
      mode: state.mode,
      quizQuestions: state.quizQuestions,
      current: state.current,
      answers: state.answers,
      score: state.score,
      startTime: state.startTime,
      timeLimitSeconds: state.timeLimitSeconds,
      remainingSeconds: state.remainingSeconds,
      finished: state.finished
    });
  }

  function resumeTimerIfNeeded() {
    if (state.mode === "mock" && !state.finished) startTimer();
  }

  function startTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      state.remainingSeconds -= 1;
      updateTimerDisplay();
      if (state.remainingSeconds <= 0) {
        clearInterval(state.timerInterval);
        state.remainingSeconds = 0;
        toast("Time's up! Submitting your exam...", "error");
        finishQuiz();
      }
      persistInProgress();
    }, 1000);
    updateTimerDisplay();
  }

  function updateTimerDisplay() {
    const box = $("#timerBox");
    if (!box) return;
    box.textContent = formatClock(state.remainingSeconds);
    box.className = "timer-box glass";
    if (state.remainingSeconds <= 30) box.className += " critical";
    else if (state.remainingSeconds <= Math.max(60, state.timeLimitSeconds * 0.15)) box.className += " warning";
  }

  /* ---------------- QUIZ VIEW ---------------- */
  function renderQuiz() {
    const q = state.quizQuestions[state.current];
    if (!q) { navigate("home"); return; }
    const isAnswered = !!state.answers[q.id];
    const isStudy = state.mode === "study" || state.mode === "weak" || state.mode === "bookmarked";
    const bookmarked = UvieStorage.isBookmarked(q.id);

    view.innerHTML = `
      <div class="quiz-top">
        <div class="quiz-meta">
          <span class="meta-pill">Week ${q.week}</span>
          <span class="meta-pill">${q.topic}</span>
          <span class="meta-pill difficulty-${q.difficulty}">${q.difficulty}</span>
        </div>
        ${state.mode === "mock" ? `<div class="timer-box glass" id="timerBox">${formatClock(state.remainingSeconds)}</div>` : ""}
      </div>

      <div class="progress-track"><div class="progress-fill" style="width:${(state.current/state.quizQuestions.length)*100}%"></div></div>

      <div class="glass q-card">
        <div class="q-header">
          <div>
            <div class="q-number">Question ${state.current + 1} of ${state.quizQuestions.length}</div>
          </div>
          <button class="bookmark-btn ${bookmarked ? "active" : ""}" id="bookmarkBtn" title="Bookmark this question">${bookmarked ? "★" : "☆"}</button>
        </div>
        <div class="q-text">${q.question}</div>

        <div class="options" id="optionsList">
          ${q.shuffledOptions.map((opt, i) => {
            let cls = "option";
            if (isAnswered && isStudy) {
              cls += " locked";
              if (i === q.correctShuffledIndex) cls += " correct";
              else if (i === state.answers[q.id].chosenIndex) cls += " wrong";
              else cls += " faded";
            } else if (isAnswered && !isStudy) {
              cls += " locked";
              if (i === state.answers[q.id].chosenIndex) cls += " selected-mock";
            }
            return `<button class="${cls}" data-idx="${i}" ${isAnswered ? "disabled" : ""}>
              <span class="opt-letter">${String.fromCharCode(65+i)}</span><span>${opt}</span>
            </button>`;
          }).join("")}
        </div>

        ${isStudy && isAnswered ? renderExplanation(q) : ""}
      </div>

      <div class="quiz-nav">
        <button class="btn ghost" id="prevQBtn" ${state.current === 0 ? "disabled" : ""}>← Back</button>
        <button class="btn danger" id="endQuizBtn">End &amp; Submit</button>
        <button class="btn primary" id="nextQBtn" ${isAnswered ? "" : "disabled"}>
          ${state.current === state.quizQuestions.length - 1 ? "Finish Quiz" : "Next →"}
        </button>
      </div>
    `;

    if (state.mode === "mock") updateTimerDisplay();

    $$("#optionsList .option").forEach(btn => {
      if (isAnswered) return;
      btn.addEventListener("click", () => selectAnswer(q, parseInt(btn.dataset.idx, 10)));
    });

    $("#bookmarkBtn").addEventListener("click", () => {
      UvieStorage.toggleBookmark(q.id);
      renderQuiz();
    });

    $("#prevQBtn").addEventListener("click", () => { state.current--; persistInProgress(); renderQuiz(); });
    $("#nextQBtn").addEventListener("click", () => {
      if (state.current === state.quizQuestions.length - 1) finishQuiz();
      else { state.current++; persistInProgress(); renderQuiz(); }
    });
    $("#endQuizBtn").addEventListener("click", () => {
      if (confirm("End the quiz now and submit your current answers?")) finishQuiz();
    });
  }

  function renderExplanation(q) {
    const ans = state.answers[q.id];
    const wasCorrect = ans.correct;
    return `
      <div class="explanation-box">
        <span class="explanation-tag ${wasCorrect ? "correct-tag" : "wrong-tag"}">${wasCorrect ? "✓ Correct" : "✕ Incorrect"}</span>
        <p>${q.explanation}</p>
        <div class="memory-tip">💡 <span>${q.memoryTip}</span></div>
      </div>
    `;
  }

  function selectAnswer(q, chosenIndex) {
    const correct = chosenIndex === q.correctShuffledIndex;
    state.answers[q.id] = { chosenIndex, correct };
    if (correct) state.score++;
    UvieStorage.logAnswer(q.id, correct, q.topic);
    persistInProgress();
    renderQuiz();
  }

  function finishQuiz() {
    if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
    state.finished = true;
    const durationSeconds = Math.round((Date.now() - state.startTime) / 1000);
    const totalQuestions = state.quizQuestions.length;
    const answeredCount = Object.keys(state.answers).length;
    const correctCount = state.quizQuestions.filter(q => state.answers[q.id] && state.answers[q.id].correct).length;

    const record = {
      date: new Date().toISOString(),
      mode: state.mode,
      totalQuestions,
      answeredCount,
      correctCount,
      durationSeconds,
      topics: Array.from(new Set(state.quizQuestions.map(q => q.topic)))
    };
    UvieStorage.addHistoryRecord(record);
    UvieStorage.clearInProgress();

    state.lastRecord = record;
    navigate("results");
  }

  /* ---------------- RESULTS ---------------- */
  function renderResults() {
    const record = state.lastRecord || (UvieStorage.getHistory().slice(-1)[0]);
    if (!record) { navigate("home"); return; }
    const pct = record.totalQuestions > 0 ? Math.round((record.correctCount / record.totalQuestions) * 100) : 0;
    const grade = UvieAnalytics.letterGrade(pct);
    const remark = UvieAnalytics.gradeRemark(pct);

    // Topic breakdown for this run
    const byTopic = {};
    state.quizQuestions.forEach(q => {
      if (!byTopic[q.topic]) byTopic[q.topic] = { total: 0, correct: 0 };
      byTopic[q.topic].total++;
      if (state.answers[q.id] && state.answers[q.id].correct) byTopic[q.topic].correct++;
    });

    view.innerHTML = `
      <div class="glass result-hero card" style="--pct:${pct}">
        <div class="grade-circle">
          <div class="grade-letter">${grade}</div>
          <div class="grade-pct">${pct}%</div>
        </div>
        <h2>${record.correctCount} / ${record.totalQuestions} correct</h2>
        <p class="remark">${remark}</p>
      </div>

      <div class="result-stats">
        <div class="glass stat-card">
          <div class="stat-label">Time Taken</div>
          <div class="stat-value">${UvieAnalytics.formatDuration(record.durationSeconds)}</div>
        </div>
        <div class="glass stat-card">
          <div class="stat-label">Mode</div>
          <div class="stat-value" style="font-size:20px; text-transform:capitalize;">${record.mode}</div>
        </div>
        <div class="glass stat-card">
          <div class="stat-label">Answered</div>
          <div class="stat-value">${record.answeredCount}/${record.totalQuestions}</div>
        </div>
      </div>

      <div class="glass topic-breakdown">
        <div class="stat-label" style="margin-bottom:14px;">Topic Breakdown</div>
        ${Object.keys(byTopic).map(t => {
          const { total, correct } = byTopic[t];
          const tp = Math.round((correct/total)*100);
          const color = tp >= 70 ? "var(--good)" : tp >= 50 ? "var(--warn)" : "var(--bad)";
          return `<div class="topic-row">
            <div class="t-name">${t}</div>
            <div class="t-bar-track"><div class="t-bar-fill" style="width:${tp}%; background:${color};"></div></div>
            <div class="t-pct">${correct}/${total}</div>
          </div>`;
        }).join("")}
      </div>

      <div class="btn-row">
        <button class="btn ghost" id="reviewBtn">Review Answers</button>
        <button class="btn ghost" id="retakeWrongBtn">Practice Missed Questions</button>
        <button class="btn primary" id="homeBtn">Back to Home</button>
      </div>
    `;

    $("#reviewBtn").addEventListener("click", () => navigate("review"));
    $("#homeBtn").addEventListener("click", () => navigate("home"));
    $("#retakeWrongBtn").addEventListener("click", () => {
      const wrongIds = state.quizQuestions
        .filter(q => !state.answers[q.id] || !state.answers[q.id].correct)
        .map(q => q.id);
      if (wrongIds.length === 0) { toast("No missed questions — great job!", "success"); return; }
      startQuizFromIds(wrongIds, "study");
    });
  }

  /* ---------------- REVIEW ---------------- */
  function renderReview() {
    if (!state.quizQuestions.length) { navigate("home"); return; }
    view.innerHTML = `
      <div class="page-header">
        <div class="eyebrow">Review</div>
        <h1>Answer Review</h1>
        <p>Every question from your last quiz, with your answer, the correct answer, and the explanation.</p>
      </div>
      <div id="reviewList"></div>
      <div class="btn-row"><button class="btn primary" id="backResultsBtn">← Back to Results</button></div>
    `;
    const list = $("#reviewList");
    state.quizQuestions.forEach((q, idx) => {
      const ans = state.answers[q.id];
      const yourAnswerText = ans ? q.shuffledOptions[ans.chosenIndex] : "— not answered —";
      const correctAnswerText = q.shuffledOptions[q.correctShuffledIndex];
      const wasCorrect = ans && ans.correct;
      const item = document.createElement("div");
      item.className = "glass review-item";
      item.innerHTML = `
        <div class="q-number">Q${idx+1} · ${q.topic} · Week ${q.week}</div>
        <div class="rev-q">${q.question}</div>
        <div class="rev-answers">
          <div class="${wasCorrect ? "correct-ans" : "yours"}">Your answer: ${yourAnswerText} ${wasCorrect ? "✓" : "✕"}</div>
          ${!wasCorrect ? `<div class="correct-ans">Correct answer: ${correctAnswerText} ✓</div>` : ""}
        </div>
        <div class="rev-explain">${q.explanation}<br><em>💡 ${q.memoryTip}</em></div>
      `;
      list.appendChild(item);
    });
    $("#backResultsBtn").addEventListener("click", () => navigate("results"));
  }

  /* ---------------- BOOKMARKS ---------------- */
  function renderBookmarks() {
    const ids = UvieStorage.getBookmarks();
    const qs = ids.map(id => QUESTIONS.find(q => q.id === id)).filter(Boolean);

    view.innerHTML = `
      <div class="page-header">
        <div class="eyebrow">Saved</div>
        <h1>Bookmarked Questions</h1>
        <p>${qs.length} question${qs.length === 1 ? "" : "s"} bookmarked for extra review.</p>
      </div>
      ${qs.length === 0 ? `
        <div class="glass card empty-state">
          <div class="icon">🔖</div>
          <p>No bookmarks yet. Tap the star icon on any question during a quiz to save it here.</p>
        </div>
      ` : `
        <div class="btn-row" style="margin-top:0; margin-bottom:20px;">
          <button class="btn primary" id="practiceBookmarksBtn">Practice These (${qs.length})</button>
        </div>
        <div id="bmList"></div>
      `}
    `;

    if (qs.length > 0) {
      const list = $("#bmList");
      qs.forEach(q => {
        const item = document.createElement("div");
        item.className = "glass review-item";
        item.innerHTML = `
          <div class="q-number">${q.topic} · Week ${q.week}</div>
          <div class="rev-q">${q.question}</div>
          <div class="btn-row" style="margin-top:10px;">
            <button class="btn small danger" data-remove="${q.id}">Remove Bookmark</button>
          </div>
        `;
        list.appendChild(item);
      });
      $$("[data-remove]").forEach(btn => {
        btn.addEventListener("click", () => {
          UvieStorage.toggleBookmark(btn.dataset.remove);
          renderBookmarks();
        });
      });
      $("#practiceBookmarksBtn").addEventListener("click", () => startQuizFromIds(ids, "bookmarked"));
    }
  }

  /* ---------------- ANALYTICS ---------------- */
  function renderAnalytics() {
    const summary = UvieAnalytics.computeSummary();
    const mastery = UvieAnalytics.computeTopicMastery(QUESTIONS);
    const recent = UvieAnalytics.recentHistory(8);

    view.innerHTML = `
      <div class="page-header">
        <div class="eyebrow">Your Progress</div>
        <h1>Analytics &amp; Statistics</h1>
        <p>A full picture of your GST122 practice history, topic mastery, and study time.</p>
      </div>

      <div class="grid-4">
        <div class="glass stat-card">
          <div class="stat-label">Total Quizzes</div>
          <div class="stat-value accent">${summary.totalQuizzes}</div>
        </div>
        <div class="glass stat-card">
          <div class="stat-label">Best Score</div>
          <div class="stat-value accent">${summary.bestScorePct}%</div>
        </div>
        <div class="glass stat-card">
          <div class="stat-label">Average Score</div>
          <div class="stat-value accent">${summary.averageScorePct}%</div>
        </div>
        <div class="glass stat-card">
          <div class="stat-label">Study Time</div>
          <div class="stat-value" style="font-size:22px;">${UvieAnalytics.formatDuration(summary.totalStudyTimeSeconds)}</div>
        </div>
      </div>

      <div class="glass topic-breakdown" style="margin-top:18px;">
        <div class="stat-label" style="margin-bottom:14px;">Topic Mastery</div>
        ${Object.keys(mastery).length === 0 ? `<p style="color:var(--text-dim); font-size:13.5px;">Complete a quiz to see topic mastery here.</p>` :
        Object.keys(mastery).map(t => {
          const v = mastery[t];
          if (v === null) return `<div class="topic-row"><div class="t-name">${t}</div><div class="t-bar-track"></div><div class="t-pct">—</div></div>`;
          const color = v >= 70 ? "var(--good)" : v >= 50 ? "var(--warn)" : "var(--bad)";
          return `<div class="topic-row">
            <div class="t-name">${t}</div>
            <div class="t-bar-track"><div class="t-bar-fill" style="width:${v}%; background:${color};"></div></div>
            <div class="t-pct">${v}%</div>
          </div>`;
        }).join("")}
      </div>

      <div class="glass topic-breakdown" style="margin-top:18px;">
        <div class="stat-label" style="margin-bottom:14px;">Recent Quizzes</div>
        ${recent.length === 0 ? `<p style="color:var(--text-dim); font-size:13.5px;">No quiz history yet.</p>` :
        recent.map(r => {
          const pct = r.totalQuestions > 0 ? Math.round((r.correctCount/r.totalQuestions)*100) : 0;
          const d = new Date(r.date);
          return `<div class="topic-row">
            <div class="t-name" style="text-transform:capitalize;">${r.mode} · ${r.correctCount}/${r.totalQuestions}</div>
            <div class="t-pct" style="width:auto; color:var(--text-faint);">${d.toLocaleDateString()} </div>
            <div class="t-pct">${pct}%</div>
          </div>`;
        }).join("")}
      </div>
    `;
  }

  /* ---------------- SETTINGS ---------------- */
  function renderSettings() {
    const settings = UvieStorage.getSettings();
    view.innerHTML = `
      <div class="page-header">
        <div class="eyebrow">Preferences</div>
        <h1>Settings</h1>
        <p>Manage your data, preferences, and progress.</p>
      </div>

      <div class="glass card">
        <div class="settings-row">
          <div>
            <div class="s-label">Auto-advance after answering (Study Mode)</div>
            <div class="s-desc">Automatically move to the next question 2 seconds after answering.</div>
          </div>
          <div class="toggle ${settings.autoAdvance ? "on" : ""}" id="autoAdvanceToggle"></div>
        </div>
      </div>

      <div class="glass card">
        <div class="stat-label" style="margin-bottom:14px;">Data Management</div>

        <div class="settings-row">
          <div>
            <div class="s-label">Export Progress</div>
            <div class="s-desc">Download your quiz history, bookmarks, and stats as a JSON file.</div>
          </div>
          <button class="btn small" id="exportBtn">Export</button>
        </div>

        <div class="settings-row">
          <div>
            <div class="s-label">Import Progress</div>
            <div class="s-desc">Restore progress from a previously exported UVIE JSON file.</div>
          </div>
          <label class="file-input-label" for="importFile">Choose file</label>
          <input type="file" id="importFile" accept=".json,application/json" style="display:none;">
        </div>

        <div class="settings-row">
          <div>
            <div class="s-label">Reset All Progress</div>
            <div class="s-desc">Permanently clears quiz history, bookmarks, and stats. This cannot be undone.</div>
          </div>
          <button class="btn small danger" id="resetBtn">Reset</button>
        </div>
      </div>

      <div class="glass card">
        <div class="stat-label" style="margin-bottom:10px;">About</div>
        <p style="color:var(--text-dim); font-size:13.5px; line-height:1.6;">
          UVIE v1.0 — Offline CBT practice app for GST122 (Communication in English II).
          ${QUESTIONS.length} questions across 12 weeks. All data stays on this device (localStorage) —
          nothing is sent anywhere. See README.md for full details and content sourcing notes.
        </p>
      </div>
    `;

    $("#autoAdvanceToggle").addEventListener("click", () => {
      settings.autoAdvance = !settings.autoAdvance;
      UvieStorage.saveSettings(settings);
      renderSettings();
    });

    $("#exportBtn").addEventListener("click", () => {
      const json = UvieStorage.exportData();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `uvie-progress-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast("Progress exported.", "success");
    });

    $("#importFile").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = UvieStorage.importData(reader.result);
        if (result.success) { toast("Progress imported successfully.", "success"); renderSettings(); }
        else { toast("Import failed: " + result.error, "error"); }
      };
      reader.readAsText(file);
    });

    $("#resetBtn").addEventListener("click", () => {
      showConfirmModal(
        "Reset all progress?",
        "This will permanently delete your quiz history, bookmarks, and statistics from this device. This cannot be undone.",
        () => {
          UvieStorage.resetAll();
          toast("All progress has been reset.", "success");
          renderSettings();
        }
      );
    });
  }

  /* ---------------- Confirm modal ---------------- */
  function showConfirmModal(title, message, onConfirm) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="glass modal-box">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="btn-row" style="margin-top:0;">
          <button class="btn ghost" id="modalCancel">Cancel</button>
          <button class="btn danger" id="modalConfirm">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.querySelector("#modalCancel").addEventListener("click", () => backdrop.remove());
    backdrop.querySelector("#modalConfirm").addEventListener("click", () => { backdrop.remove(); onConfirm(); });
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
  }

  /* ---------------- Nav wiring ---------------- */
  $$(".nav-link").forEach(link => {
    link.addEventListener("click", () => navigate(link.dataset.view));
  });

  /* ---------------- Init ---------------- */
  document.addEventListener("DOMContentLoaded", () => {
    render();
  });

  // In case DOMContentLoaded already fired (script at end of body)
  if (document.readyState !== "loading") render();

})();
