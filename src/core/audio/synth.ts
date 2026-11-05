/**
 * Low-level WebAudio synthesis primitives shared by sfx.ts and music.ts.
 * No module-level access to window/AudioContext so this is safe to import in Node.
 */

export type NoiseColor = 'white' | 'pink' | 'brown';

export interface FilterOpts {
  type: BiquadFilterType;
  freq: number;
  /** If set, the cutoff sweeps exponentially to this value over the voice duration (or sweepTime). */
  freqEnd?: number;
  sweepTime?: number;
  Q?: number;
}

export interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  /** Pitch sweep target. */
  freqEnd?: number;
  /** Duration of the pitch sweep (defaults to dur). */
  sweepTime?: number;
  /** Start offset in seconds relative to t0. */
  at?: number;
  /** Total duration in seconds (attack + hold + decay). */
  dur: number;
  attack?: number;
  /** Time at full level after the attack before the exponential decay. */
  hold?: number;
  gain?: number;
  detune?: number;
  filter?: FilterOpts;
  /** Vibrato: rate in Hz, depth in cents. */
  vibrato?: { rate: number; depth: number };
}

export interface NoiseOpts {
  color?: NoiseColor;
  at?: number;
  dur: number;
  attack?: number;
  hold?: number;
  gain?: number;
  filter?: FilterOpts;
  /** Playback rate of the noise buffer (lower = darker/grainier). */
  rate?: number;
}

const EPS = 0.0001;

const noiseCache = new WeakMap<BaseAudioContext, Partial<Record<NoiseColor, AudioBuffer>>>();

/** 2-second cached noise buffers per context and color. */
export function getNoise(ctx: BaseAudioContext, color: NoiseColor): AudioBuffer {
  let rec = noiseCache.get(ctx);
  if (!rec) noiseCache.set(ctx, (rec = {}));
  const cached = rec[color];
  if (cached) return cached;
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (color === 'white') {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else if (color === 'pink') {
    // Paul Kellet's refined method
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  rec[color] = buf;
  return buf;
}

/** Procedural stereo reverb impulse response (exponentially decaying noise). */
export function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const p = i / len;
      // Darken over time with a one-pole lowpass whose coefficient rises.
      const w = Math.random() * 2 - 1;
      const k = 0.15 + 0.8 * p;
      lp = lp * k + w * (1 - k);
      const pre = i < ctx.sampleRate * 0.01 ? i / (ctx.sampleRate * 0.01) : 1;
      d[i] = lp * Math.pow(1 - p, decay) * pre;
    }
  }
  return buf;
}

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Applies an attack/hold/exponential-decay envelope to a gain param. Returns end time. */
export function envelope(g: AudioParam, t: number, peak: number, attack: number, hold: number, dur: number): number {
  const a = Math.max(0.001, attack);
  const end = t + Math.max(dur, a + hold + 0.01);
  g.cancelScheduledValues(t);
  g.setValueAtTime(EPS, t);
  g.linearRampToValueAtTime(Math.max(EPS, peak), t + a);
  if (hold > 0) g.setValueAtTime(Math.max(EPS, peak), t + a + hold);
  g.exponentialRampToValueAtTime(EPS, end);
  return end;
}

function applyFilter(ctx: BaseAudioContext, input: AudioNode, f: FilterOpts, t: number, dur: number): AudioNode {
  const bq = ctx.createBiquadFilter();
  bq.type = f.type;
  bq.Q.value = f.Q ?? (f.type === 'bandpass' ? 1 : 0.7);
  bq.frequency.setValueAtTime(clampF(f.freq), t);
  if (f.freqEnd !== undefined) bq.frequency.exponentialRampToValueAtTime(clampF(f.freqEnd), t + (f.sweepTime ?? dur));
  input.connect(bq);
  return bq;
}

const clampF = (f: number) => Math.min(20000, Math.max(20, f));

/** Something that can be started/stopped; tracked for voice cleanup. */
export type Source = AudioScheduledSourceNode;

/** Schedules an oscillator voice into `dest`. Returns the created sources and end time. */
export function tone(ctx: BaseAudioContext, dest: AudioNode, t0: number, o: ToneOpts): { sources: Source[]; end: number } {
  const t = t0 + (o.at ?? 0);
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(clampF(o.freq), t);
  if (o.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(clampF(o.freqEnd), t + (o.sweepTime ?? o.dur));
  if (o.detune) osc.detune.value = o.detune;
  const sources: Source[] = [osc];
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.vibrato.rate;
    const lg = ctx.createGain();
    lg.gain.value = o.vibrato.depth;
    lfo.connect(lg).connect(osc.detune);
    lfo.start(t);
    lfo.stop(t + o.dur + 0.05);
    sources.push(lfo);
  }
  const g = ctx.createGain();
  const out = o.filter ? applyFilter(ctx, osc, o.filter, t, o.dur) : osc;
  out.connect(g);
  g.connect(dest);
  const end = envelope(g.gain, t, o.gain ?? 0.3, o.attack ?? 0.003, o.hold ?? 0, o.dur);
  osc.start(t);
  osc.stop(end + 0.02);
  return { sources, end };
}

/** Schedules a filtered noise burst into `dest`. */
export function noise(ctx: BaseAudioContext, dest: AudioNode, t0: number, o: NoiseOpts): { sources: Source[]; end: number } {
  const t = t0 + (o.at ?? 0);
  const src = ctx.createBufferSource();
  const buf = getNoise(ctx, o.color ?? 'white');
  src.buffer = buf;
  src.loop = true;
  if (o.rate) src.playbackRate.value = o.rate;
  const g = ctx.createGain();
  const out = o.filter ? applyFilter(ctx, src, o.filter, t, o.dur) : src;
  out.connect(g);
  g.connect(dest);
  const end = envelope(g.gain, t, o.gain ?? 0.3, o.attack ?? 0.002, o.hold ?? 0, o.dur);
  src.start(t, Math.random() * (buf.duration - 0.1));
  src.stop(end + 0.02);
  return { sources: [src], end };
}

/** Soft-clip curve (tanh) that keeps |out| <= ceiling. */
export function softClipCurve(ceiling = 0.97, drive = 1.2, n = 2048): Float32Array {
  const c = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = (Math.tanh(x * drive) / norm) * ceiling;
  }
  return c;
}
