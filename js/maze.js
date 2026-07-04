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
    const S = 1024;

    // Helper buat texture canvas untuk satu sisi skybox
    const makeSkyFace = (drawFn) => {
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const ctx = c.getContext('2d');
      drawFn(ctx, c);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };

    // RNG deterministik
    let seed = 42;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

    const drawStars = (ctx, includeMoon = false) => {
      // Background gelap
      const grad = ctx.createLinearGradient(0, 0, 0, S);
      grad.addColorStop(0.0,  '#000004');
      grad.addColorStop(0.5,  '#02020a');
      grad.addColorStop(1.0,  '#050310');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, S, S);

      // Bintang kecil
      for (let i = 0; i < 500; i++) {
        const x = rand() * S, y = rand() * S;
        const r = rand() * 0.55 + 0.15;
        const a = rand() * 0.55 + 0.25;
        const h = rand();
        let col;
        if (h < 0.3)       col = `rgba(180,200,255,${a})`;
        else if (h < 0.65) col = `rgba(255,255,255,${a})`;
        else if (h < 0.85) col = `rgba(255,245,200,${a})`;
        else               col = `rgba(255,210,160,${a})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
      }

      // Bintang sedang — 25 bintang, glow sangat kecil
      for (let i = 0; i < 25; i++) {
        const x = rand() * S, y = rand() * S;
        const r = rand() * 0.7 + 0.45;
        const a = rand() * 0.4 + 0.5;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill();
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
        g.addColorStop(0, `rgba(220,230,255,${a * 0.2})`);
        g.addColorStop(1, 'rgba(220,230,255,0)');
        ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
      }

      if (includeMoon) {
        // Bulan merah darah seram — radius 14px
        const mx = 760, my = 160, mr = 14;

        // Aura merah suram di sekitar bulan
        const aura = ctx.createRadialGradient(mx, my, mr, mx, my, mr * 7);
        aura.addColorStop(0,   'rgba(180,20,0,0.22)');
        aura.addColorStop(0.4, 'rgba(120,10,0,0.08)');
        aura.addColorStop(1,   'rgba(80,0,0,0)');
        ctx.beginPath(); ctx.arc(mx, my, mr * 7, 0, Math.PI * 2);
        ctx.fillStyle = aura; ctx.fill();

        // Disc bulan — gradient merah-oranye redup
        const moonGrad = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 0, mx, my, mr);
        moonGrad.addColorStop(0,   '#c84020');
        moonGrad.addColorStop(0.5, '#8a1a08');
        moonGrad.addColorStop(1,   '#3a0800');
        ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2);
        ctx.fillStyle = moonGrad; ctx.fill();

        // Tekstur kawah gelap
        ctx.globalAlpha = 0.35;
        [[mx-4, my-3, 3.5], [mx+4, my+3, 2.5], [mx-2, my+5, 2], [mx+5, my-4, 1.5]].forEach(([cx,cy,cr]) => {
          ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2);
          ctx.fillStyle = '#1a0400'; ctx.fill();
        });
        ctx.globalAlpha = 1.0;

        // Retakan / garis seram di permukaan bulan
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = '#ff4400';
        ctx.lineWidth = 0.6;
        ctx.shadowColor = '#ff2200';
        ctx.shadowBlur = 3;
        ctx.beginPath();
        ctx.moveTo(mx - 6, my - 2); ctx.lineTo(mx + 2, my + 5);
        ctx.moveTo(mx + 4, my - 5); ctx.lineTo(mx - 1, my + 6);
        ctx.moveTo(mx - 3, my + 2); ctx.lineTo(mx + 6, my - 3);
        ctx.stroke();
        ctx.restore();
      }
    };

    // Buat 6 sisi skybox — sisi atas (top) dan sisi samping
    const texTop   = makeSkyFace((ctx) => { seed = 42; drawStars(ctx, false); });
    const texFront = makeSkyFace((ctx) => { seed = 99; drawStars(ctx, true); });
    const texBack  = makeSkyFace((ctx) => { seed = 155; drawStars(ctx, false); });
    const texLeft  = makeSkyFace((ctx) => { seed = 211; drawStars(ctx, false); });
    const texRight = makeSkyFace((ctx) => { seed = 267; drawStars(ctx, false); });
    const texBot   = makeSkyFace((ctx) => {
      ctx.fillStyle = '#000004'; ctx.fillRect(0, 0, S, S);
    });

    // BoxGeometry skybox — tidak ada pole, tidak ada distorsi
    const skyGeo = new THREE.BoxGeometry(240, 240, 240);
    const skyMats = [
      new THREE.MeshBasicMaterial({ map: texRight, side: THREE.BackSide, depthWrite: false, fog: false }),
      new THREE.MeshBasicMaterial({ map: texLeft,  side: THREE.BackSide, depthWrite: false, fog: false }),
      new THREE.MeshBasicMaterial({ map: texTop,   side: THREE.BackSide, depthWrite: false, fog: false }),
      new THREE.MeshBasicMaterial({ map: texBot,   side: THREE.BackSide, depthWrite: false, fog: false }),
      new THREE.MeshBasicMaterial({ map: texFront, side: THREE.BackSide, depthWrite: false, fog: false }),
      new THREE.MeshBasicMaterial({ map: texBack,  side: THREE.BackSide, depthWrite: false, fog: false }),
    ];

    const skyBox = new THREE.Mesh(skyGeo, skyMats);
    skyBox.renderOrder = -1;
    skyBox.name = 'SkyBox';
    this.skyBox = skyBox;
    this.scene.add(skyBox);
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
