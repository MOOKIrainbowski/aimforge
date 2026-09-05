const { chromium } = require("playwright");

// Measures what each weapon's recoil and accuracy numbers actually *do*,
// rather than what they look like they should do. Run `npm run serve` first.
//
// This exists because the accuracy model has one non-obvious trap, already
// documented in core/weapons.js: bloom recovers continuously, including
// during the gap between two shots of sustained fire, so a weapon only
// accumulates any bloom at all when
//
//     bloomDeg > recoverPerSec * (60 / rpm)
//
// Miss that and the numbers read as perfectly sensible while doing nothing.
// The same class of problem hides in the recoil patterns: a pattern shorter
// than the magazine repeats its last step forever, so a weapon can be
// authored with eight interesting shots and then fire twenty-two identical
// ones straight up without anyone noticing in the table.
//
//   node tools/tune_weapons.js           print the measurements
//   node tools/tune_weapons.js --check   fail if any invariant is broken
//
// The invariants are asserted at the bottom and are what stops these numbers
// silently rotting again.

const BASE = "http://localhost:8123/app/index.html?debug=1";
const HIP_FOV = 96; // core/rangeConfig.js's default
const RANGE_M = 8; // roughly how far the spawn wall is from the player

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures++;
  console.log(`  [${condition ? "PASS" : "FAIL"}] ${label}${detail === undefined ? "" : ` — ${detail}`}`);
}

function fmt(n, digits = 2) {
  return Number(n).toFixed(digits);
}

