# Platanito Burrow

A first-person, low-poly 3D rabbit game in the browser. You are **Platanito**, a small **white rabbit with black spots**.
**Ten golden platanitos** (bananas) are hidden around home: out in the garden, buried under soil mounds, inside the house,
and in a network of tunnels under the lawn. Collect all ten to win.

**Play it:** https://rafafdz.github.io/platanito-burrow/

Built with [three.js](https://threejs.org) and Vite. Every model is procedural and all audio, including the music, is synthesized with WebAudio, so there are no asset files.

## Run

```bash
npm install
npm run dev        # http://localhost:5173  (add ?seed=123 to generate a different tunnel network)
npm test           # headless smoke test (see below)
npm run build      # static build in dist/ (base path /platanito-burrow/)
npm run preview    # serve the build
```

## Playing as Platanito

You see the world from a rabbit's eye height, about 30 cm off the ground. Your white forepaws are on screen, and the right one has a black spot. Your long ears poke into the top corners of the view: the left is white, the right is black. They twitch, bounce as you hop, and fold back when you sneak. Moving bounces the camera in short hops rather than a walking sway.

| Key | Action |
| --- | --- |
| `W A S D` / arrows | hop around |
| Mouse | look (click **Start hopping** to lock the pointer) |
| `Shift` | bunny zoomies (sprint, uses stamina) |
| `Space` | big hop: onto raised beds, the bench, the porch, rocks, the sofa |
| `C` / `Ctrl` | sneak low and quiet (sparrows only notice you when you're close) |
| `E` | dig a mound · go into the house · hop into a burrow hole · climb out of a daylight shaft · leave the house · munch carrots from the porch bowl |
| `Q` | sniff: a glowing scent trail to the nearest platanito, or to the way into a place that still has some |
| Click | paw boop: butterflies, sparrows, Canela, the beach ball |
| `T` | thump your foot (sparrows scatter) |
| `Esc` | pause (sensitivity, sound & rabbit music) |

## Goal: 10 golden platanitos

The HUD (top left) shows `collected/10` plus a split, e.g. `Garden 2/4 · House 1/1 · Burrow 3/5`. A badge below it shows where you are: **Surface**, **House** or **Burrow**. You win at exactly 10/10.

| Where | How many | How to get them |
| --- | --- | --- |
| Garden, in the open | 2 | On the bench (hop up) and by the pond. Hop into them to collect. |
| Garden, buried | 2 | Under 2 of the 10 soil mounds, chosen from the seed. Press `E` to dig. It pops out and is collected. |
| Inside the house | 1 | On the living-room sofa. Hop up to reach it. |
| Underground tunnels | 5 | In dead ends far from the exits. |

## The house

Hop to the front door (in front of the porch step) and press `E` to go inside. The interior is its own zone: a living room with a rug, sofa, coffee table, floor lamp, bookshelf, Platanito's cushion and a banana painting, plus a dining table, chairs and a kitchen. The furniture is solid, and anything low enough can be hopped onto. The open front door, marked by a glowing patch on the floor, takes you back to the garden.

## Underground tunnels

- There are **two entrance holes** on the surface: *Platanito's burrow*, the mound in the south-west corner, and *Canela's hole* (labelled "Rabbit hole") by the lemon tree. Stand at a hole and press `E` to hop in.
- Going in takes you to a separate underground zone. The HUD badge switches to **Burrow**, the music is muffled, and the lighting changes to a warm, dark cave.
- The network is generated deterministically from a seed (`?seed=`, default `20260926`). It is an 8×8 grid maze carved by a seeded recursive backtracker, plus 6 extra openings for loops. The passages are fully connected and wind and branch: the default seed has 16 junctions, 6 dead ends and a 22-cell longest path. The walls are solid.
- Each entrance has a matching daylight shaft underground. Press `E` in one to climb out of the linked hole.

## Canela, the neighbour

Canela is the other rabbit in the garden, and she is drawn to be easy to tell apart from you: cinnamon-brown with a cream chest, floppy lop ears and a daisy behind one ear, with no black spots. She idles and nibbles, hops around near her hole, and hops away if you get too close. Click to nose-boop her.

## Music

**Rabbit Hop** is a small procedural WebAudio loop at 116 BPM. It has bouncy "boing" bass notes, woodblock ticks, a skipping pentatonic melody, and an upward hop-glide every other bar. It only starts after you press **Start hopping**. The pause menu's **Sound & rabbit music** toggle mutes it along with all other sound. The loop is muffled a little indoors and more underground.

## Deployment

Every push to `main` runs `.github/workflows/deploy-pages.yml`. The workflow runs `npm ci` and `npm run build`, then publishes `dist/` to GitHub Pages with `actions/deploy-pages`. Production builds use the Vite base path `/platanito-burrow/` (see `vite.config.js`), so the game is served at https://rafafdz.github.io/platanito-burrow/. The dev server and `npm test` still serve from `/`.

## Testing and debugging

`npm test` runs `test/smoke.mjs`. It:

1. checks tunnel generation in Node (deterministic per seed, connected, branching, winding, 5 banana cells);
2. scans the UI, README and game code for leftover wording from the old non-rabbit version;
3. starts a Vite dev server and checks `GET /` (200, title, rabbit text, "rabbit music") and `GET /src/main.js`;
4. drives the game in headless Chromium through the `window.__game` debug hook:
   - the player is a rabbit with 2 paws and 2 ears
   - exactly 10 bananas (4 garden / 1 house / 5 burrow) and a HUD reading 0/10
   - at least 2 burrow entrances
   - Canela is present, wanders near her hole, and is on screen in a third-person view
   - the music stays silent until Start, then plays
   - you can enter the tunnels, walk a winding BFS path with real collisions, collect a banana, and exit
   - you can enter the house, hop onto the sofa to collect its platanito, and leave again
   - the game is not won at 9/10 and is won at 10/10
   - there are no console errors

```js
__game.debug()        // { player, bananas: { total, collected, surface, house, burrow, list }, zone, hud, entrances, houseDoor, tunnels, npc, music, won }
__game.enterHouse() / __game.exitHouse()
__game.enterBurrow(0) // 0 = Platanito's burrow, 1 = Canela's hole
__game.npc            // Canela
__game.step(60)       // advance the simulation 60 frames without rendering
```

## Code map

- `src/player.js`: the first-person rabbit: hopping movement, sprint, sneak, big hop, and the on-screen paws and ears
- `src/world.js`: garden terrain, house exterior, shed, fence, pond, trees, burrow entrances, props, sky/daylight, collision, grass and flowers
- `src/house.js`: the house interior zone
- `src/underground.js`: seeded tunnel generator (`generateTunnels`) and the underground zone
- `src/collide.js`: box collision with hop-onto surfaces (used by the house)
- `src/entities.js`: golden platanito model, Canela, sparrows, butterflies, ball, particles
- `src/audio.js`: procedural sound (including the foot thump) and the Rabbit Hop music loop
- `src/main.js`: zones, bananas, interactions, HUD, main loop, `window.__game` debug hook
- `test/smoke.mjs`: the `npm test` smoke test
