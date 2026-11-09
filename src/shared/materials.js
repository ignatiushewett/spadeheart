// Voxel material table: colour, hit points and flags per voxel id.
export const F_EMISSIVE = 1, F_GLASS = 2, F_LOOT = 4, F_LEAF = 8, F_CRACK = 16;
export const PALETTE = new Uint8Array(256 * 4);
export const HP = new Uint8Array(256);
export const FLAGS = new Uint8Array(256);
export const M = { AIR: 0 };
export const NAMES = ['air'];

let next = 1;
function m(name, hex, hp, flags = 0) {
  const id = next++;
  M[name] = id;
  NAMES[id] = name;
  let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  if (!(flags & F_EMISSIVE)) {
    // Nothing out here is clean: drain the colour and push everything toward a grimy grey-brown.
    const l = r * .3 + g * .59 + b * .11;
    const k = .34;
    r = (r + (l * 1.02 - r) * k) * .9; g = (g + (l * .99 - g) * k) * .9; b = (b + (l * .93 - b) * k) * .9;
  }
  PALETTE[id * 4] = r;
  PALETTE[id * 4 + 1] = g;
  PALETTE[id * 4 + 2] = b;
  PALETTE[id * 4 + 3] = flags;
  HP[id] = hp;
  FLAGS[id] = flags;
}

// Terrain
m('BEDROCK', 0x2a2a2e, 255); m('STONE', 0x6a6c70, 14); m('SCHIST', 0x77797c, 14); m('DIRT', 0x5b4631, 4);
m('GRASS', 0x4a5a34, 4); m('GRASS2', 0x505f38, 4); m('GRASS_DRY', 0x6a6640, 4); m('SAND', 0xa8976f, 3);
m('GRAVEL', 0x726e66, 5); m('PATH', 0x9a927e, 5);
// Street
m('ASPHALT', 0x34353a, 10); m('ASPHALT2', 0x3c3d41, 10); m('WALK', 0x8c8b86, 9); m('WALK2', 0x7f7e79, 9);
m('CURB', 0xa3a29c, 12); m('LINE_Y', 0xc9a227, 10); m('LINE_W', 0xc8c8c0, 10); m('ALLEYWAY', 0x55534f, 8);
// Walls
m('BRICK_R', 0x8a4a3a, 7); m('BRICK_R2', 0x74402f, 7); m('BRICK_B', 0x6d5242, 7); m('BRICK_Y', 0xa98e68, 7);
m('BRICK_W', 0xb5ad9e, 7); m('BROWNSTONE', 0x5e4034, 7); m('LIMESTONE', 0xb9b09a, 10); m('GRANITE', 0x777880, 12);
m('CONCRETE', 0x8d8d88, 10); m('CONCRETE_D', 0x66676a, 10); m('CASTIRON', 0xaea48c, 9); m('STEEL', 0x7f868e, 18);
m('STEEL_D', 0x3c4048, 18); m('ALUM', 0xaeb6bd, 12); m('COPPER', 0x5d9a86, 10); m('GOLD', 0xc8a540, 12);
// Glass
m('GLASS_B', 0x6c94b8, 1, F_GLASS); m('GLASS_T', 0x5f9c9c, 1, F_GLASS); m('GLASS_K', 0x2c3640, 1, F_GLASS);
m('GLASS_C', 0xa9c2cc, 1, F_GLASS); m('GLASS_A', 0x8a7a58, 1, F_GLASS);
m('WIN_LIT', 0xf0c070, 1, F_EMISSIVE);
// Interior
m('WOOD_FLOOR', 0x7a5a3a, 5); m('CARPET', 0x54505a, 5); m('TILE', 0xa7a79f, 6); m('PLASTER', 0xa8a294, 3);
m('PLASTER2', 0x8f9a94, 3); m('DOOR', 0x4d3626, 12); m('WOOD', 0x8b6a42, 4); m('WOOD_D', 0x5c452c, 4);
m('PLANK', 0x977a50, 4); m('SHELF', 0x6e6e70, 6); m('TANK', 0x6b4a30, 5); m('ROOF_TAR', 0x2f2e30, 7);
m('ROOF_GRAVEL', 0x5f5c58, 7); m('IRON', 0x25272b, 14);
// Nature
m('TRUNK', 0x4b3524, 4); m('LEAF', 0x3f6a2c, 1, F_LEAF); m('LEAF2', 0x4c7a30, 1, F_LEAF); m('LEAF3', 0x76702c, 1, F_LEAF);
// Vehicles
m('TAXI', 0xb8922a, 8); m('CAR_W', 0xb8b8b8, 8); m('CAR_K', 0x1c1c20, 8); m('CAR_R', 0x8c1f1f, 8);
m('CAR_B', 0x1f3f7a, 8); m('CAR_S', 0x777d84, 8); m('TIRE', 0x151517, 6); m('CAR_GLASS', 0x202c34, 1);
m('HEADLIGHT', 0xdcdcb8, 2); m('TAILLIGHT', 0x901818, 2); m('BUS', 0x2c5aa0, 8); m('BURNT', 0x241f1c, 8);
// Lights and signage
m('NEON_R', 0xff3040, 2, F_EMISSIVE); m('NEON_P', 0xff40c0, 2, F_EMISSIVE); m('NEON_C', 0x30e0ff, 2, F_EMISSIVE);
m('NEON_Y', 0xffd030, 2, F_EMISSIVE); m('NEON_G', 0x40ff70, 2, F_EMISSIVE); m('NEON_W', 0xf0f0ff, 2, F_EMISSIVE);
m('SIGN_K', 0x18181c, 4); m('AWN_R', 0x8c2e2a, 3); m('AWN_G', 0x2c6a44, 3); m('AWN_B', 0x2c4a7a, 3);
// Lootable containers
m('CRATE', 0xa07c3c, 3, F_LOOT); m('CRATE_MED', 0xc0d0d0, 3, F_LOOT); m('CRATE_AMMO', 0x4e5c30, 3, F_LOOT);
m('TRUNK_LOOT', 0x4a4038, 3, F_LOOT); m('CRATE_OPEN', 0x5c4a2a, 3);
// Camp
m('CONT_R', 0x7c3226, 16); m('CONT_B', 0x25466a, 16); m('CONT_O', 0xb46a22, 16); m('CONT_G', 0x3e5c3a, 16);
m('SANDBAG', 0x9a8a62, 8); m('JERSEY', 0xa9a79c, 14); m('TENT_G', 0x4e5a38, 2); m('TENT_W', 0xb0ac9c, 2);
m('TENT_B', 0x3c5474, 2); m('CANVAS', 0x8c7c58, 2); m('FIRE', 0xff8a30, 2, F_EMISSIVE); m('LAMP', 0xffe0a0, 2, F_EMISSIVE);
// Damage and player-built
m('BLOOD', 0x6a1010, 3); m('RUBBLE', 0x6f6a62, 5); m('BLOCK_WOOD', 0x9c7a48, 6); m('BLOCK_CONC', 0x93938c, 12);
m('BLOCK_STEEL', 0x5a626a, 24);
// Camp dressing
m('BEDROLL', 0x6d6a4a, 3); m('TOMATO', 0xb0301f, 1, F_LEAF); m('CORN', 0xc4aa3c, 1, F_LEAF); m('SOIL', 0x3f2f22, 4);
m('PAINT_P', 0xc23a8c, 8); m('PAINT_C', 0x2f9fb0, 8); m('PAINT_Y', 0xd8b02c, 8); m('PAINT_K', 0x1d1d22, 8);
m('SHUTTER', 0x565b5e, 18); m('LOG', 0x5f452c, 12); m('RUST', 0x7a4a2a, 14); m('STAINED', 0x4a3f58, 2); m('COURT', 0x8a4f35, 8);

