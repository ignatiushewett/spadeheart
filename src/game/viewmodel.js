// First-person weapon models: voxel-style boxes in view space, and the hands holding them. Guns point along -z.
// Hand tools are modelled upright from the grip (+y) and posed so the head leads, the way you carry them.
import { mat4, multiply } from '../engine/math.js';

const STEEL = 0x24262b, DARK = 0x16171a, MID = 0x3a3d43, WOOD = 0x5f4328, WOOD_D = 0x46301d, MIL = 0x474b37, RED = 0x7a2a22, EDGE = 0x8d9096;
const M4A = 0x1d1e21, M4B = 0x28292d, M4M = 0x303236;

// The M249's feed cover, hinged at its front edge (LMG_HINGE), and its soft ammunition pouch with the belt running up into the gun.
export const LMG_COVER = [[0, .06, -.075, .074, .024, .19, 0x26282b], [0, .075, -.075, .05, .008, .16, 0x202225], [0, .064, .02, .05, .02, .014, STEEL]];
const LMG_HINGE = [.048, -.17];
export const LMG_BOX = [
  [-.012, -.1, -.08, .07, .11, .13, 0x4a4f34], [-.012, -.044, -.08, .074, .01, .134, 0x3c402a], [-.048, -.1, -.08, .002, .09, .02, 0x3c402a],
  [-.045, -.03, -.08, .014, .03, .05, 0x2a2b2e], [-.05, -.015, -.095, .008, .008, .012, 0xc9a24a], [-.05, -.015, -.08, .008, .008, .012, 0xc9a24a], [-.05, -.015, -.065, .008, .008, .012, 0xc9a24a],
];

// One M249 reload, p from 0 to 1: where the left hand is (from its place on the handguard), how far open the feed cover is, and where the
// ammunition box is (null while it is out of sight at the pouch). Shared by the hand and the parts so they cannot drift apart.
function lmgReloadAt(p) {
  const ease = (t) => t * t * (3 - 2 * t), lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const H0 = [0, 0, 0], COV = [0, .1, .26], BOX = [-.012, -.07, .2], POUCH = [-.1, -.27, .16], TRAY = [-.04, .06, .21];
  const seg = [[0, H0], [.1, COV], [.18, COV], [.26, BOX], [.4, POUCH], [.52, POUCH], [.64, BOX], [.72, TRAY], [.78, COV], [.82, COV], [.92, H0], [1, H0]];
  let tip = H0;
  for (let i = 1; i < seg.length; i++) if (p <= seg[i][0]) { tip = lerp(seg[i - 1][1], seg[i][1], ease((p - seg[i - 1][0]) / Math.max(1e-4, seg[i][0] - seg[i - 1][0]))); break; }
  const carried = (p > .26 && p < .4) || (p >= .52 && p < .64);
  const box = carried ? [tip[0] - BOX[0], tip[1] - BOX[1], tip[2] - BOX[2]] : p >= .4 && p < .52 ? null : [0, 0, 0];
  // Flipped up by the hand, left open, then slapped down hard.
  const cover = p < .1 ? 0 : p < .18 ? ease((p - .1) / .08) : p < .78 ? 1 : p < .82 ? 1 - ((p - .78) / .04) ** 2 : 0;
  return { tip, box, cover };
}

