import * as THREE from 'three';
import { rng } from './world.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, ...extra });
const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};

// ---------------------------------------------------------------------------
// Golden platanitos: a tapered, curved low-poly banana with brown tips and a halo
// ---------------------------------------------------------------------------
export function makeBanana() {
  const g = new THREE.Group();
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.13, 0.04, 0), new THREE.Vector3(0, -0.06, 0), new THREE.Vector3(0.13, 0.04, 0));
  const tubular = 10, radial = 6;
  const geo = new THREE.TubeGeometry(curve, tubular, 0.038, radial, false);
  const pos = geo.attributes.position, p = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular, c = curve.getPoint(t), k = 0.35 + 0.65 * Math.sin(Math.PI * t);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      p.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(k).add(c);
      pos.setXYZ(idx, p.x, p.y, p.z);
    }
  }
  geo.computeVertexNormals();
  const gold = std(0xffcf2e, { metalness: 0.3, roughness: 0.35, emissive: 0x8a5a00, emissiveIntensity: 0.55 });
  const body = new THREE.Mesh(geo, gold);
  body.castShadow = true;
  g.add(body);
  const tipMat = std(0x6b4a1e);
  for (const [t, rz] of [[0, 0.9], [1, -0.9]]) {
    const c = curve.getPoint(t);
    const tip = mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.035, 5), tipMat, c.x + Math.sign(c.x) * 0.012, c.y + 0.012, 0);
    tip.rotation.z = rz;
    g.add(tip);
  }
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.012, 4, 20),
    new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = -0.12;
  g.add(halo);
  g.userData.halo = halo;
  return g;
}

