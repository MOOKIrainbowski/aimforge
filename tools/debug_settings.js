const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("http://localhost:8123/app/index.html?debug=1", { waitUntil: "load" });
  await page.waitForTimeout(300);

  // 1. Cover boxes should be gone — enter the range and screenshot the
  // default view (previously showed two gray cover boxes flanking center).
  await page.click('.mode-card[data-mode="gridshot"]');
  await page.click("#home-start");
  await page.waitForTimeout(300);
  await page.screenshot({ path: __dirname + "/aimonsite_no_cover.png" });
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForTimeout(200);

  // Back to menu via Esc-triggered pause, then a manual return.
  await page.evaluate(() => document.exitPointerLock());
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(300);

  // 2. Open Settings, confirm it's visible.
  await page.click("#home-settings");
  await page.waitForTimeout(200);
  const settingsVisible = await page.evaluate(
    () => !document.getElementById("settings-screen").classList.contains("hidden")
  );
  console.log(`Settings screen visible: ${settingsVisible}`);

  // 3. Switch to Light theme and confirm the data-theme attribute + a
  // computed background color actually change.
  await page.click('#theme-group button[data-theme="light"]');
  await page.waitForTimeout(150);
  const themeAttr = await page.evaluate(() => document.documentElement.dataset.theme);
  const cardBg = await page.evaluate(() => {
    const el = document.querySelector(".settings-card");
    return getComputedStyle(el).backgroundColor;
  });
  console.log(`Theme attribute: ${themeAttr}, settings card background: ${cardBg}`);
  await page.screenshot({ path: __dirname + "/aimonsite_light_theme.png" });

  // 4. Change target color, wall color, floor color, brightness, FOV.
  await page.fill("#settings-target-color", "#22cc88");
  await page.fill("#settings-wall-color", "#3355aa");
  await page.fill("#settings-floor-color", "#aabbee");
  await page.evaluate(() => {
    const el = document.getElementById("settings-brightness");
    el.value = "150";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => {
    const el = document.getElementById("settings-fov");
    el.value = "80";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(150);

  const liveState = await page.evaluate(() => {
    const d = window.__aimonsiteDebug;
    return { fov: d.camera.fov };
  });
  console.log(`Live camera FOV after change: ${liveState.fov}`);

  const stored = await page.evaluate(() => localStorage.getItem("aimonsite:rangeConfig"));
  console.log(`Stored range config: ${stored}`);

  // 5. Go back to home, start a session, confirm the new wall/floor color
  // and target color actually render in the 3D scene.
  await page.click("#settings-back");
  await page.waitForTimeout(200);
  await page.click('.mode-card[data-mode="gridshot"]');
  await page.click("#home-start");
  await page.waitForTimeout(300);
  await page.screenshot({ path: __dirname + "/aimonsite_custom_range.png" });

  console.log(`Page errors: ${pageErrors.length}`);
  for (const e of pageErrors) console.log(e);

  await browser.close();
})();