export const MODELS = {
  crowbar: [[0, .24, 0, .028, .62, .028, 0x33363c], [0, .56, -.05, .028, .03, .12, 0x33363c], [0, .53, -.1, .028, .05, .03, 0x33363c], [0, -.03, 0, .03, .04, .03, RED], [0, -.08, 0, .024, .08, .024, 0x33363c]],
  axe: [[0, .26, 0, .036, .74, .036, WOOD], [0, .6, 0, .052, .13, .074, RED], [0, .6, -.08, .036, .15, .1, RED], [0, .6, -.155, .028, .22, .07, RED], [0, .6, -.2, .018, .28, .04, EDGE], [0, .6, .07, .04, .07, .09, RED], [0, .6, .135, .024, .036, .06, 0x3a2020], [0, -.06, 0, .046, .09, .046, DARK]],
  // A plain sledge: a long handle, one heavy block of a head, tape at the end of the grip.
  sledge: [[0, .3, 0, .04, .86, .04, WOOD], [0, .75, -.01, .12, .12, .26, 0x36383d], [0, -.07, 0, .05, .1, .05, DARK]],
  // A service 9mm: a squared-off steel slide with grip cuts at the back and the port open on the right, three-dot sights, the barrel's
  // mouth in the front of the slide, a polymer frame with its rail and guard, panels on the grip, and the magazine's foot under it.
  pistol: [
    [0, .02, -.095, .04, .036, .23, 0x2b2d31], [0, .039, -.095, .03, .004, .226, 0x36393e], [0, .004, -.095, .041, .004, .228, 0x222428],
    [.0205, .02, .004, .002, .026, .005, DARK], [.0205, .02, -.008, .002, .026, .005, DARK], [.0205, .02, -.02, .002, .026, .005, DARK], [.0205, .02, -.032, .002, .026, .005, DARK],
    [-.0205, .02, .004, .002, .026, .005, DARK], [-.0205, .02, -.008, .002, .026, .005, DARK], [-.0205, .02, -.02, .002, .026, .005, DARK], [-.0205, .02, -.032, .002, .026, .005, DARK],
    [.0206, .028, -.08, .002, .016, .05, 0x0e0f11], [.018, .028, -.08, .004, .012, .044, 0x8a7a50],
    [0, .017, -.2112, .02, .02, .003, 0x0b0b0c], [0, .017, -.2118, .01, .01, .002, 0x000000],
    [0, .044, -.196, .006, .01, .008, DARK], [0, .046, -.2004, .0035, .0035, .001, 0xd8d6cc],
    [-.0095, .045, .008, .008, .011, .01, DARK], [.0095, .045, .008, .008, .011, .01, DARK], [-.0095, .047, .0029, .003, .003, .001, 0xd8d6cc], [.0095, .047, .0029, .003, .003, .001, 0xd8d6cc],
    [0, -.012, -.083, .036, .024, .2, 0x1b1c1f], [0, -.029, -.155, .03, .012, .07, 0x1b1c1f], [-.016, -.031, -.155, .002, .004, .066, 0x111214], [.016, -.031, -.155, .002, .004, .066, 0x111214],
    [0, -.04, -.087, .012, .03, .008, 0x1b1c1f], [0, -.057, -.058, .012, .008, .066, 0x1b1c1f], [0, -.036, -.052, .006, .022, .006, 0x4a4d52],
    [0, -.085, -.004, .036, .1, .052, 0x1b1c1f], [.0185, -.088, -.004, .002, .07, .04, 0x252629], [-.0185, -.088, -.004, .002, .07, .04, 0x252629],
    [0, -.083, -.031, .03, .07, .003, 0x252629], [0, -.026, .027, .032, .012, .016, 0x1b1c1f], [0, -.137, -.006, .038, .01, .056, 0x141517],
    [-.0205, -.003, -.058, .002, .006, .022, 0x3a3d43], [.0205, -.003, -.01, .002, .006, .006, 0x3a3d43],
  ],
  revolver: [[0, .02, -.17, .03, .036, .26, 0x6a6e76], [0, .0, -.04, .058, .058, .08, 0x54575e], [0, .03, -.3, .01, .02, .012, EDGE], [0, -.09, .03, .042, .12, .055, WOOD], [0, -.04, -.03, .02, .02, .06, 0x54575e]],
  smg: [[0, .0, -.12, .05, .07, .3, DARK], [0, .012, -.33, .022, .022, .13, STEEL], [0, -.1, -.1, .036, .13, .05, STEEL], [0, -.09, .03, .036, .1, .05, DARK], [0, .05, .0, .024, .024, .14, MID], [0, .05, -.26, .012, .03, .012, EDGE], [0, .01, .14, .035, .05, .14, MID]],
  shotgun: [[0, .018, -.32, .034, .034, .56, STEEL], [0, -.024, -.28, .028, .028, .46, DARK], [0, -.024, -.32, .05, .046, .16, WOOD], [0, -.005, .02, .05, .075, .2, DARK], [0, -.04, .22, .05, .09, .22, WOOD], [0, -.075, .11, .04, .08, .06, WOOD_D], [0, .04, -.59, .01, .014, .012, EDGE]],
  // M4: flat-top receiver and rail, ribbed handguard, triangular front sight, curved magazine, tube and collapsible stock.
  rifle: [
    [0, .034, -.06, .05, .04, .29, M4B], [0, .06, -.06, .032, .012, .29, DARK], [0, -.008, -.03, .046, .046, .22, M4A],
    [0, -.05, -.1, .042, .05, .08, M4A], [0, -.095, -.105, .032, .05, .07, M4M], [0, -.14, -.12, .032, .05, .07, M4M], [0, -.182, -.142, .032, .045, .07, M4M], [0, -.207, -.15, .036, .012, .074, DARK],
    [0, -.06, .035, .036, .05, .05, DARK], [0, -.105, .05, .036, .05, .05, DARK], [0, -.056, -.02, .012, .006, .07, DARK], [0, -.044, -.015, .008, .022, .008, STEEL],
    [0, .02, .17, .028, .028, .2, DARK], [0, .012, .24, .04, .06, .1, M4A], [0, -.012, .285, .042, .1, .03, M4B],
    [0, .014, -.295, .062, .062, .18, M4B], [0, .014, -.225, .066, .05, .014, DARK], [0, .014, -.26, .066, .05, .014, DARK], [0, .014, -.295, .066, .05, .014, DARK], [0, .014, -.33, .066, .05, .014, DARK], [0, .014, -.365, .066, .05, .014, DARK],
    [0, .014, -.212, .07, .07, .014, DARK], [0, .014, -.388, .056, .056, .012, DARK],
    [0, .02, -.41, .03, .05, .03, DARK], [0, .06, -.41, .02, .036, .02, DARK], [0, .082, -.41, .01, .022, .012, DARK], [0, .098, -.41, .004, .018, .004, EDGE],
    [0, .014, -.49, .02, .02, .2, STEEL], [0, .014, -.6, .03, .03, .05, DARK], [0, .014, -.6, .034, .008, .03, STEEL],
    [0, .072, .05, .03, .016, .03, DARK], [-.012, .094, .05, .008, .034, .016, DARK], [.012, .094, .05, .008, .034, .016, DARK],
    [0, .042, .09, .044, .012, .016, STEEL], [.029, .036, .025, .012, .016, .03, MID], [.0255, .034, -.06, .002, .018, .075, STEEL], [-.026, -.02, -.075, .004, .012, .012, STEEL],
  ],
  hunting: [[0, .0, -.06, .046, .056, .38, WOOD], [0, .012, -.42, .02, .02, .46, STEEL], [0, -.04, .2, .05, .09, .24, WOOD], [0, .085, -.08, .028, .028, .3, DARK], [0, .085, -.24, .044, .044, .05, DARK], [0, .085, .08, .04, .04, .05, DARK], [0, .05, -.06, .02, .03, .04, STEEL], [0, -.055, -.06, .03, .03, .1, WOOD_D]],
  // M249: square receiver, carry handle and heat shield over a long barrel, gas tube and folded bipod under it, polymer stock. The feed
  // cover and the ammunition box are their own pieces (LMG_COVER, LMG_BOX), so a reload can open the one and swap the other.
  lmg: [
    [0, .01, -.07, .07, .075, .3, DARK], [0, -.035, -.07, .064, .02, .28, 0x1e1f22], [0, .01, -.25, .06, .06, .06, DARK],
    [0, .058, .045, .03, .02, .03, DARK], [-.009, .074, .045, .006, .014, .006, DARK], [.009, .074, .045, .006, .014, .006, DARK],
    [0, .09, -.29, .016, .012, .1, DARK], [0, .065, -.25, .012, .04, .012, DARK], [0, .065, -.33, .012, .04, .012, DARK],
    [0, .036, -.39, .032, .01, .18, 0x2c2e31], [0, .012, -.45, .026, .026, .36, STEEL], [0, -.018, -.4, .018, .018, .24, DARK],
    [0, -.004, -.52, .03, .05, .03, DARK], [0, .042, -.56, .008, .034, .008, DARK], [0, .012, -.62, .034, .034, .035, DARK],
    [0, -.03, -.53, .04, .016, .02, DARK], [-.014, -.034, -.45, .008, .008, .15, MID], [.014, -.034, -.45, .008, .008, .15, MID],
    [-.014, -.036, -.375, .012, .012, .012, DARK], [.014, -.036, -.375, .012, .012, .012, DARK],
    [0, -.03, -.28, .058, .04, .12, 0x2a2c2f],
    [0, -.085, .075, .034, .1, .045, DARK], [0, -.058, .035, .012, .008, .07, DARK], [0, -.05, .03, .004, .016, .004, STEEL],
    [0, -.005, .22, .05, .07, .22, 0x1e1f22], [0, -.05, .25, .044, .03, .16, 0x1e1f22], [0, -.015, .335, .054, .11, .02, 0x111214],
    [.04, .0, -.13, .012, .014, .03, STEEL], [.0355, .005, -.04, .002, .02, .06, 0x111214], [-.0355, .02, -.07, .002, .02, .07, 0x111214],
  ],
  rocket: [[0, .05, -.05, .08, .08, .8, 0x484c36], [0, .05, -.47, .1, .1, .06, 0x383c2a], [0, .05, .37, .1, .1, .06, 0x383c2a], [0, -.05, -.02, .036, .1, .06, DARK], [.07, .1, -.15, .02, .05, .1, DARK]],
  grenade: [[0, .0, -.02, .07, .09, .07, 0x3f4a30], [0, .058, -.02, .03, .03, .03, 0x8a8a70], [.03, .06, -.02, .018, .012, .05, EDGE]],
  // Demolition charge: taped blocks of plastic explosive, a detonator, and a light that means it.
  dynamite: [
    [0, -.005, -.02, .13, .05, .17, 0x7b745c], [0, .045, -.02, .125, .05, .165, 0x8a8268], [-.003, -.028, -.02, .134, .012, .172, 0x3a3a34],
    [0, .002, -.07, .136, .11, .016, 0x2a2a28], [0, .002, .03, .136, .11, .016, 0x2a2a28],
    [.03, .085, -.03, .05, .026, .07, 0x2a2c30], [.03, .1, -.05, .012, .012, .012, 0xd03020, 7], [.015, .1, -.015, .012, .008, .012, 0x8d9096],
    [-.03, .08, .0, .006, .008, .1, 0x9a2a22], [-.016, .08, .0, .006, .008, .1, 0x2c5a8a], [-.03, .08, .05, .006, .03, .006, 0x9a2a22], [-.016, .08, .05, .006, .03, .006, 0x2c5a8a],
  ],
  block_wood: [[0, 0, 0, .2, .2, .2, 0x8a6c42]],
  block_conc: [[0, 0, 0, .2, .2, .2, 0x83837d]],
  block_steel: [[0, 0, 0, .2, .2, .2, 0x525a62]],
};

