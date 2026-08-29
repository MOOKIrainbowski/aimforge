const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

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
