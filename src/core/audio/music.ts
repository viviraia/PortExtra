/**
 * Procedural music: a lookahead step sequencer (setInterval + AudioContext time)
 * driving per-theme pattern functions built from synth primitives.
 */
import type { MusicTheme } from './types';
import { mtof, noise, tone, type ToneOpts } from './synth';

// ---------------------------------------------------------------------------
// Theory helpers
// ---------------------------------------------------------------------------

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  harm: [0, 2, 3, 5, 7, 8, 11],
  phryg: [0, 1, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
} as const;
type Scale = readonly number[];

function deg(root: number, scale: Scale, d: number): number {
  const n = scale.length;
  const o = Math.floor(d / n);
  const i = ((d % n) + n) % n;
  return root + o * 12 + scale[i];
}
function chord(root: number, scale: Scale, d: number, seventh = false): number[] {
  const c = [deg(root, scale, d), deg(root, scale, d + 2), deg(root, scale, d + 4)];
  if (seventh) c.push(deg(root, scale, d + 6));
  return c;
}

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

/** Instrument voices for one theme instance. All output into the theme's fade nodes. */
class Instruments {
  /** Dry bus. */
  readonly dry: GainNode;
  /** Bus with a reverb send (amount set per theme). */
  readonly room: GainNode;
  /** Bus with a heavy reverb send. */
  readonly hall: GainNode;

  constructor(private ctx: BaseAudioContext, out: AudioNode, wetOut: AudioNode) {
    this.dry = ctx.createGain();
    this.room = ctx.createGain();
    this.hall = ctx.createGain();
    this.dry.connect(out);
    this.room.connect(out);
    this.hall.connect(out);
    const rs = ctx.createGain();
    rs.gain.value = 0.35;
    this.room.connect(rs).connect(wetOut);
    const hs = ctx.createGain();
    hs.gain.value = 0.8;
    this.hall.connect(hs).connect(wetOut);
  }

  private t(dest: AudioNode, t: number, o: ToneOpts) {
    tone(this.ctx, dest, t, o);
  }

  pad(notes: number[], t: number, dur: number, o: { type?: OscillatorType; gain?: number; cutoff?: number; attack?: number; release?: number } = {}) {
    const g = (o.gain ?? 0.04) / Math.sqrt(notes.length);
    const attack = o.attack ?? Math.min(0.6, dur * 0.4);
    const release = o.release ?? 0.8;
    for (const m of notes) {
      for (const det of [-7, 7]) {
        this.t(this.hall, t, {
          type: o.type ?? 'sawtooth', freq: mtof(m), detune: det, dur: dur + release, attack, hold: Math.max(0, dur - attack),
          gain: g, filter: { type: 'lowpass', freq: o.cutoff ?? 900, Q: 0.5 },
        });
      }
    }
  }

  organ(notes: number[], t: number, dur: number, gain = 0.05) {
    const g = gain / Math.sqrt(notes.length);
    const partials: [number, number][] = [[1, 0.55], [2, 0.3], [3, 0.12], [4, 0.1], [0.5, 0.25]];
    for (const m of notes) {
      const f = mtof(m);
      for (const [mul, amp] of partials) {
        this.t(this.hall, t, { type: 'sine', freq: f * mul, dur: dur + 0.5, attack: 0.08, hold: Math.max(0, dur - 0.08), gain: g * amp, vibrato: { rate: 5.6, depth: 5 } });
      }
    }
  }

  bass(m: number, t: number, dur: number, o: { type?: OscillatorType; gain?: number; cutoff?: number } = {}) {
    const f = mtof(m);
    const c = o.cutoff ?? 500;
    this.t(this.dry, t, { type: o.type ?? 'sawtooth', freq: f, dur: dur, attack: 0.005, hold: dur * 0.5, gain: o.gain ?? 0.12, filter: { type: 'lowpass', freq: c * 3, freqEnd: c, sweepTime: Math.min(0.2, dur), Q: 2 } });
    this.t(this.dry, t, { type: 'sine', freq: f, dur: dur, attack: 0.005, hold: dur * 0.5, gain: (o.gain ?? 0.12) * 0.8 });
  }