// pos: where it rests. rot: x tips the top away from you, z leans it toward the middle of the screen.
// sight: height of the sight line, used to bring it to the eye when aiming.
const POSES = {
  crowbar: { pos: [.36, -.44, -.8], rot: [-.22, .42, .28], melee: true },
  axe: { pos: [.42, -.5, -.84], rot: [.1, .55, .3], melee: true },
  sledge: { pos: [.38, -.54, -.88], rot: [-.24, .4, .3], melee: true },
  // Far enough out at the hip that both hands are in view. adsZ is where it comes back to when you bring it up to your eye.
  // Held the way a person holds them: pistols out in front in both hands, a little right of centre; the long guns low in the right
  // shoulder, angled in towards the middle of the screen, with more of the gun in view than an arcade game shows.
  // flip: how hard a handgun snaps up and back in your hands, where a long gun is held down by the shoulder.
  // tip: the top of the front sight. Aimed, it sits exactly on the middle of the screen, which is where the round goes.
  pistol: { pos: [.13, -.175, -.45], rot: [0, .05, -.03], tip: .049, adsZ: -.32, flip: 1 },
  revolver: { pos: [.13, -.175, -.45], rot: [0, .05, -.03], tip: .04, adsZ: -.32, flip: 1.5 },
  smg: { pos: [.165, -.19, -.48], rot: [0, .07, -.05], tip: .065, adsZ: -.34 },
  shotgun: { pos: [.17, -.195, -.5], rot: [0, .07, -.05], tip: .047, adsZ: -.32 },
  rifle: { pos: [.17, -.195, -.5], rot: [0, .07, -.05], tip: .107, adsZ: -.34 },
  hunting: { pos: [.17, -.195, -.5], rot: [0, .07, -.05], sight: .09, adsZ: -.34 },
  lmg: { pos: [.19, -.22, -.53], rot: [0, .08, -.05], sight: .09, adsZ: -.34 },
  rocket: { pos: [.2, -.16, -.54], rot: [0, .05, -.03], sight: .15, adsZ: -.4 },
  grenade: { pos: [.19, -.2, -.46] },
  dynamite: { pos: [.15, -.17, -.5], rot: [.3, -.3, 0] },
  block_wood: { pos: [.2, -.22, -.46], rot: [.15, .4, 0] },
  block_conc: { pos: [.2, -.22, -.46], rot: [.15, .4, 0] },
  block_steel: { pos: [.2, -.22, -.46], rot: [.15, .4, 0] },
};

// The mouth of each barrel, in the model's own space: the flash comes out of it.
const MUZZLE = {
  pistol: [0, .017, -.215], revolver: [0, .02, -.305], smg: [0, .012, -.4], shotgun: [0, .018, -.605], rifle: [0, .014, -.63],
  hunting: [0, .012, -.655], lmg: [0, .012, -.635],
};
// How big each gun's flash is, against the rifle's. A shotgun throws a great ragged ball of it; the scoped rifle and the magnum a lot.
const FLASH_SIZE = { shotgun: 2.1, hunting: 1.45, revolver: 1.4, lmg: 1.15, pistol: 1, smg: .9 };
// A flash at the muzzle: a hot core, a short spike straight out, and four petals. Built once, turned and sized every shot.
const FLASH = [
  [0, 0, -.025, .03, .03, .05, 0xffd08a, 7], [0, 0, -.085, .012, .012, .12, 0xffb060, 6],
  [0, .045, -.03, .008, .07, .012, 0xff9a40, 5], [0, -.045, -.03, .008, .07, .012, 0xff9a40, 5],
  [.045, 0, -.03, .07, .008, .012, 0xff9a40, 5], [-.045, 0, -.03, .07, .008, .012, 0xff9a40, 5],
];

// --- Hands -----------------------------------------------------------------------------------------------------------------
// Fingerless work gloves and a canvas jacket. The hands are their own mesh, drawn with whatever is being held: the same weapon models
// are used for things in flight, and a thrown grenade should not take your fingers with it.
// Light to dark, the same spread as the people in the camps. Tuned against this shader, which lifts mid-tones a long way.
const SKIN_TONES = [[0xbd9a84, 0x9b7c68], [0xa5826c, 0x866955], [0x876549, 0x6c503a], [0x5f4432, 0x4b3527], [0x412e22, 0x332418]];
let SKIN = SKIN_TONES[1][0], SKIN_D = SKIN_TONES[1][1];
export const SKIN_TONE_COUNT = SKIN_TONES.length;
const GLOVE = 0x1f1a15, GLOVE_L = 0x2e271f, SLEEVE = 0x38362f, SLEEVE_D = 0x24221d;
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

// From the wrist to the elbow: a good thick sleeve, plain and square like everyone else's arms in this city, with a cuff where it meets the hand.
function forearm(out, wrist, elbow, S) {
  const dx = elbow[0] - wrist[0], dy = elbow[1] - wrist[1], dz = elbow[2] - wrist[2], len = Math.hypot(dx, dy, dz), u = [dx / len, dy / len, dz / len];
  // Tools are held further from the eye and their hands are drawn bigger to match, but an arm that big fills the screen.
  const k = Math.min(S, 1.3), a = add(wrist, u, .03 * S);
  out.push({ from: wrist, to: a, w: .074 * k, h: .068 * k, col: SLEEVE_D });
  out.push({ from: a, to: elbow, w: .088 * k, h: .081 * k, col: SLEEVE });
}

// A hand closed round something upright: a pistol grip or a tool handle. side +1 is the right hand, with the back of the hand out to the right.
function wrap(out, { x, y, z, w, d, side = 1, S = 1, fingers = 3, trigger = false, elbow }) {
  // A hair wider than what it holds, so the inside of the hand never sits exactly on the handle's faces and flickers against them.
  w += .005 * S; d += .005 * S;
  const t = .021 * S, fw = .024 * S, tall = fw * fingers, top = y + tall / 2;
  // The back of the hand, the heel behind the grip, and the row of knuckles.
  out.push([x + side * (w / 2 + t / 2), y, z + .003 * S, t, tall + .006 * S, d + t * 1.2, GLOVE]);
  out.push([x, y, z + d / 2 + t / 2, w + t * 2, tall, t, GLOVE_L]);
  out.push([x + side * (w / 2 + t * .72), y, z - d / 2 - t * .1, t * .62, tall * .94, t * 1.1, GLOVE_L]);
  for (let i = 0; i < fingers; i++) {
    const fy = top - fw * (i + .5), short = i === fingers - 1 ? .82 : 1;
    // Round the front of the grip, and on to where the fingertips come to rest against the far side.
    out.push([x, fy, z - d / 2 - t * .5, w + t * 1.1, fw * .84, t, SKIN]);
    out.push([x - side * (w / 2 + t * .46), fy, z - d / 2 + d * .28 * short, t * .9, fw * .84, d * .62 * short, SKIN_D]);
  }
  // Thumb, across the far side and pointing forward.
  out.push([x - side * (w / 2 + t * .5), top + fw * .42, z + d * .08, t * .95, fw * .96, d * .86 + .02 * S, SKIN]);
  out.push([x - side * (w / 2 + t * .3), top + fw * .1, z + d * .42, t * .9, fw * 1.1, t * 1.2, GLOVE]);
  if (trigger) {
    // Finger along the frame, curling in to the trigger.
    out.push([x + side * (w / 2 + t * .2), top + fw * .44, z - d / 2 - .026 * S, t * .72, fw * .78, .052 * S, SKIN]);
    out.push([x + side * w * .18, top + fw * .36, z - d / 2 - .05 * S, w * .7 + t * .3, fw * .66, t * .62, SKIN_D]);
  }
  forearm(out, [x + side * (w * .32 + t * .3), y - tall * .1, z + d / 2 + t * .8], elbow, S);
}

// A hand underneath something it is steadying: palm up, fingers up one side and thumb up the other.
function cradle(out, { x, y, z, w, h, side = -1, S = 1, len = .09, elbow }) {
  const t = .021 * S, fw = len / 4, under = y - h / 2;
  out.push([x, under - t / 2, z, w + t * 1.2, t, len, GLOVE]);
  out.push([x, under - t * 1.15, z + len * .36, w * .8 + t, t * .7, len * .4, GLOVE_L]);
  // Fingers up the far side, one by one so they read as fingers.
  for (let i = 0; i < 4; i++) {
    const fz = z - len / 2 + fw * (i + .5), rise = Math.min(h * .72, .05 * S) * (i === 3 ? .82 : 1);
    out.push([x - side * (w / 2 + t * .48), under + rise / 2 - t * .3, fz, t * .9, rise + t * .6, fw * .84, SKIN]);
  }
  // The heel of the hand flaring out on the near side, the thumb lying along the top of it, and a knuckle at its root.
  out.push([x + side * (w / 2 + t * .85), under - t * .1, z + len * .04, t * 1.7, t * 2.1, len * .86, GLOVE]);
  out.push([x + side * (w / 2 + t * .6), under + t * 1.05 + Math.min(h * .12, .012 * S), z - len * .14, t * 1.05, t * 1.15, len * .66, SKIN]);
  out.push([x + side * (w / 2 + t * .7), under + t * .95, z + len * .24, t * 1.2, t * 1.25, len * .3, GLOVE_L]);
  forearm(out, [x + side * w * .12, under - t * .9, z + len / 2 + t * .2], elbow, S);
}

