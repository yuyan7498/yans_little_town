// Boots the town: data → world → people and street → the picture → the UI → the frame loop.
// index.html loads this after the welcome card has painted; the card shows the progress.

import { Group } from 'three';
import * as data from './core/data.js';
import { buildWorld, WorldError } from './core/world/index.js';
import { planFurniture, clearForStops } from './core/world/furniture.js';
import { helicopterAt } from './core/world/helicopter.js';
import { planeOfCrew } from './core/world/flights.js';
import { createPeople, PeopleError } from './core/people/index.js';
import { createNetwork } from './core/street/network.js';
import { createLines } from './core/street/lines.js';
import { createTrips, createTravel } from './core/street/trips.js';
import { createStreet } from './core/street/street.js';
import { toDaySeconds } from './core/clock.js';
import { createTown } from './app/town.js';
import { createView } from './render/scene/index.js';
import { makeFrame } from './render/frame.js';
import * as ground from './render/ground/index.js';
import * as towers from './render/buildings/towers.js';
import * as housing from './render/buildings/housing.js';
import * as commercial from './render/buildings/commercial.js';
import * as civicOffice from './render/buildings/civic-office.js';
import * as schools from './render/buildings/schools.js';
import * as hospital from './render/buildings/hospital.js';
import * as services from './render/buildings/services.js';
import * as industry from './render/buildings/industry.js';
import * as station from './render/buildings/station.js';
import * as roadside from './render/buildings/roadside.js';
import * as luxury from './render/buildings/luxury.js';
import * as downtown from './render/buildings/downtown.js';
import * as amusement from './render/landmarks/amusement.js';
import * as plaza from './render/landmarks/plaza.js';
import * as sports from './render/landmarks/sports.js';
import * as market from './render/landmarks/market.js';
import * as helipad from './render/landmarks/helipad.js';
import * as fireworks from './render/landmarks/fireworks.js';
import * as airship from './render/landmarks/airship.js';
import * as zoo from './render/landmarks/zoo.js';
import * as airport from './render/landmarks/airport.js';
import { createVehicles } from './render/props/vehicles.js';
import { createSignals } from './render/props/signals.js';
import { createStops } from './render/props/stops.js';
import { createFurniture } from './render/props/furniture.js';
import { createCrowd } from './render/people/index.js';
import { createAnimals } from './render/people/animals.js';
import { createWelcome } from './ui/welcome.js';
import { createUI } from './ui/index.js';

// Vehicles move this many times faster than walking pace would suggest (the street layer's pace).
const PACE = 3;
// Figures drawn at once (everyone out on the street, riding or seated).
const CROWD = { full: 560, lite: 360 };
const BUILDINGS = [towers, housing, commercial, civicOffice, schools, hospital, services, industry, station, roadside, luxury, downtown];
const LANDMARKS = [amusement, plaza, sports, market, helipad, fireworks, airship, zoo, airport];

const params = new URLSearchParams(location.search);
const quality = params.get('quality') === 'lite' || params.get('quality') === 'full'
  ? params.get('quality')
  : (matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600 ? 'lite' : 'full');

const welcome = createWelcome();
const nextPaint = () => new Promise(done => requestAnimationFrame(() => setTimeout(done, 0)));

async function boot() {
  welcome.progress('畫出地圖…', 0.05);
  await nextPaint();
  const world = buildWorld(data.town, data.buildings);
  const planned = planFurniture(world);
  const net = createNetwork(world, { spots: planned.spots });
  const lines = createLines(net, world, data.transit, { pace: PACE });

  welcome.progress('居民搬進來…', 0.2);
  await nextPaint();
  // Plans size their street runs by travel time, which needs the residents the people layer
  // makes: the estimator is made after, and only asked once plans are computed.
  let travel = null;
  const people = createPeople({
    world, residents: data.residents, relations: data.relations, occupations: data.occupations,
    buildings: data.buildings, town: data.town, travel: (id, from, to) => travel.minutes(id, from, to)
  });
  people.assignSpots(planned.spots, (id, key) => net.doorOf(id, key));
  travel = createTravel({ world, net, lines, residents: people.residents, pace: PACE });
  const trips = createTrips({ world, net, lines, people, pace: PACE });
  const street = createStreet({ world, net, lines, trips, people, pace: PACE, helicopterAt, planeOfCrew });
  // The bus stops are known only now: furniture in their way moves along the kerb.
  const furniture = clearForStops(planned, street.stops());
  street.setObstacles(furniture.items);
  const town = createTown({ world, people, street, trips, net, loadProfiles: data.loadProfiles, start: toDaySeconds(data.town.start.day, data.town.start.minute) });

  welcome.progress('蓋房子…', 0.4);
  await nextPaint();
  const canvas = document.getElementById('town');
  const view = createView({ canvas, world, quality });
  view.add(ground.create({ world, furniture, quality }));
  for (const m of BUILDINGS) view.add(m.create({ world, quality }));
  await nextPaint();
  welcome.progress('種樹、立路燈…', 0.6);
  await nextPaint();
  const landmarks = LANDMARKS.map(m => view.add(m.create({ world, quality })));
  const fireworksShow = landmarks[LANDMARKS.indexOf(fireworks)];
  // Nests are drawn with the animals that sleep in them.
  view.add(createFurniture(furniture.items.filter(i => i.kind !== 'nest'), world, { quality }));
  view.add(streetModule(street, createSignals(world), createVehicles({ quality }), createStops(street.stops()), stopLights(street.stops())));
  const nests = furniture.spots.filter(s => s.kind === 'nest');
  view.add(crowdModule(street, createCrowd({ capacity: CROWD[quality], quality }), createAnimals({ nests, quality })));

  welcome.progress('鎮民起床中…', 0.85);
  await nextPaint();
  const ui = createUI({ town, view, welcome, start: data.town.start });
  if (params.has('debug')) Object.assign(window, { town, view, ui, world, people, street });
  town.step();
  ui.ready();
  if (params.get('welcome') === '0') welcome.skip();
  run(town, view, ui, world, fireworksShow);
}

