/**
 * =========================================================================
 *  door.js
 * =========================================================================
 *  Pintu keluar labirin. Memiliki dua status visual:
 *    - LOCKED  (terkunci, berwarna merah) -> sebelum kunci diambil
 *    - UNLOCKED (terbuka, berwarna hijau) -> setelah kunci diambil
 *
 *  Pemain menang jika menyentuh pintu dalam keadaan UNLOCKED.
 * =========================================================================
 */

import * as THREE from 'three';
import { gridToWorld, CELL_SIZE, WALL_HEIGHT } from './maze.js';

export class Door {
  /**
   * @param {THREE.Scene} scene
   * @param {{col:number, row:number}} gridPosition
   * @param {THREE.LoadingManager} [loadingManager]
   */
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

    // Frame pintu (bata di kiri-kanan)
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 });
    const frameGeo = new THREE.BoxGeometry(0.3, WALL_HEIGHT, CELL_SIZE);

    const frameLeft = new THREE.Mesh(frameGeo, frameMat);
    frameLeft.position.set(-CELL_SIZE / 2 + 0.15, WALL_HEIGHT / 2, 0);
    this.group.add(frameLeft);

    const frameRight = new THREE.Mesh(frameGeo, frameMat);
    frameRight.position.set(CELL_SIZE / 2 - 0.15, WALL_HEIGHT / 2, 0);
    this.group.add(frameRight);

    // Daun pintu — material berubah warna sesuai status terkunci/terbuka
    this.doorMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x3a0000,
      emissiveIntensity: 0.4,
      roughness: 0.5,
      metalness: 0.3,
    });

    // Load texture pintu
    const textureLoader = new THREE.TextureLoader(this.loadingManager);
    const generateProceduralDoor = () => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#8a0303';
      ctx.fillRect(0, 0, size, size);

      // Draw border frame
      ctx.strokeStyle = '#3a0000';
      ctx.lineWidth = 15;
      ctx.strokeRect(0, 0, size, size);

      // Noise
      for (let i = 0; i < 200; i++) {
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.3})`;
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

    const doorGeo = new THREE.BoxGeometry(CELL_SIZE - 0.6, WALL_HEIGHT - 0.3, 0.18);
    this.doorMesh = new THREE.Mesh(doorGeo, this.doorMaterial);
    this.doorMesh.position.set(0, (WALL_HEIGHT - 0.3) / 2, 0);
    this.doorMesh.castShadow = true;
    this.group.add(this.doorMesh);

    // Lampu indikator status di atas pintu
    this.statusLight = new THREE.PointLight(0xff0000, 1.2, 5);
    this.statusLight.position.set(0, WALL_HEIGHT + 0.3, 0);
    this.group.add(this.statusLight);

    this.scene.add(this.group);
  }

  _loadTextureWithFallback(loader, basePath, fallbackFn, material, repeatX = 1, repeatY = 1) {
    const fallbackTexture = fallbackFn();
    fallbackTexture.wrapS = fallbackTexture.wrapT = THREE.RepeatWrapping;
    fallbackTexture.repeat.set(repeatX, repeatY);

    // Pasang fallback dulu agar tidak kosong saat loading berjalan
    material.map = fallbackTexture;
    material.needsUpdate = true;

    // Persiapkan list ekstensi yang dicoba jika extension bawaan gagal
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
      if (attemptIndex >= uniqueExts.length) {
        console.warn(`[Door] Semua ekstensi untuk tekstur "${pathWithoutExt}" gagal dimuat. Memakai prosedural fallback.`);
        return;
      }

      const currentPath = pathWithoutExt + uniqueExts[attemptIndex];
      loader.load(
        currentPath,
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(repeatX, repeatY);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;

          // Hapus fallback texture untuk free memory
          if (material.map && material.map.dispose) {
            material.map.dispose();
          }

          material.map = texture;
          material.needsUpdate = true;
          console.log(`[Door] Tekstur berhasil dimuat: ${currentPath}`);
        },
        undefined,
        () => {
          attemptIndex++;
          tryLoad(); // Coba ekstensi berikutnya
        }
      );
    };

    tryLoad();
  }

  /** Dipanggil saat pemain berhasil mengambil kunci. */
  unlock() {
    this.isUnlocked = true;
    this.doorMaterial.color.set(0xaaffaa);
    this.doorMaterial.emissive.set(0x003a00);
    this.statusLight.color.set(0x33ff55);

    // Animasi sederhana: pintu sedikit terbuka (rotasi)
    this.doorMesh.position.x = -0.4;
    this.doorMesh.rotation.y = -0.5;
  }

  lock() {
    this.isUnlocked = false;
    this.doorMaterial.color.set(0xffffff);
    this.doorMaterial.emissive.set(0x3a0000);
    this.statusLight.color.set(0xff0000);
    this.doorMesh.position.x = 0;
    this.doorMesh.rotation.y = 0;
  }

  /** Animasi denyut lampu indikator agar terlihat hidup. */
  update(elapsedTime) {
    const pulse = 0.9 + Math.sin(elapsedTime * 3.0) * 0.3;
    this.statusLight.intensity = this.isUnlocked ? pulse * 1.2 : pulse * 0.7;
  }

  /** Mengecek apakah pemain mencapai pintu dalam keadaan terbuka -> menang. */
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
