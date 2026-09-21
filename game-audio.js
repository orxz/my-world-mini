// ============================================================
// 第十八部分:音效系统(Web Audio 程序化合成)
// ============================================================
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
      const AC = window.AudioContext || window.webkitAudioContext;
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
      case 'pig':   this._tone('triangle', 330, 0.1, 0.22, t); this._tone('triangle', 250, 0.12, 0.18, t + 0.09); break;
      case 'zombie':  this._tone('sawtooth', 95, 0.32, 0.2, t); this._tone('sawtooth', 72, 0.3, 0.16, t + 0.18); break;
      case 'fuse':    this._noise(0.9, 5200, 0.28, t); break;
      case 'explode': this._noise(0.5, 280, 0.75, t); this._tone('sawtooth', 55, 0.4, 0.35, t); break;
      // ---- 打磨轮扩充(R43) ----
      case 'pop':     this._sweep(900, 300, 0.07, t); this._tone('sine', 520, 0.05, 0.18, t + 0.02); break;            // 弹出:产蛋/活塞 pop
      case 'xp':      this._tone('sine', 880, 0.09, 0.2, t); this._tone('sine', 1320, 0.12, 0.16, t + 0.06); break;    // 经验吸收(清脆双音)
      case 'levelup': this._tone('triangle', 523, 0.12, 0.25, t); this._tone('triangle', 659, 0.12, 0.25, t + 0.1); this._tone('triangle', 784, 0.2, 0.28, t + 0.2); break;   // 升级琶音
      case 'splash':  this._noise(0.28, 900, 0.35, t); this._tone('sine', 300, 0.15, 0.15, t + 0.03); break;           // 舀水/倒水
      case 'click':   this._noise(0.03, 2600, 0.3, t); this._tone('square', 1200, 0.03, 0.12, t); break;               // 拉杆/中继器机械咔哒
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

