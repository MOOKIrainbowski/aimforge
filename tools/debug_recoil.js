const { chromium } = require("playwright");

// Exercises the recoil-control mechanic end to end: that a punch reaches the
// camera, that the pattern walks through its authored steps rather than
// repeating one, and that compensation is scored the way the drill claims —
// near 0 when the player does nothing, near 1 when they cancel the punch
// exactly. Run `npm run serve` first.
//
// This drives the real session (pointer lock, the real drill) rather than a
// hand-built one, because the thing under test is the loop between the
// pattern, the look controller and the tracker.
//
// The numbers themselves are not asserted here — tools/tune_weapons.js owns
// what each weapon's pattern should add up to. This owns whether the
// mechanic works at all.

const BASE = "http://localhost:8123/app/index.html?duration=30000&debug=1";

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures++;
  console.log(`  [${condition ? "PASS" : "FAIL"}] ${label}${detail === undefined ? "" : ` — ${detail}`}`);
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (err) => {
    failures++;
    console.log(`  [FAIL] page error — ${err.message}`);
  });

  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__aimonsiteDebug), null, { timeout: 15000 });

  // Recoil Control is a two-state switch on the home screen; the carried
  // weapon (rifle by default) is what supplies the pattern.
  await page.click("#recoil-switch");
  await page.click('.mode-card[data-mode="gridshot"]');
  await page.click("#home-start");
  await page.click('.weapon-option[data-weapon="rifle"]');
  await page.click("#weapon-confirm");
  await page.waitForTimeout(200);
  await page.mouse.click(640, 400);
  await page.waitForTimeout(300);

  console.log("\n1. The mechanic is live");
  const live = await page.evaluate(() => ({
    locked: document.pointerLockElement !== null,
    hasDrill: Boolean(window.__aimonsiteDebug.drill),
    enabled: window.__aimonsiteDebug.drill?.recoil?.enabled ?? false,
  }));
  check("the session starts with recoil enabled", live.locked && live.hasDrill && live.enabled, JSON.stringify(live));

  console.log("\n2. A shot punches the camera");
  const punch = await page.evaluate(() => {
    const d = window.__aimonsiteDebug;
    const before = { yaw: d.controls.yaw, pitch: d.controls.pitch };
    d.drill.handleShot(performance.now());
    return {
      dPitch: d.controls.pitch - before.pitch,
      dYaw: d.controls.yaw - before.yaw,
      shotIndex: d.drill.recoil.shotIndex,
      step: d.drill.recoil.preset.pattern[0],
    };
  });
  check("the view is kicked upward", punch.dPitch > 0, `pitch +${punch.dPitch.toFixed(5)}`);
  check("by exactly the pattern's first step", Math.abs(punch.dPitch - punch.step.dy) < 1e-9, `${punch.dPitch.toFixed(5)} vs ${punch.step.dy}`);
  check("and the pattern advances", punch.shotIndex === 1);

  console.log("\n3. Compensation scoring");
  const noCompensation = await page.evaluate(() => {
    const d = window.__aimonsiteDebug;
    d.drill.handleShot(performance.now());
    return d.drill.recoil.compensationRatios.slice();
  });
  check(
    "doing nothing about a punch scores near zero",
    noCompensation.length === 1 && noCompensation[0] < 0.05,
    JSON.stringify(noCompensation)
  );

  const compensated = await page.evaluate(() => {
    const d = window.__aimonsiteDebug;
    // Cancel the pending punch exactly, the way a player pulling down would.
    const pending = d.drill.recoil.pending;
    d.controls.yaw += pending.idealYaw;
    d.controls.pitch += pending.idealPitch;
    d.drill.handleShot(performance.now());
    return d.drill.recoil.compensationRatios.slice();
  });
  check(
    "cancelling it exactly scores near one",
    Math.abs(compensated[compensated.length - 1] - 1) < 0.02,
    JSON.stringify(compensated.map((r) => Number(r.toFixed(3))))
  );

  console.log("\n4. The pattern is walked, not repeated");
  const walk = await page.evaluate(() => {
    const d = window.__aimonsiteDebug;
    const pattern = d.drill.recoil.preset.pattern;
    const applied = [];
    // Enough shots to leave the opening climb and reach the sideways walk.
    for (let i = 0; i < 14; i++) {
      const before = d.controls.pitch;
      d.drill.handleShot(performance.now());
      applied.push(Number((d.controls.pitch - before).toFixed(6)));
    }
    return {
      applied,
      patternLength: pattern.length,
      magazine: d.weaponRuntime?.weapon.magazine ?? null,
      distinct: new Set(applied).size,
    };
  });
  check("consecutive shots kick by different amounts", walk.distinct > 8, `${walk.distinct} distinct of ${walk.applied.length}`);
  check("the vertical kick decays as the pattern goes on", walk.applied[0] > walk.applied[walk.applied.length - 1], `${walk.applied[0]} -> ${walk.applied[walk.applied.length - 1]}`);
  check(
    "the pattern is long enough for the whole magazine",
    walk.magazine !== null && walk.patternLength >= walk.magazine,
    `${walk.patternLength} steps for ${walk.magazine} rounds`
  );

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
