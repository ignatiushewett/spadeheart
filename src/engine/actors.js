// Instanced humanoid rendering with three LODs. One draw call per LOD covers every zombie,
// survivor and corpse; clothing comes from a per-variant colour row, so no two bodies match.
import { makeRng } from '../shared/rng.js';

const STRIDE = 8; // floats per instance
export const SLOT = { SKIN: 0, SHIRT: 1, SHIRT2: 2, PANTS: 3, SHOES: 4, HAIR: 5, HAT: 6, VEST: 7, EYE: 8, MOUTH: 9, GUN: 10, WOOD: 11, BLADE: 12, MIL: 13, PACK: 14, BAND: 15 };
export const HUMAN_VARIANT_START = 192;
// heavy, medium and light are armour for the watch, by how far out they work: the pair in front of each gate, the patrols, and the
// people on the gates and walls. Only how they look: what armour actually does is the same for all of them.
export const WARDROBE = { civ: [192, 16], mil: [208, 16], scrap: [224, 8], raider: [232, 8], med: [240, 16], heavy: [256, 16], medium: [272, 16], light: [288, 16] };
// Carried weapons, drawn from the actor mesh. The id travels in the instance data.
export const NPC_WEAPON = { pistol: 1, rifle: 2, shotgun: 3, smg: 4, sniper: 5, lmg: 6, crossbow: 7, bat: 8, machete: 9, katana: 10, axe: 11, spear: 12 };
const SCALE = .1;

function buildMesh(gl, build, instanceCap) {
  const verts = [], idx = [];
  const emit = (a, b, c, d, n, bone, slot) => {
    const base = verts.length / 8;
    for (const p of [a, b, c, d]) verts.push(p[0] * SCALE, p[1] * SCALE, p[2] * SCALE, n[0], n[1], n[2], bone, slot);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  // Emits the six faces of a box, greedily merging cells that share a material slot. inset pulls its two x faces in
  // a touch: a limb swings in the plane of its own sides, so at a joint two flush parts would fight for the same pixels.
  const part = (x0, y0, z0, x1, y1, z1, bone, slotFn, inset = 0) => {
    const pull = (p) => [p[0] === x0 ? x0 + inset : p[0] === x1 ? x1 - inset : p[0], p[1], p[2]];
    const face = (nu, nv, cell, corner, n) => {
      const used = new Uint8Array(nu * nv);
      for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) {
        if (used[u + v * nu]) continue;
        const s = cell(u, v);
        let w = 1;
        while (u + w < nu && !used[u + w + v * nu] && cell(u + w, v) === s) w++;
        let h = 1;
        outer: while (v + h < nv) {
          for (let k = 0; k < w; k++) if (used[u + k + (v + h) * nu] || cell(u + k, v + h) !== s) break outer;
          h++;
        }
        for (let a = 0; a < h; a++) for (let b = 0; b < w; b++) used[u + b + (v + a) * nu] = 1;
        emit(pull(corner(u, v)), pull(corner(u + w, v)), pull(corner(u + w, v + h)), pull(corner(u, v + h)), n, bone, s);
      }
    };
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    // Each corner function winds counter-clockwise seen from outside the box.
    face(dz, dy, (u, v) => slotFn(x1 - 1, y0 + v, z0 + dz - 1 - u, 'x+'), (u, v) => [x1, y0 + v, z0 + dz - u], [1, 0, 0]);
    face(dz, dy, (u, v) => slotFn(x0, y0 + v, z0 + u, 'x-'), (u, v) => [x0, y0 + v, z0 + u], [-1, 0, 0]);
    face(dx, dz, (u, v) => slotFn(x0 + u, y1 - 1, z0 + dz - 1 - v, 'y+'), (u, v) => [x0 + u, y1, z0 + dz - v], [0, 1, 0]);
    face(dx, dz, (u, v) => slotFn(x0 + u, y0, z0 + v, 'y-'), (u, v) => [x0 + u, y0, z0 + v], [0, -1, 0]);
    face(dx, dy, (u, v) => slotFn(x0 + u, y0 + v, z1 - 1, 'z+'), (u, v) => [x0 + u, y0 + v, z1], [0, 0, 1]);
    face(dx, dy, (u, v) => slotFn(x0 + dx - 1 - u, y0 + v, z0, 'z-'), (u, v) => [x0 + dx - u, y0 + v, z0], [0, 0, -1]);
  };
  // A plain box at any size, for small detail that does not sit on the body's voxel grid.
  const box = (x0, y0, z0, x1, y1, z1, bone, slot) => {
    emit([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], bone, slot);
    emit([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], bone, slot);
    emit([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], bone, slot);
    emit([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], bone, slot);
    emit([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], bone, slot);
    emit([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], bone, slot);
  };
  build(part, box);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.bufferData(gl.ARRAY_BUFFER, instanceCap * STRIDE * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 4, gl.FLOAT, false, STRIDE * 4, 0);
  gl.vertexAttribDivisor(3, 1);
  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(4, 4, gl.FLOAT, false, STRIDE * 4, 16);
  gl.vertexAttribDivisor(4, 1);
  gl.bindVertexArray(null);
  return { vao, inst, count: idx.length, data: new Float32Array(instanceCap * STRIDE), n: 0, cap: instanceCap };
}

