import { getSessionsByMode } from "../stats.js";
import { generateHistoryInsights } from "../coach.js";

const historyScreen = document.getElementById("history-screen");
const canvas = document.getElementById("history-chart");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("history-tooltip");
const tableBody = document.getElementById("history-table-body");
const modeButtons = Array.from(document.querySelectorAll("#history-mode-group button"));
const metricButtons = Array.from(document.querySelectorAll("#history-metric-group button"));
const insightsEl = document.getElementById("history-insights");
const heatmapCanvas = document.getElementById("history-heatmap");
const heatmapCtx = heatmapCanvas.getContext("2d");

const COLOR_LINE = "#4f8ef7";
const COLOR_GRID = "#2a2d36";
const COLOR_AXIS = "#454a56";
const COLOR_TEXT_MUTED = "#9aa4b8";
const COLOR_SURFACE_RING = "#1a1d24";

// Only modes where a shot is fired at a single, unambiguous target (not a
// simultaneous wave) produce a meaningful hit-position heatmap — a Switching
// miss can't be attributed to one target out of several on screen.
const HEATMAP_MODES = new Set(["gridshot", "reaction"]);
// How many of the most recent sessions in a mode to pool hit-offsets from,
// and a hard cap on total plotted points so a long history doesn't just
// paint one solid blob.
const HEATMAP_SESSION_WINDOW = 20;
const HEATMAP_MAX_POINTS = 600;

const MODE_LABELS = {
  gridshot: "Gridshot",
  tracking: "Tracking",
  switching: "Target Switching",
  reaction: "Reaction Time",
};

let selectedMode = "gridshot";
let selectedMetric = "score";
let currentPoints = []; // {x, y, session} in canvas-pixel space, for hover hit-testing

function metricValue(session, metric) {
  return metric === "accuracy" ? session.accuracy : session.score;
}

