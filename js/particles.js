/**
 * =========================================================================
 *  particles.js
 * =========================================================================
 *  Sistem partikel sederhana berbasis THREE.Points, dipakai untuk:
 *   - Efek saat kunci diambil (burst emas)
 *   - Efek saat menang (confetti/cahaya naik)
 *   - Efek saat game over (debu merah berjatuhan)
 *
 *  Setiap efek adalah objek partikel sementara (one-shot) yang otomatis
 *  dibersihkan dari scene setelah durasinya habis.
 * =========================================================================
 */

import * as THREE from 'three';

class ParticleBurst {
  constructor(scene, options) {
    this.scene = scene;
    this.life = 0;
    this.maxLife = options.duration ?? 1.5;
    this.velocities = [];

    const count = options.count ?? 80;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = options.position.x + (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 1] = options.position.y + (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 2] = options.position.z + (Math.random() - 0.5) * 0.3;

      // Arah kecepatan acak, dengan bias ke atas jika diminta
      const angle = Math.random() * Math.PI * 2;
      const upBias = options.upward ? Math.random() * 2.5 : (Math.random() - 0.3) * 1.5;
      this.velocities.push({
        x: Math.cos(angle) * (Math.random() * 1.5 + 0.3),
        y: upBias,
        z: Math.sin(angle) * (Math.random() * 1.5 + 0.3),
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: options.color ?? 0xffffff,
      size: options.size ?? 0.08,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, material);
    this.material = material;
    this.scene.add(this.points);
  }

  /** @returns {boolean} true jika efek sudah selesai dan harus dihapus */
  update(delta) {
    this.life += delta;
    const t = this.life / this.maxLife;

    const positions = this.points.geometry.attributes.position.array;
    for (let i = 0; i < this.velocities.length; i++) {
      const v = this.velocities[i];
      positions[i * 3 + 0] += v.x * delta;
      positions[i * 3 + 1] += (v.y - delta * 1.2) * delta; // sedikit gravitasi
      positions[i * 3 + 2] += v.z * delta;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.material.opacity = Math.max(0, 1.0 - t);

    if (this.life >= this.maxLife) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      this.material.dispose();
      return true;
    }
    return false;
  }
}

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.activeBursts = [];
  }

  /** Efek saat kunci diambil: ledakan partikel emas naik ke atas. */
  spawnKeyPickupEffect(position) {
    this.activeBursts.push(
      new ParticleBurst(this.scene, {
        position,
        color: 0xffd700,
        count: 60,
        size: 0.1,
        duration: 1.2,
        upward: true,
      })
    );
  }

  /** Efek saat menang: ledakan partikel putih/emas besar di posisi pemain. */
  spawnVictoryEffect(position) {
    this.activeBursts.push(
      new ParticleBurst(this.scene, {
        position,
        color: 0xffffff,
        count: 150,
        size: 0.12,
        duration: 2.5,
        upward: true,
      })
    );
    this.activeBursts.push(
      new ParticleBurst(this.scene, {
        position,
        color: 0xd4af37,
        count: 100,
        size: 0.09,
        duration: 2.0,
        upward: true,
      })
    );
  }

  /** Efek saat game over: ledakan partikel merah darah di posisi pemain. */
  spawnGameOverEffect(position) {
    this.activeBursts.push(
      new ParticleBurst(this.scene, {
        position,
        color: 0x8a0303,
        count: 100,
        size: 0.1,
        duration: 1.8,
        upward: false,
      })
    );
  }

  /** Update semua efek partikel aktif, hapus yang sudah selesai. */
  update(delta) {
    this.activeBursts = this.activeBursts.filter((burst) => !burst.update(delta));
  }

  /** Membersihkan semua efek (dipanggil saat reset game). */
  clearAll() {
    for (const burst of this.activeBursts) {
      this.scene.remove(burst.points);
      burst.points.geometry.dispose();
      burst.material.dispose();
    }
    this.activeBursts = [];
  }
}