// Signals, vehicles and bus stops, drawn from the street each frame.
// A pool of light under each bus shelter (and at a bare stop's pole) at night: the shelter
// stands where a street lamp would, and its lit panel is the light people wait in.
function stopLights(stops) {
  return stops.map(s => {
    const fx = Math.cos(s.heading), fz = Math.sin(s.heading), rx = -fz, rz = fx;   // forward, away from the road
    const along = s.shelter ? -4.8 : 0, out = s.shelter ? 1.2 : 0;
    return { x: s.x + fx * along + rx * out, y: 3.2, z: s.z + fz * along + rz * out, radius: s.shelter ? 8 : 5, color: '#ffe2b8', intensity: s.shelter ? 0.85 : 0.6, group: 'lamps', kind: 'bus-stop' };
  });
}

function streetModule(street, signals, vehicles, stops, lights) {
  const group = new Group();
  group.name = 'street';
  group.add(signals.object, vehicles.object, stops.object);
  return {
    group,
    update(frame) {
      signals.update(street.signals(), frame.time);
      vehicles.update(street.vehicles(), frame);
      if (stops.setLamps) stops.setLamps(frame.lamps);
    },
    dispose() { signals.dispose(); vehicles.dispose(); stops.dispose(); },
    lights
  };
}

// Everyone out of doors: each person keeps a crowd slot while they are out, and a slot
// keeps its figure after they go in, so someone who steps out again soon costs nothing.
// The strays and the dogs out on a walk go to the animals instead.
function crowdModule(street, crowd, animals) {
  const group = new Group();
  group.name = 'crowd';
  group.add(crowd.object, animals.object);
  const pool = [], beasts = [];
  function beast(i, id, species, p, pet) {
    const e = pool[i] || (pool[i] = {});
    e.id = id; e.species = species; e.pet = pet;
    e.x = p.x; e.y = p.y; e.z = p.z; e.heading = p.heading; e.stride = p.stride;
    e.pose = pet ? (p.stride ? 'walk' : 'stand') : p.pose;
    return e;
  }
  const capacity = crowd.info().capacity;
  const slotOf = new Map(), seen = new Int32Array(capacity).fill(-1), isFree = new Uint8Array(capacity).fill(1);
  const free = [];
  for (let s = capacity - 1; s >= 0; s--) free.push(s);
  const shown = [];
  let tick = 0;
  function slotFor(resident) {
    let s = slotOf.get(resident.id);
    if (s !== undefined) return s;
    // The free slot seen longest ago; its old holder loses it.
    let best = -1, at = Infinity;
    for (let i = 0; i < free.length; i++) if (seen[free[i]] < at) { at = seen[free[i]]; best = i; }
    if (best < 0) return -1;
    s = free[best];
    free[best] = free[free.length - 1]; free.pop(); isFree[s] = 0;
    const old = crowd.holder(s);
    if (old != null) slotOf.delete(old);
    if (!crowd.assign(s, resident)) { free.push(s); isFree[s] = 1; return -1; }
    slotOf.set(resident.id, s);
    return s;
  }
  return {
    group,
    update(frame) {
      tick++;
      shown.length = 0; beasts.length = 0;
      for (const w of street.walkers()) {
        const r = w.resident;
        if (r.species) { beasts.push(beast(beasts.length, r.id, r.species, w.point, false)); continue; }
        if (w.point.pet === 'dog') beasts.push(beast(beasts.length, r.id + ':dog', 'dog', w.point, true));
        const s = slotFor(r);
        if (s < 0) continue;
        if (isFree[s]) { isFree[s] = 0; free.splice(free.indexOf(s), 1); }
        seen[s] = tick;
        crowd.pose(s, w.point);
        shown.push(s);
      }
      // Slots not drawn this frame go back to the pool (still holding their figure).
      for (const s of slotOf.values()) if (seen[s] !== tick && !isFree[s]) { free.push(s); isFree[s] = 1; }
      crowd.show(shown);
      animals.update(beasts, frame);
    },
    dispose() { crowd.dispose(); animals.dispose(); },
    info: () => ({ ...crowd.info(), animals: animals.info() })
  };
}

function run(town, view, ui, world, fireworksShow) {
  let last = performance.now(), frames = 0;
  function loop(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    ui.update(dt);
    town.step();
    const frame = makeFrame({
      daySeconds: town.clock.daySeconds, time: now / 1000, dt, lighting: town.lighting(),
      camera: view.camera, cameraState: ui.camera, quality, world
    });
    frame.flash = fireworksShow.glow(frame);
    view.render(frame);
    if (++frames === 3) window.__ready = true;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

boot().catch(err => {
  console.error(err);
  const problems = (err instanceof WorldError || err instanceof PeopleError) && err.problems ? '\n' + err.problems.slice(0, 8).join('\n') : '';
  welcome.error('小鎮蓋不起來：' + (err && err.message ? err.message : String(err)) + problems);
});
