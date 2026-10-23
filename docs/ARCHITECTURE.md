# Architecture

彥彥的小鎮 is a static web app: open `index.html` through any static server and a town of
1175 residents lives its week in the browser. No build step; native ES modules; three.js r180
in `vendor/three/`.

```
data/                 everything a person edits: the map, the buildings, the residents,
                      their relations, profiles, bus lines (see data/README.md)
src/core/             pure logic, runs in Node and the browser
  clock.js random.js data.js search.js
  world/              data → world model: roads, junctions, lots, sites, doors, stalls,
                      furniture plan, helicopter flight, the airport's layout and flights
  people/             residents, relations, schedules → one plan per resident per day,
                      occupancy and window lighting, labels for the UI
  street/             walking and driving routes, trips (how each plan's outings are made),
                      street physics, traffic lights, buses and taxis, the live street
src/render/           three.js: one module per part of the picture
  scene/ ground/ buildings/ landmarks/ props/ people/   + kit.js frame.js massing.js
src/app/              the town facade the UI talks to (people + street + clock)
src/ui/               welcome screen, HUD, panels, search, info sheet, camera and input
src/main.js           boots it all
tools/                serve, screenshot, preview harness, data check, anonymiser
test/                 node --test suites
```

## Flow of one frame

1. The clock advances `daySeconds` (96× real time).
2. `people` gives each resident's plan for the day (computed once per day, cached).
3. `street.step(daySeconds)` moves everyone who is out: walkers, riders, cars, buses, taxis,
   through the traffic lights; seats people at the night market and on benches.
4. Each minute, `people.lighting()` sets how many windows glow in each building.
5. Render modules get `update(frame)`; the crowd and vehicles are posed from `street`.
6. The UI updates the HUD and any open panel; the camera follows the selected person.

## Boot order (src/main.js)

1. `buildWorld(town, buildings)` → the world model; `planFurniture(world)` → street furniture and benches.
2. `createNetwork` (walking and driving graphs) → `createLines` (bus routes, stops, taxi rank).
3. `createPeople({ …, travel })` → `people.assignSpots(spots, doorOf)` → `createTravel(…)`: plans size
   their street runs from travel times, so the estimator is made after the residents and only
   asked once plans are computed.
4. `createTrips` (how each street run is made) → `createStreet` (the live street).
5. `createTown` (the facade) → `createView` and every render module → `createUI` → the frame loop:
   `ui.update(dt)` → `town.step()` → `view.render(makeFrame(…))`.
