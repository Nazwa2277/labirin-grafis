import * as THREE from 'three';
import { gridToWorld, CELL_SIZE, WALL_HEIGHT } from './maze.js';

export class Door {
  constructor(scene, gridPosition, loadingManager) {
    this.scene = scene;
    this.isUnlocked = false;
    this.hasTriggeredWin = false;
    this.loadingManager = loadingManager;

    const { x, z } = gridToWorld(gridPosition.col, gridPosition.row);
    this.position = new THREE.Vector3(x, 0, z);

    this._buildMesh();
  }

  _buildMesh() {
    this.group = new THREE.Group();
    this.group.name = 'ExitDoor';
    this.group.position.copy(this.position);

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x4a3000,
      roughness: 0.8,
      emissive: 0x1a0800,
      emissiveIntensity: 0.3,
    });
    const frameGeo = new THREE.BoxGeometry(0.3, WALL_HEIGHT, CELL_SIZE);

    const frameLeft = new THREE.Mesh(frameGeo, frameMat);
    frameLeft.position.set(-CELL_SIZE / 2 + 0.15, WALL_HEIGHT / 2, 0);
    this.group.add(frameLeft);

    const frameRight = new THREE.Mesh(frameGeo, frameMat);
    frameRight.position.set(CELL_SIZE / 2 - 0.15, WALL_HEIGHT / 2, 0);
    this.group.add(frameRight);

    const frameTop = new THREE.Mesh(
      new THREE.BoxGeometry(CELL_SIZE, 0.3, 0.3),
      frameMat
    );
    frameTop.position.set(0, WALL_HEIGHT - 0.15, 0);
    this.group.add(frameTop);

    this.doorMaterial = new THREE.MeshStandardMaterial({
      color: 0xff2200,
      emissive: 0xff0000,
      emissiveIntensity: 0.6,
      roughness: 0.4,
      metalness: 0.3,
    });

    const textureLoader = new THREE.TextureLoader(this.loadingManager);
    const generateProceduralDoor = () => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#cc1100';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#ff4400';
      ctx.lineWidth = 12;
      ctx.strokeRect(8, 8, size - 16, size - 16);
      ctx.strokeStyle = '#ff6600';
      ctx.lineWidth = 4;
      ctx.strokeRect(20, 20, size - 40, size - 40);
      for (let i = 0; i < 300; i++) {
        ctx.fillStyle = `rgba(255,${Math.floor(Math.random()*80)},0,${Math.random() * 0.2})`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 3, 3);
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    };

    this._loadTextureWithFallback(
      textureLoader,
      'textures/door.jpg',
      generateProceduralDoor,
      this.doorMaterial
    );

    const doorGeo = new THREE.BoxGeometry(CELL_SIZE - 0.6, WALL_HEIGHT - 0.3, 0.22);
    this.doorMesh = new THREE.Mesh(doorGeo, this.doorMaterial);
    this.doorMesh.position.set(0, (WALL_HEIGHT - 0.3) / 2, 0);
    this.doorMesh.castShadow = true;
    this.group.add(this.doorMesh);

    this.statusLight = new THREE.PointLight(0xff0000, 3.0, 10);
    this.statusLight.position.set(0, WALL_HEIGHT + 0.4, 0);
    this.group.add(this.statusLight);

    this.statusLight2 = new THREE.PointLight(0xff2200, 1.5, 6);
    this.statusLight2.position.set(0, WALL_HEIGHT / 2, 0.5);
    this.group.add(this.statusLight2);

    const glowRingGeo = new THREE.TorusGeometry(CELL_SIZE / 2 - 0.1, 0.08, 8, 32);
    this.glowRingMat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 1.5,
    });
    this.glowRing = new THREE.Mesh(glowRingGeo, this.glowRingMat);
    this.glowRing.position.set(0, WALL_HEIGHT / 2, 0.12);
    this.glowRing.rotation.x = Math.PI / 2;
    this.group.add(this.glowRing);

    this.scene.add(this.group);
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

  unlock() {
    this.isUnlocked = true;
    this.doorMaterial.color.set(0x00ff66);
    this.doorMaterial.emissive.set(0x00ff44);
    this.doorMaterial.emissiveIntensity = 0.8;
    this.statusLight.color.set(0x00ff44);
    this.statusLight.intensity = 4.0;
    this.statusLight2.color.set(0x00ff44);
    this.glowRingMat.color.set(0x00ff44);
    this.glowRingMat.emissive.set(0x00ff44);
    this.doorMesh.position.x = -0.4;
    this.doorMesh.rotation.y = -0.5;
  }

  lock() {
    this.isUnlocked = false;
    this.doorMaterial.color.set(0xff2200);
    this.doorMaterial.emissive.set(0xff0000);
    this.doorMaterial.emissiveIntensity = 0.6;
    this.statusLight.color.set(0xff0000);
    this.statusLight.intensity = 3.0;
    this.statusLight2.color.set(0xff2200);
    this.glowRingMat.color.set(0xff0000);
    this.glowRingMat.emissive.set(0xff0000);
    this.doorMesh.position.x = 0;
    this.doorMesh.rotation.y = 0;
  }

  update(elapsedTime) {
    const pulse = 0.85 + Math.sin(elapsedTime * 3.5) * 0.35;
    this.statusLight.intensity = this.isUnlocked ? pulse * 4.0 : pulse * 3.0;
    this.statusLight2.intensity = pulse * 1.5;
    this.glowRingMat.emissiveIntensity = 1.2 + Math.sin(elapsedTime * 3.5) * 0.5;
    this.doorMaterial.emissiveIntensity = this.isUnlocked
      ? 0.6 + Math.sin(elapsedTime * 4.0) * 0.3
      : 0.4 + Math.sin(elapsedTime * 2.5) * 0.2;
  }

  checkWin(playerPosition, triggerRadius = 1.3) {
    if (!this.isUnlocked || this.hasTriggeredWin) return false;
    const dist = this.group.position.distanceTo(
      new THREE.Vector3(playerPosition.x, this.group.position.y, playerPosition.z)
    );
    if (dist <= triggerRadius) {
      this.hasTriggeredWin = true;
      return true;
    }
    return false;
  }

  reset() {
    this.lock();
    this.hasTriggeredWin = false;
  }
}
