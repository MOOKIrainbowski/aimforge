const CM_PER_INCH = 2.54;

// Degrees rotated per raw mouse "count" at that game's sensitivity = 1.0 —
// the standard unit mouse-sensitivity conversion tools use. These are
// commonly published community reference values, treated here as good
// working approximations rather than something verified against every
// patch of every game (see the disclaimer shown alongside the table).
const GAME_YAW_PER_COUNT = {
  valorant: 0.07,
  cs2: 0.022,
  apex: 0.022,
  overwatch2: 0.0066,
  fortnite: 0.0555,
};

export const GAME_LABELS = {
  valorant: "Valorant",
  cs2: "CS2",
  apex: "Apex Legends",
  overwatch2: "Overwatch 2",
  fortnite: "Fortnite",
};

// AimonSite's own controls.js sensitivity is radians-per-pixel; cm/360 (how
// far you physically move the mouse for a full turn) is the portable unit
// every other conversion is expressed in.
export function aimonsiteSensitivityToCm360(radiansPerPixel, dpi) {
  const countsPer360 = (2 * Math.PI) / radiansPerPixel;
  const inchesPer360 = countsPer360 / dpi;
  return inchesPer360 * CM_PER_INCH;
}

export function cm360ToAimonsiteSensitivity(cm360, dpi) {
  const inchesPer360 = cm360 / CM_PER_INCH;
  const countsPer360 = inchesPer360 * dpi;
  return (2 * Math.PI) / countsPer360;
}

export function cm360ToGameSensitivity(cm360, dpi, gameId) {
  const yawPerCount = GAME_YAW_PER_COUNT[gameId];
  if (!yawPerCount) return null;
  const countsPer360 = (cm360 / CM_PER_INCH) * dpi;
  return 360 / (yawPerCount * countsPer360);
}