// ---------------------------------------------------------------------------
// The rabbit: white, black-spotted, lives by the rabbit hole and wanders about
// ---------------------------------------------------------------------------
// Canela, the neighbour: a cinnamon lop-eared rabbit. Deliberately nothing like the
// player (Platanito is white with black spots and upright ears), so she's easy to tell apart.
export class Rabbit {
  constructor(scene, world, home) {
    this.name = 'Canela';
    this.world = world;
    this.home = home.clone();
    this.rand = rng(314);
    const coat = std(0xb8784a, { roughness: 0.9 });
    const cream = std(0xf1e2c6, { roughness: 0.9 });
    const dark = std(0x8a5530, { roughness: 0.9 });
    const pink = std(0xf4a3b4);
    const g = (this.group = new THREE.Group());
    g.name = 'canela';
    const body = mesh(new THREE.IcosahedronGeometry(0.16, 1), coat, 0, 0.15, -0.02);
    body.scale.set(0.95, 0.85, 1.25);
    g.add(body);
    const chest = mesh(new THREE.IcosahedronGeometry(0.1, 1), cream, 0, 0.13, 0.1);
    chest.scale.set(0.9, 1, 0.8);
    g.add(chest);
    for (const sx of [-1, 1]) {
      g.add(mesh(new THREE.IcosahedronGeometry(0.09, 1), coat, sx * 0.1, 0.1, -0.1));
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.03, 0.13), cream, sx * 0.1, 0.015, -0.06));
      g.add(mesh(new THREE.IcosahedronGeometry(0.03, 0), cream, sx * 0.06, 0.03, 0.13));
    }
    const head = (this.head = new THREE.Group());
    head.position.set(0, 0.27, 0.15);
    g.add(head);
    const skull = mesh(new THREE.IcosahedronGeometry(0.095, 1), coat);
    skull.scale.set(1.05, 0.9, 1.05);
    head.add(skull);
    const muzzle = mesh(new THREE.IcosahedronGeometry(0.045, 1), cream, 0, -0.03, 0.07);
    muzzle.scale.set(1.1, 0.8, 0.8);
    head.add(muzzle);
    for (const sx of [-1, 1]) head.add(mesh(new THREE.IcosahedronGeometry(0.018, 0), std(0x111111, { roughness: 0.2 }), sx * 0.06, 0.025, 0.07));
    head.add(mesh(new THREE.IcosahedronGeometry(0.016, 0), pink, 0, -0.01, 0.105));
    // lop ears hang down beside the face
    this.ears = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.07, 0.06, -0.02);
      const ear = mesh(new THREE.IcosahedronGeometry(0.045, 1), dark, 0, 0.11, 0);
      ear.scale.set(0.75, 2.4, 0.35);
      pivot.add(ear);
      pivot.rotation.set(0, 0, sx * 2.6);
      head.add(pivot);
      this.ears.push(pivot);
    }
    // a little daisy behind one ear
    head.add(mesh(new THREE.IcosahedronGeometry(0.025, 0), std(0xffffff), -0.06, 0.08, -0.03));
    head.add(mesh(new THREE.IcosahedronGeometry(0.012, 0), std(0xffd23f), -0.06, 0.085, -0.01));
    g.add(mesh(new THREE.IcosahedronGeometry(0.055, 0), cream, 0, 0.17, -0.22));
    g.position.copy(home);
    scene.add(g);
    this.state = 'idle'; this.timer = 1; this.hop = null; this.target = null; this.yaw = this.rand() * 6.28;
    this.hops = 0; this.booped = 0;
  }

  pickTarget(awayFrom) {
    for (let i = 0; i < 30; i++) {
      let x, z;
      if (awayFrom) {
        const a = Math.atan2(this.group.position.x - awayFrom.x, this.group.position.z - awayFrom.z) + (this.rand() - 0.5) * 1.2;
        x = this.group.position.x + Math.sin(a) * 1.4; z = this.group.position.z + Math.cos(a) * 1.4;
      } else {
        const a = this.rand() * Math.PI * 2, r = 1 + this.rand() * 3;
        x = this.home.x + Math.sin(a) * r; z = this.home.z + Math.cos(a) * r;
      }
      if (Math.hypot(x - this.home.x, z - this.home.z) < 4.5 && this.world.isFree(x, z, 0.15)) return new THREE.Vector3(x, 0, z);
    }
    return null;
  }

  update(dt, t, player) {
    const g = this.group;
    const near = player && Math.hypot(g.position.x - player.pos.x, g.position.z - player.pos.z) < 1.3;
    if (this.hop) {
      this.hop.t += dt / 0.32;
      const k = Math.min(1, this.hop.t);
      g.position.lerpVectors(this.hop.a, this.hop.b, k);
      g.position.y += Math.sin(k * Math.PI) * 0.13;
      g.rotation.x = Math.sin(k * Math.PI * 2) * -0.2;
      if (k >= 1) { this.hop = null; this.hops++; g.rotation.x = 0; }
    } else if (this.state === 'move' && this.target) {
      const dx = this.target.x - g.position.x, dz = this.target.z - g.position.z, d = Math.hypot(dx, dz);
      if (d < 0.15) { this.state = 'idle'; this.timer = 1.2 + this.rand() * 3; }
      else {
        this.yaw = Math.atan2(dx, dz);
        const step = Math.min(0.32, d);
        const nx = g.position.x + (dx / d) * step, nz = g.position.z + (dz / d) * step;
        this.hop = { a: g.position.clone(), b: new THREE.Vector3(nx, this.world.groundHeight(nx, nz), nz), t: 0 };
      }
    } else {
      this.timer -= dt;
      if (near) { this.target = this.pickTarget(player.pos); this.state = this.target ? 'move' : 'idle'; this.timer = 0.5; }
      else if (this.timer <= 0) { this.target = this.pickTarget(); this.state = this.target ? 'move' : 'idle'; this.timer = 1; }
      // nibbling
      this.head.rotation.x = Math.max(0, Math.sin(t * 5)) * 0.35;
    }
    g.rotation.y += (((this.yaw - g.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 10);
    this.ears[0].rotation.z = -2.6 + Math.sin(t * 1.7) * 0.08 + (this.hop ? 0.25 : 0);
    this.ears[1].rotation.z = 2.6 - Math.sin(t * 2.3 + 1) * 0.08 - (this.hop ? 0.25 : 0);
    if (!this.hop) g.position.y = this.world.groundHeight(g.position.x, g.position.z);
  }
}

// ---------------------------------------------------------------------------
// Birds: sparrows that hop, peck, and flee when the rabbit gets careless
// ---------------------------------------------------------------------------
function makeBird(rand) {
  const g = new THREE.Group();
  const brown = std([0x8b6a4e, 0x9a7454, 0x7c5d45][Math.floor(rand() * 3)]);
  const body = mesh(new THREE.IcosahedronGeometry(0.06, 0), brown);
  body.scale.set(1, 0.85, 1.35);
  g.add(body);
  const belly = mesh(new THREE.IcosahedronGeometry(0.048, 0), std(0xe9dcc4), 0, -0.018, 0.01);
  belly.scale.set(1, 0.8, 1.2);
  g.add(belly);
  const head = new THREE.Group();
  head.position.set(0, 0.05, 0.06);
  head.add(mesh(new THREE.IcosahedronGeometry(0.038, 0), std(0x6e5240)));
  const cheek = mesh(new THREE.IcosahedronGeometry(0.02, 0), std(0xefe6d6), 0, -0.01, 0.02);
  head.add(cheek);
  const beak = mesh(new THREE.ConeGeometry(0.012, 0.03, 4), std(0xf2b33d), 0, -0.002, 0.045);
  beak.rotation.x = Math.PI / 2;
  head.add(beak);
  for (const s of [-1, 1]) head.add(mesh(new THREE.IcosahedronGeometry(0.007, 0), std(0x111111), s * 0.025, 0.01, 0.025));
  g.add(head);
  const tail = mesh(new THREE.BoxGeometry(0.04, 0.008, 0.07), brown, 0, 0.02, -0.09);
  tail.rotation.x = -0.4;
  g.add(tail);
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.045, 0.02, 0);
    const w = mesh(new THREE.BoxGeometry(0.09, 0.008, 0.07), std(0x6b4f3a), s * 0.04, 0, 0);
    pivot.add(w);
    g.add(pivot);
    wings.push(pivot);
  }
  for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.04, 3), std(0xc28a4a), s * 0.02, -0.06, 0));
  return { group: g, head, wings };
}

