/* ============================================================
   UVIE — analytics.js
   Computes derived statistics from quiz history stored via
   UvieStorage: best score, average score, total quizzes,
   total study time, and topic mastery breakdown.
   ============================================================ */

const UvieAnalytics = (() => {

  function computeSummary() {
    const history = UvieStorage.getHistory();

    if (history.length === 0) {
      return {
        totalQuizzes: 0,
        bestScorePct: 0,
        averageScorePct: 0,
        totalStudyTimeSeconds: 0,
        totalQuestionsAnswered: 0,
        totalCorrect: 0,
        lastQuizDate: null
      };
    }

    let bestPct = 0;
    let sumPct = 0;
    let totalTimeSeconds = 0;
    let totalQuestions = 0;
    let totalCorrect = 0;

    history.forEach(record => {
      const pct = record.totalQuestions > 0
        ? (record.correctCount / record.totalQuestions) * 100
        : 0;
      if (pct > bestPct) bestPct = pct;
      sumPct += pct;
      totalTimeSeconds += record.durationSeconds || 0;
      totalQuestions += record.totalQuestions || 0;
      totalCorrect += record.correctCount || 0;
    });

    return {
      totalQuizzes: history.length,
      bestScorePct: Math.round(bestPct),
      averageScorePct: Math.round(sumPct / history.length),
      totalStudyTimeSeconds: totalTimeSeconds,
      totalQuestionsAnswered: totalQuestions,
      totalCorrect: totalCorrect,
      lastQuizDate: history[history.length - 1].date
    };
  }

  function computeTopicMastery(allQuestions) {
    return UvieStorage.getTopicMastery(allQuestions);
  }

  function letterGrade(pct) {
    if (pct >= 90) return "A";
    if (pct >= 80) return "B";
    if (pct >= 70) return "C";
    if (pct >= 60) return "D";
    if (pct >= 50) return "E";
    return "F";
  }

  function gradeRemark(pct) {
    if (pct >= 90) return "Outstanding! You've mastered this material.";
    if (pct >= 80) return "Excellent work — you're exam-ready.";
    if (pct >= 70) return "Good grasp — polish a few weak spots.";
    if (pct >= 60) return "Fair — revisit the topics you missed.";
    if (pct >= 50) return "Borderline — more focused review needed.";
    return "Needs significant review before the exam.";
  }

  function formatDuration(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function recentHistory(limit) {
    const history = UvieStorage.getHistory();
    return history.slice(-1 * (limit || 10)).reverse();
  }

  return {
    computeSummary,
    computeTopicMastery,
    letterGrade,
    gradeRemark,
    formatDuration,
    recentHistory
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = UvieAnalytics; }
