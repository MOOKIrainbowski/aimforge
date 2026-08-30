import * as THREE from "three";

const BURST_LIFETIME_MS = 520;
const FLASH_LIFETIME_MS = 190;
const BASE_PARTICLE_COUNT = 16;
// Longer streaks read as more "energetic" kills without the burst becoming
// unreadable — capped well below what'd start hurting frame time.
const STREAK_BONUS_CAP = 18;

// Shard size in world units at the target. The old burst used 0.06–0.11,
// which at range read as a faint sparkle rather than a target coming apart;
// these are large enough to register in peripheral vision on a fast flick,
// which is the point of a kill confirmation.
const SHARD_MIN_SCALE = 0.15;
const SHARD_SCALE_RANGE = 0.13;
// The one-off flash is sized off the target so a big Easy-mode sphere pops
// proportionally harder than a small Hard-mode one.
const FLASH_RADIUS_MULT = 4.2;
const GRAVITY = -2.6;

let sharedTexture = null;
function getSpriteTexture() {
  if (sharedTexture) return sharedTexture;
  // A small radial-gradient dot baked into a canvas texture once and reused
  // by every particle — no image asset to fetch, keeps this dependency-free
  // like the rest of the project's procedural visuals.
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  sharedTexture = new THREE.CanvasTexture(canvas);
  return sharedTexture;
}

// Active particles across all bursts, flat for a cheap single-pass update.
const active = [];

const _color = new THREE.Color();
const _hot = new THREE.Color();

function makeSprite(color, opacity) {
  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getSpriteTexture(),
      color,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity,
    })
  );
}

// `color` is the destroyed target's own colour, so the burst reads as that
// target coming apart rather than as a generic white sparkle — which also
// keeps the effect legible now that target colour is configurable
// independently of the crosshair.
export function spawnKillBurst(scene, position, streak = 0, color = "#ff5c5c", radius = 0.35) {
  if (!position) return;
  const count = BASE_PARTICLE_COUNT + Math.min(streak, STREAK_BONUS_CAP);
  _color.set(color);
  // Shards run from the target's colour toward white-hot at the core, the
  // way a real burst's brightest fragments blow out.
  _hot.copy(_color).lerp(new THREE.Color(0xffffff), 0.65);

  // A single big soft flash at the impact point, gone in ~0.2s — this is
  // what actually sells the "eliminated" moment; the shards are the detail.
  const flash = makeSprite(_hot.getHex(), 0.9);
  flash.position.copy(position);
  flash.scale.setScalar(radius * 1.6);
  scene.add(flash);
  active.push({
    sprite: flash,
    velocity: new THREE.Vector3(),
    bornAt: performance.now(),
    lifetime: FLASH_LIFETIME_MS,
    startScale: radius * 1.6,
    endScale: radius * FLASH_RADIUS_MULT,
    gravity: 0,
  });

  for (let i = 0; i < count; i++) {
    const mix = Math.random();
    const sprite = makeSprite(_color.clone().lerp(_hot, mix).getHex(), 1);
    sprite.position.copy(position);
    const scale = SHARD_MIN_SCALE + Math.random() * SHARD_SCALE_RANGE;
    sprite.scale.setScalar(scale);
    scene.add(sprite);

    // Uniform-ish spherical outward spray, biased slightly toward the
    // camera side so the burst reads clearly rather than mostly vanishing
    // behind the target.
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const speed = 1.6 + Math.random() * 2.4;
    const velocity = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi) * 0.6 + 0.6
    )
      .normalize()
      .multiplyScalar(speed);

    active.push({
      sprite,
      velocity,
      bornAt: performance.now(),
      lifetime: BURST_LIFETIME_MS,
      startScale: scale,
      // Shards shrink as they fly out, which reads as them burning up
      // rather than just dimming in place.
      endScale: scale * 0.35,
      gravity: GRAVITY,
    });
  }
}

export function updateParticles(dt) {
  if (active.length === 0) return;
  const now = performance.now();

  for (let i = active.length - 1; i >= 0; i--) {
    const p = active[i];
    const age = now - p.bornAt;
    if (age >= p.lifetime) {
      p.sprite.parent?.remove(p.sprite);
      p.sprite.material.dispose();
      active.splice(i, 1);
      continue;
    }

    const t = age / p.lifetime;
    p.velocity.y += p.gravity * dt;
    p.sprite.position.addScaledVector(p.velocity, dt);
    p.velocity.multiplyScalar(1 - Math.min(1, dt * 3.4)); // drag
    p.sprite.scale.setScalar(p.startScale + (p.endScale - p.startScale) * t);
    // Squared falloff holds the burst bright through its first moments and
    // then drops it away quickly, instead of a flat linear dim.
    p.sprite.material.opacity = (1 - t) * (1 - t);
  }
}

export function clearParticles() {
  for (const p of active) {
    p.sprite.parent?.remove(p.sprite);
    p.sprite.material.dispose();
  }
  active.length = 0;
}
