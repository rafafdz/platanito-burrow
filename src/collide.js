// Collision for self-contained zones (the house interior). Solids are axis-aligned boxes
// { minX, maxX, minZ, maxZ, top }: anything with a finite top can be hopped onto.
export const STEP = 0.12;

export function makeCollider(solids, ground = () => 0) {
  const inside = (s, x, z, m = 0) => x > s.minX - m && x < s.maxX + m && z > s.minZ - m && z < s.maxZ + m;

  function floorAt(x, z, feetY) {
    let h = ground(x, z);
    for (const s of solids) if (Number.isFinite(s.top) && s.top <= feetY + STEP && inside(s, x, z, 0.05)) h = Math.max(h, s.top);
    return h;
  }

  function resolve(p, r, feetY = 0) {
    for (let iter = 0; iter < 3; iter++) {
      for (const s of solids) {
        if (feetY >= s.top - STEP) continue;
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

  const isFree = (x, z, pad = 0.1) => !solids.some((s) => inside(s, x, z, pad));
  return { floorAt, resolve, isFree, groundHeight: ground };
}
