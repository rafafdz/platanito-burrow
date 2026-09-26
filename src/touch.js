// Touch controls: a floating joystick on the left for hopping around, a look/boop area on the
// right, and big buttons for hop, sneak, interact (E), sniff (Q) and thump (T).
// Everything uses Pointer Events, so taps, drags and multi-touch all work at once.

// Touch UI when the primary pointer is a finger (phones/tablets). ?touch=1 / ?touch=0 force it.
export const isTouchDevice = () => {
  const q = new URLSearchParams(location.search).get('touch');
  if (q !== null) return q !== '0';
  return !!window.matchMedia?.('(pointer: coarse)').matches;
};

export function setupTouch({ root, input, player, actions, isPlaying }) {
  root.innerHTML = `
    <div id="moveZone" class="t-zone"></div>
    <div id="lookZone" class="t-zone"></div>
    <div id="stickBase" class="t-stick"><div id="stickKnob"></div></div>
    <div id="lookHint" class="t-look"><span>drag to look<br>tap to boop</span></div>
    <div class="t-buttons">
      <button id="btnAct" class="t-btn t-act" aria-label="Interact (E)"><b>E</b><small id="btnActLabel">—</small></button>
      <button id="btnHop" class="t-btn t-hop" aria-label="Hop (Space)"><b>Hop</b></button>
      <button id="btnSneak" class="t-btn t-small" aria-label="Sneak (C)"><b>Sneak</b></button>
      <button id="btnSniff" class="t-btn t-small" aria-label="Sniff (Q)"><b>Sniff</b></button>
      <button id="btnThump" class="t-btn t-small" aria-label="Thump (T)"><b>Thump</b></button>
    </div>
    <button id="btnPause" class="t-pause" aria-label="Pause">II</button>`;
  const $ = (id) => root.querySelector(`#${id}`);
  const base = $('stickBase'), knob = $('stickKnob');
  const state = { move: null, look: null, sneak: false };
  const radius = () => base.offsetWidth * 0.42;

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  // capture keeps a drag alive past the zone edge; it can throw for odd pointers, so it's best-effort
  const capture = (e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ } };

  // --- left: floating joystick. It jumps to where your thumb lands, and pushing it to the rim sprints.
  $('moveZone').addEventListener('pointerdown', (e) => {
    if (!isPlaying() || state.move) return;
    stop(e);
    capture(e);
    const r = base.getBoundingClientRect();
    state.move = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    base.style.left = `${e.clientX - r.width / 2}px`;
    base.style.top = `${e.clientY - r.height / 2}px`;
    base.style.bottom = 'auto';
    base.classList.add('active');
  });
  const moveTo = (e) => {
    if (!state.move || e.pointerId !== state.move.id) return;
    stop(e);
    let dx = e.clientX - state.move.ox, dy = e.clientY - state.move.oy;
    const R = radius(), len = Math.hypot(dx, dy);
    if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.axisX = dx / R;
    input.axisY = dy / R;
    input.touchSprint = len > R * 1.15 && !state.sneak;
  };
  const endMove = (e) => {
    if (!state.move || e.pointerId !== state.move.id) return;
    state.move = null;
    input.axisX = 0; input.axisY = 0; input.touchSprint = false;
    knob.style.transform = '';
    base.style.left = ''; base.style.top = ''; base.style.bottom = '';
    base.classList.remove('active');
  };
  $('moveZone').addEventListener('pointermove', moveTo);
  $('moveZone').addEventListener('pointerup', endMove);
  $('moveZone').addEventListener('pointercancel', endMove);

  // --- right: drag to look, quick tap to boop
  $('lookZone').addEventListener('pointerdown', (e) => {
    if (!isPlaying() || state.look) return;
    stop(e);
    capture(e);
    state.look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() };
    $('lookHint').classList.add('used');
  });
  $('lookZone').addEventListener('pointermove', (e) => {
    if (!state.look || e.pointerId !== state.look.id) return;
    stop(e);
    player.look((e.clientX - state.look.x) * 1.5, (e.clientY - state.look.y) * 1.5);
    state.look.x = e.clientX; state.look.y = e.clientY;
  });
  const endLook = (e) => {
    if (!state.look || e.pointerId !== state.look.id) return;
    const moved = Math.hypot(e.clientX - state.look.sx, e.clientY - state.look.sy);
    if (e.type === 'pointerup' && moved < 12 && performance.now() - state.look.t < 300) actions.boop();
    state.look = null;
  };
  $('lookZone').addEventListener('pointerup', endLook);
  $('lookZone').addEventListener('pointercancel', endLook);

  // --- buttons
  const press = (id, fn, hold) => {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => {
      stop(e);
      if (!isPlaying() && id !== 'btnPause') return;
      el.classList.add('down');
      fn();
    });
    const up = (e) => { el.classList.remove('down'); hold?.(e); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  press('btnHop', actions.hop);
  press('btnAct', actions.interact);
  press('btnSniff', actions.sniff);
  press('btnThump', actions.thump);
  press('btnPause', actions.pause);
  press('btnSneak', () => {
    state.sneak = !state.sneak;
    input.touchSneak = state.sneak;
    $('btnSneak').classList.toggle('on', state.sneak);
  });

  // keep the whole page from scrolling, zooming or long-press selecting while playing
  root.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    // the E button shows what it will do right now
    setAction(text) {
      const btn = $('btnAct');
      $('btnActLabel').textContent = text || '—';
      btn.classList.toggle('ready', !!text);
    },
    reset() {
      endMove({ pointerId: state.move?.id });
      state.look = null;
    },
    state,
  };
}
