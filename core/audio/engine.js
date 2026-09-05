// The shared WebAudio graph: one context, one output stage, and the two
// primitives (a tone, a filtered noise burst) that every sound in the app is
// built from. No audio asset files — everything is synthesized, which keeps
// the project dependency-free and means a weapon's voice is data in
// weapons.js rather than eight .wav files to ship and cache.
//
// The graph is three buses into one limited master:
//
//   busUi    -> master        clicks, chimes, menu blips: clean, no colour
//   <shot>   -> master        gunfire, via its own saturator (see gunshot.js)
//   busVerb  -> convolver -> master   the room, shared by everything
//
// Two things here do most of the work in making gunfire sound like gunfire
// rather than like a synthesizer:
//
//   Limiting. Real recorded gunshots are heavily compressed, and that is a
//   large part of why they read as *loud* rather than merely large. The
//   master compressor also stops an SMG's ~16 shots a second from summing
//   into clipping.
//
//   Convolution reverb. A gunshot heard anywhere real is mostly the room
//   answering it. Without a tail, a synthesized shot sounds like it happened
//   in an anechoic chamber — which is exactly the "fake" quality a dry
//   oscillator burst has. The impulse response below is generated, not
//   loaded, so it costs no download.

let audioCtx = null;
let master = null;
let busUi = null;
let busVerb = null;
let soundEnabled = true;

export function setSoundEnabled(enabled) {
  soundEnabled = enabled;
}

export function isSoundEnabled() {
  return soundEnabled;
}

// A one-pole-darkened noise decay with a handful of discrete early
// reflections in front of it. The early slaps are what make it read as a
// room (an indoor range) instead of a smooth reverb wash, and the falling
// lowpass coefficient mimics air and surfaces absorbing highs faster than
// lows — the reason a distant gunshot is a boom and a close one is a crack.
function makeImpulseResponse(ctx, seconds) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let lowpass = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const decay = (1 - t) ** 2.6;
      const coefficient = 0.36 - 0.31 * t;
      lowpass += coefficient * ((Math.random() * 2 - 1) * decay - lowpass);
      data[i] = lowpass * 2.8;
    }
    // Offsetting one channel's reflections decorrelates the two, which is
    // what gives the tail width instead of a mono blob in the middle.
    const skew = channel === 0 ? 0 : 41;
    for (const [ms, amplitude] of [
      [6, 0.85],
      [13, 0.62],
      [21, 0.5],
      [31, 0.4],
      [44, 0.3],
      [61, 0.22],
    ]) {
      const index = Math.floor((ms / 1000) * rate) + skew;
      if (index < length) data[index] += amplitude * (Math.random() < 0.5 ? -1 : 1);
    }
  }
  return buffer;
}

function buildGraph(ctx) {
  master = ctx.createGain();
  master.gain.value = 0.9;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 8;
  limiter.ratio.value = 8;
  // Slow enough to let each shot's transient through before it clamps —
  // a faster attack flattens the snap that makes a shot sound close.
  limiter.attack.value = 0.003;
  limiter.release.value = 0.22;
  master.connect(limiter).connect(ctx.destination);

  busUi = ctx.createGain();
  busUi.connect(master);

  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulseResponse(ctx, 1.15);
  const wet = ctx.createGain();
  wet.gain.value = 0.95;
  busVerb = ctx.createGain();
  busVerb.connect(convolver).connect(wet).connect(master);
}

export function getAudioContext() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    buildGraph(audioCtx);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

export function getUiBus() {
  return busUi;
}

export function getReverbBus() {
  return busVerb;
}

export function getMasterBus() {
  return master;
}

// Random multiplier around 1 — the per-event jitter that stops repeated
// sounds from being bit-identical. A session is hundreds of shots, and one
// identical sample on repeat is the fastest way to make a range feel cheap.
export function vary(amount) {
  return 1 + (Math.random() * 2 - 1) * amount;
}

// tanh soft-clip. Cached per drive amount because the curve is 2048 floats
// and there are only ever a handful of distinct drives (one per weapon).
const curveCache = new Map();
export function saturationCurve(drive) {
  const key = drive.toFixed(2);
  const cached = curveCache.get(key);
  if (cached) return cached;
  const k = 1 + drive * 6;
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  curveCache.set(key, curve);
  return curve;
}

// One second of static, generated once per context and re-sliced (via a
// fresh BufferSource each time) for every burst — cheaper than regenerating
// random samples on every trigger pull.
let noiseBuffer = null;
function getNoiseBuffer(ctx) {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

// Schedules one oscillator against the context's own timeline (rather than
// wall-clock setTimeout) so multi-note sequences stay tightly spaced
// regardless of browser timer throttling.
export function scheduleTone(ctx, startTime, freq, durationMs, peakGain, options = {}) {
  const { freqEnd = null, type = "sine", dest = null, send = 0, attack = 0.004 } = options;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  const durationSec = durationMs / 1000;

  if (freqEnd != null) {
    osc.frequency.setValueAtTime(freq, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), startTime + durationSec);
  } else {
    osc.frequency.value = freq;
  }

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  osc.connect(gain);
  route(ctx, gain, dest, send);
  osc.start(startTime);
  osc.stop(startTime + durationSec + 0.02);
}

// A filtered noise burst — the "crack"/"hiss" half of most of these sounds.
// `freqEnd` sweeps the cutoff over the burst, which is what turns a flat
// hiss into a gunshot's report collapsing into the room.
export function scheduleNoise(ctx, startTime, durationMs, peakGain, options = {}) {
  const { type = "lowpass", freq = 3000, freqEnd = null, q = 0.7, dest = null, send = 0, attack = 0.0012 } = options;
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);
  // Starting at a random point in the shared buffer means two shots a frame
  // apart don't play the identical waveform.
  const offset = Math.random() * 0.5;

  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  const gain = ctx.createGain();
  const durationSec = durationMs / 1000;

  if (freqEnd != null) {
    filter.frequency.setValueAtTime(freq, startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), startTime + durationSec);
  } else {
    filter.frequency.value = freq;
  }

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  source.connect(filter).connect(gain);
  route(ctx, gain, dest, send);
  source.start(startTime, offset);
  source.stop(startTime + durationSec + 0.02);
}

// Sends a finished layer to its bus, plus an optional parallel tap into the
// room. The tap is a separate gain rather than a shared send level so a
// weapon can put its low tail deep into the room while keeping its transient
// dry and close.
function route(ctx, node, dest, send) {
  node.connect(dest ?? busUi);
  if (send > 0 && busVerb) {
    const tap = ctx.createGain();
    tap.gain.value = send;
    node.connect(tap).connect(busVerb);
  }
}