export class Birds {
  constructor(scene, world, count = 7) {
    this.world = world;
    this.rand = rng(4242);
    this.list = [];
    for (let i = 0; i < count; i++) {
      const b = makeBird(this.rand);
      const p = world.randomLawnPoint(this.rand);
      b.group.position.copy(p);
      scene.add(b.group);
      this.list.push({ ...b, state: 'ground', timer: this.rand() * 2, hop: null, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 1, flap: 0, peck: 0, yaw: this.rand() * 6.28 });
    }
  }

  startle(b, onFly) {
    if (b.state === 'fly') return;
    const perch = this.world.perches[Math.floor(this.rand() * this.world.perches.length)];
    this.flyTo(b, perch.clone().add(new THREE.Vector3((this.rand() - 0.5) * 0.3, 0, (this.rand() - 0.5) * 0.3)), 'perch');
    onFly?.(b);
  }

  flyTo(b, target, next) {
    b.state = 'fly'; b.next = next;
    b.from.copy(b.group.position); b.to.copy(target);
    b.t = 0; b.dur = Math.max(0.8, b.from.distanceTo(b.to) / 5);
    b.yaw = Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z);
  }

  update(dt, t, player, onStartle) {
    for (const b of this.list) {
      const g = b.group;
      const dx = g.position.x - player.pos.x, dz = g.position.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (b.state === 'ground') {
        const alert = player.noise; // metres of awareness based on how the player moves
        // a short beat of suspicion before taking off: that's the window for a boop
        if (dist < alert && Math.abs(g.position.y - player.feetY) < 1.2) b.alarm = (b.alarm || 0) + dt;
        else b.alarm = Math.max(0, (b.alarm || 0) - dt);
        if (b.alarm > 0.4) { b.alarm = 0; this.startle(b); onStartle?.(b); continue; }
        b.timer -= dt;
        if (b.hop) {
          b.hop.t += dt / 0.22;
          const k = Math.min(1, b.hop.t);
          g.position.lerpVectors(b.hop.a, b.hop.b, k);
          g.position.y += Math.sin(k * Math.PI) * 0.06;
          if (k >= 1) b.hop = null;
        } else if (b.timer <= 0) {
          b.timer = 0.4 + this.rand() * 1.4;
          if (this.rand() < 0.45) b.peck = 0.35;
          else {
            b.yaw += (this.rand() - 0.5) * 2.2;
            const nx = g.position.x + Math.sin(b.yaw) * 0.25, nz = g.position.z + Math.cos(b.yaw) * 0.25;
            if (this.world.isFree(nx, nz, 0.1)) {
              b.hop = { a: g.position.clone(), b: new THREE.Vector3(nx, this.world.groundHeight(nx, nz), nz), t: 0 };
            }
          }
        }
        b.peck = Math.max(0, b.peck - dt);
        b.head.rotation.x = b.alarm > 0 ? -0.4 : b.peck > 0 ? Math.sin((b.peck / 0.35) * Math.PI) * 0.9 : Math.sin(t * 2 + b.yaw) * 0.08;
        g.rotation.set(0, b.yaw, 0);
        for (const [i, w] of b.wings.entries()) w.rotation.z = (i ? -1 : 1) * 0.05;
      } else if (b.state === 'fly') {
        b.t += dt / b.dur;
        const k = Math.min(1, b.t);
        g.position.lerpVectors(b.from, b.to, k);
        g.position.y += Math.sin(k * Math.PI) * Math.min(2.5, b.from.distanceTo(b.to) * 0.3);
        b.flap += dt * 32;
        for (const [i, w] of b.wings.entries()) w.rotation.z = (i ? -1 : 1) * Math.sin(b.flap) * 1.1;
        g.rotation.set(-0.2, b.yaw, 0);
        if (k >= 1) {
          b.state = b.next;
          b.timer = b.next === 'perch' ? 7 + this.rand() * 9 : 1;
          b.yaw = this.rand() * 6.28;
        }
      } else if (b.state === 'perch') {
        b.timer -= dt;
        g.rotation.set(0, b.yaw, 0);
        b.head.rotation.x = Math.sin(t * 3 + b.yaw) * 0.15;
        b.head.rotation.y = Math.sin(t * 0.9 + b.yaw) * 0.6;
        for (const [i, w] of b.wings.entries()) w.rotation.z = (i ? -1 : 1) * 0.05;
        if (b.timer <= 0) {
          const target = this.world.randomLawnPoint(this.rand);
          if (target.distanceTo(new THREE.Vector3(player.pos.x, target.y, player.pos.z)) > 5) this.flyTo(b, target, 'ground');
          else b.timer = 2;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Butterflies
// ---------------------------------------------------------------------------
export class Butterflies {
  constructor(scene, world, flowerHeads, count = 12) {
    this.world = world;
    this.rand = rng(99);
    this.anchors = flowerHeads;
    this.list = [];
    const colors = [0xff9a3d, 0xffd23f, 0x9fd4ff, 0xffffff, 0xff7eb6, 0xb388ff];
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0.01, 0.075, 0, 0.055, 0.085, 0, -0.005,
      0, 0, 0.01, 0.085, 0, -0.005, 0.05, 0, -0.06,
      0, 0, 0.01, 0.05, 0, -0.06, 0, 0, -0.02,
    ], 3));
    wingGeo.computeVertexNormals();
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, flatShading: true, roughness: 0.6 });
      const wings = [];
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(wingGeo, mat);
        w.scale.x = s;
        w.castShadow = true;
        g.add(w);
        wings.push(w);
      }
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.005, 0.07, 4), std(0x2a1d14));
      body.rotation.x = Math.PI / 2;
      g.add(body);
      scene.add(g);
      const bf = { group: g, wings, anchor: this.pickAnchor(), phase: this.rand() * 100, speed: 0.4 + this.rand() * 0.4, flee: 0, fleeDir: new THREE.Vector3(), hidden: 0 };
      g.position.copy(bf.anchor);
      this.list.push(bf);
    }
  }

  pickAnchor() {
    const a = this.anchors[Math.floor(this.rand() * this.anchors.length)] ?? new THREE.Vector3();
    return a.clone();
  }

  update(dt, t) {
    for (const b of this.list) {
      const g = b.group;
      b.phase += dt * b.speed;
      if (b.flee > 0) {
        b.flee -= dt;
        g.position.addScaledVector(b.fleeDir, dt);
        if (b.flee <= 0) { b.anchor = this.pickAnchor(); g.position.copy(b.anchor).add(new THREE.Vector3(0, 3, 0)); }
      } else {
        const p = b.phase;
        const target = new THREE.Vector3(
          b.anchor.x + Math.sin(p * 1.3) * 0.9 + Math.sin(p * 3.1) * 0.2,
          b.anchor.y + 0.25 + (Math.sin(p * 2.3) * 0.5 + 0.5) * 0.7 + Math.sin(p * 9) * 0.05,
          b.anchor.z + Math.cos(p * 1.1) * 0.9 + Math.cos(p * 2.7) * 0.2,
        );
        g.position.lerp(target, Math.min(1, dt * 2.2));
        if (this.rand() < dt * 0.05) b.anchor = this.pickAnchor();
        const v = target.sub(g.position);
        if (v.lengthSq() > 1e-5) g.rotation.y = Math.atan2(v.x, v.z);
      }
      const flap = Math.sin(t * 22 + b.phase * 10) * 1.1;
      b.wings[0].rotation.z = flap;
      b.wings[1].rotation.z = -flap;
    }
  }

  boop(b, from) {
    b.flee = 3;
    b.fleeDir.subVectors(b.group.position, from).setY(0).normalize().multiplyScalar(1.5).setY(1.4);
  }
}

