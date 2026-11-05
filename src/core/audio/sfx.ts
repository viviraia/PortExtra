/**
 * Parametric sound-effect synth. Every SfxName has a preset built from layered
 * oscillators and filtered noise. Includes voice limiting so mass hits don't clip.
 */
import type { SfxName, SfxOptions } from './types';
import { noise, tone, type NoiseOpts, type Source, type ToneOpts } from './synth';

/** Per-voice builder passed to presets. Frequencies are scaled by the voice pitch. */
export class VoiceBuilder {
  sources: Source[] = [];
  end = 0;
  wetAmount = 0;

  constructor(
    private ctx: BaseAudioContext,
    private dest: AudioNode,
    private t0: number,
    readonly pitch: number,
  ) {}

  tone(o: ToneOpts): this {
    const p = this.pitch;
    const r = tone(this.ctx, this.dest, this.t0, {
      ...o,
      freq: o.freq * p,
      freqEnd: o.freqEnd !== undefined ? o.freqEnd * p : undefined,
      filter: o.filter ? { ...o.filter, freq: o.filter.freq * p, freqEnd: o.filter.freqEnd !== undefined ? o.filter.freqEnd * p : undefined } : undefined,
    });
    this.track(r);
    return this;
  }

  noise(o: NoiseOpts): this {
    const p = this.pitch;
    const r = noise(this.ctx, this.dest, this.t0, {
      ...o,
      filter: o.filter ? { ...o.filter, freq: o.filter.freq * p, freqEnd: o.filter.freqEnd !== undefined ? o.filter.freqEnd * p : undefined } : undefined,
    });
    this.track(r);
    return this;
  }

  /** Sequence of short notes (Hz), each `step` seconds apart. */
  arp(freqs: number[], step: number, o: Omit<ToneOpts, 'freq' | 'at'> & { at?: number }): this {
    freqs.forEach((f, i) => this.tone({ ...o, freq: f, at: (o.at ?? 0) + i * step }));
    return this;
  }

  /** Extra reverb send amount for this voice (0..1). */
  wet(a: number): this {
    this.wetAmount = a;
    return this;
  }

  private track(r: { sources: Source[]; end: number }) {
    this.sources.push(...r.sources);
    this.end = Math.max(this.end, r.end);
  }
}

type Preset = (b: VoiceBuilder) => void;

// Note helpers (Hz)
const N = {
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, B5: 987.77,
  C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760, B6: 1975.53, C7: 2093,
};

/** Shared layers for weighty impacts. */
function impact(b: VoiceBuilder, weight: number, bright: number) {
  b.noise({ dur: 0.045, gain: 0.45 * bright, filter: { type: 'highpass', freq: 1800 } })
    .noise({ dur: 0.13, gain: 0.4 * weight, filter: { type: 'lowpass', freq: 2200, freqEnd: 350 } })
    .tone({ type: 'sine', freq: 170, freqEnd: 42, dur: 0.17, gain: 0.6 * weight })
    .tone({ type: 'square', freq: 90, freqEnd: 40, dur: 0.07, gain: 0.12 * weight, filter: { type: 'lowpass', freq: 500 } });
}

function explosionLayers(b: VoiceBuilder, size: number, at = 0) {
  b.noise({ at, dur: 0.07, gain: 0.5, filter: { type: 'highpass', freq: 900 } })
    .noise({ at, color: 'brown', dur: 0.9 * size, attack: 0.005, gain: 0.85, filter: { type: 'lowpass', freq: 3200, freqEnd: 110 } })
    .noise({ at: at + 0.02, color: 'white', dur: 0.5 * size, gain: 0.18, filter: { type: 'bandpass', freq: 900, freqEnd: 200, Q: 0.8 } })
    .tone({ at, type: 'sine', freq: 120, freqEnd: 28, dur: 0.7 * size, gain: 0.75 })
    .tone({ at, type: 'square', freq: 62, freqEnd: 24, dur: 0.45 * size, gain: 0.18, filter: { type: 'lowpass', freq: 300 } });
}

