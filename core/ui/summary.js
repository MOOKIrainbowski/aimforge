import { t } from "../i18n.js";

const screenEl = document.getElementById("summary-screen");
const statsEl = document.getElementById("summary-stats");
const retryBtn = document.getElementById("summary-retry");
const menuBtn = document.getElementById("summary-menu");

// Recoil compensation is optional (only present when a Recoil Control
// weapon was selected) — appended to whichever mode ran with it enabled.
function recoilRow(extra) {
  return extra.avgRecoilCompensation != null
    ? [t("summary.recoil", { value: extra.avgRecoilCompensation.toFixed(0) })]
    : [];
}

// Per-mode extra rows, since each drill's `extra` shape is different.
const EXTRA_ROWS = {
  gridshot: (extra) => [
    t("summary.gridshot.ttk", { value: extra.avgTimeToKillMs.toFixed(0) }),
    t("summary.gridshot.bestStreak", { value: extra.bestStreak }),
    ...recoilRow(extra),
  ],
  tracking: (extra) => [
    t("summary.tracking.onTarget", { value: (extra.onTargetTimeMs / 1000).toFixed(1) }),
    t("summary.tracking.bestStreak", { value: (extra.bestStreakMs / 1000).toFixed(1) }),
  ],
  switching: (extra) => [
    t("summary.switching.avgSwitch", { value: extra.avgSwitchTimeMs.toFixed(0) }),
    t("summary.switching.waves", { value: extra.wavesCompleted }),
    t("summary.gridshot.bestStreak", { value: extra.bestStreak }),
    ...recoilRow(extra),
  ],
  reaction: (extra) => [
    t("summary.reaction.avg", { value: extra.avgReactionTimeMs.toFixed(0) }),
    t("summary.reaction.fastestSlowest", { fastest: extra.fastestMs.toFixed(0), slowest: extra.slowestMs.toFixed(0) }),
    t("summary.reaction.falseStarts", { value: extra.falseStarts }),
  ],
};

export function showSummary(result, coachTips, onRetry, onBackToMenu) {
  const extraRows = (EXTRA_ROWS[result.mode] ?? (() => []))(result.extra);
  const tipsHtml = (coachTips ?? [])
    .map((tipObj) => `<p class="coach-tip coach-tip-${tipObj.level}">${t(tipObj.key, tipObj.params)}</p>`)
    .join("");
  statsEl.innerHTML = `
    <p class="summary-mode">${t(`mode.${result.mode}.name`)}</p>
    <p class="summary-score">${t("summary.score", { value: result.score })}</p>
    <p>${t("summary.accuracy", { value: result.accuracy.toFixed(1) })}</p>
    ${extraRows.map((row) => `<p>${row}</p>`).join("")}
    ${tipsHtml ? `<div class="coach-panel"><p class="coach-heading">${t("summary.coachHeading")}</p>${tipsHtml}</div>` : ""}
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
