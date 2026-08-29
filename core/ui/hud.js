const hudEl = document.getElementById("hud");
const scoreEl = document.getElementById("hud-score");
const accuracyEl = document.getElementById("hud-accuracy");
const timeEl = document.getElementById("hud-time");
const streakEl = document.getElementById("hud-streak");

export function showHud() {
  hudEl.classList.remove("hidden");
}

export function hideHud() {
  hudEl.classList.add("hidden");
}

export function updateHud(stats) {
  scoreEl.textContent = `Score: ${stats.score}`;
  accuracyEl.textContent = `${stats.accuracy.toFixed(1)}%`;
  timeEl.textContent = `${(stats.timeRemainingMs / 1000).toFixed(1)}s`;
  streakEl.textContent = `Streak: ${stats.streak}`;
}
