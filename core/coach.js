import { mean, stdDev } from "./utils.js";

// Rule-based "Smart Coach" — no external API calls. Every tip is derived
// deterministically from the just-finished SessionResult plus the player's
// own recent history in the same mode (already in StatsStore). Each tip is
// {level, key, params}; level drives styling in the UI ("positive" |
// "warning" | "info"), and key/params are resolved to localized text by the
// caller via core/i18n.js's t() at render time — so a language switch
// re-renders correctly instead of baking English in here.
const MIN_SAMPLES_FOR_TREND = 3;
const TREND_WINDOW = 10;
const MAX_TIPS = 4;

function tip(level, key, params) {
  return { level, key, params };
}

// Compares this session's accuracy against the player's recent rolling
// average in the same mode — the only heuristic that looks across sessions
// rather than within one.
function trendTips(result, priorSessions) {
  const sameMode = priorSessions.filter((s) => s.mode === result.mode);
  if (sameMode.length < MIN_SAMPLES_FOR_TREND) return [];

  const recentAvgAccuracy = mean(sameMode.slice(-TREND_WINDOW).map((s) => s.accuracy));
  const delta = result.accuracy - recentAvgAccuracy;

  if (delta >= 8) {
    return [tip("positive", "tip.trendUp", { delta: delta.toFixed(0) })];
  }
  if (delta <= -8) {
    return [tip("warning", "tip.trendDown", { delta: Math.abs(delta).toFixed(0) })];
  }
  return [];
}

function gridshotTips(result) {
  const tips = [];
  const { timeToKillList, flickBias } = result.extra;

  if (result.shotsTotal >= 10) {
    if (result.accuracy < 60) {
      tips.push(tip("warning", "tip.gridshotLow", { accuracy: result.accuracy.toFixed(0) }));
    } else if (result.accuracy > 92) {
      tips.push(tip("positive", "tip.gridshotHigh", { accuracy: result.accuracy.toFixed(0) }));
    }
  }

  if (flickBias) {
    const flickSamples = flickBias.overshoot + flickBias.undershoot + flickBias.accurate;
    if (flickSamples >= 5) {
      if (flickBias.overshoot >= 3 && flickBias.overshoot > flickBias.undershoot * 1.5) {
        tips.push(tip("info", "tip.gridshotOvershoot"));
      } else if (flickBias.undershoot >= 3 && flickBias.undershoot > flickBias.overshoot * 1.5) {
        tips.push(tip("info", "tip.gridshotUndershoot"));
      }
    }
  }

  if (timeToKillList && timeToKillList.length >= 5) {
    const cv = stdDev(timeToKillList) / (mean(timeToKillList) || 1);
    if (cv > 0.6) {
      tips.push(tip("info", "tip.gridshotTtkVariance"));
    }
  }

  return tips;
}

function trackingTips(result) {
  const tips = [];
  const { onTargetTimeMs, bestStreakMs } = result.extra;

  if (result.accuracy < 50) {
    tips.push(tip("warning", "tip.trackingLow", { accuracy: result.accuracy.toFixed(0) }));
  }

  if (onTargetTimeMs > 500) {
    const consistency = bestStreakMs / onTargetTimeMs;
    if (consistency < 0.35) {
      tips.push(tip("info", "tip.trackingChoppy"));
    } else if (consistency > 0.85 && result.accuracy > 60) {
      tips.push(tip("positive", "tip.trackingSmooth"));
    }
  }

  return tips;
}

function switchingTips(result) {
  const tips = [];
  const { switchTimes, wavesCompleted } = result.extra;

  if (result.shotsTotal >= 10 && result.accuracy < 70) {
    tips.push(tip("warning", "tip.switchingLow", { accuracy: result.accuracy.toFixed(0) }));
  }

  if (switchTimes && switchTimes.length >= 5) {
    const cv = stdDev(switchTimes) / (mean(switchTimes) || 1);
    if (cv > 0.55) {
      tips.push(tip("info", "tip.switchingInconsistent"));
    } else if (wavesCompleted >= 3 && cv < 0.25) {
      tips.push(tip("positive", "tip.switchingConsistent"));
    }
  }

  return tips;
}