  pluck(m: number, t: number, dur: number, gain = 0.08, bus: 'room' | 'hall' = 'room') {
    const f = mtof(m);
    const dest = bus === 'room' ? this.room : this.hall;
    this.t(dest, t, { type: 'triangle', freq: f, dur, gain, filter: { type: 'lowpass', freq: 3500, freqEnd: 900 } });
    this.t(dest, t, { type: 'sine', freq: f * 2, dur: dur * 0.5, gain: gain * 0.35 });
  }

  bell(m: number, t: number, dur: number, gain = 0.06) {
    const f = mtof(m);
    this.t(this.hall, t, { type: 'sine', freq: f, dur, gain });
    this.t(this.hall, t, { type: 'sine', freq: f * 4, dur: dur * 0.3, gain: gain * 0.25 });
    this.t(this.hall, t, { type: 'sine', freq: f * 2.76, dur: dur * 0.5, gain: gain * 0.15 });
  }

  /** Low funeral bell / toll. */
  toll(m: number, t: number, gain = 0.08) {
    const f = mtof(m);
    const parts: [number, number, number][] = [[0.5, 1, 4], [1, 0.8, 3], [2.4, 0.35, 2], [3, 0.25, 1.5], [4.2, 0.15, 1]];
    for (const [mul, a, d] of parts) this.t(this.hall, t, { type: 'sine', freq: f * mul, dur: d, gain: gain * a });
  }

  lead(m: number, t: number, dur: number, o: { type?: OscillatorType; gain?: number; cutoff?: number; vib?: number; bus?: 'room' | 'hall' } = {}) {
    const dest = o.bus === 'hall' ? this.hall : this.room;
    this.t(dest, t, {
      type: o.type ?? 'square', freq: mtof(m), dur: dur + 0.15, attack: 0.02, hold: dur * 0.6, gain: o.gain ?? 0.05,
      vibrato: o.vib ? { rate: 5, depth: o.vib } : undefined, filter: { type: 'lowpass', freq: o.cutoff ?? 1800, Q: 1 },
    });
  }

  flute(m: number, t: number, dur: number, gain = 0.05) {
    this.t(this.hall, t, { type: 'sine', freq: mtof(m), dur: dur + 0.2, attack: 0.08, hold: dur * 0.6, gain, vibrato: { rate: 5, depth: 12 } });
    noise(this.ctx, this.hall, t, { dur: dur * 0.8, attack: 0.05, gain: gain * 0.15, filter: { type: 'bandpass', freq: mtof(m) * 2, Q: 6 } });
  }

  kick(t: number, gain = 0.5) {
    this.t(this.dry, t, { type: 'sine', freq: 150, freqEnd: 42, sweepTime: 0.12, dur: 0.3, gain });
    noise(this.ctx, this.dry, t, { dur: 0.02, gain: gain * 0.25, filter: { type: 'lowpass', freq: 3000 } });
  }

  snare(t: number, gain = 0.22) {
    noise(this.ctx, this.room, t, { dur: 0.18, gain, filter: { type: 'bandpass', freq: 2200, Q: 0.8 } });
    this.t(this.room, t, { type: 'triangle', freq: 220, freqEnd: 160, dur: 0.1, gain: gain * 0.6 });
  }

  hat(t: number, gain = 0.06, open = false) {
    noise(this.ctx, this.dry, t, { dur: open ? 0.22 : 0.04, gain, filter: { type: 'highpass', freq: 7000 } });
  }

  shaker(t: number, gain = 0.04) {
    noise(this.ctx, this.room, t, { dur: 0.07, attack: 0.02, gain, filter: { type: 'bandpass', freq: 6000, Q: 1.5 } });
  }

  tom(m: number, t: number, gain = 0.3) {
    const f = mtof(m);
    this.t(this.room, t, { type: 'sine', freq: f * 1.5, freqEnd: f, sweepTime: 0.1, dur: 0.35, gain });
  }

  timpani(m: number, t: number, gain = 0.35) {
    const f = mtof(m);
    this.t(this.hall, t, { type: 'sine', freq: f * 1.08, freqEnd: f, sweepTime: 0.05, dur: 1.1, gain });
    this.t(this.hall, t, { type: 'triangle', freq: f * 1.5, dur: 0.5, gain: gain * 0.2 });
    noise(this.ctx, this.hall, t, { dur: 0.25, gain: gain * 0.2, filter: { type: 'lowpass', freq: 600 } });
  }

