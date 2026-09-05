const { chromium } = require("playwright");

// Exercises the weapon system end to end in a real browser: the picker, the
// per-weapon fire rules (rate of fire, bolt/pump cycle, magazine, reload),
// the firing-accuracy model, shotgun pellet spread, and the casing/particle
// effects that hang off a shot. Run `npm run serve` first.
//
// Shots are fired through the drill + WeaponRuntime pair directly rather
// than through pointer lock, which headless Chromium won't grant.
//
// The magazine limit defaults to *off* (core/rangeConfig.js), so anything
// testing ammo has to turn it on first — see withMagazineLimit(). Section 7
// covers the default itself.

const BASE = "http://localhost:8123/app/index.html?duration=30000&debug=1";

let failures = 0;
function check(label, condition, detail) {
  const status = condition ? "PASS" : "FAIL";
  if (!condition) failures++;
  console.log(`  [${status}] ${label}${detail === undefined ? "" : ` — ${detail}`}`);
}

async function enterRange(page, { mode = "gridshot", weapon = "rifle" } = {}) {
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__aimonsiteDebug), null, { timeout: 15000 });
  await page.click(`.mode-card[data-mode="${mode}"]`);
  await page.click("#home-start");
  await page.click(`.weapon-option[data-weapon="${weapon}"]`);
  await page.click("#weapon-confirm");
  await page.waitForTimeout(300);
  // Deliberately *not* clicking the canvas: if pointer lock happened to be
  // granted, main.js would start a session of its own against the same
  // TargetManager and the checks below would be aiming at its targets
  // instead of the drill this harness drives.
}

// The drill only starts on pointer lock, so build the same objects here and
// drive them by hand. This is the firing pipeline main.js runs, minus the
// input layer.
// Seeds the persisted range config before any module runs, so a page can be
// loaded with the magazine limit already on or off.
async function withMagazineLimit(page, enabled) {
  await page.addInitScript((on) => {
    const key = "aimonsite:rangeConfig";
    let config = {};
    try {
      config = JSON.parse(localStorage.getItem(key) ?? "{}");
    } catch {
      config = {};
    }
    localStorage.setItem(key, JSON.stringify({ ...config, magazineLimit: on }));
  }, enabled);
}

