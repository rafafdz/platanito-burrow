// Smoke test: boots the Vite dev server, checks HTTP, then drives the game in headless Chromium
// through the window.__game debug hook. Run with `npm test`.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { generateTunnels } from '../src/underground.js';

const results = [];
let failed = 0;
function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}

async function launchBrowser() {
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
  const candidates = [process.env.CHROMIUM_PATH];
  try { return await chromium.launch({ args }); } catch (e) {
    // fall back to any browser Playwright has already downloaded
    const root = join(homedir(), '.cache', 'ms-playwright');
    if (existsSync(root)) {
      for (const dir of readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
        for (const sub of ['chrome-linux64', 'chrome-linux']) candidates.push(join(root, dir, sub, 'chrome'));
      }
    }
    for (const exe of candidates.filter(Boolean)) {
      if (existsSync(exe)) return chromium.launch({ executablePath: exe, args });
    }
    throw e;
  }
}

// ---------------------------------------------------------------- pure checks (no browser)
{
  const a = generateTunnels(1234), b = generateTunnels(1234), c = generateTunnels(99);
  check('tunnels are deterministic for a seed', JSON.stringify(a) === JSON.stringify(b));
  check('different seeds give different tunnels', JSON.stringify(a.links) !== JSON.stringify(c.links));
  check('tunnels are fully connected', a.connected && c.connected);
  check('tunnels branch (>=2 junctions, >=2 dead ends)', a.junctions >= 2 && a.deadEnds >= 2, `junctions=${a.junctions} deadEnds=${a.deadEnds}`);
  check('tunnels wind (longest path >= 12 cells)', a.longestPath >= 12, `longest=${a.longestPath}`);
  check('5 underground banana cells', a.bananaCells.length === 5 && new Set(a.bananaCells).size === 5);
}

