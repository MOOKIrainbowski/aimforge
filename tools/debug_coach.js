const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  // 1. Long-duration session: fire deliberate hits/misses via the debug hook
  // and confirm flick-bias classification + hit-offset recording live.
  await page.goto("http://localhost:8123/app/index.html?debug=1&duration=120000", { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.click('.mode-card[data-mode="gridshot"]');
  await page.click("#home-start");
  await page.waitForTimeout(300);

  for (let i = 0; i < 21; i++) {
    // Every 3rd shot: dead-on hit. Otherwise: deliberate miss, alternating
    // left/right so both overshoot and undershoot get exercised.
    const mode = i % 3 === 0 ? "hit" : i % 2 === 0 ? "missRight" : "missLeft";
    await page.evaluate((m) => {
      const d = window.__aimforgeDebug;
      const t = d.drill.currentTarget;
      const pos = t.mesh.position;
      if (m === "hit") d.camera.lookAt(pos.x, pos.y, pos.z);
      else if (m === "missRight") d.camera.lookAt(pos.x + 0.6, pos.y, pos.z);
      else d.camera.lookAt(pos.x - 0.6, pos.y, pos.z);
      d.camera.updateMatrixWorld();
      d.drill.handleShot(performance.now());
    }, mode);
    await page.waitForTimeout(15);
  }

  const liveState = await page.evaluate(() => {
    const d = window.__aimforgeDebug.drill;
    return {
      flickBias: d.flickBias,
      hitOffsetsCount: d.hitOffsets.length,
      sampleOffset: d.hitOffsets[d.hitOffsets.length - 1],
      shotsTotal: d.shotsTotal,
      hits: d.hits,
    };
  });
  console.log("Gridshot live state:", JSON.stringify(liveState));

  await page.evaluate(() => document.exitPointerLock());
  await page.waitForTimeout(200);

  // 2. Short real session (lets isFinished() fire naturally) to confirm the
  // Coach Feedback panel renders in the summary screen without errors.
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.evaluate(() => new URLSearchParams(location.search));
  await page.goto("http://localhost:8123/app/index.html?debug=1&duration=1500", { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.click('.mode-card[data-mode="gridshot"]');
  await page.click("#home-start");
  await page.waitForTimeout(300);

  const shotInterval = setInterval(() => {}, 999999); // keep node alive marker (unused)
  clearInterval(shotInterval);
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => {
      const d = window.__aimforgeDebug;
      if (!d.drill) return;
      const t = d.drill.currentTarget;
      if (!t) return;
      const pos = t.mesh.position;
      d.camera.lookAt(pos.x, pos.y, pos.z);
      d.camera.updateMatrixWorld();
      d.drill.handleShot(performance.now());
    });
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(500);

  const summaryVisible = await page.evaluate(
    () => !document.getElementById("summary-screen").classList.contains("hidden")
  );
  const summaryHtml = await page.evaluate(() => document.getElementById("summary-stats").innerHTML);
  console.log(`Summary visible: ${summaryVisible}`);
  console.log(`Summary has coach panel: ${summaryHtml.includes("coach-panel")}`);
  await page.screenshot({ path: __dirname + "/aimforge_coach_summary.png" });

  // 3. Open History and confirm the heatmap + insights render for Gridshot
  // (and that Tracking correctly shows the "not tracked" fallback) with no
  // console/page errors from the new canvas drawing code.
  await page.click("#summary-history");
  await page.waitForTimeout(300);
  await page.screenshot({ path: __dirname + "/aimforge_history_heatmap.png" });

  await page.click('#history-mode-group button[data-mode="tracking"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: __dirname + "/aimforge_history_heatmap_tracking.png" });

  console.log(`Page errors: ${pageErrors.length}`);
  for (const e of pageErrors) console.log(e);

  await browser.close();
})();