// Where a point fixed in the view lands in a model's own space, for tools that are held at an angle.
function viewToModel(pose, v) {
  const [rx, ry, rz] = pose.rot || [0, 0, 0], p = pose.pos;
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const a = [cy * cz + sy * sx * sz, cx * sz, -sy * cz + cy * sx * sz], b = [-cy * sz + sy * sx * cz, cx * cz, sy * sz + cy * sx * cz], c = [sy * cx, -sx, cy * cx];
  const q = [v[0] - p[0], v[1] - p[1], v[2] - p[2]], dot = (m) => m[0] * q[0] + m[1] * q[1] + m[2] * q[2];
  return [dot(a), dot(b), dot(c)];
}

const RIGHT_ELBOW = [.56, -.7, .1], LEFT_ELBOW = [-.5, -.66, -.06];
// A gun: the right hand on the grip with a finger on the trigger, the left forward on the handguard.
function gunHands(id, grip, fore) {
  const pose = POSES[id], right = [], left = [];
  wrap(right, { ...grip, side: 1, trigger: true, elbow: viewToModel(pose, RIGHT_ELBOW) });
  if (fore) cradle(left, { ...fore, side: -1, elbow: viewToModel(pose, LEFT_ELBOW) });
  return { right, left };
}

function toolHands(id, y, w, d, S, upper) {
  const pose = POSES[id], right = [], left = [];
  wrap(right, { x: 0, y, z: 0, w, d, side: 1, S, fingers: 4, elbow: viewToModel(pose, [.56, -1.05, .12]) });
  if (upper !== undefined) wrap(left, { x: 0, y: upper, z: 0, w, d, side: -1, S, fingers: 4, elbow: viewToModel(pose, [-.72, -1.0, .02]) });
  return { right, left };
}

function pistolHands(id, g) {
  const pose = POSES[id], right = [], left = [], x = 0, y = g.y, z = g.z, t = .021;
  wrap(right, { ...g, side: 1, trigger: true, elbow: viewToModel(pose, RIGHT_ELBOW) });
  // The other hand comes up under and around the first: heel below, fingers laid over the front, thumb forward along the frame.
  const low = y - .036;
  left.push([x - g.w / 2 - t * 1.3, low + .012, z + .004, t, .058, g.d + .018, GLOVE]);
  left.push([x, low - .022, z + .002, g.w + t * 2.6, t * .9, g.d + .02, GLOVE_L]);
  for (let i = 0; i < 3; i++) {
    const fy = y - .012 - i * .021;
    left.push([x + .006, fy, z - g.d / 2 - t * 1.45, g.w + t * 2.4, .018, t * .9, SKIN]);
    left.push([x + g.w / 2 + t * 1.5, fy, z - g.d / 2 - t * .3, t * .8, .018, t * 2, SKIN_D]);
  }
  left.push([x - g.w / 2 - t * 1.25, y + .036, z - .036, t * .9, .021, .07, SKIN]);
  forearm(left, [x - g.w * .6 - t, low - .018, z + g.d / 2 + t * .4], viewToModel(pose, LEFT_ELBOW), 1);
  return { right, left };
}

function heldHands(id, grip) {
  const pose = POSES[id], right = [];
  wrap(right, { ...grip, side: 1, fingers: 3, elbow: viewToModel(pose, RIGHT_ELBOW) });
  return { right, left: [] };
}

// A hand holding one round between finger and thumb, the round's nose at the origin end pointing forward: the palm behind it, the
// first finger along the top and the thumb under it, the rest curled in, and the forearm going back down out of sight.
function pinchHand() {
  const out = [];
  out.push([-.003, -.004, .046, .032, .038, .036, GLOVE]);
  out.push([-.003, .006, .028, .03, .016, .006, GLOVE_L]);
  out.push([0, .0105, .021, .012, .009, .034, SKIN]);
  out.push([0, -.0105, .023, .013, .009, .03, SKIN_D]);
  out.push([-.004, -.021, .031, .026, .012, .016, SKIN_D]);
  forearm(out, [-.004, -.014, .064], [-.05, -.17, .3], 1);
  return out;
}

// Something held out in front in both hands, one under each end.
function bothHands(id, x, y, z, w, h, len = .1) {
  const pose = POSES[id], right = [], left = [];
  cradle(right, { x: x, y, z, w, h, side: 1, len, elbow: viewToModel(pose, RIGHT_ELBOW) });
  cradle(left, { x: -x, y, z, w, h, side: -1, len, elbow: viewToModel(pose, LEFT_ELBOW) });
  return { right, left };
}

function buildHands(tone) {
  [SKIN, SKIN_D] = SKIN_TONES[tone] || SKIN_TONES[1];
  return {
    crowbar: toolHands('crowbar', .03, .028, .028, 1.55),
    axe: toolHands('axe', .03, .036, .036, 1.6, .29),
    sledge: toolHands('sledge', .03, .04, .04, 1.7, .33),
    pistol: pistolHands('pistol', { x: 0, y: -.082, z: -.005, w: .036, d: .05 }),
    revolver: { ...pistolHands('revolver', { x: 0, y: -.082, z: .03, w: .042, d: .055 }), pinch: pinchHand() },
    smg: gunHands('smg', { x: 0, y: -.082, z: .03, w: .036, d: .05 }, { x: 0, y: 0, z: -.225, w: .05, h: .07 }),
    shotgun: gunHands('shotgun', { x: 0, y: -.07, z: .11, w: .04, d: .06 }, { x: 0, y: -.024, z: -.32, w: .05, h: .046, len: .12 }),
    rifle: gunHands('rifle', { x: 0, y: -.082, z: .043, w: .036, d: .05 }, { x: 0, y: .014, z: -.31, w: .062, h: .062, len: .11 }),
    hunting: gunHands('hunting', { x: 0, y: -.048, z: .1, w: .05, d: .06 }, { x: 0, y: 0, z: -.17, w: .046, h: .056, len: .11 }),
    lmg: gunHands('lmg', { x: 0, y: -.082, z: .075, w: .034, d: .045 }, { x: 0, y: -.03, z: -.28, w: .058, h: .04, len: .12 }),
    rocket: gunHands('rocket', { x: 0, y: -.05, z: -.02, w: .036, d: .06 }, { x: 0, y: .05, z: -.3, w: .08, h: .08, len: .11 }),
    grenade: heldHands('grenade', { x: 0, y: -.005, z: -.02, w: .07, d: .07 }),
    dynamite: bothHands('dynamite', .045, .01, -.02, .05, .08),
    block_wood: bothHands('block_wood', .07, 0, 0, .07, .2, .12),
    block_conc: bothHands('block_conc', .07, 0, 0, .07, .2, .12),
    block_steel: bothHands('block_steel', .07, 0, 0, .07, .2, .12),
  };
}

