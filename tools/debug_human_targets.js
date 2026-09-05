const { chromium } = require("playwright");

// Exercises humanoid targets: the shape a drill spawns, the three hit zones,
// what a shot reports about which zone it struck, and how a session summary
// accounts for headshots. Run `npm run serve` first.
//
// Shots go through a drill directly rather than through pointer lock, the
// same way tools/debug_weapons.js does — headless Chromium won't grant lock.
//
// Human targets default to *off* (core/rangeConfig.js), so the setting is
// seeded into localStorage before the page's modules run.

const BASE = "http://localhost:8123/app/index.html?duration=30000&debug=1";

let failures = 0;
function check(label, condition, detail) {
  const status = condition ? "PASS" : "FAIL";
  if (!condition) failures++;
  console.log(`  [${status}] ${label}${detail === undefined ? "" : ` — ${detail}`}`);
}

async function withHumanTargets(page, enabled) {
  await page.addInitScript((on) => {
    const key = "aimonsite:rangeConfig";
    let config = {};
    try {
      config = JSON.parse(localStorage.getItem(key) ?? "{}");
    } catch {
      config = {};
    }
    localStorage.setItem(key, JSON.stringify({ ...config, humanTargets: on }));
  }, enabled);
}

async function openRange(page) {
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__aimonsiteDebug), null, { timeout: 15000 });
  await page.click('.mode-card[data-mode="gridshot"]');
  await page.click("#home-start");
  await page.click("#weapon-confirm");
  await page.waitForTimeout(200);
}