// Old advertising: paint and vinyl that has been out in the weather. Nothing here glows.
m('AD_CREAM', 0xb9ad8e, 7); m('AD_RED', 0x8e3b2e, 7); m('AD_BLUE', 0x3f5870, 7); m('AD_GREEN', 0x4d6a4b, 7);
m('AD_YELLOW', 0xb8954a, 7); m('AD_BLACK', 0x2b2a2a, 7); m('SCREEN', 0x14181c, 4);

// Boards nailed across a doorway or a stairwell, by someone who was very scared at the time.
m('BARRICADE', 0x8a6c44, 12); m('BARRICADE2', 0x5e482e, 12);

// Uptown's own colours: old brick in more shades than downtown ever bothered with, and painted render.
m('BRICK_O', 0xb4683a, 7); m('BRICK_P', 0x5f3836, 7); m('STUCCO', 0xb98f62, 6); m('STUCCO_B', 0x71838f, 6); m('STUCCO_G', 0x7f8c6e, 6);

// Bedding. The old BEDROLL stays as the olive army blanket.
m('MATTRESS', 0xb7ae98, 3); m('PILLOW', 0xdcd6c6, 2); m('BLANKET_G', 0x5d6266, 3); m('BLANKET_R', 0x7e3d31, 3); m('BLANKET_B', 0x3e5672, 3); m('BLANKET_C', 0xa58c62, 3);

// Which voxels the mesher treats as see-through (neighbouring faces stay visible).
export const isGlass = (id) => (FLAGS[id] & F_GLASS) !== 0;
// Glass around a hole: crazed right across, still in the frame, barely. Each pane colour has its broken self.
export const CRACKED = new Uint8Array(256);
export const PANE = new Uint8Array(256);   // the whole glass a cracked block belongs with: one pane, whichever bits of it are cracked
for (const [k, hex] of [['GLASS_B', 0x6c94b8], ['GLASS_T', 0x5f9c9c], ['GLASS_K', 0x2c3640], ['GLASS_C', 0xa9c2cc], ['GLASS_A', 0x8a7a58]]) {
  m(`${k}_X`, hex, 1, F_GLASS | F_CRACK);
  CRACKED[M[k]] = M[`${k}_X`];
  CRACKED[M[`${k}_X`]] = M[`${k}_X`];
  PANE[M[`${k}_X`]] = M[k];
}
export const isLoot = (id) => (FLAGS[id] & F_LOOT) !== 0;
export const isBed = (id) => id === M.BEDROLL || id === M.MATTRESS || id === M.PILLOW || id === M.BLANKET_G || id === M.BLANKET_R || id === M.BLANKET_B || id === M.BLANKET_C;
