// The town's ground: roads and their paint, pavements and kerbs, lot forecourts, park
// lawns and paths, the canal with its promenades, road bridges, footbridges and tunnels.
//
//   create({ world, furniture, quality }) → { group, update(frame), dispose(), lights, info() }
//
// `furniture` is the plan from planFurniture(world) (made here if not given). Surfaces are
// merged per material into a dozen meshes: flat ground only receives shadows; the canal's
// walls, bridges, portals and railings also cast them.
import * as THREE from 'three';
import { Mesher } from './mesher.js';
import { buildLayout } from './layout.js';
import { buildSurfaces } from './surfaces.js';
import { buildMarkings } from './markings.js';
import { buildCanal, buildPromenade, buildBridges, buildTunnels } from './structures.js';
import { createWater } from './water.js';
import { asphaltTexture, pavingTexture, slabTexture, grassTexture, reflectionTexture } from './textures.js';
import { planFurniture } from '../../core/world/furniture.js';
import { ShapeBuilder } from '../kit.js';

const KEYS = ['road', 'roadS', 'paving', 'pavingS', 'slab', 'grass', 'plain', 'plainS', 'overlay', 'paint', 'glow', 'tunnelLight', 'water'];
const WATER_PAD = 17;     // the reflection map covers the canal and a little beyond

