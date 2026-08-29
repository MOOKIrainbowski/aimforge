const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // --- Tracking: aim at the moving target via lookAt, confirm on-target accrues ---
  await page.goto("http://localhost:8123/app/index.html?duration=4000&debug=1", { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.click('.mode-card[data-mode="tracking"]');
  await page.click("#home-start");
  await page.waitForTimeout(200);

  // Repeatedly re-lookAt the (moving) target for ~1.5s so time-on-target
  // has a chance to accumulate across several frames.
  const trackingDeadline = Date.now() + 1500;
  while (Date.now() < trackingDeadline) {
    await page.evaluate(() => {
      const d = window.__aimforgeDebug;
      const target = [...d.targetManager.active.values()][0];
      if (target) d.camera.lookAt(target.mesh.position.x, target.mesh.position.y, target.mesh.position.z);
    });
    await page.waitForTimeout(50);
  }
  const trackingHud = await page.evaluate(() => document.getElementById("hud").textContent.trim());
  console.log(`[tracking] HUD after 1.5s of lookAt-tracking: ${trackingHud.replace(/\s+/g, " ")}`);

  // --- Switching: hit all targets in a wave, confirm wave-clear + respawn ---
  await page.goto("http://localhost:8123/app/index.html?duration=15000&debug=1", { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.click('.mode-card[data-mode="switching"]');
  await page.click("#home-start");
  await page.waitForTimeout(200);

  for (let i = 0; i < 6; i++) {
    const outcome = await page.evaluate(() => {
      const d = window.__aimforgeDebug;
      const target = [...d.targetManager.active.values()][0];
      if (!target) return "no-target";
      d.camera.lookAt(target.mesh.position.x, target.mesh.position.y, target.mesh.position.z);
      d.drill.handleShot(performance.now());
      return "shot";
    });
    await page.waitForTimeout(80);
    if (outcome === "no-target") break;
  }
  const switchingHud = await page.evaluate(() => document.getElementById("hud").textContent.trim());
  console.log(`[switching] HUD after 6 aimed shots: ${switchingHud.replace(/\s+/g, " ")}`);

  await browser.close();
})();
