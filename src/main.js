import * as THREE from 'three';
import { buildWorld, buildFoliage, rng, jitter } from './world.js';
import { buildUnderground } from './underground.js';
import { Cat } from './cat.js';
import { Birds, Butterflies, Ball, Particles, Rabbit, makeBanana } from './entities.js';
import { Sound } from './audio.js';

export const BANANA_TOTAL = 10;

// ---------------------------------------------------------------- seed
// The tunnel layout and which mounds hide bananas come from this seed (?seed=123 to change it).
const params = new URLSearchParams(location.search);
const seed = Number.parseInt(params.get('seed'), 10) || 20260926;

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.03, 600);

const world = buildWorld(scene);
const { flowerHeads } = buildFoliage(world);
const underground = buildUnderground(seed, world.entrances);
const cat = new Cat(world, camera);
const birds = new Birds(scene, world, 8);
const butterflies = new Butterflies(scene, world, flowerHeads, 12);
const ball = new Ball(scene, world);
const fxSurface = new Particles(scene);
const fxBurrow = new Particles(underground.scene);
const sound = new Sound();
const rabbitHole = world.entrances[1];
const rabbit = new Rabbit(scene, world, rabbitHole.door.clone().add(new THREE.Vector3(rabbitHole.dir.x * 1.3, 0, rabbitHole.dir.y * 1.3)));
const pawLights = cat.pawScene.children.filter((o) => o.isLight).map((l) => ({ l, base: l.intensity }));

// ---------------------------------------------------------------- dig spots
const gameRand = rng(seed ^ 0xb4a4a);
const moundGeo = (() => {
  const g = new THREE.ConeGeometry(0.34, 0.13, 8, 2).translate(0, 0.065, 0);
  jitter(g, 0.07, gameRand);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0.02) pos.setY(i, -0.01);
  g.computeVertexNormals();
  return g;
})();
const soilMat = new THREE.MeshStandardMaterial({ color: 0x7a5234, flatShading: true, roughness: 1 });
const holeMat = new THREE.MeshBasicMaterial({ color: 0x2a1a0e });
const pebbleMat = new THREE.MeshStandardMaterial({ color: 0xb3ada2, flatShading: true });
for (const spot of world.digSpots) {
  const g = new THREE.Group();
  g.position.set(spot.x, spot.y, spot.z);
  const mound = new THREE.Mesh(moundGeo, soilMat);
  mound.rotation.y = gameRand() * 6;
  mound.castShadow = true; mound.receiveShadow = true;
  g.add(mound);
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.03, 0), pebbleMat);
    const a = gameRand() * 6.28;
    p.position.set(Math.cos(a) * 0.3, 0.02, Math.sin(a) * 0.3);
    g.add(p);
  }
  const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.2, 3), new THREE.MeshStandardMaterial({ color: 0x6b4a2a }));
  twig.position.set(0.05, 0.12, 0);
  twig.rotation.set(0.3, 0, 0.5);
  g.add(twig);
  const hole = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.2, 9).rotateX(-Math.PI / 2), holeMat);
  disc.position.y = 0.012;
  hole.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.06, 3, 9).rotateX(Math.PI / 2), soilMat);
  ring.scale.y = 0.6;
  hole.add(ring);
  const pile = new THREE.Mesh(moundGeo, soilMat);
  pile.scale.set(0.5, 0.8, 0.5);
  pile.position.set(0.42, 0, 0.1);
  hole.add(pile);
  hole.visible = false;
  g.add(hole);
  scene.add(g);
  spot.visual = { mound, hole, twig, group: g };
}

