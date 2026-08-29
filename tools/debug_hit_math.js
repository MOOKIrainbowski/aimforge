const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto("http://localhost:8123/app/index.html?duration=30000&debug=1", { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.click('.mode-card[data-mode="gridshot"]');
  await page.click("#home-start");
  await page.waitForTimeout(300);

  const state0 = await page.evaluate(() => {
    const d = window.__aimonsiteDebug;
    const target = [...d.targetManager.active.values()][0];
    return {
      camPos: d.camera.position.toArray(),
      yaw: d.controls.yaw,
      pitch: d.controls.pitch,
      targetPos: target ? target.mesh.position.toArray() : null,
    };
  });
  console.log("Before aiming:", JSON.stringify(state0));

  // Point the camera directly at the target via THREE's own lookAt (a
  // ground-truth check, independent of our mouse-look math), then ask
  // raycastHit whether it now sees the target dead-center.
  const hitResult = await page.evaluate((targetPos) => {
    const d = window.__aimonsiteDebug;
    d.camera.lookAt(targetPos[0], targetPos[1], targetPos[2]);
    const hit = d.targetManager.raycastHit(d.camera);
    return hit ? hit.id : null;
  }, state0.targetPos);
  console.log(`Raycast hit after camera.lookAt(target): ${hitResult}`);

  await browser.close();
})();