async function measure(page) {
  return page.evaluate(
    async ([hipFov]) => {
      const base = new URL("../core/", location.href).href;
      const { WEAPONS, WEAPON_ORDER, shotIntervalMs, hasManualAction } = await import(`${base}weapons.js`);
      const { WeaponRuntime, buildShotRays } = await import(`${base}weaponRuntime.js`);
      const THREE = await import("three");

      // A throwaway camera at a given FOV, so measured angles come out of the
      // same projection the real shots use.
      const cameraAt = (fov) => {
        const camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 100);
        camera.updateProjectionMatrix();
        return camera;
      };

      // NDC offset -> angle off the crosshair, in degrees. The inverse of the
      // conversion buildShotRays does going the other way.
      const ndcToDeg = (ray, camera) => {
        const halfFovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        const x = ray.x * halfFovTan * camera.aspect;
        const y = ray.y * halfFovTan;
        return THREE.MathUtils.radToDeg(Math.atan(Math.hypot(x, y)));
      };

      // Mean deviation of a first shot, averaged over enough draws that the
      // random cone doesn't decide the answer.
      const meanFirstShotDeg = (weapon, camera, aimT, samples = 400) => {
        let total = 0;
        for (let i = 0; i < samples; i++) {
          total += ndcToDeg(buildShotRays(weapon, camera, { aimT, bloomDeg: 0 })[0], camera);
        }
        return total / samples;
      };

      return WEAPON_ORDER.map((id) => {
        const weapon = WEAPONS[id];
        const accuracy = weapon.accuracy;
        const interval = shotIntervalMs(weapon) + (hasManualAction(weapon) ? weapon.cycleMs : 0);

        // Bloom, walked forward one shot at a time through the real runtime
        // rather than modelled here, so this measures the shipped behaviour.
        const runtime = new WeaponRuntime(weapon, { magazineLimit: false });
        let now = 0;
        const bloomAfter = [];
        for (let shot = 0; shot < weapon.magazine; shot++) {
          runtime.consume(now);
          now += interval;
          bloomAfter.push(runtime.getBloomDeg(now));
        }
        const peakBloom = Math.max(...bloomAfter);
        // The cap is what the runtime *stores*; what a shot actually carries
        // is that minus the recovery that happens before the next trigger
        // pull, so this is the ceiling a player can ever feel.
        const feltCeiling = accuracy.maxBloomDeg - (accuracy.recoverPerSec * interval) / 1000;
        const shotsToCap = bloomAfter.findIndex((deg) => deg >= feltCeiling * 0.95) + 1;

        // How long the peak takes to bleed away entirely.
        const recoverMs = (peakBloom / accuracy.recoverPerSec) * 1000;

        // The recoil pattern as actually applied: past its end the last step
        // repeats, so a full magazine is measured, not just what was authored.
        const pattern = weapon.recoilPattern ?? [];
        let rise = 0;
        let drift = 0;
        let maxDrift = 0;
        for (let shot = 0; shot < weapon.magazine; shot++) {
          const step = pattern[Math.min(shot, pattern.length - 1)];
          if (!step) break;
          rise += step.dy;
          drift += step.dx;
          maxDrift = Math.max(maxDrift, Math.abs(drift));
        }

        const hipCamera = cameraAt(hipFov);
        const adsCamera = cameraAt(weapon.adsFov);

        return {
          id,
          fireMode: weapon.fireMode,
          rpm: weapon.rpm,
          magazine: weapon.magazine,
          patternLength: pattern.length,
          repeatedShots: Math.max(0, weapon.magazine - pattern.length),
          riseDeg: THREE.MathUtils.radToDeg(rise),
          driftDeg: THREE.MathUtils.radToDeg(drift),
          maxDriftDeg: THREE.MathUtils.radToDeg(maxDrift),
          intervalMs: interval,
          bloomPerShot: accuracy.bloomDeg,
          bloomRecoveredPerInterval: (accuracy.recoverPerSec * interval) / 1000,
          netBloomPerShot: accuracy.bloomDeg - (accuracy.recoverPerSec * interval) / 1000,
          peakBloomDeg: peakBloom,
          capDeg: accuracy.maxBloomDeg,
          feltCeilingDeg: Math.max(0, feltCeiling),
          shotsToCap: shotsToCap > 0 ? shotsToCap : null,
          recoverMs,
          hipDeg: meanFirstShotDeg(weapon, hipCamera, 0),
          adsDeg: meanFirstShotDeg(weapon, adsCamera, 1),
          spreadDeg: weapon.spreadDeg,
          pellets: weapon.pellets,
        };
      });
    },
    [HIP_FOV]
  );
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage();
  page.on("pageerror", (err) => {
    failures++;
    console.log(`page error — ${err.message}`);
  });
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__aimonsiteDebug), null, { timeout: 15000 });

  const rows = await measure(page);
  const cmAt = (deg) => Math.tan((deg * Math.PI) / 180) * RANGE_M * 100;

  console.log("\nFIRING ERROR — mean deviation of a first shot, and what it means at 8m\n");
  console.log("  weapon     hip°    hip@8m   ads°     ads@8m   cone°  pellets");
  for (const r of rows) {
    console.log(
      `  ${r.id.padEnd(10)} ${fmt(r.hipDeg).padStart(5)}  ${fmt(cmAt(r.hipDeg), 1).padStart(6)}cm  ` +
        `${fmt(r.adsDeg).padStart(5)}   ${fmt(cmAt(r.adsDeg), 1).padStart(6)}cm  ` +
        `${fmt(r.spreadDeg, 1).padStart(4)}   ${String(r.pellets).padStart(2)}`
    );
  }

  console.log("\nBLOOM — what sustained fire actually adds, per weapon\n");
  console.log("  weapon     per shot  recovered  net      peak   ceiling  shots→ceil  recover");
  for (const r of rows) {
    console.log(
      `  ${r.id.padEnd(10)} ${fmt(r.bloomPerShot).padStart(7)}  ${fmt(r.bloomRecoveredPerInterval).padStart(8)}  ` +
        `${fmt(r.netBloomPerShot).padStart(6)}  ${fmt(r.peakBloomDeg).padStart(5)}  ${fmt(r.feltCeilingDeg).padStart(7)}  ` +
        `${String(r.shotsToCap || "never").padStart(9)}   ${fmt(r.recoverMs, 0).padStart(4)}ms`
    );
  }

  console.log("\nRECOIL PATTERN — over one full magazine, not just what was authored\n");
  console.log("  weapon     mag  authored  repeated  rise°   drift°  max|drift|°");
  for (const r of rows) {
    console.log(
      `  ${r.id.padEnd(10)} ${String(r.magazine).padStart(3)}  ${String(r.patternLength).padStart(8)}  ` +
        `${String(r.repeatedShots).padStart(8)}  ${fmt(r.riseDeg).padStart(6)}  ${fmt(r.driftDeg).padStart(6)}  ` +
        `${fmt(r.maxDriftDeg).padStart(10)}`
    );
  }

  console.log("\nINVARIANTS\n");
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const autos = rows.filter((r) => r.fireMode === "auto");
  const manual = rows.filter((r) => r.fireMode === "bolt" || r.fireMode === "pump");

  for (const r of autos) {
    check(
      `${r.id}: held fire actually blooms`,
      r.netBloomPerShot > 0.05,
      `net ${fmt(r.netBloomPerShot)}°/shot`
    );
    check(
      `${r.id}: reaches its ceiling inside a magazine`,
      r.shotsToCap !== null && r.shotsToCap > 0 && r.shotsToCap <= r.magazine,
      `${r.shotsToCap || "never"} of ${r.magazine}, ceiling ${fmt(r.feltCeilingDeg)}°`
    );
    check(
      `${r.id}: the pattern covers the whole magazine`,
      r.repeatedShots === 0,
      `${r.repeatedShots} shots repeat the last step`
    );
    check(
      `${r.id}: the pattern moves horizontally, not just up`,
      r.maxDriftDeg >= r.riseDeg * 0.2,
      `max drift ${fmt(r.maxDriftDeg)}° vs rise ${fmt(r.riseDeg)}°`
    );
  }

  for (const r of manual) {
    check(
      `${r.id}: its action clears bloom between shots`,
      r.peakBloomDeg < 0.001,
      `peak ${fmt(r.peakBloomDeg, 3)}°`
    );
  }

  for (const r of rows) {
    check(`${r.id}: aiming is better than hip fire`, r.adsDeg < r.hipDeg, `${fmt(r.adsDeg)}° vs ${fmt(r.hipDeg)}°`);
    check(`${r.id}: recovers in under a second`, r.recoverMs < 1000, `${fmt(r.recoverMs, 0)}ms`);
  }

  check(
    "the sniper cannot be hip-fired: over half a metre of miss at 8m",
    cmAt(byId.sniper.hipDeg) > 50,
    `${fmt(cmAt(byId.sniper.hipDeg), 0)}cm`
  );
  check("the sniper is exact when scoped", byId.sniper.adsDeg < 0.02, `${fmt(byId.sniper.adsDeg, 3)}°`);
  check(
    "the revolver is the most accurate thing you can fire from the hip",
    rows.every((r) => r.id === "revolver" || r.hipDeg >= byId.revolver.hipDeg),
    `${fmt(byId.revolver.hipDeg)}°`
  );
  check(
    "the SMG is the most forgiving automatic from the hip",
    autos.every((r) => r.id === "smg" || r.hipDeg >= byId.smg.hipDeg),
    `smg ${fmt(byId.smg.hipDeg)}° vs rifle ${fmt(byId.rifle.hipDeg)}°`
  );
  check(
    "...and pays for it at range: the loosest automatic when scoped",
    autos.every((r) => r.id === "smg" || r.adsDeg <= byId.smg.adsDeg),
    `smg ${fmt(byId.smg.adsDeg)}° vs rifle ${fmt(byId.rifle.adsDeg)}°`
  );
  // Against everything but the sniper, whose hip error is deliberately
  // enormous and would make this comparison meaningless.
  const aimable = rows.filter((r) => r.id !== "sniper");
  check(
    "a shell's cone is wider than any aimable weapon's hip-fire error",
    byId.shotgun.spreadDeg > Math.max(...aimable.map((r) => r.hipDeg)),
    `${fmt(byId.shotgun.spreadDeg, 1)}° vs worst hip ${fmt(Math.max(...aimable.map((r) => r.hipDeg)))}°`
  );

  console.log(failures === 0 ? "\nAll invariants hold." : `\n${failures} invariant(s) BROKEN.`);
  await browser.close();
  if (process.argv.includes("--check")) process.exit(failures === 0 ? 0 : 1);
})();