function reactionTips(result) {
  const tips = [];
  const { avgReactionTimeMs, falseStarts, timeouts, reactionTimes } = result.extra;
  const attempts = result.shotsTotal;

  if (falseStarts >= 3 && falseStarts / Math.max(1, attempts) > 0.15) {
    const key = falseStarts === 1 ? "tip.reactionFalseStartOne" : "tip.reactionFalseStartOther";
    tips.push(tip("warning", key, { count: falseStarts }));
  }

  const timeoutRate = timeouts / Math.max(1, result.hits + timeouts);
  if (timeouts > 0 && timeoutRate > 0.25) {
    tips.push(tip("warning", "tip.reactionTimeouts"));
  }

  if (reactionTimes && reactionTimes.length >= 5) {
    const cv = stdDev(reactionTimes) / (mean(reactionTimes) || 1);
    if (cv > 0.4) {
      tips.push(tip("info", "tip.reactionInconsistent"));
    } else if (avgReactionTimeMs < 250) {
      tips.push(tip("positive", "tip.reactionFast", { ms: avgReactionTimeMs.toFixed(0) }));
    }
  }

  return tips;
}

const MODE_TIP_FNS = {
  gridshot: gridshotTips,
  tracking: trackingTips,
  switching: switchingTips,
  reaction: reactionTips,
};

// `priorSessions` should be the player's sessions in this mode BEFORE this
// result was saved (so the trend comparison is against past performance,
// not itself).
export function generateCoachTips(result, priorSessions) {
  const tips = [...trendTips(result, priorSessions), ...(MODE_TIP_FNS[result.mode]?.(result) ?? [])];

  if (tips.length === 0) {
    tips.push(tip("info", "tip.solidSession"));
  }

  return tips.slice(0, MAX_TIPS);
}

// Aggregate, cross-session view for the History screen: one or two tips
// summarizing patterns across a mode's full history rather than a single
// session. Kept intentionally lighter than the per-session tips.
export function generateHistoryInsights(mode, sessions) {
  if (sessions.length < MIN_SAMPLES_FOR_TREND) return [];
  const tips = [];

  const half = Math.floor(sessions.length / 2);
  if (half >= 2) {
    const earlierAvg = mean(sessions.slice(0, half).map((s) => s.accuracy));
    const laterAvg = mean(sessions.slice(half).map((s) => s.accuracy));
    const delta = laterAvg - earlierAvg;
    if (delta >= 5) {
      tips.push(tip("positive", "tip.historyImproved", { delta: delta.toFixed(0) }));
    } else if (delta <= -5) {
      tips.push(tip("warning", "tip.historyDropped", { delta: Math.abs(delta).toFixed(0) }));
    }
  }

  if (mode === "gridshot") {
    const totals = sessions.reduce(
      (acc, s) => {
        const fb = s.extra?.flickBias;
        if (!fb) return acc;
        acc.overshoot += fb.overshoot;
        acc.undershoot += fb.undershoot;
        acc.accurate += fb.accurate;
        return acc;
      },
      { overshoot: 0, undershoot: 0, accurate: 0 }
    );
    const total = totals.overshoot + totals.undershoot + totals.accurate;
    if (total >= 15) {
      if (totals.overshoot > totals.undershoot * 1.4) {
        tips.push(tip("info", "tip.historyOvershootBias", { overshoot: totals.overshoot, undershoot: totals.undershoot }));
      } else if (totals.undershoot > totals.overshoot * 1.4) {
        tips.push(tip("info", "tip.historyUndershootBias", { undershoot: totals.undershoot, overshoot: totals.overshoot }));
      }
    }
  }

  return tips.slice(0, 2);
}