// Weapons are built around the hand, which sits at y = 11 at the end of the arm. -y runs towards the
// muzzle and +z is up once the arm is raised to aim. Sizes are true to a person three voxels tall, and
// every part sits strictly inside the arm's outline where they meet, so no faces are ever coplanar.
const CX = 5.5;   // the arm's centre line
const gunBox = (box, w, y0, z0, y1, z1, bone, slot) => box(CX - w / 2, y0, z0, CX + w / 2, y1, z1, bone, slot);
const weaponParts = (box) => {
  const W = NPC_WEAPON, B = (id) => 3 + id * 10;
  const G = SLOT.GUN, Wd = SLOT.WOOD, Bl = SLOT.BLADE, Ml = SLOT.MIL;
  const g = (id, w, y0, z0, y1, z1, slot = G) => gunBox(box, w, y0, z0, y1, z1, B(id), slot);
  // Pistol
  g(W.pistol, .7, 7.2, .5, 11.4, 1.5); g(W.pistol, .55, 6.6, .75, 7.2, 1.2); g(W.pistol, .6, 10, -1.1, 11.3, .5);
  // M4: muzzle, barrel, front sight, ribbed handguard, flat-top receiver and rail, rear sight, curved magazine, grip, tube, stock.
  g(W.rifle, .56, -6.2, .62, -5.2, 1.18); g(W.rifle, .36, -5.2, .72, -2, 1.08); g(W.rifle, .3, -2.6, 1.1, -2, 2.35); g(W.rifle, .5, -2.6, .55, -2, 1.1);
  g(W.rifle, 1, -2, .2, 3, 1.5); for (let y = -1.4; y < 3; y += 1.1) g(W.rifle, 1.06, y, .42, y + .4, 1.28, Ml);
  g(W.rifle, 1.1, 3, -.1, 11, 1.55); g(W.rifle, .72, 3, 1.55, 10.2, 1.85, Ml); g(W.rifle, .76, 8.4, 1.85, 9.2, 2.35);
  g(W.rifle, .8, 5.1, -1.7, 7.3, -.1, Ml); g(W.rifle, .76, 4.5, -3.2, 6.7, -1.7, Ml);
  g(W.rifle, .8, 9.3, -2, 10.8, -.1); g(W.rifle, .46, 11, .55, 13.1, 1.05); g(W.rifle, .84, 13.1, -.35, 15.6, 1.4); g(W.rifle, .9, 15.6, -.75, 16, 1.5);
  // Pump shotgun
  g(W.shotgun, .6, -7, .95, 5.2, 1.5); g(W.shotgun, .42, -5.4, .46, 4.8, .9); g(W.shotgun, .84, -2.4, .12, 1.6, 1.02, Wd); g(W.shotgun, .84, 4.8, .1, 10.4, 1.6);
  g(W.shotgun, .7, 9, -1.1, 10.8, .2, Wd); g(W.shotgun, .8, 10.8, -.5, 16, 1.2, Wd);
  // SMG
  g(W.smg, .4, -.6, .85, 3, 1.25); g(W.smg, .9, 3, .15, 11, 1.6); g(W.smg, .6, 6.4, -3.4, 7.6, .15, Ml); g(W.smg, .7, 9.4, -1.5, 10.8, .15); g(W.smg, .3, 11, .95, 14.4, 1.25); g(W.smg, .7, 14.4, -.1, 14.9, 1.3);
  // Scoped rifle
  g(W.sniper, .6, -10, .5, .6, 1.1); g(W.sniper, .8, .6, -.05, 11, 1.1, Wd); g(W.sniper, .84, 11, -.7, 16, .95, Wd); g(W.sniper, .36, 5, 1.1, 5.6, 1.7); g(W.sniper, .36, 8, 1.1, 8.6, 1.7); g(W.sniper, .62, 3.6, 1.7, 9.8, 2.32);
  // M249: heavy barrel, long body, ammunition box, bipod.
  // M249: flash hider, front sight and gas tube, the bipod folded under the barrel, heat shield and carry handle, the square receiver
  // with its raised feed cover and rear sight, the olive ammunition pouch hung under it with the belt going up, pistol grip, stock.
  g(W.lmg, .6, -7.6, .65, 1.4, 1.2); g(W.lmg, .8, -8.2, .55, -7.6, 1.3); g(W.lmg, .25, -6.6, 1.2, -6.2, 2); g(W.lmg, .45, -5.2, .1, 1.4, .55);
  box(CX - .5, -5.6, -.25, CX - .25, -.4, .05, B(W.lmg), G); box(CX + .25, -5.6, -.25, CX + .5, -.4, .05, B(W.lmg), G);
  g(W.lmg, .7, -3, 1.2, 1.4, 1.45); g(W.lmg, .3, -1.6, 1.8, -1.2, 2.7); g(W.lmg, .3, .6, 1.8, 1, 2.7); g(W.lmg, .3, -1.6, 2.7, 1, 2.95);
  g(W.lmg, 1.1, -.6, -.6, 2.6, .65); g(W.lmg, 1.3, 1.4, -.05, 10.6, 1.8); g(W.lmg, 1.34, 2.6, 1.8, 8, 2.25); g(W.lmg, .5, 8.2, 1.8, 8.8, 2.4);
  g(W.lmg, 1.4, 4.8, -3, 9, -.05, Ml); box(CX - .85, 5.5, -.6, CX - .66, 8.5, 1.2, B(W.lmg), Bl);
  g(W.lmg, .8, 9.6, -1.5, 10.9, -.05); g(W.lmg, .9, 10.6, .1, 16, 1.4); g(W.lmg, .8, 12.4, -.6, 15.6, .1); g(W.lmg, 1, 16, -.7, 16.4, 1.6);
  // Crossbow
  g(W.crossbow, .7, -.5, .4, 13, 1.2, Wd); box(1.6, .2, .6, 9.4, .8, 1, B(W.crossbow), Bl); g(W.crossbow, .5, 10, -.8, 11.4, .4, Wd);
  // Hand weapons
  g(W.bat, .9, -1, .1, 8, 1, Wd); g(W.bat, .6, 8, .2, 12.6, .85, Wd);
  g(W.machete, .16, .5, -.1, 10.2, 1.2, Bl); g(W.machete, .5, 10.2, .2, 12.8, .9, Wd);
  g(W.katana, .16, -2.5, .2, 9.6, .8, Bl); g(W.katana, .8, 9.6, -.1, 10, 1.1); g(W.katana, .46, 10, .25, 13, .75);
  g(W.axe, .46, 0, .3, 13, .8, Wd); g(W.axe, .22, -.2, .8, 2.4, 3.2, Bl); g(W.axe, .3, .3, -.5, 1.9, .3, Bl);
  g(W.spear, .36, -9, .35, 16, .71, Wd); g(W.spear, .2, -12.5, .2, -9, .86, Bl);
};

