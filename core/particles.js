import * as THREE from "three";

const BURST_LIFETIME_MS = 420;
const BASE_PARTICLE_COUNT = 10;
// Longer streaks read as more "energetic" kills without the burst becoming
// unreadable — capped well below what'd start hurting frame time.
const STREAK_BONUS_CAP = 14;
const PARTICLE_COLOR = 0xf2f4f8;

let sharedSprite = null;
function getSpriteMaterial() {
  if (sharedSprite) return sharedSprite;
  // A small radial-gradient dot baked into a canvas texture once and reused
  // by every particle — no image asset to fetch, keeps this dependency-free
  // like the rest of the project's procedural visuals.
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  sharedSprite = new THREE.SpriteMaterial({
    map: texture,
    color: PARTICLE_COLOR,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  return sharedSprite;
}

// Active particles across all bursts, flat for a cheap single-pass update.
const active = [];

export function spawnKillBurst(scene, position, streak = 0) {
  if (!position) return;
  const material = getSpriteMaterial();
  const count = BASE_PARTICLE_COUNT + Math.min(streak, STREAK_BONUS_CAP);

  for (let i = 0; i < count; i++) {
    const sprite = new THREE.Sprite(material.clone());
    sprite.position.copy(position);
    const scale = 0.06 + Math.random() * 0.05;
    sprite.scale.setScalar(scale);
    scene.add(sprite);

    // Uniform-ish spherical outward spray, biased slightly toward the
    // camera side so the burst reads clearly rather than mostly vanishing
    // behind the target.
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const speed = 1.1 + Math.random() * 1.6;
    const velocity = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi) * 0.6 + 0.6
    )
      .normalize()
      .multiplyScalar(speed);

    active.push({ sprite, velocity, bornAt: performance.now() });
  }
}

export function updateParticles(dt) {
  if (active.length === 0) return;
  const now = performance.now();

  for (let i = active.length - 1; i >= 0; i--) {
    const p = active[i];
    const age = now - p.bornAt;
    if (age >= BURST_LIFETIME_MS) {
      p.sprite.parent?.remove(p.sprite);
      p.sprite.material.dispose();
      active.splice(i, 1);
      continue;
    }

    p.sprite.position.addScaledVector(p.velocity, dt);
    p.velocity.multiplyScalar(1 - Math.min(1, dt * 4)); // drag
    p.sprite.material.opacity = 1 - age / BURST_LIFETIME_MS;
  }
}