// ---------------------------------------------------------------- golden platanitos
// 5 on the surface (3 lying out in the open, 2 buried under mounds) + 5 in the tunnels.
const bananas = [];
function addBanana(zone, kind, pos, where, spot = null) {
  const mesh = makeBanana();
  mesh.position.copy(pos);
  mesh.visible = kind !== 'buried';
  (zone === 'surface' ? scene : underground.scene).add(mesh);
  const b = { id: bananas.length, zone, kind, pos: pos.clone(), where, mesh, spot, collected: false, reveal: 0 };
  if (spot) spot.banana = b;
  bananas.push(b);
}
const LIFT = 0.22;
for (const [x, z, where, top] of [[4, 10, 'on the bench', 0.46], [5.6, 6.6, 'by the pond', null], [18.3, -17.3, 'behind the shed', null]]) {
  addBanana('surface', 'visible', new THREE.Vector3(x, (top ?? world.groundHeight(x, z)) + LIFT, z), where);
}
{
  const order = world.digSpots.map((_, i) => i).sort((a, b) => ((a * 7919 + seed) % 97) - ((b * 7919 + seed) % 97));
  for (const i of order.slice(0, 2)) {
    const s = world.digSpots[i];
    addBanana('surface', 'buried', new THREE.Vector3(s.x, s.y + LIFT, s.z), 'under a mound', s);
  }
}
underground.bananaSpots.forEach((p) => addBanana('burrow', 'visible', new THREE.Vector3(p.x, LIFT, p.z), 'deep in the tunnels'));
if (bananas.length !== BANANA_TOTAL) throw new Error(`expected ${BANANA_TOTAL} bananas, placed ${bananas.length}`);

// ---------------------------------------------------------------- state & HUD
const G = {
  state: 'title', zone: 'surface', collected: 0, dug: 0, bf: 0, birds: 0, rabbitBoops: 0, time: 0, sniffCD: 0,
  digging: null, dayK: 0, dayTarget: 0, won: false, lookDrag: false, noLock: false, tunnelVisits: 0,
};
const $ = (id) => document.getElementById(id);
const fx = () => (G.zone === 'burrow' ? fxBurrow : fxSurface);
const activeWorld = () => (G.zone === 'burrow' ? underground : world);
const countBy = (zone, collected) => bananas.filter((b) => b.zone === zone && (collected === undefined || b.collected === collected)).length;

function hud() {
  $('bananaCount').textContent = `${G.collected}/${BANANA_TOTAL}`;
  $('bananaSplit').textContent = `Surface ${countBy('surface', true)}/${countBy('surface')} · Burrow ${countBy('burrow', true)}/${countBy('burrow')}`;
  const zone = $('zone');
  zone.textContent = G.zone === 'burrow' ? 'Burrow' : 'Surface';
  zone.className = `panel zone ${G.zone}`;
  $('bfCount').textContent = G.bf;
  $('birdCount').textContent = G.birds;
  $('objective').innerHTML = G.won
    ? 'All ten found. <b>Enjoy the golden hour.</b>'
    : G.zone === 'burrow'
      ? `Explore the tunnels · <b>${countBy('burrow', false)}</b> platanitos left down here`
      : `Find the golden platanitos · <b>${G.collected}/${BANANA_TOTAL}</b>`;
}

let toastTimer;
function toast(title, line = '', ms = 3200) {
  const el = $('toast');
  el.querySelector('.t-title').textContent = title;
  el.querySelector('.t-line').textContent = line;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- input
const input = {};
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  input[e.code] = true;
  if (e.repeat || !playing()) return;
  if (e.code === 'Space' && cat.pounce()) sound.whoosh();
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyQ') sniff();
  if (e.code === 'KeyM') meow();
});
addEventListener('keyup', (e) => { input[e.code] = false; });
addEventListener('blur', () => { for (const k in input) input[k] = false; });

const locked = () => document.pointerLockElement === canvas;
const playing = () => G.state === 'play';
addEventListener('mousemove', (e) => {
  if (!playing()) return;
  if (locked() || G.lookDrag) cat.look(e.movementX, e.movementY);
});
canvas.addEventListener('mousedown', (e) => {
  if (!playing()) return;
  if (!locked() && G.noLock) G.lookDrag = true;
  if (e.button === 0) swipe();
});
addEventListener('mouseup', () => { G.lookDrag = false; });

// Audio (including the rabbit music) only starts from here, i.e. from the Start button.
function startPlay() {
  const first = G.time === 0 && G.state === 'title';
  sound.init();
  G.state = 'play';
  ['title', 'pause', 'end'].forEach((id) => $(id).classList.add('hidden'));
  $('hud').classList.remove('hidden');
  hud();
  if (first) setTimeout(() => toast('Ten golden platanitos are hidden around here.', 'Some lie in the garden, some are buried, and some are deep in the tunnels. Press E at a burrow hole to go underground.', 5600), 500);
}

