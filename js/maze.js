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
    const skyGeo = new THREE.SphereGeometry(120, 32, 16);
    skyGeo.scale(-1, 1, -1);

    const S = 1024;
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = S;
    skyCanvas.height = S;
    const ctx = skyCanvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0.0, '#000005');
    grad.addColorStop(0.25, '#02020c');
    grad.addColorStop(0.6, '#060414');
    grad.addColorStop(1.0, '#0e0920');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);

    // Milky Way kabut tipis
    for (let i = 0; i < 4; i++) {
      const mwGrad = ctx.createLinearGradient(S * 0.1 + i * 60, 0, S * 0.5 + i * 60, S * 0.7);
      mwGrad.addColorStop(0, 'rgba(80,70,130,0)');
      mwGrad.addColorStop(0.4, `rgba(60,55,110,${0.04 + i * 0.01})`);
      mwGrad.addColorStop(1, 'rgba(40,35,80,0)');
      ctx.fillStyle = mwGrad;
      ctx.fillRect(0, 0, S, S);
    }

    // RNG deterministik
    let seed = 42;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

    // Bintang kecil 700 — warna spektral
    for (let i = 0; i < 700; i++) {
      const x = rand() * S;
      const y = rand() * S * 0.85;
      const r = rand() * 0.6 + 0.2;
      const a = rand() * 0.5 + 0.25;
      const hue = rand();
      let color;
      if (hue < 0.3)       color = `rgba(180,200,255,${a})`;
      else if (hue < 0.65) color = `rgba(255,255,255,${a})`;
      else if (hue < 0.85) color = `rgba(255,245,200,${a})`;
      else                 color = `rgba(255,210,160,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Bintang sedang 120 — dengan glow tipis
    for (let i = 0; i < 120; i++) {
      const x = rand() * S;
      const y = rand() * S * 0.82;
      const r = rand() * 1.0 + 0.6;
      const a = rand() * 0.5 + 0.45;
      const hue = rand();
      let rgb;
      if (hue < 0.3)       rgb = '190,210,255';
      else if (hue < 0.65) rgb = '255,255,255';
      else                 rgb = '255,248,210';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb},${a})`;
      ctx.fill();
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
      g.addColorStop(0, `rgba(${rgb},${a * 0.4})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.beginPath();
      ctx.arc(x, y, r * 3.5, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    }

    // Bintang terang 18 — dengan spike salib
    for (let i = 0; i < 18; i++) {
      const x = rand() * S;
      const y = rand() * S * 0.78;
      const r = rand() * 1.5 + 1.2;
      const a = rand() * 0.4 + 0.55;
      const gl = ctx.createRadialGradient(x, y, 0, x, y, r * 8);
      gl.addColorStop(0, 'rgba(200,220,255,0.5)');
      gl.addColorStop(0.3, 'rgba(180,200,255,0.1)');
      gl.addColorStop(1, 'rgba(150,180,255,0)');
      ctx.beginPath();
      ctx.arc(x, y, r * 8, 0, Math.PI * 2);
      ctx.fillStyle = gl;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220,235,255,${a})`;
      ctx.fill();
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = 'rgba(200,220,255,1)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x - r * 6, y); ctx.lineTo(x + r * 6, y);
      ctx.moveTo(x, y - r * 6); ctx.lineTo(x, y + r * 6);
      ctx.stroke();
      ctx.restore();
    }

    // Bulan kecil (radius 8px) dengan fase sabit dan tekstur kawah
    const moonX = 820, moonY = 110, moonR = 8;
    const moonHalo = ctx.createRadialGradient(moonX, moonY, moonR * 0.8, moonX, moonY, moonR * 6);
    moonHalo.addColorStop(0, 'rgba(230,230,200,0.12)');
    moonHalo.addColorStop(0.5, 'rgba(200,200,160,0.04)');
    moonHalo.addColorStop(1, 'rgba(180,180,140,0)');
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 6, 0, Math.PI * 2);
    ctx.fillStyle = moonHalo;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fillStyle = '#e8e4d0';
    ctx.fill();
    ctx.globalAlpha = 0.18;
    ctx.beginPath(); ctx.arc(moonX - 2.5, moonY - 1, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = '#a09878'; ctx.fill();
    ctx.beginPath(); ctx.arc(moonX + 2, moonY + 2.5, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#b0a888'; ctx.fill();
    ctx.beginPath(); ctx.arc(moonX - 1, moonY + 3, 1.0, 0, Math.PI * 2);
    ctx.fillStyle = '#988c6a'; ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.beginPath();
    ctx.arc(moonX + 2.5, moonY, moonR * 0.92, 0, Math.PI * 2);
    ctx.fillStyle = '#02020c';
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
