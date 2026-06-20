/**
 * =========================================================================
 *  main.js
 * =========================================================================
 *  Entry point utama. Bertanggung jawab untuk:
 *   - Inisialisasi scene, kamera, renderer Three.js
 *   - Inisialisasi lighting & fog
 *   - Inisialisasi semua modul game (Maze, Player, Enemy, Key, Door,
 *     ParticleSystem, GUI)
 *   - Mengelola state mesin permainan (Start, Playing, Paused, Victory,
 *     GameOver) dan transisi antar UI screen
 *   - Game loop utama (render + update)
 * =========================================================================
 */

import * as THREE from 'three';
import { Maze, PLAYER_SPAWN, ENEMY_SPAWN, KEY_POSITION, DOOR_POSITION } from './maze.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { GameKey } from './key.js';
import { Door } from './door.js';
import { ParticleSystem } from './particles.js';
import { createGUI } from './gui.js';
import { Minimap } from './minimap.js';
import { AudioManager } from './audio.js';

// =========================================================================
// STATE MESIN PERMAINAN
// =========================================================================
const GameState = {
  START: 'START',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  VICTORY: 'VICTORY',
  GAMEOVER: 'GAMEOVER',
};

class MazeEscapeGame {
  constructor() {
    this.state = GameState.START;
    this.clock = new THREE.Clock();
    this.timerSeconds = 120;
    this.timerRemaining = this.timerSeconds;
    this.gameOverReason = '';

    this.audio = new AudioManager();

    this._cacheDOM();
    this._initThree();
    this._initLights();
    this._initFog();
    this._initWorld();
    this._initGUIController();
    this._bindUIEvents();
    this._bindPointerLockEvents();

    window.addEventListener('resize', () => this._onResize());

    this._hideLoadingScreen();
    this._animate();
  }

  // -----------------------------------------------------------------
  // SETUP
  // -----------------------------------------------------------------

  _cacheDOM() {
    this.dom = {
      canvas: document.getElementById('game-canvas'),
      hud: document.getElementById('hud'),
      crosshair: document.getElementById('crosshair'),
      timerText: document.getElementById('hud-timer'),
      keyStatusText: document.getElementById('key-status-text'),
      enemyStatusText: document.getElementById('enemy-status-text'),
      fpsCounter: document.getElementById('fps-counter'),
      dangerVignette: document.getElementById('danger-vignette'),
      minimapCanvas: document.getElementById('minimap-canvas'),

      startScreen: document.getElementById('start-screen'),
      pauseScreen: document.getElementById('pause-screen'),
      victoryScreen: document.getElementById('victory-screen'),
      gameoverScreen: document.getElementById('gameover-screen'),
      loadingScreen: document.getElementById('loading-screen'),
      loadingBarFill: document.getElementById('loading-bar-fill'),

      btnStart: document.getElementById('btn-start'),
      btnResume: document.getElementById('btn-resume'),
      btnRestartPause: document.getElementById('btn-restart-pause'),
      btnRestartVictory: document.getElementById('btn-restart-victory'),
      btnRestartGameover: document.getElementById('btn-restart-gameover'),

      victoryTimeText: document.getElementById('victory-time-text'),
      gameoverReasonText: document.getElementById('gameover-reason-text'),
    };
  }