  /** Water drip: short high sine with fast downward pitch blip. */
  drip(m: number, t: number, gain = 0.05) {
    const f = mtof(m);
    this.t(this.hall, t, { type: 'sine', freq: f * 1.6, freqEnd: f, sweepTime: 0.03, dur: 0.18, gain });
  }

  /** Metallic chain clank. */
  clank(t: number, gain = 0.07) {
    noise(this.ctx, this.hall, t, { dur: 0.12, gain, filter: { type: 'bandpass', freq: 3200, Q: 8 } });
    this.t(this.hall, t, { type: 'square', freq: 1870, dur: 0.08, gain: gain * 0.2, filter: { type: 'bandpass', freq: 1900, Q: 4 } });
  }

  wind(t: number, dur: number, gain = 0.06) {
    noise(this.ctx, this.hall, t, { color: 'pink', dur, attack: dur * 0.4, hold: dur * 0.1, gain, filter: { type: 'bandpass', freq: 300, freqEnd: 1400, sweepTime: dur * 0.6, Q: 3 } });
  }

  tick(t: number, gain = 0.05) {
    noise(this.ctx, this.room, t, { dur: 0.015, gain, filter: { type: 'bandpass', freq: 4000, Q: 4 } });
  }
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

interface StepInfo {
  /** Scheduled time of this 16th step. */
  t: number;
  /** Step within bar 0..15. */
  s: number;
  /** Bar within the loop. */
  bar: number;
  /** Loop iteration count. */
  loop: number;
  /** Duration of one 16th step in seconds. */
  sd: number;
  /** Seeded RNG for this loop iteration. */
  r: () => number;
  I: Instruments;
}

interface Theme {
  bpm: number;
  bars: number;
  loop: boolean;
  gain: number;
  step(x: StepInfo): void;
}

type Motif = [bar: number, step: number, degree: number, lenSteps: number][];

/** Play a motif with light per-loop variation (neighbour tones, rests). */
function motifAt(x: StepInfo, motif: Motif, play: (degree: number, lenSec: number) => void, vary = 0.15) {
  for (const [b, st, d, len] of motif) {
    if (b === x.bar && st === x.s) {
      if (x.loop > 0 && x.r() < vary * 0.4) return; // occasional rest
      let dd = d;
      if (x.loop > 0 && x.r() < vary) dd += x.r() < 0.5 ? 1 : -1;
      play(dd, len * x.sd);
    }
  }
}

const THEMES: Record<MusicTheme, Theme> = {
  // Sombre, slow. D minor.
  title: (() => {
    const root = 50, sc = SCALES.minor;
    const prog = [0, 5, 2, 6, 0, 3, 4, 4];
    const melody: Motif = [[0, 0, 7, 8], [0, 8, 9, 8], [1, 0, 10, 12], [2, 0, 9, 8], [2, 8, 7, 8], [3, 0, 8, 16],
      [4, 0, 7, 8], [4, 8, 11, 8], [5, 0, 10, 8], [5, 8, 9, 8], [6, 0, 8, 12], [7, 0, 6, 16]];
    return {
      bpm: 62, bars: 8, loop: true, gain: 0.9,
      step(x) {
        const d = prog[x.bar];
        if (x.s === 0) {
          x.I.pad(chord(root, sc, d), x.t, 16 * x.sd, { gain: 0.05, cutoff: 700, attack: 1.2 });
          x.I.bass(deg(root - 12, sc, d), x.t, 14 * x.sd, { type: 'triangle', gain: 0.1, cutoff: 300 });
          if (x.bar % 4 === 0) x.I.timpani(deg(root - 12, sc, d), x.t, 0.2);
        }
        if (x.s === 8 && x.r() < 0.3) x.I.bell(deg(root + 12, sc, d + 4), x.t, 2.5, 0.025);
        motifAt(x, melody, (dd, len) => x.I.flute(deg(root, sc, dd), x.t, len, 0.045));
      },
    };
  })(),

  // Warm, calm. F major.
  sanctum: (() => {
    const root = 53, sc = SCALES.major;
    const prog = [0, 5, 3, 4];
    const arpShape = [0, 1, 2, 3, 2, 1, 0, 1];
    const melody: Motif = [[0, 0, 9, 6], [0, 6, 8, 2], [0, 8, 7, 8], [1, 0, 5, 8], [1, 8, 7, 8], [2, 0, 8, 6], [2, 6, 9, 2], [2, 8, 10, 8], [3, 0, 8, 16]];
    return {
      bpm: 78, bars: 4, loop: true, gain: 0.85,
      step(x) {
        const d = prog[x.bar];
        const c = chord(root, sc, d, true);
        if (x.s === 0) {
          x.I.pad(chord(root, sc, d), x.t, 16 * x.sd, { type: 'triangle', gain: 0.06, cutoff: 1400, attack: 0.5 });
          x.I.bass(deg(root - 12, sc, d), x.t, 8 * x.sd, { type: 'triangle', gain: 0.1, cutoff: 400 });
        }
        if (x.s === 8) x.I.bass(deg(root - 12, sc, d + 4), x.t, 6 * x.sd, { type: 'triangle', gain: 0.07, cutoff: 400 });
        if (x.s % 2 === 0) {
          const idx = arpShape[(x.s / 2) % arpShape.length];
          const m = c[idx % c.length] + 12;
          x.I.pluck(m, x.t, 0.8, 0.045);
        }
        if (x.s % 4 === 2 && x.r() < 0.7) x.I.shaker(x.t, 0.025);
        if (x.loop % 2 === 1) motifAt(x, melody, (dd, len) => x.I.flute(deg(root + 12, sc, dd - 7), x.t, len, 0.04));
      },
    };
  })(),

  // Dark minor, dripping percussive. C phrygian.
  cells: (() => {
    const root = 48, sc = SCALES.phryg;
    const prog = [0, 1, 0, 6, 0, 1, 3, 6];
    const motif: Motif = [[1, 0, 4, 4], [1, 4, 3, 4], [1, 8, 1, 8], [5, 0, 4, 4], [5, 4, 5, 4], [5, 8, 1, 4], [5, 12, 0, 4]];
    return {
      bpm: 92, bars: 8, loop: true, gain: 0.9,
      step(x) {
        const d = prog[x.bar];
        if (x.s === 0) x.I.pad(chord(root - 12, sc, d), x.t, 16 * x.sd, { gain: 0.045, cutoff: 420, attack: 0.9 });
        // Pulsing low bass on 8ths, accent on downbeats.
        if (x.s % 2 === 0) x.I.bass(deg(root - 24, sc, d), x.t, 1.6 * x.sd, { gain: x.s % 8 === 0 ? 0.13 : 0.07, cutoff: 220 });
        if (x.s === 0 || x.s === 10) x.I.kick(x.t, 0.35);
        if (x.s === 12 && (x.bar % 2 === 1 || x.r() < 0.3)) x.I.clank(x.t, 0.06);
        if (x.s % 4 === 2) x.I.tick(x.t, 0.03);
        // Drips: random pentatonic-ish high notes.
        if (x.r() < 0.09) x.I.drip(deg(root + 24, sc, [0, 2, 4, 5][Math.floor(x.r() * 4)]), x.t, 0.035);
        motifAt(x, motif, (dd, len) => x.I.pluck(deg(root, sc, dd), x.t, len * 1.5, 0.06, 'hall'), 0.25);
      },
    };
  })(),

  // Windy, driving, martial drums. A dorian.
  ramparts: (() => {
    const root = 45, sc = SCALES.dorian;
    const prog = [0, 5, 6, 0, 3, 5, 6, 4];
    const motif: Motif = [[0, 0, 7, 6], [0, 6, 8, 2], [0, 8, 9, 4], [0, 12, 11, 4], [1, 0, 9, 12], [2, 0, 10, 6], [2, 6, 9, 2], [2, 8, 8, 8], [3, 0, 7, 16],
      [4, 0, 10, 6], [4, 6, 11, 2], [4, 8, 12, 8], [5, 0, 11, 8], [5, 8, 9, 8], [6, 0, 10, 8], [6, 8, 8, 8], [7, 0, 11, 16]];
    const snarePat = [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1];
    return {
      bpm: 124, bars: 8, loop: true, gain: 0.8,
      step(x) {
        const d = prog[x.bar];
        if (x.s === 0) {
          x.I.pad(chord(root, sc, d), x.t, 16 * x.sd, { gain: 0.04, cutoff: 1100, attack: 0.3 });
          x.I.timpani(deg(root - 12, sc, d), x.t, 0.28);
          if (x.bar % 2 === 0) x.I.wind(x.t, 32 * x.sd, 0.05);
        }
        if (x.s % 2 === 0) x.I.bass(deg(root - 12, sc, d), x.t, 1.5 * x.sd, { gain: 0.09, cutoff: 450, type: 'square' });
        if (x.s === 0 || x.s === 8) x.I.kick(x.t, 0.38);
        if (snarePat[x.s]) x.I.snare(x.t, x.s === 4 || x.s === 12 ? 0.17 : 0.07);
        // Snare roll fill on the last bar.
        if (x.bar === 7 && x.s >= 8) x.I.snare(x.t, 0.04 + (x.s - 8) * 0.012);
        if (x.s % 2 === 1 && x.r() < 0.5) x.I.hat(x.t, 0.03);
        motifAt(x, motif, (dd, len) => x.I.lead(deg(root, sc, dd), x.t, len, { type: 'sawtooth', gain: 0.04, cutoff: 1600, vib: 8 }));
      },
    };
  })(),

  // Mysterious, celesta/harp-like arps. A harmonic minor.
  library: (() => {
    const root = 57, sc = SCALES.harm;
    const prog = [0, 3, 4, 0, 5, 3, 1, 4];
    const patterns = [
      [0, 2, 4, 7, 4, 2, 0, 2],
      [0, 4, 2, 7, 2, 4, 0, 4],
      [7, 4, 2, 0, 2, 4, 7, 9],
      [0, 2, 4, 6, 7, 6, 4, 2],
    ];
    let pat = patterns[0];
    return {
      bpm: 96, bars: 8, loop: true, gain: 0.85,
      step(x) {
        const d = prog[x.bar];
        if (x.s === 0) {
          pat = patterns[Math.floor(x.r() * patterns.length)];
          x.I.pad(chord(root - 12, sc, d), x.t, 16 * x.sd, { type: 'triangle', gain: 0.05, cutoff: 900, attack: 1 });
          x.I.bass(deg(root - 24, sc, d), x.t, 12 * x.sd, { type: 'sine', gain: 0.1, cutoff: 300 });
        }
        if (x.s % 2 === 0) {
          const p = pat[(x.s / 2) % pat.length];
          x.I.bell(deg(root + 12, sc, d + p), x.t, 1.0, 0.03);
        }
        if (x.s % 4 === 0) x.I.tick(x.t, x.s === 0 ? 0.05 : 0.025);
        if ((x.s === 6 || x.s === 14) && x.r() < 0.4) x.I.pluck(deg(root, sc, d + 4), x.t, 1.2, 0.04, 'hall');
        if (x.bar % 4 === 3 && x.s === 0) x.I.toll(deg(root - 12, sc, d), x.t, 0.03);
      },
    };
  })(),

  // Grand, organ pads, tense. D harmonic minor.
  throne: (() => {
    const root = 50, sc = SCALES.harm;
    const prog = [0, 5, 3, 4, 0, 5, 1, 4];
    const motif: Motif = [[0, 0, 7, 8], [0, 8, 6, 4], [0, 12, 7, 4], [1, 0, 9, 16], [2, 0, 8, 8], [2, 8, 7, 8], [3, 0, 6, 16],
      [4, 0, 7, 8], [4, 8, 9, 8], [5, 0, 10, 8], [5, 8, 9, 8], [6, 0, 8, 8], [6, 8, 7, 8], [7, 0, 6, 16]];
    return {
      bpm: 74, bars: 8, loop: true, gain: 0.85,
      step(x) {
        const d = prog[x.bar];
        if (x.s === 0) {
          x.I.organ(chord(root - 12, sc, d, x.bar % 2 === 1), x.t, 16 * x.sd, 0.06);
          x.I.timpani(deg(root - 24, sc, d), x.t, 0.32);
        }
        if (x.s === 8) x.I.timpani(deg(root - 24, sc, d + 4), x.t, 0.16);
        // Tense ostinato: tonic / fifth 8ths.
        if (x.s % 2 === 0) x.I.pluck(deg(root - 12, sc, d + (x.s % 4 === 0 ? 0 : 4)), x.t, 0.4, 0.04);
        if (x.s % 4 === 0) x.I.bass(deg(root - 24, sc, d), x.t, 3.5 * x.sd, { gain: 0.08, cutoff: 260 });
        if (x.loop % 2 === 1 || x.bar >= 4) motifAt(x, motif, (dd, len) => x.I.lead(deg(root, sc, dd), x.t, len, { type: 'sawtooth', gain: 0.035, cutoff: 1200, vib: 10, bus: 'hall' }), 0.12);
      },
    };
  })(),

  // Fast intense drums + bass ostinato. E phrygian.
  boss: (() => {
    const root = 40;
    const ost = [0, 0, 12, 0, 1, 0, 12, 0, 0, 0, 10, 0, 1, 0, 7, 0];
    const shifts = [0, 0, 1, -2, 0, 0, 3, 1];
    const stabs = [0, 3, 6, 10, 14];
    const motif: Motif = [[0, 0, 7, 4], [0, 4, 8, 4], [0, 8, 7, 2], [0, 10, 5, 6], [1, 0, 3, 8], [1, 8, 1, 8],
      [4, 0, 12, 4], [4, 4, 13, 4], [4, 8, 12, 2], [4, 10, 10, 6], [5, 0, 8, 8], [5, 8, 7, 8]];
    return {
      bpm: 152, bars: 8, loop: true, gain: 0.75,
      step(x) {
        const sh = shifts[x.bar];
        x.I.bass(root - 12 + sh + ost[x.s], x.t, 0.9 * x.sd, { gain: 0.11, cutoff: 600 + (x.s % 4 === 0 ? 400 : 0) });
        if (x.s % 4 === 0) x.I.kick(x.t, 0.45);
        if (x.s === 14 && x.r() < 0.5) x.I.kick(x.t, 0.3);
        if (x.s === 4 || x.s === 12) x.I.snare(x.t, 0.2);
        x.I.hat(x.t, x.s % 2 === 0 ? 0.04 : 0.02, x.s === 14);
        if (x.bar % 2 === 1 && stabs.includes(x.s)) {
          for (const iv of [0, 7, 12]) x.I.lead(root + 12 + sh + iv, x.t, 1.5 * x.sd, { type: 'sawtooth', gain: 0.03, cutoff: 2200 });
        }
        if (x.bar === 7 && x.s >= 12) x.I.tom(root + 12 - (x.s - 12) * 3, x.t, 0.25);
        motifAt(x, motif, (dd, len) => x.I.lead(deg(root + 12, SCALES.phryg, dd) + sh, x.t, len, { type: 'square', gain: 0.035, cutoff: 2400, vib: 6 }), 0.2);
      },
    };
  })(),

  // Short dirge. C minor, plays once.
  death: (() => {
    const root = 48, sc = SCALES.minor;
    const prog = [0, 3, 5, 0];
    const line: Motif = [[0, 0, 7, 8], [0, 8, 6, 8], [1, 0, 5, 8], [1, 8, 3, 8], [2, 0, 4, 8], [2, 8, 2, 8], [3, 0, 0, 16]];
    return {
      bpm: 58, bars: 4, loop: false, gain: 0.9,
      step(x) {
        const d = prog[x.bar];
        if (x.s === 0) {
          x.I.pad(chord(root - 12, sc, d), x.t, (x.bar === 3 ? 28 : 16) * x.sd, { gain: 0.05, cutoff: 600, attack: 0.4, release: 2 });
          x.I.toll(deg(root - 12, sc, d), x.t, 0.07);
        }
        motifAt(x, line, (dd, len) => x.I.lead(deg(root, sc, dd), x.t, len, { type: 'triangle', gain: 0.06, cutoff: 1500, vib: 10, bus: 'hall' }), 0);
      },
    };
  })(),
};

export const MUSIC_THEMES = Object.keys(THEMES) as MusicTheme[];

// ---------------------------------------------------------------------------
// Sequencer
// ---------------------------------------------------------------------------

const LOOKAHEAD = 0.15; // seconds scheduled ahead
const INTERVAL_MS = 25;
const FADE = 1.0;

class Sequencer {
  readonly fade: GainNode;
  readonly fadeWet: GainNode;
  private I: Instruments;
  private nextTime: number;
  private stepIndex = 0;
  private rng: () => number = () => 0;
  private rngLoop = -1;
  finished = false;
  stopAt = Infinity;

