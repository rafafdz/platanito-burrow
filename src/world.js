import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Layout constants (metres). North is -z, the house sits along the north fence.
// ---------------------------------------------------------------------------
export const YARD = 20;
export const POND = { x: 9, z: 5, r: 2.9 };
export const BURROW = { x: -16.2, z: 16.2 };
export const RABBIT_HOLE = { x: 12.2, z: 11.6 };
export const BOWL = { x: -3.7, z: -10.15, y: 0.3 };
export const STEP = 0.12;

export const DIG_SPOTS = [
  [-14, -5.2], [-14, 2.8], [7, -2.5], [-5, 11.5], [12.5, 14.5],
  [17.5, -12.5], [-9.5, -8.2], [3, 17.5], [-17, 4], [12.5, 7.5],
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function groundHeight(x, z) {
  let h = 0.07 * Math.sin(x * 0.42 + 1.3) * Math.cos(z * 0.37) + 0.035 * Math.sin(x * 1.1 - z * 0.9 + 0.5);
  h *= 1 - 0.85 * smooth(-8, -11, z);
  const d = Math.max(Math.abs(x), Math.abs(z));
  const t = smooth(21, 48, d);
  h += t * (5 + 2.5 * Math.sin(x * 0.07 + 1) + 2 * Math.cos(z * 0.09));
  const pd = Math.hypot(x - POND.x, z - POND.z);
  h -= smooth(3.4, 1.2, pd) * 0.4;
  return h;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
}

export function jitter(geo, amt, rand) {
  const pos = geo.attributes.position;
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let o = map.get(k);
    if (!o) { o = [(rand() - 0.5) * amt, (rand() - 0.5) * amt, (rand() - 0.5) * amt]; map.set(k, o); }
    pos.setXYZ(i, pos.getX(i) + o[0], pos.getY(i) + o[1], pos.getZ(i) + o[2]);
  }
  return geo;
}

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
export const cyl = (rt, rb, h, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0);
export const cone = (r, h, seg = 7) => new THREE.ConeGeometry(r, h, seg).translate(0, h / 2, 0);

