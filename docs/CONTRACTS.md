# Contracts

The interfaces between the parts of the town. Each part is written against these, in
parallel; the integrator (`src/main.js`, `src/app/town.js`) wires them together. If you must
deviate, keep the deviation small and say exactly what changed in your final report.

## 1. Data (`data/`)

| file | what | owner |
|---|---|---|
| `town.js` | the map: board, canal, avenues, streets, footbridges, tunnel profile, `unsignalled` (junctions without lights), `lots` (lot id → site id; `'A3+A4'` joins two lots), `waterfront`, `nightMarket`, `helicopter`, `airport` (planes, departures, crews), `strays`, `fireworks`, `start` | foundation |
| `buildings.js` | every site: `{id, name, kind, group, capacity, open, hours, floors, style, type, compound, helipad, host, placement, clinic, front}` | foundation |
| `transit.js` | bus lines (`via`: junction refs `'avenue/street'`), fleet order, bus/taxi parameters, service hours | foundation |
| `residents.json` | one resident per line (below) | people |
| `relations.json` | `households`, `links`, `pickUps`, `friendGroups`, `circles` (below) | people |
| `occupations.json` | occupation families `{id, label}` in display order | people |
| `profiles.json` | `{ [residentId]: {bio, traits[], hobbies[], motto, goal, secret} }`, loaded lazily | people |

`src/core/data.js` imports all of them (JSON via import attributes) and exposes `loadProfiles()`.

### Resident

```json
{"id":"office-012","name":"bear_clover87","age":25,"role":"office","job":"會計師","family":"firm",
 "org":"誠信會計師事務所","home":"h-point","work":"t-four","hangout":"c-plaza","birthMonth":10}
```

- `id` stable key (profiles and relations use it). `name` the displayed name (an account-style handle;
  all of them are synthetic). `age`. `job` title, `family` an occupation family id, `org` employer (optional).
- `role` — life pattern and look: `preschooler, student-p, student-m, student-u, office, worker,
  shopkeeper, driver, teacher, school-admin, medical-doc, medical-nurse, hosp-admin, officer, clerk,
  sanitation, unemployed, patient, retiree, senior`.
- `home`, `work` (null for none), `hangout` (a leisure place) — site ids from `data/buildings.js`.
- Optional: `schedule` (a named day that overrides the role's: `mayor`, `president`,
  `transit-driver`, `office-night`), `shift` (`early|evening|night` for doctors, nurses, officers;
  `dawn|evening` sanitation; `dawn|morning` market workers), `post` (`desk|gate`, early-shift
  officers), `crew` (`early|late`, transit drivers), `restDays` (weekday numbers 0=Mon…6=Sun),
  `birthMonth`.

### Relations

```json
{ "households": [{"id":"hh-1","kind":"couple|single|elders|flat","adults":[ids],"kids":[ids],"grandparents":[ids]}],
  "links": { "partner": [[a,b]], "old-partner": [], "parent": [[child,parent]], "sibling": [], "grandparent": [[grandchild,grandparent]],
             "roommate": [], "friend": [], "old-friend": [], "classmate": [], "coworker": [], "fiancee": [[mayor, fiancee]] },
  "pickUps": [[grandparent, pupil]], "friendGroups": [[ids]], "circles": [[ids]] }
```

## 2. World (`src/core/world`) — `buildWorld(town, buildings)`

Throws `WorldError` with a list of readable problems if the data does not fit together.
Returns:

- `board {minX,maxX,minZ,maxZ,halfX,halfZ}`; `river {x0,x1,halfWidth,waterY,banks:[{side,promenade:{x0,x1,walkX},strip:{x0,x1}}]}`;
  `promenades [{side,x,from,to,band}]` (walking line `x`).
- `roads [{id,name,axis:'x'|'z',x|z,from,to,width,half,lanes,kind,river,pedestrian,lanesAt:{car:[offsets],two,kerb,walk}}]`,
  `roadById`, `avenues` (axis z), `streets` (axis x).