async function setupHeadlessSession(page, weaponId, mode, { magazineLimit = true } = {}) {
  return page.evaluate(
    async ([weaponId, mode, magazineLimit]) => {
      const d = window.__aimonsiteDebug;
      const base = new URL("../core/", location.href).href;
      const { getWeapon } = await import(`${base}weapons.js`);
      const { WeaponRuntime, buildShotRays } = await import(`${base}weaponRuntime.js`);
      const { GridshotDrill } = await import(`${base}drills/gridshot.js`);
      const { SwitchingDrill } = await import(`${base}drills/switching.js`);

      const weapon = getWeapon(weaponId);
      const config = {
        mode,
        durationMs: 60000,
        targetRadius: 0.35,
        waveSize: 4,
        speedMultiplier: 1,
        weaponId: "none",
        targetColor: "#ff5c5c",
      };
      const deps = { scene: d.scene, camera: d.camera, targetManager: d.targetManager, controls: d.controls };
      const drill = mode === "switching" ? new SwitchingDrill(config, deps) : new GridshotDrill(config, deps);
      drill.start(performance.now());

      window.__test = {
        weapon,
        drill,
        runtime: new WeaponRuntime(weapon, { magazineLimit }),
        buildShotRays,
        // Aims dead at one of *this drill's* live targets so a shot is a
        // real hit, not a guess.
        aimAtTarget(index = 0) {
          const { drill } = window.__test;
          const own = drill.currentTarget
            ? [drill.currentTarget]
            : [...(drill.currentWaveIds ?? [])].map((id) => d.targetManager.active.get(id));
          const target = own.filter(Boolean)[index];
          if (!target) return false;
          d.camera.lookAt(target.mesh.position);
          d.camera.updateMatrixWorld();
          return true;
        },
        // `aimT` mirrors main.js's zoom progress: 0 is hip fire, 1 is fully
        // aimed. Shots here default to fully aimed so the checks that are
        // about something else (rate of fire, the bolt cycle, hit
        // accounting) are not fighting the weapon's own hip-fire error.
        fire(now = performance.now(), { aimT = 1 } = {}) {
          const { runtime, drill, weapon, buildShotRays } = window.__test;
          if (!runtime.canFire(now)) return { blocked: true, ammo: runtime.ammo };
          const rays = buildShotRays(weapon, d.camera, { aimT, bloomDeg: runtime.getBloomDeg(now) });
          const result = drill.handleShot(now, rays);
          runtime.consume(now);
          return { blocked: false, rays: rays.length, ammo: runtime.ammo, ...result };
        },
      };
      return { weapon: weapon.id, fireMode: weapon.fireMode, magazine: weapon.magazine };
    },
    [weaponId, mode, magazineLimit]
  );
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (err) => {
    console.log(`  [FAIL] uncaught page error — ${err.message}`);
    failures++;
  });

  console.log("\n1. Weapon picker");
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__aimonsiteDebug), null, { timeout: 15000 });
  await page.click("#home-start");
  const cards = await page.$$eval(".weapon-option", (els) => els.map((e) => e.dataset.weapon));
  check("all eight weapons offered", cards.length === 8, cards.join(", "));
  check("a weapon is preselected", (await page.$$(".weapon-option.selected")).length === 1);

  console.log("\n2. Rifle — rate of fire and magazine");
  await enterRange(page, { weapon: "rifle" });
  const rifle = await setupHeadlessSession(page, "rifle", "gridshot");
  check("rifle is automatic", rifle.fireMode === "auto", rifle.fireMode);
  const rifleBurst = await page.evaluate(() => {
    const t = window.__test;
    const now = performance.now();
    // Two pulls one millisecond apart: the second must be refused by the
    // 640rpm gate (~94ms between shots).
    const first = t.fire(now);
    const second = t.fire(now + 1);
    const third = t.fire(now + 200);
    return { first: first.blocked, second: second.blocked, third: third.blocked, ammo: t.runtime.ammo };
  });
  check("first shot fires", rifleBurst.first === false);
  check("shot 1ms later is rate-limited", rifleBurst.second === true);
  check("shot 200ms later fires", rifleBurst.third === false);
  check("two rounds consumed", rifleBurst.ammo === 28, `ammo=${rifleBurst.ammo}`);

  const rifleDry = await page.evaluate(() => {
    const t = window.__test;
    let now = performance.now();
    for (let i = 0; i < 40; i++) {
      now += 100;
      t.fire(now);
    }
    t.runtime.update(now + 10);
    return { ammo: t.runtime.ammo, reloading: t.runtime.reloading };
  });
  check("magazine empties and auto-reload starts", rifleDry.ammo === 0 && rifleDry.reloading, JSON.stringify(rifleDry));

  const rifleReloaded = await page.evaluate(() => {
    const t = window.__test;
    t.runtime.update(t.runtime.reloadUntil + 1);
    return t.runtime.ammo;
  });
  check("reload refills the magazine", rifleReloaded === 30, `ammo=${rifleReloaded}`);

  console.log("\n3. Sniper — bolt cycle between shots");
  await enterRange(page, { weapon: "sniper" });
  await setupHeadlessSession(page, "sniper", "gridshot");
  const bolt = await page.evaluate(() => {
    const t = window.__test;
    const now = performance.now();
    const first = t.fire(now);
    // Well past the 60rpm rate gate but inside the 1200ms bolt cycle.
    const duringCycle = t.fire(now + 1100);
    const afterCycle = t.fire(now + 1300);
    return { first: first.blocked, duringCycle: duringCycle.blocked, afterCycle: afterCycle.blocked };
  });
  check("sniper fires", bolt.first === false);
  check("blocked while the bolt cycles", bolt.duringCycle === true);
  check("fires again once cycled", bolt.afterCycle === false);

  console.log("\n4. Shotgun — pellet cone");
  await enterRange(page, { mode: "switching", weapon: "shotgun" });
  await setupHeadlessSession(page, "shotgun", "switching");
  const pellets = await page.evaluate(() => {
    const t = window.__test;
    const rays = t.buildShotRays(t.weapon, window.__aimonsiteDebug.camera, { aimT: 1 });
    // Pellets scatter around wherever the shot's own centre landed, not
    // around the crosshair — so the cone is measured from rays[0], which is
    // that centre.
    const fromCentre = rays.slice(1).map((r) => Math.hypot(r.x - rays[0].x, r.y - rays[0].y));
    return {
      count: rays.length,
      maxFromCentre: Math.max(...fromCentre),
      allFinite: rays.every((r) => Number.isFinite(r.x) && Number.isFinite(r.y)),
    };
  });
  check("nine pellets per shell", pellets.count === 9, `count=${pellets.count}`);
  check("pellets stay within a small cone", pellets.maxFromCentre > 0 && pellets.maxFromCentre < 0.2, `max=${pellets.maxFromCentre.toFixed(4)}`);
  check("no NaN rays", pellets.allFinite);

  const blast = await page.evaluate(() => {
    const t = window.__test;
    const aimed = t.aimAtTarget(0);
    const result = t.fire(performance.now());
    return {
      aimed,
      hit: result.hit,
      destroyed: result.positions.length,
      shotsTotal: t.drill.shotsTotal,
      shotsHit: t.drill.shotsHit,
      hits: t.drill.hits,
    };
  });
  check("blast connects", blast.hit === true, `aimed=${blast.aimed}`);
  check("counts one shot, not one per pellet", blast.shotsTotal === 1, `shotsTotal=${blast.shotsTotal}`);
  check("accuracy can't exceed 100%", blast.shotsHit <= blast.shotsTotal, `${blast.shotsHit}/${blast.shotsTotal}`);
  check("score credits every target destroyed", blast.hits === blast.destroyed, `hits=${blast.hits} destroyed=${blast.destroyed}`);

  console.log("\n5. Firing accuracy — hip vs ADS, and bloom");
  await enterRange(page, { weapon: "sniper" });
  await setupHeadlessSession(page, "sniper", "gridshot");
  const accuracy = await page.evaluate(() => {
    const t = window.__test;
    const camera = window.__aimonsiteDebug.camera;
    // Error is a random draw per shot, so a single sample proves nothing —
    // these are measured over a few hundred.
    const sample = (aimT, bloomDeg = 0) => {
      const magnitudes = [];
      for (let i = 0; i < 400; i++) {
        const r = t.buildShotRays(t.weapon, camera, { aimT, bloomDeg })[0];
        magnitudes.push(Math.hypot(r.x, r.y));
      }
      return {
        max: Math.max(...magnitudes),
        mean: magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length,
      };
    };
    const hip = sample(0);
    const ads = sample(1);
    const half = sample(0.5);

    // A bolt gun's action forces a gap far longer than its recovery time, so
    // its bloom must always be back to zero by the next shot — the base term
    // is the whole story for it. (Sustained-fire accumulation is tested on an
    // automatic below, where it actually applies.)
    let now = performance.now();
    for (let i = 0; i < 6; i++) {
      now += 1300; // past the bolt cycle, so every pull actually fires
      t.runtime.consume(now);
    }
    const betweenShots = t.runtime.getBloomDeg(now + t.weapon.cycleMs);

    return { hip, ads, half, betweenShots };
  });
  check("sniper is badly inaccurate from the hip", accuracy.hip.mean > 0.02, `mean=${accuracy.hip.mean.toFixed(4)}`);
  check("sniper is pinpoint when scoped", accuracy.ads.max === 0, `max=${accuracy.ads.max}`);
  check("half-aimed lands between the two", accuracy.half.mean > accuracy.ads.mean && accuracy.half.mean < accuracy.hip.mean, `half=${accuracy.half.mean.toFixed(4)}`);
  check("a bolt gun's bloom clears inside its own cycle", accuracy.betweenShots === 0, `after cycle=${accuracy.betweenShots}`);

  // The sustained-fire penalty, on a weapon that can actually sustain fire.
  // Shots are spaced at the rifle's real cyclic rate, because bloom recovers
  // continuously and a slower test cadence would let it recover away — the
  // exact trap the tuning note in weapons.js describes.
  const rifleBloom = await page.evaluate(async () => {
    const base = new URL("../core/", location.href).href;
    const { getWeapon, shotIntervalMs } = await import(`${base}weapons.js`);
    const { WeaponRuntime, buildShotRays } = await import(`${base}weaponRuntime.js`);
    const camera = window.__aimonsiteDebug.camera;
    const weapon = getWeapon("rifle");
    const interval = shotIntervalMs(weapon);

    const afterHolding = (n) => {
      const runtime = new WeaponRuntime(weapon, { magazineLimit: false });
      let now = performance.now();
      for (let i = 0; i < n; i++) {
        runtime.consume(now);
        now += interval;
      }
      const bloomDeg = runtime.getBloomDeg(now);
      let total = 0;
      for (let i = 0; i < 400; i++) {
        const r = buildShotRays(weapon, camera, { aimT: 1, bloomDeg })[0];
        total += Math.hypot(r.x, r.y);
      }
      return { bloomDeg, mean: total / 400, released: runtime.getBloomDeg(now + 600) };
    };

    const one = afterHolding(1);
    const ten = afterHolding(10);
    const thirty = afterHolding(30);
    const first = buildShotRays(weapon, camera, { aimT: 1, bloomDeg: 0 })[0];
    return { firstShot: Math.hypot(first.x, first.y), one, ten, thirty, cap: weapon.accuracy.maxBloomDeg };
  });
  check("a rifle's first shot after a pause carries no bloom", rifleBloom.firstShot < 0.002, `offset=${rifleBloom.firstShot.toFixed(5)}`);
  check("held fire walks a rifle off the crosshair", rifleBloom.ten.mean > rifleBloom.one.mean * 1.5, `1 shot=${rifleBloom.one.mean.toFixed(4)} 10 shots=${rifleBloom.ten.mean.toFixed(4)}`);
  // Measured one fire-interval after the last shot — i.e. the error the next
  // shot would actually carry, which is the number that matters. It sits a
  // little under `maxBloomDeg` because that interval's worth of recovery has
  // already happened; the cap itself is only touched at the instant of a shot.
  check("bloom is most of the way to its cap by ten rounds", rifleBloom.ten.bloomDeg > rifleBloom.cap * 0.7, `10 shots=${rifleBloom.ten.bloomDeg.toFixed(2)} cap=${rifleBloom.cap}`);
  check("bloom plateaus rather than growing without bound", Math.abs(rifleBloom.thirty.bloomDeg - rifleBloom.ten.bloomDeg) < 0.01 && rifleBloom.thirty.bloomDeg <= rifleBloom.cap + 1e-9, `10 shots=${rifleBloom.ten.bloomDeg.toFixed(2)} 30 shots=${rifleBloom.thirty.bloomDeg.toFixed(2)} cap=${rifleBloom.cap}`);
  check("releasing the trigger clears it within ~0.6s", rifleBloom.thirty.released === 0, `after=${rifleBloom.thirty.released}`);

  console.log("\n6. Effects — casings and particles");
  const effects = await page.evaluate(async () => {
    const d = window.__aimonsiteDebug;
    const base = new URL("../core/", location.href).href;
    const casings = await import(`${base}casings.js`);
    const particles = await import(`${base}particles.js`);
    const THREE = await import(new URL("../vendor/three/build/three.module.js", location.href).href);

    await casings.loadCasingModel();
    const before = d.scene.children.length;
    casings.ejectCasing(d.scene, d.camera, new THREE.Vector3(0.3, 1.4, -0.5));
    const afterCasing = d.scene.children.length;
    particles.spawnKillBurst(d.scene, new THREE.Vector3(0, 2, -8), 5, "#ff5c5c", 0.35);
    const afterBurst = d.scene.children.length;

    // Run the effects past their lifetimes; both must clean up after
    // themselves or a long session leaks objects into the scene graph.
    for (let i = 0; i < 400; i++) {
      casings.updateCasings(0.016);
      particles.updateParticles(0.016);
    }
    await new Promise((r) => setTimeout(r, 3000));
    casings.updateCasings(0.016);
    particles.updateParticles(0.016);
    return { before, casingAdded: afterCasing - before, burstAdded: afterBurst - afterCasing, after: d.scene.children.length };
  });
  check("a casing is ejected", effects.casingAdded === 1, `+${effects.casingAdded}`);
  check("kill burst spawns a flash plus shards", effects.burstAdded > 10, `+${effects.burstAdded}`);
  check("both clean up fully", effects.after === effects.before, `${effects.before} -> ${effects.after}`);


  console.log("\n7. Live session, magazine limit ON — main.js's own firing pipeline");
  // Everything above drives the drill directly. This drives the real thing:
  // pointer lock, mousedown/mouseup, the per-frame auto-fire loop, the ammo
  // HUD, and the R-to-reload key.
  await withMagazineLimit(page, true);
  await page.goto(BASE.replace("duration=30000", "duration=20000"), { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__aimonsiteDebug), null, { timeout: 15000 });
  await page.click('.mode-card[data-mode="gridshot"]');
  await page.click("#home-start");
  await page.click('.weapon-option[data-weapon="smg"]');
  await page.click("#weapon-confirm");
  await page.waitForTimeout(200);
  await page.mouse.click(640, 400);
  await page.waitForTimeout(300);

  const live = await page.evaluate(() => ({
    locked: document.pointerLockElement !== null,
    hasDrill: Boolean(window.__aimonsiteDebug.drill),
    ammo: window.__aimonsiteDebug.weaponRuntime ? window.__aimonsiteDebug.weaponRuntime.ammo : null,
    hudVisible: !document.getElementById("hud-weapon").classList.contains("hidden"),
  }));
  check("pointer lock engages and the session starts", live.locked && live.hasDrill, JSON.stringify(live));
  check("ammo HUD is shown", live.hudVisible);
  check("magazine starts full", live.ammo === 32, "ammo=" + live.ammo);

  // Hold the trigger: an automatic weapon must keep firing off the frame
  // loop, not just the one mousedown that started it.
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(100);
  const held = await page.evaluate(() => ({
    ammo: window.__aimonsiteDebug.weaponRuntime.ammo,
    hudText: document.getElementById("hud-ammo-mag").textContent,
    shots: window.__aimonsiteDebug.drill.shotsTotal,
  }));
  check("holding the trigger keeps an automatic firing", held.shots > 3, "shots=" + held.shots);
  check("ammo tracks the shots fired", held.ammo === 32 - held.shots, "ammo=" + held.ammo + " shots=" + held.shots);
  check("HUD matches the live ammo count", held.hudText === String(held.ammo), "hud=" + held.hudText);

  await page.keyboard.press("KeyR");
  await page.waitForTimeout(100);
  const reloadState = await page.evaluate(() => ({
    reloading: window.__aimonsiteDebug.weaponRuntime.reloading,
    canFire: window.__aimonsiteDebug.weaponRuntime.canFire(performance.now()),
  }));
  check("R starts a reload", reloadState.reloading === true);
  check("cannot fire mid-reload", reloadState.canFire === false);

  await page.waitForTimeout(1900);
  const afterReload = await page.evaluate(() => window.__aimonsiteDebug.weaponRuntime.ammo);
  check("magazine is full again after the reload", afterReload === 32, "ammo=" + afterReload);

  console.log("\n8. Live session, magazine limit OFF (the default) — infinite fire");
  await withMagazineLimit(page, false);
  await page.goto(BASE.replace("duration=30000", "duration=20000"), { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__aimonsiteDebug), null, { timeout: 15000 });
  await page.click('.mode-card[data-mode="gridshot"]');
  await page.click("#home-start");
  await page.click('.weapon-option[data-weapon="smg"]');
  await page.click("#weapon-confirm");
  await page.waitForTimeout(200);
  await page.mouse.click(640, 400);
  await page.waitForTimeout(300);

  await page.mouse.down();
  await page.waitForTimeout(2600); // comfortably longer than the SMG's 32-round magazine
  await page.mouse.up();
  await page.waitForTimeout(100);
  const infinite = await page.evaluate(() => ({
    shots: window.__aimonsiteDebug.drill.shotsTotal,
    ammo: window.__aimonsiteDebug.weaponRuntime.ammo,
    reloading: window.__aimonsiteDebug.weaponRuntime.reloading,
    hudMag: document.getElementById("hud-ammo-mag").textContent,
    hudCap: document.getElementById("hud-ammo-cap").textContent,
  }));
  check("fires past a full magazine without stopping", infinite.shots > 32, "shots=" + infinite.shots);
  check("never reloads", infinite.reloading === false && infinite.ammo === 32, JSON.stringify(infinite));
  check("HUD reads infinite rather than a frozen number", infinite.hudMag === "∞" && infinite.hudCap === "∞", `${infinite.hudMag}/${infinite.hudCap}`);

  // The rate gate is a firing mechanic, not an ammunition one, so it must
  // still hold with the limit off — otherwise switching this setting would
  // quietly turn every weapon into the same gun.
  const rateHeld = infinite.shots < 2600 / (60000 / 950) + 6;
  check("rate of fire still applies", rateHeld, `shots=${infinite.shots} ceiling=${Math.round(2600 / (60000 / 950) + 6)}`);

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
