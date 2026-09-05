import * as THREE from "three";
import { loadWeaponModel } from "./weaponModel.js";
import { WEAPON_ORDER, getWeapon } from "./weapons.js";

// Renders each weapon's own .glb to a small transparent PNG for the select
// screen's cards.
//
// Rendering the real model beats shipping pre-made thumbnails: there are no
// eight extra image files to commit, cache-bust and keep in sync, and a
// picture can never disagree with the gun you are about to carry — change a
// model or a weapon's `modelYaw` and the card follows automatically. The
// models are already fetched and cached by weaponModel.js for the viewmodel,
// so a thumbnail costs one draw, not one download.
//
// Everything runs on a single throwaway WebGLRenderer that is disposed as
// soon as the last weapon has been drawn. A browser will only keep a handful
// of live WebGL contexts, and the range's own renderer is the one that
// matters — this must not sit alongside it for the rest of the session.

const WIDTH = 512;
const HEIGHT = 288;

// A three-quarter view: barrel to the left and canted slightly toward the
// camera, which is the angle that shows a gun's silhouette *and* its side
// profile. Straight-on side view reads flat; straight down the barrel reads
// as nothing at all.
const YAW = THREE.MathUtils.degToRad(105);
const PITCH = THREE.MathUtils.degToRad(-9);

const cache = new Map();
let renderer = null;
let scene = null;
let camera = null;
let holder = null;

function setup() {
  if (renderer) return;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.setClearAlpha(0);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(26, WIDTH / HEIGHT, 0.05, 50);

  // Lit for legibility rather than realism: these models' materials are dark
  // by design (they are meant to be seen against a bright range, lit by the
  // viewmodel's own fill light), and on a card they would otherwise be a
  // black silhouette. Key from the front-left, cool fill opposite it to keep
  // the shadow side readable, and a rim behind to separate the barrel from
  // the card.
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));

  const key = new THREE.DirectionalLight(0xfff4e4, 2.6);
  key.position.set(-1.4, 1.8, 2.4);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xc8d8ff, 1.1);
  fill.position.set(2.2, -0.6, 1.2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 1.8);
  rim.position.set(0.6, 1.2, -2.4);
  scene.add(rim);

  holder = new THREE.Group();
  scene.add(holder);
}

function teardown() {
  if (!renderer) return;
  renderer.dispose();
  renderer.forceContextLoss();
  renderer = null;
  scene = null;
  camera = null;
  holder = null;
}

// Pulls the camera back until the posed model's bounding box fits the frame
// on both axes, rather than trusting a hard-coded distance: the eight models
// normalise to the same barrel length but not to the same bulk, and a
// breacher framed like a sniper would be cropped.
function frame(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const halfFovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const distanceForHeight = size.y / 2 / halfFovTan;
  const distanceForWidth = size.x / 2 / (halfFovTan * camera.aspect);
  const distance = Math.max(distanceForHeight, distanceForWidth) * 1.28 + size.z / 2;

  camera.position.set(center.x, center.y, center.z + distance);
  camera.lookAt(center);
}

async function render(id) {
  const weapon = getWeapon(id);
  const model = await loadWeaponModel(weapon.id);
  if (!model) return null;

  setup();
  const posed = model.object.clone();
  posed.rotation.y += YAW;

  const tilt = new THREE.Group();
  tilt.rotation.x = PITCH;
  tilt.add(posed);

  holder.clear();
  holder.add(tilt);
  holder.updateMatrixWorld(true);

  frame(tilt);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  holder.clear();
  return url;
}

// One weapon's thumbnail as a data: URL, or null if its model is missing —
// callers treat that the same way the viewmodel does, by carrying on without
// a picture rather than failing the screen.
export function getWeaponThumbnail(id) {
  const weapon = getWeapon(id);
  const cached = cache.get(weapon.id);
  if (cached) return cached;

  const promise = render(weapon.id)
    .catch((err) => {
      console.warn(`AimonSite: could not render thumbnail for "${weapon.id}"`, err);
      return null;
    })
    .finally(() => {
      // The renderer exists only to fill this cache. Once every weapon has
      // been through it there is nothing left to draw, so give the context
      // back rather than holding it for the rest of the session.
      if (WEAPON_ORDER.every((weaponId) => cache.has(weaponId))) {
        Promise.all(WEAPON_ORDER.map((weaponId) => cache.get(weaponId))).then(teardown);
      }
    });

  cache.set(weapon.id, promise);
  return promise;
}
