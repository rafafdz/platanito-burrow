import * as THREE from 'three';

const EYE = 0.3, EYE_CROUCH = 0.17, RADIUS = 0.17, GRAVITY = 12;
const SPEED = { walk: 2.3, sprint: 5.2, crouch: 1.0 };

// First-person cat: movement, stamina, pounce, and the paws you see on screen.
export class Cat {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    this.pos = new THREE.Vector3(-5, 0, -8.2);
    this.feetY = world.floorAt(this.pos.x, this.pos.z, 1);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = Math.PI; // facing south, into the garden
    this.pitch = -0.05;
    this.grounded = true;
    this.stamina = 1;
    this.eye = EYE;
    this.crouch = false;
    this.sprinting = false;
    this.speed = 0;
    this.noise = 3;
    this.bob = 0;
    this.roll = 0;
    this.stepPhase = 0;
    this.airTime = 0;
    this.sensitivity = 1;
    this.frozen = 0;

    // --- paws, rendered in their own overlay scene so they never clip into the world
    this.pawScene = new THREE.Scene();
    this.pawScene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b8a3a, 1.6));
    const dl = new THREE.DirectionalLight(0xfff0d2, 1.6);
    dl.position.set(0.3, 1, 0.4);
    this.pawScene.add(dl);
    this.pawCam = new THREE.PerspectiveCamera(camera.fov, camera.aspect, 0.01, 5);
    this.paws = [this.makePaw(-1), this.makePaw(1)];
    for (const p of this.paws) this.pawScene.add(p);
    this.mouth = new THREE.Group();
    this.mouth.position.set(0, -0.125, -0.27);
    this.pawScene.add(this.mouth);
    this.carried = null;
    this.swipeT = 0;
    this.digT = 0;
  }

  makePaw(side) {
    const orange = new THREE.MeshStandardMaterial({ color: 0xe9a14c, flatShading: true, roughness: 0.9 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0xc57a2e, flatShading: true, roughness: 0.9 });
    const white = new THREE.MeshStandardMaterial({ color: 0xfbf4ea, flatShading: true, roughness: 0.9 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xf29aa6, flatShading: true, roughness: 0.6 });
    const root = new THREE.Group();
    const arm = new THREE.Group();
    arm.rotation.x = -1.15;
    root.add(arm);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.24, 7).translate(0, -0.12, 0), orange);
    arm.add(fore);
    for (const y of [-0.07, -0.13, -0.19]) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0335 + y * -0.02, 0.0345 + y * -0.02, 0.018, 7), stripe);
      s.position.y = y;
      s.rotation.z = side * 0.25;
      arm.add(s);
    }
    // after the arm tilt, local +y points away from the camera and local +z points up
    const paw = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 1), white);
    paw.scale.set(1, 1.15, 0.66);
    arm.add(paw);
    for (let i = 0; i < 3; i++) {
      const toe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.0145, 0), white);
      toe.position.set((i - 1) * 0.021, 0.036 - Math.abs(i - 1) * 0.006, 0.01);
      arm.add(toe);
    }
    // toe beans on the underside, flashed mid-swipe
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.0085, 0), pink);
      b.position.set((i - 1.5) * 0.017, 0.03 - Math.abs(i - 1.5) * 0.007, -0.022);
      b.scale.z = 0.6;
      arm.add(b);
    }
    const pad = new THREE.Mesh(new THREE.IcosahedronGeometry(0.016, 0), pink);
    pad.position.set(0, 0.002, -0.024);
    pad.scale.z = 0.6;
    arm.add(pad);
    root.userData = { side, arm, base: new THREE.Vector3(side * 0.105, -0.14, -0.23) };
    root.scale.setScalar(0.78);
    root.position.copy(root.userData.base);
    return root;
  }

  carry(obj) {
    this.drop();
    if (!obj) return;
    this.carried = obj;
    obj.position.set(0, 0, 0);
    obj.rotation.set(0.3, 0.6, 0);
    obj.scale.setScalar(0.5);
    this.mouth.add(obj);
  }

  drop() {
    if (this.carried) this.mouth.remove(this.carried);
    const c = this.carried;
    this.carried = null;
    return c;
  }

  look(dx, dy) {
    const s = 0.0022 * this.sensitivity;
    this.yaw -= dx * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * s, -1.35, 1.35);
  }

  get forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  pounce() {
    if (!this.grounded || this.stamina < 0.2 || this.frozen > 0) return false;
    this.stamina -= 0.2;
    this.vy = 3.6;
    const f = this.forward;
    const boost = Math.max(this.speed, 3.4);
    this.vel.x = f.x * boost; this.vel.z = f.z * boost;
    this.grounded = false;
    return true;
  }

  update(dt, input, sound) {
    const w = this.world;
    // --- movement intent
    let ix = 0, iz = 0;
    if (this.frozen <= 0) {
      if (input.KeyW || input.ArrowUp) iz -= 1;
      if (input.KeyS || input.ArrowDown) iz += 1;
      if (input.KeyA || input.ArrowLeft) ix -= 1;
      if (input.KeyD || input.ArrowRight) ix += 1;
    }
    this.frozen = Math.max(0, this.frozen - dt);
    const moving = ix !== 0 || iz !== 0;
    this.crouch = !!(input.KeyC || input.ControlLeft);
    this.sprinting = !!(input.ShiftLeft || input.ShiftRight) && moving && !this.crouch && this.stamina > 0.02 && iz <= 0;
    const top = this.crouch ? SPEED.crouch : this.sprinting ? SPEED.sprint : SPEED.walk;
    const len = Math.hypot(ix, iz) || 1;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = (ix * cos + iz * sin) / len * top, wz = (-ix * sin + iz * cos) / len * top;
    const accel = this.grounded ? 14 : 1.5;
    this.vel.x += (wx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wz - this.vel.z) * Math.min(1, accel * dt);
    if (!moving && this.grounded) this.vel.multiplyScalar(Math.max(0, 1 - dt * 10));

    if (this.sprinting) this.stamina = Math.max(0, this.stamina - dt * 0.22);
    else this.stamina = Math.min(1, this.stamina + dt * (this.grounded ? 0.18 : 0));

    // --- horizontal move + collisions
    const p = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt };
    w.resolve(p, RADIUS, this.feetY);
    this.pos.x = p.x; this.pos.z = p.z;

    // --- vertical
    const floor = w.floorAt(this.pos.x, this.pos.z, this.feetY);
    this.vy -= GRAVITY * dt;
    this.feetY += this.vy * dt;
    const wasGrounded = this.grounded;
    if (this.feetY <= floor) {
      if (!wasGrounded && this.airTime > 0.15) sound?.land();
      this.feetY = floor; this.vy = 0; this.grounded = true; this.airTime = 0;
    } else if (wasGrounded && this.vy <= 0 && this.feetY - floor < 0.16) {
      this.feetY = floor; this.vy = 0; // walking down small steps
    } else {
      this.grounded = false; this.airTime += dt;
    }

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    // how far away birds notice you
    this.noise = this.crouch ? 0.9 + this.speed * 0.3 : this.sprinting ? 5.5 : this.speed > 0.3 ? 3.2 : 2.2;
    if (!this.grounded) this.noise = 1.1; // a pounce is fast and silent

    // --- camera
    const targetEye = this.crouch ? EYE_CROUCH : EYE;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);
    const moveK = Math.min(1, this.speed / SPEED.walk);
    if (this.grounded) {
      const prev = this.stepPhase;
      this.stepPhase += dt * (4 + this.speed * 2.6) * (moving ? 1 : 0);
      if (moving && Math.floor(prev / Math.PI) !== Math.floor(this.stepPhase / Math.PI)) sound?.step();
    }
    this.bob = Math.sin(this.stepPhase * 2) * 0.012 * moveK;
    this.roll += ((-ix * 0.04) - this.roll) * Math.min(1, dt * 6);
    this.camera.position.set(this.pos.x, this.feetY + this.eye + this.bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');

    this.updatePaws(dt, moving, moveK);
  }

  updatePaws(dt, moving, moveK) {
    this.swipeT = Math.max(0, this.swipeT - dt);
    this.digT = Math.max(0, this.digT - dt);
    const t = performance.now() / 1000;
    for (const paw of this.paws) {
      const { side, arm, base } = paw.userData;
      const ph = this.stepPhase + (side > 0 ? Math.PI : 0);
      let x = base.x, y = base.y - (moving ? 0 : 0.012) + Math.sin(t * 1.6) * 0.002, z = base.z;
      let rx = -1.15, rz = 0;
      if (this.grounded) {
        z += Math.sin(ph) * 0.035 * moveK;
        y += Math.max(0, Math.cos(ph)) * 0.02 * moveK - (this.crouch ? 0.01 : 0);
      } else {
        y += 0.02; z -= 0.04; x += side * 0.02; rx = -1.32; // reaching out mid-pounce
      }
      if (this.digT > 0) {
        const k = Math.sin((this.digT * 14) + (side > 0 ? Math.PI : 0));
        y = base.y + 0.01 + k * 0.03; z = base.z - 0.05 - Math.max(0, k) * 0.05; x = side * 0.075;
        rx = -1.3 + k * 0.4;
      }
      if (side > 0 && this.swipeT > 0) {
        const k = Math.sin((1 - this.swipeT / 0.32) * Math.PI);
        y += k * 0.055; z -= k * 0.07; x -= k * 0.05;
        rx = -1.15 - k * 0.3; rz = k * 0.35;
      }
      paw.position.lerp(new THREE.Vector3(x, y, z), Math.min(1, dt * 18));
      arm.rotation.x += (rx - arm.rotation.x) * Math.min(1, dt * 18);
      arm.rotation.z += (rz - arm.rotation.z) * Math.min(1, dt * 18);
    }
    this.mouth.position.y = -0.125 + this.bob * 0.5;
    if (this.carried) this.carried.rotation.y += dt * 0.3;
  }

  renderOverlay(renderer) {
    this.pawCam.fov = this.camera.fov;
    this.pawCam.aspect = this.camera.aspect;
    this.pawCam.updateProjectionMatrix();
    renderer.clearDepth();
    renderer.render(this.pawScene, this.pawCam);
  }
}
