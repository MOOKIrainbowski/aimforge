const PRESETS = {
  web: {
    pixelRatioCap: 1.5,
    shadows: false,
    postProcessing: false,
    targetSegments: 16,
    envMap: false,
  },
  desktop: {
    pixelRatioCap: 3,
    shadows: true,
    postProcessing: true,
    targetSegments: 64,
    envMap: true,
  },
};

export function getQuality() {
  const name = (typeof window !== "undefined" && window.__AIMFORGE_QUALITY__) || "web";
  const preset = PRESETS[name] || PRESETS.web;
  return { name, ...preset };
}
