const screenEl = document.getElementById("summary-screen");
const statsEl = document.getElementById("summary-stats");
const retryBtn = document.getElementById("summary-retry");
const menuBtn = document.getElementById("summary-menu");

const MODE_LABELS = {
  gridshot: "Gridshot",
  tracking: "Tracking",
  switching: "Target Switching",
  reaction: "Reaction Time",
};

// Recoil compensation is optional (only present when a Recoil Control
// weapon was selected) — appended to whichever mode ran with it enabled.
function recoilRow(extra) {
  return extra.avgRecoilCompensation != null
    ? [`Recoil compensation: ${extra.avgRecoilCompensation.toFixed(0)}%`]
    : [];
}

// Per-mode extra rows, since each drill's `extra` shape is different.
const EXTRA_ROWS = {
  gridshot: (extra) => [
    `Avg time-to-kill: ${extra.avgTimeToKillMs.toFixed(0)} ms`,
    `Best streak: ${extra.bestStreak}`,
    ...recoilRow(extra),
  ],
  tracking: (extra) => [
    `Time on target: ${(extra.onTargetTimeMs / 1000).toFixed(1)}s`,
    `Best streak: ${(extra.bestStreakMs / 1000).toFixed(1)}s`,
  ],
  switching: (extra) => [
    `Avg switch time: ${extra.avgSwitchTimeMs.toFixed(0)} ms`,
    `Waves completed: ${extra.wavesCompleted}`,
    `Best streak: ${extra.bestStreak}`,
    ...recoilRow(extra),
  ],
  reaction: (extra) => [
    `Avg reaction: ${extra.avgReactionTimeMs.toFixed(0)} ms`,
    `Fastest / slowest: ${extra.fastestMs.toFixed(0)} / ${extra.slowestMs.toFixed(0)} ms`,
    `False starts: ${extra.falseStarts}`,
  ],
};

export function showSummary(result, coachTips, onRetry, onBackToMenu) {
  const extraRows = (EXTRA_ROWS[result.mode] ?? (() => []))(result.extra);
  const tipsHtml = (coachTips ?? [])
    .map((t) => `<p class="coach-tip coach-tip-${t.level}">${t.text}</p>`)
    .join("");
  statsEl.innerHTML = `
    <p class="summary-mode">${MODE_LABELS[result.mode] ?? result.mode}</p>
    <p><strong>${result.score}</strong> score</p>
    <p>${result.accuracy.toFixed(1)}% accuracy</p>
    ${extraRows.map((row) => `<p>${row}</p>`).join("")}
    ${tipsHtml ? `<div class="coach-panel"><p class="coach-heading">Coach Feedback</p>${tipsHtml}</div>` : ""}
  `;
  screenEl.classList.remove("hidden");
  retryBtn.onclick = () => {
    screenEl.classList.add("hidden");
    onRetry();
  };
  menuBtn.onclick = () => {
    screenEl.classList.add("hidden");
    onBackToMenu();
  };
}

export function hideSummary() {
  screenEl.classList.add("hidden");
}
