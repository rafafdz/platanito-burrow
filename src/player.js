import * as THREE from 'three';

const EYE = 0.3, EYE_LOW = 0.17, RADIUS = 0.17, GRAVITY = 12;
const SPEED = { walk: 2.3, sprint: 5.2, sneak: 1.0 };

const fur = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.95 });

// First-person rabbit: hopping movement, stamina, big hops, and the forepaws and ears
// you see on screen. Platanito is white with black spots, like the title card says.
export class Bunny {
  constructor(world, camera) {
    this.species = 'rabbit';
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
    this.hopPhase = 0;
    this.airTime = 0;
    this.sensitivity = 1;
    this.frozen = 0;
    this.boopT = 0;
    this.digT = 0;
    this.thumpT = 0;

    // --- paws and ears live in an overlay scene so they never clip into the world
    this.overlay = new THREE.Scene();
    this.overlay.add(new THREE.HemisphereLight(0xfff4e0, 0x6b8a3a, 1.6));
    const dl = new THREE.DirectionalLight(0xfff0d2, 1.6);
    dl.position.set(0.3, 1, 0.4);
    this.overlay.add(dl);
    this.overlayCam = new THREE.PerspectiveCamera(camera.fov, camera.aspect, 0.01, 5);
    this.paws = [this.makePaw(-1), this.makePaw(1)];
    this.ears = [this.makeEar(-1), this.makeEar(1)];
    for (const o of [...this.paws, ...this.ears]) this.overlay.add(o);
  }