// Same weapons, coarser, for the middle distance.
const weaponPartsMid = (box) => {
  const W = NPC_WEAPON, B = (id) => 3 + id * 10;
  const G = SLOT.GUN, Wd = SLOT.WOOD, Bl = SLOT.BLADE, Ml = SLOT.MIL;
  const g = (id, w, y0, z0, y1, z1, slot = G) => gunBox(box, w, y0, z0, y1, z1, B(id), slot);
  g(W.pistol, .8, 7, .3, 11.4, 1.6);
  g(W.rifle, .6, -6, .6, -2, 1.2); g(W.rifle, 1.1, -2, -.1, 11, 1.8); g(W.rifle, .9, 5, -3, 7, -.1); g(W.rifle, .9, 11, -.3, 16, 1.4);
  g(W.shotgun, .6, -7, .5, 5, 1.4); g(W.shotgun, .9, 5, -.2, 16, 1.5, Wd);
  g(W.smg, 1, 0, .1, 11, 1.7); g(W.smg, .7, 6, -3.2, 8, .1);
  g(W.sniper, .6, -10, .5, 1, 1.1); g(W.sniper, .9, 1, -.3, 16, 1.2, Wd); g(W.sniper, .7, 4, 1.2, 10, 2.2);
  g(W.lmg, .8, -8.2, .55, 2, 1.3); g(W.lmg, 1.3, 2, -.1, 16, 1.8); g(W.lmg, 1.34, 2.6, 1.8, 8, 2.3); g(W.lmg, 1.4, 5, -2.8, 9, -.1, Ml); g(W.lmg, .3, -1.6, 1.8, 1, 2.9);
  g(W.crossbow, .8, 0, .3, 13, 1.3, Wd); box(1.6, .2, .5, 9.4, 1, 1.1, B(W.crossbow), Wd);
  g(W.bat, 1, -1, 0, 12.6, 1, Wd);
  g(W.machete, .4, .5, -.1, 12.8, 1.2, Bl);
  g(W.katana, .4, -2.5, .1, 13, .9, Bl);
  g(W.axe, .6, -.2, .2, 13, 3, Wd);
  g(W.spear, .5, -12.5, .2, 16, .8, Wd);
};

