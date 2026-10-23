# Conventions

Read this, `docs/ARCHITECTURE.md` and `docs/CONTRACTS.md` before writing code.

## Clean room (most important)

This codebase is a from-scratch rewrite so it can be open-sourced. It must contain **no code
derived from the earlier version or from its upstream project ("thousand-town")**.

- The earlier version lives on git branch `main`. You may **not** read most of it. The only
  files on `main` you may look at — for *behaviour*, never to copy text from — are:
  `town-walk.js`, `town-traffic.js`, `town-transit.js`, `town-crowd.js`, `town-rides.js`,
  `town-signals.js`, `town-start.js`, `sketch.js`, `index.html`, `style.css`, `README.md`,
  `city-life-ext/relations.js`, `city-life-ext/town-roster.js` (read with `git show main:<path>`).
  Your brief says which of these concern you; the street agents may port the algorithms in
  the first six into the new structure (they are this project's own work), rewritten to the
  new contracts.
- **Never open** any other file from `main` or any older commit (`city-*.js`,
  `city-life-ext/*` other than the two above, `resident-*.js`, `assets/*.js`, minified files),
  nor anything under `../ref/`. Do not search the web for the upstream project.
- Every model, shader, schedule and algorithm not in the list above is designed fresh.

## Code

- Native ES modules, no build step, no npm runtime dependencies. `three` is imported as
  `import * as THREE from 'three'` (import map → `vendor/three/`); addons as
  `three/addons/...` (only what is in `vendor/three/addons/`).
- `src/core/**` is pure: no DOM, no THREE, runs in Node 22+ and the browser. Everything with
  randomness is deterministic: use `src/core/random.js` (`hash`, `unit`, `pick`, `rng`) keyed
  by strings such as `resident.id + ':ride'`. Never `Math.random()` in core.
- `src/render/**` may use THREE and the DOM (canvas textures). No simulation logic.
- Plain modern JavaScript (2023). 2-space indent, semicolons, single quotes, `const`/`let`.
  Small functions with names that say what they do. Comments in English, explaining *why*
  and the non-obvious; keep them short. User-facing text is Traditional Chinese (Taiwan).
- No coordinates of the map anywhere except `data/town.js`. Read positions from the world
  model (`world.sites`, `world.junctions`, `world.roads` …). Sizes of objects you design
  (a bench, a car, a window) are fine to state.
- Data lives in `data/`. If a value is something a person would want to tune (a name, an
  opening hour, a share of people who do X), put it in data or in a clearly named constant at
  the top of the module.
- Do not edit files you do not own (see ARCHITECTURE.md). If you need a change in someone
  else's file or in a shared contract, write it in your final report instead.
- Do not commit; the integrator commits.

## Units, axes, scale

- x east (+) / west (−), z south (+) / north (−), y up. Ground (lots, pavements) at y = 0.15,
  carriageway at y = 0, canal water at y = −1.2 (`src/core/world/geometry.js` → `Y`).
- Heading = `Math.atan2(dz, dx)` (0 = facing +x/east, π/2 = facing +z/south).
- **Every model's forward is +x local, up +y, width along z.** Place it with
  `object.rotation.y = -heading`.
- Town minutes for time of day (0–1440), `daySeconds` for absolute time (see `src/core/clock.js`).
- Scale is stylised so people read from far away:
  | thing | size |
  |---|---|
  | adult figure | 4.3 tall, hips 1.85 (`HIP_HEIGHT`) |
  | child 6–12 / teen | ~3.0–3.4 / ~3.9 tall |
  | storey | 6 |
  | car / taxi | 8.6 long, 3.4 wide |
  | bus | 12.6 long, 3.8 wide |
  | scooter (with rider) | 3.3 long, 0.84 wide; seat 1.92 high |
  | bicycle | 2.9 long, 0.9 wide; seat 2.12 high |
  | lane | car lanes at 2.4 (and 7.2 on trunk roads) from the centre line |
  | bench / stool seat | 1.4 / 1.35 high |
  | street lamp | ~9 tall |

## Look

Warm, clean, modern Taiwanese town, low-poly stylised: faceted shapes, flat vertex colours,
`MeshStandardMaterial` (roughness ~0.7–0.9, little metal except glass/steel), soft sun
shadows. Readable at a whole-town zoom and pleasant up close. Palette in `src/render/kit.js`.
Signs and text in Traditional Chinese.

## Performance

Desktop 60 fps, phones 30 fps (`quality: 'lite'`). Whole town at overview: ≤ 300 draw calls and
≤ 1.5 M triangles in total. Merge static geometry per material (`ShapeBuilder`), instance
anything repeated, never one mesh per window/tree/person. No per-frame allocation in hot
paths. Budgets per module are in your brief.

## Testing and checking your work

- Core logic: `node --test` tests under `test/<area>/`. Run `npm test`.
- Render modules export `preview(ctx)` and are viewed with `tools/preview.html?m=<path>`.
  A dev server runs at `http://127.0.0.1:8123` (`npm run serve` if it is not up).
  Take screenshots with
  `node tools/shot.mjs "/tools/preview.html?m=src/render/...&cam=x,y,z,tx,ty,tz&minute=600" .shots/<name>.png`
  and **look at them** (Read the PNG). Check day (minute=600) and night (minute=1290).
  The tool prints console errors; fix every one. Put screenshots in `.shots/` (git-ignored).
- No z-fighting (faces flicker as the camera moves): two faces facing the same way must never lie in
  one plane where they overlap. Bands and trims stand ≥0.05 proud of the wall they wrap, signs ≥0.06
  off a wall, ground layers ≥0.03 apart (≥0.05 for big ones). Check a module with
  `node tools/shot.mjs "/tools/preview.html?m=<module>&ground=0" .shots/zf.png --eval "import('/tools/zfight.js').then(m => m.report(window.preview.scene))"`.
