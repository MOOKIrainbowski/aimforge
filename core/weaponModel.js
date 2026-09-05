import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { getWeapon } from "./weapons.js";

// Real, CC0/CC-BY low-poly weapon models (Quaternius and Zsky, via
// poly.pizza) - generic/original designs, not replicas of any branded
// weapon. Resolved against this module's own URL (not the page's) so the
// same relative path works whether this loads from app/index.html or
// desktop/renderer/index.html.
const MODEL_DIR = "../vendor/models/";

// Every model is normalised to length 1 along its barrel, pointing down -Z
// (camera-forward) and centred on its own bounding box. Each weapon's
// `viewLength` then scales it to a size that reads correctly *relative to
// the others* - a pistol should not fill the same screen space as a sniper,
// which one shared constant for all of them could never express.
const loadCache = new Map();

function normalize(root, weapon) {
  root.traverse((child) => {
    // A camera-attached viewmodel casting a shadow onto the world would
    // read as a shadow appearing from empty space - suppress it.
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });

  // The per-weapon yaw correction that turns the source file's own barrel
  // axis into -Z. Baked into a wrapper here rather than applied at render
  // time so everything downstream (bounding box, muzzle anchor, ejection
  // port) can assume one consistent orientation.
  const oriented = new THREE.Group();
  oriented.rotation.y = weapon.modelYaw;
  oriented.add(root);
  oriented.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(oriented);
  const size = box.getSize(new THREE.Vector3());
  const length = size.z || 1;
  root.scale.multiplyScalar(1 / length);

  oriented.updateMatrixWorld(true);
  const scaled = new THREE.Box3().setFromObject(oriented);
  const center = scaled.getCenter(new THREE.Vector3());
  root.position.sub(center.applyQuaternion(oriented.quaternion.clone().invert()));

  oriented.updateMatrixWorld(true);
  const finalBox = new THREE.Box3().setFromObject(oriented);
  const finalSize = finalBox.getSize(new THREE.Vector3());

  return { object: oriented, width: finalSize.x, height: finalSize.y };
}

// Loads (and caches) one weapon's model. Weapons load on demand rather than
// all at once: eight models is ~620KB, and a player who only ever picks the
// rifle should not pay for the other seven before the range opens.
export function loadWeaponModel(id) {
  const weapon = getWeapon(id);
  if (loadCache.has(weapon.id)) return loadCache.get(weapon.id);

  const loader = new GLTFLoader();
  const url = new URL(`${MODEL_DIR}${weapon.model}.glb`, import.meta.url).href;
  const promise = loader
    .loadAsync(url)
    .then((gltf) => normalize(gltf.scene, weapon))
    .catch((err) => {
      // A missing/corrupt model must not take the range down with it - the
      // session stays playable, just without a visible gun.
      console.warn(`AimonSite: could not load weapon model "${weapon.id}"`, err);
      loadCache.delete(weapon.id);
      return null;
    });
  loadCache.set(weapon.id, promise);
  return promise;
}

// Warms the cache in the background without blocking anything on the result.
export function prefetchWeaponModels(ids) {
  for (const id of ids) loadWeaponModel(id);
}

// The FOV the poses below are authored against. The viewmodel is a child of
// the camera, so narrowing the FOV for ADS would otherwise magnify the gun
// along with the world and shove it off-screen - the old aim pose fought
// that by *also* scaling up and moving closer, which is why the weapon
// swelled instead of tucking under the scope. Screen size of a camera-child
// is (size / depth) / tan(fov/2), so holding it steady means scaling size
// and the lateral offset by tan(fov/2) / tan(FOV_REFERENCE/2) while leaving
// depth alone. Then the aim pose is a real pose change, not FOV bookkeeping.
const FOV_REFERENCE = 96;
const REF_HALF_FOV_TAN = Math.tan(THREE.MathUtils.degToRad(FOV_REFERENCE) / 2);

// Hip: held toward the bottom-right, past the screen edge on the stock side
// so it reads as carried rather than floating mid-screen. HIP_Y is the hold
// height for a full-size weapon; each weapon's `viewOffsetY` raises it from
// there, which is what handguns need — they are short enough to hang below
// the frame at the shared height and read as dropped rather than carried.
const HIP_X = 0.4;
const HIP_Y = -0.58;
const HIP_DEPTH = -0.62;

// Aim: centred under the scope. `.scope-lens` in app/style.css is 44vmin
// across, so its radius is 22vmin = 0.22 of the viewport's short side; on
// any normal landscape window that is 0.44 of a half-screen-height. Deriving
// the aim height from that (plus the model's own half-height) puts every
// weapon's top edge just below the lens rim automatically, whatever its
// proportions - which is what "directly below the scope" has to mean when
// eight weapons of different sizes share one pose.
const LENS_RADIUS_FRACTION = 0.44;
const AIM_DEPTH = -0.52;
const AIM_GAP = 0.025;