export const PRESETS: Record<SfxName, Preset> = {
  // --- movement ---------------------------------------------------------
  jump: (b) =>
    b.tone({ type: 'triangle', freq: 220, freqEnd: 540, dur: 0.13, gain: 0.22, filter: { type: 'lowpass', freq: 3000 } })
      .noise({ dur: 0.06, gain: 0.08, filter: { type: 'bandpass', freq: 1500, Q: 1.2 } }),
  doubleJump: (b) =>
    b.tone({ type: 'sine', freq: 420, freqEnd: 950, dur: 0.16, gain: 0.18 })
      .tone({ type: 'triangle', at: 0.035, freq: 640, freqEnd: 1300, dur: 0.14, gain: 0.1 })
      .noise({ dur: 0.12, attack: 0.02, gain: 0.08, filter: { type: 'highpass', freq: 3000 } }),
  land: (b) =>
    b.noise({ dur: 0.12, gain: 0.3, filter: { type: 'lowpass', freq: 900, freqEnd: 180 } })
      .tone({ type: 'sine', freq: 95, freqEnd: 45, dur: 0.1, gain: 0.35 }),
  dodge: (b) =>
    b.noise({ dur: 0.24, attack: 0.05, gain: 0.32, filter: { type: 'bandpass', freq: 500, freqEnd: 2600, Q: 1.4 } })
      .tone({ type: 'sine', freq: 300, freqEnd: 140, dur: 0.15, gain: 0.06 }),
  step: (b) =>
    b.noise({ dur: 0.04, gain: 0.1, filter: { type: 'bandpass', freq: 1200, Q: 2 } })
      .tone({ type: 'sine', freq: 120, freqEnd: 70, dur: 0.045, gain: 0.1 }),

  // --- player attacks -----------------------------------------------------
  swing: (b) =>
    b.noise({ dur: 0.15, attack: 0.025, gain: 0.38, filter: { type: 'bandpass', freq: 800, freqEnd: 3600, Q: 1.1 } })
      .tone({ type: 'sine', freq: 260, freqEnd: 160, dur: 0.1, gain: 0.05 }),
  swingHeavy: (b) =>
    b.noise({ dur: 0.3, attack: 0.08, gain: 0.48, filter: { type: 'bandpass', freq: 350, freqEnd: 1700, Q: 1 } })
      .tone({ type: 'sine', freq: 115, freqEnd: 58, dur: 0.26, attack: 0.04, gain: 0.22 }),
  stab: (b) =>
    b.noise({ dur: 0.075, gain: 0.3, filter: { type: 'highpass', freq: 2000 } })
      .noise({ dur: 0.09, attack: 0.01, gain: 0.2, filter: { type: 'bandpass', freq: 1200, freqEnd: 3000, Q: 2 } })
      .tone({ type: 'triangle', freq: 900, freqEnd: 480, dur: 0.06, gain: 0.08 }),
  hit: (b) => impact(b, 1, 1),
  crit: (b) => {
    impact(b, 1.25, 1.3);
    b.tone({ type: 'triangle', freq: 1800, dur: 0.28, gain: 0.12 })
      .tone({ type: 'triangle', freq: 2710, dur: 0.22, gain: 0.08 })
      .tone({ type: 'sine', freq: 3600, dur: 0.15, gain: 0.05 })
      .noise({ dur: 0.08, gain: 0.25, filter: { type: 'highpass', freq: 5000 } })
      .wet(0.25);
  },
  enemyHurt: (b) =>
    b.tone({ type: 'sawtooth', freq: 190, freqEnd: 110, dur: 0.13, gain: 0.16, filter: { type: 'lowpass', freq: 900 } })
      .tone({ type: 'sine', freq: 300, freqEnd: 150, dur: 0.1, gain: 0.12 })
      .noise({ dur: 0.06, gain: 0.14, filter: { type: 'bandpass', freq: 800, Q: 1.5 } }),
  enemyDie: (b) =>
    b.tone({ type: 'sawtooth', freq: 210, freqEnd: 38, dur: 0.5, gain: 0.22, filter: { type: 'lowpass', freq: 1300, freqEnd: 180 } })
      .noise({ dur: 0.45, gain: 0.3, filter: { type: 'lowpass', freq: 2200, freqEnd: 100 } })
      .tone({ type: 'sine', freq: 85, freqEnd: 30, dur: 0.32, gain: 0.45 })
      .noise({ dur: 0.04, gain: 0.3, filter: { type: 'highpass', freq: 2500 } }),

  // --- player hurt / death ------------------------------------------------
  playerHurt: (b) =>
    b.tone({ type: 'square', freq: 420, freqEnd: 120, dur: 0.22, gain: 0.16, filter: { type: 'lowpass', freq: 2000 } })
      .noise({ dur: 0.16, gain: 0.35, filter: { type: 'bandpass', freq: 1000, Q: 1 } })
      .tone({ type: 'sine', freq: 125, freqEnd: 48, dur: 0.22, gain: 0.5 }),
  playerDie: (b) =>
    b.tone({ type: 'sawtooth', freq: 300, freqEnd: 30, dur: 1.4, gain: 0.24, filter: { type: 'lowpass', freq: 2000, freqEnd: 150 } })
      .tone({ type: 'sine', freq: 110, freqEnd: 27, dur: 1.5, gain: 0.45 })
      .noise({ dur: 1.2, gain: 0.25, filter: { type: 'lowpass', freq: 1500, freqEnd: 80 } })
      .tone({ type: 'triangle', at: 0.15, freq: 220, dur: 1.6, gain: 0.08, detune: -8 })
      .tone({ type: 'triangle', at: 0.15, freq: 261.6, dur: 1.6, gain: 0.06, detune: 8 })
      .wet(0.5),

  // --- defense -----------------------------------------------------------
  block: (b) =>
    b.noise({ dur: 0.08, gain: 0.35, filter: { type: 'bandpass', freq: 2500, Q: 3 } })
      .tone({ type: 'square', freq: 220, dur: 0.08, gain: 0.1, filter: { type: 'lowpass', freq: 1500 } })
      .tone({ type: 'sine', freq: 180, freqEnd: 90, dur: 0.1, gain: 0.3 }),
  parry: (b) =>
    b.tone({ type: 'sine', freq: 1320, dur: 0.65, gain: 0.18 })
      .tone({ type: 'sine', freq: 1320 * 2.76, dur: 0.4, gain: 0.07 })
      .tone({ type: 'triangle', freq: 2640, dur: 0.45, gain: 0.07 })
      .noise({ dur: 0.06, gain: 0.4, filter: { type: 'highpass', freq: 4000 } })
      .tone({ type: 'sine', freq: 200, freqEnd: 80, dur: 0.15, gain: 0.3 })
      .wet(0.35),

  // --- ranged -------------------------------------------------------------
  bow: (b) =>
    b.tone({ type: 'triangle', freq: 185, freqEnd: 140, dur: 0.25, gain: 0.22, filter: { type: 'lowpass', freq: 1400 } })
      .noise({ at: 0.01, dur: 0.1, gain: 0.14, filter: { type: 'highpass', freq: 3000 } })
      .tone({ type: 'sine', freq: 700, freqEnd: 1600, dur: 0.05, gain: 0.05 }),
  crossbow: (b) =>
    b.noise({ dur: 0.03, gain: 0.4, filter: { type: 'highpass', freq: 3000 } })
      .tone({ type: 'square', freq: 140, freqEnd: 90, dur: 0.1, gain: 0.16, filter: { type: 'lowpass', freq: 800 } })
      .noise({ dur: 0.12, gain: 0.18, filter: { type: 'bandpass', freq: 2000, freqEnd: 800, Q: 1.5 } }),
  throw: (b) =>
    b.noise({ dur: 0.11, attack: 0.02, gain: 0.28, filter: { type: 'bandpass', freq: 1500, freqEnd: 4200, Q: 1.3 } }),
  magic: (b) =>
    b.tone({ type: 'sine', freq: 600, freqEnd: 1200, dur: 0.32, gain: 0.14, vibrato: { rate: 9, depth: 30 } })
      .tone({ type: 'triangle', at: 0.03, freq: 900, freqEnd: 1800, dur: 0.3, gain: 0.08 })
      .noise({ dur: 0.3, attack: 0.04, gain: 0.08, filter: { type: 'bandpass', freq: 3000, Q: 4 } })
      .wet(0.3),
  zap: (b) =>
    b.tone({ type: 'sawtooth', freq: 1300, freqEnd: 180, dur: 0.16, gain: 0.14, filter: { type: 'bandpass', freq: 2000, Q: 0.8 } })
      .tone({ type: 'square', freq: 2400, freqEnd: 600, dur: 0.1, gain: 0.06 })
      .noise({ dur: 0.13, gain: 0.28, filter: { type: 'highpass', freq: 3000 } })
      .noise({ at: 0.05, dur: 0.06, gain: 0.18, filter: { type: 'highpass', freq: 4500 } }),
  fire: (b) =>
    b.noise({ dur: 0.42, attack: 0.05, gain: 0.36, filter: { type: 'lowpass', freq: 1300, freqEnd: 380 } })
      .tone({ type: 'sine', freq: 140, freqEnd: 70, dur: 0.26, gain: 0.28 })
      .noise({ dur: 0.32, gain: 0.08, rate: 0.5, filter: { type: 'highpass', freq: 2500 } }),
  freeze: (b) =>
    b.noise({ dur: 0.42, attack: 0.02, gain: 0.14, filter: { type: 'highpass', freq: 4000 } })
      .tone({ type: 'sine', freq: 1800, freqEnd: 2500, dur: 0.32, gain: 0.07 })
      .tone({ type: 'triangle', at: 0.04, freq: 2620, dur: 0.5, gain: 0.06 })
      .tone({ type: 'triangle', at: 0.09, freq: 3135, dur: 0.45, gain: 0.05 })
      .tone({ type: 'sine', freq: 220, freqEnd: 110, dur: 0.18, gain: 0.15 })
      .wet(0.35),
  poison: (b) => {
    for (let i = 0; i < 4; i++) {
      b.tone({ type: 'sine', at: i * 0.06 + Math.random() * 0.02, freq: 260 + Math.random() * 120, freqEnd: 600 + Math.random() * 200, dur: 0.07, gain: 0.12 });
    }
    b.noise({ dur: 0.32, attack: 0.03, gain: 0.16, filter: { type: 'lowpass', freq: 600 } });
  },
  explosion: (b) => explosionLayers(b, 1),
  grenadeThrow: (b) =>
    b.noise({ dur: 0.18, attack: 0.03, gain: 0.18, filter: { type: 'bandpass', freq: 800, freqEnd: 2000, Q: 1.2 } })
      .tone({ type: 'triangle', freq: 500, freqEnd: 300, dur: 0.05, gain: 0.1 }),
  turret: (b) =>
    b.tone({ type: 'square', freq: 900, freqEnd: 600, dur: 0.045, gain: 0.08 })
      .noise({ dur: 0.05, gain: 0.22, filter: { type: 'highpass', freq: 2000 } })
      .tone({ type: 'sine', freq: 200, freqEnd: 100, dur: 0.06, gain: 0.18 }),
  trap: (b) =>
    b.noise({ dur: 0.05, gain: 0.45, filter: { type: 'highpass', freq: 3000 } })
      .tone({ type: 'triangle', freq: 620, freqEnd: 300, dur: 0.08, gain: 0.16 })
      .tone({ type: 'sine', freq: 1500, dur: 0.2, gain: 0.05 })
      .tone({ type: 'sine', freq: 140, freqEnd: 70, dur: 0.08, gain: 0.2 }),

  // --- pickups -----------------------------------------------------------
  coin: (b) =>
    b.tone({ type: 'triangle', freq: N.B5, dur: 0.08, gain: 0.14 })
      .tone({ type: 'triangle', at: 0.055, freq: N.E6, dur: 0.26, gain: 0.14 })
      .tone({ type: 'sine', at: 0.055, freq: N.E6 * 2, dur: 0.18, gain: 0.04 }),
  ember: (b) =>
    b.tone({ type: 'sine', freq: 480, freqEnd: 1100, dur: 0.26, gain: 0.16, vibrato: { rate: 14, depth: 25 } })
      .noise({ dur: 0.2, gain: 0.07, filter: { type: 'bandpass', freq: 3000, Q: 5 } })
      .tone({ type: 'triangle', at: 0.08, freq: 1500, dur: 0.22, gain: 0.07 })
      .wet(0.3),
  pickup: (b) => b.arp([N.C6, N.E6, N.G6], 0.045, { type: 'triangle', dur: 0.12, gain: 0.13 }),
  itemRare: (b) =>
    b.arp([N.C5, N.E5, N.G5, N.C6], 0.07, { type: 'triangle', dur: 0.3, gain: 0.13 })
      .arp([N.C6, N.E6, N.G6, N.C7], 0.07, { type: 'sine', dur: 0.25, gain: 0.05 })
      .noise({ at: 0.2, dur: 0.4, attack: 0.1, gain: 0.04, filter: { type: 'highpass', freq: 6000 } })
      .wet(0.35),
  itemLegendary: (b) => {
    b.tone({ type: 'sawtooth', freq: 130.8, dur: 1.5, attack: 0.3, gain: 0.08, filter: { type: 'lowpass', freq: 300, freqEnd: 3000, sweepTime: 0.8 } })
      .tone({ type: 'sawtooth', freq: 196, dur: 1.5, attack: 0.3, gain: 0.06, detune: 7, filter: { type: 'lowpass', freq: 300, freqEnd: 3000, sweepTime: 0.8 } })
      .tone({ type: 'sawtooth', freq: 261.6, dur: 1.5, attack: 0.3, gain: 0.05, detune: -7, filter: { type: 'lowpass', freq: 300, freqEnd: 3000, sweepTime: 0.8 } })
      .arp([N.C5, N.E5, N.G5, N.C6, N.E6, N.G6, N.C7], 0.06, { type: 'triangle', dur: 0.5, gain: 0.1 })
      .tone({ type: 'sine', at: 0.45, freq: N.C6, dur: 1.2, gain: 0.08 })
      .tone({ type: 'sine', at: 0.45, freq: N.C6 * 2.76, dur: 0.8, gain: 0.03 })
      .noise({ at: 0.3, dur: 1, attack: 0.3, gain: 0.05, filter: { type: 'highpass', freq: 7000 } })
      .wet(0.5);
  },
  potion: (b) => {
    for (let i = 0; i < 3; i++) b.tone({ type: 'sine', at: i * 0.09, freq: 200 + i * 40, freqEnd: 480 + i * 60, dur: 0.08, gain: 0.16 });
    b.noise({ dur: 0.3, gain: 0.1, filter: { type: 'lowpass', freq: 500 } });
    b.arp([N.E5, N.A5, N.C6], 0.06, { at: 0.28, type: 'sine', dur: 0.3, gain: 0.07 });
    b.wet(0.25);
  },
  heal: (b) =>
    b.arp([N.C5, N.G5, N.C6, N.E6], 0.08, { type: 'sine', dur: 0.4, attack: 0.02, gain: 0.1 })
      .noise({ dur: 0.6, attack: 0.15, gain: 0.04, filter: { type: 'highpass', freq: 6000 } })
      .wet(0.4),
  scroll: (b) =>
    b.noise({ dur: 0.2, attack: 0.04, gain: 0.14, filter: { type: 'bandpass', freq: 3000, Q: 0.8 } })
      .arp([N.G5, N.D6, N.G6], 0.1, { at: 0.08, type: 'sine', dur: 0.6, gain: 0.11 })
      .arp([N.G5 * 2.76, N.D6 * 2.76], 0.1, { at: 0.08, type: 'sine', dur: 0.3, gain: 0.025 })
      .wet(0.45),

  // --- world -------------------------------------------------------------
  chest: (b) =>
    b.tone({ type: 'sawtooth', freq: 115, freqEnd: 185, dur: 0.3, attack: 0.05, gain: 0.1, filter: { type: 'lowpass', freq: 800 } })
      .tone({ type: 'sine', at: 0.22, freq: 150, freqEnd: 60, dur: 0.15, gain: 0.35 })
      .noise({ at: 0.22, dur: 0.1, gain: 0.2, filter: { type: 'lowpass', freq: 1200 } })
      .arp([N.G6, N.C7], 0.06, { at: 0.3, type: 'triangle', dur: 0.3, gain: 0.08 })
      .wet(0.2),
  door: (b) =>
    b.noise({ color: 'brown', dur: 1.0, attack: 0.1, gain: 0.45, filter: { type: 'lowpass', freq: 400 } })
      .tone({ type: 'sawtooth', freq: 55, freqEnd: 50, dur: 1.0, attack: 0.1, gain: 0.16, filter: { type: 'lowpass', freq: 300 } })
      .tone({ type: 'sine', at: 0.85, freq: 75, freqEnd: 38, dur: 0.45, gain: 0.6 })
      .noise({ at: 0.85, dur: 0.2, gain: 0.25, filter: { type: 'lowpass', freq: 1500, freqEnd: 200 } })
      .wet(0.4),
  portal: (b) =>
    b.tone({ type: 'sine', freq: 200, freqEnd: 820, dur: 1.2, attack: 0.2, gain: 0.14, vibrato: { rate: 8, depth: 60 } })
      .tone({ type: 'sine', freq: 302, freqEnd: 1230, dur: 1.2, attack: 0.25, gain: 0.08, vibrato: { rate: 6, depth: 40 } })
      .noise({ dur: 1.2, attack: 0.3, gain: 0.12, filter: { type: 'bandpass', freq: 500, freqEnd: 3000, Q: 2 } })
      .wet(0.55),
  spikes: (b) =>
    b.noise({ dur: 0.1, gain: 0.38, filter: { type: 'highpass', freq: 2500 } })
      .tone({ type: 'triangle', freq: 820, dur: 0.12, gain: 0.1 })
      .tone({ type: 'triangle', freq: 1230, dur: 0.1, gain: 0.07 }),

  // --- enemies ----------------------------------------------------------
  enemyAlert: (b) =>
    b.tone({ type: 'sawtooth', freq: 220, freqEnd: 340, dur: 0.16, gain: 0.14, filter: { type: 'lowpass', freq: 1500 } })
      .tone({ type: 'square', at: 0.02, freq: 660, freqEnd: 880, dur: 0.08, gain: 0.05, filter: { type: 'lowpass', freq: 2500 } }),
  enemyShoot: (b) =>
    b.tone({ type: 'sawtooth', freq: 820, freqEnd: 300, dur: 0.13, gain: 0.12, filter: { type: 'lowpass', freq: 2000 } })
      .noise({ dur: 0.08, gain: 0.14, filter: { type: 'bandpass', freq: 1500, Q: 1.5 } }),
  enemyWindup: (b) =>
    b.tone({ type: 'sawtooth', freq: 150, freqEnd: 420, dur: 0.36, attack: 0.08, gain: 0.14, filter: { type: 'lowpass', freq: 400, freqEnd: 2200 } })
      .noise({ dur: 0.36, attack: 0.1, gain: 0.1, filter: { type: 'bandpass', freq: 400, freqEnd: 1700, Q: 2 } }),

  // --- bosses -----------------------------------------------------------
  bossRoar: (b) =>
    b.tone({ type: 'sawtooth', freq: 72, freqEnd: 44, dur: 1.7, attack: 0.2, hold: 0.6, gain: 0.3, vibrato: { rate: 6, depth: 45 }, filter: { type: 'lowpass', freq: 700, freqEnd: 200 } })
      .tone({ type: 'sawtooth', freq: 74, freqEnd: 46, dur: 1.7, attack: 0.25, hold: 0.6, gain: 0.22, detune: 18, filter: { type: 'lowpass', freq: 600, freqEnd: 180 } })
      .tone({ type: 'square', freq: 36, dur: 1.6, attack: 0.2, hold: 0.5, gain: 0.18, filter: { type: 'lowpass', freq: 200 } })
      .noise({ color: 'brown', dur: 1.5, attack: 0.15, hold: 0.5, gain: 0.5, filter: { type: 'bandpass', freq: 320, Q: 1 } })
      .noise({ dur: 1.2, attack: 0.2, gain: 0.08, filter: { type: 'bandpass', freq: 1600, freqEnd: 700, Q: 3 } })
      .wet(0.5),
  bossSlam: (b) => {
    b.tone({ type: 'sine', freq: 82, freqEnd: 24, dur: 0.85, gain: 0.85 })
      .noise({ color: 'brown', dur: 0.75, gain: 0.75, filter: { type: 'lowpass', freq: 1600, freqEnd: 90 } })
      .noise({ dur: 0.05, gain: 0.4, filter: { type: 'highpass', freq: 1500 } })
      .noise({ at: 0.04, dur: 0.6, gain: 0.12, rate: 0.4, filter: { type: 'bandpass', freq: 600, Q: 0.7 } })
      .wet(0.35);
  },
  bossDie: (b) => {
    explosionLayers(b, 1.2, 0);
    explosionLayers(b, 1, 0.45);
    explosionLayers(b, 1.6, 1.0);
    b.tone({ type: 'sawtooth', freq: 220, freqEnd: 20, dur: 3, gain: 0.18, filter: { type: 'lowpass', freq: 1500, freqEnd: 100 } })
      .tone({ type: 'sine', at: 1.4, freq: 261.6, dur: 2.5, attack: 0.3, gain: 0.08 })
      .tone({ type: 'sine', at: 1.4, freq: 392, dur: 2.5, attack: 0.3, gain: 0.06 })
      .tone({ type: 'sine', at: 1.4, freq: 523.25, dur: 2.2, attack: 0.3, gain: 0.05 })
      .wet(0.55);
  },

  // --- UI ---------------------------------------------------------------
  uiMove: (b) => b.tone({ type: 'square', freq: 880, dur: 0.035, gain: 0.06, filter: { type: 'lowpass', freq: 3000 } }),
  uiSelect: (b) => b.arp([660, 990], 0.05, { type: 'triangle', dur: 0.1, gain: 0.13 }),
  uiBack: (b) => b.tone({ type: 'triangle', freq: 660, freqEnd: 420, dur: 0.11, gain: 0.12 }),
  buy: (b) => {
    PRESETS.coin(b);
    b.tone({ type: 'triangle', at: 0.11, freq: N.B5, dur: 0.08, gain: 0.12 })
      .tone({ type: 'triangle', at: 0.16, freq: N.E6, dur: 0.2, gain: 0.12 })
      .arp([N.E6, N.A6], 0.07, { at: 0.24, type: 'sine', dur: 0.35, gain: 0.08 })
      .wet(0.2);
  },
  denied: (b) =>
    b.tone({ type: 'square', freq: 185, dur: 0.08, gain: 0.1, filter: { type: 'lowpass', freq: 1200 } })
      .tone({ type: 'square', at: 0.1, freq: 150, dur: 0.14, gain: 0.1, filter: { type: 'lowpass', freq: 1200 } }),
  unlock: (b) =>
    b.arp([N.G5, N.C6, N.E6, N.G6], 0.08, { type: 'triangle', dur: 0.4, gain: 0.12 })
      .tone({ type: 'sawtooth', at: 0.3, freq: 261.6, dur: 0.9, attack: 0.1, gain: 0.05, filter: { type: 'lowpass', freq: 1800 } })
      .tone({ type: 'sawtooth', at: 0.3, freq: 329.6, dur: 0.9, attack: 0.1, gain: 0.04, filter: { type: 'lowpass', freq: 1800 } })
      .tone({ type: 'sawtooth', at: 0.3, freq: 392, dur: 0.9, attack: 0.1, gain: 0.04, filter: { type: 'lowpass', freq: 1800 } })
      .wet(0.4),
};

