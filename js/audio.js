/**
 * =========================================================================
 *  audio.js
 * =========================================================================
 *  Sistem audio terpusat untuk game, dibangun di atas Web Audio API.
 *  Semua efek suara di-SINTESIS secara prosedural (oscillator, noise
 *  buffer, filter, envelope) — tidak butuh file .mp3/.wav eksternal,
 *  sehingga game tetap ringan & langsung berjalan tanpa aset tambahan.
 *
 *  Fitur yang disediakan:
 *   1. Footstep (langkah kaki)  -> berirama mengikuti kecepatan jalan/lari
 *   2. Key pickup chime         -> dimainkan saat kunci berhasil ditemukan
 *   3. Monster growl/snarl      -> idle saat patroli, lebih intens saat
 *                                  mengejar (CHASE), jumpscare saat menangkap
 *   4. Tension ambience (drone) -> backsound tegang terus-menerus selama
 *                                  permainan berlangsung, berhenti halus
 *                                  (fade out) begitu pintu keluar berhasil
 *                                  ditemukan (victory)
 *
 *  Semua node suara dirutekan melalui satu `masterGain` sehingga slider
 *  "Volume" pada GUI (lil-gui) bisa mengatur volume keseluruhan game.
 * =========================================================================
 */

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.unlocked = false;
    this.masterVolume = 0.6;

    // --- Footstep state ---
    this.footstepTimer = 0;
    this.footstepEnabled = false;
    this.footstepIsRunning = false;
    this._footstepToggle = 0; // untuk selang-seling kaki kiri/kanan (nada beda tipis)

    // --- Monster ambience state ---
    this.monsterState = 'PATROL'; // 'PATROL' | 'CHASE'
    this.monsterGrowlTimer = 0;
    this.monsterDistance01 = 1; // 0 = sangat dekat, 1 = jauh/tak terdeteksi

    // --- Tension drone (backsound tegang) ---
    this.droneNodes = null;
    this.droneActive = false;

    this._bindUnlockOnGesture();
  }

  /**
   * Browser modern mewajibkan AudioContext dibuat/di-resume setelah ada
   * interaksi user (klik/keydown). Kita pasang listener sekali di awal
   * agar AudioContext otomatis "unlock" begitu user pertama kali klik
   * tombol mulai atau menekan tombol apapun.
   */
  _bindUnlockOnGesture() {
    const unlock = () => {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  /** Inisialisasi AudioContext + master gain. Aman dipanggil berkali-kali. */
  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      console.warn('[Audio] Web Audio API tidak didukung browser ini.');
      return;
    }
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(this.ctx.destination);

    this.unlocked = true;
  }

  /** Dipanggil dari GUI slider "Volume" (0..1). */
  setVolume(value) {
    this.masterVolume = value;
    if (this.masterGain) {
      // Sedikit ramp agar tidak terjadi klik/pop saat slider digeser cepat.
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(value, now, 0.05);
    }
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // =======================================================================
  // 1) FOOTSTEP — suara langkah kaki, ritme mengikuti kecepatan jalan
  // =======================================================================

  /**
   * Dipanggil setiap frame dari Player/Game loop.
   * @param {number} delta - detik sejak frame sebelumnya
   * @param {boolean} isMoving - apakah pemain sedang bergerak (WASD aktif)
   * @param {boolean} isRunning - apakah pemain sedang lari (Shift)
   */
  updateFootsteps(delta, isMoving, isRunning) {
    if (!this.ctx) return;

    if (!isMoving) {
      this.footstepTimer = 0;
      return;
    }

    // Interval antar langkah: lebih cepat saat lari, lebih lambat saat jalan.
    // Nilai ini meniru "cadence" langkah kaki manusia berjalan/berlari.
    const interval = isRunning ? 0.30 : 0.46;

    this.footstepTimer -= delta;
    if (this.footstepTimer <= 0) {
      this.footstepTimer = interval;
      this._playFootstepHit(isRunning);
    }
  }

  /** Satu "hit" suara langkah kaki: noise pendek yang difilter low-pass
   *  agar terdengar seperti hentakan sepatu di lantai batu/beton. */
  _playFootstepHit(isRunning) {
    const t = this.now;
    const ctx = this.ctx;

    const buffer = this._createNoiseBuffer(0.09);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // Selang-seling sedikit frekuensi antar langkah agar tidak monoton
    // (mensimulasikan kaki kiri/kanan yang sedikit berbeda).
    this._footstepToggle = 1 - this._footstepToggle;
    filter.frequency.value = (isRunning ? 420 : 320) + this._footstepToggle * 40;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    const peakVol = isRunning ? 0.5 : 0.34;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peakVol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (isRunning ? 0.10 : 0.13));

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(t);
    noise.stop(t + 0.15);
  }

  // =======================================================================
  // 2) KEY PICKUP — chime pendek saat kunci berhasil ditemukan
  // =======================================================================

  playKeyPickup() {
    if (!this.ctx) return;
    const t = this.now;
    const ctx = this.ctx;

    // Arpeggio 3 nada naik (mirip notifikasi "item didapat") + sedikit
    // shimmer agar terasa magis/berkilau, cocok dengan visual kunci emas.
    const freqs = [880.0, 1108.73, 1318.51]; // A5, C#6, E6 — chord mayor terang
    freqs.forEach((freq, i) => {
      const startT = t + i * 0.09;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const osc2 = ctx.createOscillator(); // lapisan oktaf untuk shimmer
      osc2.type = 'triangle';
      osc2.frequency.value = freq * 2;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, startT);
      gain.gain.exponentialRampToValueAtTime(0.22, startT + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startT + 0.5);

      const gain2 = ctx.createGain();
      gain2.gain.setValueAtTime(0.0001, startT);
      gain2.gain.exponentialRampToValueAtTime(0.07, startT + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.0001, startT + 0.4);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc2.connect(gain2);
      gain2.connect(this.masterGain);

      osc.start(startT);
      osc.stop(startT + 0.55);
      osc2.start(startT);
      osc2.stop(startT + 0.45);
    });
  }

  // =======================================================================
  // 3) MONSTER — growl idle saat patroli, lebih intens & cepat saat CHASE,
  //    plus jumpscare saat berhasil menangkap pemain
  // =======================================================================

  /**
   * @param {number} delta
   * @param {'PATROL'|'CHASE'} state
   * @param {number} distance - jarak dunia monster ke pemain (untuk panning volume)
   */
  updateMonster(delta, state, distance) {
    if (!this.ctx) return;
    this.monsterState = state;

    // Normalisasi jarak -> volume growl (semakin dekat semakin keras)
    const maxAudibleDist = 14;
    this.monsterDistance01 = Math.min(1, Math.max(0, distance / maxAudibleDist));

    this.monsterGrowlTimer -= delta;
    if (this.monsterGrowlTimer <= 0) {
      const isChasing = state === 'CHASE';
      // Saat mengejar, growl lebih sering muncul (lebih menegangkan)
      this.monsterGrowlTimer = isChasing
        ? 1.1 + Math.random() * 1.0
        : 3.5 + Math.random() * 3.0;
      this._playMonsterGrowl(isChasing);
    }
  }

  /** Growl rendah bernuansa horror: kombinasi noise + osc frekuensi rendah
   *  yang dimodulasi sedikit agar terasa "organik" dan mengancam. */
  _playMonsterGrowl(isChasing) {
    const t = this.now;
    const ctx = this.ctx;

    const proximityVol = 0.25 + (1 - this.monsterDistance01) * 0.65; // dekat = lebih keras
    const baseVol = (isChasing ? 0.5 : 0.22) * proximityVol;
    const duration = isChasing ? 0.9 : 1.4;

    // Lapisan 1: oscillator sawtooth rendah sebagai "body" growl
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const startFreq = isChasing ? 70 : 55;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 0.6, t + duration);

    // Sedikit vibrato/growl modulation
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = isChasing ? 14 : 7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = isChasing ? 18 : 8;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const oscFilter = ctx.createBiquadFilter();
    oscFilter.type = 'lowpass';
    oscFilter.frequency.value = isChasing ? 380 : 220;

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, t);
    oscGain.gain.exponentialRampToValueAtTime(baseVol, t + 0.12);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(oscFilter);
    oscFilter.connect(oscGain);
    oscGain.connect(this.masterGain);

    // Lapisan 2: noise gravelly agar growl terasa "berserat" / kasar
    const noiseBuf = this._createNoiseBuffer(duration);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = isChasing ? 300 : 180;
    noiseFilter.Q.value = 0.8;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.exponentialRampToValueAtTime(baseVol * 0.4, t + 0.12);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration + 0.05);
    lfo.start(t);
    lfo.stop(t + duration + 0.05);
    noise.start(t);
    noise.stop(t + duration + 0.05);
  }

  /** Jumpscare singkat & keras saat monster berhasil menangkap pemain. */
  playMonsterJumpscare() {
    if (!this.ctx) return;
    const t = this.now;
    const ctx = this.ctx;

    // Shriek tinggi melengking + noise tebal, klasik jumpscare horror.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.6);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.8, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);

    const noiseBuf = this._createNoiseBuffer(0.9);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 500;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.5, t + 0.04);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);

    osc.connect(gain);
    gain.connect(this.masterGain);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 1.0);
    noise.start(t);
    noise.stop(t + 1.0);
  }

  // =======================================================================
  // 4) TENSION DRONE — backsound tegang berkelanjutan sepanjang permainan
  // =======================================================================

  /** Mulai backsound drone tegang (dipanggil saat game dimulai). */
  startTensionDrone() {
    if (!this.ctx || this.droneActive) return;
    const ctx = this.ctx;
    const t = this.now;

    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0.0001, t);
    droneGain.gain.exponentialRampToValueAtTime(0.16, t + 2.0); // fade in halus
    droneGain.connect(this.masterGain);

    // --- Drone 1: oscillator rendah (bass drone) ---
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 55; // A1, terasa berat & mengancam

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 58.27; // sedikit detune -> beating tone yang membuat resah

    // --- LFO untuk membuat drone "bernapas" naik-turun, menambah tensi ---
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08; // sangat lambat
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(droneGain.gain);

    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 220;

    osc1.connect(droneFilter);
    osc2.connect(droneFilter);
    droneFilter.connect(droneGain);

    // --- Lapisan noise tipis (wind/atmosphere) agar tidak terasa kosong ---
    const noiseBuf = this._createNoiseBuffer(4, true);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 400;
    noiseFilter.Q.value = 0.3;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.025, t + 2.5);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    // --- "Heartbeat" pulse pelan-pelan untuk menambah ketegangan ---
    const heartbeatInterval = setInterval(() => {
      if (!this.droneActive) return;
      this._playHeartbeatPulse();
    }, 2600);

    osc1.start(t);
    osc2.start(t);
    lfo.start(t);
    noiseSrc.start(t);

    this.droneNodes = {
      osc1, osc2, lfo, lfoGain, droneFilter, droneGain,
      noiseSrc, noiseFilter, noiseGain,
      heartbeatInterval,
    };
    this.droneActive = true;
  }

  /** Detak jantung pelan sebagai elemen tambahan suasana tegang. */
  _playHeartbeatPulse() {
    if (!this.ctx) return;
    const t = this.now;
    const ctx = this.ctx;

    [0, 0.18].forEach((offset) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, t + offset);
      osc.frequency.exponentialRampToValueAtTime(35, t + offset + 0.15);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, t + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.18);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + offset);
      osc.stop(t + offset + 0.2);
    });
  }

  /** Menambah intensitas drone saat monster mengejar (CHASE), dipanggil
   *  dari main.js berdasarkan status enemy agar backsound makin mencekam. */
  setDroneIntensity(isChasing) {
    if (!this.droneActive || !this.droneNodes) return;
    const t = this.now;
    const targetVol = isChasing ? 0.30 : 0.16;
    this.droneNodes.droneGain.gain.cancelScheduledValues(t);
    this.droneNodes.droneGain.gain.setTargetAtTime(targetVol, t, 0.6);
  }

  /**
   * Hentikan backsound tegang dengan fade-out halus.
   * Dipanggil saat pintu keluar berhasil ditemukan (victory) ATAU saat
   * game over / reset, supaya drone tidak menumpuk di sesi berikutnya.
   */
  stopTensionDrone(fadeSeconds = 1.5) {
    if (!this.ctx || !this.droneActive || !this.droneNodes) return;
    const t = this.now;
    const nodes = this.droneNodes;

    clearInterval(nodes.heartbeatInterval);

    nodes.droneGain.gain.cancelScheduledValues(t);
    nodes.droneGain.gain.setTargetAtTime(0.0001, t, fadeSeconds / 4);
    nodes.noiseGain.gain.cancelScheduledValues(t);
    nodes.noiseGain.gain.setTargetAtTime(0.0001, t, fadeSeconds / 4);

    const stopTime = t + fadeSeconds + 0.2;
    nodes.osc1.stop(stopTime);
    nodes.osc2.stop(stopTime);
    nodes.lfo.stop(stopTime);
    nodes.noiseSrc.stop(stopTime);

    this.droneActive = false;
    this.droneNodes = null;
  }

  /** Mainkan jingle kemenangan singkat lalu biarkan drone fade out. */
  playVictoryStinger() {
    if (!this.ctx) return;
    const t = this.now;
    const ctx = this.ctx;
    const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6 — major arpeggio lega/menang

    freqs.forEach((freq, i) => {
      const startT = t + i * 0.12;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, startT);
      gain.gain.exponentialRampToValueAtTime(0.25, startT + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, startT + 0.8);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(startT);
      osc.stop(startT + 0.85);
    });
  }

  // =======================================================================
  // UTIL
  // =======================================================================

  /** Membuat buffer white-noise sepanjang `duration` detik. */
  _createNoiseBuffer(duration, smooth = false) {
    const ctx = this.ctx;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (smooth) {
        // Sedikit smoothing (leaky integrator) agar noise terdengar
        // seperti angin/atmosphere, bukan static kasar.
        last = last * 0.96 + white * 0.04;
        data[i] = last * 3.0;
      } else {
        data[i] = white;
      }
    }
    return buffer;
  }

  /** Hentikan semua suara berkelanjutan (dipanggil saat reset game total). */
  stopAll() {
    this.stopTensionDrone(0.3);
    this.footstepTimer = 0;
  }
}