function buildVAO(gl, boxes) {
  const v = [];
  for (const part of boxes) {
    // A length of limb at any angle, rather than a box square to the model.
    if (!Array.isArray(part)) {
      const { from, to, w, h, col } = part, r = ((col >> 16) & 255) / 255, g = ((col >> 8) & 255) / 255, bl = (col & 255) / 255;
      const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], l = Math.hypot(d[0], d[1], d[2]) || 1, f = [d[0] / l, d[1] / l, d[2] / l];
      let e = [f[2], 0, -f[0]], el = Math.hypot(e[0], e[2]);
      if (el < .001) { e = [1, 0, 0]; el = 1; }
      e = [e[0] / el, 0, e[2] / el];
      const n = [f[1] * e[2] - f[2] * e[1], f[2] * e[0] - f[0] * e[2], f[0] * e[1] - f[1] * e[0]];
      const at = (o, a, c) => [o[0] + e[0] * a + n[0] * c, o[1] + e[1] * a + n[1] * c, o[2] + e[2] * a + n[2] * c];
      const hw = w / 2, hh = h / 2;
      const c = [at(from, -hw, -hh), at(from, hw, -hh), at(from, hw, hh), at(from, -hw, hh), at(to, -hw, -hh), at(to, hw, -hh), at(to, hw, hh), at(to, -hw, hh)];
      const face = (nn, i, j, k, m) => {
        let [a, p, q, s] = [c[i], c[j], c[k], c[m]];
        const u1 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], u2 = [q[0] - a[0], q[1] - a[1], q[2] - a[2]];
        const cr = [u1[1] * u2[2] - u1[2] * u2[1], u1[2] * u2[0] - u1[0] * u2[2], u1[0] * u2[1] - u1[1] * u2[0]];
        if (cr[0] * nn[0] + cr[1] * nn[1] + cr[2] * nn[2] < 0) { const swap = p; p = s; s = swap; }
        for (const pt of [a, p, q, a, q, s]) v.push(pt[0], pt[1], pt[2], nn[0], nn[1], nn[2], r, g, bl, 0);
      };
      face(e, 1, 5, 6, 2); face([-e[0], -e[1], -e[2]], 0, 3, 7, 4);
      face(n, 3, 2, 6, 7); face([-n[0], -n[1], -n[2]], 0, 4, 5, 1);
      face(f, 4, 7, 6, 5); face([-f[0], -f[1], -f[2]], 0, 1, 2, 3);
      continue;
    }
    const [x, y, z, sx, sy, sz, col, glow = 0] = part;
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const r = ((col >> 16) & 255) / 255, g = ((col >> 8) & 255) / 255, b = (col & 255) / 255;
    const quad = (n, a, c, d, e) => {
      for (const p of [a, c, d, a, d, e]) v.push(x + p[0], y + p[1], z + p[2], ...n, r, g, b, glow);
    };
    quad([1, 0, 0], [hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]);
    quad([-1, 0, 0], [-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]);
    quad([0, 1, 0], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]);
    quad([0, -1, 0], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]);
    quad([0, 0, 1], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]);
    quad([0, 0, -1], [hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]);
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
  const s = 10 * 4;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, s, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, s, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, s, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, s, 36);
  gl.bindVertexArray(null);
  return { vao, vb, count: v.length / 10 };
}

export class ViewModel {
  constructor(gl) {
    this.models = {};
    for (const k in MODELS) this.models[k] = buildVAO(gl, MODELS[k]);
    // The 9mm's slide, apart from its frame, so it can run back on every shot. The first 21 boxes are the slide and what is on it.
    this.split = { pistol: { frame: buildVAO(gl, MODELS.pistol.slice(21)), slide: buildVAO(gl, MODELS.pistol.slice(0, 21)), travel: .034 } };
    this.slide = 0;
    this.hands = {};
    this.handTone = -1;
    this.mv = mat4();
    this.model = mat4();
    this.fmv = mat4();
    this.local = mat4();
    this.normal = new Float32Array(9);
    this.t = 0;
    this.flash = buildVAO(gl, FLASH);
    // A .357 round: brass case, rim at the back, the lead nose in front.
    this.lmgCover = buildVAO(gl, LMG_COVER);
    this.lmgBox = buildVAO(gl, LMG_BOX);
    this.roundVao = buildVAO(gl, [[0, 0, .006, .0105, .0105, .026, 0xb8893a], [0, 0, .02, .0125, .0125, .003, 0xa07a34], [0, 0, -.011, .0085, .0085, .009, 0x8d8f94]]);
    // The gun on springs: where the last shot threw it, and how fast it is coming back. A stiff spring, lightly damped, so it snaps back
    // with a little overshoot rather than sliding home.
    this.sp = { z: 0, vz: 0, rx: 0, vrx: 0, rz: 0, vrz: 0, x: 0, vx: 0, y: 0, vy: 0 };
    this.shots = 0;
    // Lag behind the turn of your head, and lean into a strafe.
    this.swayX = 0; this.swayY = 0; this.lastYaw = null; this.lastPitch = 0; this.lean = 0;
    this.wet = 0;
    this.flashRoll = 0;
  }

