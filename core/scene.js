import * as THREE from "three";

// Range dimensions (world units ~= meters).
const ROOM_WIDTH = 20;
const ROOM_DEPTH = 20;
const ROOM_HEIGHT = 6;
const EYE_HEIGHT = 1.6;

const BASE_HEMI_INTENSITY = 1.1;
const BASE_KEY_INTENSITY = 0.9;

export function createRenderer(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatioCap));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = quality.shadows;
  if (quality.shadows) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  if (quality.postProcessing) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
  }
  return renderer;
}

// Desktop-only: a soft procedural environment map (no external HDRI file to
// ship) so target/wall materials pick up realistic reflections instead of
// flat lighting. Dynamically imported by main.js only when quality.envMap is
// on, so the web build never fetches this module.
export async function applyEnvironment(renderer, scene, quality) {
  if (!quality.envMap) return;
  const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
}

export function createCamera(fov = 96) {
  const camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.05, 100);
  camera.position.set(0, EYE_HEIGHT, 0);
  return camera;
}

export function applyFov(camera, fov) {
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

export function buildRange(scene, quality, rangeConfig) {
  // No ceiling and no front wall (the player only ever faces the back
  // wall's targets), so anything visible past the walls — looking up, or
  // back toward spawn — is this background/fog color. Tying it to the
  // wall color keeps that "open" edge reading as a continuation of the
  // room instead of a stray dark void when the room itself is light.
  scene.background = new THREE.Color(rangeConfig.wallColor);
  scene.fog = new THREE.Fog(rangeConfig.wallColor, 15, 35);

  const floorMat = new THREE.MeshStandardMaterial({ color: rangeConfig.floorColor, roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = quality.shadows;
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: rangeConfig.wallColor, roughness: 1 });
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_HEIGHT), wallMat);
  backWall.position.set(0, ROOM_HEIGHT / 2, -ROOM_DEPTH / 2);
  scene.add(backWall);

  const sideWallGeo = new THREE.PlaneGeometry(ROOM_DEPTH, ROOM_HEIGHT);
  const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
  leftWall.position.set(-ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 0);
  leftWall.rotation.y = Math.PI / 2;
  scene.add(leftWall);

  const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
  rightWall.position.set(ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 0);
  rightWall.rotation.y = -Math.PI / 2;
  scene.add(rightWall);

  const hemiLight = new THREE.HemisphereLight(0x8fa5c8, 0x14161b, BASE_HEMI_INTENSITY * rangeConfig.brightness);
  scene.add(hemiLight);
  const keyLight = new THREE.DirectionalLight(0xffffff, BASE_KEY_INTENSITY * rangeConfig.brightness);
  keyLight.position.set(6, 10, 4);
  keyLight.castShadow = quality.shadows;
  scene.add(keyLight);

  const roomBounds = {
    minX: -ROOM_WIDTH / 2 + 0.5,
    maxX: ROOM_WIDTH / 2 - 0.5,
    minZ: -ROOM_DEPTH / 2 + 0.5,
    maxZ: ROOM_DEPTH / 2 - 0.5,
  };

  return { scene, roomBounds, floorMat, wallMat, hemiLight, keyLight };
}

// Live-updates room appearance from rangeConfig without rebuilding the
// scene — called whenever the settings screen changes wall/floor color or
// brightness.
export function applyRangeAppearance(refs, rangeConfig) {
  refs.floorMat.color.set(rangeConfig.floorColor);
  refs.wallMat.color.set(rangeConfig.wallColor);
  refs.scene.background.set(rangeConfig.wallColor);
  refs.scene.fog.color.set(rangeConfig.wallColor);
  refs.hemiLight.intensity = BASE_HEMI_INTENSITY * rangeConfig.brightness;
  refs.keyLight.intensity = BASE_KEY_INTENSITY * rangeConfig.brightness;
}

// The box drills spawn targets inside, positioned against the back wall.
export function getSpawnVolume() {
  return {
    minX: -6,
    maxX: 6,
    minY: 1.0,
    maxY: 3.2,
    z: -ROOM_DEPTH / 2 + 1.5,
  };
}

export const EYE_HEIGHT_CONST = EYE_HEIGHT;