- `nodes [{id,index,x,z,roads:[ids],kind:'junction'|'promenade'|'bank'|'joint'|'end',avenue,street}]`.
- `segments [{id,index,road,axis,a,b (node indices),x0,x1,z0,z1,length,width,lanes,over:'land'|'bridge'|'tunnel',vehicles,pedestrian,covered}]`
  — the road network between nodes. Walking happens on pavements beside every segment (both
  sides), on the promenades, over the footbridges, and on pedestrian segments.
- `junctions [{id:'j:<avenue>/<street>',name,node,avenue,street,x,z,hx,hz (box half sizes),arms:{px,nx,pz,nz} (vehicle arms),walkArms,degree,signal,
  zebras:[{arm,walk:'x'|'z',x0,x1,z0,z1,...}],stopLines:[{arm,x0,x1,z0,z1,...}],corners:[{sx,sz,x,z}]}]`; `junctionAt(avenueId, streetId)`.
- `crossings` — signalled mid-block zebras where a promenade crosses a bridge street:
  `{id,name,node,street,x,z,hx,hz,signal:true,midblock:true,zebra:{...},stopLines,corners}`.
- `bridges [{id,name,kind:'road'|'foot',z,x0,x1,abutment,width,rise,street?}]`, `tunnels [{id,street,z,halfD,portalX,coverX,drop}]`.
- `heightAt(x, z, layer='foot'|'road')` — surface height (bridge decks rise, tunnels sink).
- `lots [{id:'A1',col,row,x,z,w,d,x0,x1,z0,z1,site,sides:{n|s|e|w:{kind:'road'|'pedestrian'|'promenade'|'edge',road,centre,half}}}]`, `lotById`.
  A joined lot (`'A3+A4'` in data) is one lot over both and the ground between, with `joins: ['A3', 'A4']`.
- `sites` (Map) / `siteList` / `site(id)` — every place:
  `{id,name,kind,group,capacity,open,hours,floors,height,style,type,compound,helipad,record,
    place:'lot'|'waterfront'|'annex'|'night-market', lot, area (the whole plot), footprint (the building's rect),
    front:'n'|'s'|'e'|'w', door, doors[], gate?, entrance?, roof:{y,x,z,w,d}, annexes:[ids], host?, placement?, open_air?, stalls?}`.
  A rect is `{x,z,w,d,x0,x1,z0,z1}`. A **door** is
  `{x,z,nx,nz (outward normal),side,pause (minutes people stop there),approach:{x,z} (a step outside),facing (heading looking in),gate?}`.
  Annex footprints are reserved: the host's building must leave them free (a `podium` annex is
  the host's lowest floors).
- `stalls [{id,index,name,type:'table'|'counter',bank,x,z,w,d,plot,booth,counterFacing,seats:[Seat],door,stand:[{x,z,heading}]}]`
  — the night market. A **Seat** is `{x,z,heading,y (seat top),kind:'stool'|'bench'|'chess'}`.
- `boxOf(id)` → footprint + height (camera framing, picking); `tallest`.

## 3. Time and frames

`src/core/clock.js`: `SECONDS_PER_MINUTE = 0.625` (a day = 900 real s), `moment(daySeconds)` →
`{day, minute, abs, dow, dayType, daylight, lamps, dusk}`, `format`, `toDaySeconds(day, minute)`.

Every render module's `update(frame)` gets (`src/render/frame.js`):

```js
frame = { time /* real s since start, for animation */, dt, daySeconds, day, minute, abs, dow, dayType,
  daylight /* 0..1 */, lamps /* 0..1 street lights */, dusk /* 0..1 */,
  lighting: { buildings: { [siteId]: { windows /* 0..1 share lit */, entry, sign, visitors /* people there now who are not staff */ } } },
  camera /* THREE.Camera */, cameraState: {x,y,z,yaw,pitch,distance}, quality: 'full'|'lite' }
```