const POSE_LERP_SEC = 0.13;
const IDLE_SWAY_AMPLITUDE = 0.007;
const IDLE_SWAY_SPEED = 1.5;

// Recoil is a critically damped spring per axis rather than a fixed-length
// animation curve. Two reasons it reads better than the old linear ramp:
// shots fired faster than the settle time stack on top of each other instead
// of restarting from zero (an SMG climbs, a sniper heaves once), and the
// return is an eased snap-back rather than a constant-speed slide.
//
// A kick is applied as an immediate displacement, not a velocity impulse, so
// the peak offset is exactly the value authored in each weapon's `kick`
// block — no reasoning backwards from impulse magnitudes to guess how far
// the gun will actually move.
//
// The step below is the closed-form solution for a critically damped spring
// over `dt` rather than a numerical integration of one. That matters here:
// these springs are stiff (a settle measured in tens of milliseconds against
// a 16ms frame), and stepping them with Euler either eats almost all of the
// motion in the first frame or goes unstable at low frame rates. The
// analytic form behaves identically at 30fps and 240fps.
class Spring {
  constructor() {
    this.value = 0;
    this.velocity = 0;
  }

  impulse(amount) {
    this.value += amount;
  }

  update(dt, omega) {
    const decay = Math.exp(-omega * dt);
    const term = this.velocity + omega * this.value;
    this.value = (this.value + term * dt) * decay;
    this.velocity = (this.velocity - term * omega * dt) * decay;
  }

  reset() {
    this.value = 0;
    this.velocity = 0;
  }
}

// Owns the camera-attached weapon: which gun is shown, its pose blend, idle
// sway, recoil springs, and the bolt/pump and reload animations. Purely
// cosmetic - separate from core/weapon.js's RecoilTracker, which actually
// rotates the camera for the Recoil Control training mechanic.
export class Viewmodel {
  constructor(camera) {
    this.camera = camera;

    this.group = new THREE.Group();
    camera.add(this.group);

    this.holder = new THREE.Group();
    this.group.add(this.holder);

    // A light that travels with the weapon so it's always lit consistently
    // regardless of which way the camera is facing. The range's own lights
    // are aimed at the range, not at the player's face, and the models'
    // materials are quite dark by design - without this the gun reads as a
    // flat black silhouette instead of showing its real wood/metal tones.
    // Low intensity + short range so it has negligible effect on the range
    // itself, which is much farther away.
    const fillLight = new THREE.PointLight(0xfff2e0, 1.4, 2.5, 2);
    fillLight.position.set(0, 0.2, 0.35);
    this.group.add(fillLight);

    this.weapon = getWeapon("rifle");
    this.currentMesh = null;
    this.modelHeight = 0.3;
    this.modelWidth = 0.1;
    this.loadToken = 0;

    this.elapsed = 0;
    this.aimed = false;
    this.aimT = 0; // 0 = hip, 1 = fully aimed; eased toward `aimed` each frame

    this.recoilBack = new Spring();
    this.recoilRise = new Spring();
    this.recoilPitch = new Spring();
    this.recoilRoll = new Spring();

    // 0..1 progress of a bolt/pump cycle and of a reload, pushed in each
    // frame by main.js from the WeaponRuntime.
    this.actionT = null;
    this.reloadT = null;

    this._muzzleLocal = new THREE.Vector3();
    this._ejectLocal = new THREE.Vector3();
    this._scratch = new THREE.Vector3();
  }

  // Swaps the visible weapon, loading its model if this is the first time.
  // Returns a promise so callers can wait for the swap when it matters (the
  // loading screen); the token guard makes a fast A -> B -> A switch land on
  // whichever weapon was chosen last rather than whichever loaded last.
  async setWeapon(id) {
    this.weapon = getWeapon(id);
    const token = ++this.loadToken;
    const model = await loadWeaponModel(this.weapon.id);
    if (token !== this.loadToken) return;

    if (this.currentMesh) this.holder.remove(this.currentMesh);
    if (!model) {
      this.currentMesh = null;
      return;
    }
    this.currentMesh = model.object.clone();
    this.modelHeight = model.height;
    this.modelWidth = model.width;
    this.holder.add(this.currentMesh);

    // Anchors, in the group's local space before the FOV scale is applied.
    // The muzzle is the far end of the normalised (length 1) model; the
    // ejection port sits at the receiver, just right of and above centre.
    const len = this.weapon.viewLength;
    this._muzzleLocal.set(0, this.modelHeight * len * 0.08, -0.5 * len);
    this._ejectLocal.set(this.modelWidth * len * 0.5, this.modelHeight * len * 0.12, -0.02 * len);

    this.recoilBack.reset();
    this.recoilRise.reset();
    this.recoilPitch.reset();
    this.recoilRoll.reset();
  }