export const SFX_NAMES = Object.keys(PRESETS) as SfxName[];

/** Per-name voice caps (default 4). */
const PER_NAME_LIMIT: Partial<Record<SfxName, number>> = {
  coin: 6,
  step: 2,
  hit: 5,
  enemyHurt: 4,
  bossRoar: 1,
  bossDie: 1,
  playerDie: 1,
  itemLegendary: 1,
  door: 2,
  portal: 2,
  uiMove: 2,
};
const TOTAL_LIMIT = 24;

/** Loudness trims so quiet-but-important feedback sounds sit well in the mix. */
const TRIM: Partial<Record<SfxName, number>> = {
  uiMove: 1.8, uiBack: 1.5, grenadeThrow: 1.8, enemyShoot: 1.6, enemyAlert: 1.6,
  step: 1.3, swing: 1.4, dodge: 1.4, jump: 1.3, throw: 1.5, enemyHurt: 1.4, stab: 1.3,
};

interface ActiveVoice {
  name: SfxName;
  out: GainNode;
  sources: Source[];
  start: number;
  end: number;
  alive: boolean;
}

export class SfxPlayer {
  private voices: ActiveVoice[] = [];

  constructor(
    private ctx: BaseAudioContext,
    private out: AudioNode,
    private reverbIn: AudioNode,
  ) {}

