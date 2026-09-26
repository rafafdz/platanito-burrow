import * as THREE from 'three';
import { rng, Batch, M, box, cyl, cone, jitter } from './world.js';

// The burrow network lives in its own scene. Layout is a grid maze (recursive
// backtracker + a few extra openings for loops), fully determined by the seed.
export const TUNNEL = { cols: 8, rows: 8, cell: 2.4, half: 0.62, height: 1.15 };

export function generateTunnels(seed, cols = TUNNEL.cols, rows = TUNNEL.rows) {
  const rand = rng(seed);
  const n = cols * rows;
  const id = (c, r) => r * cols + c;
  const links = Array.from({ length: n }, () => new Set());
  const link = (a, b) => { links[a].add(b); links[b].add(a); };
  const nbrs = (i) => {
    const c = i % cols, r = Math.floor(i / cols), out = [];
    if (c > 0) out.push(i - 1);
    if (c < cols - 1) out.push(i + 1);
    if (r > 0) out.push(i - cols);
    if (r < rows - 1) out.push(i + cols);
    return out;
  };

  const entranceCells = [id(0, rows - 1), id(cols - 1, 0)];
  const seen = new Uint8Array(n);
  const stack = [entranceCells[0]];
  seen[stack[0]] = 1;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const opts = nbrs(cur).filter((x) => !seen[x]);
    if (!opts.length) { stack.pop(); continue; }
    const next = opts[Math.floor(rand() * opts.length)];
    link(cur, next);
    seen[next] = 1;
    stack.push(next);
  }
  // extra openings create loops, so the burrow branches rather than being one long corridor
  for (let extra = 0, guard = 0; extra < 6 && guard < 500; guard++) {
    const a = Math.floor(rand() * n);
    const closed = nbrs(a).filter((x) => !links[a].has(x));
    if (!closed.length) continue;
    link(a, closed[Math.floor(rand() * closed.length)]);
    extra++;
  }

  const bfs = (start) => {
    const d = new Array(n).fill(-1);
    d[start] = 0;
    const q = [start];
    while (q.length) {
      const x = q.shift();
      for (const y of links[x]) if (d[y] < 0) { d[y] = d[x] + 1; q.push(y); }
    }
    return d;
  };
  const dA = bfs(entranceCells[0]), dB = bfs(entranceCells[1]);
  const score = (i) => Math.min(dA[i], dB[i]);

  // platanitos hide in dead ends far from both exits
  const cand = [...Array(n).keys()].filter((i) => !entranceCells.includes(i) && score(i) >= 2);
  cand.sort((a, b) => (links[b].size === 1) - (links[a].size === 1) || score(b) - score(a) || a - b);
  const bananaCells = [];
  for (const i of cand) {
    if (bananaCells.length >= 5) break;
    if (nbrs(i).some((x) => bananaCells.includes(x))) continue;
    bananaCells.push(i);
  }
  for (const i of cand) if (bananaCells.length < 5 && !bananaCells.includes(i)) bananaCells.push(i);

  const degree = links.map((s) => s.size);
  return {
    seed, cols, rows,
    links: links.map((s) => [...s].sort((a, b) => a - b)),
    entranceCells, bananaCells,
    connected: dA.every((v) => v >= 0),
    junctions: degree.filter((d) => d >= 3).length,
    deadEnds: degree.filter((d) => d === 1).length,
    longestPath: Math.max(...dA),
  };
}

