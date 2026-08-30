const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto("http://localhost:8123/app/index.html?duration=30000&debug=1", { waitUntil: "load" });
  await page.waitForTimeout(300);

  // Turn Recoil Control on (rifle is the default weapon selection).
  await page.click('#recoil-toggle-group button[data-recoil="on"]');
  await page.click('.mode-card[data-mode="gridshot"]');
  await page.click("#home-start");
  // "Enter the Range" now opens the weapon picker first; confirming it is
  // what actually enters the range.
  await page.click("#weapon-confirm");
  await page.waitForTimeout(300);

  const before = await page.evaluate(() => {
    const d = window.__aimonsiteDebug;
    return { yaw: d.controls.yaw, pitch: d.controls.pitch };
  });

  // Fire once via the drill directly (bypassing raycast concerns — we only
  // care whether the punch itself is applied to the camera).
  await page.evaluate(() => window.__aimonsiteDebug.drill.handleShot(performance.now()));

  const afterOneShot = await page.evaluate(() => {
    const d = window.__aimonsiteDebug;
    return {
      yaw: d.controls.yaw,
      pitch: d.controls.pitch,
      shotIndex: d.drill.recoil.shotIndex,
      compensationRatios: d.drill.recoil.compensationRatios.length,
    };
  });

  console.log(`Before shot: yaw=${before.yaw.toFixed(5)} pitch=${before.pitch.toFixed(5)}`);
  console.log(
    `After 1 shot: yaw=${afterOneShot.yaw.toFixed(5)} pitch=${afterOneShot.pitch.toFixed(5)} ` +
      `shotIndex=${afterOneShot.shotIndex} compensationRatios=${afterOneShot.compensationRatios}`
  );
  console.log(`Expected first punch: dx=0.000 dy=0.010 -> pitch should increase by ~0.01`);

  // Fire a second shot without moving the mouse — the player did nothing to
  // compensate, so this shot's compensation ratio should score near 0.
  await page.evaluate(() => window.__aimonsiteDebug.drill.handleShot(performance.now()));
  const afterTwoShots = await page.evaluate(() => {
    const d = window.__aimonsiteDebug;
    return {
      yaw: d.controls.yaw,
      pitch: d.controls.pitch,
      compensationRatios: d.drill.recoil.compensationRatios.slice(),
    };
  });
  console.log(`After 2 shots (no compensation): yaw=${afterTwoShots.yaw.toFixed(5)} pitch=${afterTwoShots.pitch.toFixed(5)}`);
  console.log(`Compensation ratios so far: ${JSON.stringify(afterTwoShots.compensationRatios)}`);

  // Now manually compensate for the second punch before firing a third
  // shot, and confirm the ratio comes out close to 1 (good compensation).
  await page.evaluate(() => {
    const d = window.__aimonsiteDebug;
    const pending = d.drill.recoil.pending;
    d.controls.yaw += pending.idealYaw;
    d.controls.pitch += pending.idealPitch;
  });
  await page.evaluate(() => window.__aimonsiteDebug.drill.handleShot(performance.now()));
  const afterCompensated = await page.evaluate(() => window.__aimonsiteDebug.drill.recoil.compensationRatios.slice());
  console.log(`Compensation ratios after manually compensating: ${JSON.stringify(afterCompensated)}`);

  await browser.close();
})();