const bodyDetail = (part, box) => {
  const legSlot = (x, y) => (y < 2 ? SLOT.SHOES : SLOT.PANTS);
  // Up close, limbs have a joint in the middle. Bones 7 and 8 are the shins, bone 9 a forearm.
  part(-4, 0, -2, 0, 6, 2, 7, legSlot, .26); part(-4, 6, -2, 0, 12, 2, 4, legSlot, .13);
  part(0, 0, -2, 4, 6, 2, 8, legSlot, .26); part(0, 6, -2, 4, 12, 2, 5, legSlot, .13);
  part(-4, 12, -2, 4, 21, 2, 0, (x, y, z, f) => {
    if (y === 12) return SLOT.PANTS;
    if (f === 'z+' && x >= -1 && x <= 0 && y >= 14) return SLOT.SHIRT2;
    if (f === 'z+' && y === 20 && (x < -2 || x > 1)) return SLOT.SHIRT2;
    if ((x === -4 || x === 3) && y > 13) return SLOT.VEST;
    if ((f === 'z+' || f === 'z-') && (x <= -3 || x >= 2) && y >= 13) return SLOT.VEST;
    return SLOT.SHIRT;
  });
  const armSlot = (x, y) => (y >= 16 ? SLOT.SHIRT : SLOT.SKIN);
  part(-7, 11, -1, -4, 16, 2, 9, armSlot, .13); part(-7, 16, -1, -4, 21, 2, 2, armSlot);
  part(4, 11, -1, 7, 16, 2, 9, armSlot, .13); part(4, 16, -1, 7, 21, 2, 3, armSlot);
  part(-3, 21, -3, 3, 28, 3, 1, (x, y, z, f) => {
    if (y >= 26 || f === 'z-' || (y >= 24 && (x === -3 || x === 2) && f !== 'z+')) return SLOT.HAIR;
    if (f === 'z+') {
      if (y === 24 && (x === -2 || x === 1)) return SLOT.EYE;
      if (y === 22 && x >= -1 && x <= 0) return SLOT.MOUTH;
    }
    return SLOT.SKIN;
  });
  part(-4, 28, -4, 4, 29, 5, 6, () => SLOT.HAT);
  part(-3, 29, -3, 3, 30, 3, 6, () => SLOT.HAT);
  // A helmet, for the armoured watch: a shell down over the top and sides of the head, eyes clear. Bone 7 is drawn as the hat's bone (6)
  // but only on rows with the helmet flag, which hides the cap.
  part(-4, 25, -4, 4, 29, 4, 7, () => SLOT.HAT);
  part(-3, 29, -3, 3, 30, 3, 7, () => SLOT.HAT);
  part(-3, 13, -4, 3, 20, -2, 0, () => SLOT.PACK);
  // A faction armband on each sleeve, just proud of the arm on every side so it never z-fights.
  box(-7.2, 17, -1.2, -3.8, 19, 2.2, 2, SLOT.BAND);
  box(3.8, 17, -1.2, 7.2, 19, 2.2, 3, SLOT.BAND);
  weaponParts(box);
};

// What makes someone recognisable lasts as long as the body does: hair, hat, face, sleeves, boots and whatever they have on over their shirt.
const headSlot = (x, y, z, f) => {
  if (y >= 26 || f === 'z-' || (y >= 24 && (x === -3 || x === 2) && f !== 'z+')) return SLOT.HAIR;
  if (f === 'z+') {
    if (y === 24 && (x === -2 || x === 1)) return SLOT.EYE;
    if (y === 22 && x >= -1 && x <= 0) return SLOT.MOUTH;
  }
  return SLOT.SKIN;
};