// ---------------------------------------------------------------- server + HTTP
const server = await createServer({ root: new URL('..', import.meta.url).pathname, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls.local[0];
let browser;
try {
  const res = await fetch(url);
  const html = await res.text();
  check('HTTP GET / returns 200', res.status === 200, `${res.status} ${url}`);
  check('page has the game title', html.includes('<title>Platanito Burrow</title>'));
  check('page mentions rabbit music', /rabbit music/i.test(html));
  const js = await fetch(new URL('src/main.js', url));
  check('HTTP GET /src/main.js returns 200', js.status === 200, String(js.status));

  // ---------------------------------------------------------------- browser
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const src = m.location()?.url ?? '';
    if (/fonts\.(googleapis|gstatic)\.com/.test(src)) return; // optional web font, may be offline
    errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.debug, null, { timeout: 180000 });

  const d0 = await page.evaluate(() => window.__game.debug());
  check('exactly 10 bananas', d0.bananas.total === 10, `total=${d0.bananas.total}`);
  check('bananas split 5 surface / 5 burrow', d0.bananas.surface === 5 && d0.bananas.burrow === 5, `${d0.bananas.surface}/${d0.bananas.burrow}`);
  check('surface has visible and buried bananas', d0.bananas.list.some((b) => b.kind === 'buried') && d0.bananas.list.some((b) => b.zone === 'surface' && b.kind === 'visible'));
  check('HUD starts at 0/10', d0.hud.count === '0/10', d0.hud.count);
  check('at least 2 tunnel entrances', d0.entrances.length >= 2, `entrances=${d0.entrances.length}`);
  check('tunnel exits match entrances', d0.tunnels.exits === d0.entrances.length);
  check('rabbit is in the garden scene and visible', d0.rabbit.inScene && d0.rabbit.visible);
  check('music is gated until Start', d0.music.started === false && d0.music.playing === false);
  check('starts on the surface', d0.zone === 'surface' && d0.hud.zone === 'Surface', d0.hud.zone);

  const d1 = await page.evaluate(() => { window.__game.startPlay(); return window.__game.debug(); });
  check('rabbit music plays after Start', d1.music.started && d1.music.playing && !d1.music.muted);

  const rab = await page.evaluate(() => {
    const g = window.__game, before = g.rabbit.group.position.clone();
    g.step(900);
    const after = g.rabbit.group.position.clone();
    // third-person look at the rabbit from 1.6 m away
    g.G.state = 'debug';
    g.camera.position.set(after.x + 1.2, after.y + 0.7, after.z + 1.0);
    g.camera.lookAt(after.x, after.y + 0.15, after.z);
    g.camera.updateMatrixWorld();
    const ndc = after.clone().setY(after.y + 0.15).project(g.camera);
    g.G.state = 'play';
    return { moved: before.distanceTo(after), hops: g.rabbit.hops, ndc: [ndc.x, ndc.y, ndc.z], homeDist: after.distanceTo(g.rabbit.home) };
  });
  check('rabbit wanders (hops and moves)', rab.hops > 0, `hops=${rab.hops} moved=${rab.moved.toFixed(2)}m`);
  check('rabbit stays near its burrow', rab.homeDist < 5, `${rab.homeDist.toFixed(2)}m from home`);
  check('rabbit is on-screen in a third-person view', Math.abs(rab.ndc[0]) < 1 && Math.abs(rab.ndc[1]) < 1 && rab.ndc[2] < 1);

  const enter = await page.evaluate(() => {
    const g = window.__game, e = g.world.entrances[0];
    g.cat.pos.set(e.door.x, 0, e.door.z);
    g.cat.feetY = g.world.floorAt(e.door.x, e.door.z, 1);
    g.step(2);
    const it = g.currentInteraction();
    g.interact();
    return { it: it && it.type, d: g.debug(), worldIsUnderground: g.cat.world === g.underground };
  });
  check('entrance offers "enter" interaction', enter.it === 'enter', enter.it);
  check('entering switches to the burrow zone', enter.d.zone === 'burrow' && enter.worldIsUnderground);
  check('HUD says Burrow underground', enter.d.hud.zone === 'Burrow', enter.d.hud.zone);

  const walk = await page.evaluate(() => {
    const g = window.__game, L = g.underground.layout;
    const start = g.underground.exits[0].cell, goal = L.bananaCells[0];
    // BFS path through the generated passages
    const prev = new Map([[start, -1]]), q = [start];
    while (q.length) { const x = q.shift(); for (const y of L.links[x]) if (!prev.has(y)) { prev.set(y, x); q.push(y); } }
    const path = []; for (let c = goal; c !== -1; c = prev.get(c)) path.unshift(c);
    // walk it for real with the cat controller and collisions
    // walk straight into a closed side of the start cell for 2 s: the cat must stay in the cell
    const wallHit = (() => {
      const c = g.underground.center(start);
      const col = start % L.cols, row = Math.floor(start / L.cols);
      const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      const [dx, dz] = dirs.find(([x, z]) => {
        const nc = col + x, nr = row + z;
        return nc < 0 || nr < 0 || nc >= L.cols || nr >= L.rows || !L.links[start].includes(nr * L.cols + nc);
      });
      g.cat.pos.set(c.x, 0, c.z);
      g.cat.yaw = Math.atan2(-dx, -dz);
      g.input.KeyW = true; g.step(120); g.input.KeyW = false; g.step(5);
      const moved = Math.max(Math.abs(g.cat.pos.x - c.x), Math.abs(g.cat.pos.z - c.z));
      g.cat.pos.set(c.x, 0, c.z);
      return moved < 0.62 && moved > 0.3; // walked up to the wall, not through it
    })();
    const before = g.G.collected;
    g.input.KeyW = true;
    let steps = 0;
    for (const cell of path.slice(1)) {
      const t = g.underground.center(cell);
      for (let i = 0; i < 400; i++) {
        const dx = t.x - g.cat.pos.x, dz = t.z - g.cat.pos.z;
        if (Math.hypot(dx, dz) < 0.25) break;
        g.cat.yaw = Math.atan2(-dx, -dz);
        g.step(1); steps++;
      }
    }
    g.input.KeyW = false;
    g.step(10);
    const end = g.underground.center(goal);
    return { pathLen: path.length, steps, reached: Math.hypot(end.x - g.cat.pos.x, end.z - g.cat.pos.z) < 0.4, gained: g.G.collected - before, wallHit, d: g.debug() };
  });
  check('walked a winding tunnel path to a dead end', walk.reached, `${walk.pathLen} cells, ${walk.steps} frames`);
  check('tunnel walls block movement', walk.wallHit);
  check('underground banana collected by walking into it', walk.gained === 1 && walk.d.hud.count === '1/10', walk.d.hud.count);

  const exit = await page.evaluate(() => {
    const g = window.__game, ex = g.underground.exits[1];
    g.cat.pos.set(ex.pos.x, 0, ex.pos.z);
    g.step(2);
    const it = g.currentInteraction();
    g.interact();
    const e = g.world.entrances[1];
    return { it: it && it.type, d: g.debug(), dist: Math.hypot(g.cat.pos.x - e.door.x, g.cat.pos.z - e.door.z) };
  });
  check('burrow exit offers "exit" interaction', exit.it === 'exit', exit.it);
  check('exiting returns to the surface at the linked entrance', exit.d.zone === 'surface' && exit.d.hud.zone === 'Surface' && exit.dist < 1, `dist=${exit.dist.toFixed(2)}`);

  const win = await page.evaluate(() => {
    const g = window.__game, out = [];
    for (const b of g.bananas) {
      if (b.collected) continue;
      g.collect(b);
      out.push({ n: g.G.collected, won: g.G.won });
    }
    return { out, d: g.debug() };
  });
  const nine = win.out.find((o) => o.n === 9), ten = win.out.find((o) => o.n === 10);
  check('not won at 9/10', nine && nine.won === false);
  check('won exactly at 10/10', ten && ten.won === true && win.d.hud.count === '10/10', win.d.hud.count);

  check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) {
  check('smoke test ran without exceptions', false, e.stack || String(e));
} finally {
  await browser?.close();
  await server.close();
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
