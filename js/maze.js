import * as THREE from 'three';

export const MAZE_LAYOUT = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,0,1,0,1,1,1,0,1,0,1,0,1],
  [1,0,1,0,0,0,1,0,0,0,0,0,1,0,1],
  [1,0,1,1,1,1,1,0,1,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,1],
  [1,1,1,1,1,0,1,1,1,0,1,1,1,0,1],
  [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,0,1,1,1,0,1,1,1,0,1,0,1],
  [1,0,1,0,0,0,1,0,0,0,1,0,1,0,1],
  [1,0,1,1,1,0,1,1,1,0,1,0,1,1,1],
  [1,0,0,0,1,0,0,0,1,0,0,0,0,0,1],
  [1,1,1,0,1,1,1,0,1,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

export const CELL_SIZE = 4;
export const WALL_HEIGHT = 3.5;

export const PLAYER_SPAWN = { col: 1, row: 1 };
export const ENEMY_SPAWN = { col: 13, row: 13 };
export let KEY_POSITION = { col: 13, row: 1 };
export let DOOR_POSITION = { col: 7, row: 13 };

export function getRandomWalkableCell(excludeList = []) {
  const walkable = [];
  for (let row = 0; row < MAZE_LAYOUT.length; row++) {
    for (let col = 0; col < MAZE_LAYOUT[row].length; col++) {
      if (MAZE_LAYOUT[row][col] !== 0) continue;
      const excluded = excludeList.some((e) => e.col === col && e.row === row);
      if (!excluded) walkable.push({ col, row });
    }
  }
  return walkable[Math.floor(Math.random() * walkable.length)];
}

export function gridToWorld(col, row) {
  return {
    x: col * CELL_SIZE,
    z: row * CELL_SIZE,
  };
}

export function worldToGrid(x, z) {
  return {
    col: Math.round(x / CELL_SIZE),
    row: Math.round(z / CELL_SIZE),
  };
}

export function isWalkable(col, row, grid = MAZE_LAYOUT) {
  if (row < 0 || row >= grid.length) return false;
  if (col < 0 || col >= grid[0].length) return false;
  return grid[row][col] === 0;
}

export class Maze {
  constructor(scene, loadingManager) {
    this.scene = scene;
    this.grid = MAZE_LAYOUT;
    this.group = new THREE.Group();
    this.group.name = 'MazeGroup';
    this.wallColliders = [];

    this._buildMaterials(loadingManager);
    this._buildFloor();
    this._buildCeiling();
    this._buildWalls();

    this.scene.add(this.group);
  }

  _buildMaterials(loadingManager) {
    const textureLoader = new THREE.TextureLoader(loadingManager);

    this.wallMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.05, color: 0xffffff });
    this._loadTextureWithFallback(textureLoader, 'textures/wall.jpg', () => this._generateProceduralTexture('#3a3a3a', '#1f1f1f', 'brick'), this.wallMaterial, 1, 1);

    this.floorMaterial = new THREE.MeshStandardMaterial({ roughness: 1.0, metalness: 0.0, color: 0xffffff });
    this._loadTextureWithFallback(textureLoader, 'textures/floor.jpg', () => this._generateProceduralTexture('#2b2520', '#181410', 'tile'), this.floorMaterial, this.grid[0].length, this.grid.length);

    this.ceilingMaterial = new THREE.MeshStandardMaterial({ roughness: 1.0, metalness: 0.0, color: 0xffffff });
    this._loadTextureWithFallback(textureLoader, 'textures/ceiling.jpg', () => this._generateProceduralTexture('#14141a', '#08080c', 'tile'), this.ceilingMaterial, this.grid[0].length, this.grid.length);
  }

  _loadTextureWithFallback(loader, basePath, fallbackFn, material, repeatX = 1, repeatY = 1) {
    const fallbackTexture = fallbackFn();
    fallbackTexture.wrapS = fallbackTexture.wrapT = THREE.RepeatWrapping;
    fallbackTexture.repeat.set(repeatX, repeatY);
    material.map = fallbackTexture;
    material.needsUpdate = true;

    const dotIndex = basePath.lastIndexOf('.');
    const pathWithoutExt = basePath.substring(0, dotIndex);
    const originalExt = basePath.substring(dotIndex);
    const exts = [originalExt];
    if (originalExt !== '.webp') exts.push('.webp');
    if (originalExt !== '.jpg') exts.push('.jpg');
    if (originalExt !== '.png') exts.push('.png');

    const uniqueExts = [...new Set(exts)];
    let attemptIndex = 0;

    const tryLoad = () => {
      if (attemptIndex >= uniqueExts.length) return;
      const currentPath = pathWithoutExt + uniqueExts[attemptIndex];
      loader.load(
        currentPath,
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(repeatX, repeatY);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
          if (material.map && material.map.dispose) material.map.dispose();
          material.map = texture;
          material.needsUpdate = true;
        },
        undefined,
        () => { attemptIndex++; tryLoad(); }
      );
    };

    tryLoad();
  }

  _generateProceduralTexture(colorA, colorB, pattern) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = colorA;
    ctx.fillRect(0, 0, size, size);

    if (pattern === 'brick') {
      ctx.strokeStyle = colorB;
      ctx.lineWidth = 3;
      const rows = 8;
      const brickH = size / rows;
      for (let r = 0; r < rows; r++) {
        const y = r * brickH;
        const offset = r % 2 === 0 ? 0 : brickH * 1.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
        for (let x = -brickH * 2 + offset; x < size; x += brickH * 3) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + brickH); ctx.stroke();
        }
      }
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 3, 3);
      }
    } else if (pattern === 'tile') {
      ctx.strokeStyle = colorB;
      ctx.lineWidth = 2;
      const grid = 4;
      const cell = size / grid;
      for (let i = 0; i <= grid; i++) {
        ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(size, i * cell); ctx.stroke();
      }
      for (let i = 0; i < 600; i++) {
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  _buildFloor() {
    const width = this.grid[0].length * CELL_SIZE;
    const depth = this.grid.length * CELL_SIZE;
    const geometry = new THREE.PlaneGeometry(width, depth);
    const floor = new THREE.Mesh(geometry, this.floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(width / 2 - CELL_SIZE / 2, 0, depth / 2 - CELL_SIZE / 2);
    floor.receiveShadow = true;
    floor.name = 'Floor';
    this.group.add(floor);
  }

  _buildCeiling() {
    const width = this.grid[0].length * CELL_SIZE;
    const depth = this.grid.length * CELL_SIZE;

    const skyGeo = new THREE.SphereGeometry(120, 32, 16);
    skyGeo.scale(-1, 1, -1);

    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 512;
    skyCanvas.height = 512;
    const ctx = skyCanvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#000008');
    grad.addColorStop(0.3, '#05050f');
    grad.addColorStop(0.7, '#0a0818');
    grad.addColorStop(1.0, '#150d28');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 320; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 320;
      const r = Math.random() * 1.4 + 0.3;
      const alpha = Math.random() * 0.7 + 0.3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fill();
    }

    for (let i = 0; i < 12; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 280;
      const r = Math.random() * 2.5 + 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      glow.addColorStop(0, 'rgba(200,220,255,0.9)');
      glow.addColorStop(1, 'rgba(100,140,255,0)');
      ctx.fillStyle = glow;
      ctx.fill();
    }

    const moonX = 380, moonY = 80, moonR = 22;
    const moonGlow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, moonR * 5);
    moonGlow.addColorStop(0, 'rgba(240,240,200,1)');
    moonGlow.addColorStop(0.2, 'rgba(200,200,160,0.6)');
    moonGlow.addColorStop(1, 'rgba(100,100,80,0)');
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 5, 0, Math.PI * 2);
    ctx.fillStyle = moonGlow;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fillStyle = '#f0f0c8';
    ctx.fill();

    const skyTexture = new THREE.CanvasTexture(skyCanvas);
    skyTexture.colorSpace = THREE.SRGBColorSpace;

    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTexture,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.skyDome.position.set(
      (this.grid[0].length * CELL_SIZE) / 2 - CELL_SIZE / 2,
      0,
      (this.grid.length * CELL_SIZE) / 2 - CELL_SIZE / 2
    );
    this.skyDome.name = 'SkyDome';
    this.group.add(this.skyDome);
  }

  _buildWalls() {
    const wallGeometry = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
    for (let row = 0; row < this.grid.length; row++) {
      for (let col = 0; col < this.grid[row].length; col++) {
        if (this.grid[row][col] !== 1) continue;
        const { x, z } = gridToWorld(col, row);
        const wall = new THREE.Mesh(wallGeometry, this.wallMaterial);
        wall.position.set(x, WALL_HEIGHT / 2, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.name = `Wall_${col}_${row}`;
        this.group.add(wall);
        const box = new THREE.Box3().setFromObject(wall);
        this.wallColliders.push(box);
      }
    }
  }

  resolveCollision(position, radius = 0.4) {
    for (const box of this.wallColliders) {
      const closestX = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x);
      const closestZ = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z);
      const dx = position.x - closestX;
      const dz = position.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq) || 0.0001;
        const overlap = radius - dist;
        position.x += (dx / dist) * overlap;
        position.z += (dz / dist) * overlap;
      }
    }
    return position;
  }
}
