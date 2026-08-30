const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push(`console: ${msg.text()}`);
  });

  // Simulates what desktop/renderer/index.html will do: set the quality
  // flag before core/main.js is imported, so the postProcessing + envMap
  // dynamic-import paths actually run (they're skipped entirely on the web
  // build's default "web" preset).
  await page.addInitScript(() => {
    window.__AIMONSITE_QUALITY__ = "desktop";
  });

  await page.goto("http://localhost:8123/app/index.html?debug=1&duration=3000", { waitUntil: "load" });
  await page.waitForTimeout(700);
  await page.click('.mode-card[data-mode="gridshot"]');
  await page.click("#home-start");
  // "Enter the Range" now opens the weapon picker first; confirming it is
  // what actually enters the range.
  await page.click("#weapon-confirm");
  await page.waitForTimeout(600);

  const state = await page.evaluate(() => {
    const d = window.__aimonsiteDebug;
    return { hasTarget: !!d.drill?.currentTarget, cameraFov: d.camera.fov };
  });
  console.log("Desktop-quality live state:", JSON.stringify(state));
  console.log("Console/log message:", (await page.title()) ? "title ok" : "no title");
  await page.screenshot({ path: __dirname + "/aimonsite_desktop_quality.png" });

  console.log(`Page errors: ${pageErrors.length}`);
  for (const e of pageErrors) console.log(e);
  await browser.close();
})();