// ---------------------------------------------------------------------------
// A beach ball the rabbit can nudge around the lawn
// ---------------------------------------------------------------------------
export class Ball {
  constructor(scene, world) {
    this.world = world;
    this.r = 0.2;
    const geo = new THREE.IcosahedronGeometry(this.r, 1);
    const pos = geo.attributes.position;
    const cols = [];
    const palette = [new THREE.Color(0xff4d5e), new THREE.Color(0xffffff), new THREE.Color(0x3f8fe0), new THREE.Color(0xffd23f)];
    for (let i = 0; i < pos.count; i += 3) {
      const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const c = palette[Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 6) % 4];
      for (let j = 0; j < 3; j++) cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.4 }));
    this.mesh.castShadow = true;
    this.pos = new THREE.Vector3(2.5, 0, 2.5);
    this.vel = new THREE.Vector3();
    scene.add(this.mesh);
  }

  update(dt, player) {
    const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z, d = Math.hypot(dx, dz);
    const reach = this.r + 0.22;
    let hit = 0;
    if (d < reach && player.feetY < this.pos.y + this.r) {
      const push = Math.max(1.2, player.speed * 1.4);
      this.vel.x = (dx / (d || 1)) * push + player.vel.x * 0.4;
      this.vel.z = (dz / (d || 1)) * push + player.vel.z * 0.4;
      this.pos.x = player.pos.x + (dx / (d || 1)) * reach;
      this.pos.z = player.pos.z + (dz / (d || 1)) * reach;
      hit = push;
    }
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const p = { x: this.pos.x, z: this.pos.z };
    this.world.resolve(p, this.r, this.pos.y - this.r + 0.05);
    if (p.x !== this.pos.x) this.vel.x *= -0.6;
    if (p.z !== this.pos.z) this.vel.z *= -0.6;
    this.pos.x = p.x; this.pos.z = p.z;
    this.vel.multiplyScalar(Math.max(0, 1 - dt * 0.9));
    this.pos.y = this.world.floorAt(this.pos.x, this.pos.z, this.pos.y) + this.r;
    const mx = this.pos.x - before.x, mz = this.pos.z - before.z;
    const dist = Math.hypot(mx, mz);
    if (dist > 1e-5) {
      const axis = new THREE.Vector3(mz, 0, -mx).normalize();
      this.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, dist / this.r));
    }
    this.mesh.position.copy(this.pos);
    return hit;
  }
}