function requestLock() {
  sound.init();
  try {
    const p = canvas.requestPointerLock?.();
    if (p?.catch) p.catch(() => { G.noLock = true; startPlay(); });
  } catch { G.noLock = true; startPlay(); }
}

document.addEventListener('pointerlockchange', () => {
  if (locked()) startPlay();
  else if (G.state === 'play' && !G.noLock) {
    G.state = 'paused';
    $('pause').classList.remove('hidden');
  }
});
document.addEventListener('pointerlockerror', () => { G.noLock = true; startPlay(); });

$('play').addEventListener('click', requestLock);
$('resume').addEventListener('click', () => (G.noLock ? startPlay() : requestLock()));
$('explore').addEventListener('click', () => (G.noLock ? startPlay() : requestLock()));
$('again').addEventListener('click', () => location.reload());
$('sens').addEventListener('input', (e) => { cat.sensitivity = parseFloat(e.target.value); });
$('soundOn').addEventListener('change', (e) => sound.setMuted(!e.target.checked));
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && G.noLock && G.state === 'play') { G.state = 'paused'; $('pause').classList.remove('hidden'); }
});

// ---------------------------------------------------------------- zones
function fade() {
  const f = $('fade');
  f.classList.add('on');
  setTimeout(() => f.classList.remove('on'), 260);
}

function enterBurrow(i) {
  const ex = underground.exits[i];
  G.zone = 'burrow';
  G.digging = null;
  G.tunnelVisits++;
  cat.world = underground;
  cat.pos.set(ex.spawn.x, 0, ex.spawn.z);
  cat.feetY = 0; cat.vy = 0; cat.vel.set(0, 0, 0);
  cat.yaw = ex.yaw; cat.pitch = 0;
  for (const { l, base } of pawLights) l.intensity = base * 0.55;
  sound.setUnderground(true);
  fade(); hud();
  toast(`Into ${world.entrances[i].name}…`, 'The tunnels twist and branch. Stand in a shaft of daylight and press E to climb out.', 3600);
}

function exitBurrow(i) {
  const en = world.entrances[i];
  G.zone = 'surface';
  cat.world = world;
  const x = en.door.x + en.dir.x * 0.45, z = en.door.z + en.dir.y * 0.45;
  cat.pos.set(x, 0, z);
  cat.feetY = world.floorAt(x, z, 1); cat.vy = 0; cat.vel.set(0, 0, 0);
  cat.yaw = Math.atan2(-en.dir.x, -en.dir.y); cat.pitch = 0;
  for (const { l, base } of pawLights) l.intensity = base;
  sound.setUnderground(false);
  fade(); hud();
  toast('Back in the sunshine.', `You pop out of ${en.name}.`, 2200);
}

// ---------------------------------------------------------------- actions
const tmp = new THREE.Vector3();
const lookDir = () => camera.getWorldDirection(new THREE.Vector3());

function swipe() {
  if (cat.swipeT > 0 || G.digging) return;
  cat.swipeT = 0.32;
  if (G.zone !== 'surface') { sound.whoosh(); return; }
  const dir = lookDir(), eye = camera.position;
  for (const b of butterflies.list) {
    if (b.flee > 0) continue;
    tmp.subVectors(b.group.position, eye);
    if (tmp.length() < 1.0 && tmp.normalize().dot(dir) > 0.55) {
      butterflies.boop(b, eye);
      G.bf++; sound.boop(); fxSurface.sparkle(b.group.position, 0xfff2a8, 10);
      toast('Boop!', ['The butterfly is fine. Delighted, even.', 'Soft paw, zero regrets.', 'It flutters off, giggling.'][G.bf % 3], 1800);
      hud();
      return;
    }
  }
  tmp.subVectors(rabbit.group.position, eye);
  if (Math.hypot(tmp.x, tmp.z) < 1.2 && tmp.setY(0).normalize().dot(dir.clone().setY(0).normalize()) > 0.5) {
    G.rabbitBoops++; rabbit.booped++; sound.boop();
    fxSurface.sparkle(rabbit.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xffffff, 12);
    toast('Boop! The rabbit thumps a happy foot.', 'It hops off, but it seems to like you.', 2200);
    rabbit.timer = 0;
    return;
  }
  for (const b of birds.list) {
    if (b.state !== 'ground') continue;
    tmp.subVectors(b.group.position, eye);
    const flat = Math.hypot(tmp.x, tmp.z);
    if (flat < 1.15 && Math.abs(tmp.y) < 0.6 && tmp.setY(0).normalize().dot(dir.clone().setY(0).normalize()) > 0.5) {
      birds.startle(b);
      G.birds++; sound.tweet(); sound.boop(); fxSurface.sparkle(b.group.position, 0xffffff, 10);
      toast('Sparrow booped!', 'It is scandalised, but unharmed. Stealth pays off.', 2200);
      hud();
      return;
    }
  }
  tmp.subVectors(ball.pos, eye);
  if (tmp.length() < 0.9 && tmp.normalize().dot(dir) > 0.4) {
    const f = cat.forward;
    ball.vel.set(f.x * 5.5, 0, f.z * 5.5);
    sound.boop();
    return;
  }
  sound.whoosh();
}