  setAimed(aimed) {
    this.aimed = aimed;
  }

  // Called on every shot. Displacements come from the weapon's own `kick`
  // block, so a shotgun heaves and an SMG chatters off the same code.
  kick() {
    const k = this.weapon.kick;
    this.recoilBack.impulse(k.back);
    this.recoilRise.impulse(k.rise);
    this.recoilPitch.impulse(k.pitch);
    // Roll alternates side to side so sustained fire doesn't twist the gun
    // steadily one way.
    this.recoilRoll.impulse(k.roll * (Math.random() < 0.5 ? -1 : 1));
  }

  _omega() {
    // A critically damped spring has decayed to ~5% of its peak at
    // omega * t = 4.7, so this makes `settleMs` the time the kick actually
    // takes to disappear rather than an arbitrary tuning number.
    return 4.7 / Math.max(0.04, this.weapon.kick.settleMs / 1000);
  }

  // 0..1 bolt/pump progress, or null when the action isn't running.
  setActionProgress(t) {
    this.actionT = t;
  }

  setReloadProgress(t) {
    this.reloadT = t;
  }

  // World-space position of the barrel tip, for tracer origins.
  getMuzzleWorld(out) {
    this.group.updateMatrixWorld();
    return this.group.localToWorld(out.copy(this._muzzleLocal));
  }

  // World-space position of the ejection port, for spent casings.
  getEjectionWorld(out) {
    this.group.updateMatrixWorld();
    return this.group.localToWorld(out.copy(this._ejectLocal));
  }

  update(dt) {
    this.elapsed += dt;

    const target = this.aimed ? 1 : 0;
    const step = POSE_LERP_SEC > 0 ? dt / POSE_LERP_SEC : 1;
    const diff = target - this.aimT;
    this.aimT += Math.sign(diff) * Math.min(Math.abs(diff), step);

    const omega = this._omega();
    this.recoilBack.update(dt, omega);
    this.recoilRise.update(dt, omega);
    this.recoilPitch.update(dt, omega);
    this.recoilRoll.update(dt, omega);

    // Screen-space compensation: holds the gun's apparent size and screen
    // position steady while the world FOV changes underneath it (ADS zoom,
    // or the player dragging the Field of View slider).
    const fovScale = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) / REF_HALF_FOV_TAN;

    const depth = HIP_DEPTH + (AIM_DEPTH - HIP_DEPTH) * this.aimT;
    const halfHeightAtDepth = Math.abs(depth) * REF_HALF_FOV_TAN;
    const aimY = -(LENS_RADIUS_FRACTION * halfHeightAtDepth + (this.modelHeight * this.weapon.viewLength) / 2 + AIM_GAP);

    // Sway settles down as the weapon comes up to a steadier aimed hold.
    const sway = Math.sin(this.elapsed * IDLE_SWAY_SPEED) * IDLE_SWAY_AMPLITUDE * (1 - this.aimT * 0.7);

    // A bolt/pump cycle: the whole weapon dips and rolls slightly while the
    // action is worked, peaking mid-cycle. A reload drops it further out of
    // view and cants it over, the way a magazine change reads.
    const actionDip = this.actionT === null ? 0 : Math.sin(this.actionT * Math.PI) * 0.05;
    const actionRoll = this.actionT === null ? 0 : Math.sin(this.actionT * Math.PI) * 0.28;
    const reloadDip = this.reloadT === null ? 0 : Math.sin(this.reloadT * Math.PI) * 0.3;
    const reloadRoll = this.reloadT === null ? 0 : Math.sin(this.reloadT * Math.PI) * 0.5;

    // The per-weapon hip lift is folded into the hip end of the blend, so it
    // fades out as the weapon comes up: the aimed height is derived from the
    // scope lens and must not be nudged out from under it.
    const hipY = HIP_Y + (this.weapon.viewOffsetY ?? 0);
    const x = HIP_X * (1 - this.aimT);
    const y = hipY + (aimY - hipY) * this.aimT + sway + this.recoilRise.value - actionDip - reloadDip;

    this.group.position.set(x * fovScale, y * fovScale, depth - this.recoilBack.value);
    this.group.rotation.set(this.recoilPitch.value, 0, this.recoilRoll.value + actionRoll + reloadRoll);

    this.holder.scale.setScalar(this.weapon.viewLength * fovScale);
  }
}
