const { chromium } = require("playwright");

// Exercises the weapon system end to end in a real browser: the picker, the
// per-weapon fire rules (rate of fire, bolt/pump cycle, magazine, reload),
// shotgun pellet spread, and the casing/particle effects that hang off a
// shot. Run `npm run serve` first.
//
// Shots are fired through the drill + WeaponRuntime pair directly rather
// than through pointer lock, which headless Chromium won't grant.

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
async function setupHeadlessSession(page, weaponId, mode) {
  return page.evaluate(
    async ([weaponId, mode]) => {
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
        runtime: new WeaponRuntime(weapon),
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
        fire(now = performance.now()) {
          const { runtime, drill, weapon, buildShotRays } = window.__test;
          if (!runtime.canFire(now)) return { blocked: true, ammo: runtime.ammo };
          const rays = buildShotRays(weapon, d.camera);
          const result = drill.handleShot(now, rays);
          runtime.consume(now);
          return { blocked: false, rays: rays.length, ammo: runtime.ammo, ...result };
        },
      };
      return { weapon: weapon.id, fireMode: weapon.fireMode, magazine: weapon.magazine };
    },
    [weaponId, mode]
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
    const rays = t.buildShotRays(t.weapon, window.__aimonsiteDebug.camera);
    const spread = rays.map((r) => Math.hypot(r.x, r.y));
    return {
      count: rays.length,
      firstIsCentred: rays[0].x === 0 && rays[0].y === 0,
      maxSpread: Math.max(...spread),
      allFinite: rays.every((r) => Number.isFinite(r.x) && Number.isFinite(r.y)),
    };
  });
  check("nine pellets per shell", pellets.count === 9, `count=${pellets.count}`);
  check("first pellet is dead centre", pellets.firstIsCentred);
  check("pellets stay within a small cone", pellets.maxSpread > 0 && pellets.maxSpread < 0.2, `max=${pellets.maxSpread.toFixed(4)}`);
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

  console.log("\n5. Effects — casings and particles");
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


  console.log("\n6. Live session — main.js's own firing pipeline");
  // Everything above drives the drill directly. This drives the real thing:
  // pointer lock, mousedown/mouseup, the per-frame auto-fire loop, the ammo
  // HUD, and the R-to-reload key.
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

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
