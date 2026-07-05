import * as THREE from 'three';
import { MAZE_LAYOUT, gridToWorld, worldToGrid } from './maze.js';
import { findPathAStar, simplifyPath } from './pathfinding.js';

const DETECTION_RADIUS = 7.0;
const CATCH_RADIUS = 0.9;
const REPATH_INTERVAL = 0.6;
const PATROL_POINT_RADIUS = 0.3;

const PATROL_POINTS = [
  { col: 13, row: 13 },
  { col: 13, row: 9 },
  { col: 9, row: 9 },
  { col: 9, row: 13 },
];

export class Enemy {
  constructor(scene, spawnGridPos, baseSpeed = 2.2) {
    this.scene = scene;
    this.grid = MAZE_LAYOUT;
    this.baseSpeed = baseSpeed;
    this.speed = baseSpeed;

    this.state = 'PATROL';
    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.patrolIndex = 0;
    this.hasCaughtPlayer = false;
    this.trailParticles = [];

    this._buildMesh();
    this.setGridPosition(spawnGridPos.col, spawnGridPos.row);

    this.debugPathEnabled = false;
    this._buildDebugPathLine();
  }

  _buildMesh() {
    this.group = new THREE.Group();
    this.group.name = 'Enemy';

    // 1. Procedural bloody and dirty cloth texture for Kuntilanak's dress
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Base color: pale dirty white/grey
    ctx.fillStyle = '#eaeae5';
    ctx.fillRect(0, 0, 256, 512);
    
    // Mud/dirt spots
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = 'rgba(65, 55, 45, 0.4)';
      ctx.beginPath();
      ctx.arc(Math.random() * 256, Math.random() * 512, Math.random() * 15 + 5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Blood spots and smears (dark and bright crimson)
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = Math.random() > 0.4 ? 'rgba(100, 5, 5, 0.8)' : 'rgba(150, 10, 10, 0.9)';
      ctx.beginPath();
      const x = Math.random() * 256;
      const y = Math.random() * 512;
      const rx = Math.random() * 12 + 3;
      const ry = Math.random() * 24 + 6;
      ctx.ellipse(x, y, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    
    const dressTexture = new THREE.CanvasTexture(canvas);
    const dressMat = new THREE.MeshStandardMaterial({
      map: dressTexture,
      roughness: 0.9,
      metalness: 0.05,
    });

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc, // Pale skin
      roughness: 0.8,
    });

    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 3.0, // High glowing red eyes
    });

    const clawMat = new THREE.MeshStandardMaterial({
      color: 0x111111, // Dark claws
      emissive: 0x440000,
      roughness: 0.9,
    });

    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x050505, // Messy black hair
      roughness: 0.95,
    });

    // 2. Dress/Body: cylinder/cone that expands at the bottom
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.42, 1.2, 8), dressMat);
    torso.position.y = 0.9;
    torso.castShadow = true;
    this.group.add(torso);

    // 3. Head: pale sphere
    this.headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), skinMat);
    this.headMesh.position.y = 1.6;
    this.headMesh.castShadow = true;
    this.group.add(this.headMesh);

    // 4. Glowing Red Eyes (peeking through the hair)
    const eyeGeo = new THREE.SphereGeometry(0.045, 6, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.08, 1.63, 0.2);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.08, 1.63, 0.2);
    this.group.add(eyeL, eyeR);

    // 5. Messy Long Black Hair strands
    this.hairStrands = [];
    const hairCount = 24;
    for (let i = 0; i < hairCount; i++) {
      const angle = (i / hairCount) * Math.PI * 2;
      const radius = 0.21;
      const hx = Math.cos(angle) * radius;
      const hz = Math.sin(angle) * radius;
      
      const strandLen = 0.65 + Math.random() * 0.45;
      const hairGeo = new THREE.BoxGeometry(0.045, strandLen, 0.015);
      const strand = new THREE.Mesh(hairGeo, hairMat);
      
      strand.position.set(hx, 1.6 - strandLen / 2 + 0.05, hz);
      strand.rotation.y = angle;
      
      // Face-covering hair strands (z > 0)
      if (hz > 0) {
        strand.position.y -= 0.15; // hang lower to cover face
        strand.scale.y = 1.4;
        strand.rotation.x = 0.05 + Math.random() * 0.1;
      } else {
        strand.rotation.x = (Math.random() - 0.5) * 0.2;
        strand.rotation.z = (Math.random() - 0.5) * 0.2;
      }
      
      this.group.add(strand);
      this.hairStrands.push(strand);
    }

    // 6. Jointed Pale Creepy Arms with Claws
    this.armL = new THREE.Group();
    this.armL.position.set(-0.32, 1.15, 0);
    this.armR = new THREE.Group();
    this.armR.position.set(0.32, 1.15, 0);

    const upperArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.55, 4), skinMat);
    upperArmL.position.y = -0.275;
    this.armL.add(upperArmL);

    const upperArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.55, 4), skinMat);
    upperArmR.position.y = -0.275;
    this.armR.add(upperArmR);

    this.forearmL = new THREE.Group();
    this.forearmL.position.set(0, -0.55, 0);
    const forearmMeshL = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.6, 4), skinMat);
    forearmMeshL.position.y = -0.3;
    this.forearmL.add(forearmMeshL);
    this.armL.add(this.forearmL);

    this.forearmR = new THREE.Group();
    this.forearmR.position.set(0, -0.55, 0);
    const forearmMeshR = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.6, 4), skinMat);
    forearmMeshR.position.y = -0.3;
    this.forearmR.add(forearmMeshR);
    this.armR.add(this.forearmR);

    // Creepy claws
    for (let f = 0; f < 4; f++) {
      const fx = (f - 1.5) * 0.025;
      const fingerL = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.22, 4), clawMat);
      fingerL.position.set(fx, -0.65, 0.04);
      fingerL.rotation.x = 0.6;
      this.forearmL.add(fingerL);

      const fingerR = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.22, 4), clawMat);
      fingerR.position.set(fx, -0.65, 0.04);
      fingerR.rotation.x = 0.6;
      this.forearmR.add(fingerR);
    }

    this.group.add(this.armL, this.armR);

    // 7. Dynamic eye light
    this.eyeGlow = new THREE.PointLight(0xff0000, 1.2, 3);
    this.eyeGlow.position.set(0, 1.63, 0.25);
    this.group.add(this.eyeGlow);

    this.scene.add(this.group);
  }

  _buildDebugPathLine() {
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const geometry = new THREE.BufferGeometry();
    this.debugLine = new THREE.Line(geometry, material);
    this.debugLine.visible = false;
    this.scene.add(this.debugLine);
  }

  setDebugPathVisible(visible) {
    this.debugPathEnabled = visible;
    this.debugLine.visible = visible;
  }

  setSpeed(speed) { this.speed = speed; }

  setGridPosition(col, row) {
    const { x, z } = gridToWorld(col, row);
    this.group.position.set(x, 0, z);
  }

  getGridPosition() {
    return worldToGrid(this.group.position.x, this.group.position.z);
  }

  update(delta, player) {
    if (this.hasCaughtPlayer) return;

    const myPos = this.group.position;
    const playerPos = player.camera.position;
    const distanceToPlayer = myPos.distanceTo(
      new THREE.Vector3(playerPos.x, myPos.y, playerPos.z)
    );

    if (distanceToPlayer <= DETECTION_RADIUS) {
      if (this.state !== 'CHASE') {
        this.state = 'CHASE';
        this.repathTimer = 0;
      }
    } else if (distanceToPlayer > DETECTION_RADIUS * 1.4) {
      if (this.state !== 'PATROL') {
        this.state = 'PATROL';
        this.path = [];
        this.pathIndex = 0;
      }
    }

    if (this.state === 'CHASE' && distanceToPlayer <= CATCH_RADIUS) {
      this.hasCaughtPlayer = true;
      return;
    }

    if (this.state === 'CHASE') {
      this._updateChase(delta, player);
      
      // Animate arms reaching forward to grab player
      this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, -Math.PI / 2.0, 0.15);
      this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, -Math.PI / 2.0, 0.15);
      this.armL.rotation.y = THREE.MathUtils.lerp(this.armL.rotation.y, 0.1, 0.15);
      this.armR.rotation.y = THREE.MathUtils.lerp(this.armR.rotation.y, -0.1, 0.15);

      // Fast erratic shivering/twitching of arms
      const twitch = (Math.random() - 0.5) * 0.2;
      this.forearmL.rotation.z = twitch;
      this.forearmR.rotation.z = -twitch;
      this.forearmL.rotation.y = twitch * 0.5;
      this.forearmR.rotation.y = -twitch * 0.5;
      
      // Fast body shivering and rotation twitching (glitching effect)
      const time = performance.now();
      this.group.position.y = Math.sin(time * 0.025) * 0.08 + (Math.random() - 0.5) * 0.02;
      
      if (Math.random() > 0.8) {
        this.group.rotation.x = (Math.random() - 0.5) * 0.18;
        this.group.rotation.z = (Math.random() - 0.5) * 0.18;
        this.headMesh.position.x = (Math.random() - 0.5) * 0.05;
      } else {
        this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, 0, 0.3);
        this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, 0, 0.3);
        this.headMesh.position.x = THREE.MathUtils.lerp(this.headMesh.position.x, 0, 0.3);
      }
    } else {
      this._updatePatrol(delta);

      // Arms hanging down and swaying slowly
      const time = performance.now();
      const sway = Math.sin(time * 0.003) * 0.08;
      this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, sway, 0.05);
      this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, -sway, 0.05);
      this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, 0.06, 0.05);
      this.armR.rotation.z = THREE.MathUtils.lerp(this.armR.rotation.z, -0.06, 0.05);
      
      this.forearmL.rotation.z = THREE.MathUtils.lerp(this.forearmL.rotation.z, 0, 0.05);
      this.forearmR.rotation.z = THREE.MathUtils.lerp(this.forearmR.rotation.z, 0, 0.05);

      // Calm, slow hover floating
      this.group.position.y = Math.sin(time * 0.004) * 0.05;
      this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, 0, 0.1);
      this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, 0, 0.1);
      this.headMesh.position.x = THREE.MathUtils.lerp(this.headMesh.position.x, 0, 0.1);
    }

    // Update trail particles
    this._updateTrailParticles(delta);
  }

  _updateTrailParticles(delta) {
    if (!this.trailParticles) this.trailParticles = [];

    // Spawn a particle
    const spawnChance = this.state === 'CHASE' ? 0.45 : 0.75;
    if (Math.random() > spawnChance) {
      const pGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
      const isRed = Math.random() > 0.6;
      const pMat = new THREE.MeshBasicMaterial({
        color: isRed ? 0x770000 : 0x070707,
        transparent: true,
        opacity: 0.8,
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      
      // Position around the ghost's torso/base
      pMesh.position.copy(this.group.position);
      pMesh.position.y += 0.2 + Math.random() * 1.2;
      pMesh.position.x += (Math.random() - 0.5) * 0.45;
      pMesh.position.z += (Math.random() - 0.5) * 0.45;
      
      this.scene.add(pMesh);
      
      this.trailParticles.push({
        mesh: pMesh,
        mat: pMat,
        life: 0.8 + Math.random() * 0.4,
        maxLife: 0.8 + Math.random() * 0.4,
        velY: 0.15 + Math.random() * 0.25,
        velX: (Math.random() - 0.5) * 0.1,
        velZ: (Math.random() - 0.5) * 0.1,
      });
    }

    // Update particles
    for (let i = this.trailParticles.length - 1; i >= 0; i--) {
      const p = this.trailParticles[i];
      p.life -= delta;
      
      p.mesh.position.y += p.velY * delta;
      p.mesh.position.x += p.velX * delta;
      p.mesh.position.z += p.velZ * delta;
      
      p.mat.opacity = Math.max(0, p.life / p.maxLife);
      
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mat.dispose();
        this.trailParticles.splice(i, 1);
      }
    }
  }

  _updateChase(delta, player) {
    this.repathTimer -= delta;

    if (this.repathTimer <= 0) {
      this.repathTimer = REPATH_INTERVAL;
      const startGrid = this.getGridPosition();
      const goalGrid = player.getGridPosition();
      const rawPath = findPathAStar(this.grid, startGrid, goalGrid);
      if (rawPath && rawPath.length > 1) {
        this.path = simplifyPath(rawPath);
        this.pathIndex = 1;
        this._updateDebugLine();
      }
    }

    this._followPath(delta);
  }

  _updatePatrol(delta) {
    if (this.path.length === 0) {
      const startGrid = this.getGridPosition();
      const targetGrid = PATROL_POINTS[this.patrolIndex];
      const rawPath = findPathAStar(this.grid, startGrid, targetGrid);
      if (rawPath && rawPath.length > 1) {
        this.path = simplifyPath(rawPath);
        this.pathIndex = 1;
        this._updateDebugLine();
      } else {
        this.patrolIndex = (this.patrolIndex + 1) % PATROL_POINTS.length;
        return;
      }
    }

    const reachedEnd = this._followPath(delta, this.speed * 0.55);
    if (reachedEnd) {
      this.patrolIndex = (this.patrolIndex + 1) % PATROL_POINTS.length;
      this.path = [];
    }
  }

  _followPath(delta, overrideSpeed) {
    if (this.path.length === 0 || this.pathIndex >= this.path.length) return true;

    const speed = overrideSpeed ?? this.speed;
    const targetGridPoint = this.path[this.pathIndex];
    const targetWorld = gridToWorld(targetGridPoint.col, targetGridPoint.row);
    const targetVec = new THREE.Vector3(targetWorld.x, this.group.position.y, targetWorld.z);

    const toTarget = new THREE.Vector3().subVectors(targetVec, this.group.position);
    const distance = toTarget.length();

    if (distance < PATROL_POINT_RADIUS) {
      this.pathIndex++;
      if (this.pathIndex >= this.path.length) return true;
      return false;
    }

    toTarget.normalize();
    this.group.position.x += toTarget.x * speed * delta;
    this.group.position.z += toTarget.z * speed * delta;

    const angle = Math.atan2(toTarget.x, toTarget.z);
    this.group.rotation.y = angle;

    return false;
  }

  _updateDebugLine() {
    if (!this.path || this.path.length === 0) return;
    const points = this.path.map((p) => {
      const w = gridToWorld(p.col, p.row);
      return new THREE.Vector3(w.x, 0.05, w.z);
    });
    this.debugLine.geometry.dispose();
    this.debugLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }

  getStatusLabel() {
    return this.state === 'CHASE' ? 'MENGEJAR!' : 'Berpatroli';
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.debugLine);
    if (this.trailParticles) {
      for (const p of this.trailParticles) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mat.dispose();
      }
      this.trailParticles = [];
    }
  }
}
