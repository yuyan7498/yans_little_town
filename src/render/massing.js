// A massing model: every site as a plain block of its footprint and height, coloured
// by kind. A stand-in while a site has no building of its own, and a debugging view.
import * as THREE from 'three';
import { ShapeBuilder, material } from './kit.js';

const COLOR = { housing: '#e3d3bd', tower: '#8fb3c9', hospital: '#f2f2ee', primary: '#e8c27a', secondary: '#e8c27a', university: '#d9a95f',
  mall: '#d7a3a8', 'annex-mall': '#d7a3a8', market: '#b9c98f', workshop: '#a9a39b', depot: '#a9a39b', library: '#c8b7d9',
  civic: '#e9e1cf', station: '#9dc4bd', bank: '#e7d08a', precinct: '#8aa6d6', waste: '#8f9a7d', clinic: '#bfe0d6',
  park: '#7aa35b', plaza: '#d8cfbf', amusement: '#e6a2c0', sports: '#bf6b55', 'night-market': '#f0b860' };

export function create({ world, only = null }) {
  const b = new ShapeBuilder();
  for (const s of world.siteList) {
    if (only && !only.includes(s.kind)) continue;
    const f = s.footprint, open = s.open_air || s.kind === 'night-market';
    const h = open ? 0.6 : s.place === 'annex' && s.placement === 'podium' ? s.height + 0.4 : s.height;
    const pad = s.place === 'annex' && s.placement === 'podium' ? 0.6 : 0;
    if (s.kind === 'night-market') { for (const st of world.stalls) b.block(st.booth.x, 0.15, st.booth.z, st.booth.w, 3, st.booth.d, COLOR['night-market']); continue; }
    b.block(f.x, 0.15, f.z, f.w + pad, h, f.d + pad, COLOR[s.kind] || '#cccccc');
  }
  const mesh = new THREE.Mesh(b.build(), material({ roughness: 0.8 }));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'massing';
  const group = new THREE.Group(); group.name = 'massing'; group.add(mesh);
  return { group, update() {}, dispose() { mesh.geometry.dispose(); } };
}

export const preview = ctx => create(ctx);
