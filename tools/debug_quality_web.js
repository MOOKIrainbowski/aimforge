const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push(`console: ${msg.text()}`);
  });

  await page.goto("http://localhost:8123/app/index.html?debug=1&duration=3000", { waitUntil: "load" });
  await page.waitForTimeout(400);
  await page.click('.mode-card[data-mode="gridshot"]');
  await page.click("#home-start");
  await page.waitForTimeout(500);

  const state = await page.evaluate(() => {
    const d = window.__aimforgeDebug;
    return { hasTarget: !!d.drill?.currentTarget, cameraFov: d.camera.fov };
  });
  console.log("Web-quality live state:", JSON.stringify(state));
  await page.screenshot({ path: __dirname + "/aimforge_web_quality.png" });

  console.log(`Page errors: ${pageErrors.length}`);
  for (const e of pageErrors) console.log(e);
  await browser.close();
})();