// Batches static decoration into a couple of merged, vertex-coloured meshes.
export class Batch {
  constructor(rand) { this.rand = rand; this.parts = { cast: [], still: [] }; }
  add(geo, color, matrix, { vary = 0.07, cast = true } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    const pos = g.attributes.position;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', pos);
    const c = new THREE.Color(color);
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 3) {
      const s = 1 + (this.rand() - 0.5) * vary * 2;
      for (let j = 0; j < 3; j++) {
        cols[(i + j) * 3] = c.r * s; cols[(i + j) * 3 + 1] = c.g * s; cols[(i + j) * 3 + 2] = c.b * s;
      }
    }
    out.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.parts[cast ? 'cast' : 'still'].push(out);
  }
  build(scene, material) {
    for (const key of ['cast', 'still']) {
      if (!this.parts[key].length) continue;
      const geo = mergeGeometries(this.parts[key]);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = key === 'cast';
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
}

const C = {
  trunk: 0x7a5236, leaf1: 0x4f9a3f, leaf2: 0x66b24a, leaf3: 0x3d8036, pine: 0x2f6e43,
  soil: 0x6e4a2f, soilDark: 0x4a301d, stone: 0x9d9a92, wood: 0xa0724a, woodDark: 0x7a5234,
  wall: 0xf4e4c6, trim: 0xfbf7ee, roof: 0xc4573a, fence: 0xf3eee3,
};

// ---------------------------------------------------------------------------
export function buildWorld(scene) {
  const rand = rng(20260926);
  const B = new Batch(rand);
  const solids = [];
  const reserved = []; // circles kept clear of random decoration
  const timeUniform = { value: 0 };
  const updaters = [];

  const addCircle = (x, z, r, top = Infinity) => solids.push({ type: 0, x, z, r, top });
  const addBox = (minX, maxX, minZ, maxZ, top = Infinity) => solids.push({ type: 1, minX, maxX, minZ, maxZ, top });

  // ---------------------------------------------------------------- sky & light
  const skyUniforms = {
    top: { value: new THREE.Color(0x3f8fe0) },
    horizon: { value: new THREE.Color(0xcfe8f2) },
    bottom: { value: new THREE.Color(0x9ec48a) },
    sunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
    sunColor: { value: new THREE.Color(0xfff2d0) },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vPos;
        void main(){
          vec3 d = normalize(vPos);
          float h = d.y;
          vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, min(1.0, -h * 5.0));
          float s = max(dot(d, sunDir), 0.0);
          c += sunColor * (pow(s, 12.0) * 0.18 + pow(s, 180.0) * 0.6 + smoothstep(0.9975, 0.999, s) * 2.5);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.frustumCulled = false;
  scene.add(sky);

  scene.fog = new THREE.Fog(0xcfe8f2, 35, 140);
  scene.background = new THREE.Color(0xcfe8f2);

  const hemi = new THREE.HemisphereLight(0xd6ecff, 0x6b8a3a, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 120;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // ---------------------------------------------------------------- ground
  {
    const size = 170, seg = 170;
    let g = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
    g = g.toNonIndexed();
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)));
    const cols = new Float32Array(pos.count * 3);
    const cA = new THREE.Color(0x76b84a), cB = new THREE.Color(0x8cc653), cC = new THREE.Color(0x5f9e3d);
    const cHill = new THREE.Color(0x86b857), cMud = new THREE.Color(0x7c6a3c), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const n = Math.sin(x * 0.3 + z * 0.17) * 0.5 + Math.sin(x * 0.11 - z * 0.23 + 2) * 0.5;
      tmp.copy(cA).lerp(n > 0 ? cB : cC, Math.abs(n) * 0.8);
      const d = Math.max(Math.abs(x), Math.abs(z));
      if (d > 20.5) tmp.lerp(cHill, smooth(20.5, 30, d) * 0.7);
      const pd = Math.hypot(x - POND.x, z - POND.z);
      if (pd < 3.4) tmp.lerp(cMud, smooth(3.4, 2.6, pd));
      const s = 1 + (rand() - 0.5) * 0.08;
      for (let j = 0; j < 3; j++) {
        cols[(i + j) * 3] = tmp.r * s; cols[(i + j) * 3 + 1] = tmp.g * s; cols[(i + j) * 3 + 2] = tmp.b * s;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // ---------------------------------------------------------------- house
  {
    const x0 = -12, x1 = 2, z0 = -19, z1 = -11, H = 3.2, base = 0.2;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    B.add(box(w + 0.35, 0.35, d + 0.35), 0x9a948a, M(cx, -0.15, cz));
    B.add(box(w, H, d), C.wall, M(cx, base, cz), { vary: 0.02 });
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) B.add(box(0.24, H, 0.24), C.trim, M(x, base, z), { vary: 0.01 });
    // clapboard lines on the front wall
    for (let y = base + 0.35; y < base + H; y += 0.32) B.add(box(w, 0.035, 0.04), 0xe6d3b0, M(cx, y, z1 + 0.01), { vary: 0 });
    // gables + roof
    const a = Math.atan2(2.4, d / 2);
    const gShape = new THREE.Shape();
    gShape.moveTo(-d / 2, 0); gShape.lineTo(d / 2, 0); gShape.lineTo(0, (d / 2) * Math.tan(a)); gShape.closePath();
    B.add(new THREE.ExtrudeGeometry(gShape, { depth: w, bevelEnabled: false }), C.wall, M(cx + w / 2, base + H, cz, 0, -Math.PI / 2, 0), { vary: 0.02 });
    const over = 0.7, halfSpan = d / 2 + over, slabLen = halfSpan / Math.cos(a);
    const ridgeY = base + H + (d / 2) * Math.tan(a);
    for (const side of [-1, 1]) {
      const slab = new THREE.BoxGeometry(w + 1.2, 0.2, slabLen);
      B.add(slab, C.roof, M(cx, ridgeY - (halfSpan / 2) * Math.tan(a) + 0.12, cz + side * halfSpan / 2, side * a, 0, 0));
      // tile rows
      for (let k = 1; k < 7; k++) {
        const t = k / 7, zz = cz + side * halfSpan * t, yy = ridgeY - halfSpan * t * Math.tan(a) + 0.23;
        B.add(new THREE.BoxGeometry(w + 1.2, 0.05, 0.08), 0xa94630, M(cx, yy, zz, side * a, 0, 0), { vary: 0.03 });
      }
    }
    B.add(new THREE.BoxGeometry(w + 1.3, 0.2, 0.3), 0xa94630, M(cx, ridgeY + 0.2, cz, Math.PI / 4, 0, 0));
    B.add(box(0.8, 2.4, 0.8), 0xa4553f, M(x0 + 3, ridgeY - 1.3, cz - 1.6));
    B.add(box(1.0, 0.18, 1.0), 0x7b7169, M(x0 + 3, ridgeY + 1.1, cz - 1.6));
    // windows
    const window = (x, y, z, ry = 0) => {
      const m = M(x, y, z, 0, ry, 0);
      const at = (lx, ly, lz) => m.clone().multiply(M(lx, ly, lz));
      B.add(box(1.4, 1.5, 0.12), C.trim, at(0, 0, 0), { vary: 0 });
      B.add(box(1.16, 1.26, 0.12), 0x8fc9e0, at(0, 0.12, 0.03), { vary: 0.04 });
      B.add(box(0.07, 1.26, 0.14), C.trim, at(0, 0.12, 0.04), { vary: 0 });
      B.add(box(1.16, 0.07, 0.14), C.trim, at(0, 0.72, 0.04), { vary: 0 });
      B.add(box(0.45, 1.5, 0.06), 0x5f8f6a, at(-0.95, 0, 0.03));
      B.add(box(0.45, 1.5, 0.06), 0x5f8f6a, at(0.95, 0, 0.03));
      B.add(box(1.5, 0.3, 0.32), 0x9c6a44, at(0, -0.34, 0.16));
      for (let i = 0; i < 7; i++) {
        const col = [0xff5d73, 0xffd23f, 0xffffff, 0xff8a3d][i % 4];
        B.add(new THREE.IcosahedronGeometry(0.09, 0), i % 2 ? col : 0x4f9a3f, at(-0.6 + i * 0.2, 0.0, 0.2 + (i % 2) * 0.05));
      }
    };
    window(-9.5, 1.1, z1 + 0.02); window(-1.2, 1.1, z1 + 0.02);
    window(x1 + 0.02, 1.1, -15, Math.PI / 2); window(x0 - 0.02, 1.1, -15, -Math.PI / 2);
    // door
    B.add(box(1.5, 2.45, 0.1), C.trim, M(-5, base, z1 + 0.01), { vary: 0 });
    B.add(box(1.2, 2.25, 0.12), 0x3f7f86, M(-5, base, z1 + 0.03));
    for (const yy of [0.6, 1.35]) B.add(box(0.9, 0.55, 0.14), 0x4b919a, M(-5, base + yy, z1 + 0.03));
    B.add(new THREE.IcosahedronGeometry(0.05, 0), 0xe8b62c, M(-4.6, base + 1.1, z1 + 0.14));
    // porch
    B.add(box(4, 0.3, 1.4), C.wood, M(-5, 0, -10.3));
    for (let i = 0; i < 7; i++) B.add(box(0.03, 0.01, 1.4), C.woodDark, M(-6.7 + i * 0.57, 0.3, -10.3), { vary: 0 });
    B.add(box(2, 0.15, 0.5), C.wood, M(-5, 0, -9.35));
    B.add(box(1.4, 0.015, 0.8), 0xd9a441, M(-5, 0.3, -10.55), { vary: 0.02 });
    for (const px of [-6.85, -3.15]) {
      B.add(cyl(0.07, 0.07, 2.4, 6), C.trim, M(px, 0.3, -9.75), { vary: 0 });
      addCircle(px, -9.75, 0.1);
    }
    B.add(new THREE.BoxGeometry(4.4, 0.1, 1.7), 0xd9c4a0, M(-5, 2.72, -10.15, 0.12, 0, 0));
    addBox(x0 - 0.18, x1 + 0.18, z0 - 0.18, z1 + 0.18);
    addBox(-7, -3, -11, -9.6, 0.3);
    addBox(-6, -4, -9.6, -9.1, 0.15);
    // carrot bowl on the porch
    B.add(cyl(0.13, 0.09, 0.07, 10), 0x4f8fd8, M(BOWL.x, BOWL.y, BOWL.z));
    for (let i = 0; i < 5; i++) {
      const aa = i * 1.26;
      B.add(new THREE.ConeGeometry(0.018, 0.12, 5).rotateZ(Math.PI / 2), 0xf08a2c, M(BOWL.x + Math.cos(aa) * 0.04, BOWL.y + 0.08 + i * 0.008, BOWL.z + Math.sin(aa) * 0.04, 0, aa, 0.2));
      B.add(cone(0.01, 0.06, 3), 0x5fae3f, M(BOWL.x + Math.cos(aa) * 0.1, BOWL.y + 0.08, BOWL.z + Math.sin(aa) * 0.1, 0, 0, -Math.cos(aa) * 0.8));
    }
    // front flower-bed soil
    B.add(box(5.2, 0.05, 0.9), C.soil, M(-9.2, -0.02, -10.5), { cast: false });
    B.add(box(3.4, 0.05, 0.9), C.soil, M(0.1, -0.02, -10.5), { cast: false });
    for (let x = -11.7; x < -6.6; x += 0.32) B.add(new THREE.DodecahedronGeometry(0.08, 0), C.stone, M(x, 0.02, -10.02, rand(), rand(), 0, 1, 0.7, 1));
    for (let x = -1.5; x < 1.8; x += 0.32) B.add(new THREE.DodecahedronGeometry(0.08, 0), C.stone, M(x, 0.02, -10.02, rand(), rand(), 0, 1, 0.7, 1));
    reserved.push({ x: -9.2, z: -10.5, r: 2.8 }, { x: 0.1, z: -10.5, r: 1.8 }, { x: -5, z: -10, r: 2.4 });
  }

  // ---------------------------------------------------------------- shed
  {
    const cx = 14.5, cz = -17, w = 5, d = 4;
    B.add(box(w, 2.4, d), 0x9b6b43, M(cx, 0, cz));
    for (let x = cx - w / 2 + 0.2; x < cx + w / 2; x += 0.35) B.add(box(0.05, 2.4, 0.05), 0x80552f, M(x, 0, cz + d / 2), { vary: 0 });
    B.add(new THREE.BoxGeometry(w + 0.7, 0.16, d + 0.9), 0x5e8a55, M(cx, 2.65, cz, -0.14, 0, 0));
    B.add(box(1.1, 1.95, 0.08), 0x6a4527, M(cx - 0.8, 0, cz + d / 2 + 0.03));
    B.add(box(0.9, 0.7, 0.08), C.trim, M(cx + 1.3, 1.1, cz + d / 2 + 0.03), { vary: 0 });
    B.add(box(0.76, 0.56, 0.1), 0x8fc9e0, M(cx + 1.3, 1.17, cz + d / 2 + 0.03));
    addBox(cx - w / 2 - 0.1, cx + w / 2 + 0.1, cz - d / 2 - 0.1, cz + d / 2 + 0.1);
    // pots & watering can
    const pots = [[12.3, -14.5, 0x6fae4d], [12.9, -14.4, 0xff7eb6], [16.8, -14.6, 0xffd23f]];
    for (const [x, z, c] of pots) {
      B.add(cyl(0.18, 0.13, 0.28, 8), 0xc7683f, M(x, 0, z));
      B.add(new THREE.IcosahedronGeometry(0.2, 0), 0x4f9a3f, M(x, 0.36, z, 0, 0, 0, 1, 0.8, 1));
      for (let i = 0; i < 4; i++) B.add(new THREE.IcosahedronGeometry(0.06, 0), c, M(x + Math.cos(i * 1.6) * 0.12, 0.47, z + Math.sin(i * 1.6) * 0.12));
      addCircle(x, z, 0.2, 0.28);
    }
    B.add(cyl(0.12, 0.13, 0.24, 9), 0x3f8f6a, M(15.5, 0, -14.4));
    B.add(cyl(0.02, 0.03, 0.34, 5), 0x3f8f6a, M(15.66, 0.08, -14.4, 0, 0, -0.9));
    B.add(new THREE.TorusGeometry(0.1, 0.018, 4, 10, Math.PI), 0x3f8f6a, M(15.5, 0.24, -14.4));
    addCircle(15.5, -14.4, 0.14, 0.24);
    reserved.push({ x: 14.5, z: -14.3, r: 2.3 });
  }

  // ---------------------------------------------------------------- raised veg beds
  for (const [cx, cz] of [[-14, -5.2], [-14, -1.2], [-14, 2.8]]) {
    B.add(box(4, 0.36, 1.6), C.wood, M(cx, -0.05, cz));
    B.add(box(3.8, 0.02, 1.4), C.soil, M(cx, 0.3, cz), { cast: false });
    for (let x = cx - 1.9; x <= cx + 1.9; x += 1.9) B.add(box(0.1, 0.44, 0.1), C.woodDark, M(x, -0.05, cz - 0.8));
    addBox(cx - 2, cx + 2, cz - 0.8, cz + 0.8, 0.32);
    reserved.push({ x: cx, z: cz, r: 2.3 });
    for (let x = cx - 1.6; x <= cx + 1.65; x += 0.45) {
      for (const dz of [-0.4, 0.4]) {
        if (Math.hypot(x - cx, dz) < 0.55) continue; // leave the centre for digging
        if (cz === -1.2) {
          // carrot tops
          for (let k = 0; k < 4; k++) B.add(cone(0.02, 0.22, 3), 0x5fae3f, M(x + (rand() - 0.5) * 0.05, 0.32, cz + dz, (rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.6));
          B.add(cone(0.035, 0.05, 5), 0xf08a2c, M(x, 0.29, cz + dz));
        } else {
          const lettuce = jitter(new THREE.IcosahedronGeometry(0.17, 1), 0.05, rand);
          B.add(lettuce, rand() > 0.5 ? 0x8fd05a : 0x6fbd4a, M(x, 0.36, cz + dz, 0, rand() * 3, 0, 1, 0.65, 1));
        }
      }
    }
  }

  // ---------------------------------------------------------------- fence
  {
    const shape = new THREE.Shape();
    shape.moveTo(-0.045, 0); shape.lineTo(0.045, 0); shape.lineTo(0.045, 1.0); shape.lineTo(0, 1.1); shape.lineTo(-0.045, 1.0); shape.closePath();
    const pg = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false }).translate(0, 0, -0.0125);
    const mats = [];
    const F = YARD;
    for (let s = -F; s <= F; s += 0.17) {
      mats.push(M(s, 0, -F), M(s, 0, F), M(-F, 0, s, 0, Math.PI / 2, 0), M(F, 0, s, 0, Math.PI / 2, 0));
    }
    const inst = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: C.fence, flatShading: true, roughness: 0.8 }), mats.length);
    mats.forEach((m, i) => {
      const e = m.elements; m.setPosition(e[12], groundHeight(e[12], e[14]) - 0.02, e[14]);
      inst.setMatrixAt(i, m);
    });
    inst.castShadow = true; inst.receiveShadow = true;
    scene.add(inst);
    for (const y of [0.28, 0.78]) {
      B.add(box(2 * F, 0.07, 0.04), 0xe4ddd0, M(0, y, -F - 0.035), { vary: 0 });
      B.add(box(2 * F, 0.07, 0.04), 0xe4ddd0, M(0, y, F + 0.035), { vary: 0 });
      B.add(box(0.04, 0.07, 2 * F), 0xe4ddd0, M(-F - 0.035, y, 0), { vary: 0 });
      B.add(box(0.04, 0.07, 2 * F), 0xe4ddd0, M(F + 0.035, y, 0), { vary: 0 });
    }
    for (let s = -F; s <= F + 0.01; s += 2.5) {
      for (const [x, z] of [[s, -F], [s, F], [-F, s], [F, s]]) B.add(box(0.13, 1.22, 0.13), 0xe9e2d4, M(x, -0.05, z), { vary: 0 });
    }
    addBox(-F - 1, F + 1, -F - 1, -F + 0.15);
    addBox(-F - 1, F + 1, F - 0.15, F + 1);
    addBox(-F - 1, -F + 0.15, -F - 1, F + 1);
    addBox(F - 0.15, F + 1, -F - 1, F + 1);
  }

  // ---------------------------------------------------------------- pond
  {
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(POND.r + 0.25, 20).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x5fb3c8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88, flatShading: true }),
    );
    water.position.set(POND.x, -0.06, POND.z);
    water.receiveShadow = true;
    scene.add(water);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + rand() * 0.1, r = POND.r + 0.2 + rand() * 0.25;
      const x = POND.x + Math.cos(a) * r, z = POND.z + Math.sin(a) * r;
      const s = 0.18 + rand() * 0.16;
      B.add(jitter(new THREE.DodecahedronGeometry(s, 0), s * 0.3, rand), i % 3 ? C.stone : 0xb3ada2, M(x, groundHeight(x, z) - s * 0.3, z, rand(), rand(), 0, 1, 0.6, 1));
    }
    for (let i = 0; i < 5; i++) {
      const a = rand() * 6.28, r = rand() * 1.8;
      B.add(new THREE.CircleGeometry(0.24 + rand() * 0.1, 8, 0.5, Math.PI * 1.75).rotateX(-Math.PI / 2), 0x4f9a3f, M(POND.x + Math.cos(a) * r, -0.045, POND.z + Math.sin(a) * r, 0, rand() * 6, 0), { cast: false });
      if (i % 2 === 0) B.add(new THREE.ConeGeometry(0.06, 0.06, 5), 0xffb7d5, M(POND.x + Math.cos(a) * r + 0.05, -0.02, POND.z + Math.sin(a) * r, Math.PI, 0, 0));
    }
    // reeds
    for (let i = 0; i < 26; i++) {
      const a = 2.2 + rand() * 1.4, r = POND.r + rand() * 0.3;
      B.add(cone(0.015, 0.7 + rand() * 0.5, 3), 0x5a8f3a, M(POND.x + Math.cos(a) * r, -0.05, POND.z + Math.sin(a) * r, (rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3));
    }
    addCircle(POND.x, POND.z, POND.r - 0.1);
    reserved.push({ x: POND.x, z: POND.z, r: POND.r + 0.6 });
    updaters.push((t) => { water.position.y = -0.06 + Math.sin(t * 0.8) * 0.004; });
  }

  // ---------------------------------------------------------------- trees
  const TREES = [
    ['oak', -8, 7, 1.5], ['lemon', 15.5, 11.5, 1.05], ['pine', -16.5, -10.2, 1.3], ['blossom', 5, -6, 1.0],
    ['pine', 17.2, 2, 1.1], ['oak', -2, 16.8, 1.1], ['blossom', -10.5, 14.5, 0.9], ['lemon', 8.5, 16.5, 0.85],
  ];
  const perches = [];
  for (const [type, x, z, s] of TREES) {
    const y = groundHeight(x, z);
    const T = (lx, ly, lz, ...rest) => M(x + lx, y + ly, z + lz, ...rest);
    if (type === 'pine') {
      B.add(cyl(0.14 * s, 0.24 * s, 1.4 * s, 6), C.trunk, T(0, -0.1, 0));
      for (let k = 0; k < 4; k++) {
        B.add(jitter(cone((1.5 - k * 0.3) * s, 1.6 * s, 8), 0.12 * s, rand), k % 2 ? C.pine : 0x377a4a, T(0, (1.0 + k * 0.85) * s, 0, 0, rand(), 0));
      }
    } else {
      B.add(jitter(cyl(0.16 * s, 0.27 * s, 2.1 * s, 6), 0.06 * s, rand), C.trunk, T(0, -0.1, 0));
      B.add(cyl(0.05 * s, 0.09 * s, 0.9 * s, 5), C.trunk, T(0.1 * s, 1.5 * s, 0, 0, 0, -0.7));
      B.add(cyl(0.05 * s, 0.09 * s, 0.9 * s, 5), C.trunk, T(-0.1 * s, 1.6 * s, 0.1, 0.5, 0, 0.6));
      const leafCols = type === 'blossom' ? [0xf7b6cf, 0xf29bbd, 0xfbd0e0] : [C.leaf1, C.leaf2, C.leaf3];
      const blobs = [[0, 2.6, 0, 1.25], [0.9, 2.2, 0.3, 0.9], [-0.8, 2.3, -0.3, 0.95], [0.2, 2.25, -0.9, 0.85], [-0.3, 2.1, 0.9, 0.85], [0.1, 3.3, 0.1, 0.8]];
      for (const [bx, by, bz, br] of blobs) {
        B.add(jitter(new THREE.IcosahedronGeometry(br * s, 1), 0.18 * s, rand), leafCols[Math.floor(rand() * 3)], T(bx * s, by * s, bz * s, rand(), rand(), 0));
      }
      if (type === 'lemon') {
        for (let i = 0; i < 18; i++) {
          const a = rand() * 6.28, e = (rand() - 0.3) * 1.2;
          B.add(new THREE.IcosahedronGeometry(0.1 * s, 0), 0xf6d53b, T(Math.cos(a) * Math.cos(e) * 1.3 * s, (2.5 + Math.sin(e) * 1.1) * s, Math.sin(a) * Math.cos(e) * 1.3 * s, 0, 0, 0, 1, 1.25, 1));
        }
      }
      if (type === 'blossom') {
        for (let i = 0; i < 30; i++) {
          const px = x + (rand() - 0.5) * 3.5 * s, pz = z + (rand() - 0.5) * 3.5 * s;
          B.add(new THREE.CircleGeometry(0.035, 5).rotateX(-Math.PI / 2), 0xfbd0e0, M(px, groundHeight(px, pz) + 0.012, pz, 0, rand() * 6, 0), { cast: false, vary: 0.05 });
        }
      }
      perches.push(new THREE.Vector3(x + 0.9 * s, y + 2.9 * s, z + 0.3 * s));
    }
    addCircle(x, z, (type === 'pine' ? 0.28 : 0.3) * s);
    reserved.push({ x, z, r: 0.6 * s });
    // mushrooms at the foot of broadleaf trees
    if (type !== 'pine') {
      for (let i = 0; i < 3; i++) {
        const a = rand() * 6.28, r = 0.55 * s + rand() * 0.3;
        const mx = x + Math.cos(a) * r, mz = z + Math.sin(a) * r, my = groundHeight(mx, mz);
        B.add(cyl(0.02, 0.025, 0.07, 5), 0xf4ead8, M(mx, my, mz));
        B.add(new THREE.SphereGeometry(0.055, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0xd8453a, M(mx, my + 0.065, mz));
        B.add(new THREE.IcosahedronGeometry(0.01, 0), 0xffffff, M(mx + 0.02, my + 0.11, mz));
      }
    }
  }

  // ---------------------------------------------------------------- shrubs
  const shrub = (x, z, r, col, flowerCol, solid = true) => {
    const y = groundHeight(x, z);
    B.add(jitter(new THREE.IcosahedronGeometry(r, 1), r * 0.22, rand), col, M(x, y + r * 0.55, z, rand(), rand(), 0, 1, 0.82, 1));
    B.add(jitter(new THREE.IcosahedronGeometry(r * 0.7, 1), r * 0.2, rand), col, M(x + r * 0.5, y + r * 0.4, z + r * 0.3, rand(), rand(), 0));
    if (flowerCol) {
      for (let i = 0; i < 14; i++) {
        const a = rand() * 6.28, e = rand() * 1.2;
        B.add(new THREE.IcosahedronGeometry(r * 0.11, 0), flowerCol, M(x + Math.cos(a) * Math.cos(e) * r * 0.95, y + r * 0.55 + Math.sin(e) * r * 0.8, z + Math.sin(a) * Math.cos(e) * r * 0.95));
      }
    }
    if (solid) addCircle(x, z, r * 0.85);
    reserved.push({ x, z, r: r + 0.2 });
  };
  const greens = [0x4a8f3c, 0x5aa446, 0x3f7f37, 0x5e9a3a];
  for (let z = -8.5; z < 13; z += 1.35) shrub(-19.1 + rand() * 0.2, z, 0.8 + rand() * 0.25, greens[Math.floor(rand() * 4)], null);
  for (const [x, z] of [[-18.6, 18.6], [-17.3, 19.1], [-19.1, 17.2], [-18.8, 14.8]]) shrub(x, z, 1.05, 0x3f7f37, null);
  const flowering = [
    [6.5, -10, 0.7, 0xb28ae0], [9, -10.5, 0.6, 0x8fb6ff], [18.5, -6.5, 0.8, 0xff9fc2], [18.6, 7, 0.75, null],
    [18.4, 17.8, 0.9, 0xffffff], [11.5, 18.6, 0.7, 0xff9fc2], [-7, 18.6, 0.8, 0x8fb6ff], [-12.8, 18.7, 0.7, null],
    [4.5, 18.6, 0.65, 0xffd23f], [-18.5, -15.5, 0.8, 0xb28ae0], [-13, -12, 0.6, 0xff9fc2], [3.5, -12, 0.6, 0x8fb6ff],
    [18.3, -1.5, 0.6, null], [-3, 6.5, 0.45, 0xffffff],
  ];
  for (const [x, z, r, fc] of flowering) shrub(x, z, r, greens[Math.floor(rand() * 4)], fc);

  // ---------------------------------------------------------------- burrow entrances
  // Each entrance is a dirt mound with an arched doorway; the doorway is where the player
  // drops into the generated tunnels (see underground.js).
  const entrances = [];
  const makeSign = (text) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#c99a66'; ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = '#7a5234'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 248, 88);
    ctx.fillStyle = '#4a2c16'; ctx.font = 'bold 40px "Fredoka", "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 50);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const wood = new THREE.MeshStandardMaterial({ color: 0xa87a4d });
    return new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.21, 0.03), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: tex }), wood]);
  };
  const makeBurrow = (x, z, dir, label, name) => {
    const y = groundHeight(x, z);
    const mound = jitter(new THREE.SphereGeometry(1.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.12, rand);
    B.add(mound, 0x7a5234, M(x, y - 0.05, z, 0, 0, 0, 1, 0.45, 1));
    const ang = Math.atan2(dir.x, dir.y);
    const hx = x + dir.x * 1.0, hz = z + dir.y * 1.0, hy = groundHeight(hx, hz) - 0.02;
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x140c07 }));
    hole.position.set(hx, hy, hz);
    hole.rotation.set(-0.25, ang, 0, 'YXZ');
    hole.scale.set(1, 1.05, 1);
    scene.add(hole);
    const hood = jitter(new THREE.SphereGeometry(0.42, 8, 4, 0, Math.PI, 0, Math.PI / 2), 0.05, rand);
    B.add(hood, 0x6e4a2f, M(hx - dir.x * 0.1, hy, hz - dir.y * 0.1, 0, ang + Math.PI, 0, 1, 1.0, 0.9));
    for (let i = 0; i <= 9; i++) {
      const a = Math.PI * (i / 9);
      const ox = Math.cos(a) * 0.36, oy = Math.sin(a) * 0.36;
      const px = hx + Math.cos(ang) * ox + dir.x * 0.03, pz = hz - Math.sin(ang) * ox + dir.y * 0.03;
      B.add(jitter(new THREE.DodecahedronGeometry(0.075, 0), 0.03, rand), i % 2 ? 0xa39c8f : 0xb8b0a0, M(px, hy + oy, pz, rand(), rand(), 0));
    }
    for (let i = 0; i < 16; i++) {
      const a = ang + (rand() - 0.5) * 1.4, r = 1.1 + rand() * 0.8;
      const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
      B.add(new THREE.IcosahedronGeometry(0.03 + rand() * 0.03, 0), 0x7a5234, M(px, groundHeight(px, pz), pz, 0, 0, 0, 1, 0.5, 1), { cast: false });
    }
    const sx = x + dir.x * 0.9 - dir.y * 1.1, sz = z + dir.y * 0.9 + dir.x * 1.1;
    B.add(cyl(0.035, 0.035, 0.6, 5), C.woodDark, M(sx, groundHeight(sx, sz), sz));
    const sign = makeSign(label);
    sign.position.set(sx, groundHeight(sx, sz) + 0.62, sz);
    sign.rotation.set(0, ang, 0.06);
    sign.castShadow = true;
    scene.add(sign);
    addCircle(sx, sz, 0.06);
    addCircle(x - dir.x * 0.2, z - dir.y * 0.2, 0.75, y + 0.38);
    reserved.push({ x, z, r: 2.1 });
    // where the player stands to enter, and where it pops back out
    const door = new THREE.Vector3(hx + dir.x * 0.35, 0, hz + dir.y * 0.35);
    door.y = groundHeight(door.x, door.z);
    entrances.push({ name, label, x, z, dir: dir.clone(), hole: new THREE.Vector3(hx, hy, hz), door });
  };
  const burrowDir = new THREE.Vector2(-BURROW.x, -BURROW.z).normalize();
  makeBurrow(BURROW.x, BURROW.z, burrowDir, 'PLATANITO', "Platanito's burrow");
  makeBurrow(RABBIT_HOLE.x, RABBIT_HOLE.z, new THREE.Vector2(-1, -0.6).normalize(), 'BUNNY', 'Rabbit hole');

  // ---------------------------------------------------------------- props
  // bench
  {
    const x = 4, z = 10;
    B.add(box(1.7, 0.06, 0.48), C.wood, M(x, 0.4, z));
    for (const [lx, lz] of [[-0.75, -0.18], [0.75, -0.18], [-0.75, 0.18], [0.75, 0.18]]) B.add(box(0.07, 0.4, 0.07), 0x4a4a4a, M(x + lx, 0, z + lz));
    B.add(box(1.7, 0.35, 0.05), C.wood, M(x, 0.55, z + 0.26, -0.15, 0, 0));
    addBox(x - 0.85, x + 0.85, z - 0.24, z + 0.24, 0.46);
    reserved.push({ x, z, r: 1.2 });
    perches.push(new THREE.Vector3(x - 0.5, 0.92, z + 0.28));
  }
  // bird bath
  {
    const x = -4, z = 3.5, y = groundHeight(x, z);
    B.add(cyl(0.2, 0.26, 0.12, 8), 0xc8c2b6, M(x, y, z));
    B.add(cyl(0.08, 0.12, 0.62, 8), 0xd6d0c4, M(x, y + 0.1, z));
    B.add(cyl(0.38, 0.14, 0.14, 10), 0xd6d0c4, M(x, y + 0.7, z));
    B.add(new THREE.CircleGeometry(0.32, 10).rotateX(-Math.PI / 2), 0x7cc6d6, M(x, y + 0.83, z), { cast: false, vary: 0 });
    addCircle(x, z, 0.3);
    reserved.push({ x, z, r: 0.8 });
    perches.push(new THREE.Vector3(x + 0.33, y + 0.85, z), new THREE.Vector3(x - 0.3, y + 0.85, z + 0.12));
  }
  // garden gnome
  {
    const x = -8.4, z = -9.3, y = groundHeight(x, z);
    B.add(cone(0.13, 0.26, 7), 0x3f6fc4, M(x, y, z));
    B.add(new THREE.IcosahedronGeometry(0.07, 1), 0xf2c6a0, M(x, y + 0.3, z));
    B.add(cone(0.075, 0.14, 6), 0xf4f4f4, M(x, y + 0.2, z + 0.05, 2.8, 0, 0));
    B.add(cone(0.08, 0.2, 7), 0xd8453a, M(x, y + 0.33, z, -0.2, 0, 0));
    B.add(new THREE.IcosahedronGeometry(0.02, 0), 0xe8927c, M(x, y + 0.3, z + 0.07));
    addCircle(x, z, 0.14);
  }
  // stepping-stone paths
  const paths = [
    [[-5, -8.9], [-4.3, -5], [-2.2, 0], [-0.5, 5], [1, 10], [0.2, 14.5], [0.3, 19]],
    [[-4, -8.5], [2, -8.8], [8, -10.5], [12.5, -12.5], [13.6, -14.4]],
    [[-2.2, 0], [4, 3], [6, 3.7]],
  ];
  for (const p of paths) {
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.floor(len / 0.85));
      for (let k = 0; k < n; k++) {
        const t = k / n, x = ax + (bx - ax) * t + (rand() - 0.5) * 0.2, z = az + (bz - az) * t + (rand() - 0.5) * 0.2;
        const r = 0.26 + rand() * 0.08;
        B.add(jitter(cyl(r, r * 1.05, 0.05, 7), 0.03, rand), rand() > 0.5 ? 0xc9c1b1 : 0xb8b0a0, M(x, groundHeight(x, z) - 0.01, z, 0, rand() * 3, 0), { cast: false });
        reserved.push({ x, z, r: r * 0.9, soft: true });
      }
    }
  }
  // boulders
  const rocks = [[6, 1, 0.45], [-11, 10.5, 0.55], [14, 4.5, 0.35], [-6.5, -3, 0.3], [10.5, -6.5, 0.5], [-13.5, 8.5, 0.4], [16.8, 15.8, 0.5], [1.5, 6.8, 0.28]];
  for (const [x, z, r] of rocks) {
    const y = groundHeight(x, z);
    const h = r * 1.1;
    B.add(jitter(new THREE.DodecahedronGeometry(r, 0), r * 0.35, rand), rand() > 0.5 ? C.stone : 0xafa99d, M(x, y + h * 0.3, z, rand(), rand(), rand(), 1, 0.7, 1));
    addCircle(x, z, r * 0.8, y + h * 0.3 + r * 0.55);
    reserved.push({ x, z, r: r + 0.2 });
  }

  // ---------------------------------------------------------------- neighbourhood beyond the fence
  {
    const houses = [[-36, -18, 0.3, 0xe9c7a8, 0x6f7fa8], [30, -32, -0.4, 0xd9e2cf, 0xa45a4a], [34, 26, 0.9, 0xf1dfb5, 0x5e8a55], [-30, 34, -0.2, 0xcfd9e6, 0xc4573a]];
    for (const [x, z, ry, wall, roof] of houses) {
      const y = groundHeight(x, z);
      const m = M(x, y - 0.3, z, 0, ry, 0);
      B.add(box(8, 4, 6), wall, m);
      const shape = new THREE.Shape(); shape.moveTo(-3.6, 0); shape.lineTo(3.6, 0); shape.lineTo(0, 2.6); shape.closePath();
      B.add(new THREE.ExtrudeGeometry(shape, { depth: 8.6, bevelEnabled: false }), roof, m.clone().multiply(M(4.3, 4, 0, 0, -Math.PI / 2, 0)));
    }
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2, r = 26 + rand() * 45;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (houses.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < 8)) continue;
      const y = groundHeight(x, z), s = 1 + rand() * 1.5;
      if (rand() > 0.5) {
        B.add(cyl(0.2 * s, 0.3 * s, 1.2 * s, 5), C.trunk, M(x, y, z));
        for (let k = 0; k < 3; k++) B.add(cone((1.4 - k * 0.35) * s, 1.6 * s, 7), C.pine, M(x, y + (1 + k * 0.9) * s, z));
      } else {
        B.add(cyl(0.2 * s, 0.3 * s, 2 * s, 5), C.trunk, M(x, y, z));
        B.add(jitter(new THREE.IcosahedronGeometry(1.4 * s, 0), 0.3 * s, rand), greens[Math.floor(rand() * 4)], M(x, y + 2.6 * s, z));
      }
    }
  }

  // ---------------------------------------------------------------- clouds
  const clouds = new THREE.Group();
  {
    const cb = new Batch(rand);
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2, r = 60 + rand() * 120, y = 38 + rand() * 30;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, s = 3 + rand() * 4;
      for (let k = 0; k < 5; k++) {
        cb.add(new THREE.IcosahedronGeometry(s * (0.6 + rand() * 0.5), 0), 0xffffff, M(x + (k - 2) * s * 0.8, y + rand() * s * 0.4, z + (rand() - 0.5) * s, rand(), rand(), 0, 1, 0.55, 1), { vary: 0.03, cast: false });
      }
    }
    cb.build(clouds, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, emissive: 0xffffff, emissiveIntensity: 0.35, fog: false }));
    scene.add(clouds);
    updaters.push((t) => { clouds.rotation.y = t * 0.003; });
  }

  B.build(scene, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88 }));

  // ---------------------------------------------------------------- queries
  function isFree(x, z, pad = 0.1) {
    if (Math.abs(x) > YARD - 0.4 || Math.abs(z) > YARD - 0.4) return false;
    for (const s of solids) {
      if (s.type === 0) { if ((x - s.x) ** 2 + (z - s.z) ** 2 < (s.r + pad) ** 2) return false; }
      else if (s.maxX - s.minX < 30 && s.maxZ - s.minZ < 30 && x > s.minX - pad && x < s.maxX + pad && z > s.minZ - pad && z < s.maxZ + pad) return false;
    }
    for (const r of reserved) if ((x - r.x) ** 2 + (z - r.z) ** 2 < (r.r + pad) ** 2) return false;
    return true;
  }

  function floorAt(x, z, feetY) {
    let h = groundHeight(x, z);
    for (const s of solids) {
      if (!Number.isFinite(s.top) || s.top > feetY + STEP) continue;
      if (s.type === 0) { if ((x - s.x) ** 2 + (z - s.z) ** 2 < s.r * s.r) h = Math.max(h, s.top); }
      else if (x > s.minX - 0.05 && x < s.maxX + 0.05 && z > s.minZ - 0.05 && z < s.maxZ + 0.05) h = Math.max(h, s.top);
    }
    return h;
  }

  function resolve(p, r, feetY) {
    for (let iter = 0; iter < 3; iter++) {
      for (const s of solids) {
        if (feetY >= s.top - STEP) continue;
        if (s.type === 0) {
          const dx = p.x - s.x, dz = p.z - s.z, R = s.r + r, d2 = dx * dx + dz * dz;
          if (d2 < R * R) { const d = Math.sqrt(d2) || 1e-4; p.x = s.x + (dx / d) * R; p.z = s.z + (dz / d) * R; }
        } else {
          const cx = clamp(p.x, s.minX, s.maxX), cz = clamp(p.z, s.minZ, s.maxZ);
          const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
          else {
            const l = p.x - s.minX, rr = s.maxX - p.x, t = p.z - s.minZ, b = s.maxZ - p.z, m = Math.min(l, rr, t, b);
            if (m === l) p.x = s.minX - r; else if (m === rr) p.x = s.maxX + r; else if (m === t) p.z = s.minZ - r; else p.z = s.maxZ + r;
          }
        }
      }
    }
  }

  function randomLawnPoint(r) {
    for (let i = 0; i < 200; i++) {
      const x = (r() - 0.5) * 36, z = (r() - 0.5) * 30 - 1;
      if (isFree(x, z, 0.4)) return new THREE.Vector3(x, groundHeight(x, z), z);
    }
    return new THREE.Vector3(0, 0, 0);
  }

  // fence tops make good perches too
  for (let i = 0; i < 10; i++) {
    const s = -16 + i * 3.6;
    perches.push(new THREE.Vector3(s, 1.12, YARD), new THREE.Vector3(YARD, 1.12, s));
  }

  // ---------------------------------------------------------------- daylight
  const dayColors = {
    topA: new THREE.Color(0x3f8fe0), topB: new THREE.Color(0x5a7fd0),
    horA: new THREE.Color(0xcfe8f2), horB: new THREE.Color(0xffd9b0),
    sunA: new THREE.Color(0xfff0d2), sunB: new THREE.Color(0xffb46a),
  };
  const sunDir = new THREE.Vector3();
  function setDaylight(k) {
    const elev = THREE.MathUtils.lerp(0.95, 0.32, k), az = THREE.MathUtils.lerp(0.7, 1.35, k);
    sunDir.set(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az)).normalize();
    skyUniforms.sunDir.value.copy(sunDir);
    skyUniforms.top.value.copy(dayColors.topA).lerp(dayColors.topB, k);
    skyUniforms.horizon.value.copy(dayColors.horA).lerp(dayColors.horB, k * 0.9);
    skyUniforms.sunColor.value.copy(dayColors.sunA).lerp(dayColors.sunB, k);
    sun.color.copy(dayColors.sunA).lerp(dayColors.sunB, k * 0.8);
    sun.intensity = THREE.MathUtils.lerp(2.7, 2.2, k);
    hemi.intensity = THREE.MathUtils.lerp(1.25, 1.0, k);
    scene.fog.color.copy(skyUniforms.horizon.value);
    scene.background.copy(skyUniforms.horizon.value);
  }
  setDaylight(0);

  function update(t, dt, focus) {
    timeUniform.value = t;
    sky.position.copy(focus);
    sun.target.position.set(focus.x, 0, focus.z);
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 50);
    for (const u of updaters) u(t, dt);
  }

  const digSpots = DIG_SPOTS.map(([x, z]) => ({ x, z, y: floorAt(x, z, 5), dug: false, banana: null }));
  for (const s of digSpots) reserved.push({ x: s.x, z: s.z, r: 0.45 });

  return {
    scene, solids, isFree, floorAt, resolve, groundHeight, randomLawnPoint, update, setDaylight,
    digSpots, perches, entrances, timeUniform, sun, hemi, reserved, rand, paths,
  };
}