const bodyMid = (part, box) => {
  const legSlot = (x, y) => (y < 2 ? SLOT.SHOES : SLOT.PANTS);
  part(-4, 0, -2, 0, 12, 2, 4, legSlot, .13);
  part(0, 0, -2, 4, 12, 2, 5, legSlot, .13);
  part(-4, 12, -2, 4, 21, 2, 0, (x, y) => (y === 12 ? SLOT.PANTS : x === -4 || x === 3 ? SLOT.VEST : SLOT.SHIRT));
  const armSlot = (x, y) => (y >= 16 ? SLOT.SHIRT : SLOT.SKIN);
  part(-7, 11, -1, -4, 21, 2, 2, armSlot);
  part(4, 11, -1, 7, 21, 2, 3, armSlot);
  part(-3, 21, -3, 3, 28, 3, 1, headSlot);
  part(-4, 28, -4, 4, 29, 5, 6, () => SLOT.HAT);
  part(-3, 29, -3, 3, 30, 3, 6, () => SLOT.HAT);
  // A helmet, for the armoured watch: a shell down over the top and sides of the head, eyes clear. Bone 7 is drawn as the hat's bone (6)
  // but only on rows with the helmet flag, which hides the cap.
  part(-4, 25, -4, 4, 29, 4, 7, () => SLOT.HAT);
  part(-3, 29, -3, 3, 30, 3, 7, () => SLOT.HAT);
  part(-3, 13, -4, 3, 20, -2, 0, () => SLOT.PACK);
  box(-7.2, 16, -1.2, -3.8, 19, 2.2, 2, SLOT.BAND);
  box(3.8, 16, -1.2, 7.2, 19, 2.2, 3, SLOT.BAND);
  weaponPartsMid(box);
};

const bodyFar = (part) => {
  part(-4, 0, -2, 4, 12, 2, 0, (x, y) => (y < 2 ? SLOT.SHOES : SLOT.PANTS));
  part(-6, 12, -2, 6, 21, 2, 0, () => SLOT.SHIRT);
  part(-3, 21, -3, 3, 28, 3, 0, (x, y, z, f) => (y >= 26 || f === 'z-' ? SLOT.HAIR : SLOT.SKIN));
  part(-4, 28, -4, 4, 30, 5, 0, () => SLOT.HAT);
};

// A camp dog, about knee high, nose to +z. Its coat is a survivor row's skin colour with the hair colour for the saddle, ears and tail,
// which gives tan, brown, black and grizzled dogs out of the same palette. Bones: 0 body, 1 head, 2-5 legs (front left, front right,
// back left, back right), 6 tail. The actor shader poses it when the instance has the dog bit set.
const dogBody = (part, box) => {
  const coat = () => SLOT.SKIN, dark = () => SLOT.HAIR;
  part(-2, 4, -5, 2, 8, 5, 0, (x, y, z, f) => (y === 7 && f !== 'y-' && z >= -3 && z <= 2 && (f === 'y+' || x === -2 || x === 1)) || (f === 'y+' && z >= -3 && z <= 2) ? SLOT.HAIR : SLOT.SKIN);
  part(-2, 0, 2, 0, 4, 4, 2, (x, y) => (y === 0 ? SLOT.HAIR : SLOT.SKIN), .13);
  part(0, 0, 2, 2, 4, 4, 3, (x, y) => (y === 0 ? SLOT.HAIR : SLOT.SKIN), .13);
  part(-2, 0, -4, 0, 4, -2, 4, (x, y) => (y === 0 ? SLOT.HAIR : SLOT.SKIN), .13);
  part(0, 0, -4, 2, 4, -2, 5, (x, y) => (y === 0 ? SLOT.HAIR : SLOT.SKIN), .13);
  part(-2, 6, 4, 2, 10, 8, 1, (x, y, z, f) => {
    if (f === 'z+' && y === 8 && (x === -2 || x === 1)) return SLOT.EYE;
    if (f === 'y+' || (y === 9 && f !== 'z+')) return SLOT.HAIR;
    return SLOT.SKIN;
  });
  part(-1, 6, 8, 1, 8, 11, 1, (x, y, z, f) => (f === 'z+' && y === 7 ? SLOT.EYE : f === 'y-' ? SLOT.MOUTH : SLOT.SKIN));
  part(-2, 10, 5, -1, 12, 6, 1, dark);
  part(1, 10, 5, 2, 12, 6, 1, dark);
  box(-.5, 7, -8.2, .5, 8.2, -4.9, 6, SLOT.HAIR);
  void coat;
};

