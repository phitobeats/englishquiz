/* ============================================================
   UVIE — storage.js
   Handles all localStorage persistence: settings, bookmarks,
   quiz history, in-progress quiz state, and import/export.
   ============================================================ */

const UvieStorage = (() => {

  const KEYS = {
    HISTORY: "uvie_quiz_history",       // array of completed quiz records
    BOOKMARKS: "uvie_bookmarks",        // array of question ids
    IN_PROGRESS: "uvie_in_progress",    // single object or null
    SETTINGS: "uvie_settings",          // object
    WRONG_LOG: "uvie_wrong_log"         // map questionId -> {timesWrong, timesSeen}
  };

  function safeGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn("UvieStorage: failed to read", key, e);
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn("UvieStorage: failed to write", key, e);
      return false;
    }
  }

  /* ---------------- Settings ---------------- */
  const DEFAULT_SETTINGS = {
    theme: "navy",
    soundEnabled: false,
    autoAdvance: false
  };

  function getSettings() {
    return Object.assign({}, DEFAULT_SETTINGS, safeGet(KEYS.SETTINGS, {}));
  }
  function saveSettings(settings) {
    return safeSet(KEYS.SETTINGS, settings);
  }

  /* ---------------- Bookmarks ---------------- */
  function getBookmarks() {
    return safeGet(KEYS.BOOKMARKS, []);
  }
  function toggleBookmark(questionId) {
    const marks = getBookmarks();
    const idx = marks.indexOf(questionId);
    if (idx >= 0) marks.splice(idx, 1);
    else marks.push(questionId);
    safeSet(KEYS.BOOKMARKS, marks);
    return marks;
  }
  function isBookmarked(questionId) {
    return getBookmarks().includes(questionId);
  }

  /* ---------------- Wrong-answer log (for weak-topic practice) ---------------- */
  function getWrongLog() {
    return safeGet(KEYS.WRONG_LOG, {});
  }
  function logAnswer(questionId, wasCorrect, topic) {
    const log = getWrongLog();
    if (!log[questionId]) log[questionId] = { timesSeen: 0, timesWrong: 0, topic: topic };
    log[questionId].timesSeen += 1;
    log[questionId].topic = topic;
    if (!wasCorrect) log[questionId].timesWrong += 1;
    safeSet(KEYS.WRONG_LOG, log);
  }
  function getTopicMastery(questions) {
    const log = getWrongLog();
    const byTopic = {};
    questions.forEach(q => {
      if (!byTopic[q.topic]) byTopic[q.topic] = { seen: 0, wrong: 0 };
    });
    Object.keys(log).forEach(qid => {
      const entry = log[qid];
      if (!byTopic[entry.topic]) byTopic[entry.topic] = { seen: 0, wrong: 0 };
      byTopic[entry.topic].seen += entry.timesSeen;
      byTopic[entry.topic].wrong += entry.timesWrong;
    });
    const mastery = {};
    Object.keys(byTopic).forEach(topic => {
      const { seen, wrong } = byTopic[topic];
      mastery[topic] = seen > 0 ? Math.round(((seen - wrong) / seen) * 100) : null;
    });
    return mastery;
  }
  function getWeakQuestionIds(questions, limit) {
    const log = getWrongLog();
    const scored = questions
      .map(q => {
        const entry = log[q.id];
        if (!entry || entry.timesSeen === 0) return { id: q.id, score: 0.5 };
        return { id: q.id, score: entry.timesWrong / entry.timesSeen };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, limit || scored.length).map(x => x.id);
  }

  /* ---------------- Quiz history / analytics ---------------- */
  function getHistory() {
    return safeGet(KEYS.HISTORY, []);
  }
  function addHistoryRecord(record) {
    const history = getHistory();
    history.push(record);
    safeSet(KEYS.HISTORY, history);
    return history;
  }
  function clearHistory() {
    safeSet(KEYS.HISTORY, []);
  }

  /* ---------------- In-progress quiz (Continue feature) ---------------- */
  function saveInProgress(state) {
    return safeSet(KEYS.IN_PROGRESS, state);
  }
  function getInProgress() {
    return safeGet(KEYS.IN_PROGRESS, null);
  }
  function clearInProgress() {
    safeSet(KEYS.IN_PROGRESS, null);
  }

  /* ---------------- Reset everything ---------------- */
  function resetAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  }

  /* ---------------- Import / Export ---------------- */
  function exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "UVIE",
      version: 1,
      data: {
        history: getHistory(),
        bookmarks: getBookmarks(),
        settings: getSettings(),
        wrongLog: getWrongLog()
      }
    };
    return JSON.stringify(payload, null, 2);
  }

  function importData(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || !parsed.data) throw new Error("Invalid UVIE export file.");
      const { history, bookmarks, settings, wrongLog } = parsed.data;
      if (Array.isArray(history)) safeSet(KEYS.HISTORY, history);
      if (Array.isArray(bookmarks)) safeSet(KEYS.BOOKMARKS, bookmarks);
      if (settings && typeof settings === "object") safeSet(KEYS.SETTINGS, settings);
      if (wrongLog && typeof wrongLog === "object") safeSet(KEYS.WRONG_LOG, wrongLog);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return {
    KEYS,
    getSettings, saveSettings,
    getBookmarks, toggleBookmark, isBookmarked,
    getWrongLog, logAnswer, getTopicMastery, getWeakQuestionIds,
    getHistory, addHistoryRecord, clearHistory,
    saveInProgress, getInProgress, clearInProgress,
    resetAll,
    exportData, importData
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = UvieStorage; }
