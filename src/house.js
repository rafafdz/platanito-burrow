import * as THREE from 'three';
import { rng, Batch, M, box, cyl, jitter } from './world.js';
import { makeCollider } from './collide.js';

// The inside of the cottage: a cosy living room + kitchen at rabbit scale.
// It's its own scene/zone, reached through the front door on the porch.
export function buildHouseInterior() {
  const rand = rng(8080);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4e4c6);
  const B = new Batch(rand);
  const solids = [];
  const solid = (minX, maxX, minZ, maxZ, top = Infinity) => solids.push({ minX, maxX, minZ, maxZ, top });
  const X0 = -5, X1 = 5, Z0 = -3.5, Z1 = 3.5, H = 2.6;

  // --- floor, walls, ceiling
  for (let z = Z0, i = 0; z < Z1; z += 0.35, i++) B.add(box(X1 - X0, 0.02, 0.34), i % 2 ? 0xc49060 : 0xb8834f, M(0, -0.02, z + 0.175), { cast: false, vary: 0.04 });
  const wall = 0xf4e4c6, wains = 0xa9c4a0, trim = 0xfbf7ee;
  B.add(box(X1 - X0, H, 0.15), wall, M(0, 0, Z0 - 0.075), { vary: 0.01 });
  B.add(box(0.15, H, Z1 - Z0), wall, M(X0 - 0.075, 0, 0), { vary: 0.01 });
  B.add(box(0.15, H, Z1 - Z0), wall, M(X1 + 0.075, 0, 0), { vary: 0.01 });
  B.add(box(4.4, H, 0.15), wall, M(-2.8, 0, Z1 + 0.075), { vary: 0.01 });
  B.add(box(4.4, H, 0.15), wall, M(2.8, 0, Z1 + 0.075), { vary: 0.01 });
  B.add(box(1.2, H - 2.1, 0.15), wall, M(0, 2.1, Z1 + 0.075), { vary: 0.01 });
  // sage wainscoting + white skirting
  B.add(box(X1 - X0, 0.9, 0.02), wains, M(0, 0, Z0 + 0.01), { cast: false });
  B.add(box(0.02, 0.9, Z1 - Z0), wains, M(X0 + 0.01, 0, 0), { cast: false });
  B.add(box(0.02, 0.9, Z1 - Z0 - 4.6), wains, M(X1 - 0.01, 0, 2.3), { cast: false });
  B.add(box(X1 - X0, 0.05, 0.04), trim, M(0, 0.9, Z0 + 0.02), { cast: false, vary: 0 });
  B.add(box(0.04, 0.05, Z1 - Z0), trim, M(X0 + 0.02, 0.9, 0), { cast: false, vary: 0 });
  const ceil = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0).rotateX(Math.PI / 2);
  B.add(ceil, 0xfbf4e6, M(0, H, 0), { cast: false, vary: 0 });
  for (let x = -4; x <= 4; x += 2) B.add(box(0.14, 0.14, Z1 - Z0), 0x9c6a44, M(x, H - 0.14, 0), { cast: false });
  solid(X0 - 1, X0, Z0 - 1, Z1 + 1); solid(X1, X1 + 1, Z0 - 1, Z1 + 1);
  solid(X0 - 1, X1 + 1, Z0 - 1, Z0); solid(X0 - 1, X1 + 1, Z1, Z1 + 1);

  // --- windows on the north wall, letting in sun
  const glass = new THREE.MeshBasicMaterial({ color: 0xcdeaf8 });
  const sunPatch = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.28, depthWrite: false });
  for (const wx of [-2.6, 1.2]) {
    B.add(box(1.5, 1.3, 0.06), trim, M(wx, 1.0, Z0 + 0.02), { vary: 0 });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.1), glass);
    pane.position.set(wx, 1.65, Z0 + 0.06);
    scene.add(pane);
    B.add(box(0.05, 1.1, 0.04), trim, M(wx, 1.1, Z0 + 0.08), { vary: 0 });
    B.add(box(1.3, 0.05, 0.04), trim, M(wx, 1.63, Z0 + 0.08), { vary: 0 });
    B.add(box(1.7, 0.06, 0.22), trim, M(wx, 0.97, Z0 + 0.11), { vary: 0 });
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.5).rotateX(-Math.PI / 2), sunPatch);
    patch.position.set(wx + 0.25, 0.012, Z0 + 1.6);
    scene.add(patch);
  }
  // doorway back to the garden
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.1), new THREE.MeshBasicMaterial({ color: 0xbfe6a0 }));
  outside.position.set(0, 1.05, Z1 + 0.15);
  outside.rotation.y = Math.PI;
  scene.add(outside);
  B.add(box(1.45, 2.25, 0.1), trim, M(0, 0, Z1 + 0.02), { vary: 0 });
  B.add(box(0.08, 2.1, 1.1), 0x3f7f86, M(-0.6, 0, Z1 - 0.55, 0, 0.3, 0)); // door leaf, swung open
  const mat = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.45, depthWrite: false }));
  mat.position.set(0, 0.015, Z1 - 0.55);
  scene.add(mat);

  // --- living room: rug, sofa, coffee table, lamp, bookshelf, cushion
  B.add(box(3.4, 0.012, 2.4), 0xc4573a, M(-3, 0, -1.7), { cast: false, vary: 0.02 });
  for (let k = -1; k <= 1; k++) B.add(box(3.0, 0.014, 0.12), 0xf3d9a4, M(-3, 0, -1.7 + k * 0.7), { cast: false, vary: 0 });
  const sofa = 0xd9a441;
  B.add(box(2.4, 0.3, 0.83), sofa, M(-3, 0.02, -2.91));
  B.add(box(1.08, 0.12, 0.62), 0xe3b45a, M(-3.56, 0.3, -2.8));
  B.add(box(1.08, 0.12, 0.62), 0xe3b45a, M(-2.44, 0.3, -2.8));
  B.add(box(2.4, 0.6, 0.26), sofa, M(-3, 0.3, -3.2));
  for (const ax of [-4.1, -1.9]) B.add(box(0.2, 0.3, 0.83), sofa, M(ax, 0.3, -2.91));
  B.add(box(0.36, 0.3, 0.12), 0x5f8f6a, M(-3.8, 0.45, -3.02, -0.25, 0.2, 0));
  B.add(box(0.36, 0.3, 0.12), 0xf2f2ea, M(-2.1, 0.45, -3.02, -0.25, -0.2, 0));
  solid(-4.1, -1.9, -3.07, -2.49, 0.42);
  solid(-4.2, -1.8, -3.33, -3.07);
  solid(-4.2, -4.0, -3.33, -2.49, 0.6); solid(-2.0, -1.8, -3.33, -2.49, 0.6);
  B.add(box(1.2, 0.05, 0.6), 0x9c6a44, M(-3, 0.38, -1.6));
  for (const [lx, lz] of [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]]) B.add(box(0.05, 0.38, 0.05), 0x7a5234, M(-3 + lx, 0, -1.6 + lz));
  B.add(cyl(0.05, 0.07, 0.18, 7), 0x4f8fd8, M(-2.7, 0.43, -1.55));
  for (let i = 0; i < 3; i++) B.add(new THREE.IcosahedronGeometry(0.035, 0), [0xff7eb6, 0xffd23f, 0xffffff][i], M(-2.7 + (i - 1) * 0.04, 0.64, -1.55));
  B.add(box(0.3, 0.05, 0.22), 0x3f6fc4, M(-3.25, 0.43, -1.65));
  solid(-3.6, -2.4, -1.9, -1.3, 0.43);
  // floor lamp
  B.add(cyl(0.15, 0.18, 0.04, 10), 0x4a4a4a, M(-4.55, 0, -2.2));
  B.add(cyl(0.015, 0.015, 1.4, 5), 0x4a4a4a, M(-4.55, 0, -2.2));
  B.add(cyl(0.12, 0.22, 0.26, 10), 0xfff1c8, M(-4.55, 1.35, -2.2), { cast: false });
  const lamp = new THREE.PointLight(0xffd9a0, 4, 5, 1.5);
  lamp.position.set(-4.55, 1.35, -2.2);
  scene.add(lamp);
  solid(-4.7, -4.4, -2.35, -2.05);
  // bookshelf
  B.add(box(0.36, 1.8, 1.6), 0x8a5a36, M(-4.82, 0, 1.0));
  for (let s = 0; s < 4; s++) {
    let z = 0.3;
    while (z < 1.68) {
      const w = 0.05 + rand() * 0.05, h = 0.22 + rand() * 0.12;
      B.add(box(0.26, h, w), [0xd8453a, 0x3f6fc4, 0x5f8f6a, 0xe8b62c, 0xf2f2ea][Math.floor(rand() * 5)], M(-4.7, 0.08 + s * 0.44, z + w / 2));
      z += w + 0.005;
    }
  }
  solid(-5, -4.6, 0.2, 1.8);
  // Platanito's cushion (low enough to hop straight onto)
  B.add(cyl(0.45, 0.48, 0.1, 14), 0x7fb0c9, M(-3.6, 0, 1.4), { cast: false });
  for (let i = 0; i < 8; i++) B.add(new THREE.IcosahedronGeometry(0.04, 0), 0xe6c96a, M(-3.6 + (rand() - 0.5) * 0.5, 0.1, 1.4 + (rand() - 0.5) * 0.5, rand(), rand(), 0, 1, 0.4, 2.5));
  solid(-4.05, -3.15, 0.95, 1.85, 0.1);
  // a banana painting, naturally
  B.add(box(0.05, 0.8, 1.1), 0x7a5234, M(X0 + 0.03, 1.3, -1.6), { vary: 0 });
  B.add(box(0.06, 0.66, 0.96), 0xa9d6e8, M(X0 + 0.04, 1.37, -1.6), { vary: 0 });
  B.add(new THREE.TorusGeometry(0.22, 0.06, 5, 12, Math.PI), 0xffcf2e, M(X0 + 0.09, 1.78, -1.6, 0, Math.PI / 2, Math.PI));

  // --- dining + kitchen
  const table = 0xa87a4d;
  B.add(box(1.7, 0.06, 1.0), table, M(2.4, 0.72, -1.4));
  for (const [lx, lz] of [[-0.75, -0.42], [0.75, -0.42], [-0.75, 0.42], [0.75, 0.42]]) {
    B.add(box(0.07, 0.72, 0.07), 0x7a5234, M(2.4 + lx, 0, -1.4 + lz));
    solid(2.4 + lx - 0.05, 2.4 + lx + 0.05, -1.4 + lz - 0.05, -1.4 + lz + 0.05);
  }
  B.add(cyl(0.16, 0.12, 0.08, 10), 0xf6f2ea, M(2.4, 0.78, -1.4));
  for (let i = 0; i < 4; i++) B.add(new THREE.ConeGeometry(0.025, 0.14, 5).rotateZ(Math.PI / 2), 0xf08a2c, M(2.33 + i * 0.05, 0.86, -1.42 + (i % 2) * 0.05, 0, i, 0));
  for (const [cx, cz, ry] of [[1.9, -2.15, 0], [2.9, -2.15, 0], [1.9, -0.65, Math.PI], [2.9, -0.65, Math.PI]]) {
    B.add(box(0.45, 0.05, 0.45), 0xb8834f, M(cx, 0.43, cz));
    for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) B.add(box(0.04, 0.43, 0.04), 0x7a5234, M(cx + lx, 0, cz + lz));
    B.add(box(0.45, 0.5, 0.05), 0xb8834f, M(cx, 0.48, cz + (ry ? 0.2 : -0.2)));
    solid(cx - 0.23, cx + 0.23, cz - 0.23, cz + 0.23, 0.48);
  }
  B.add(box(0.65, 0.9, 4.2), 0xf6f2ea, M(4.67, 0, -1.3));
  B.add(box(0.7, 0.05, 4.25), 0x9c6a44, M(4.65, 0.9, -1.3));
  for (let z = -3.1; z < 0.8; z += 0.6) B.add(box(0.02, 0.6, 0.5), 0xe9e2d4, M(4.33, 0.15, z + 0.25), { vary: 0 });
  B.add(box(0.5, 0.08, 0.6), 0xb3ada2, M(4.65, 0.93, -0.4));
  B.add(box(0.7, 1.9, 0.75), 0xe9f2f4, M(4.65, 0, 1.3));
  solid(4.3, 5, -3.45, 0.85); solid(4.28, 5, 0.9, 1.7);
  for (const [px, pz] of [[4.4, 3.0], [-4.5, 3.0]]) {
    B.add(cyl(0.2, 0.15, 0.35, 9), 0xc7683f, M(px, 0, pz));
    for (let i = 0; i < 5; i++) B.add(jitter(new THREE.IcosahedronGeometry(0.22, 0), 0.06, rand), 0x4f9a3f, M(px + (rand() - 0.5) * 0.3, 0.5 + i * 0.12, pz + (rand() - 0.5) * 0.3));
    solid(px - 0.22, px + 0.22, pz - 0.22, pz + 0.22);
  }

  B.build(scene, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }));
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a6a4a, 1.3));
  const sun = new THREE.DirectionalLight(0xfff0d2, 1.6);
  sun.position.set(1, 5, -7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 20 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const collider = makeCollider(solids);
  return {
    scene, solids, ...collider,
    spawn: new THREE.Vector3(0, 0, Z1 - 0.9),
    exit: { pos: new THREE.Vector3(0, 0, Z1 - 0.55) },
    bananaSpot: new THREE.Vector3(-3, 0.42, -2.78),
    update() {},
  };
}