export function buildUnderground(seed, entrances) {
  const T = generateTunnels(seed);
  const { cell: S, half: H, height: WH } = TUNNEL;
  const rand = rng(seed ^ 0x5eed);
  const x0 = (-T.cols * S) / 2, z0 = (-T.rows * S) / 2;
  const center = (i) => new THREE.Vector3(x0 + ((i % T.cols) + 0.5) * S, 0, z0 + (Math.floor(i / T.cols) + 0.5) * S);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b120b);
  scene.fog = new THREE.Fog(0x1b120b, 1.2, 10);
  scene.add(new THREE.HemisphereLight(0xffd9a8, 0x3a2414, 0.9));
  const catLight = new THREE.PointLight(0xffc98a, 2.4, 5.5, 1.4);
  scene.add(catLight);

  const B = new Batch(rand);
  const glow = new Batch(rand);
  const solids = [];
  const wallCols = [0x6b4428, 0x5c3a22, 0x7a5030];
  const addWall = (minX, maxX, minZ, maxZ) => {
    solids.push({ type: 1, minX, maxX, minZ, maxZ, top: Infinity });
    const w = maxX - minX, d = maxZ - minZ;
    B.add(box(w, WH + 0.1, d), wallCols[Math.floor(rand() * 3)], M((minX + maxX) / 2, -0.05, (minZ + maxZ) / 2), { vary: 0.1 });
  };

  for (let i = 0; i < T.cols * T.rows; i++) {
    const c = center(i), col = i % T.cols, row = Math.floor(i / T.cols);
    const L = new Set(T.links[i]);
    const l = c.x - S / 2, r = c.x + S / 2, t = c.z - S / 2, b = c.z + S / 2;
    addWall(l, c.x - H, t, c.z - H); addWall(c.x + H, r, t, c.z - H);
    addWall(l, c.x - H, c.z + H, b); addWall(c.x + H, r, c.z + H, b);
    if (!(row > 0 && L.has(i - T.cols))) addWall(c.x - H, c.x + H, t, c.z - H);
    if (!(row < T.rows - 1 && L.has(i + T.cols))) addWall(c.x - H, c.x + H, c.z + H, b);
    if (!(col > 0 && L.has(i - 1))) addWall(l, c.x - H, c.z - H, c.z + H);
    if (!(col < T.cols - 1 && L.has(i + 1))) addWall(c.x + H, r, c.z - H, c.z + H);

    // lumpy rocks along the walls, pebbles, and roots hanging from the ceiling
    for (let k = 0; k < 4; k++) {
      if (rand() < 0.35) continue;
      // tucked into the corners, where they never block a passage
      const a = Math.PI / 4 + k * (Math.PI / 2) + (rand() - 0.5) * 0.3, px = c.x + Math.cos(a) * H * 1.2, pz = c.z + Math.sin(a) * H * 1.2;
      const s = 0.1 + rand() * 0.12;
      B.add(jitter(new THREE.DodecahedronGeometry(s, 0), s * 0.4, rand), rand() > 0.5 ? 0x8a7a68 : 0x6e5a48, M(px, s * 0.3, pz, rand(), rand(), 0));
    }
    for (let k = 0; k < 2 + Math.floor(rand() * 3); k++) {
      const px = c.x + (rand() - 0.5) * H * 1.6, pz = c.z + (rand() - 0.5) * H * 1.6, len = 0.15 + rand() * 0.35;
      B.add(cone(0.012 + rand() * 0.01, len, 4), 0xa47a4c, M(px, WH, pz, Math.PI + (rand() - 0.5) * 0.4, 0, (rand() - 0.5) * 0.4), { cast: false });
    }
    if (rand() < 0.4) {
      const a = rand() * Math.PI * 2, px = c.x + Math.cos(a) * (H - 0.12), pz = c.z + Math.sin(a) * (H - 0.12);
      const capCol = rand() > 0.5 ? 0x7ff0e0 : 0xff9ad8;
      for (let k = 0; k < 3; k++) {
        const mx = px + (rand() - 0.5) * 0.18, mz = pz + (rand() - 0.5) * 0.18, h = 0.05 + rand() * 0.07;
        B.add(cyl(0.01, 0.013, h, 5), 0xe8dcc6, M(mx, 0, mz));
        glow.add(new THREE.SphereGeometry(0.035 + rand() * 0.02, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), capCol, M(mx, h, mz), { cast: false, vary: 0.05 });
      }
    }
    // timber props at junctions
    if (L.size >= 3) {
      for (const [dx, dz] of [[-1, -1], [1, 1]]) {
        B.add(box(0.08, WH, 0.08), 0x8a6038, M(c.x + dx * (H - 0.04), 0, c.z + dz * (H - 0.04)));
      }
      B.add(box(H * 2.3, 0.07, 0.08), 0x7a5234, M(c.x, WH - 0.1, c.z - H + 0.04));
    }
  }

  // floor and ceiling
  const W = T.cols * S, D = T.rows * S;
  const floor = new THREE.PlaneGeometry(W, D, T.cols * 5, T.rows * 5).rotateX(-Math.PI / 2);
  jitter(floor, 0.03, rand);
  B.add(floor, 0x8a6038, M(0, 0, 0), { cast: false, vary: 0.08 });
  const ceil = new THREE.PlaneGeometry(W, D, T.cols * 4, T.rows * 4).rotateX(Math.PI / 2);
  jitter(ceil, 0.08, rand);
  B.add(ceil, 0x4a2e1a, M(0, WH, 0), { cast: false, vary: 0.1 });

  // exits: shafts of daylight under each surface entrance
  const exits = [];
  T.entranceCells.forEach((cellIdx, k) => {
    const c = center(cellIdx);
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.55, WH, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    shaft.position.set(c.x, WH / 2, c.z);
    scene.add(shaft);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.55, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.18, depthWrite: false, fog: false }));
    pool.position.set(c.x, 0.03, c.z);
    scene.add(pool);
    const sky = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xcfeaff, fog: false }));
    sky.position.set(c.x, WH - 0.01, c.z);
    scene.add(sky);
    for (let g = 0; g < 10; g++) {
      const a = (g / 10) * Math.PI * 2;
      B.add(cone(0.02, 0.18 + rand() * 0.1, 3), 0x5fae3f, M(c.x + Math.cos(a) * 0.32, WH, c.z + Math.sin(a) * 0.32, Math.PI, 0, 0), { cast: false });
    }
    const light = new THREE.PointLight(0xfff0c0, 3, 4.5, 1.2);
    light.position.set(c.x, WH - 0.2, c.z);
    scene.add(light);
    // face the first open corridor when arriving
    const nb = T.links[cellIdx][0], nc = center(nb);
    const face = Math.atan2(-(nc.x - c.x), -(nc.z - c.z));
    const spawn = c.clone().add(nc.clone().sub(c).setLength(0.95)); // step out of the light shaft
    exits.push({ index: k, cell: cellIdx, pos: c, spawn, yaw: face, name: entrances[k]?.name ?? `Exit ${k + 1}`, shaft });
  });

  B.build(scene, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
  glow.build(scene, new THREE.MeshBasicMaterial({ vertexColors: true }));
  scene.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  function resolve(p, r) {
    for (let iter = 0; iter < 3; iter++) {
      for (const s of solids) {
        const cx = Math.max(s.minX, Math.min(s.maxX, p.x)), cz = Math.max(s.minZ, Math.min(s.maxZ, p.z));
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
  const isFree = (x, z, pad = 0.1) => !solids.some((s) => x > s.minX - pad && x < s.maxX + pad && z > s.minZ - pad && z < s.maxZ + pad);

  function update(t, camPos) {
    catLight.position.set(camPos.x, camPos.y + 0.25, camPos.z);
    for (const e of exits) e.shaft.material.opacity = 0.17 + Math.sin(t * 1.3 + e.index) * 0.04;
  }

  return {
    scene, layout: T, solids, exits, center,
    bananaSpots: T.bananaCells.map((i) => center(i)),
    resolve, isFree, update,
    floorAt: () => 0, groundHeight: () => 0,
  };
}