// ---------------------------------------------------------------------------
// Particles: dirt clods, sniff trails, sparkles
// ---------------------------------------------------------------------------
export class Particles {
  constructor(scene) {
    this.dirt = [];
    const dg = new THREE.IcosahedronGeometry(0.016, 0);
    const dm = std(0x6e4a2f);
    for (let i = 0; i < 80; i++) {
      const m = new THREE.Mesh(dg, dm);
      m.visible = false;
      scene.add(m);
      this.dirt.push({ m, vel: new THREE.Vector3(), life: 0 });
    }
    this.glow = [];
    const gg = new THREE.OctahedronGeometry(0.05, 0);
    for (let i = 0; i < 90; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const m = new THREE.Mesh(gg, mat);
      m.visible = false;
      scene.add(m);
      this.glow.push({ m, vel: new THREE.Vector3(), life: 0, max: 1, delay: 0, base: new THREE.Vector3() });
    }
    this.gi = 0; this.di = 0;
  }

  dirtBurst(pos, dir, n = 6) {
    for (let i = 0; i < n; i++) {
      const p = this.dirt[this.di++ % this.dirt.length];
      p.m.visible = true;
      p.m.position.copy(pos);
      p.vel.set((Math.random() - 0.5) * 1.2 - dir.x * 1.2, 1.2 + Math.random() * 1.4, (Math.random() - 0.5) * 1.2 - dir.z * 1.2);
      p.life = 1.2;
      p.m.scale.setScalar(0.6 + Math.random() * 0.9);
    }
  }