// ---------------------------------------------------------------------------
// Instanced grass + flowers (built after the world so they avoid obstacles)
// ---------------------------------------------------------------------------
export function buildFoliage(world) {
  const { scene, isFree, groundHeight: gh, timeUniform } = world;
  const rand = rng(77);

  // sway is applied after the instance transform so stems and heads move together
  const windify = (mat, amount, rigid = false) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = timeUniform;
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;'));
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <project_vertex>', `
        vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
        float sway = sin(uTime * 1.6 + mvPosition.x * 0.35 + mvPosition.z * 0.22) + 0.45 * sin(uTime * 3.3 + mvPosition.x * 1.7 - mvPosition.z);
        float k = ${rigid ? '1.0' : 'position.y * position.y'} * ${amount.toFixed(3)};
        mvPosition.x += sway * k;
        mvPosition.z += sway * k * 0.5;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
    };
    return mat;
  };

  // grass tufts: three tapered blades, normals pointing up so they light like the lawn
  {
    const pos = [], col = [], nor = [];
    const base = new THREE.Color(0x3f7f2c), tip = new THREE.Color(0xb6dc6a);
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + 0.3, ox = Math.cos(a) * 0.02, oz = Math.sin(a) * 0.02;
      const px = -Math.sin(a) * 0.014, pz = Math.cos(a) * 0.014;
      const lean = 0.05 + (k % 2) * 0.03, h = 1 - (k % 3) * 0.18;
      pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, ox * 2.5 + Math.cos(a) * lean, h, oz * 2.5 + Math.sin(a) * lean);
      col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
      for (let j = 0; j < 3; j++) nor.push(0, 1, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mat = windify(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }), 0.035);
    const N = 22000;
    const mesh = new THREE.InstancedMesh(g, mat, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    let n = 0;
    for (let i = 0; i < N * 3 && n < N; i++) {
      let x, z;
      if (n < N * 0.85) { x = (rand() - 0.5) * 39; z = (rand() - 0.5) * 39; if (!isFree(x, z, 0.02)) continue; }
      else {
        const a = rand() * Math.PI * 2, r = 20.6 + rand() * 18; x = Math.cos(a) * r; z = Math.sin(a) * r;
        if (Math.max(Math.abs(x), Math.abs(z)) < 20.4) continue;
      }
      const h = 0.1 + rand() * rand() * 0.28, s = 0.8 + rand() * 0.8;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
      m.compose(new THREE.Vector3(x, gh(x, z) - 0.01, z), q, new THREE.Vector3(s, h, s));
      mesh.setMatrixAt(n, m);
      c.setHSL(0.24 + rand() * 0.06, 0.55, 0.42 + rand() * 0.14);
      mesh.setColorAt(n, c);
      n++;
    }
    mesh.count = n;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  // flowers: stems + star-shaped heads + centres, plus lavender spikes
  {
    const spots = [];
    const addFlower = (x, z, h, color, kind = 0) => spots.push({ x, z, h, color, kind });
    const palette = [0xff7eb6, 0xffffff, 0xffd23f, 0xb388ff, 0xff6b4a, 0x7ec8ff];
    // house beds
    for (let i = 0; i < 90; i++) {
      const left = i < 60;
      const x = left ? -11.6 + rand() * 4.9 : -1.5 + rand() * 3.2, z = -10.9 + rand() * 0.8;
      if (i % 3 === 0) addFlower(x, z, 0.35 + rand() * 0.2, 0x8e6cc9, 1);
      else addFlower(x, z, 0.25 + rand() * 0.25, palette[Math.floor(rand() * palette.length)], i % 4 === 1 ? 2 : 0);
    }
    // wildflower clusters on the lawn
    for (let c = 0; c < 26; c++) {
      const cx = (rand() - 0.5) * 36, cz = (rand() - 0.5) * 36;
      if (!isFree(cx, cz, 0.3)) continue;
      const col = palette[Math.floor(rand() * palette.length)];
      const n = 6 + Math.floor(rand() * 10);
      for (let i = 0; i < n; i++) {
        const x = cx + (rand() - 0.5) * 1.6, z = cz + (rand() - 0.5) * 1.6;
        if (!isFree(x, z, 0.05)) continue;
        addFlower(x, z, 0.12 + rand() * 0.22, rand() > 0.8 ? 0xffffff : col, 0);
      }
    }
    // along the fence
    for (let i = 0; i < 120; i++) {
      const s = (rand() - 0.5) * 38, side = Math.floor(rand() * 4);
      const x = side === 0 ? s : side === 1 ? 19.3 : side === 2 ? s : -18.2, z = side === 0 ? 19.3 : side === 2 ? -19.3 : s;
      if (!isFree(x, z, 0.02) && Math.abs(x) < 19) continue;
      addFlower(x, z, 0.3 + rand() * 0.45, palette[Math.floor(rand() * palette.length)], rand() > 0.6 ? 2 : 0);
    }

    const stemG = new THREE.CylinderGeometry(0.005, 0.008, 1, 3).translate(0, 0.5, 0);
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.022 : 0.06;
      i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const headG = new THREE.ShapeGeometry(star).rotateX(-Math.PI / 2);
    const tulipG = new THREE.CylinderGeometry(0.035, 0.02, 0.07, 6, 1, true).translate(0, 0.035, 0);
    const spikeG = new THREE.ConeGeometry(0.022, 0.16, 5).translate(0, 0.08, 0);
    const centreG = new THREE.IcosahedronGeometry(0.018, 0);
    const mk = (geo, n, rigid, side = THREE.FrontSide) => {
      const mat = new THREE.MeshStandardMaterial({ side, roughness: 0.8, flatShading: true });
      windify(mat, 0.04, rigid);
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
      mesh.count = 0; mesh.receiveShadow = true; mesh.frustumCulled = false;
      scene.add(mesh);
      return mesh;
    };
    const stems = mk(stemG, spots.length, false);
    const heads = mk(headG, spots.length, true, THREE.DoubleSide);
    const tulips = mk(tulipG, spots.length, true, THREE.DoubleSide);
    const spikes = mk(spikeG, spots.length, true);
    const centres = mk(centreG, spots.length, true);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    const put = (mesh, x, y, z, rx, ry, rz, sx, sy, sz, col) => {
      q.setFromEuler(e.set(rx, ry, rz));
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
      mesh.setMatrixAt(mesh.count, m);
      mesh.setColorAt(mesh.count, c.set(col));
      mesh.count++;
    };
    const flowerHeads = [];
    for (const f of spots) {
      const y = gh(f.x, f.z);
      put(stems, f.x, y, f.z, 0, 0, 0, 1, f.h, 1, 0x4f8f3a);
      const top = y + f.h;
      const s = 0.8 + rand() * 0.6;
      if (f.kind === 0) {
        put(heads, f.x, top, f.z, (rand() - 0.5) * 0.5, rand() * 6, (rand() - 0.5) * 0.5, s, s, s, f.color);
        put(centres, f.x, top + 0.004, f.z, 0, 0, 0, s, s * 0.6, s, f.color === 0xffd23f ? 0xd9702a : 0xffd23f);
      } else if (f.kind === 1) {
        put(spikes, f.x, top - 0.04, f.z, 0, 0, 0, 1, 1 + rand() * 0.6, 1, f.color);
      } else {
        const col = [0xff4d5e, 0xff9a3d, 0xffd23f, 0xff7eb6][Math.floor(rand() * 4)];
        put(tulips, f.x, top - 0.01, f.z, 0, rand() * 6, 0, s, s, s, col);
      }
      flowerHeads.push(new THREE.Vector3(f.x, top, f.z));
    }
    for (const mesh of [stems, heads, tulips, spikes, centres]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    return { flowerHeads };
  }
}
