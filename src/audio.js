// 純 Web Audio 程序合成 — 不用音檔
// 所有效果都用 oscillator + envelope 即時生成
// 第一次按鍵時才 init AudioContext（瀏覽器政策）

export class AudioMgr {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.masterVol = 0.35;
    this._noiseBuffer = null;
    this.ambient = null;       // W4
    this.kick = null;          // W6
    try {
      this.muted = localStorage.getItem('soulDefender_mute') === '1';
    } catch (e) {}
  }

  ensureInit() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.masterVol;
      this.master.connect(this.ctx.destination);

      const sr = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, sr * 0.5, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this._noiseBuffer = buf;

      this.ambient = new Ambient(this);
      this.ambient.start();
      this.kick = new KickLayer(this);      // W6: 程序化大鼓
    } catch (e) {
      console.warn('Audio init failed', e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  setMute(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.masterVol;
    // P2: 持久化
    try { localStorage.setItem('soulDefender_mute', m ? '1' : '0'); } catch (e) {}
  }

  _now() { return this.ctx.currentTime; }

  _osc(type, freqStart, freqEnd, dur, gain) {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freqStart, t);
    if (freqEnd !== freqStart) {
      o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    }
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _noise(dur, gain, hpFreq) {
    if (!this.ctx || this.muted || !this._noiseBuffer) return;
    const t = this._now();
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.setValueAtTime(hpFreq || 800, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // === 公開 API：每個音效都加 pitch 隨機化避免重複疲勞 ===

  playHit(pitch = 1) {
    const p = pitch * (0.92 + Math.random() * 0.16);
    this._osc('square', 520 * p, 130 * p, 0.07, 0.13);
  }

  playKill() {
    const p = 0.94 + Math.random() * 0.12;
    this._osc('triangle', 880 * p, 220 * p, 0.12, 0.16);
    this._osc('sine', 1760 * p, 440 * p, 0.08, 0.08);
  }

  playDash() {
    this._noise(0.18, 0.18, 600);
    const p = 0.95 + Math.random() * 0.1;
    this._osc('sawtooth', 200 * p, 60 * p, 0.18, 0.08);
  }

  playDashHit() {
    this._noise(0.12, 0.22, 1200);
    const p = 0.92 + Math.random() * 0.16;
    this._osc('square', 660 * p, 110 * p, 0.1, 0.16);
    this._osc('triangle', 220 * p, 50 * p, 0.15, 0.12);
  }

  playTake() {
    const p = 0.92 + Math.random() * 0.16;
    this._osc('sawtooth', 110 * p, 38 * p, 0.18, 0.16);
    this._osc('sine', 70 * p, 30 * p, 0.22, 0.1);
  }

  playCrystalHit() {
    const p = 0.9 + Math.random() * 0.2;
    this._osc('square', 80 * p, 32 * p, 0.16, 0.18);
    this._noise(0.1, 0.1, 200);
  }

  playLevelUp() {
    const base = 523.25; // C5
    // 三個音階上升 C → E → G
    const notes = [base, base * 1.26, base * 1.498];
    notes.forEach((f, i) => {
      setTimeout(() => {
        if (!this.ctx) return;
        const t = this._now();
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 0.4);

        // 加一個泛音
        const o2 = this.ctx.createOscillator();
        const g2 = this.ctx.createGain();
        o2.type = 'sine';
        o2.frequency.setValueAtTime(f * 2, t);
        g2.gain.setValueAtTime(0.06, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o2.connect(g2); g2.connect(this.master);
        o2.start(t); o2.stop(t + 0.4);
      }, i * 85);
    });
  }

  playSlingerShoot() {
    const p = 0.93 + Math.random() * 0.14;
    this._osc('square', 380 * p, 80 * p, 0.08, 0.1);
  }

  playBulletExpire() {
    // 子彈打到水晶
    this.playCrystalHit();
  }

  playTetherSnap() {
    this._noise(0.25, 0.25, 1500);
    const p = 0.95 + Math.random() * 0.1;
    this._osc('sawtooth', 1200 * p, 200 * p, 0.22, 0.18);
    this._osc('triangle', 300 * p, 60 * p, 0.3, 0.14);
  }

  playShield() {
    const p = 1.0 + Math.random() * 0.06;
    this._osc('sine', 660 * p, 990 * p, 0.16, 0.13);
    this._osc('triangle', 330 * p, 495 * p, 0.16, 0.08);
  }

  playGameOver() {
    const p = 0.9 + Math.random() * 0.1;
    this._osc('sawtooth', 220 * p, 50 * p, 0.6, 0.2);
    this._osc('sine', 110 * p, 40 * p, 0.8, 0.15);
    this._noise(0.4, 0.12, 100);
  }
}


/**
 * W4: 環境音層 — 用持續振盪器即時合成
 * - 低頻 drone：怪物密度越高、音量越大、頻率越低（壓迫感）
 * - Boss drop：500ms 全靜音 + sub-bass 重音
 */
class Ambient {
  constructor(mgr) {
    this.mgr = mgr;
    this.started = false;
    this.droneOsc = null;
    this.droneGain = null;
    this.droneFilter = null;
    this.tensionOsc = null;
    this.tensionGain = null;
  }

  start() {
    if (this.started || !this.mgr.ctx) return;
    const ctx = this.mgr.ctx;

    // === Layer 1: 基音 drone (sine 65Hz) ===
    this.droneOsc = ctx.createOscillator();
    this.droneOsc.type = 'sine';
    this.droneOsc.frequency.value = 65;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 280;
    this.droneFilter.Q.value = 0.5;
    this.droneOsc.connect(this.droneFilter);
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.mgr.master);
    this.droneOsc.start();

    // === Layer 2: 八度 pad (sine 130Hz) — 給和聲感不孤單 ===
    this.padOsc = ctx.createOscillator();
    this.padOsc.type = 'sine';
    this.padOsc.frequency.value = 130;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0;
    this.padOsc.connect(this.padGain);
    this.padGain.connect(this.mgr.master);
    this.padOsc.start();

    // === LFO 呼吸 (0.18 Hz, ±0.008 amp on droneGain) ===
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.18;     // ~5.5 秒一個週期
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.008;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.droneGain.gain);  // 加性 modulation
    this.lfo.start();

    // === Boss 氛圍 sub-bass (triangle 38Hz) ===
    this.bossSub = ctx.createOscillator();
    this.bossSub.type = 'triangle';
    this.bossSub.frequency.value = 38;
    this.bossSubGain = ctx.createGain();
    this.bossSubGain.gain.value = 0.0;
    this.bossSub.connect(this.bossSubGain);
    this.bossSubGain.connect(this.mgr.master);
    this.bossSub.start();

    // 已移除：tension whine（高頻嘯叫太煩）
    this.tensionOsc = null;
    this.tensionGain = null;

    this.started = true;
  }

  update(rawDt, enemyCount, bossActive) {
    if (!this.started) return;
    // 注意：不再因為 muted 提早 return — mute 由 master gain 控制
    // 之前的 bug：muted 時 ambient gain 永遠卡在初始 0，解 mute 後也不會復活
    const ctx = this.mgr.ctx;
    const now = ctx.currentTime;

    const density = Math.min(1, enemyCount / 500);

    // Drone 基音（可聽見但不刺耳）
    const targetDroneGain = 0.020 + density * 0.035;
    this.droneGain.gain.setTargetAtTime(targetDroneGain, now, 0.5);
    const targetDroneFreq = 70 - density * 12;
    this.droneOsc.frequency.setTargetAtTime(targetDroneFreq, now, 0.6);

    // 八度 pad（怪越多越響）
    const targetPadGain = 0.012 + density * 0.020;
    this.padGain.gain.setTargetAtTime(targetPadGain, now, 0.6);

    // Boss 氛圍：sub-bass triangle 緩慢淡入
    const subTarget = bossActive ? 0.035 : 0.0;
    this.bossSubGain.gain.setTargetAtTime(subTarget, now, 0.8);
  }

  /** Boss 召喚瞬間：500ms 靜音 + sub-bass drop */
  bossDrop() {
    // 順便讓 kick 停 1 秒，效果更猛
    if (this.mgr.kick) this.mgr.kick.silenceFor = 1.0;
    if (!this.started || this.mgr.muted) return;
    const ctx = this.mgr.ctx;
    const now = ctx.currentTime;
    const masterTarget = this.mgr.masterVol;

    // 全靜音 500ms 再回歸
    this.mgr.master.gain.cancelScheduledValues(now);
    this.mgr.master.gain.setValueAtTime(0, now);
    this.mgr.master.gain.setValueAtTime(0, now + 0.5);
    this.mgr.master.gain.exponentialRampToValueAtTime(masterTarget, now + 0.9);

    // Sub-bass drop
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(40, now + 0.5);
    sub.frequency.exponentialRampToValueAtTime(18, now + 2.5);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0, now + 0.5);
    subGain.gain.linearRampToValueAtTime(0.45, now + 0.55);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);
    sub.connect(subGain);
    subGain.connect(this.mgr.master);
    sub.start(now + 0.5);
    sub.stop(now + 3.2);
  }
}