// One row per variant. Rows below HUMAN_VARIANT_START are infected.
function buildVariantTexture(gl) {
  const W = 16, H = 304;
  const tex = new Uint8Array(W * H * 4);
  const rng = makeRng(90210);
  const SKINS = [[230, 190, 160], [200, 150, 115], [150, 100, 70], [100, 68, 48], [70, 48, 36]];
  const TEES = [[150, 40, 40], [40, 70, 130], [60, 110, 70], [190, 180, 160], [70, 70, 80], [170, 120, 50], [120, 60, 120], [30, 30, 34]];
  const JEANS = [[50, 65, 95], [40, 50, 70], [70, 70, 75], [110, 95, 75], [30, 30, 34]];
  const HAIR = [[30, 22, 16], [70, 45, 25], [140, 110, 60], [90, 90, 92], [20, 20, 22], [120, 50, 25]];
  const SHOES = [[25, 22, 20], [90, 70, 50], [190, 190, 190], [40, 40, 46]];
  const OUTFITS = [
    (o) => { o.shirt = rng.pick(TEES); o.pants = rng.pick(JEANS); o.vest = o.shirt; o.shirt2 = o.shirt; },        // casual
    (o) => { o.shirt = rng.pick(TEES); o.pants = rng.pick(JEANS); o.vest = o.shirt; o.shirt2 = o.shirt; },
    (o) => { const s = [[58, 60, 68], [30, 34, 44], [80, 76, 70]][rng.int(0, 2)]; o.vest = s; o.shirt = s; o.shirt2 = [200, 200, 195]; o.pants = s; o.shoes = [20, 18, 16]; },   // office suit
    (o) => { const h = rng.pick(TEES); o.shirt = h; o.vest = h; o.shirt2 = h.map((v) => v * .7); o.pants = rng.pick(JEANS); o.hair = h; },    // hoodie
    (o) => { o.shirt = [90, 90, 96]; o.vest = [215, 190, 30]; o.shirt2 = [230, 120, 20]; o.pants = [70, 60, 45]; o.hat = [220, 200, 40]; o.flags = 1; o.shoes = [90, 60, 30]; },   // construction
    (o) => { o.shirt = [30, 40, 66]; o.vest = [24, 30, 50]; o.shirt2 = [20, 24, 36]; o.pants = [22, 26, 42]; o.hat = [20, 24, 40]; o.flags = 1; },    // NYPD
    (o) => { const s = rng.pick([[80, 150, 150], [90, 130, 170], [210, 210, 215]]); o.shirt = s; o.vest = s; o.shirt2 = s; o.pants = s; o.shoes = [200, 200, 200]; },  // scrubs
    (o) => { o.shirt = [205, 205, 200]; o.vest = [205, 205, 200]; o.shirt2 = [90, 90, 90]; o.pants = [60, 60, 66]; o.hat = [220, 220, 215]; o.flags = (rng() < .6) ? 1 : 0; },     // chef
    (o) => { o.shirt = [120, 100, 50]; o.vest = [200, 180, 40]; o.shirt2 = [150, 130, 60]; o.pants = [90, 75, 40]; o.hat = [150, 110, 30]; o.flags = 1; o.shoes = [20, 20, 20]; },  // firefighter
    (o) => { const s = rng.pick([[200, 40, 50], [40, 90, 180], [230, 230, 230], [240, 150, 40]]); o.shirt = s; o.vest = s; o.shirt2 = s; o.pants = rng() < .6 ? o.skin : [40, 40, 44]; o.shoes = [230, 230, 230]; },   // runner
    (o) => { o.shirt = [225, 225, 215]; o.vest = [225, 225, 215]; o.shirt2 = [200, 40, 50]; o.pants = [110, 95, 75]; o.hat = rng.pick(TEES); o.flags = rng() < .5 ? 1 : 0; o.shoes = [220, 220, 220]; },    // tourist
    (o) => { const s = rng.pick([[150, 50, 90], [60, 60, 130], [40, 40, 40], [200, 170, 60]]); o.shirt = s; o.vest = s; o.shirt2 = s; o.pants = s; o.shoes = [30, 20, 20]; }, // dress
    (o) => { o.shirt = [76, 84, 54]; o.vest = [60, 66, 44]; o.shirt2 = [50, 56, 36]; o.pants = [70, 76, 50]; o.hat = [62, 68, 44]; o.flags = 1; o.shoes = [30, 26, 22]; },    // national guard
    (o) => { o.shirt = [80, 60, 44]; o.vest = [54, 50, 44]; o.shirt2 = [100, 90, 70]; o.pants = [60, 54, 44]; },  // layered, street
  ];
  // Survivors dress for the work: layers, boots, and gear strapped on.
  const CAMO = [[76, 84, 54], [62, 68, 46], [88, 84, 62], [52, 58, 44]];
  const FLANNEL = [[98, 48, 42], [54, 62, 76], [74, 84, 50], [96, 70, 44]];
  const LEATHER = [[34, 28, 26], [58, 40, 28], [24, 24, 28]];
  // Nobody has washed anything properly in six weeks.
  const WORN = [[92, 62, 54], [58, 66, 78], [70, 82, 62], [140, 132, 112], [62, 62, 68], [112, 90, 58], [74, 64, 66], [38, 38, 42]];
  const WARD = {
    civ: (o) => { const s = rng.pick(FLANNEL); o.shirt = s; o.vest = rng() < .5 ? rng.pick(LEATHER) : s; o.shirt2 = [70, 70, 74]; o.pants = rng.pick(JEANS); o.shoes = [50, 38, 28]; if (rng() < .3) { o.hat = rng.pick(WORN); o.flags |= 1; } if (rng() < .6) o.flags |= 4; },
    mil: (o) => { const s = rng.pick(CAMO); o.shirt = s; o.vest = [44, 48, 36]; o.shirt2 = [38, 42, 30]; o.pants = rng.pick(CAMO); o.shoes = [28, 24, 20]; o.hat = rng.pick(CAMO); if (rng() < .8) o.flags |= 1; if (rng() < .7) o.flags |= 4; },
    scrap: (o) => { const s = rng.pick(LEATHER); o.shirt = rng.pick(WORN); o.vest = s; o.shirt2 = rng.pick(WORN); o.pants = rng.pick([[30, 30, 34], [50, 44, 40], [66, 46, 36]]); o.shoes = [24, 20, 18]; if (rng() < .7) o.flags |= 4; },
    raider: (o) => { const s = rng.pick([[28, 26, 26], [42, 36, 32], [34, 38, 34]]); o.shirt = s; o.vest = rng.pick(LEATHER); o.shirt2 = [20, 18, 18]; o.pants = rng.pick([[30, 30, 34], [44, 38, 34]]); o.shoes = [20, 18, 16]; if (rng() < .5) o.hair = s; if (rng() < .5) o.flags |= 4; },   // no hats: half of them have a hood up instead
    med: (o) => { const s = rng.pick([[150, 148, 138], [92, 112, 108], [138, 136, 128]]); o.shirt = s; o.vest = s; o.shirt2 = [118, 56, 50]; o.pants = rng.pick([[84, 102, 98], [60, 66, 72]]); o.shoes = [72, 68, 62]; if (rng() < .3) o.flags |= 4; },
    // Plate carriers and helmets: the best the camp has, on the people standing out in front of it. Flag 8: the whole torso is the
    // carrier, not a shirt. Flag 16: bulked out under it.
    heavy: (o) => { const plate = rng.pick([[40, 44, 36], [30, 32, 36], [66, 62, 50], [48, 52, 40]]); o.vest = plate; o.shirt = plate; o.shirt2 = rng.pick(CAMO); o.pants = rng.pick(CAMO); o.shoes = [24, 22, 20]; o.hat = plate.map((v) => v * 1.08); o.flags |= 1 | 8 | 16 | 32; if (rng() < .6) o.flags |= 4; },
    // A proper vest and, mostly, a helmet: patrols walk the streets and dress for it.
    medium: (o) => { const vest = rng.pick([[58, 62, 48], [70, 64, 50], [44, 46, 50], [84, 78, 60]]); o.vest = vest; o.shirt = vest; o.shirt2 = rng.pick([...CAMO, ...FLANNEL]); o.pants = rng.pick([...CAMO, [50, 44, 40]]); o.shoes = [30, 26, 22]; if (rng() < .75) { o.hat = rng.pick(CAMO); o.flags |= 1 | 32; } o.flags |= 8; if (rng() < .7) o.flags |= 4; },
    // Whatever stops a bite: a padded jacket or a cut-down vest over everyday clothes, maybe a cap. The ones behind the wall.
    light: (o) => { o.shirt = rng.pick([...FLANNEL, ...WORN]); o.vest = rng.pick([[74, 70, 58], [58, 54, 48], [88, 76, 56], ...LEATHER]); o.shirt2 = rng.pick(WORN); o.pants = rng.pick([...JEANS, ...CAMO]); o.shoes = [44, 34, 26]; if (rng() < .45) { o.hat = rng.pick([...WORN, ...CAMO]); o.flags |= 1; } if (rng() < .4) o.flags |= 4; },
  };
  const wardrobeOf = (row) => (row < 208 ? 'civ' : row < 224 ? 'mil' : row < 232 ? 'scrap' : row < 240 ? 'raider' : row < 256 ? 'med' : row < 272 ? 'heavy' : row < 288 ? 'medium' : 'light');
  for (let row = 0; row < H; row++) {
    const zombie = row < HUMAN_VARIANT_START;
    const base = rng.pick(SKINS);
    const o = { skin: base, shirt: null, pants: null, shoes: rng.pick(SHOES), hair: rng.pick(HAIR), hat: [0, 0, 0], vest: null, shirt2: null, flags: 0 };
    if (zombie) o.skin = [base[0] * .72 + 26, base[1] * .78 + 34, base[2] * .68 + 24];
    if (zombie) OUTFITS[rng.int(0, OUTFITS.length - 1)](o);
    else WARD[wardrobeOf(row)](o);
    const bald = rng() < .08;
    const dirt = zombie ? rng.range(.62, .9) : rng.range(.8, .96);
    const put = (col, c, a = 255, tint = 1) => {
      const k = (col + row * W) * 4;
      tex[k] = Math.min(255, c[0] * tint); tex[k + 1] = Math.min(255, c[1] * tint); tex[k + 2] = Math.min(255, c[2] * tint); tex[k + 3] = a;
    };
    // Sun and six weeks of campfire: survivors' colours all drift towards the same grey-brown.
    const faded = (c) => {
      if (zombie) return c;
      const l = c[0] * .3 + c[1] * .59 + c[2] * .11;
      return [l + (c[0] - l) * .74 + 3, l + (c[1] - l) * .74, l + (c[2] - l) * .74 - 3];
    };
    put(SLOT.SKIN, o.skin);
    put(SLOT.SHIRT, faded(o.shirt), 255, dirt);
    put(SLOT.SHIRT2, faded(o.shirt2 || o.shirt), 255, dirt);
    put(SLOT.PANTS, faded(o.pants), 255, dirt);
    put(SLOT.SHOES, faded(o.shoes), 255, dirt);
    put(SLOT.HAIR, bald ? o.skin : o.hair, 255, zombie ? .9 : 1);
    put(SLOT.HAT, faded(o.hat), 255, dirt);
    put(SLOT.VEST, faded(o.vest || o.shirt), 255, dirt);
    put(SLOT.EYE, zombie ? [58, 44, 36] : [30, 26, 24]);
    put(SLOT.MOUTH, zombie ? [60, 10, 12] : [130, 80, 70]);
    // Column 10 doubles as the gun colour and the flag byte (1 hat, 4 backpack, 8 armour vest, 16 bulk, 32 the hat is a helmet).
    put(SLOT.GUN, [30, 32, 36], o.flags);
    put(SLOT.WOOD, [96, 66, 38]);
    put(SLOT.BLADE, [176, 180, 186]);
    put(SLOT.MIL, [60, 64, 46]);
    put(SLOT.PACK, zombie ? [60, 50, 40] : rng.pick([[66, 74, 50], [70, 54, 36], [40, 44, 56], [88, 44, 36]]));
  }
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return t;
}