  constructor(private ctx: BaseAudioContext, readonly name: MusicTheme, private theme: Theme, out: AudioNode, wetOut: AudioNode, startAt: number) {
    this.fade = ctx.createGain();
    this.fadeWet = ctx.createGain();
    this.fade.connect(out);
    this.fadeWet.connect(wetOut);
    const target = theme.gain;
    for (const g of [this.fade, this.fadeWet]) {
      g.gain.setValueAtTime(0.0001, startAt);
      g.gain.linearRampToValueAtTime(target, startAt + FADE);
    }
    this.I = new Instruments(ctx, this.fade, this.fadeWet);
    this.nextTime = startAt + 0.05;
  }

  get sd(): number {
    return 60 / this.theme.bpm / 4;
  }

  fadeOut(at: number) {
    for (const g of [this.fade, this.fadeWet]) {
      g.gain.cancelScheduledValues(at);
      g.gain.setValueAtTime(g.gain.value, at);
      g.gain.linearRampToValueAtTime(0.0001, at + FADE);
    }
    this.stopAt = at + FADE;
  }

  /** Schedule all steps up to `until`. Returns false when the sequencer is done. */
  pump(until: number): boolean {
    const now = this.ctx.currentTime;
    if (now >= this.stopAt + 0.1) {
      this.dispose();
      return false;
    }
    // If the tab was throttled, skip missed steps rather than bursting them.
    while (this.nextTime < now - 0.05) {
      this.nextTime += this.sd;
      this.stepIndex++;
    }
    while (!this.finished && this.nextTime < until && this.nextTime < this.stopAt) {
      const bar = Math.floor(this.stepIndex / 16);
      const loop = Math.floor(bar / this.theme.bars);
      if (!this.theme.loop && loop > 0) {
        this.finished = true;
        // Let tails ring, then dispose.
        this.stopAt = Math.min(this.stopAt, this.nextTime + 4);
        break;
      }
      if (loop !== this.rngLoop) {
        this.rngLoop = loop;
        this.rng = mulberry(0x51f3 + loop * 7919 + this.name.length * 131 + this.name.charCodeAt(0));
      }
      try {
        this.theme.step({ t: this.nextTime, s: this.stepIndex % 16, bar: bar % this.theme.bars, loop, sd: this.sd, r: this.rng, I: this.I });
      } catch {
        /* never let a theme bug kill the scheduler */
      }
      this.nextTime += this.sd;
      this.stepIndex++;
    }
    return true;
  }