function nearest(list, maxD, get = (s) => s) {
  let best = null, bd = maxD;
  for (const s of list) {
    const p = get(s);
    const d = Math.hypot(p.x - cat.pos.x, p.z - cat.pos.z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function currentInteraction() {
  if (G.digging) return null;
  if (G.zone === 'burrow') {
    const ex = nearest(underground.exits, 0.8, (e) => e.pos);
    return ex ? { type: 'exit', index: ex.index, text: `Climb out to ${world.entrances[ex.index].name}` } : null;
  }
  if (Math.hypot(-3.7 - cat.pos.x, -10.15 - cat.pos.z) < 0.7) return { type: 'bowl', text: 'Crunch some kibble' };
  const en = nearest(world.entrances, 0.85, (e) => e.door);
  if (en) return { type: 'enter', index: world.entrances.indexOf(en), text: `Crawl into ${en.name}` };
  const spot = nearest(world.digSpots.filter((s) => !s.dug && Math.abs(s.y - cat.feetY) < 0.2), 0.75);
  if (spot) return { type: 'dig', text: 'Dig', spot };
  return null;
}

function interact() {
  const it = currentInteraction();
  if (!it) return;
  if (it.type === 'dig') {
    G.digging = { spot: it.spot, t: 0, next: 0 };
    cat.frozen = 1.15; cat.digT = 1.15;
    cat.vel.set(0, 0, 0);
  } else if (it.type === 'enter') enterBurrow(it.index);
  else if (it.type === 'exit') exitBurrow(it.index);
  else if (it.type === 'bowl') {
    cat.stamina = 1; sound.crunch();
    toast('Crunch crunch.', 'Stamina fully restored. Zoomies authorised.', 2200);
  }
}

const EMPTY_LINES = [
  ['Just a worm.', 'It looks deeply offended.'],
  ['A bottle cap.', 'Not a platanito. Standards matter.'],
  ['Dirt.', 'Premium dirt, sure. But still dirt.'],
  ['A beetle waves at you.', 'You wave back. Nothing else here.'],
  ['An old carrot end.', 'The rabbit must have been here.'],
  ['Nothing.', 'Only the faint smell of Tuesday.'],
];

function finishDig(spot) {
  spot.dug = true; G.dug++;
  spot.visual.mound.visible = false; spot.visual.twig.visible = false; spot.visual.hole.visible = true;
  if (spot.banana && !spot.banana.collected) {
    const b = spot.banana;
    b.mesh.visible = true;
    b.reveal = 0.8; // pops up out of the hole, then drops into your collection
    sound.chime();
    fxSurface.sparkle(b.pos);
    toast('A buried golden platanito!', 'Dug up fresh and still shiny.', 2400);
  } else {
    const [a, b] = EMPTY_LINES[G.dug % EMPTY_LINES.length];
    sound.meh();
    toast(a, b, 2400);
  }
  hud();
}

function collect(b) {
  if (b.collected) return;
  b.collected = true;
  b.mesh.visible = false;
  G.collected++;
  sound.collect();
  (b.zone === 'burrow' ? fxBurrow : fxSurface).sparkle(b.pos, 0xffe36b, 18);
  const left = BANANA_TOTAL - G.collected;
  if (left > 0) toast(`Golden platanito! (${G.collected}/${BANANA_TOTAL})`, left === 1 ? 'Just one more somewhere…' : `Found ${b.where}.`, 2600);
  hud();
  if (G.collected === BANANA_TOTAL) win();
}

function win() {
  if (G.won) return;
  G.won = true;
  G.dayTarget = 1;
  setTimeout(() => {
    sound.fanfare();
    toast('All ten golden platanitos!', 'Platanito does a very proud slow blink.', 3500);
  }, 600);
  setTimeout(() => {
    $('stats').innerHTML = `
      <div><b>${fmt(G.time)}</b><span>time</span></div>
      <div><b>${G.dug}</b><span>holes dug</span></div>
      <div><b>${G.tunnelVisits}</b><span>tunnel trips</span></div>
      <div><b>${G.bf + G.birds + G.rabbitBoops}</b><span>boops</span></div>`;
    G.state = 'won';
    if (locked()) document.exitPointerLock();
    $('end').classList.remove('hidden');
    hud();
  }, 3600);
}

function sniff() {
  if (G.sniffCD > 0 || G.digging) return;
  G.sniffCD = 6;
  sound.sniff();
  const left = bananas.filter((b) => !b.collected);
  const here = left.filter((b) => b.zone === G.zone);
  let target, line;
  if (here.length) {
    target = nearest(here, 999, (b) => b.pos).pos;
    line = 'Something golden is that way.';
  } else if (left.length) {
    target = G.zone === 'surface' ? nearest(world.entrances, 999, (e) => e.door).door : nearest(underground.exits, 999, (e) => e.pos).pos;
    line = G.zone === 'surface' ? 'The scent leads underground…' : 'Nothing left down here. Daylight is that way.';
  }
  if (!target) return;
  const aw = activeWorld();
  const from = new THREE.Vector3(cat.pos.x, cat.feetY, cat.pos.z).addScaledVector(cat.forward, 0.4);
  fx().trail(from, target, (x, z) => aw.floorAt(x, z, 5));
  toast('*sniff sniff*', line, 2000);
}

function meow() {
  sound.meow();
  let scared = 0;
  if (G.zone === 'surface') {
    for (const b of birds.list) {
      if (b.state === 'ground' && b.group.position.distanceTo(camera.position) < 7) { birds.startle(b); scared++; }
    }
  }
  const echo = G.zone === 'burrow' ? 'It echoes down the tunnels.' : scared ? 'The sparrows did not appreciate that.' : '';
  toast(['Mrrrp!', 'Meow.', 'MRAOW!', 'mew?'][Math.floor(Math.random() * 4)], echo, 1500);
}

// ---------------------------------------------------------------- loop
let last = performance.now();
let t = 0;
const far = { pos: { x: 999, z: 999 }, feetY: 0, noise: 0, vel: { x: 0, z: 0 }, speed: 0 };

function update(dt) {
  t += dt;
  if (G.state === 'play') {
    G.time += dt;
    cat.update(dt, input, sound);
    G.sniffCD = Math.max(0, G.sniffCD - dt);
    if (G.digging) {
      const d = G.digging;
      d.t += dt; d.next -= dt;
      if (d.next <= 0) {
        d.next = 0.14;
        fxSurface.dirtBurst(new THREE.Vector3(d.spot.x, d.spot.y + 0.08, d.spot.z), cat.forward, 4);
        if (Math.random() < 0.6) sound.dig();
        d.spot.visual.mound.scale.y = Math.max(0.2, 1 - d.t);
      }
      if (d.t >= 1.1) { G.digging = null; finishDig(d.spot); }
    }
    const it = currentInteraction();
    const pr = $('prompt');
    if (it) { pr.innerHTML = `<kbd>E</kbd>${it.text}`; pr.classList.add('show'); }
    else pr.classList.remove('show');
    document.body.classList.toggle('stalking', cat.crouch);
    $('stamina').style.width = `${cat.stamina * 100}%`;
    $('sniff').style.width = `${(1 - G.sniffCD / 6) * 100}%`;
    $('clock').textContent = fmt(G.time);
    if (!G.won) G.dayTarget = Math.min(0.75, G.time / 600);
  } else if (G.state === 'title') {
    const a = t * 0.045 + 2.2;
    camera.position.set(Math.cos(a) * 6.5 - 3, 0.5 + Math.sin(t * 0.3) * 0.06, Math.sin(a) * 6.5 + 1);
    camera.lookAt(-3 + Math.cos(a + 0.6) * 2, 0.9, 1 + Math.sin(a + 0.6) * 2);
  }

  // bananas: spin, bob, and get collected by walking into them
  for (const b of bananas) {
    if (b.collected || !b.mesh.visible) continue;
    b.mesh.rotation.y += dt * 1.8;
    b.mesh.position.y = b.pos.y + Math.sin(t * 2.4 + b.id) * 0.03;
    b.mesh.userData.halo.material.opacity = 0.35 + Math.sin(t * 3 + b.id) * 0.2;
    if (b.reveal > 0) {
      b.reveal -= dt;
      b.mesh.position.y = b.pos.y + Math.sin((1 - b.reveal / 0.8) * Math.PI) * 0.3;
      if (b.reveal <= 0) collect(b);
      continue;
    }
    if (G.state !== 'play' || b.zone !== G.zone || b.kind === 'buried') continue;
    const d = Math.hypot(b.pos.x - cat.pos.x, b.pos.z - cat.pos.z);
    if (d < 0.42 && Math.abs(cat.feetY + 0.15 - b.pos.y) < 0.45) collect(b);
  }

  const onSurface = (G.state === 'play' || G.state === 'won') && G.zone === 'surface';
  birds.update(dt, t, onSurface ? cat : far, () => { if (onSurface) sound.tweet(); });
  butterflies.update(dt, t);
  rabbit.update(dt, t, onSurface ? cat : null);
  ball.update(dt, G.state === 'play' && G.zone === 'surface' ? cat : far);
  fxSurface.update(dt, t);
  fxBurrow.update(dt, t);

  G.dayK += (G.dayTarget - G.dayK) * Math.min(1, dt * (G.won ? 0.6 : 0.2));
  world.setDaylight(G.dayK);
  world.update(t, dt, camera.position);
  underground.update(t, camera.position);
}

function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  renderer.clear();
  renderer.render(G.zone === 'burrow' ? underground.scene : scene, camera);
  if (G.state === 'play' || G.state === 'paused') cat.renderOverlay(renderer);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

hud();
frame();

// ---------------------------------------------------------------- debug / test hook
function debug() {
  const L = underground.layout;
  return {
    seed,
    state: G.state,
    zone: G.zone,
    hud: { zone: $('zone').textContent, count: $('bananaCount').textContent, split: $('bananaSplit').textContent },
    bananas: {
      total: bananas.length,
      collected: G.collected,
      surface: countBy('surface'),
      burrow: countBy('burrow'),
      list: bananas.map((b) => ({ id: b.id, zone: b.zone, kind: b.kind, where: b.where, collected: b.collected, pos: b.pos.toArray().map((v) => +v.toFixed(2)) })),
    },
    entrances: world.entrances.map((e) => ({ name: e.name, door: e.door.toArray().map((v) => +v.toFixed(2)) })),
    tunnels: {
      cols: L.cols, rows: L.rows, cells: L.cols * L.rows, connected: L.connected, junctions: L.junctions,
      deadEnds: L.deadEnds, longestPath: L.longestPath, exits: underground.exits.length, bananaCells: L.bananaCells,
    },
    rabbit: {
      inScene: rabbit.group.parent === scene, visible: rabbit.group.visible, pos: rabbit.group.position.toArray().map((v) => +v.toFixed(2)),
      home: rabbit.home.toArray().map((v) => +v.toFixed(2)), hops: rabbit.hops, state: rabbit.state,
    },
    music: { started: !!sound.ctx, playing: sound.musicPlaying, muted: sound.muted, step: sound.musicStep ?? 0 },
    won: G.won,
  };
}

window.__game = {
  step: (n = 60) => { for (let i = 0; i < n; i++) update(1 / 60); },
  debug, seed, BANANA_TOTAL, renderer, G, cat, world, underground, bananas, rabbit, sound, birds, butterflies, ball, camera,
  startPlay, interact, sniff, swipe, meow, input, enterBurrow, exitBurrow, collect, finishDig, currentInteraction,
};