  // Built for whoever is holding the thing, and again if that turns out to be somebody new.
  setHands(gl, tone) {
    this.handTone = tone;
    const drop = (m) => { if (m) { gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vb); } };
    for (const k in this.hands) { drop(this.hands[k].right); drop(this.hands[k].left); drop(this.hands[k].pinch); }
    const hands = buildHands(tone);
    for (const k in hands) this.hands[k] = { right: buildVAO(gl, hands[k].right), left: hands[k].left.length ? buildVAO(gl, hands[k].left) : null, pinch: hands[k].pinch ? buildVAO(gl, hands[k].pinch) : null };
  }

  // Anything thrown keeps the shape it had in your hand: spinning through the air, then flat against what it hit.
  drawThrown(gl, r, player) {
    const list = player.projectiles;
    if (!list.length) return;
    let bound = false;
    const m = this.model, mv = this.mv, n = this.normal, S = 2;
    for (const p of list) {
      const box = this.models[p.kind];
      if (!box || p.kind === 'rocket') continue;
      if (!bound) {
        bound = true;
        const P = r.pBox.use(), u = P.u, s = r.sky.sunDir, v = r.view;
        if (u.uVM) gl.uniform1f(u.uVM, 0);
        if (u.uAdd) gl.uniform1f(u.uAdd, 0);
        if (u.uWetVM) gl.uniform1f(u.uWetVM, 0);
        if (u.uRainVM) gl.uniform1f(u.uRainVM, 0);
        gl.uniformMatrix4fv(u.uProj, false, r.proj);
        gl.uniform3f(u.uSunView, v[0] * s[0] + v[4] * s[1] + v[8] * s[2], v[1] * s[0] + v[5] * s[1] + v[9] * s[2], v[2] * s[0] + v[6] * s[1] + v[10] * s[2]);
        gl.uniform3fv(u.uSunCol, r.sky.sunCol);
        gl.uniform3fv(u.uSkyCol, r.sky.skyCol);
        gl.uniform3fv(u.uGroundCol, r.sky.ground);
        gl.uniform1f(u.uSkyVis, 1);
        gl.uniform3f(u.uFlash, 0, 0, 0);
      }
      // Columns of the rotation: up along the surface normal once it has landed, tumbling until then.
      let ax, ay, az, bx, by, bz, cx, cy, cz;
      if (p.stuck && p.nrm) {
        [bx, by, bz] = p.nrm;
        if (by) { ax = 1; ay = 0; az = 0; } else { ax = 0; ay = 1; az = 0; }
        cx = ay * bz - az * by; cy = az * bx - ax * bz; cz = ax * by - ay * bx;
      } else {
        const a = p.t * 5.1, e = p.t * 7.3, ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
        ax = ca; ay = 0; az = -sa;
        bx = sa * se; by = ce; bz = ca * se;
        cx = sa * ce; cy = -se; cz = ca * ce;
      }
      m[0] = ax * S; m[1] = ay * S; m[2] = az * S; m[3] = 0;
      m[4] = bx * S; m[5] = by * S; m[6] = bz * S; m[7] = 0;
      m[8] = cx * S; m[9] = cy * S; m[10] = cz * S; m[11] = 0;
      m[12] = p.x; m[13] = p.y; m[14] = p.z; m[15] = 1;
      multiply(mv, r.view, m);
      n[0] = mv[0]; n[1] = mv[1]; n[2] = mv[2]; n[3] = mv[4]; n[4] = mv[5]; n[5] = mv[6]; n[6] = mv[8]; n[7] = mv[9]; n[8] = mv[10];
      const u = r.pBox.u;
      gl.uniformMatrix4fv(u.uModelView, false, mv);
      gl.uniformMatrix3fv(u.uNormalMat, false, n);
      const L = r.lightAt(p.x, p.z), torch = r.spot ? .35 : 0;
      gl.uniform3f(u.uLocalLight, L[0] + torch, L[1] + torch, L[2] + torch);
      gl.bindVertexArray(box.vao);
      gl.drawArrays(gl.TRIANGLES, 0, box.count);
    }
    if (bound) gl.bindVertexArray(null);
  }

  draw(gl, r, player, dt) {
    const id = player.weapon;
    const m = id && this.models[id];
    if (!m || !player.alive) return;
    if (this.handTone !== player.skin) this.setHands(gl, player.skin);
    this.t += dt;
    const pose = POSES[id] || POSES.pistol;
    const ads = player.ads;
    const sd = Math.min(dt, 1 / 30);
    // A shot: the gun is thrown back into your hands and up, with a twist that is never quite the same twice.
    if (player.shotN !== this.shots) {
      const k = player.shotKick || .012, heavy = Math.min(1, k / .05);
      this.shots = player.shotN;
      const a = 1 - ads * .45;
      // Played up a little: every shot should land in your hands, not just in the sound.
      this.sp.vz += (2.3 + heavy * 4.2) * a;
      this.sp.vrx += (11 + heavy * 26) * a;
      this.sp.vy += (.9 + heavy * 2.6) * a;
      this.sp.vrz += (Math.random() - .5) * (6 + heavy * 13) * a;
      this.sp.vx += (Math.random() - .5) * (.45 + heavy * .9) * a;
      this.flickT = 0;
      // A handgun has nothing to brace it but your wrists: it snaps up and back, rises in your hands, and the slide slams back.
      const flip = (pose.flip || 0) * (1 - ads * .35) * (.85 + Math.random() * .3);
      if (flip) {
        this.sp.vrx += 26 * flip;
        this.sp.vz += 4 * flip;
        this.sp.vy += 3 * flip;
        this.sp.vrz += (Math.random() - .3) * 7 * flip;
        this.slide = 1;
      }
      this.flashRoll = Math.random() * 6.283;
    }
    // The rest of handling the gun has some weight to it too: the magazine slapped home at the end of a reload, the tip forward as
    // one starts, and a gun just drawn settling into your hands.
    if (!pose.melee && player.weapon === this.lastWeapon) {
      if (player.reloadT > 0 && !(this.prevReload > 0)) { this.sp.vrz += 7; this.sp.vrx -= 6; }
      if (this.prevReload > 0 && !(player.reloadT > 0)) { this.sp.vy += 3.2; this.sp.vrx += 13; this.sp.vz -= 1.6; this.sp.vrz -= 5; }
      if (this.prevSwap > 0 && !(player.swapT > 0)) { this.sp.vy -= 1.8; this.sp.vrx -= 9; }
    }
    this.prevReload = player.reloadT; this.prevSwap = player.swapT; this.lastWeapon = player.weapon;
    // Fire on the run and the gun snaps up to where the shot goes, holds there a moment, then drops back to the sprint.
    this.flickT = (this.flickT ?? 9) + sd;
    const flickTo = this.flickT < .2 ? 1 : 0;
    this.flickK = (this.flickK || 0) + (flickTo - (this.flickK || 0)) * Math.min(1, sd * (flickTo ? 32 : 6));
    const sp = this.sp, spring = (p, v, k, c) => { sp[v] += (-k * sp[p] - c * sp[v]) * sd; sp[p] += sp[v] * sd; };
    spring('z', 'vz', 260, 21); spring('rx', 'vrx', 230, 19); spring('rz', 'vrz', 200, 18); spring('x', 'vx', 220, 20); spring('y', 'vy', 240, 20);
    this.slide = Math.max(0, this.slide - sd * 9);
    // It trails the turn of your head a moment, and leans into the way you are moving.
    if (this.lastYaw === null) { this.lastYaw = player.yaw; this.lastPitch = player.pitch; }
    let dyaw = player.yaw - this.lastYaw;
    while (dyaw > Math.PI) dyaw -= 6.2832;
    while (dyaw < -Math.PI) dyaw += 6.2832;
    const dpitch = player.pitch - this.lastPitch;
    this.lastYaw = player.yaw; this.lastPitch = player.pitch;
    const steady = 1 - ads * .75;
    const tx = Math.max(-.06, Math.min(.06, -dyaw / Math.max(sd, .001) * .006)) * steady, ty = Math.max(-.05, Math.min(.05, -dpitch / Math.max(sd, .001) * .005)) * steady;
    this.swayX += (tx - this.swayX) * Math.min(1, sd * 9);
    this.swayY += (ty - this.swayY) * Math.min(1, sd * 9);
    const side = player.vx * Math.cos(player.yaw) + player.vz * Math.sin(player.yaw);
    this.lean += (Math.max(-1, Math.min(1, side / 6)) * steady - this.lean) * Math.min(1, sd * 6);
    // Out in the rain it gets wet, more in a downpour than a drizzle. Indoors it dries off slowly.
    const sky = this.settleWet > 0 && player.roofed !== undefined ? (player.roofed ? .08 : 1) : player.skyVis;
    const rainHere = (r.rain || 0) * (r.rainVis ?? 1) * Math.max(0, Math.min(1, (sky - .35) / .4));
    const wetTo = Math.min(1, rainHere * 1.15);
    // The first few frames of a game it takes the weather it finds, rather than drying off slowly from whatever it was before.
    if (this.settleWet > 0) { this.settleWet--; this.wet = wetTo; this.rainOn = wetTo > .01 ? 1 : 0; }
    else this.wet += (wetTo - this.wet) * Math.min(1, sd * (wetTo > this.wet ? .5 : .04));
    // Whether rain is landing on it right now, apart from how wet it still is. Under a roof the finish stays dark and shiny for a while,
    // but nothing new lands on it, so the beads go and nothing runs.
    this.rainOn = (this.rainOn ?? 0) + ((rainHere > .01 ? 1 : 0) - (this.rainOn ?? 0)) * Math.min(1, sd * 2.5);
    const bx = Math.cos(player.bob) * .012 * player.bobAmt, by = Math.abs(Math.sin(player.bob)) * .018 * player.bobAmt;
    const breathe = Math.sin(this.t * 1.5) * .003;
    const sightY = pose.tip !== undefined ? -pose.tip : pose.sight !== undefined ? -pose.sight - .012 : pose.pos[1];
    let px = pose.pos[0] * (1 - ads) + bx * (1 - ads * .8);
    let py = pose.pos[1] + (sightY - pose.pos[1]) * ads - by * (1 - ads * .7) + breathe;
    let pz = pose.pos[2] + ((pose.adsZ ?? pose.pos[2] + .04) - pose.pos[2]) * ads;
    const base = pose.rot || [0, 0, 0];
    let rx = base[0] * (1 - ads) + player.kickY * 1.4 + sp.rx * .1, ry = base[1] * (1 - ads) + this.swayX * 1.4, rz = base[2] * (1 - ads) + sp.rz * .05 - this.lean * .06;
    pz += sp.z * .06 + player.vmKick * .02;
    py += sp.y * .06;
    px += this.swayX * .35 + sp.x * .02 - this.lean * .012;
    py += this.swayY * .3;
    rx += this.swayY * 1.1;
    // Reloading looks like what it is for each kind of gun. this.rl eases in and out, so it never snaps into or out of the pose.
    const reloading = player.reloadT > 0 && !pose.melee;
    if (reloading && player.reloadT > (this.lastReloadT || 0) + .05) { this.reloadTotal = player.reloadT; this.shellN = (this.shellN || 0) + 1; }
    if (!reloading) this.shellN = 0;
    this.lastReloadT = player.reloadT;
    this.rl = (this.rl || 0) + ((reloading ? 1 : 0) - (this.rl || 0)) * Math.min(1, sd * (reloading ? 9 : 7));
    if (this.rl > .001 && !pose.melee) {
      const k = this.rl, p = reloading ? Math.max(0, Math.min(1, 1 - player.reloadT / (this.reloadTotal || 1))) : 1;
      const bump = (at, w) => Math.max(0, 1 - Math.abs(p - at) / w);
      if (id === 'shotgun') {
        // On its side, port up, a shell pushed in each time round, the hand going back to the belt for the next.
        const push = p < .4 ? p / .4 : Math.max(0, 1 - (p - .4) / .3);
        rz += .75 * k; rx += .14 * k; py -= .035 * k; px -= .03 * k;
        pz -= .025 * push * k; rx += .05 * push * k; rz -= .06 * push * k;
      } else if (id === 'revolver') {
        // Rolled over, muzzle up, cylinder out: a flick to shake the empties out, a nudge for every round thumbed in, and a flick of
        // the wrist to snap it shut.
        rz += .95 * k; rx += .5 * k; py += .015 * k; px -= .05 * k;
        const ph = player.reloadPhase;
        if (ph === 'open') { rx += .35 * bump(.65, .3) * k; py += .02 * bump(.65, .3) * k; }
        else if (ph === 'load') { rz += .06 * Math.sin(p * Math.PI) * k; py -= .008 * Math.sin(p * Math.PI) * k; }
        else if (ph === 'close') { rz -= .45 * bump(.55, .35) * k; rx -= .12 * bump(.55, .35) * k; }
      } else if (id === 'lmg') {
        // Belt-fed: canted over a little and the muzzle dipped, so you look down into the top of it, then the cover slammed shut at the end.
        rz += .32 * k; rx -= .2 * k; py -= .045 * k; px -= .03 * k; pz += .03 * k;
        py += .02 * bump(.8, .05) * k; rx += .09 * bump(.8, .05) * k; rz -= .05 * bump(.8, .05) * k;
      } else {
        // Tipped to drop the magazine, held while the new one comes up, slapped home, and the slide or the bolt run.
        const light = id === 'pistol' || id === 'smg';
        rz += (light ? .35 : .5) * k; rx += (light ? .12 : -.25) * k; py -= .05 * k; px -= .02 * k;
        py += .025 * bump(.72, .06) * k; rx += .12 * bump(.72, .06) * k;
        pz += .045 * bump(.9, .08) * k; rz -= .2 * bump(.9, .08) * k; ry -= .12 * bump(.9, .08) * k;
      }
    }
    if (player.swapT > 0) { py -= player.swapT * .7; rx -= player.swapT * 1.6; }
    // Eased, not switched, so the model never snaps between poses when a sprint starts or ends.
    const run = (player.sprintK || 0) * (pose.melee ? 1 : 1 - this.flickK);
    if (run > .001) {
      if (pose.melee) { rx += .22 * run; py -= .03 * run; px += .02 * run; } else { rx -= .22 * run; ry += .34 * run; px -= .05 * run; py -= .02 * run; }
    }
    if (player.swing > 0 && player.swingDur) {
      const t = 1 - player.swing / player.swingDur;
      if (pose.melee) {
        // A swing with weight in it: drawn back and up (further the heavier it is), brought down fast and across, a jolt where it
        // lands, a moment's follow-through, then lifted back to the ready. The sledge goes up over the shoulder; the crowbar barely needs to.
        const heavy = id === 'sledge' ? 1 : id === 'axe' ? .6 : .25;
        const ease = (x) => x * x * (3 - 2 * x), easeIn = (x) => x * x * x;
        const wEnd = .26 + heavy * .06, sEnd = wEnd + .18 - heavy * .03;
        const wind = t < wEnd ? ease(t / wEnd) : 1;
        const chop = t < wEnd ? 0 : easeIn(Math.min(1, (t - wEnd) / (sEnd - wEnd)));
        const rec = t > sEnd + .08 ? ease(Math.min(1, (t - sEnd - .08) / (1 - sEnd - .08))) : 0;
        const k = 1 - rec, back = wind * (1 - chop);
        // Drawn back more than up: lifted high, the arm and shoulder come up into a wide view.
        rx += ((.34 + heavy * .22) * back - (1.05 + heavy * .15) * chop) * k;
        rz += (-(.08 + heavy * .06) * back + (.45 - heavy * .15) * chop) * k;
        ry += ((.08 * heavy) * back + (.38 - heavy * .12) * chop) * k;
        px += ((.035 + heavy * .02) * back - (.21 - heavy * .06) * chop) * k;
        py += ((.035 + heavy * .03) * back - (.02 + heavy * .03) * chop) * k;
        pz += ((.08 + heavy * .05) * back - (.11 - heavy * .02) * chop) * k;
        // The jolt as it connects.
        const hit = t > sEnd - .02 && t < sEnd + .08 ? Math.sin((t - sEnd + .02) / .1 * Math.PI) : 0;
        if (hit > 0) { rx += Math.sin(t * 90) * .025 * hit * (1 + heavy); py -= .01 * hit * (1 + heavy); }
      } else {
        const s = Math.sin(Math.min(1, t * 2.4) * Math.PI);
        rx -= s * 1.1; pz -= s * .22; py += s * .12;
      }
    }
    if (player.cook > 0) { py += .08; pz += .08; rx += .4; }

    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    // R = Ry * Rx * Rz (column major)
    const mv = this.mv;
    mv[0] = cy * cz + sy * sx * sz; mv[1] = cx * sz; mv[2] = -sy * cz + cy * sx * sz; mv[3] = 0;
    mv[4] = -cy * sz + sy * sx * cz; mv[5] = cx * cz; mv[6] = sy * sz + cy * sx * cz; mv[7] = 0;
    mv[8] = sy * cx; mv[9] = -sx; mv[10] = cy * cx; mv[11] = 0;
    mv[12] = px; mv[13] = py; mv[14] = pz; mv[15] = 1;
    const n = this.normal;
    n[0] = mv[0]; n[1] = mv[1]; n[2] = mv[2]; n[3] = mv[4]; n[4] = mv[5]; n[5] = mv[6]; n[6] = mv[8]; n[7] = mv[9]; n[8] = mv[10];

    const p = r.pBox.use();
    const u = p.u;
    gl.uniformMatrix4fv(u.uProj, false, r.vmProj);
    gl.uniformMatrix4fv(u.uModelView, false, mv);
    gl.uniformMatrix3fv(u.uNormalMat, false, n);
    const v = r.view, s = r.sky.sunDir;
    gl.uniform3f(u.uSunView, v[0] * s[0] + v[4] * s[1] + v[8] * s[2], v[1] * s[0] + v[5] * s[1] + v[9] * s[2], v[2] * s[0] + v[6] * s[1] + v[10] * s[2]);
    gl.uniform3fv(u.uSunCol, r.sky.sunCol);
    gl.uniform3fv(u.uSkyCol, r.sky.skyCol);
    gl.uniform3fv(u.uGroundCol, r.sky.ground);
    gl.uniform1f(u.uSkyVis, player.skyVis);
    gl.uniform3f(u.uFlash, player.flash * 5, player.flash * 3, player.flash * 1.3);
    const L = r.lightAt(player.x, player.z);
    // Your own torch points away from the gun: it only catches the back of it a little.
    const torch = player.flashlight ? .055 : 0;
    gl.uniform3f(u.uLocalLight, L[0] + torch, L[1] + torch * .95, L[2] + torch * .85);
    if (u.uVM) gl.uniform1f(u.uVM, 1);
    if (u.uAdd) gl.uniform1f(u.uAdd, 0);
    if (u.uWetVM) gl.uniform1f(u.uWetVM, this.wet);
    if (u.uRainVM) gl.uniform1f(u.uRainVM, this.rainOn ?? 0);
    if (u.uVMTime) gl.uniform1f(u.uVMTime, this.t % 1000);
    const split = this.split[id];
    if (split) {
      gl.bindVertexArray(split.frame.vao);
      gl.drawArrays(gl.TRIANGLES, 0, split.frame.count);
      // Back fast, home a little slower on its spring.
      const t = 1 - this.slide, back = t < .25 ? t / .25 : Math.max(0, 1 - (t - .25) / .75) ** 2;
      const off = this.slide > 0 ? split.travel * back : 0, L3 = this.local;
      L3.fill(0); L3[0] = L3[5] = L3[10] = L3[15] = 1; L3[14] = off;
      multiply(this.fmv, mv, L3);
      gl.uniformMatrix4fv(u.uModelView, false, this.fmv);
      gl.bindVertexArray(split.slide.vao);
      gl.drawArrays(gl.TRIANGLES, 0, split.slide.count);
      gl.uniformMatrix4fv(u.uModelView, false, mv);
    } else {
      gl.bindVertexArray(m.vao);
      gl.drawArrays(gl.TRIANGLES, 0, m.count);
      if (id === 'lmg') {
        // The feed cover on its hinge, and the box where the reload has it.
        const k = this.rl || 0, p = player.reloadT > 0 ? Math.max(0, Math.min(1, 1 - player.reloadT / (this.reloadTotal || 1))) : 1;
        const st = k > .001 ? lmgReloadAt(p) : { cover: 0, box: [0, 0, 0] };
        const a = -.85 * st.cover * k, c = Math.cos(a), s = Math.sin(a), [hy, hz] = LMG_HINGE, L6 = this.local;
        L6.fill(0); L6[0] = 1; L6[5] = c; L6[6] = s; L6[9] = -s; L6[10] = c; L6[15] = 1;
        L6[13] = hy - (c * hy - s * hz); L6[14] = hz - (s * hy + c * hz);
        multiply(this.fmv, mv, L6);
        gl.uniformMatrix4fv(u.uModelView, false, this.fmv);
        gl.bindVertexArray(this.lmgCover.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.lmgCover.count);
        if (st.box) {
          L6.fill(0); L6[0] = L6[5] = L6[10] = L6[15] = 1; L6[12] = st.box[0] * k; L6[13] = st.box[1] * k; L6[14] = st.box[2] * k;
          multiply(this.fmv, mv, L6);
          gl.uniformMatrix4fv(u.uModelView, false, this.fmv);
          gl.bindVertexArray(this.lmgBox.vao);
          gl.drawArrays(gl.TRIANGLES, 0, this.lmgBox.count);
        }
        gl.uniformMatrix4fv(u.uModelView, false, mv);
      }
    }
    // The flash, out of the muzzle itself, for the instant it lasts: light only, added on top of the world.
    const mz = MUZZLE[id];
    // Where the barrel's mouth is on the screen. The gun is drawn with its own lens, not the world's, so a shot leaves from here
    // rather than from a point worked out in the world, which at a wide field of view sits somewhere behind the gun.
    if (mz) {
      const vx = mv[0] * mz[0] + mv[4] * mz[1] + mv[8] * mz[2] + mv[12], vy = mv[1] * mz[0] + mv[5] * mz[1] + mv[9] * mz[2] + mv[13];
      const vz = mv[2] * mz[0] + mv[6] * mz[1] + mv[10] * mz[2] + mv[14], VP = r.vmProj;
      if (vz < -.01) this.muzzleScreen = { id, x: (VP[0] * vx) / -vz, y: (VP[5] * vy) / -vz };
    }
    if (mz && player.flash > .35 && u.uAdd) {
      const big = FLASH_SIZE[id] || 1, f = (player.flash - .35) / .65, s = (.55 + f * .55) * big, cr = Math.cos(this.flashRoll), sr = Math.sin(this.flashRoll), L2 = this.local;
      L2.fill(0);
      L2[0] = cr * s; L2[1] = sr * s; L2[4] = -sr * s; L2[5] = cr * s; L2[10] = s * (.8 + f * .5); L2[15] = 1;
      L2[12] = mz[0]; L2[13] = mz[1]; L2[14] = mz[2];
      multiply(this.fmv, mv, L2);
      gl.uniformMatrix4fv(u.uModelView, false, this.fmv);
      gl.uniform1f(u.uAdd, f * f * .55 * Math.min(1.6, Math.sqrt(big)));
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false);
      gl.bindVertexArray(this.flash.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.flash.count);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.uniform1f(u.uAdd, 0);
      gl.uniformMatrix4fv(u.uModelView, false, mv);
    }
    const hands = this.hands[id];
    if (hands) {
      gl.bindVertexArray(hands.right.vao);
      gl.drawArrays(gl.TRIANGLES, 0, hands.right.count);
      if (hands.left) {
        // The left hand has a life of its own: it trails the gun a little when you walk, takes the kick late, and goes off to find
        // a fresh magazine during a reload, going back and forth for as long as it takes.
        let ox = bx * .25 * (1 - ads), oy = -by * .25 * (1 - ads), oz = player.vmKick * .018;
        // A revolver is loaded at the back of the cylinder, a round at a time: down to the pouch for one, up to the open chamber,
        // thumbed in, and back for the next. The round itself is in the fingers until it goes in.
        let round = null, pinch = false;
        if (id === 'revolver' && this.rl > .001) {
          const k = this.rl, ph = player.reloadPhase, p = player.reloadT > 0 ? Math.max(0, Math.min(1, 1 - player.reloadT / (this.reloadTotal || 1))) : 1;
          // The back of the cylinder, where it sits, on its left side: a round comes in from behind and is pushed into the chamber.
          const R = [0, -.095, 0], P = [-.12, -.2, .12], A = [-.04, .012, .065], C = [-.017, .008, .006];
          const ease = (t) => t * t * (3 - 2 * t), lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
          let tip = R;
          if (ph === 'open') tip = lerp(R, P, ease(Math.min(1, p * 1.4)));
          else if (ph === 'load') {
            if (p < .4) { tip = lerp(P, A, ease(p / .4)); round = tip; }
            else if (p < .68) { tip = lerp(A, C, ease((p - .4) / .28)); round = tip; }
            else tip = lerp(C, P, ease((p - .68) / .32));
          } else if (ph === 'close') tip = lerp(P, R, ease(Math.min(1, p * 1.3)));
          ox += (tip[0] - R[0]) * k; oy += (tip[1] - R[1]) * k; oz += (tip[2] - R[2]) * k;
          if (round) round = [R[0], R[1], R[2]];
          // Away from the grip, the hand is the simple one that holds a round, not the one shaped to hold the gun.
          pinch = !!hands.pinch && (ph === 'load' || (ph === 'open' && p > .3) || (ph === 'close' && p < .65));
        } else if (id === 'lmg' && this.rl > .001) {
          // Cover up, the old box off and away, a fresh one from the pouch, the belt laid in the tray, the cover slapped down.
          const k = this.rl, p = player.reloadT > 0 ? Math.max(0, Math.min(1, 1 - player.reloadT / (this.reloadTotal || 1))) : 1;
          const tip = lmgReloadAt(p).tip;
          ox += tip[0] * k; oy += tip[1] * k; oz += tip[2] * k;
        } else if (this.rl > .001 && !pose.melee) {
          const k = this.rl, p = player.reloadT > 0 ? Math.max(0, Math.min(1, 1 - player.reloadT / (this.reloadTotal || 1))) : 1;
          // Away to a pouch or the belt and back: once for a magazine, once a shell for a shotgun, under the cylinder for a revolver.
          const reach = id === 'shotgun' ? (p < .4 ? 1 - p / .4 : (p - .4) / .6) : id === 'revolver' ? (player.reloadPhase === 'load' ? .25 + .75 * Math.abs(1 - p * 2) : .3) : p < .15 ? p / .15 : p < .6 ? 1 : Math.max(0, 1 - (p - .6) / .12);
          ox -= .03 * reach * k; oy -= .17 * reach * k; oz += .13 * reach * k;
        }
        mv[12] += mv[0] * ox + mv[4] * oy + mv[8] * oz;
        mv[13] += mv[1] * ox + mv[5] * oy + mv[9] * oz;
        mv[14] += mv[2] * ox + mv[6] * oy + mv[10] * oz;
        gl.uniformMatrix4fv(u.uModelView, false, mv);
        if (pinch) {
          const L5 = this.local;
          L5.fill(0); L5[0] = L5[5] = L5[10] = L5[15] = 1; L5[12] = 0; L5[13] = -.095; L5[14] = 0;
          multiply(this.fmv, mv, L5);
          gl.uniformMatrix4fv(u.uModelView, false, this.fmv);
          gl.bindVertexArray(hands.pinch.vao);
          gl.drawArrays(gl.TRIANGLES, 0, hands.pinch.count);
          gl.uniformMatrix4fv(u.uModelView, false, mv);
        } else {
          gl.bindVertexArray(hands.left.vao);
          gl.drawArrays(gl.TRIANGLES, 0, hands.left.count);
        }
        if (round) {
          // The cartridge between finger and thumb, nose first towards the chamber.
          const L4 = this.local;
          L4.fill(0); L4[0] = L4[5] = L4[10] = L4[15] = 1; L4[12] = round[0]; L4[13] = round[1]; L4[14] = round[2];
          multiply(this.fmv, mv, L4);
          gl.uniformMatrix4fv(u.uModelView, false, this.fmv);
          gl.bindVertexArray(this.roundVao.vao);
          gl.drawArrays(gl.TRIANGLES, 0, this.roundVao.count);
        }
      }
    }
    gl.bindVertexArray(null);
  }
}
