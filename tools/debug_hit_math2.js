const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // Every one of these harnesses opens a browser with nothing stored, which
  // is exactly what the guided tour is looking for — it would open over the
  // home screen and swallow the first click. Declaring it seen is the honest
  // way to say "this is not a first-time visitor"; debug_tutorial.js is where
  // the tour itself is driven.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("aimonsite:tutorialSeen", "1");
    } catch {
      // Nothing to do; the tour will open and the run will say so.
    }
  });

  await page.goto("http://localhost:8123/app/index.html?duration=30000&debug=1", { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.click('.mode-card[data-mode="gridshot"]');
  await page.click("#home-start");
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const d = window.__aimonsiteDebug;
    const target = [...d.targetManager.active.values()][0];
    d.camera.lookAt(target.mesh.position.x, target.mesh.position.y, target.mesh.position.z);
    d.camera.updateMatrixWorld(true);
    const hit = d.targetManager.raycastHit(d.camera);
    return { hitId: hit ? hit.id : null, targetId: target.id };
  });
  console.log(`With explicit updateMatrixWorld(): hit=${result.hitId} target=${result.targetId}`);

  await browser.close();
})();
