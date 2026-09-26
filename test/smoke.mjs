// Smoke test: boots the Vite dev server, checks HTTP, then drives the game in headless Chromium
// through the window.__game debug hook. Run with `npm test`.
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
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

// ---------------------------------------------------------------- the player is a rabbit, not a cat
{
  const root = new URL('..', import.meta.url);
  const files = ['index.html', 'README.md', 'src/main.js', 'src/player.js', 'src/entities.js', 'src/audio.js', 'src/world.js', 'src/house.js'];
  const hits = files.flatMap((f) => {
    const text = readFileSync(new URL(f, root), 'utf8');
    return [...text.matchAll(/\b(cats?|kitty|kitten|meow\w*|kibble|feline|purr\w*|pounce\w*|toe beans?)\b/gi)].map((m) => `${f}: ${m[0]}`);
  });
  check('no cat presentation left in UI, README or game code', hits.length === 0, hits.slice(0, 6).join(', '));
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
  check('page describes the soundtrack sections', /Platanito&#39;s Garden/.test(html) && /garden, the house and the burrow/.test(html));
  check('page is set up for phones (viewport-fit, no zoom)', /viewport-fit=cover/.test(html) && /user-scalable=no/.test(html));
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
  check('bananas split 4 garden / 1 house / 5 burrow', d0.bananas.surface === 4 && d0.bananas.house === 1 && d0.bananas.burrow === 5, `${d0.bananas.surface}/${d0.bananas.house}/${d0.bananas.burrow}`);
  check('player is a rabbit (paws + ears in first person)', d0.player.species === 'rabbit' && d0.player.ears === 2 && d0.player.paws === 2, JSON.stringify(d0.player));
  check('page presents a rabbit', /white rabbit with black spots/i.test(html));
  check('surface has visible and buried bananas', d0.bananas.list.some((b) => b.kind === 'buried') && d0.bananas.list.some((b) => b.zone === 'surface' && b.kind === 'visible'));
  check('HUD starts at 0/10', d0.hud.count === '0/10', d0.hud.count);
  check('at least 2 tunnel entrances', d0.entrances.length >= 2, `entrances=${d0.entrances.length}`);
  check('tunnel exits match entrances', d0.tunnels.exits === d0.entrances.length);
  check('NPC Canela is in the garden scene and visible', d0.npc.name === 'Canela' && d0.npc.inScene && d0.npc.visible);
  check('music is gated until Start', d0.music.started === false && d0.music.playing === false);
  check('starts on the surface', d0.zone === 'surface' && d0.hud.zone === 'Surface', d0.hud.zone);

  const d1 = await page.evaluate(() => { window.__game.startPlay(); return window.__game.debug(); });
  check('rabbit music plays after Start', d1.music.started && d1.music.playing && !d1.music.muted);

  check('soundtrack has Garden / House / Burrow sections', JSON.stringify(d1.music.sections) === '["garden","house","burrow"]' && d1.music.key === 'C major' && d1.music.bpm === 92, JSON.stringify(d1.music.sections));
  check('touch controls stay hidden on desktop', d1.touch.enabled === false && d1.touch.visible === false);
  const previews = await page.evaluate(async () => {
    const out = [];
    for (const s of ['garden', 'house', 'burrow']) out.push(await window.__game.renderMusicPreview(s, 6));
    return out;
  });
  for (const p of previews) {
    check(`music "${p.section}" renders at a moderate level in stereo`, p.peak > 0.03 && p.peak < 0.8 && p.rmsDb > -45 && p.rmsDb < -12 && p.stereoDiff > 0, `peak=${p.peak} rms=${p.rmsDb}dB stereo=${p.stereoDiff}`);
  }
  const sect = await page.evaluate(async () => {
    const g = window.__game, wait = (f) => new Promise((res) => { const t0 = performance.now(); const i = setInterval(() => { if (f() || performance.now() - t0 > 8000) { clearInterval(i); res(f()); } }, 50); });
    const out = {};
    g.enterHouse(); out.house = await wait(() => g.sound.music.section === 'house');
    g.enterBurrow(0); out.burrow = await wait(() => g.sound.music.section === 'burrow');
    g.exitBurrow(0); out.garden = await wait(() => g.sound.music.section === 'garden');
    out.stepAdvanced = g.sound.music.step > 0;
    return out;
  });
  check('music section follows the zone (house, burrow, back to garden)', sect.house && sect.burrow && sect.garden && sect.stepAdvanced, JSON.stringify(sect));

  const rab = await page.evaluate(() => {
    const g = window.__game, before = g.npc.group.position.clone();
    g.step(900);
    const after = g.npc.group.position.clone();
    // third-person look at the NPC from 1.6 m away
    g.G.state = 'debug';
    g.camera.position.set(after.x + 1.2, after.y + 0.7, after.z + 1.0);
    g.camera.lookAt(after.x, after.y + 0.15, after.z);
    g.camera.updateMatrixWorld();
    const ndc = after.clone().setY(after.y + 0.15).project(g.camera);
    g.G.state = 'play';
    return { moved: before.distanceTo(after), hops: g.npc.hops, ndc: [ndc.x, ndc.y, ndc.z], homeDist: after.distanceTo(g.npc.home) };
  });
  check('NPC rabbit wanders (hops and moves)', rab.hops > 0, `hops=${rab.hops} moved=${rab.moved.toFixed(2)}m`);
  check('NPC rabbit stays near its burrow', rab.homeDist < 5, `${rab.homeDist.toFixed(2)}m from home`);
  check('NPC rabbit is on-screen in a third-person view', Math.abs(rab.ndc[0]) < 1 && Math.abs(rab.ndc[1]) < 1 && rab.ndc[2] < 1);

  const enter = await page.evaluate(() => {
    const g = window.__game, e = g.world.entrances[0];
    g.player.pos.set(e.door.x, 0, e.door.z);
    g.player.feetY = g.world.floorAt(e.door.x, e.door.z, 1);
    g.step(2);
    const it = g.currentInteraction();
    g.interact();
    return { it: it && it.type, d: g.debug(), worldIsUnderground: g.player.world === g.underground };
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
    // walk it for real with the player controller and collisions
    // walk straight into a closed side of the start cell for 2 s: the player must stay in the cell
    const wallHit = (() => {
      const c = g.underground.center(start);
      const col = start % L.cols, row = Math.floor(start / L.cols);
      const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      const [dx, dz] = dirs.find(([x, z]) => {
        const nc = col + x, nr = row + z;
        return nc < 0 || nr < 0 || nc >= L.cols || nr >= L.rows || !L.links[start].includes(nr * L.cols + nc);
      });
      g.player.pos.set(c.x, 0, c.z);
      g.player.yaw = Math.atan2(-dx, -dz);
      g.input.KeyW = true; g.step(120); g.input.KeyW = false; g.step(5);
      const moved = Math.max(Math.abs(g.player.pos.x - c.x), Math.abs(g.player.pos.z - c.z));
      g.player.pos.set(c.x, 0, c.z);
      return moved < 0.62 && moved > 0.3; // walked up to the wall, not through it
    })();
    const before = g.G.collected;
    g.input.KeyW = true;
    let steps = 0;
    for (const cell of path.slice(1)) {
      const t = g.underground.center(cell);
      for (let i = 0; i < 400; i++) {
        const dx = t.x - g.player.pos.x, dz = t.z - g.player.pos.z;
        if (Math.hypot(dx, dz) < 0.25) break;
        g.player.yaw = Math.atan2(-dx, -dz);
        g.step(1); steps++;
      }
    }
    g.input.KeyW = false;
    g.step(10);
    const end = g.underground.center(goal);
    return { pathLen: path.length, steps, reached: Math.hypot(end.x - g.player.pos.x, end.z - g.player.pos.z) < 0.4, gained: g.G.collected - before, wallHit, d: g.debug() };
  });
  check('walked a winding tunnel path to a dead end', walk.reached, `${walk.pathLen} cells, ${walk.steps} frames`);
  check('tunnel walls block movement', walk.wallHit);
  check('underground banana collected by walking into it', walk.gained === 1 && walk.d.hud.count === '1/10', walk.d.hud.count);

  const exit = await page.evaluate(() => {
    const g = window.__game, ex = g.underground.exits[1];
    g.player.pos.set(ex.pos.x, 0, ex.pos.z);
    g.step(2);
    const it = g.currentInteraction();
    g.interact();
    const e = g.world.entrances[1];
    return { it: it && it.type, d: g.debug(), dist: Math.hypot(g.player.pos.x - e.door.x, g.player.pos.z - e.door.z) };
  });
  check('burrow exit offers "exit" interaction', exit.it === 'exit', exit.it);
  check('exiting returns to the surface at the linked entrance', exit.d.zone === 'surface' && exit.d.hud.zone === 'Surface' && exit.dist < 1, `dist=${exit.dist.toFixed(2)}`);

  const houseRun = await page.evaluate(() => {
    const g = window.__game, door = g.debug().houseDoor;
    g.player.pos.set(door[0], 0, door[2] + 0.7);
    g.player.feetY = g.world.floorAt(g.player.pos.x, g.player.pos.z, 1);
    g.step(2);
    const it = g.currentInteraction();
    g.interact();
    const inside = g.debug();
    // hop onto the sofa for the platanito: stand between coffee table and sofa, face it, hop forward
    const before = g.G.collected;
    g.player.pos.set(-3, 0, -2.2); g.player.feetY = 0; g.player.yaw = 0;
    g.input.KeyW = true; g.step(5); g.player.hop(); g.step(60); g.input.KeyW = false; g.step(10);
    const onSofa = g.player.feetY;
    const gained = g.G.collected - before;
    // leave through the open front door
    g.player.pos.set(g.house.exit.pos.x, 0, g.house.exit.pos.z); g.player.feetY = 0;
    g.step(2);
    const out = g.currentInteraction();
    g.interact();
    return { it: it && it.type, inside, onSofa, gained, out: out && out.type, after: g.debug() };
  });
  check('front door offers "go inside"', houseRun.it === 'enterHouse', houseRun.it);
  check('entering the house switches zone and HUD to House', houseRun.inside.zone === 'house' && houseRun.inside.hud.zone === 'House', houseRun.inside.hud.zone);
  check('rabbit hops onto the sofa and collects the house platanito', houseRun.gained === 1 && houseRun.onSofa > 0.4, `feetY=${houseRun.onSofa.toFixed(2)}`);
  check('leaving the house returns to the surface', houseRun.out === 'leaveHouse' && houseRun.after.zone === 'surface' && houseRun.after.hud.zone === 'Surface');

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

  // ---------------------------------------------------------------- mobile (touch only, no keyboard/mouse)
  await page.close(); // free the software GPU for the mobile run
  const mctx = await browser.newContext({ ...devices['Pixel 7'] });
  const m = await mctx.newPage();
  const merrors = [];
  m.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (/fonts\.(googleapis|gstatic)\.com/.test(msg.location()?.url ?? '')) return;
    merrors.push(msg.text());
  });
  m.on('pageerror', (e) => merrors.push(`pageerror: ${e.message}`));
  await m.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await m.waitForFunction(() => window.__game?.debug, null, { timeout: 180000 });
  const mt0 = await m.evaluate(() => ({ touch: document.body.classList.contains('touch'), dpr: window.__game.renderer.getPixelRatio(), touchHelp: getComputedStyle(document.querySelector('.controls.touch-only')).display }));
  check('mobile: touch mode detected, touch help shown on title', mt0.touch && mt0.touchHelp !== 'none', JSON.stringify(mt0));
  check('mobile: renderer pixel ratio capped for performance', mt0.dpr <= 1.25, `dpr=${mt0.dpr}`);
  await m.tap('#play');
  await m.waitForFunction(() => window.__game.G.state === 'play', null, { timeout: 20000 });
  const mt1 = await m.evaluate(() => ({ lock: !!document.pointerLockElement, noLock: window.__game.G.noLock, d: window.__game.debug() }));
  check('mobile: Start works with a tap and skips pointer lock', !mt1.lock && mt1.noLock && mt1.d.state === 'play' && mt1.d.touch.visible, JSON.stringify({ lock: mt1.lock, state: mt1.d.state }));
  check('mobile: rabbit music started from the tap', mt1.d.music.started && mt1.d.music.playing);

  const layout = () => m.evaluate(() => {
    const ids = ['#stickBase', '#btnHop', '#btnAct', '#btnSneak', '#btnSniff', '#btnThump', '#btnPause'];
    const hud = ['.bananas', '.counters', '#zone', '.meters'];
    const vw = innerWidth, vh = innerHeight;
    const rect = (sel) => document.querySelector(sel).getBoundingClientRect();
    const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const controls = ids.map((sel) => {
      const r = rect(sel), el = document.querySelector(sel);
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { sel, w: Math.round(r.width), inView: r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh && r.width > 0,
        onTop: sel === '#stickBase' ? true : !!hit && (hit === el || el.contains(hit)), visible: getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none' };
    });
    const clashes = [];
    for (const c of ids) for (const h of hud) if (overlap(rect(c), rect(h))) clashes.push(`${c}~${h}`);
    return { vw, vh, controls, clashes };
  });
  for (const [label, size] of [['portrait', null], ['landscape', { width: 915, height: 412 }]]) {
    if (size) { await m.setViewportSize(size); await m.waitForTimeout(600); }
    const L = await layout();
    const bad = L.controls.filter((c) => !c.inView || !c.onTop || !c.visible);
    check(`mobile ${label} (${L.vw}x${L.vh}): all touch controls visible, on screen and tappable`, bad.length === 0, bad.map((c) => JSON.stringify(c)).join(' ') || L.controls.map((c) => `${c.sel}:${c.w}px`).join(' '));
    check(`mobile ${label}: touch controls don't cover the HUD`, L.clashes.length === 0, L.clashes.join(', '));
  }
  await m.setViewportSize({ width: 412, height: 915 });
  await m.waitForTimeout(400);

  // drive the rabbit with touch only: joystick, look drag, buttons
  const pt = (sel, type, x, y, id = 7) => m.evaluate(({ sel, type, x, y, id }) => {
    document.querySelector(sel).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
  }, { sel, type, x, y, id });
  const p0 = await m.evaluate(() => { const g = window.__game; g.player.pos.set(0, 0, 2); g.player.feetY = g.world.floorAt(0, 2, 1); g.player.yaw = Math.PI; return [g.player.pos.x, g.player.pos.z, g.player.yaw]; });
  await pt('#moveZone', 'pointerdown', 90, 760);
  await pt('#moveZone', 'pointermove', 90, 700);
  const moved = await m.evaluate(() => { const g = window.__game; const ax = [g.input.axisX, g.input.axisY]; g.step(60); return { ax, pos: [g.player.pos.x, g.player.pos.z] }; });
  await pt('#moveZone', 'pointerup', 90, 700);
  const dist = Math.hypot(moved.pos[0] - p0[0], moved.pos[1] - p0[1]);
  check('mobile: left joystick moves the rabbit forward', dist > 0.8 && moved.ax[1] < -0.5 && moved.pos[1] > p0[1], `moved ${dist.toFixed(2)}m, axis=${moved.ax.map((v) => (v ?? 0).toFixed(2))}`);
  await pt('#lookZone', 'pointerdown', 250, 420, 8);
  await pt('#lookZone', 'pointermove', 330, 420, 8);
  await pt('#lookZone', 'pointerup', 330, 420, 8);
  const yaw1 = await m.evaluate(() => window.__game.player.yaw);
  check('mobile: right-side drag turns the camera', Math.abs(yaw1 - p0[2]) > 0.1, `yaw ${p0[2].toFixed(2)} -> ${yaw1.toFixed(2)}`);
  const hops0 = await m.evaluate(() => window.__game.player.hops || 0);
  await m.tap('#btnHop');
  const hop = await m.evaluate(() => window.__game.player.hops || 0);
  check('mobile: Hop button hops', hop === hops0 + 1, `hops ${hops0} -> ${hop}`);
  await m.tap('#btnSneak');
  const sneak = await m.evaluate(() => { window.__game.step(3); return { input: window.__game.input.touchSneak, crouch: window.__game.player.crouch }; });
  await m.tap('#btnSneak');
  check('mobile: Sneak button toggles sneaking', sneak.input === true && sneak.crouch === true);
  await m.tap('#btnSniff');
  check('mobile: Sniff button sniffs', await m.evaluate(() => window.__game.G.sniffCD > 0));
  await m.tap('#btnThump');
  check('mobile: Thump button thumps', await m.evaluate(() => document.querySelector('#toast .t-title').textContent === '*THUMP*'));
  const ready = await m.evaluate(() => { const g = window.__game, d = g.debug().houseDoor; g.player.pos.set(d[0], 0, d[2] + 0.6); g.player.feetY = g.world.floorAt(d[0], d[2] + 0.6, 1); g.step(2); const b = document.querySelector('#btnAct'); return { ready: b.classList.contains('ready'), label: document.querySelector('#btnActLabel').textContent }; });
  check('mobile: E button shows the available action', ready.ready && ready.label === 'Go inside the house', JSON.stringify(ready));
  await m.tap('#btnAct');
  const inHouse = await m.evaluate(() => window.__game.debug());
  check('mobile: E button takes the rabbit into the house', inHouse.zone === 'house' && inHouse.hud.zone === 'House');
  await m.evaluate(() => { const g = window.__game; g.player.pos.set(g.house.exit.pos.x, 0, g.house.exit.pos.z); g.step(2); });
  await m.tap('#btnAct');
  check('mobile: E button leaves the house again', await m.evaluate(() => window.__game.G.zone === 'surface'));
  await m.tap('#btnPause');
  const paused = await m.evaluate(() => ({ state: window.__game.G.state, overlay: !document.querySelector('#pause').classList.contains('hidden'), touch: window.__game.debug().touch.visible }));
  check('mobile: pause button pauses and hides the touch controls', paused.state === 'paused' && paused.overlay && !paused.touch, JSON.stringify(paused));
  await m.tap('#resume');
  check('mobile: resume with a tap', await m.evaluate(() => window.__game.G.state === 'play'));
  check('mobile: no console errors', merrors.length === 0, merrors.slice(0, 5).join(' | '));
  await mctx.close();
} catch (e) {
  check('smoke test ran without exceptions', false, e.stack || String(e));
} finally {
  await browser?.close();
  await server.close();
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