  dispose() {
    try {
      this.fade.disconnect();
      this.fadeWet.disconnect();
    } catch {
      /* ignore */
    }
  }
}

export class MusicPlayer {
  private current: Sequencer | null = null;
  private fading: Sequencer[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly verb: ConvolverNode;

  constructor(private ctx: BaseAudioContext, private out: AudioNode, impulse: AudioBuffer) {
    this.verb = ctx.createConvolver();
    this.verb.buffer = impulse;
    const vg = ctx.createGain();
    vg.gain.value = 0.5;
    this.verb.connect(vg).connect(out);
  }

  get theme(): MusicTheme | null {
    return this.current?.name ?? null;
  }

  play(name: MusicTheme | null): void {
    if (name === this.theme && this.current && !this.current.finished) return;
    const now = this.ctx.currentTime;
    if (this.current) {
      this.current.fadeOut(now);
      this.fading.push(this.current);
      this.current = null;
    }
    if (name) {
      const theme = THEMES[name];
      if (theme) this.current = new Sequencer(this.ctx, name, theme, this.out, this.verb, now);
    }
    this.ensureTimer();
    this.pump();
  }

  /** Schedule ahead; exposed for offline rendering in tests. */
  pump(lookahead = LOOKAHEAD): void {
    const until = this.ctx.currentTime + lookahead;
    if (this.current && !this.current.pump(until)) this.current = null;
    this.fading = this.fading.filter((s) => s.pump(until));
    if (!this.current && this.fading.length === 0) this.stopTimer();
  }

  private ensureTimer() {
    if (this.timer === null && typeof setInterval === 'function') {
      this.timer = setInterval(() => this.pump(), INTERVAL_MS);
    }
  }

  private stopTimer() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
