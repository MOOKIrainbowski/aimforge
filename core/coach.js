import { mean, stdDev } from "./utils.js";

// Rule-based "Smart Coach" — no external API calls. Every tip is derived
// deterministically from the just-finished SessionResult plus the player's
// own recent history in the same mode (already in StatsStore). Each tip is
// {level, text}; level drives styling in the UI ("positive" | "warning" |
// "info").
const MIN_SAMPLES_FOR_TREND = 3;
const TREND_WINDOW = 10;
const MAX_TIPS = 4;

function tip(level, text) {
  return { level, text };
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
    return [tip("positive", `Accuracy is up ${delta.toFixed(0)} points versus your recent average — whatever you just did, keep doing it.`)];
  }
  if (delta <= -8) {
    return [tip("warning", `Accuracy dropped ${Math.abs(delta).toFixed(0)} points versus your recent average — maybe warm up a bit longer, or check your sensitivity hasn't drifted.`)];
  }
  return [];
}

function gridshotTips(result) {
  const tips = [];
  const { timeToKillList, flickBias } = result.extra;

  if (result.shotsTotal >= 10) {
    if (result.accuracy < 60) {
      tips.push(tip("warning", `${result.accuracy.toFixed(0)}% accuracy is on the low side for Gridshot — try slowing down slightly and confirming each shot before firing.`));
    } else if (result.accuracy > 92) {
      tips.push(tip("positive", `${result.accuracy.toFixed(0)}% accuracy is excellent — try a smaller target radius or shorter duration to raise the difficulty.`));
    }
  }

  if (flickBias) {
    const flickSamples = flickBias.overshoot + flickBias.undershoot + flickBias.accurate;
    if (flickSamples >= 5) {
      if (flickBias.overshoot >= 3 && flickBias.overshoot > flickBias.undershoot * 1.5) {
        tips.push(tip("info", "Your first flick tends to overshoot past the target — try a slightly lower sensitivity or a shorter flick swing."));
      } else if (flickBias.undershoot >= 3 && flickBias.undershoot > flickBias.overshoot * 1.5) {
        tips.push(tip("info", "Your first flick tends to fall short of the target — try a slightly higher sensitivity or committing more to the initial swing."));
      }
    }
  }

  if (timeToKillList && timeToKillList.length >= 5) {
    const cv = stdDev(timeToKillList) / (mean(timeToKillList) || 1);
    if (cv > 0.6) {
      tips.push(tip("info", "Your time-to-kill varies a lot between targets — focus on a consistent rhythm rather than rushing some shots."));
    }
  }

  return tips;
}

function trackingTips(result) {
  const tips = [];
  const { onTargetTimeMs, bestStreakMs } = result.extra;

  if (result.accuracy < 50) {
    tips.push(tip("warning", `Only ${result.accuracy.toFixed(0)}% time-on-target — try reducing target speed or widening the target until tracking feels smooth.`));
  }

  if (onTargetTimeMs > 500) {
    const consistency = bestStreakMs / onTargetTimeMs;
    if (consistency < 0.35) {
      tips.push(tip("info", "Your on-target time is made of many short bursts rather than one smooth hold — work on small continuous corrections instead of re-acquiring the target."));
    } else if (consistency > 0.85 && result.accuracy > 60) {
      tips.push(tip("positive", "Great sustained tracking — most of your on-target time comes from one long, uninterrupted hold."));
    }
  }

  return tips;
}

function switchingTips(result) {
  const tips = [];
  const { switchTimes, wavesCompleted } = result.extra;

  if (result.shotsTotal >= 10 && result.accuracy < 70) {
    tips.push(tip("warning", `${result.accuracy.toFixed(0)}% accuracy — prioritize picking the right next target over speed between shots.`));
  }

  if (switchTimes && switchTimes.length >= 5) {
    const cv = stdDev(switchTimes) / (mean(switchTimes) || 1);
    if (cv > 0.55) {
      tips.push(tip("info", "Switch times between targets are inconsistent — some transitions are much slower than others. Try scanning the next target before you finish the current one."));
    } else if (wavesCompleted >= 3 && cv < 0.25) {
      tips.push(tip("positive", "Very consistent switch times across targets — your target-to-target rhythm is solid."));
    }
  }

  return tips;
}

function reactionTips(result) {
  const tips = [];
  const { avgReactionTimeMs, falseStarts, timeouts, reactionTimes } = result.extra;
  const attempts = result.shotsTotal;

  if (falseStarts >= 3 && falseStarts / Math.max(1, attempts) > 0.15) {
    tips.push(tip("warning", `${falseStarts} false start${falseStarts === 1 ? "" : "s"} — you're clicking before the target appears. Try waiting for the flash instead of anticipating it.`));
  }

  const timeoutRate = timeouts / Math.max(1, result.hits + timeouts);
  if (timeouts > 0 && timeoutRate > 0.25) {
    tips.push(tip("warning", "You're missing the exposure window on a chunk of targets — that's about spotting the flash quickly, not just clicking faster."));
  }

  if (reactionTimes && reactionTimes.length >= 5) {
    const cv = stdDev(reactionTimes) / (mean(reactionTimes) || 1);
    if (cv > 0.4) {
      tips.push(tip("info", "Reaction times are quite spread out rep to rep — try staying relaxed and ready rather than tensing up while waiting."));
    } else if (avgReactionTimeMs < 250) {
      tips.push(tip("positive", `Averaging ${avgReactionTimeMs.toFixed(0)}ms is very fast — strong reaction speed.`));
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
    tips.push(tip("info", "Solid session — nothing stands out as an issue. Keep at it."));
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
      tips.push(tip("positive", `Accuracy has improved ${delta.toFixed(0)} points on average since your earliest sessions in this mode.`));
    } else if (delta <= -5) {
      tips.push(tip("warning", `Accuracy has dropped ${Math.abs(delta).toFixed(0)} points on average versus your earliest sessions — worth a check on sensitivity or warmup routine.`));
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
        tips.push(tip("info", `Across your history, you overshoot flicks more often than you undershoot (${totals.overshoot} vs ${totals.undershoot}) — a small sensitivity reduction may help.`));
      } else if (totals.undershoot > totals.overshoot * 1.4) {
        tips.push(tip("info", `Across your history, you undershoot flicks more often than you overshoot (${totals.undershoot} vs ${totals.overshoot}) — try a slightly higher sensitivity or fuller flicks.`));
      }
    }
  }

  return tips.slice(0, 2);
}
