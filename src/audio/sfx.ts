type Voice = 'ui' | 'sand' | 'water' | 'fire' | 'explode' | 'zap' | 'plant' | 'break' | 'win' | 'splash';

/** Tiny WebAudio blips. Nothing is fetched, so the sounds work offline. */
export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<string, number>();

  resume(): void {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!this.ctx) {
      this.ctx = new Ctx();
      const count = this.ctx.sampleRate;
      const buffer = this.ctx.createBuffer(1, count, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < count; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggle(): boolean {
    this.muted = !this.muted;
    if (!this.muted) this.resume();
    return this.muted;
  }

  play(name: Voice): void {
    if (this.muted || !this.ctx || !this.noise) return;
    const nowMs = performance.now();
    const gap = name === 'explode' || name === 'win' ? 140 : 60;
    if (nowMs - (this.last.get(name) ?? 0) < gap) return;
    this.last.set(name, nowMs);
    const t = this.ctx.currentTime;
    if (name === 'ui') this.tone(880, t, 0.045, 'square', 0.04);
    else if (name === 'sand') this.burst(t, 0.05, 900, 0.05);
    else if (name === 'water') this.tone(240, t, 0.08, 'sine', 0.05, 160);
    else if (name === 'fire') this.burst(t, 0.07, 400, 0.04);
    else if (name === 'explode') {
      this.burst(t, 0.22, 180, 0.12);
      this.tone(140, t, 0.2, 'sawtooth', 0.06, 50);
    } else if (name === 'zap') this.tone(1560, t, 0.05, 'square', 0.04, 420);
    else if (name === 'plant') this.tone(520, t, 0.07, 'triangle', 0.04);
    else if (name === 'break') this.burst(t, 0.1, 240, 0.08);
    else if (name === 'splash') this.tone(320, t, 0.06, 'sine', 0.04, 180);
    else if (name === 'win') {
      this.tone(523, t, 0.1, 'square', 0.05);
      this.tone(659, t + 0.09, 0.1, 'square', 0.05);
      this.tone(784, t + 0.18, 0.16, 'square', 0.05);
    }
  }

  private tone(
    freq: number,
    when: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slideTo?: number,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), when + dur);
    amp.gain.setValueAtTime(gain, when);
    amp.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(amp);
    amp.connect(this.ctx.destination);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private burst(when: number, dur: number, freq: number, gain: number): void {
    if (!this.ctx || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(gain, when);
    amp.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(this.ctx.destination);
    src.start(when);
    src.stop(when + dur + 0.02);
  }
}
