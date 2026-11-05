/**
 * Audio engine singleton. Pure WebAudio synthesis, no asset files, no Phaser.
 *
 * Graph:
 *   sfx voices ─▶ sfxGain ─┬───────────────────────────▶ masterIn
 *                          └▶ sfxVerbSend ─▶ reverb ─▶ masterIn
 *   music themes ─▶ musicIn (+ music reverb) ─▶ muffle LPF ─▶ musicGain ─▶ masterIn
 *   masterIn ─▶ masterGain ─▶ compressor ─▶ soft clip (|x| < 1) ─▶ destination
 *
 * Before unlock() every call is a silent no-op. A music theme requested before
 * unlock is remembered and starts on unlock.
 */
import type { AudioApi, MusicTheme, SfxName, SfxOptions } from './types';
import { SfxPlayer } from './sfx';
import { MusicPlayer } from './music';
import { makeImpulse, softClipCurve } from './synth';

export type { AudioApi, MusicTheme, SfxName, SfxOptions } from './types';

interface Graph {
  ctx: BaseAudioContext;
  masterGain: GainNode;
  musicGain: GainNode;
  sfxGain: GainNode;
  muffle: BiquadFilterNode;
  analyser: AnalyserNode;
  sfx: SfxPlayer;
  music: MusicPlayer;
}

export class AudioEngine implements AudioApi {
  private g: Graph | null = null;
  private vols = { master: 0.8, music: 0.5, sfx: 0.8 };
  private wantedTheme: MusicTheme | null = null;
  private muffleAmount = 0;
  private unlockHandlersInstalled = false;

  /** True once a context exists (it may still be suspended until a gesture). */
  get ready(): boolean {
    return this.g !== null;
  }

  unlock(): void {
    try {
      if (!this.g) {
        const Ctor: typeof AudioContext | undefined =
          (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
        if (!Ctor) return;
        this.attach(new Ctor({ latencyHint: 'interactive' }));
      }
      const ctx = this.g!.ctx as AudioContext;
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') void ctx.resume().catch(() => {});
    } catch {
      /* audio unsupported: stay silent */
    }
  }

  /**
   * Install one-shot listeners that call unlock() on the first user gesture.
   * Safe to call in Node (no-op without a document).
   */
  autoUnlock(): void {
    if (this.unlockHandlersInstalled || typeof window === 'undefined') return;
    this.unlockHandlersInstalled = true;
    const evs = ['pointerdown', 'keydown', 'touchstart', 'mousedown'];
    const h = () => {
      this.unlock();
      const ctx = this.g?.ctx as AudioContext | undefined;
      if (ctx && ctx.state === 'running') for (const e of evs) window.removeEventListener(e, h, true);
    };
    for (const e of evs) window.addEventListener(e, h, true);
  }

  /** Build the graph on a given context (also used for offline rendering in tests). */
  attach(ctx: BaseAudioContext): void {
    const masterIn = ctx.createGain();
    const masterGain = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve(0.97, 1.1) as Float32Array<ArrayBuffer>;
    clip.oversample = 'none';
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 32768;

    masterIn.connect(masterGain).connect(comp).connect(clip);
    clip.connect(ctx.destination);
    clip.connect(analyser);

    const impulse = makeImpulse(ctx, 2.6, 3);

    // SFX bus + reverb send
    const sfxGain = ctx.createGain();
    sfxGain.connect(masterIn);
    const sfxVerb = ctx.createConvolver();
    sfxVerb.buffer = impulse;
    const sfxVerbIn = ctx.createGain();
    sfxVerbIn.gain.value = 1;
    const sfxVerbOut = ctx.createGain();
    sfxVerbOut.gain.value = 0.45;
    sfxVerbIn.connect(sfxVerb).connect(sfxVerbOut).connect(sfxGain);
    // Ambient tail on everything.
    const ambient = ctx.createGain();
    ambient.gain.value = 0.12;
    const sfxIn = ctx.createGain();
    sfxIn.connect(sfxGain);
    sfxIn.connect(ambient).connect(sfxVerbIn);

    // Music bus
    const musicIn = ctx.createGain();
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 20000;
    muffle.Q.value = 0.6;
    const musicGain = ctx.createGain();
    musicIn.connect(muffle).connect(musicGain).connect(masterIn);

    this.g = {
      ctx,
      masterGain,
      musicGain,
      sfxGain,
      muffle,
      analyser,
      sfx: new SfxPlayer(ctx, sfxIn, sfxVerbIn),
      music: new MusicPlayer(ctx, musicIn, impulse),
    };
    this.applyVolumes();
    this.setMuffle(this.muffleAmount);
    if (this.wantedTheme) this.g.music.play(this.wantedTheme);
  }

  sfx(name: SfxName, opts?: SfxOptions): void {
    const g = this.g;
    if (!g) return;
    // A suspended realtime context would burst every queued sound on resume; skip.
    // Offline contexts (tests) are 'suspended' until rendering, so allow them.
    const offline = typeof (g.ctx as OfflineAudioContext).startRendering === 'function';
    if (!offline && g.ctx.state === 'suspended') return;
    try {
      g.sfx.play(name, opts);
    } catch {
      /* never throw from audio */
    }
  }

  music(theme: MusicTheme | null): void {
    this.wantedTheme = theme;
    const g = this.g;
    if (!g) return;
    try {
      g.music.play(theme);
    } catch {
      /* ignore */
    }
  }

  setVolumes(master: number, music: number, sfx: number): void {
    const c = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
    this.vols = { master: c(master), music: c(music), sfx: c(sfx) };
    this.applyVolumes();
  }

  setMuffle(amount: number): void {
    this.muffleAmount = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0));
    const g = this.g;
    if (!g) return;
    const f = 20000 * Math.pow(350 / 20000, this.muffleAmount);
    g.muffle.frequency.setTargetAtTime(f, g.ctx.currentTime, 0.08);
  }

  /** Debug/test helpers (not part of the AudioApi contract). */
  get debug() {
    const g = this.g;
    return {
      context: g?.ctx ?? null,
      analyser: g?.analyser ?? null,
      activeSfxVoices: g?.sfx.activeCount ?? 0,
      theme: g?.music.theme ?? null,
      pumpMusic: (lookahead: number) => g?.music.pump(lookahead),
    };
  }

  private applyVolumes() {
    const g = this.g;
    if (!g) return;
    const t = g.ctx.currentTime;
    // Perceptual (squared) volume curve.
    g.masterGain.gain.setTargetAtTime(this.vols.master * this.vols.master * 0.9, t, 0.02);
    g.musicGain.gain.setTargetAtTime(this.vols.music * this.vols.music * 0.9, t, 0.05);
    g.sfxGain.gain.setTargetAtTime(this.vols.sfx * this.vols.sfx, t, 0.02);
  }
}

export const audio = new AudioEngine();