function niceCeiling(value) {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function drawChart(sessions) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  currentPoints = [];

  const padding = { top: 16, right: 16, bottom: 24, left: 40 };
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;

  if (sessions.length === 0) {
    ctx.fillStyle = COLOR_TEXT_MUTED;
    ctx.font = "14px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No sessions yet — play a round to start your trend.", w / 2, h / 2);
    return;
  }

  const values = sessions.map((s) => metricValue(s, selectedMetric));
  const maxValue = selectedMetric === "accuracy" ? 100 : niceCeiling(Math.max(...values, 1));
  const minValue = 0;
  const span = maxValue - minValue || 1;

  // Hairline gridlines, one step off the card surface — recessive by design.
  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 1;
  ctx.fillStyle = COLOR_TEXT_MUTED;
  ctx.font = "11px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "right";
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const v = minValue + (span * i) / steps;
    const y = padding.top + plotH - (plotH * i) / steps;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + plotW, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(v)), padding.left - 8, y + 4);
  }

  ctx.strokeStyle = COLOR_AXIS;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top + plotH);
  ctx.lineTo(padding.left + plotW, padding.top + plotH);
  ctx.stroke();

  const n = sessions.length;
  const stepX = n > 1 ? plotW / (n - 1) : 0;

  ctx.strokeStyle = COLOR_LINE;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  sessions.forEach((session, i) => {
    const value = metricValue(session, selectedMetric);
    const x = padding.left + (n > 1 ? stepX * i : plotW / 2);
    const y = padding.top + plotH - (plotH * (value - minValue)) / span;
    currentPoints.push({ x, y, session });
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // End-marker: filled dot with a surface-color ring so it stays legible
  // where the line ends.
  const last = currentPoints[currentPoints.length - 1];
  ctx.fillStyle = COLOR_SURFACE_RING;
  ctx.beginPath();
  ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLOR_LINE;
  ctx.beginPath();
  ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawTable(sessions) {
  const recent = sessions.slice(-15).reverse();
  tableBody.innerHTML = "";

  if (recent.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.className = "history-empty-row";
    td.textContent = "No sessions recorded yet.";
    tr.appendChild(td);
    tableBody.appendChild(tr);
    return;
  }

  for (const s of recent) {
    const tr = document.createElement("tr");
    const date = new Date(s.timestamp);
    const cells = [
      `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`,
      MODE_LABELS[s.mode] ?? s.mode,
      String(s.score),
      `${s.accuracy.toFixed(1)}%`,
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    }
    tableBody.appendChild(tr);
  }
}

function renderInsights(sessions) {
  const insights = generateHistoryInsights(selectedMode, sessions);
  insightsEl.innerHTML = insights.map((t) => `<p class="coach-tip coach-tip-${t.level}">${t.text}</p>`).join("");
}

function drawHeatmap(sessions) {
  const w = heatmapCanvas.width;
  const h = heatmapCanvas.height;
  heatmapCtx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  // Half-width of the plotted window, in target-radii — offsets beyond this
  // are clipped rather than stretching the whole plot to fit rare outliers.
  const halfRangeUnits = 3;
  const pxPerUnit = Math.min(w, h) / 2 / halfRangeUnits;

  if (!HEATMAP_MODES.has(selectedMode)) {
    heatmapCtx.fillStyle = COLOR_TEXT_MUTED;
    heatmapCtx.font = "13px system-ui, -apple-system, sans-serif";
    heatmapCtx.textAlign = "center";
    heatmapCtx.fillText("Not tracked for this mode.", w / 2, h / 2);
    return;
  }

  const points = sessions
    .slice(-HEATMAP_SESSION_WINDOW)
    .flatMap((s) => s.extra?.hitOffsets ?? []);
  const sampled = points.length > HEATMAP_MAX_POINTS ? points.slice(points.length - HEATMAP_MAX_POINTS) : points;

  if (sampled.length === 0) {
    heatmapCtx.fillStyle = COLOR_TEXT_MUTED;
    heatmapCtx.font = "13px system-ui, -apple-system, sans-serif";
    heatmapCtx.textAlign = "center";
    heatmapCtx.fillText("No shots recorded yet.", w / 2, h / 2);
    return;
  }

  // Hairline reference rings at 1x (target edge) and 2x target radius.
  heatmapCtx.strokeStyle = COLOR_GRID;
  heatmapCtx.lineWidth = 1;
  for (const ring of [1, 2]) {
    heatmapCtx.beginPath();
    heatmapCtx.arc(cx, cy, ring * pxPerUnit, 0, Math.PI * 2);
    heatmapCtx.stroke();
  }
  heatmapCtx.strokeStyle = COLOR_AXIS;
  heatmapCtx.beginPath();
  heatmapCtx.moveTo(cx - w / 2, cy);
  heatmapCtx.lineTo(cx + w / 2, cy);
  heatmapCtx.moveTo(cx, cy - h / 2);
  heatmapCtx.lineTo(cx, cy + h / 2);
  heatmapCtx.stroke();

  // Semi-transparent dots so overlapping shots read as denser — a cheap
  // stand-in for a true density heatmap without extra dependencies.
  heatmapCtx.fillStyle = "rgba(79, 142, 247, 0.28)";
  for (const p of sampled) {
    const x = cx + p.x * pxPerUnit;
    const y = cy - p.y * pxPerUnit;
    heatmapCtx.beginPath();
    heatmapCtx.arc(x, y, 3, 0, Math.PI * 2);
    heatmapCtx.fill();
  }

  // Target outline drawn last, on top, so it stays legible under a dense cluster.
  heatmapCtx.strokeStyle = COLOR_LINE;
  heatmapCtx.lineWidth = 1.5;
  heatmapCtx.beginPath();
  heatmapCtx.arc(cx, cy, pxPerUnit, 0, Math.PI * 2);
  heatmapCtx.stroke();
}

function render() {
  const sessions = getSessionsByMode(selectedMode);
  drawChart(sessions);
  drawTable(sessions);
  drawHeatmap(sessions);
  renderInsights(sessions);
}

function nearestPoint(mouseX) {
  if (currentPoints.length === 0) return null;
  let nearest = currentPoints[0];
  let bestDist = Math.abs(mouseX - nearest.x);
  for (const p of currentPoints) {
    const d = Math.abs(mouseX - p.x);
    if (d < bestDist) {
      bestDist = d;
      nearest = p;
    }
  }
  return nearest;
}

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const mouseX = (e.clientX - rect.left) * scaleX;
  const point = nearestPoint(mouseX);
  if (!point) {
    tooltip.classList.add("hidden");
    return;
  }

  const value = metricValue(point.session, selectedMetric);
  const label = selectedMetric === "accuracy" ? `${value.toFixed(1)}%` : String(value);
  const date = new Date(point.session.timestamp);

  tooltip.innerHTML = "";
  const strong = document.createElement("strong");
  strong.textContent = label;
  const span = document.createElement("span");
  span.textContent = ` ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  tooltip.appendChild(strong);
  tooltip.appendChild(span);

  const displayScaleX = rect.width / canvas.width;
  const displayScaleY = rect.height / canvas.height;
  tooltip.style.left = `${point.x * displayScaleX}px`;
  tooltip.style.top = `${point.y * displayScaleY}px`;
  tooltip.classList.remove("hidden");
});

canvas.addEventListener("mouseleave", () => {
  tooltip.classList.add("hidden");
});

function setPressed(button, pressed) {
  button.classList.toggle("selected", pressed);
  button.setAttribute("aria-pressed", String(pressed));
}

export function initHistory() {
  for (const btn of modeButtons) {
    btn.addEventListener("click", () => {
      selectedMode = btn.dataset.mode;
      for (const b of modeButtons) setPressed(b, b === btn);
      render();
    });
  }
  for (const btn of metricButtons) {
    btn.addEventListener("click", () => {
      selectedMetric = btn.dataset.metric;
      for (const b of metricButtons) setPressed(b, b === btn);
      render();
    });
  }
}

export function showHistory() {
  historyScreen.classList.remove("hidden");
  render();
}

export function hideHistory() {
  historyScreen.classList.add("hidden");
  tooltip.classList.add("hidden");
}