// Builds a Gridshot drill of the given target shape and exposes helpers that
// aim at one named zone of its live target and pull the trigger.
async function setupDrill(page, shape) {
  return page.evaluate(async (shape) => {
    const d = window.__aimonsiteDebug;
    const base = new URL("../core/", location.href).href;
    const { GridshotDrill } = await import(`${base}drills/gridshot.js`);

    const drill = new GridshotDrill(
      {
        mode: "gridshot",
        durationMs: 60000,
        targetRadius: 0.35,
        weaponId: "none",
        targetColor: "#ff5c5c",
        targetShape: shape,
      },
      { scene: d.scene, camera: d.camera, targetManager: d.targetManager, controls: d.controls }
    );
    drill.start(performance.now());

    window.__test = {
      drill,
      // Aims at the centre of one of the live target's zone meshes, so a
      // shot lands on that zone specifically rather than wherever the
      // figure's centre happens to be.
      aimAtPart(part) {
        const target = drill.currentTarget;
        const mesh = target.mesh.children.find((child) => child.userData.part === part);
        if (!mesh) return false;
        target.mesh.updateMatrixWorld(true);
        // The zone's world position, read straight off its matrix so this
        // helper needs nothing imported from three.
        const m = mesh.matrixWorld.elements;
        d.camera.lookAt(m[12], m[13], m[14]);
        d.camera.updateMatrixWorld();
        return true;
      },
      aimAtCentre() {
        d.camera.lookAt(drill.currentTarget.mesh.position);
        d.camera.updateMatrixWorld();
      },
      fire() {
        return drill.handleShot(performance.now(), [{ x: 0, y: 0 }]);
      },
      describeTarget() {
        const target = drill.currentTarget;
        const parts = target.mesh.children.map((child) => child.userData.part);
        return {
          shape: target.shape,
          zones: parts,
          taggedWithId: target.mesh.children.every((child) => child.userData.targetId === target.id),
          aimRadius: Number(target.aimRadius.toFixed(3)),
        };
      },
    };
    return window.__test.describeTarget();
  }, shape);
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (err) => {
    failures++;
    console.log(`  [FAIL] page error — ${err.message}`);
  });

  console.log("\n1. The setting");
  // From the home screen: the sidebar is gone once the range is open.
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__aimonsiteDebug), null, { timeout: 15000 });
  await page.click("#home-settings-btn");
  const switchState = await page.evaluate(() => {
    const el = document.getElementById("human-targets-switch");
    return { present: Boolean(el), checked: el?.getAttribute("aria-checked") };
  });
  check("a Human Targets switch exists in Settings", switchState.present);
  check("it is off by default", switchState.checked === "false", `aria-checked=${switchState.checked}`);

  await page.click("#human-targets-switch");
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("aimonsite:rangeConfig")).humanTargets);
  check("turning it on persists", persisted === true, `humanTargets=${persisted}`);

  console.log("\n2. The figure");
  await withHumanTargets(page, true);
  await openRange(page);
  const figure = await setupDrill(page, "human");
  check("the drill spawns a humanoid", figure.shape === "human", figure.shape);
  check(
    "built from head, torso (with arms) and legs",
    figure.zones.filter((p) => p === "head").length === 1 &&
      figure.zones.filter((p) => p === "torso").length === 3 &&
      figure.zones.filter((p) => p === "legs").length === 2,
    figure.zones.join(", ")
  );
  check("every zone answers to the target's id", figure.taggedWithId);
  check("the heatmap yardstick is the torso, not the sphere radius", figure.aimRadius < 0.35, figure.aimRadius);

  console.log("\n3. Which zone a shot struck");
  for (const part of ["head", "torso", "legs"]) {
    const shot = await page.evaluate((part) => {
      const aimed = window.__test.aimAtPart(part);
      const before = window.__test.drill.currentTarget;
      const result = window.__test.fire();
      return { aimed, part: before.lastHitPart, hit: result.hit, headshot: result.headshot };
    }, part);
    check(`a shot at the ${part} connects`, shot.aimed && shot.hit);
    check(`...and is reported as ${part}`, shot.part === part, shot.part);
    check(`...headshot=${part === "head"}`, shot.headshot === (part === "head"));
  }

  console.log("\n4. Headshots in the summary");
  const humanSummary = await page.evaluate(() => {
    const result = window.__test.drill.end(performance.now());
    return { headshots: result.extra.headshots, hits: result.hits };
  });
  check("headshots are counted", humanSummary.headshots === 1, JSON.stringify(humanSummary));

  console.log("\n5. Spheres are unchanged");
  await withHumanTargets(page, false);
  await openRange(page);
  const sphere = await setupDrill(page, "sphere");
  check("the drill still spawns a sphere by default", sphere.shape === "sphere", sphere.shape);
  check("with no zones", sphere.zones.length === 0, `${sphere.zones.length} children`);

  const sphereShot = await page.evaluate(() => {
    window.__test.aimAtCentre();
    const before = window.__test.drill.currentTarget;
    const result = window.__test.fire();
    return { part: before.lastHitPart, hit: result.hit, headshot: result.headshot };
  });
  check("a sphere still takes hits", sphereShot.hit);
  check("and reports no zone", sphereShot.part === null, String(sphereShot.part));
  check("so nothing is ever a headshot", sphereShot.headshot === false);

  const sphereSummary = await page.evaluate(() => window.__test.drill.end(performance.now()).extra.headshots);
  check("the summary leaves the stat out entirely", sphereSummary === null, String(sphereSummary));

  console.log("\n6. Cleanup");
  const cleanup = await page.evaluate(async () => {
    const THREE = await import("three");
    const d = window.__aimonsiteDebug;
    const before = d.scene.children.length;
    d.targetManager.spawn({
      position: new THREE.Vector3(0, 1.6, -8),
      radius: 0.35,
      color: "#ff5c5c",
      shape: "human",
      now: performance.now(),
    });
    const during = d.scene.children.length;
    d.targetManager.clear();
    return { before, during, after: d.scene.children.length };
  });
  check("a figure is added and removed as one object", cleanup.during === cleanup.before + 1 && cleanup.after === cleanup.before, JSON.stringify(cleanup));

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
