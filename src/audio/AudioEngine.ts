import type { Speaker } from "../script/dialogue";

export interface VoiceHandle {
  stop(): void;
}

const VOICE_PROFILE: Record<Speaker, { pitch: number; phone: boolean; gain: number }> = {
  amos: { pitch: 96, phone: true, gain: 0.5 },
  sasha: { pitch: 205, phone: true, gain: 0.45 },
  milo: { pitch: 128, phone: false, gain: 0.32 },
  gpt: { pitch: 150, phone: false, gain: 0.25 },
};

/**
 * Every sound in the demo is synthesized with WebAudio so the prototype ships without audio files.
 * Must be unlocked from a user gesture before anything is audible.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private voice!: GainNode;
  private noise!: AudioBuffer;

  private rainGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private rainLevel = 0;
  private dripTimer = 0;
  private humGain: GainNode | null = null;
  private ringGain: GainNode | null = null;
  private ringTimer = 0;
  private ringing = false;
  private volume = 0.8;

  get ready(): boolean {
    return this.ctx !== null;
  }

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    this.master.connect(compressor).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.voice = ctx.createGain();
    this.voice.connect(this.master);

    const length = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    this.buildRain();
    this.buildHum();
    this.buildRing();
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.ctx) this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
  }

  getVolume(): number {
    return this.volume;
  }

  /** Called every frame for scheduled ambience (rain drips, phone ring cadence). */
  update(dt: number): void {
    if (!this.ctx) return;
    if (this.rainLevel > 0.05) {
      this.dripTimer -= dt;
      if (this.dripTimer <= 0) {
        this.dripTimer = 0.04 + Math.random() * (0.25 / this.rainLevel);
        this.drip();
      }
    }
    if (this.ringing && this.ringGain) {
      this.ringTimer -= dt;
      if (this.ringTimer <= 0) {
        this.ringTimer = 3.2;
        const t = this.ctx.currentTime;
        const g = this.ringGain.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(0, t);
        g.linearRampToValueAtTime(0.16, t + 0.02);
        g.setValueAtTime(0.16, t + 0.42);
        g.linearRampToValueAtTime(0, t + 0.45);
        g.setValueAtTime(0, t + 0.62);
        g.linearRampToValueAtTime(0.16, t + 0.64);
        g.setValueAtTime(0.16, t + 1.04);
        g.linearRampToValueAtTime(0, t + 1.07);
      }
    }
  }

  // ---------------------------------------------------------------- ambience

  /** level 0–1. Muffled rain is heard through concrete walls. */
  setRain(level: number, muffled: boolean, fade = 1.5): void {
    this.rainLevel = muffled ? level * 0.2 : level;
    if (!this.ctx || !this.rainGain || !this.rainFilter) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(level * (muffled ? 0.16 : 0.42), t, fade / 3);
    this.rainFilter.frequency.setTargetAtTime(muffled ? 650 : 7000, t, fade / 3);
  }

  setHum(level: number, fade = 1): void {
    if (!this.ctx || !this.humGain) return;
    this.humGain.gain.setTargetAtTime(level * 0.06, this.ctx.currentTime, fade / 3);
  }

  setRinging(on: boolean): void {
    this.ringing = on;
    if (!on && this.ctx && this.ringGain) {
      const g = this.ringGain.gain;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    }
    if (on) this.ringTimer = 0;
  }

  private buildRain(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 300;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 650;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(hp).connect(lp).connect(gain).connect(this.master);
    src.start();
    this.rainGain = gain;
    this.rainFilter = lp;
  }

  private drip(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800 + Math.random() * 4000;
    bp.Q.value = 3;
    const g = ctx.createGain();
    const peak = 0.05 * this.rainLevel * (0.4 + Math.random());
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    src.connect(bp).connect(g).connect(pan).connect(this.master);
    src.start(t, Math.random() * 1.5, 0.08);
  }

  private buildHum(): void {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    for (const [freq, level] of [
      [60, 1],
      [120, 0.5],
      [180, 0.2],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(gain);
      osc.start();
    }
    const buzz = ctx.createOscillator();
    buzz.type = "sawtooth";
    buzz.frequency.value = 120;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400;
    bp.Q.value = 6;
    const bg = ctx.createGain();
    bg.gain.value = 0.15;
    buzz.connect(bp).connect(bg).connect(gain);
    buzz.start();
    this.humGain = gain;
  }

  private buildRing(): void {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const bell = ctx.createGain();
    bell.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 22;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    const offset = ctx.createConstantSource();
    offset.offset.value = 0.5;
    lfo.connect(lfoGain).connect(bell.gain);
    offset.connect(bell.gain);
    for (const f of [1150, 1390, 2410]) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = f;
      osc.connect(bell);
      osc.start();
    }
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1500;
    bp.Q.value = 1.2;
    bell.connect(bp).connect(gain).connect(this.sfx);
    lfo.start();
    offset.start();
    this.ringGain = gain;
  }

  // ---------------------------------------------------------------- voice

  /** Muffled speech-like babble under subtitles. Phone voices are band-limited like a handset. */
  speak(speaker: Speaker, duration: number): VoiceHandle {
    const ctx = this.ctx;
    if (!ctx) return { stop() {} };
    const profile = VOICE_PROFILE[speaker];
    const out = ctx.createGain();
    out.gain.value = profile.gain;
    let chain: AudioNode = out;
    if (profile.phone) {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 380;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3000;
      const shaper = ctx.createWaveShaper();
      shaper.curve = softClipCurve(2.5);
      out.connect(hp).connect(lp).connect(shaper);
      chain = shaper;
    } else if (speaker === "gpt") {
      const delay = ctx.createDelay();
      delay.delayTime.value = 0.012;
      const fb = ctx.createGain();
      fb.gain.value = 0.35;
      out.connect(delay).connect(fb).connect(delay);
      delay.connect(this.voice);
    }
    chain.connect(this.voice);

    const start = ctx.currentTime + 0.05;
    let t = start;
    const end = start + duration * 0.92;
    const sources: AudioScheduledSourceNode[] = [];
    while (t < end) {
      const syl = 0.09 + Math.random() * 0.12;
      if (Math.random() < 0.16) {
        t += 0.12 + Math.random() * 0.18;
        continue;
      }
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const pitch = profile.pitch * (0.88 + Math.random() * 0.3);
      osc.frequency.setValueAtTime(pitch, t);
      osc.frequency.linearRampToValueAtTime(pitch * (0.92 + Math.random() * 0.1), t + syl);
      const f1 = ctx.createBiquadFilter();
      f1.type = "bandpass";
      f1.frequency.value = 350 + Math.random() * 500;
      f1.Q.value = 6;
      const f2 = ctx.createBiquadFilter();
      f2.type = "bandpass";
      f2.frequency.value = 1000 + Math.random() * 1300;
      f2.Q.value = 9;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.9, t + 0.025);
      env.gain.exponentialRampToValueAtTime(0.0001, t + syl);
      osc.connect(f1).connect(env);
      osc.connect(f2).connect(env);
      env.connect(out);
      osc.start(t);
      osc.stop(t + syl + 0.02);
      sources.push(osc);
      t += syl + 0.02;
    }
    return {
      stop: () => {
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        for (const s of sources) {
          try {
            s.stop(ctx.currentTime + 0.1);
          } catch {
            // already stopped
          }
        }
      },
    };
  }

  // ---------------------------------------------------------------- one-shots

  click(): void {
    this.tone(1800, 0.03, 0.05, "square");
  }

  hover(): void {
    this.tone(900, 0.02, 0.015, "sine");
  }

  footstep(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noiseBurst({ at: t, duration: 0.12, freq: 380 + Math.random() * 120, type: "lowpass", gain: 0.35 });
    this.noiseBurst({ at: t + 0.01, duration: 0.18, freq: 2800, type: "highpass", gain: 0.08 + Math.random() * 0.05 });
  }

  thunder(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 140;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    src.connect(lp).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + 4.6);
  }

  keycard(accepted: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (accepted) {
      this.tone(1480, 0.07, 0.08, "square");
      this.tone(1980, 0.09, 0.08, "square", 0.1);
    } else {
      this.tone(320, 0.25, 0.1, "square");
    }
  }

  doorOpen(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.thump(t, 70, 0.5);
    this.noiseBurst({ at: t + 0.05, duration: 0.9, freq: 900, type: "bandpass", gain: 0.12, q: 4 });
  }

  phonePickup(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.noiseBurst({ at: ctx.currentTime, duration: 0.08, freq: 1400, type: "bandpass", gain: 0.25, q: 2 });
    this.thump(ctx.currentTime, 140, 0.25);
  }

  phoneHangup(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.tone(480, 0.25, 0.05, "sine", 0.15);
    this.tone(620, 0.25, 0.05, "sine", 0.15);
  }

  terminalOn(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.tone(15600, 0.4, 0.02, "sine");
    this.noiseBurst({ at: ctx.currentTime, duration: 0.15, freq: 4000, type: "highpass", gain: 0.06 });
  }

  terminalOff(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.thump(ctx.currentTime, 90, 0.1);
  }

  staticBurst(duration = 0.25, level = 0.12): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.noiseBurst({ at: ctx.currentTime, duration, freq: 3200, type: "bandpass", gain: level, q: 0.6, flat: true });
  }

  /** GPT's incoming-contact chime. */
  chime(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.bell(988, 0, 0.18, 1.4);
    this.bell(740, 0.32, 0.18, 1.8);
  }

  linkPulse(progress: number): void {
    this.tone(320 + progress * 520, 0.12, 0.05, "sine");
  }

  linkComplete(): void {
    this.tone(660, 0.12, 0.08, "sine");
    this.tone(990, 0.3, 0.08, "sine", 0.12);
  }

  linkBroken(): void {
    this.tone(260, 0.3, 0.09, "sawtooth");
  }

  sealClank(shut: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noiseBurst({ at: t, duration: 0.7, freq: 3500, type: "highpass", gain: 0.14 });
    this.thump(t + (shut ? 0.55 : 0.1), shut ? 48 : 70, shut ? 0.9 : 0.5);
    this.noiseBurst({ at: t + (shut ? 0.55 : 0.1), duration: 0.8, freq: 1700, type: "bandpass", gain: 0.25, q: 9 });
  }

  /** Something heavy hitting the shut seal from the airlock side. */
  bang(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.thump(t, 42, 1);
    this.noiseBurst({ at: t, duration: 1.1, freq: 1200, type: "bandpass", gain: 0.35, q: 12 });
    this.noiseBurst({ at: t, duration: 0.3, freq: 300, type: "lowpass", gain: 0.5 });
  }

  sealRejected(): void {
    this.tone(220, 0.12, 0.1, "square");
    this.tone(220, 0.12, 0.1, "square", 0.18);
  }

  alarm(): void {
    for (let i = 0; i < 4; i++) {
      this.tone(i % 2 ? 560 : 760, 0.22, 0.09, "square", i * 0.26);
    }
  }

  /** Distant footfall from somewhere in the facility. */
  distantStep(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.thump(t, 60, 0.35);
    this.noiseBurst({ at: t, duration: 0.35, freq: 900, type: "bandpass", gain: 0.12, q: 6 });
    this.thump(t + 0.55, 58, 0.3);
  }

  screech(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.9, t + 0.04);
    out.gain.setValueAtTime(0.9, t + 1.0);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve(18);
    shaper.connect(out).connect(this.sfx);
    for (const detune of [0, 7, -11, 19]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(240 + detune * 4, t);
      osc.frequency.exponentialRampToValueAtTime(1500 + detune * 20, t + 0.7);
      osc.frequency.exponentialRampToValueAtTime(900, t + 2.2);
      const g = ctx.createGain();
      g.gain.value = 0.18;
      osc.connect(g).connect(shaper);
      osc.start(t);
      osc.stop(t + 2.5);
    }
    this.noiseBurst({ at: t, duration: 2.2, freq: 2500, type: "bandpass", gain: 0.5, q: 0.4, flat: true });
    this.thump(t, 40, 1.2);
  }

  /** Clock striking six. */
  dawnBells(): void {
    for (let i = 0; i < 6; i++) this.bell(523.25, i * 0.85, 0.32, 3.2);
    this.bell(784, 5.6, 0.25, 4);
  }

  // ---------------------------------------------------------------- primitives

  private tone(freq: number, duration: number, gain: number, type: OscillatorType, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.sfx);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private bell(freq: number, delay: number, gain: number, decay: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    for (const [ratio, level] of [
      [1, 1],
      [2.76, 0.45],
      [5.4, 0.25],
      [8.93, 0.12],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain * level, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay / ratio ** 0.5);
      osc.connect(g).connect(this.sfx);
      osc.start(t);
      osc.stop(t + decay + 0.1);
    }
  }

  private thump(at: number, freq: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(freq * 1.6, at);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, at + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    osc.connect(g).connect(this.sfx);
    osc.start(at);
    osc.stop(at + 0.6);
  }

  private noiseBurst(opts: {
    at: number;
    duration: number;
    freq: number;
    type: BiquadFilterType;
    gain: number;
    q?: number;
    flat?: boolean;
  }): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type;
    filter.frequency.value = opts.freq;
    if (opts.q !== undefined) filter.Q.value = opts.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, opts.at);
    g.gain.exponentialRampToValueAtTime(opts.gain, opts.at + 0.01);
    if (opts.flat) g.gain.setValueAtTime(opts.gain, opts.at + opts.duration * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, opts.at + opts.duration);
    src.connect(filter).connect(g).connect(this.sfx);
    src.start(opts.at, Math.random());
    src.stop(opts.at + opts.duration + 0.05);
  }
}

function softClipCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  return curve;
}