  get activeCount(): number {
    this.prune();
    return this.voices.length;
  }

  play(name: SfxName, opts: SfxOptions = {}): void {
    const preset = PRESETS[name];
    if (!preset) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.prune();

    const same = this.voices.filter((v) => v.name === name);
    const cap = PER_NAME_LIMIT[name] ?? 4;
    if (same.length >= cap) this.steal(same[0]);
    if (this.voices.length >= TOTAL_LIMIT) this.steal(this.voices[0]);

    // Stacking the same sound on the same instant gets quieter instead of louder.
    const simultaneous = same.filter((v) => now - v.start < 0.03).length;
    const stackAtten = 1 / Math.sqrt(1 + simultaneous);

    const vol = Math.max(0, Math.min(1, opts.volume ?? 1)) * stackAtten * (TRIM[name] ?? 1);
    const pitch = (opts.pitch ?? 1) * (0.95 + Math.random() * 0.1);

    const vg = ctx.createGain();
    vg.gain.value = vol;
    let tail: AudioNode = vg;
    if (opts.pan && typeof (ctx as AudioContext).createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      vg.connect(p);
      tail = p;
    }
    tail.connect(this.out);

    const b = new VoiceBuilder(ctx, vg, now + 0.005, pitch);
    preset(b);
    if (b.wetAmount > 0) {
      const send = ctx.createGain();
      send.gain.value = b.wetAmount;
      tail.connect(send);
      send.connect(this.reverbIn);
    }

    const voice: ActiveVoice = { name, out: vg, sources: b.sources, start: now, end: b.end, alive: true };
    let remaining = b.sources.length;
    const done = () => {
      remaining--;
      if (remaining <= 0 && voice.alive) {
        voice.alive = false;
        try {
          vg.disconnect();
          if (tail !== vg) tail.disconnect();
        } catch {
          /* already disconnected */
        }
      }
    };
    for (const s of b.sources) s.onended = done;
    this.voices.push(voice);
  }

  private steal(v: ActiveVoice) {
    const now = this.ctx.currentTime;
    try {
      v.out.gain.cancelScheduledValues(now);
      v.out.gain.setValueAtTime(v.out.gain.value, now);
      v.out.gain.linearRampToValueAtTime(0, now + 0.03);
      for (const s of v.sources) s.stop(now + 0.04);
    } catch {
      /* source may already be stopped */
    }
    v.end = now;
    this.voices = this.voices.filter((x) => x !== v);
  }

  private prune() {
    const now = this.ctx.currentTime;
    this.voices = this.voices.filter((v) => v.alive && v.end > now);
  }
}