## 4. Render modules

Every module under `src/render/**` that draws part of the town exports:

```js
export function create(ctx)   // ctx = { world, quality, ...module-specific inputs }
  → { group /* THREE.Object3D */, update(frame), dispose(), lights? /* LightSource[] */, info?() }
export function preview(ctx)  // for tools/preview.html; usually create(ctx)
```

Static meshes `matrixAutoUpdate = false` where possible. `castShadow` only on things that
should (buildings, trees, vehicles, people); flat ground only receives.

**LightSource** (static night lights a module owns; the scene draws their pools and glows):
`{x, y, z, radius /* ground pool radius */, color, intensity /* 0..1 */, group: 'lamps'|'facade'|'market'|'sign', kind}`.
Group levels come from the frame: `lamps` → `frame.lamps`; `facade`/`sign` → `frame.lamps`;
`market` → night market hours. The module itself drives its own emissive materials
(lamp heads, windows, signs) from the frame.

### Street furniture and sitting spots — `src/core/world/furniture.js` (pure)

`planFurniture(world) → { items, spots }`
- `items [{id, kind, x, z, heading, w, d, light?: {y, radius, color}}]`, kinds at least
  `lamp, tree, bench, river-bench, chess-table, bin, bollard, planter, bike-rack, vending, mailbox, hydrant`.
  Trees also carry `species` and `size`. `w,d` is the ground footprint (walkers step round it).
- `spots [{id:'bench:<n>', kind:'bench'|'chess', label, x, z, seats:[Seat], door, stand:[{x,z,heading}]}]`
  — places people sit (benches in parks, on the pedestrian street and the promenade; chess tables).

### Shared model constants

`src/render/props/seats.js`: `HIP_HEIGHT` (1.85) and `SEATS.scooter|bicycle = {y, back, pillion}`.

### People figures — `src/render/people/`

```js
createCrowd({ capacity = 420 }) → { object, assign(slot, resident) → bool, pose(slot, p), show(slots), holder(slot), dispose(), info() }
p = { x, y, z, heading, stride /* walk phase in radians, 0 standing */, pose: 'walk'|'stand'|'scooter'|'bicycle'|'pillion'|'bench'|'stool'|'chess', eat? /* 0..1 */ }
// riding: (x,y,z) is the vehicle's ground point; seated: y is the seat top
createFigure(resident) → { object, update(stride, pose), dispose() }   // one figure (follow marker)
appearanceOf(resident) → plain description (pure)                     // what the figure wears
```

### Vehicles, signals, stops, furniture models — `src/render/props/`

```js
createVehicles({ quality }?) → { object, update(list, frame), dispose(), info() }
  list: [{ id, kind: 'scooter'|'bicycle'|'car'|'taxi'|'bus'|'police'|'van', x, y, z, heading, color? }]
createSignals(world) → { object, update(states /* Map junctionOrCrossingId → {phase:'ns'|'ew'|'walk', stage:'green'|'amber'|'red'|'walk'|'flash'} */, time), dispose() }
createStops(stops /* [{x,z,heading,shelter}] from street.stops() */) → { object, dispose(), setLamps(v) }
createFurniture(items, world, { quality }?) → { group, update(frame), dispose(), lights, info() }
```

### Ground — `src/render/ground/`

`create({ world, furniture })` → roads and markings (lane lines, zebras, stop lines from the world),
pavements, kerbs, lots' ground, park lawns and paths, canal water, promenades and strips,
bridges, footbridges, tunnel portals; `lights` for the promenade.

### Buildings — `src/render/buildings/`

One module per family; each draws every site of its kinds from `world.siteList`, inside the
site's `footprint`, `height` from `floors`, the door at `door`/`entrance`, walls and gate for
`compound` sites on the `area` edge with the opening at `gate`, annex footprints left free,
`roof` clear for the helipad on the `helipad` site. Windows glow at night by
`frame.lighting.buildings[id].windows`, signs (with `site.name`) by `.sign`. Adapts to any lot
size (a lot swap may put it on a lot of a different size).