export class ActorRenderer {
  constructor(gl) {
    this.near = buildMesh(gl, bodyDetail, 600);
    this.mid = buildMesh(gl, bodyMid, 12000);
    this.far = buildMesh(gl, bodyFar, 60000);
    this.lods = [this.near, this.mid, this.far];
    this.dog = buildMesh(gl, dogBody, 400);
    this.variantTex = buildVariantTexture(gl);
  }

  reset() { this.near.n = 0; this.mid.n = 0; this.far.n = 0; this.dog.n = 0; }

  // A dog: the same instance layout as a person, its own mesh, and bit 22 of extra so the shader poses it as one.
  pushDog(x, y, z, yaw, phase, state, variant, extra = 0) {
    const m = this.dog;
    if (m.n >= m.cap) return;
    const d = m.data, k = m.n++ * STRIDE;
    d[k] = x; d[k + 1] = y; d[k + 2] = z; d[k + 3] = yaw;
    d[k + 4] = phase; d[k + 5] = state; d[k + 6] = variant; d[k + 7] = extra + 4194304;
  }

  push(lod, x, y, z, yaw, phase, state, variant, extra) {
    let m = this.lods[lod];
    if (m.n >= m.cap) {
      if (lod >= 2) return;
      m = this.lods[lod + 1];
      if (m.n >= m.cap) return;
    }
    const d = m.data;
    const k = m.n++ * STRIDE;
    d[k] = x; d[k + 1] = y; d[k + 2] = z; d[k + 3] = yaw;
    d[k + 4] = phase; d[k + 5] = state; d[k + 6] = variant; d[k + 7] = extra;
  }

  upload(gl) {
    for (const m of [...this.lods, this.dog]) {
      if (!m.n) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, m.inst);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, m.data, 0, m.n * STRIDE);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  draw(gl, renderer) {
    const p = renderer.pActor.use();
    renderer.frameUniforms(p);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.variantTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(p.u.uVariants, 5);
    if (this.factions && p.u.uFactions) gl.uniform3fv(p.u.uFactions, this.factions);
    for (const m of [...this.lods, this.dog]) {
      if (!m.n) continue;
      gl.bindVertexArray(m.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0, m.n);
      renderer.stats.draws++;
      renderer.stats.tris += m.n * m.count / 3;
    }
  }

  drawShadow(gl) {
    for (const [m, cap] of [[this.near, 400], [this.mid, 300], [this.dog, 120]]) {
      if (!m.n) continue;
      gl.bindVertexArray(m.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0, Math.min(m.n, cap));
    }
  }
}