export function create({ world, furniture = null, quality = 'full' }) {
  const plan = furniture || planFurniture(world);
  const M = Object.fromEntries(KEYS.map(k => [k, new Mesher()]));
  const layout = buildLayout(world);
  const G = { world, layout, furniture: plan, M, ponds: [], copingRuns: [] };

  buildSurfaces(G);
  buildMarkings(G);
  buildCanal(G);
  buildPromenade(G);
  buildBridges(G);
  buildTunnels(G);
  for (const p of G.ponds) {
    const pts = [];
    for (let k = 0; k < 36; k++) { const a = k / 36 * Math.PI * 2; pts.push({ x: p.x + Math.cos(a) * p.rx, z: p.z + Math.sin(a) * p.rz }); }
    M.water.fan(pts, p.y, '#ffffff');
  }

  // ---------------------------------------------------------------- materials
  const aniso = quality === 'lite' ? 4 : 8;
  const textures = {
    asphalt: asphaltTexture(), paving: pavingTexture({ size: 6, tiles: 4 }), slab: slabTexture(), grass: grassTexture(),
    refl: reflectionTexture(((plan && plan.lanterns) || []).map(l => [l.x, l.z]), WATER_PAD, world.board.minZ, world.board.maxZ)
  };
  for (const t of [textures.asphalt, textures.paving, textures.slab, textures.grass]) t.anisotropy = aniso;
  const std = (name, map, roughness, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness, metalness: 0, ...extra });
    m.name = 'ground:' + name;
    return m;
  };
  const mats = {
    road: std('road', textures.asphalt, 0.92), paving: std('paving', textures.paving, 0.88), slab: std('slab', textures.slab, 0.9), grass: std('grass', textures.grass, 1),
    plain: std('plain', null, 0.9),
    overlay: std('overlay', textures.paving, 0.88, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    paint: std('paint', null, 0.7, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    glow: new THREE.MeshBasicMaterial({ color: '#ffcf8a' }),
    tunnelLight: new THREE.MeshBasicMaterial({ color: '#fff0c4' })
  };
  mats.glow.name = 'ground:glow'; mats.tunnelLight.name = 'ground:tunnel-light';
  const water = createWater({ reflection: textures.refl, half: WATER_PAD, zMin: world.board.minZ, zMax: world.board.maxZ });

  const plan2 = {
    road: [mats.road, false], roadS: [mats.road, true], paving: [mats.paving, false], pavingS: [mats.paving, true], slab: [mats.slab, false], grass: [mats.grass, false],
    plain: [mats.plain, false], plainS: [mats.plain, true], overlay: [mats.overlay, false], paint: [mats.paint, false],
    glow: [mats.glow, false], tunnelLight: [mats.tunnelLight, false], water: [water.material, false]
  };
  const group = new THREE.Group();
  group.name = 'ground';
  let triangles = 0;
  for (const key of KEYS) {
    if (!M[key].count) continue;
    const [material, casts] = plan2[key];
    const geometry = M[key].build();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'ground:' + key;
    mesh.castShadow = casts; mesh.receiveShadow = key !== 'glow' && key !== 'tunnelLight';
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    if (key === 'paint' || key === 'overlay') mesh.renderOrder = 1;
    group.add(mesh);
    triangles += M[key].count / 3;
  }
  if (!plan2.water[0].vertexColors) { /* the water ignores vertex colours */ }

  // ---------------------------------------------------------------- lights
  // The promenade lanterns; the lamp posts' own lights come with the furniture models.
  const lights = ((plan && plan.lanterns) || []).map(l => ({
    x: l.light.x, y: l.light.y, z: l.light.z, radius: l.light.radius, color: l.light.color, intensity: 0.8, group: 'lamps', kind: 'promenade'
  }));

  const warm = new THREE.Color('#ffcf8a');
  return {
    group, lights,
    layout, plan,
    update(frame) {
      water.update(frame);
      mats.glow.color.copy(warm).multiplyScalar(0.3 + 0.9 * frame.lamps);
    },
    info: () => ({ triangles, meshes: group.children.length, cells: layout.cells.length }),
    dispose() {
      group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      for (const m of [...Object.values(mats), water.material]) m.dispose();
      for (const t of Object.values(textures)) t.dispose();
    }
  };
}

// ---------------------------------------------------------------- preview
// The whole ground with the furniture plan drawn: the props module's real models when it
// exists, otherwise simple coloured stand-ins.
export async function preview(ctx) {
  const { world } = ctx;
  const furniture = planFurniture(world);
  const ground = create({ world, furniture, quality: ctx.quality });
  const group = new THREE.Group();
  group.add(ground.group);
  let props = null;
  try {
    const mod = await import('../props/furniture.js');
    props = mod.createFurniture(furniture.items, world);
    group.add(props.group);
  } catch {
    group.add(markers(furniture.items));
  }
  const info = document.getElementById('info');
  console.log('ground', ground.info(), 'lanterns', ground.lights.length, 'items', furniture.items.length, 'spots', furniture.spots.length);
  void info;
  return {
    group,
    update(frame) { ground.update(frame); if (props && props.update) props.update(frame); }
  };
}

const MARK = {
  lamp: '#f0c03a', tree: '#4f8a46', bench: '#a7774f', 'river-bench': '#a7774f', 'chess-table': '#8c949b', bin: '#3f8f88', bollard: '#8c949b',
  planter: '#5f8a47', 'bike-rack': '#3e6fa8', vending: '#c9483b', mailbox: '#c9483b', hydrant: '#c9483b', pavilion: '#c9b48a'
};
function markers(items) {
  const sb = new ShapeBuilder();
  for (const it of items) {
    const y = it.y || 0, color = MARK[it.kind] || '#ff00ff', rot = -it.heading;
    if (it.kind === 'tree') {
      sb.cylinder(it.x, y + 1.6, it.z, 0.25, 0.35, 3.2, '#7a5a3a', 6);
      sb.cone(it.x, y + 5.2, it.z, 2.6, 4.4, color, 7);
    } else if (it.kind === 'lamp') {
      sb.cylinder(it.x, y + 4.4, it.z, 0.12, 0.2, 8.8, '#3b4045', 6);
      if (it.light) sb.sphere(it.light.x, it.light.y, it.light.z, 0.5, color);
    } else if (it.kind === 'pavilion') {
      sb.block(it.x, y, it.z, it.w, 0.3, it.d, color, rot);
      sb.cone(it.x, y + 5.5, it.z, it.w * 0.62, 2.4, '#b8664a', 4);
    } else {
      const h = { bench: 1.8, 'river-bench': 1.8, 'chess-table': 1.4, bin: 1.5, bollard: 1.4, planter: 1.6, 'bike-rack': 1.3, vending: 4.2, mailbox: 3, hydrant: 1.6 }[it.kind] || 1.5;
      sb.block(it.x, y, it.z, it.d, h, it.w, color, rot);
    }
  }
  const mesh = new THREE.Mesh(sb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  mesh.castShadow = true;
  mesh.name = 'furniture-markers';
  return mesh;
}
