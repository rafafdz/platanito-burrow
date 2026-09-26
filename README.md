# Platanito Burrow

A first-person, low-poly 3D cat game in the browser. You are **Platanito**, a small orange cat in a sunny back garden.
**Ten golden platanitos** (bananas) are hidden around the house. Five are on the surface and five are in a network of
tunnels under the lawn. Collect all ten to win.

Built with [three.js](https://threejs.org) and Vite. Every model is procedural and all audio, including the music, is synthesized with WebAudio, so there are no asset files.

**Play it:** https://rafafdz.github.io/platanito-burrow/

## Run

```bash
npm install
npm run dev        # http://localhost:5173  (add ?seed=123 to generate a different tunnel network)
npm test           # headless smoke test (see below)
npm run build      # static build in dist/
npm run preview    # serve the build
```

## Goal: 10 golden platanitos

The HUD (top left) shows `collected/10` plus a split, e.g. `Surface 2/5 · Burrow 1/5`. You win at exactly 10/10.

| Where | How many | How to get them |
| --- | --- | --- |
| Garden, in the open | 3 | On the bench (pounce up), by the pond, behind the shed. Walk into one to collect it. |
| Garden, buried | 2 | Under 2 of the 10 soil mounds, chosen from the seed. Press `E` to dig. It pops out and is collected. |
| Underground tunnels | 5 | In dead ends far from the exits. Walk into them. |

Bananas spin, bob and glow. `Q` (sniff) draws a scent trail to the nearest banana in your current zone. If none are left in that zone, the trail leads to the nearest way up or down.

## Underground tunnels

- There are **two entrance holes** on the surface: *Platanito's burrow*, the mound in the south-west corner, and the *Rabbit hole* by the lemon tree. Stand at a hole and press `E` to crawl in.
- Entering takes you to a separate underground zone. The HUD badge switches from **Surface** to **Burrow**, the music is muffled, and the lighting changes to a warm, dark cave.
- The tunnel network is generated deterministically from a seed (`?seed=` URL param, default `20260926`). It is an 8×8 grid maze carved by a seeded recursive backtracker, plus 6 extra openings that create loops. The passages are fully connected and wind and branch: the default seed has 16 junctions, 6 dead ends and a 22-cell longest path. Tunnel walls are solid, so you navigate with the normal controls.
- Each entrance has a matching exit: a shaft of daylight under the hole. Stand in it and press `E` to climb out of the linked surface entrance. This means you can go in one hole and come out of the other.

## The rabbit

A white, low-poly rabbit with black spots lives by the rabbit hole. It idles and nibbles, twitches its ears, and hops around near its burrow. It hops away if you get close. You can click to boop it.

## Music

**Rabbit Hop** is a small procedural WebAudio loop at 116 BPM. It has bouncy "boing" bass notes, woodblock ticks, a skipping pentatonic melody, and an upward hop-glide every other bar. It only starts after you press **Start prowling**. The pause menu's **Sound & rabbit music** toggle mutes it along with all other sound. Underground, the loop is low-pass filtered.

## Controls

| Key | Action |
| --- | --- |
| `W A S D` / arrows | prowl |
| Mouse | look (click **Start prowling** to lock the pointer) |
| `Shift` | zoomies (sprint, uses stamina) |
| `Space` | pounce: hop onto raised beds, the bench, the porch, rocks |
| `C` / `Ctrl` | stalk low and quiet (sparrows only notice you when you're close) |
| `E` | dig a mound · enter a burrow hole · climb out of a daylight shaft · eat kibble from the porch bowl |
| `Q` | sniff for the nearest platanito |
| Click | boop butterflies, sparrows, the rabbit, the beach ball |
| `M` | meow |
| `Esc` | pause (sensitivity, sound & rabbit music) |

## Deployment

Every push to `main` runs `.github/workflows/deploy-pages.yml`. The workflow runs `npm ci` and `npm run build`, then publishes `dist/` to GitHub Pages with `actions/deploy-pages`.
Production builds use the Vite base path `/platanito-burrow/` (see `vite.config.js`), so the game is served at
https://rafafdz.github.io/platanito-burrow/. The dev server and `npm test` still serve from `/`.

## Testing and debugging

`npm test` runs `test/smoke.mjs`. It:

1. checks tunnel generation in Node: the same seed gives the same layout, different seeds differ, and the network is connected, branching, winding, and has 5 banana cells;
2. starts a Vite dev server and checks `GET /` (200, title, "rabbit music" text) and `GET /src/main.js`;
3. opens the game in headless Chromium and uses the `window.__game` debug hook to check:
   - exactly 10 bananas (5 surface / 5 burrow) and a HUD reading 0/10
   - at least 2 entrances
   - the rabbit is present, wanders near its home, and is on screen in a third-person view
   - the music stays silent until Start, then plays
   - entering a hole switches to the `burrow` zone and the HUD reads "Burrow"
   - the cat can walk a BFS path through the tunnels with real collisions (and can't walk through walls) and collects a banana there
   - the exit returns you to the surface at the linked entrance
   - the game is not won at 9/10 and is won at 10/10
   - there are no console errors

   The optional Google Fonts request is ignored when checking console errors.

If Playwright's bundled Chromium is missing, the test falls back to any `~/.cache/ms-playwright/chromium-*` build, or to `CHROMIUM_PATH`.

Debug hook in the browser console:

```js
__game.debug()        // { bananas: { total, collected, surface, burrow, list }, zone, hud, entrances, tunnels, rabbit, music, won }
__game.enterBurrow(0) // teleport underground via entrance 0 (1 = rabbit hole)
__game.exitBurrow(1)
__game.rabbit         // the rabbit NPC (group, home, hops, state)
__game.step(60)       // advance the simulation 60 frames without rendering
```

## Code map

- `src/world.js`: terrain, house, shed, fence, pond, trees, shrubs, the two burrow entrances, props, sky/daylight, collision and floor queries, instanced grass and flowers
- `src/underground.js`: seeded tunnel generator (`generateTunnels`) and the underground scene: walls, roots, glowing mushrooms, daylight exits, collisions
- `src/cat.js`: first-person controller (walk, sprint, stalk, pounce, step-up surfaces) and the on-screen paws
- `src/entities.js`: golden platanito model, the rabbit, sparrows, butterflies, ball, particles
- `src/audio.js`: procedural sound and the Rabbit Hop music loop
- `src/main.js`: bananas, zones, interactions, HUD, main loop, `window.__game` debug hook
- `test/smoke.mjs`: the `npm test` smoke test