  // a furry white foreleg; the right one has a black spot, matching Platanito's coat
  makePaw(side) {
    const white = fur(0xfaf8f2), black = fur(0x1d1b1a);
    const root = new THREE.Group();
    const arm = new THREE.Group();
    arm.rotation.x = -1.15;
    root.add(arm);
    // after the arm tilt, local +y points away from the camera and local +z points up
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.036, 0.24, 7).translate(0, -0.12, 0), white);
    arm.add(leg);
    if (side > 0) {
      const spot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), black);
      spot.scale.set(1, 1.6, 0.45);
      spot.position.set(0.004, -0.1, 0.024);
      arm.add(spot);
    }
    const foot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.036, 1), white);
    foot.scale.set(0.95, 1.45, 0.6);
    foot.position.y = 0.012;
    arm.add(foot);
    // soft fur tufts on the feet
    for (let i = 0; i < 3; i++) {
      const tuft = new THREE.Mesh(new THREE.IcosahedronGeometry(0.012, 0), white);
      tuft.position.set((i - 1) * 0.017, 0.058 - Math.abs(i - 1) * 0.006, 0.004);
      arm.add(tuft);
    }
    root.userData = { side, arm, base: new THREE.Vector3(side * 0.09, -0.132, -0.23) };
    root.scale.setScalar(0.78);
    root.position.copy(root.userData.base);
    return root;
  }

  // long ears poking into the top corners of the view: left white, right black
  makeEar(side) {
    const pivot = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 1), side > 0 ? fur(0x1d1b1a) : fur(0xfaf8f2));
    outer.scale.set(0.5, 2.5, 0.2);
    outer.position.y = -0.11;
    pivot.add(outer);
    const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), fur(0xf4a3b4));
    inner.scale.set(0.45, 2.6, 0.1);
    inner.position.set(0, -0.11, 0.011);
    pivot.add(inner);
    // pivot sits just above the top of the view; the ear leans out so only its edge shows in the corner
    pivot.userData = { side, base: new THREE.Vector3(side * 0.13, 0.3, -0.27) };
    pivot.position.copy(pivot.userData.base);
    pivot.rotation.set(0.2, 0, side * 1.0);
    return pivot;
  }

  look(dx, dy) {
    const s = 0.0022 * this.sensitivity;
    this.yaw -= dx * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * s, -1.35, 1.35);
  }

  get forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  // Space: a big rabbit hop, high enough for beds, benches, the porch and the sofa
  hop() {
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
    const top = this.crouch ? SPEED.sneak : this.sprinting ? SPEED.sprint : SPEED.walk;
    const len = Math.hypot(ix, iz) || 1;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = ((ix * cos + iz * sin) / len) * top, wz = ((-ix * sin + iz * cos) / len) * top;
    const accel = this.grounded ? 14 : 1.5;
    this.vel.x += (wx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wz - this.vel.z) * Math.min(1, accel * dt);
    if (!moving && this.grounded) this.vel.multiplyScalar(Math.max(0, 1 - dt * 10));

    if (this.sprinting) this.stamina = Math.max(0, this.stamina - dt * 0.22);
    else this.stamina = Math.min(1, this.stamina + dt * (this.grounded ? 0.18 : 0));

    const p = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt };
    w.resolve(p, RADIUS, this.feetY);
    this.pos.x = p.x; this.pos.z = p.z;

    const floor = w.floorAt(this.pos.x, this.pos.z, this.feetY);
    this.vy -= GRAVITY * dt;
    this.feetY += this.vy * dt;
    const wasGrounded = this.grounded;
    if (this.feetY <= floor) {
      if (!wasGrounded && this.airTime > 0.15) sound?.land();
      this.feetY = floor; this.vy = 0; this.grounded = true; this.airTime = 0;
    } else if (wasGrounded && this.vy <= 0 && this.feetY - floor < 0.16) {
      this.feetY = floor; this.vy = 0;
    } else {
      this.grounded = false; this.airTime += dt;
    }

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    // how far away birds notice you
    this.noise = this.crouch ? 0.9 + this.speed * 0.3 : this.sprinting ? 5.5 : this.speed > 0.3 ? 3.2 : 2.2;
    if (!this.grounded) this.noise = 1.1;

    // --- camera: rabbits hop, so the view bounces in little arcs rather than swaying
    const targetEye = this.crouch ? EYE_LOW : EYE;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);
    const moveK = Math.min(1, this.speed / SPEED.walk);
    if (this.grounded) {
      const prev = this.hopPhase;
      this.hopPhase += dt * (5 + this.speed * 2.2) * (moving ? 1 : 0);
      if (moving && Math.floor(prev / Math.PI) !== Math.floor(this.hopPhase / Math.PI)) sound?.step();
    }
    this.bob = Math.abs(Math.sin(this.hopPhase)) * 0.028 * moveK;
    this.roll += (-ix * 0.04 - this.roll) * Math.min(1, dt * 6);
    this.camera.position.set(this.pos.x, this.feetY + this.eye + this.bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');

    this.updateOverlay(dt, moving, moveK);
  }

  updateOverlay(dt, moving, moveK) {
    this.boopT = Math.max(0, this.boopT - dt);
    this.digT = Math.max(0, this.digT - dt);
    this.thumpT = Math.max(0, this.thumpT - dt);
    const t = performance.now() / 1000;
    const hop = Math.abs(Math.sin(this.hopPhase));
    for (const paw of this.paws) {
      const { side, arm, base } = paw.userData;
      let x = base.x, y = base.y - (moving ? 0 : 0.012) + Math.sin(t * 1.6) * 0.002, z = base.z;
      let rx = -1.15, rz = 0;
      if (this.grounded) {
        // both forepaws land together on each hop
        z -= hop * 0.03 * moveK;
        y += hop * 0.022 * moveK - (this.crouch ? 0.012 : 0);
      } else {
        y += 0.02; z -= 0.04; x += side * 0.015; rx = -1.3; // tucked forward mid-hop
      }
      if (this.digT > 0) {
        const k = Math.sin(this.digT * 16 + (side > 0 ? Math.PI : 0));
        y = base.y + 0.01 + k * 0.03; z = base.z - 0.05 - Math.max(0, k) * 0.05; x = side * 0.065;
        rx = -1.3 + k * 0.4;
      }
      if (this.thumpT > 0) y -= Math.sin((this.thumpT / 0.3) * Math.PI) * 0.03;
      if (side > 0 && this.boopT > 0) {
        const k = Math.sin((1 - this.boopT / 0.32) * Math.PI);
        y += k * 0.05; z -= k * 0.07; x -= k * 0.04;
        rx = -1.15 - k * 0.3; rz = k * 0.3;
      }
      paw.position.lerp(new THREE.Vector3(x, y, z), Math.min(1, dt * 18));
      arm.rotation.x += (rx - arm.rotation.x) * Math.min(1, dt * 18);
      arm.rotation.z += (rz - arm.rotation.z) * Math.min(1, dt * 18);
    }
    for (const ear of this.ears) {
      const { side, base } = ear.userData;
      const twitch = Math.max(0, Math.sin(t * (side > 0 ? 1.3 : 1.7) + side)) ** 8 * 0.25;
      const flop = this.grounded ? hop * 0.05 * moveK : -0.05;
      ear.position.set(base.x, base.y + (this.crouch ? 0.04 : 0) - flop * 0.3, base.z);
      ear.rotation.z = side * 1.0 - side * (twitch + flop) + (this.crouch ? side * 0.35 : 0);
    }
  }

  renderOverlay(renderer) {
    this.overlayCam.fov = this.camera.fov;
    this.overlayCam.aspect = this.camera.aspect;
    this.overlayCam.updateProjectionMatrix();
    renderer.clearDepth();
    renderer.render(this.overlay, this.overlayCam);
  }
}
