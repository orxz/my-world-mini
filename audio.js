// ============================================================
// audio.js - 程序化音效(Web Audio 合成,无外部文件)
// 从 game.js 提取:audio 对象(OscillatorNode + 白噪声合成)
// 浏览器经 <script> 加载后全局可用(game.js 直接引用 audio);
// Node 环境可 require(对象字面量无 DOM 依赖,init 才触达 AudioContext)。
// ============================================================
(function (global) {
  'use strict';

  const audio = {
    ctx: null,
    masterGain: null,
    enabled: true,
    volume: 0.35,
    noiseBuffer: null,
    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      try {
        const AC = global.AudioContext || global.webkitAudioContext;
        this.ctx = new AC();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.enabled ? this.volume : 0;
        this.masterGain.connect(this.ctx.destination);
        // 预生成白噪声 buffer
        const len = this.ctx.sampleRate * 0.5;
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) {
        this.enabled = false;
      }
    },
    play(type, blockType) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      // 破坏音按方块类型调频率:石=低频,木=中频,叶=沙沙,沙/雪=高频软
      if (type === 'break' && blockType) {
        let freq = 600;
        if (blockType === 'stone' || blockType === 'brick') freq = 350;
        else if (blockType === 'wood' || blockType === 'planks') freq = 500;
        else if (blockType === 'leaves') freq = 900;
        else if (blockType === 'sand' || blockType === 'snow' || blockType === 'gravel') freq = 1200;
        this._noise(0.12, freq, 0.4, t);
        return;
      }
      switch (type) {
        case 'break': this._noise(0.12, 600, 0.4, t); break;
        case 'place': this._tone('square', 220, 0.07, 0.3, t); this._tone('square', 160, 0.06, 0.25, t + 0.03); break;
        case 'step':  this._noise(0.05, 1200, 0.15, t); break;
        case 'jump':  this._sweep(300, 600, 0.12, t); break;
        case 'water': this._tone('sine', 180, 0.4, 0.25, t); this._tone('sine', 240, 0.4, 0.15, t + 0.05); break;
        case 'hurt':  this._tone('sawtooth', 200, 0.15, 0.3, t); break;
      }
    },
    _tone(wave, freq, dur, gain, t0) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = wave; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(this.masterGain);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    },
    _noise(dur, filterFreq, gain, t0) {
      if (!this.noiseBuffer) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = filterFreq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filt); filt.connect(g); g.connect(this.masterGain);
      src.start(t0); src.stop(t0 + dur + 0.02);
    },
    _sweep(f0, f1, dur, t0) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f0, t0);
      osc.frequency.linearRampToValueAtTime(f1, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(this.masterGain);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    },
  };

  // 导出(Node 环境)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { audio };
  }
  // 浏览器:挂到全局(game.js 直接引用 audio)
  global.AUDIOLIB = { audio };
  global.audio = audio;

})(typeof window !== 'undefined' ? window : globalThis);