### Landmarks — `src/render/landmarks/`

Amusement park, plaza with monument and fountain, sports ground, the night-market stalls (from
`world.stalls`), the helipad and the president's helicopter, fireworks, the airship, the zoo
with its animals, the airport with the airline's planes.
`src/core/world/helicopter.js` (pure): `helicopterAt(world, daySeconds)` →
`{phase:'parked'|'boarding'|'take-off'|'circuit'|'landing'|'shutdown', x, y, z, heading, bank, pitch, rotor}`
from `data/town.js` `helicopter`.
`src/core/world/flights.js` (pure), from `data/town.js` `airport`: `airportOf(world)` → the layout (runway,
taxiway, links, apron, stands, terminal, tower, hangar, car park as world and plot rects); `planesAt(world, daySeconds)` →
`[{id, name, flight, route, phase, x, y, z, heading, pitch, bank, gear, spin, speed, lights:{nav, beacon, landing, strobe}, moving, away, homeward}]`;
`flightsOn(world, day)`, `dutiesOn(world, day)` (two trips of a plane per duty, crews in turn), `crewRoster(residents)`,
`planeOfCrew(world, crew, daySeconds)`.

### Scene — `src/render/scene/`

```js
createView({ canvas, world, quality }) → view = {
  renderer, scene, camera,
  add(module), remove(module),            // modules from create(); their lights are collected
  setCamera({x, y, z, yaw, pitch, distance}), // orbit rig: eye = pivot + distance·(sin yaw·cos pitch, sin pitch, cos yaw·cos pitch), fov 30°
  render(frame), resize(w, h), info(), dispose() }
```
Sky (day, dusk, night, sun, moon, stars, the Milky Way `assets/sky/milky-way.jpg`, 3k on lite),
sun light with shadows, ambient, exposure, fog, night light pools and glows for every module's
`lights`, quality tiers.

## 5. People — `src/core/people/`

```js
createPeople({ world, residents, relations, occupations, buildings, town, travel? }) → people = {
  // travel(id, fromPlace, toPlace) → town minutes door to door; when given, every street run is
  // sized from it (src/core/street/trips.js createTravel). Called only when plans are computed.
  residents, byId,                             // normalised residents (+ derived: household, clinic …)
  job(id) → {title, family, familyLabel, org}, families /* occupations in order */,
  relationsOf(id) → [{id, kind, label, group:'family'|'friends'|'work'}], stats(),
  assignSpots(spots, doorOf) /* circles of old friends get a bench near home; call once before plans */,
  planFor(id, day) → Plan, plansFor(day) → Map(id → Plan),   // deterministic, cached
  segmentAt(plan, minute) → {segment, index},
  occupancy(day, minute) → { byPlace: {id: {present: [ids], awake, working}}, street },
  lighting(day, minute) → { buildings: {id: {windows, entry, sign}} },
  validatePlan(plan, previousDayPlan?) → {ok, problems},
  describe: { activity(segment) → '上課', shift(id), rest(id), facts(id) → [[label, value]] }
}
Plan = { owner, day, dayType, segments: [{ start, end, state, place, activity, party? }] }
```
`state` ∈ `HOME SLEEPING COMMUTE AT_WORK LEISURE MEDICAL SHOPPING DINING`; `place` a site id,
`'street'`, or a spot id (`bench:3`); segments cover [0, 1440) without gaps. A run of `street`
segments is one trip. `party` (optional) names a group going together (household, circle,
friend group, date) so the street layer can walk them side by side.

## 6. Street — `src/core/street/`