  _initThree() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.dom.canvas,
      antialias: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.loadingManager = new THREE.LoadingManager();
    this.loadingManager.onProgress = (url, loaded, total) => {
      const pct = total > 0 ? Math.round((loaded / total) * 100) : 100;
      if (this.dom.loadingBarFill) this.dom.loadingBarFill.style.width = `${pct}%`;
    };
  }

  /** Lighting: Ambient + Directional (bulan) + Spotlight senter (di Player). */
  _initLights() {
    this.ambientLight = new THREE.AmbientLight(0x555577, 1.10);
    this.scene.add(this.ambientLight);

    // Directional light lemah sebagai cahaya "bulan" agar labirin tidak
    // 100% gelap gulita, memberi sedikit siluet pada dinding.
    this.directionalLight = new THREE.DirectionalLight(0x99aaff, 0.85);
    this.directionalLight.position.set(20, 30, 10);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.set(2048, 2048);
    this.directionalLight.shadow.camera.left = -40;
    this.directionalLight.shadow.camera.right = 40;
    this.directionalLight.shadow.camera.top = 40;
    this.directionalLight.shadow.camera.bottom = -40;
    this.scene.add(this.directionalLight);
  }

  /** Fog eksponensial untuk menciptakan atmosfer horror & membatasi
   *  jarak pandang (sehingga monster bisa "muncul tiba-tiba" dari kabut). */
  _initFog() {
    this.fogColor = 0x05050a;
    this.fogDensity = 0.012;
    this.scene.fog = new THREE.FogExp2(this.fogColor, this.fogDensity);
    this.scene.background = new THREE.Color(this.fogColor);
    this.fogEnabled = true;
  }

  _initWorld() {
    this.maze = new Maze(this.scene, this.loadingManager);
    this.player = new Player(this.camera, this.dom.canvas, this.maze);
    this.player.spawnAt(PLAYER_SPAWN.col, PLAYER_SPAWN.row);

    this.enemy = new Enemy(this.scene, ENEMY_SPAWN, 2.2);
    this.gameKey = new GameKey(this.scene, KEY_POSITION);
    this.door = new Door(this.scene, DOOR_POSITION, this.loadingManager);
    this.particles = new ParticleSystem(this.scene);

    // Inisialisasi Minimap
    this.minimap = new Minimap(
      this.dom.minimapCanvas,
      this.maze,
      this.player,
      this.enemy,
      this.gameKey,
      this.door
    );
  }

  /** Kontroler yang diberikan ke GUI agar lil-gui bisa memanipulasi state
   *  game secara langsung tanpa GUI perlu tahu detail internal class lain. */
  _initGUIController() {
    const controller = {
      setVolume: (value) => {
        this.masterVolume = value;
        this.audio.setVolume(value);
      },
      setDifficultyPreset: (preset) => {
        this.enemy.setSpeed(preset.enemySpeed);
        this.timerSeconds = preset.timerSeconds;
        if (this.state === GameState.START) this.timerRemaining = preset.timerSeconds;
      },
      setTimerDuration: (value) => {
        this.timerSeconds = value;
        if (this.state === GameState.START) this.timerRemaining = value;
      },
      setEnemySpeed: (value) => this.enemy.setSpeed(value),
      setFogEnabled: (value) => {
        this.fogEnabled = value;
        this.scene.fog = value ? new THREE.FogExp2(this.fogColor, this.fogDensity) : null;
      },
      setFogDensity: (value) => {
        this.fogDensity = value;
        if (this.fogEnabled && this.scene.fog) {
          this.scene.fog.density = value;
        }
      },
      setAmbientIntensity: (value) => {
        this.ambientLight.intensity = value;
      },
      setMoonlightIntensity: (value) => {
        this.directionalLight.intensity = value;
      },
      setFlashlightIntensity: (value) => {
        if (this.player && this.player.flashlight) {
          this.player.flashlight.intensity = value;
        }
      },
      setFlashlightEnabled: (value) => this.player.toggleFlashlight(value),
      setDebugPathVisible: (value) => this.enemy.setDebugPathVisible(value),
      resetGame: () => this.resetGame(),
      uploadWallTexture: () => this._handleTextureUpload(this.maze.wallMaterial, 1, 1),
      uploadFloorTexture: () => this._handleTextureUpload(this.maze.floorMaterial, this.maze.grid[0].length, this.maze.grid.length),
      uploadCeilingTexture: () => this._handleTextureUpload(this.maze.ceilingMaterial, this.maze.grid[0].length, this.maze.grid.length),
      uploadDoorTexture: () => this._handleTextureUpload(this.door.doorMaterial, 1, 1),
    };

    const { gui, settings } = createGUI(controller);
    this.guiSettings = settings;
    this.timerSeconds = settings.timerSeconds;
    this.timerRemaining = this.timerSeconds;
    this.audio.setVolume(settings.volume);
  }

  // -----------------------------------------------------------------
  // UI EVENT BINDING
  // -----------------------------------------------------------------

  _bindUIEvents() {
    this.dom.btnStart.addEventListener('click', () => this._startGame());
    this.dom.btnResume.addEventListener('click', () => this._resumeGame());
    this.dom.btnRestartPause.addEventListener('click', () => this.resetGame(true));
    this.dom.btnRestartVictory.addEventListener('click', () => this.resetGame(true));
    this.dom.btnRestartGameover.addEventListener('click', () => this.resetGame(true));

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === GameState.PLAYING) {
        this._pauseGame();
      }
    });
  }

  _bindPointerLockEvents() {
    this.player.controls.addEventListener('unlock', () => {
      // Jika pointer lock terlepas (misal user tekan ESC) saat sedang
      // bermain, otomatis masuk ke pause menu.
      if (this.state === GameState.PLAYING) {
        this._pauseGame();
      }
    });
  }

  // -----------------------------------------------------------------
  // STATE TRANSITIONS
  // -----------------------------------------------------------------

  _startGame() {
    this.dom.startScreen.classList.add('hidden');
    this.dom.hud.classList.remove('hidden');
    this.state = GameState.PLAYING;
    this.player.controls.lock();
    this.clock.start();

    this.audio.init();
    this.audio.startTensionDrone();
  }

  _pauseGame() {
    this.state = GameState.PAUSED;
    this.dom.pauseScreen.classList.remove('hidden');
    if (this.player.controls.isLocked) this.player.controls.unlock();
  }

  _resumeGame() {
    this.dom.pauseScreen.classList.add('hidden');
    this.state = GameState.PLAYING;
    this.player.controls.lock();
  }

  _triggerVictory() {
    this.state = GameState.VICTORY;
    this.player.controls.unlock();
    this.particles.spawnVictoryEffect(this.camera.position);

    // Backsound tegang berhenti (fade out) begitu pintu keluar berhasil
    // ditemukan, lalu gantikan dengan jingle kemenangan singkat.
    this.audio.stopTensionDrone(1.5);
    this.audio.playVictoryStinger();

    const minutes = Math.floor(this.timerRemaining / 60).toString().padStart(2, '0');
    const seconds = Math.floor(this.timerRemaining % 60).toString().padStart(2, '0');
    this.dom.victoryTimeText.textContent = `Waktu tersisa: ${minutes}:${seconds}`;

    this.dom.victoryScreen.classList.remove('hidden');
  }

  _triggerGameOver(reason) {
    this.state = GameState.GAMEOVER;
    this.gameOverReason = reason;
    if (this.player.controls.isLocked) this.player.controls.unlock();
    this.particles.spawnGameOverEffect(this.camera.position);

    this.audio.stopTensionDrone(1.0);

    this.dom.gameoverReasonText.textContent = reason;
    this.dom.gameoverScreen.classList.remove('hidden');
  }

  /** Reset penuh seluruh state game ke kondisi awal. */
  resetGame(autoStart = false) {
    // Reset audio: hentikan drone lama (jika masih berjalan, misal saat
    // restart dari pause menu) agar tidak menumpuk pada sesi berikutnya.
    this.audio.stopTensionDrone(0.2);

    // Reset player
    this.player.spawnAt(PLAYER_SPAWN.col, PLAYER_SPAWN.row);
    this.player.hasKey = false;
    this.player.isCaught = false;

    // Reset enemy
    this.enemy.setGridPosition(ENEMY_SPAWN.col, ENEMY_SPAWN.row);
    this.enemy.state = 'PATROL';
    this.enemy.path = [];
    this.enemy.hasCaughtPlayer = false;

    // Reset key & door
    this.gameKey.collected = false;
    this.gameKey.scene.add(this.gameKey.group);
    this.gameKey.group.position.copy(this.gameKey.basePosition);
    this.door.reset();

    // Reset timer
    this.timerRemaining = this.timerSeconds;

    // Reset particle effects
    this.particles.clearAll();

    // Reset HUD visual
    this.dom.keyStatusText.textContent = 'Belum Ditemukan';
    this.dom.keyStatusText.classList.remove('found');
    this.dom.enemyStatusText.textContent = 'Tenang';
    this.dom.enemyStatusText.classList.remove('alert');
    this.dom.dangerVignette.classList.remove('active');

    // Sembunyikan semua overlay
    this.dom.pauseScreen.classList.add('hidden');
    this.dom.victoryScreen.classList.add('hidden');
    this.dom.gameoverScreen.classList.add('hidden');

    if (autoStart) {
      this.dom.hud.classList.remove('hidden');
      this.state = GameState.PLAYING;
      this.player.controls.lock();
      this.audio.init();
      this.audio.startTensionDrone();
    } else {
      this.dom.hud.classList.add('hidden');
      this.dom.startScreen.classList.remove('hidden');
      this.state = GameState.START;
    }
  }

  // -----------------------------------------------------------------
  // GAME LOOP
  // -----------------------------------------------------------------

  _updateTimer(delta) {
    this.timerRemaining -= delta;
    if (this.timerRemaining <= 0) {
      this.timerRemaining = 0;
      this._triggerGameOver('Waktu habis! Kamu terjebak selamanya di dalam labirin.');
      return;
    }

    const minutes = Math.floor(this.timerRemaining / 60).toString().padStart(2, '0');
    const seconds = Math.floor(this.timerRemaining % 60).toString().padStart(2, '0');
    this.dom.timerText.textContent = `⏱ ${minutes}:${seconds}`;

    if (this.timerRemaining <= 20) {
      this.dom.timerText.classList.add('timer-warning');
    } else {
      this.dom.timerText.classList.remove('timer-warning');
    }
  }

  _updateHUDEnemyStatus() {
    const isChasing = this.enemy.state === 'CHASE';
    this.dom.enemyStatusText.textContent = this.enemy.getStatusLabel();
    this.dom.enemyStatusText.classList.toggle('alert', isChasing);
    this.dom.dangerVignette.classList.toggle('active', isChasing);
  }

  /** Memperbarui seluruh efek suara dinamis tiap frame: langkah kaki
   *  pemain, growl monster (idle/mengejar), dan intensitas backsound
   *  tegang berdasarkan apakah monster sedang mengejar pemain. */
  _updateAudio(delta) {
    // 1) Langkah kaki — ritme mengikuti kecepatan jalan/lari pemain
    this.audio.updateFootsteps(delta, this.player.isMoving(), this.player.isRunning());

    // 2) Suara monster — idle growl saat patroli, lebih intens saat mengejar
    const enemyPos = this.enemy.group.position;
    const playerPos = this.player.camera.position;
    const dx = enemyPos.x - playerPos.x;
    const dz = enemyPos.z - playerPos.z;
    const distanceToPlayer = Math.sqrt(dx * dx + dz * dz);
    this.audio.updateMonster(delta, this.enemy.state, distanceToPlayer);

    // 4) Backsound tegang makin mencekam saat monster mengejar
    this.audio.setDroneIntensity(this.enemy.state === 'CHASE');
  }

  _updateGameplay(delta, elapsedTime) {
    this.player.update(delta);
    this.enemy.update(delta, this.player);
    this.gameKey.update(elapsedTime);
    this.door.update(elapsedTime);
    this.particles.update(delta);

    this._updateTimer(delta);
    this._updateHUDEnemyStatus();
    this._updateAudio(delta);

    // Update data minimap
    if (this.minimap) {
      this.minimap.update();
    }

    // Cek pengambilan kunci
    if (!this.player.hasKey && this.gameKey.checkPickup(this.player.camera.position)) {
      this.player.hasKey = true;
      this.door.unlock();
      this.particles.spawnKeyPickupEffect(this.player.camera.position);
      this.audio.playKeyPickup();
      this.dom.keyStatusText.textContent = 'Ditemukan! Cari Pintu Keluar';
      this.dom.keyStatusText.classList.add('found');
    }

    // Cek menang (sampai pintu dalam keadaan terbuka)
    if (this.player.hasKey && this.door.checkWin(this.player.camera.position)) {
      this._triggerVictory();
      return;
    }

    // Cek tertangkap monster
    if (this.enemy.hasCaughtPlayer && !this.player.isCaught) {
      this.player.isCaught = true;
      this.audio.playMonsterJumpscare();
      this._triggerGameOver('Kamu tertangkap monster di dalam labirin...');
    }
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const delta = Math.min(this.clock.getDelta(), 0.1); // clamp agar stabil
    const elapsedTime = this.clock.getElapsedTime();

    if (this.state === GameState.PLAYING) {
      this._updateGameplay(delta, elapsedTime);
    }

    this._updateFPSCounter(delta);

    this.renderer.render(this.scene, this.camera);
  }

  _updateFPSCounter(delta) {
    this._fpsAccumulator = (this._fpsAccumulator ?? 0) + delta;
    this._fpsFrameCount = (this._fpsFrameCount ?? 0) + 1;
    if (this._fpsAccumulator >= 0.5) {
      const fps = Math.round(this._fpsFrameCount / this._fpsAccumulator);
      this.dom.fpsCounter.textContent = fps;
      this._fpsAccumulator = 0;
      this._fpsFrameCount = 0;
    }
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _hideLoadingScreen() {
    // Beri sedikit jeda agar transisi loading -> start screen terasa halus
    setTimeout(() => {
      this.dom.loadingScreen.classList.add('hidden');
    }, 400);
  }

  /**
   * Mengunggah tekstur secara real-time via dialog file browser
   * @param {THREE.Material} material - Material Three.js yang akan diupdate
   * @param {number} repeatX - Pengulangan tekstur pada sumbu X
   * @param {number} repeatY - Pengulangan tekstur pada sumbu Y
   */
  _handleTextureUpload(material, repeatX = 1, repeatY = 1) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const texture = new THREE.Texture(img);
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(repeatX, repeatY);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;

          // Hapus tekstur lama untuk mencegah kebocoran memori
          if (material.map) {
            material.map.dispose();
          }

          material.map = texture;
          material.color.set(0xffffff); // Set warna dasar ke putih agar warna tekstur asli keluar
          material.needsUpdate = true;
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    };

    input.click();
  }
}

// =========================================================================
// BOOTSTRAP
// =========================================================================
window.addEventListener('DOMContentLoaded', () => {
  new MazeEscapeGame();
});
