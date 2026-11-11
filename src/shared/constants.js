// World dimensions. The state is square, with the ocean down its east side:
// +x is east (towards the sea), +z is south, +y is up.
export const CS = 32;
export const CS3 = CS * CS * CS;
export const WX = 4096;
export const WZ = 4096;
export const WY = 256;
export const CW = WX / CS;
export const CD = WZ / CS;
export const CH = WY / CS;
export const STREET_Y = 12;      // first air voxel above the street surface
export const WATER_Y = 7.4;
export const STATUE_LAMPS = [[-14, -17, 1], [18, -12, .32], [18, 12, .16], [-14, 17, .28]];
export const FLOOR_H = 6;        // slab plus five clear: a room you can stand up in

export const vidx = (x, y, z) => x | (y << 5) | (z << 10);

// Ground classes in the layout raster.
export const G = { WATER: 0, ROAD: 1, WALK: 2, LOT: 3, PARK: 4, PLAZA: 5, ALLEY: 6, PROM: 7, CAMP: 8, ROCK: 9, SAND: 10, FIELD: 11, DIRT: 12 };