**Network** (street-net): `createNetwork(world, { spots })` → `{ walkGraph, roadGraph, doorOf(placeId, key),
route(from, to, key) → Path, ride(from, to, key, 'car'|'two', cost?) → Path(with legs), walkBetween(a, b),
subPath(path, s0, s1), sampleAt(path, s) → {x,z,heading,distance}, approach(pos, heading, target, arriveHeading),
loopLane(nodes), roomAt(x, z), zebras }`.

**Path** `{ points:[{x,z}], lengths:[], total, loop?, doors:[door, door], legs?: {walkEnd, driveStart, driveEnd, walkStart}, roadEdges?, junctions? }`.

**Transit lines** (street-net): `createLines(net, world, transitData, { pace })` →
`{ routes, stops:[{id,route,s,kerb,lane,heading,shelter}], rank, runsOf(duty), passTime, planBus, taxiOnDuty, BUS, TAXI }`.

**Travel** (street-net): `createTravel({ world, net, lines, residents, pace })` → `{ minutes(id, from, to), modeOf(id, from, to) }`
— plan-independent door-to-door estimate with the same mode rules as trips; feeds `createPeople({ travel })`.

**Trips** (street-net): `createTrips({ world, net, lines, people, pace })` →
`{ tripsFor(day) → { list: Trip[], byResident: Map, stays: Stay[] }, stallOf(tripKey) }`.

**Trip** `{ key, resident (object), day, from, to, start, end, mode: 'walk'|'bicycle'|'scooter'|'car'|'family'|'taxi'|'bus',
path, depart, arrive, speed, rideSpeed, t1, t2, pauseOut, pauseIn, lane, loop, bus?, walk1?, walk2?, taxiRide?,
leader?, followers?, timed }` (times in town minutes of the trip's day).
**Stay** `{ resident, place, spot (stall or bench spot), state, activity, start, end, in: Trip, out: Trip|null, party }`.

**Runtime** (street-sim): `createStreet({ world, net, lines, trips, people, pace, helicopterAt, planeOfCrew, obstacles /* planFurniture items */ })` → street = {
`setObstacles(items)`, `audit({day, from, to, step, jitter})`,
`step(daySeconds)` — move everyone to this moment (handles jumps in time),
`walkers()` → `[{ resident, point: {x, y, z, heading, stride, pose, riding?, aboard?}, trip?, stay? }]` (everyone to draw on foot, riding or seated),
`vehicles()` → `[{ id, kind, x, y, z, heading, color }]` (everything on wheels to draw),
`signals()` → Map id → `{phase, stage}`, `stops()`,
`whereIs(id)` → `{kind:'street', x, z, heading, mode, phase, trip} | {kind:'seated', spot, x, z} | {kind:'driving', vehicle, x, z} | {kind:'aloft', x, y, z, plane?} | null` (null: inside per plan; aloft: the president in the helicopter, a crew in their moving plane),
`vehicleInfo(id)` → `{id, kind, label, sub, x, z, people:[{id, role}]}`,
`tapTargets()` → `[{key, kind:'person'|'vehicle', id, x, y, z, radius}]`, `info()` }.

## 7. Town facade and UI

`src/app/town.js` (integrator) gives the UI one object:

```js
town = { world, people, street,
  clock: { daySeconds, moment(), setDay(day), setMinute(minute), speed },
  residents, resident(id), job(id), relationsOf(id), profile(id) /* Promise */,
  sites /* searchable list */, site(id), presentAt(siteId) → [ids],
  statusOf(id) → '在 鎮公所' …, whereIs(id) → {inside:true, site} | {inside:false, x, y, z, aloft?},
  dayEntries(id) → [{start, end, text, walk}], facts(id) → [[label, value]],
  vehicleInfo(id) /* also 'helicopter' and 'plane:<registration>' */, tapTargets(), search(query) → {query, sites, people} /* query: name, @name, job, building */ }
```

UI (`src/ui/`): `createUI({ town, view, canvas })` → `{ update(dt), select(...), ... }`, plus the
camera rig (`src/ui/camera.js`: orbit math, home framing, `flyTo`, follow) and input gestures.