  glowAt(pos, { vel = new THREE.Vector3(), life = 1, delay = 0, color = 0xfff2a8, size = 1 } = {}) {
    const p = this.glow[this.gi++ % this.glow.length];
    p.m.visible = delay <= 0;
    p.base.copy(pos);
    p.m.position.copy(pos);
    p.vel.copy(vel);
    p.life = life; p.max = life; p.delay = delay;
    p.m.material.color.set(color);
    p.m.scale.setScalar(size);
  }

  trail(from, to, floorAt) {
    const n = 40, dist = from.distanceTo(to);
    const steps = Math.min(n, Math.max(8, Math.floor(dist / 0.45)));
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const x = from.x + (to.x - from.x) * k, z = from.z + (to.z - from.z) * k;
      const pos = new THREE.Vector3(x + Math.sin(k * 14) * 0.15, floorAt(x, z) + 0.12 + Math.sin(k * 9) * 0.04, z + Math.cos(k * 11) * 0.15);
      this.glowAt(pos, { life: 2.6, delay: k * 1.1, vel: new THREE.Vector3(0, 0.05, 0), color: i === steps ? 0xffe36b : 0xfff2a8, size: i === steps ? 3 : 1.3 + k * 0.8 });
    }
  }

  sparkle(pos, color = 0xffe36b, n = 16) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.3, Math.random() - 0.5).multiplyScalar(1.6);
      this.glowAt(pos, { vel: v, life: 0.9 + Math.random() * 0.5, color, size: 0.35 + Math.random() * 0.4 });
    }
  }

  update(dt, t) {
    for (const p of this.dirt) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.y -= 9.8 * dt;
      p.m.position.addScaledVector(p.vel, dt);
      p.m.rotation.x += dt * 5;
      if (p.life <= 0) p.m.visible = false;
    }
    for (const p of this.glow) {
      if (p.life <= 0) continue;
      if (p.delay > 0) { p.delay -= dt; if (p.delay <= 0) p.m.visible = true; continue; }
      p.life -= dt;
      p.base.addScaledVector(p.vel, dt);
      p.m.position.copy(p.base);
      p.m.position.y += Math.sin(t * 5 + p.base.x * 3) * 0.02;
      p.m.rotation.y += dt * 3;
      const k = p.life / p.max;
      p.m.material.opacity = Math.min(1, k * 3) * Math.min(1, (1 - k) * 8) * 0.9;
      if (p.life <= 0) p.m.visible = false;
    }
  }
}
