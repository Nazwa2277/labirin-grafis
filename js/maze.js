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

  _generateScarySkyTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // 1. Draw base sky gradient (matching the fog color 0x05050f at the horizon)
    const baseGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    baseGrad.addColorStop(0.0, '#010002');       // Near-black zenith (top)
    baseGrad.addColorStop(0.3, '#05030d');       // Eerie dark purple-black
    baseGrad.addColorStop(0.48, '#05050f');      // EXACT fog color at the horizon (so fog and sky blend seamlessly!)
    baseGrad.addColorStop(0.52, '#030308');      // Fade below horizon
    baseGrad.addColorStop(1.0, '#000000');       // Pure black nadir (bottom)
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw stars (upper half only, fading out near the horizon)
    const numStars = 600;
    for (let i = 0; i < numStars; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height * 0.48; // keep above horizon
      
      const size = Math.random() * 1.3 + 0.3;
      // Stars fade out as they get closer to the horizon (y increases to 0.48)
      const horizonFactor = Math.max(0, 1 - (y / (canvas.height * 0.48)));
      const alpha = (Math.random() * 0.8 + 0.2) * horizonFactor;
      
      let colorType = Math.random();
      let colorStr = 'rgba(255, 255, 255, ';
      if (colorType < 0.15) {
        colorStr = 'rgba(255, 120, 120, '; // Eerie red star
      } else if (colorType < 0.25) {
        colorStr = 'rgba(255, 220, 180, '; // Faint warm star
      }
      
      ctx.fillStyle = colorStr + alpha + ')';
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();

      // subtle cross flare for bright stars
      if (size > 1.2 && Math.random() < 0.08) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.35})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x - size * 2.5, y);
        ctx.lineTo(x + size * 2.5, y);
        ctx.moveTo(x, y - size * 2.5);
        ctx.lineTo(x, y + size * 2.5);
        ctx.stroke();
      }
    }

    // 3. Draw Blood Moon (glowing red moon)
    const moonX = canvas.width * 0.35;
    const moonY = canvas.height * 0.20;
    const moonRadius = 60;

    // A. Outer halo/atmosphere glow (concentrated scary red glow around the moon)
    const outerGlow = ctx.createRadialGradient(moonX, moonY, moonRadius, moonX, moonY, moonRadius * 5);
    outerGlow.addColorStop(0, 'rgba(255, 10, 10, 0.45)');
    outerGlow.addColorStop(0.2, 'rgba(200, 5, 5, 0.25)');
    outerGlow.addColorStop(0.5, 'rgba(120, 0, 5, 0.08)');
    outerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonRadius * 5, 0, Math.PI * 2);
    ctx.fill();

    const midGlow = ctx.createRadialGradient(moonX, moonY, moonRadius, moonX, moonY, moonRadius * 2);
    midGlow.addColorStop(0, 'rgba(255, 30, 30, 0.65)');
    midGlow.addColorStop(0.5, 'rgba(180, 10, 10, 0.3)');
    midGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = midGlow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonRadius * 2, 0, Math.PI * 2);
    ctx.fill();

    // B. Moon base disk
    const moonDiscGrad = ctx.createRadialGradient(
      moonX - moonRadius * 0.15,
      moonY - moonRadius * 0.15,
      moonRadius * 0.05,
      moonX,
      moonY,
      moonRadius
    );
    moonDiscGrad.addColorStop(0.0, '#ff8a8a'); // Highlight
    moonDiscGrad.addColorStop(0.3, '#ff3333'); // Blood red
    moonDiscGrad.addColorStop(0.7, '#b30000'); // Shadow red
    moonDiscGrad.addColorStop(0.95, '#590000'); // Deep edge
    moonDiscGrad.addColorStop(1.0, '#260000'); // Silhouette edge
    ctx.fillStyle = moonDiscGrad;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
    ctx.fill();

    // C. Moon surface details (craters & texture)
    ctx.fillStyle = 'rgba(40, 0, 0, 0.4)';
    const craterPositions = [
      { dx: -20, dy: -12, r: 11 },
      { dx: -8, dy: 22, r: 15 },
      { dx: 22, dy: -18, r: 9 },
      { dx: 28, dy: 12, r: 13 },
      { dx: 4, dy: -26, r: 7 },
      { dx: -32, dy: 8, r: 8 },
      { dx: 10, dy: -4, r: 16 },
      { dx: -15, dy: -4, r: 6 },
      { dx: -4, dy: -10, r: 13 },
      { dx: 12, dy: 22, r: 10 }
    ];
    craterPositions.forEach(crater => {
      ctx.beginPath();
      ctx.arc(moonX + crater.dx, moonY + crater.dy, crater.r, 0, Math.PI * 2);
      ctx.fill();

      // crater rim highlight
      ctx.strokeStyle = 'rgba(255, 150, 150, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(moonX + crater.dx + 0.8, moonY + crater.dy + 0.8, crater.r, 0.25 * Math.PI, 1.25 * Math.PI);
      ctx.stroke();
    });

    // D. Spooky clouds passing in front of the moon
    const cloud1 = ctx.createLinearGradient(moonX - 120, moonY + 15, moonX + 120, moonY + 35);
    cloud1.addColorStop(0, 'rgba(0, 0, 0, 0)');
    cloud1.addColorStop(0.3, 'rgba(10, 2, 5, 0.65)');
    cloud1.addColorStop(0.7, 'rgba(8, 1, 4, 0.75)');
    cloud1.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = cloud1;
    ctx.beginPath();
    ctx.ellipse(moonX - 5, moonY + 20, 130, 15, Math.PI / 18, 0, Math.PI * 2);
    ctx.fill();

    const cloud2 = ctx.createLinearGradient(moonX - 100, moonY - 25, moonX + 100, moonY - 15);
    cloud2.addColorStop(0, 'rgba(0, 0, 0, 0)');
    cloud2.addColorStop(0.4, 'rgba(15, 3, 5, 0.6)');
    cloud2.addColorStop(0.8, 'rgba(5, 1, 3, 0.7)');
    cloud2.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = cloud2;
    ctx.beginPath();
    ctx.ellipse(moonX + 10, moonY - 15, 100, 12, -Math.PI / 14, 0, Math.PI * 2);
    ctx.fill();

    // 4. Draw distant dark wispy clouds near the horizon
    const numClouds = 6;
    for (let i = 0; i < numClouds; i++) {
      const cy = canvas.height * (0.35 + Math.random() * 0.1);
      const cx = Math.random() * canvas.width;
      const rx = Math.random() * 300 + 200;
      const ry = Math.random() * 12 + 6;
      const angle = (Math.random() - 0.5) * 0.04;

      const cloudGrad = ctx.createLinearGradient(cx - rx, cy, cx + rx, cy);
      cloudGrad.addColorStop(0, 'rgba(0,0,0,0)');
      cloudGrad.addColorStop(0.5, 'rgba(10, 5, 15, 0.55)');
      cloudGrad.addColorStop(1, 'rgba(0,0,0,0)');
      
      ctx.fillStyle = cloudGrad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, angle, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  _buildCeiling() {
    const skyTexture = this._generateScarySkyTexture();
    this.scene.background = skyTexture;
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
