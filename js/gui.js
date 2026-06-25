import GUI from 'lil-gui';

const DIFFICULTY_PRESETS = {
  Mudah: { enemySpeed: 1.6, timerSeconds: 180 },
  Normal: { enemySpeed: 2.2, timerSeconds: 120 },
  Sulit: { enemySpeed: 3.0, timerSeconds: 90 },
};

export function createGUI(gameController) {
  const gui = new GUI({ title: '⚙ Pengaturan Game' });

  const settings = {
    volume: 0.6,
    difficulty: 'Normal',
    timerSeconds: 120,
    fogEnabled: true,
    fogDensity: 0.012,
    ambientIntensity: 1.10,
    moonlightIntensity: 0.85,
    enemySpeed: 2.2,
    showDebugPath: false,
    resetGame: () => gameController.resetGame(),
  };

  const audioFolder = gui.addFolder('🔊 Audio');
  audioFolder
    .add(settings, 'volume', 0, 1, 0.01)
    .name('Volume')
    .onChange((value) => gameController.setVolume(value));

  const gameplayFolder = gui.addFolder('🎮 Gameplay');

  gameplayFolder
    .add(settings, 'difficulty', Object.keys(DIFFICULTY_PRESETS))
    .name('Tingkat Kesulitan')
    .onChange((value) => {
      const preset = DIFFICULTY_PRESETS[value];
      settings.enemySpeed = preset.enemySpeed;
      settings.timerSeconds = preset.timerSeconds;
      enemySpeedCtrl.updateDisplay();
      timerCtrl.updateDisplay();
      gameController.setDifficultyPreset(preset);
    });

  const timerCtrl = gameplayFolder
    .add(settings, 'timerSeconds', 30, 300, 10)
    .name('Timer (detik)')
    .onChange((value) => gameController.setTimerDuration(value));

  const enemySpeedCtrl = gameplayFolder
    .add(settings, 'enemySpeed', 0.5, 5, 0.1)
    .name('Kecepatan Monster')
    .onChange((value) => gameController.setEnemySpeed(value));

  const graphicsFolder = gui.addFolder('🎨 Grafis');

  graphicsFolder
    .add(settings, 'fogEnabled')
    .name('Fog (Kabut)')
    .onChange((value) => gameController.setFogEnabled(value));

  graphicsFolder
    .add(settings, 'fogDensity', 0.0, 0.1, 0.005)
    .name('Kerapatan Kabut')
    .onChange((value) => gameController.setFogDensity(value));

  graphicsFolder
    .add(settings, 'ambientIntensity', 0.0, 1.5, 0.05)
    .name('Terang Lingkungan')
    .onChange((value) => gameController.setAmbientIntensity(value));

  graphicsFolder
    .add(settings, 'moonlightIntensity', 0.0, 1.5, 0.05)
    .name('Terang Bulan')
    .onChange((value) => gameController.setMoonlightIntensity(value));

  graphicsFolder
    .add(settings, 'showDebugPath')
    .name('Debug A* Path')
    .onChange((value) => gameController.setDebugPathVisible(value));

  const textureFolder = gui.addFolder('🖼 Tekstur Kastem');

  settings.uploadWallTexture = () => gameController.uploadWallTexture();
  settings.uploadFloorTexture = () => gameController.uploadFloorTexture();
  settings.uploadCeilingTexture = () => gameController.uploadCeilingTexture();
  settings.uploadDoorTexture = () => gameController.uploadDoorTexture();

  textureFolder.add(settings, 'uploadWallTexture').name('📤 Upload Dinding');
  textureFolder.add(settings, 'uploadFloorTexture').name('📤 Upload Lantai');
  textureFolder.add(settings, 'uploadCeilingTexture').name('📤 Upload Langit-langit');
  textureFolder.add(settings, 'uploadDoorTexture').name('📤 Upload Pintu');

  const actionsFolder = gui.addFolder('🔁 Aksi');
  actionsFolder.add(settings, 'resetGame').name('↻ Reset Game');

  gui.close();

  return { gui, settings };
}