/**
 * W6 程序化大鼓 — 怪物密度驅動的低頻 kick
 * - 怪物 100 隻：60 BPM（沉悶單拍）
 * - 怪物 1500 隻：140 BPM（密集急促）
 * - 怪越多 → 濾波 cutoff 提高（鼓點變脆變狠）
 * - Synth kick：80Hz → 40Hz 指數降頻，5ms attack + 120ms decay
 */
import { CONFIG as KICK_CFG } from './config.js';

class KickLayer {
  constructor(mgr) {
    this.mgr = mgr;
    this.beatInterval = 1.0;
    this.beatCountdown = 0;
    this.density = 0;
    this.silenceFor = 0;
    this.glitch = 0;            // W7: 每次 kick 起拍時拉高，給 vertex shader 抓取
  }

  /** 由 game._tick 餵 rawDt 與當前同屏怪物數
   *  B23: 怪太少時不打鼓，免開場無聊心跳聲 */
  update(rawDt, enemyCount) {
    if (!this.mgr.ctx || this.mgr.muted) return;
    if (this.silenceFor > 0) {
      this.silenceFor -= rawDt;
      this.beatCountdown = 0.2;
      return;
    }
    if (enemyCount < 50) {
      // 怪太少 → 不打鼓（暫停節拍但不重置 countdown，恢復時自然接上）
      return;
    }
    const density = Math.min(1, enemyCount / KICK_CFG.kickDensityCap);
    this.density = density;
    const bpm = KICK_CFG.kickMinBpm + density * (KICK_CFG.kickMaxBpm - KICK_CFG.kickMinBpm);
    this.beatInterval = 60 / bpm;
    this.beatCountdown -= rawDt;
    if (this.beatCountdown <= 0) {
      this.beatCountdown = this.beatInterval;
      this._kick(density);
      this.glitch = density * 0.9 + 0.1;   // W7: 起拍瞬間拉高（密度越高越強）
    }
    this.glitch = Math.max(0, this.glitch - rawDt * 4.5);   // 衰減
  }

  _kick(density) {
    const ctx = this.mgr.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(85, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.08);

    const gain = ctx.createGain();
    const peakGain = 0.18 + density * 0.18;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200 + density * 700;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.mgr.master);
    osc.start(now);
    osc.stop(now + 0.16);

    // 高密度時加 click 點（高頻短脈衝）
    if (density > 0.5) {
      const click = ctx.createOscillator();
      click.type = 'triangle';
      click.frequency.value = 2000;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.05 * density, now);
      cg.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
      click.connect(cg); cg.connect(this.mgr.master);
      click.start(now); click.stop(now + 0.02);
    }
  }
}
