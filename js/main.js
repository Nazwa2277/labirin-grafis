import * as THREE from 'three';
import { Maze, PLAYER_SPAWN, ENEMY_SPAWN, KEY_POSITION, DOOR_POSITION, getRandomWalkableCell, gridToWorld } from './maze.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { GameKey } from './key.js';
import { Door } from './door.js';
import { ParticleSystem } from './particles.js';
import { createGUI } from './gui.js';
import { Minimap } from './minimap.js';
import { AudioManager } from './audio.js';

const IS_MOBILE = window.matchMedia('(pointer: coarse)').matches;

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
      glitchOverlay: document.getElementById('glitch-overlay'),
      jumpscareOverlay: document.getElementById('jumpscare-overlay'),
      jumpscareCanvas: document.getElementById('jumpscare-canvas'),
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

    this.overheadCamera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      300
    );
    this.overheadCamera.rotation.order = 'YXZ';

    this.activeCamera = this.camera;
    this.isOverheadView = false;

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

  _toggleOverheadView() {
    this.isOverheadView = !this.isOverheadView;
    this.activeCamera = this.isOverheadView ? this.overheadCamera : this.camera;

    // Sembunyikan kunci dan pintu jika di overhead view (mencegah curang)
    if (this.gameKey && this.gameKey.group) {
      this.gameKey.group.visible = !this.isOverheadView;
    }
    if (this.door && this.door.group) {
      this.door.group.visible = !this.isOverheadView;
    }

    const btn = document.getElementById('btn-view-toggle');
    if (btn) btn.textContent = this.isOverheadView ? '👁 FPS' : '🗺 Atas';
  }

  _initLights() {
    this.ambientLight = new THREE.AmbientLight(0x555577, 1.10);
    this.scene.add(this.ambientLight);

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

  _initFog() {
    this.fogColor = 0x05050f;
    this.fogDensity = 0.012;
    this.scene.fog = new THREE.FogExp2(this.fogColor, this.fogDensity);
    this.scene.background = null;
    this.fogEnabled = true;
  }

  _initWorld() {
    this.maze = new Maze(this.scene, this.loadingManager);
    this.player = new Player(this.camera, this.dom.canvas, this.maze);
    this.player.spawnAt(PLAYER_SPAWN.col, PLAYER_SPAWN.row);

    this.enemy = new Enemy(this.scene, ENEMY_SPAWN, 2.2);

    const { keyPos, doorPos } = this._pickRandomKeyDoorPositions();
    this.gameKey = new GameKey(this.scene, keyPos);
    this.door = new Door(this.scene, doorPos, this.loadingManager);
    this.particles = new ParticleSystem(this.scene);

    this.minimap = new Minimap(
      this.dom.minimapCanvas,
      this.maze,
      this.player,
      this.enemy,
      this.gameKey,
      this.door
    );
  }

  _pickRandomKeyDoorPositions() {
    const excluded = [PLAYER_SPAWN, ENEMY_SPAWN];
    const keyPos = getRandomWalkableCell(excluded);
    const doorPos = getRandomWalkableCell([...excluded, keyPos]);
    return { keyPos, doorPos };
  }

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
        if (this.fogEnabled && this.scene.fog) this.scene.fog.density = value;
      },
      setAmbientIntensity: (value) => { this.ambientLight.intensity = value; },
      setMoonlightIntensity: (value) => { this.directionalLight.intensity = value; },
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
      if (e.code === 'KeyV' && this.state === GameState.PLAYING) {
        this._toggleOverheadView();
      }
    });
  }

  _bindPointerLockEvents() {
    if (IS_MOBILE) return;
    this.player.controls.addEventListener('unlock', () => {
      if (this.state === GameState.PLAYING) this._pauseGame();
    });
  }

  _startGame() {
    this.dom.startScreen.classList.add('hidden');
    this.dom.hud.classList.remove('hidden');
    this.state = GameState.PLAYING;
    if (IS_MOBILE) {
      this.player._mobileActive = true;
    } else {
      this.player.controls.lock();
    }
    this.clock.start();
    this.audio.init();
    this.audio.startTensionDrone();
  }

  _pauseGame() {
    this.state = GameState.PAUSED;
    this.dom.pauseScreen.classList.remove('hidden');
    if (!IS_MOBILE && this.player.controls.isLocked) this.player.controls.unlock();
  }

  _resumeGame() {
    this.dom.pauseScreen.classList.add('hidden');
    this.state = GameState.PLAYING;
    if (!IS_MOBILE) this.player.controls.lock();
  }

  _triggerVictory() {
    this.state = GameState.VICTORY;
    if (!IS_MOBILE) this.player.controls.unlock();
    this.particles.spawnVictoryEffect(this.camera.position);
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
    if (!IS_MOBILE && this.player.controls.isLocked) this.player.controls.unlock();
    this.particles.spawnGameOverEffect(this.camera.position);
    this.audio.stopTensionDrone(1.0);

    // Nonaktifkan jumpscare dan sembunyikan overlay-nya
    this.isJumpscareActive = false;
    if (this.dom.jumpscareOverlay) this.dom.jumpscareOverlay.classList.add('hidden');

    this.dom.gameoverReasonText.textContent = reason;
    this.dom.gameoverScreen.classList.remove('hidden');
  }

  resetGame(autoStart = false) {
    this.audio.stopTensionDrone(0.2);

    this.player.spawnAt(PLAYER_SPAWN.col, PLAYER_SPAWN.row);
    this.player.hasKey = false;
    this.player.isCaught = false;

    // Reset camera view dan kembalikan visibility kunci/pintu
    this.isOverheadView = false;
    this.activeCamera = this.camera;
    const btn = document.getElementById('btn-view-toggle');
    if (btn) btn.textContent = '🗺 Atas';

    // Reset jumpscare
    this.isJumpscareActive = false;
    if (this.dom.jumpscareOverlay) this.dom.jumpscareOverlay.classList.add('hidden');

    this.enemy.setGridPosition(ENEMY_SPAWN.col, ENEMY_SPAWN.row);
    this.enemy.state = 'PATROL';
    this.enemy.path = [];
    this.enemy.hasCaughtPlayer = false;

    const { keyPos, doorPos } = this._pickRandomKeyDoorPositions();

    const newKeyWorld = gridToWorld(keyPos.col, keyPos.row);
    this.gameKey.collected = false;
    this.gameKey.basePosition.set(newKeyWorld.x, 1.1, newKeyWorld.z);
    this.gameKey.group.position.copy(this.gameKey.basePosition);
    this.gameKey.group.visible = true; // Pastikan kunci kelihatan
    if (!this.gameKey.group.parent) this.gameKey.scene.add(this.gameKey.group);

    const newDoorWorld = gridToWorld(doorPos.col, doorPos.row);
    this.door.position.set(newDoorWorld.x, 0, newDoorWorld.z);
    this.door.group.position.copy(this.door.position);
    this.door.group.visible = true; // Pastikan pintu kelihatan
    this.door.reset();

    this.timerRemaining = this.timerSeconds;
    this.particles.clearAll();

    this.dom.keyStatusText.textContent = 'Belum Ditemukan';
    this.dom.keyStatusText.classList.remove('found');
    this.dom.enemyStatusText.textContent = 'Tenang';
    this.dom.enemyStatusText.classList.remove('alert');
    this.dom.dangerVignette.classList.remove('active');

    this.dom.pauseScreen.classList.add('hidden');
    this.dom.victoryScreen.classList.add('hidden');
    this.dom.gameoverScreen.classList.add('hidden');

    if (autoStart) {
      this.dom.hud.classList.remove('hidden');
      this.state = GameState.PLAYING;
      if (IS_MOBILE) {
        this.player._mobileActive = true;
      } else {
        this.player.controls.lock();
      }
      this.audio.init();
      this.audio.startTensionDrone();
    } else {
      this.dom.hud.classList.add('hidden');
      this.dom.startScreen.classList.remove('hidden');
      this.state = GameState.START;
    }
  }

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

    if (this.dom.glitchOverlay) {
      if (isChasing && this.enemy && this.player) {
        this.dom.glitchOverlay.classList.add('active');
        const enemyPos = this.enemy.group.position;
        const playerPos = this.player.camera.position;
        const dist = enemyPos.distanceTo(playerPos);
        const intensity = Math.max(0, 1 - dist / 12);
        this.dom.glitchOverlay.style.opacity = (0.15 + intensity * 0.75).toString();
      } else {
        this.dom.glitchOverlay.classList.remove('active');
        this.dom.glitchOverlay.style.opacity = '0';
      }
    }
  }

  _updateAudio(delta) {
    this.audio.updateFootsteps(delta, this.player.isMoving(), this.player.isRunning());

    const enemyPos = this.enemy.group.position;
    const playerPos = this.player.camera.position;
    const dx = enemyPos.x - playerPos.x;
    const dz = enemyPos.z - playerPos.z;
    const distanceToPlayer = Math.sqrt(dx * dx + dz * dz);
    this.audio.updateMonster(delta, this.enemy.state, distanceToPlayer);

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

    if (this.minimap) this.minimap.update();

    if (!this.player.hasKey && this.gameKey.checkPickup(this.player.camera.position)) {
      this.player.hasKey = true;
      this.door.unlock();
      this.particles.spawnKeyPickupEffect(this.player.camera.position);
      this.audio.playKeyPickup();
      this.dom.keyStatusText.textContent = 'Ditemukan! Cari Pintu Keluar';
      this.dom.keyStatusText.classList.add('found');
    }

    if (this.player.hasKey && this.door.checkWin(this.player.camera.position)) {
      this._triggerVictory();
      return;
    }

    if (this.enemy.hasCaughtPlayer && !this.player.isCaught) {
      this.player.isCaught = true;
      this.audio.playMonsterJumpscare();
      this._triggerJumpscare();
      setTimeout(() => {
        this._triggerGameOver('Kamu tertangkap Kuntilanak di dalam labirin...');
      }, 1800);
    }
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsedTime = this.clock.getElapsedTime();

    if (this.state === GameState.PLAYING) {
      this._updateGameplay(delta, elapsedTime);

      if (this.isOverheadView && this.player) {
        const px = this.player.camera.position.x;
        const pz = this.player.camera.position.z;
        this.overheadCamera.position.set(px, 38, pz);
        this.overheadCamera.lookAt(px, 0, pz);
      }
    }

    // Skybox selalu ikuti kamera agar tidak terpengaruh fog
    if (this.maze && this.maze.skyBox) {
      const cam = this.activeCamera;
      this.maze.skyBox.position.copy(cam.position);
    }

    this._updateFPSCounter(delta);

    // Terapkan guncangan kamera (camera shake) jika dikejar hantu
    let originalPos = null;
    let originalRot = null;
    let shakeApplied = false;

    if (this.state === GameState.PLAYING && !this.isOverheadView && this.enemy && this.player) {
      const enemyPos = this.enemy.group.position;
      const playerPos = this.player.camera.position;
      const dist = enemyPos.distanceTo(playerPos);
      
      if (this.enemy.state === 'CHASE' && dist < 12) {
        shakeApplied = true;
        originalPos = this.activeCamera.position.clone();
        originalRot = this.activeCamera.rotation.clone();

        const intensity = Math.max(0, 1 - dist / 12);
        const shakeAmount = intensity * 0.08; // Maksimal offset 8cm
        
        this.activeCamera.position.x += (Math.random() - 0.5) * shakeAmount;
        this.activeCamera.position.y += (Math.random() - 0.5) * shakeAmount;
        this.activeCamera.position.z += (Math.random() - 0.5) * shakeAmount;

        this.activeCamera.rotation.x += (Math.random() - 0.5) * shakeAmount * 0.3;
        this.activeCamera.rotation.y += (Math.random() - 0.5) * shakeAmount * 0.3;
        this.activeCamera.rotation.z += (Math.random() - 0.5) * shakeAmount * 0.5;
      }
    }

    this.renderer.render(this.scene, this.activeCamera);

    if (shakeApplied && originalPos && originalRot) {
      this.activeCamera.position.copy(originalPos);
      this.activeCamera.rotation.copy(originalRot);
    }
  }

  _triggerJumpscare() {
    this.isJumpscareActive = true;
    const overlay = this.dom.jumpscareOverlay;
    const canvas = this.dom.jumpscareCanvas;
    if (!overlay || !canvas) return;

    overlay.classList.remove('hidden');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    const drawFrame = () => {
      if (!this.isJumpscareActive) return;

      const w = canvas.width = window.innerWidth;
      const h = canvas.height = window.innerHeight;

      // Draw background hitam kelam
      ctx.fillStyle = '#050000';
      ctx.fillRect(0, 0, w, h);

      ctx.save();

      // Efek guncangan jumpscare
      const shakeX = (Math.random() - 0.5) * 50;
      const shakeY = (Math.random() - 0.5) * 50;
      const scale = 1.05 + Math.random() * 0.15;
      
      ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
      ctx.scale(scale, scale);

      // Pancaran merah menyeramkan di belakang kepala
      const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, Math.min(w, h) * 0.55);
      grad.addColorStop(0, 'rgba(180, 0, 0, 0.45)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(-w, -h, w*2, h*2);

      const size = Math.min(w, h) * 0.4;

      // 1. Wajah putih kehijauan membusuk
      ctx.fillStyle = 'rgba(215, 225, 210, 0.9)';
      ctx.beginPath();
      const headOffset = (Math.random() - 0.5) * 8;
      ctx.ellipse(headOffset, -size * 0.05, size * 0.72, size * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();

      // 2. Lubang mata hitam pekat melompong
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(-size * 0.25, -size * 0.15, size * 0.15 + Math.random()*5, size * 0.2 + Math.random()*5, 0.1, 0, Math.PI * 2);
      ctx.ellipse(size * 0.25, -size * 0.15, size * 0.15 + Math.random()*5, size * 0.2 + Math.random()*5, -0.1, 0, Math.PI * 2);
      ctx.fill();

      // 3. Cairan hitam mengalir dari mata
      ctx.strokeStyle = '#000';
      ctx.lineWidth = size * 0.035;
      ctx.lineCap = 'round';
      [-0.27, -0.21, 0.21, 0.27].forEach(offset => {
        ctx.beginPath();
        ctx.moveTo(size * offset, -size * 0.08);
        ctx.bezierCurveTo(
          size * offset, size * 0.1,
          size * offset + (Math.random() - 0.5) * 15, size * 0.2,
          size * offset + (Math.random() - 0.5) * 5, size * 0.45 + Math.random() * 20
        );
        ctx.stroke();
      });

      // 4. Pupil merah menyala bergetar liar
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(-size * 0.25 + (Math.random() - 0.5) * 8, -size * 0.15 + (Math.random() - 0.5) * 8, size * 0.035 + Math.random() * 2, 0, Math.PI * 2);
      ctx.arc(size * 0.25 + (Math.random() - 0.5) * 8, -size * 0.15 + (Math.random() - 0.5) * 8, size * 0.035 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();

      // 5. Rongga hidung membusuk
      ctx.fillStyle = '#080808';
      ctx.beginPath();
      ctx.moveTo(-size * 0.03, size * 0.05);
      ctx.quadraticCurveTo(0, size * 0.02, size * 0.03, size * 0.05);
      ctx.lineTo(size * 0.04, size * 0.12);
      ctx.quadraticCurveTo(0, size * 0.16, -size * 0.04, size * 0.12);
      ctx.closePath();
      ctx.fill();

      // 6. Mulut mangap lebar terdistorsi
      ctx.fillStyle = '#020202';
      ctx.beginPath();
      const mouthWidth = size * 0.35 + Math.random() * 10;
      const mouthHeight = size * 0.38 + Math.random() * 25;
      ctx.ellipse(0, size * 0.32, mouthWidth, mouthHeight, 0, 0, Math.PI * 2);
      ctx.fill();

      // 7. Gigi tajam kotor bergerigi
      ctx.fillStyle = '#f5f0eb';
      const teethCount = 7;
      for(let i=0; i<teethCount; i++) {
        const tx = -mouthWidth * 0.7 + (mouthWidth * 1.4) * (i / (teethCount - 1));
        const ty = size * 0.22 + Math.abs(tx) * 0.2;
        const toothLen = size * 0.08 + Math.random() * 10;
        ctx.beginPath();
        ctx.moveTo(tx - 6, ty);
        ctx.lineTo(tx, ty + toothLen);
        ctx.lineTo(tx + 6, ty);
        ctx.fill();
      }
      for(let i=0; i<teethCount - 1; i++) {
        const tx = -mouthWidth * 0.6 + (mouthWidth * 1.2) * ((i + 0.5) / (teethCount - 1));
        const ty = size * 0.42 - Math.abs(tx) * 0.2;
        const toothLen = size * 0.08 + Math.random() * 10;
        ctx.beginPath();
        ctx.moveTo(tx - 6, ty);
        ctx.lineTo(tx, ty - toothLen);
        ctx.lineTo(tx + 6, ty);
        ctx.fill();
      }

      // 8. Darah menetes dari mulut
      ctx.fillStyle = 'rgba(130, 2, 2, 0.85)';
      ctx.beginPath();
      ctx.ellipse(0, size * 0.48, mouthWidth * 0.6, size * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = 'rgba(130, 2, 2, 0.9)';
      ctx.lineWidth = size * 0.03;
      for (let d = 0; d < 3; d++) {
        const dx = (d - 1) * size * 0.15 + (Math.random() - 0.5) * 10;
        ctx.beginPath();
        ctx.moveTo(dx, size * 0.48);
        ctx.lineTo(dx + (Math.random() - 0.5) * 8, size * 0.58 + Math.random() * 30);
        ctx.stroke();
      }

      // 9. Rambut gimbal berantakan menjuntai tidak keruan
      ctx.strokeStyle = '#050505';
      ctx.lineWidth = size * 0.022;
      for (let h = 0; h < 60; h++) {
        const hairStartX = -size * 0.8 + Math.random() * size * 1.6;
        const hairStartY = -size * 1.0;
        ctx.beginPath();
        ctx.moveTo(hairStartX, hairStartY);
        
        ctx.bezierCurveTo(
          hairStartX + (Math.random() - 0.5) * 80, -size * 0.3,
          hairStartX + (Math.random() - 0.5) * 80, size * 0.3,
          hairStartX + (Math.random() - 0.5) * 60, size * 1.2
        );
        ctx.stroke();
      }

      ctx.restore();

      // Scanlines & RGB split flash
      if (Math.random() > 0.82) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.12)';
        ctx.fillRect(0, 0, w, h);
      } else if (Math.random() > 0.92) {
        ctx.fillStyle = 'rgba(0, 0, 255, 0.12)';
        ctx.fillRect(0, 0, w, h);
      }

      // Scanline noise overlay
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      for (let y = 0; y < h; y += 4) {
        if (Math.random() > 0.3) {
          ctx.fillRect(0, y, w, 2);
        }
      }

      requestAnimationFrame(drawFrame);
    };

    drawFrame();
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
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.overheadCamera.aspect = aspect;
    this.overheadCamera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _hideLoadingScreen() {
    setTimeout(() => {
      this.dom.loadingScreen.classList.add('hidden');
    }, 400);
  }

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
          if (material.map) material.map.dispose();
          material.map = texture;
          material.color.set(0xffffff);
          material.needsUpdate = true;
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    };

    input.click();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const game = new MazeEscapeGame();
  window._gameToggleView = () => game._toggleOverheadView();
});
