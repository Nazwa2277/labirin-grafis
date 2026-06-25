export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.unlocked = false;
    this.masterVolume = 0.6;

    // --- Footstep state ---
    this.footstepTimer = 0;
    this._footstepPhase = 0;   // 0=kiri, 1=kanan
    this._footstepSwing = 0;   // posisi dalam siklus langkah (0..1)

    // --- Monster/kuntilanak state ---
    this.monsterState = 'PATROL';
    this.monsterGrowlTimer = 0;
    this.monsterDistance01 = 1;

    // --- Tension drone ---
    this.droneNodes = null;
    this.droneActive = false;

    this._bindUnlockOnGesture();
  }

  _bindUnlockOnGesture() {
    const unlock = () => {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) { console.warn('[Audio] Web Audio API tidak didukung.'); return; }
    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(this.ctx.destination);
    this.unlocked = true;
  }

  setVolume(value) {
    this.masterVolume = value;
    if (this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(value, now, 0.05);
    }
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  // =======================================================================
  // 1) FOOTSTEP — realistis, dua layer, ritme mengikuti langkah
  // =======================================================================

  updateFootsteps(delta, isMoving, isRunning) {
    if (!this.ctx) return;
    if (!isMoving) { this.footstepTimer = 0; this._footstepSwing = 0; return; }

    // Cadence: jalan ~1.7 Hz (0.58s/langkah), lari ~2.6 Hz (0.38s/langkah)
    const interval = isRunning ? 0.38 : 0.58;
    this.footstepTimer -= delta;
    if (this.footstepTimer <= 0) {
      this.footstepTimer += interval;
      this._footstepPhase = 1 - this._footstepPhase;
      this._playFootstepHit(isRunning, this._footstepPhase);
    }
  }

  /**
   * Dua layer per langkah:
   *  - Layer A: thud rendah (hentakan tumit/telapak ke lantai batu)
   *  - Layer B: scrape tipis (gesekan ujung sepatu setelah hentakan)
   * Kaki kiri/kanan punya sedikit perbedaan pitch & timing.
   */
  _playFootstepHit(isRunning, phase) {
    const t = this.now;
    const ctx = this.ctx;

    // === LAYER A: Thud (hentakan) ===
    const thudBuf = this._createNoiseBuffer(0.12);
    const thud = ctx.createBufferSource();
    thud.buffer = thudBuf;

    // Low-pass ketat agar terdengar berat seperti lantai beton/batu
    const thudLp = ctx.createBiquadFilter();
    thudLp.type = 'lowpass';
    // Kaki kiri sedikit lebih gelap (pitch imajiner)
    thudLp.frequency.value = isRunning
      ? 380 + phase * 35 + (Math.random() * 30 - 15)
      : 260 + phase * 25 + (Math.random() * 20 - 10);
    thudLp.Q.value = 1.2;

    // Notch di mid agar tidak "plastik"
    const thudNotch = ctx.createBiquadFilter();
    thudNotch.type = 'notch';
    thudNotch.frequency.value = 900;
    thudNotch.Q.value = 0.8;

    const thudGain = ctx.createGain();
    const thudPeak = isRunning ? 0.62 : 0.42;
    thudGain.gain.setValueAtTime(0.0001, t);
    thudGain.gain.exponentialRampToValueAtTime(thudPeak, t + 0.007);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, t + (isRunning ? 0.11 : 0.14));

    thud.connect(thudLp);
    thudLp.connect(thudNotch);
    thudNotch.connect(thudGain);
    thudGain.connect(this.masterGain);
    thud.start(t);
    thud.stop(t + 0.18);

    // === LAYER B: Scrape/gesekan tipis (mulai ~30ms setelah thud) ===
    const scrapeDelay = 0.028 + Math.random() * 0.012;
    const scrapeBuf = this._createNoiseBuffer(0.07);
    const scrape = ctx.createBufferSource();
    scrape.buffer = scrapeBuf;

    const scrapeBp = ctx.createBiquadFilter();
    scrapeBp.type = 'bandpass';
    scrapeBp.frequency.value = 1800 + phase * 200;
    scrapeBp.Q.value = 1.5;

    const scrapeGain = ctx.createGain();
    const scrapePeak = isRunning ? 0.09 : 0.06;
    scrapeGain.gain.setValueAtTime(0.0001, t + scrapeDelay);
    scrapeGain.gain.exponentialRampToValueAtTime(scrapePeak, t + scrapeDelay + 0.01);
    scrapeGain.gain.exponentialRampToValueAtTime(0.0001, t + scrapeDelay + 0.07);

    scrape.connect(scrapeBp);
    scrapeBp.connect(scrapeGain);
    scrapeGain.connect(this.masterGain);
    scrape.start(t + scrapeDelay);
    scrape.stop(t + scrapeDelay + 0.10);

    // === Sub-thud oscillator (resonansi lantai) ===
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(isRunning ? 72 : 58, t);
    subOsc.frequency.exponentialRampToValueAtTime(28, t + 0.10);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.exponentialRampToValueAtTime(isRunning ? 0.18 : 0.12, t + 0.005);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(t);
    subOsc.stop(t + 0.12);
  }

  // =======================================================================
  // 2) KEY PICKUP
  // =======================================================================

  playKeyPickup() {
    if (!this.ctx) return;
    const t = this.now;
    const ctx = this.ctx;
    const freqs = [880.0, 1108.73, 1318.51];
    freqs.forEach((freq, i) => {
      const s = t + i * 0.09;
      const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
      const osc2 = ctx.createOscillator(); osc2.type = 'triangle'; osc2.frequency.value = freq * 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.22, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.5);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, s);
      g2.gain.exponentialRampToValueAtTime(0.07, s + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.0001, s + 0.4);
      osc.connect(g); g.connect(this.masterGain);
      osc2.connect(g2); g2.connect(this.masterGain);
      osc.start(s); osc.stop(s + 0.55);
      osc2.start(s); osc2.stop(s + 0.45);
    });
  }

  // =======================================================================
  // 3) MONSTER / KUNTILANAK
  // =======================================================================

  updateMonster(delta, state, distance) {
    if (!this.ctx) return;
    this.monsterState = state;
    const maxDist = 14;
    this.monsterDistance01 = Math.min(1, Math.max(0, distance / maxDist));
    this.monsterGrowlTimer -= delta;
    if (this.monsterGrowlTimer <= 0) {
      const isChasing = state === 'CHASE';
      this.monsterGrowlTimer = isChasing
        ? 1.0 + Math.random() * 0.8
        : 4.0 + Math.random() * 3.5;
      // Pilih suara kuntilanak secara acak agar bervariasi
      const roll = Math.random();
      if (isChasing) {
        roll < 0.45 ? this._playKuntilanakLaugh(true) : this._playKuntilanakWail(true);
      } else {
        if (roll < 0.40) this._playKuntilanakWail(false);
        else if (roll < 0.70) this._playKuntilanakWhisper();
        else this._playKuntilanakLaugh(false);
      }
    }
  }

  /**
   * Tawa kuntilanak — melengking tinggi, pitch naik mendadak lalu turun,
   * dengan vibrato cepat dan noise hiss (seperti "Hihihi..." yang bergema).
   */
  _playKuntilanakLaugh(isChasing) {
    const t = this.now;
    const ctx = this.ctx;
    const proximity = 0.25 + (1 - this.monsterDistance01) * 0.75;
    const baseVol = (isChasing ? 0.55 : 0.28) * proximity;

    // Tiga "cekikikan" berturut-turut dengan jeda kecil
    const laughCount = isChasing ? 3 : 2;
    for (let i = 0; i < laughCount; i++) {
      const offset = i * (isChasing ? 0.22 : 0.32);
      const startPitch = 700 + Math.random() * 200;

      // Osc utama — melengking tinggi
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(startPitch, t + offset);
      osc.frequency.exponentialRampToValueAtTime(startPitch * 1.6, t + offset + 0.06);
      osc.frequency.exponentialRampToValueAtTime(startPitch * 0.5, t + offset + 0.25);

      // Vibrato cepat (khas tawa hantu)
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = isChasing ? 18 : 12;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 45;
      lfo.connect(lfoG);
      lfoG.connect(osc.frequency);

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 500;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + offset);
      g.gain.exponentialRampToValueAtTime(baseVol, t + offset + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.28);

      // Noise hiss tipis (tarikan napas)
      const nBuf = this._createNoiseBuffer(0.20);
      const nSrc = ctx.createBufferSource();
      nSrc.buffer = nBuf;
      const nHp = ctx.createBiquadFilter();
      nHp.type = 'highpass';
      nHp.frequency.value = 3000;
      const nG = ctx.createGain();
      nG.gain.setValueAtTime(0.0001, t + offset);
      nG.gain.exponentialRampToValueAtTime(baseVol * 0.25, t + offset + 0.03);
      nG.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.20);

      osc.connect(hp); hp.connect(g); g.connect(this.masterGain);
      nSrc.connect(nHp); nHp.connect(nG); nG.connect(this.masterGain);

      osc.start(t + offset); osc.stop(t + offset + 0.32);
      lfo.start(t + offset); lfo.stop(t + offset + 0.32);
      nSrc.start(t + offset); nSrc.stop(t + offset + 0.25);
    }
  }

  /**
   * Tangisan/ratapan kuntilanak — siulan panjang naik-turun menyayat,
   * terdengar seperti wanita menangis dari kejauhan.
   */
  _playKuntilanakWail(isChasing) {
    const t = this.now;
    const ctx = this.ctx;
    const proximity = 0.2 + (1 - this.monsterDistance01) * 0.80;
    const baseVol = (isChasing ? 0.45 : 0.22) * proximity;
    const duration = isChasing ? 1.8 : 2.8;

    // Osc utama — suara vokal seperti "Huuu..." melengking
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const startF = 380 + Math.random() * 120;
    osc.frequency.setValueAtTime(startF * 0.6, t);
    osc.frequency.exponentialRampToValueAtTime(startF * 1.3, t + duration * 0.3);
    osc.frequency.exponentialRampToValueAtTime(startF * 0.4, t + duration * 0.75);
    osc.frequency.exponentialRampToValueAtTime(startF * 0.8, t + duration);

    // Harmonik kedua (suara formant vokal wanita)
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(startF * 1.5, t);
    osc2.frequency.exponentialRampToValueAtTime(startF * 2.0, t + duration * 0.3);
    osc2.frequency.exponentialRampToValueAtTime(startF * 0.9, t + duration);

    // Vibrato lambat (napas bergetar)
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 5.5;
    const lfoG = ctx.createGain();
    lfoG.gain.setValueAtTime(0, t);
    lfoG.gain.linearRampToValueAtTime(22, t + duration * 0.4); // vibrato masuk perlahan
    lfo.connect(lfoG);
    lfoG.connect(osc.frequency);
    lfoG.connect(osc2.frequency);

    // Filter formant
    const formant = ctx.createBiquadFilter();
    formant.type = 'peaking';
    formant.frequency.value = 800;
    formant.gain.value = 8;
    formant.Q.value = 2;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(baseVol, t + 0.15);
    g.gain.setValueAtTime(baseVol, t + duration - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(baseVol * 0.4, t + 0.2);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(formant); formant.connect(g); g.connect(this.masterGain);
    osc2.connect(g2); g2.connect(this.masterGain);

    osc.start(t); osc.stop(t + duration + 0.1);
    osc2.start(t); osc2.stop(t + duration + 0.1);
    lfo.start(t); lfo.stop(t + duration + 0.1);
  }

  /**
   * Bisikan kuntilanak — suara sisipan pelan seperti nama dipanggil,
   * berbasis noise yang difilter formant vokal.
   */
  _playKuntilanakWhisper() {
    const t = this.now;
    const ctx = this.ctx;
    const proximity = 0.15 + (1 - this.monsterDistance01) * 0.55;
    const duration = 1.2 + Math.random() * 0.8;

    const nBuf = this._createNoiseBuffer(duration + 0.2, true);
    const nSrc = ctx.createBufferSource();
    nSrc.buffer = nBuf;

    // Bandpass sempit imitasi frekuensi vokal bisikan
    const bp1 = ctx.createBiquadFilter();
    bp1.type = 'bandpass';
    bp1.frequency.value = 800 + Math.random() * 400;
    bp1.Q.value = 4;

    const bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.value = 2200;
    bp2.Q.value = 3;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18 * proximity, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    nSrc.connect(bp1); bp1.connect(bp2); bp2.connect(g); g.connect(this.masterGain);
    nSrc.start(t); nSrc.stop(t + duration + 0.1);
  }

  /** Jumpscare — tawa kuntilanak meledak keras saat menangkap pemain. */
  playMonsterJumpscare() {
    if (!this.ctx) return;
    const t = this.now;
    const ctx = this.ctx;

    // Shriek melengking tinggi
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.25);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.7);

    const shriekVib = ctx.createOscillator();
    shriekVib.type = 'sine';
    shriekVib.frequency.value = 22;
    const svG = ctx.createGain(); svG.gain.value = 60;
    shriekVib.connect(svG); svG.connect(osc.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.85, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);

    // Noise burst (napas/hiss keras)
    const nBuf = this._createNoiseBuffer(0.9);
    const nSrc = ctx.createBufferSource();
    nSrc.buffer = nBuf;
    const nHp = ctx.createBiquadFilter();
    nHp.type = 'highpass'; nHp.frequency.value = 1200;
    const nG = ctx.createGain();
    nG.gain.setValueAtTime(0.0001, t);
    nG.gain.exponentialRampToValueAtTime(0.5, t + 0.04);
    nG.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);

    osc.connect(g); g.connect(this.masterGain);
    nSrc.connect(nHp); nHp.connect(nG); nG.connect(this.masterGain);

    osc.start(t); osc.stop(t + 1.0);
    shriekVib.start(t); shriekVib.stop(t + 1.0);
    nSrc.start(t); nSrc.stop(t + 1.0);

    // Tawa cekikik pendek setelahnya
    setTimeout(() => { if (this.ctx) this._playKuntilanakLaugh(true); }, 400);
  }

  // =======================================================================
  // 4) TENSION DRONE — backsound seram berlapis
  // =======================================================================

  startTensionDrone() {
    if (!this.ctx || this.droneActive) return;
    const ctx = this.ctx;
    const t = this.now;

    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0.0001, t);
    droneGain.gain.exponentialRampToValueAtTime(0.18, t + 3.0);
    droneGain.connect(this.masterGain);

    // --- Layer 1: Sub-bass drone (sangat rendah, terasa di perut) ---
    const sub1 = ctx.createOscillator();
    sub1.type = 'sine';
    sub1.frequency.value = 32; // D1 — terasa lebih sebagai getaran

    const sub2 = ctx.createOscillator();
    sub2.type = 'sine';
    sub2.frequency.value = 34.6; // sedikit detune -> beating mual

    // --- Layer 2: Mid-horror string (seperti cello melengking sedih) ---
    const strOsc = ctx.createOscillator();
    strOsc.type = 'sawtooth';
    strOsc.frequency.value = 98; // G2

    const strOsc2 = ctx.createOscillator();
    strOsc2.type = 'sawtooth';
    strOsc2.frequency.value = 103.8; // sedikit sharp -> disonan

    const strFilter = ctx.createBiquadFilter();
    strFilter.type = 'lowpass';
    strFilter.frequency.value = 280;
    strFilter.Q.value = 2;

    const strGain = ctx.createGain();
    strGain.gain.value = 0.35;

    // --- Layer 3: Noise atmosphere (angin lorong gelap) ---
    const atmoNoise = this._createNoiseBuffer(6, true);
    const atmoSrc = ctx.createBufferSource();
    atmoSrc.buffer = atmoNoise;
    atmoSrc.loop = true;

    const atmoFilter = ctx.createBiquadFilter();
    atmoFilter.type = 'bandpass';
    atmoFilter.frequency.value = 320;
    atmoFilter.Q.value = 0.4;

    const atmoGain = ctx.createGain();
    atmoGain.gain.setValueAtTime(0.0001, t);
    atmoGain.gain.exponentialRampToValueAtTime(0.032, t + 3.0);

    // --- LFO "napas" (volume drone naik-turun sangat lambat) ---
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.06;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.04;
    lfo.connect(lfoG);
    lfoG.connect(droneGain.gain);

    // --- LFO2: modulasi filter string (bergerak seperti ada sesuatu) ---
    const lfo2 = ctx.createOscillator();
    lfo2.type = 'sine';
    lfo2.frequency.value = 0.11;
    const lfo2G = ctx.createGain();
    lfo2G.gain.value = 60;
    lfo2.connect(lfo2G);
    lfo2G.connect(strFilter.frequency);

    sub1.connect(droneGain);
    sub2.connect(droneGain);
    strOsc.connect(strFilter); strOsc2.connect(strFilter);
    strFilter.connect(strGain); strGain.connect(droneGain);
    atmoSrc.connect(atmoFilter); atmoFilter.connect(atmoGain);
    atmoGain.connect(this.masterGain);

    sub1.start(t); sub2.start(t);
    strOsc.start(t); strOsc2.start(t);
    lfo.start(t); lfo2.start(t);
    atmoSrc.start(t);

    // Bisikan hantu periodik
    const whisperInterval = setInterval(() => {
      if (!this.droneActive) return;
      if (Math.random() < 0.6) this._playKuntilanakWhisper();
    }, 7000 + Math.random() * 5000);

    // Detak jantung pelan
    const heartInterval = setInterval(() => {
      if (!this.droneActive) return;
      this._playHeartbeatPulse();
    }, 3200);

    this.droneNodes = {
      sub1, sub2, strOsc, strOsc2, lfo, lfo2,
      droneGain, strGain, atmoSrc, atmoGain,
      whisperInterval, heartInterval,
    };
    this.droneActive = true;
  }

  _playHeartbeatPulse() {
    if (!this.ctx) return;
    const t = this.now;
    const ctx = this.ctx;
    [0, 0.20].forEach((offset) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(55, t + offset);
      osc.frequency.exponentialRampToValueAtTime(28, t + offset + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + offset);
      g.gain.exponentialRampToValueAtTime(0.14, t + offset + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.20);
      osc.connect(g); g.connect(this.masterGain);
      osc.start(t + offset); osc.stop(t + offset + 0.22);
    });
  }

  setDroneIntensity(isChasing) {
    if (!this.droneActive || !this.droneNodes) return;
    const t = this.now;
    const targetVol = isChasing ? 0.34 : 0.18;
    this.droneNodes.droneGain.gain.cancelScheduledValues(t);
    this.droneNodes.droneGain.gain.setTargetAtTime(targetVol, t, 0.5);
  }

  stopTensionDrone(fadeSeconds = 1.5) {
    if (!this.ctx || !this.droneActive || !this.droneNodes) return;
    const t = this.now;
    const n = this.droneNodes;

    clearInterval(n.whisperInterval);
    clearInterval(n.heartInterval);

    n.droneGain.gain.cancelScheduledValues(t);
    n.droneGain.gain.setTargetAtTime(0.0001, t, fadeSeconds / 4);
    n.atmoGain.gain.cancelScheduledValues(t);
    n.atmoGain.gain.setTargetAtTime(0.0001, t, fadeSeconds / 4);

    const stopT = t + fadeSeconds + 0.2;
    n.sub1.stop(stopT); n.sub2.stop(stopT);
    n.strOsc.stop(stopT); n.strOsc2.stop(stopT);
    n.lfo.stop(stopT); n.lfo2.stop(stopT);
    n.atmoSrc.stop(stopT);

    this.droneActive = false;
    this.droneNodes = null;
  }

  playVictoryStinger() {
    if (!this.ctx) return;
    const t = this.now;
    const ctx = this.ctx;
    const freqs = [523.25, 659.25, 783.99, 1046.5];
    freqs.forEach((freq, i) => {
      const s = t + i * 0.12;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.25, s + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.8);
      osc.connect(g); g.connect(this.masterGain);
      osc.start(s); osc.stop(s + 0.85);
    });
  }

  // =======================================================================
  // UTIL
  // =======================================================================

  _createNoiseBuffer(duration, smooth = false) {
    const ctx = this.ctx;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (smooth) {
        last = last * 0.96 + white * 0.04;
        data[i] = last * 3.0;
      } else {
        data[i] = white;
      }
    }
    return buffer;
  }

  stopAll() {
    this.stopTensionDrone(0.3);
    this.footstepTimer = 0;
  }
}
