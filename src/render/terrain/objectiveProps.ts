import * as THREE from "three";
import { hexKey, type BoardHex, type BoardLayout, type HexCoord, type ObjectiveKind } from "../../game/board";
import { GeoBuilder, color, trs } from "../geo/GeoBuilder";
import { boardCenter, hexToWorld, mulberry32 } from "../hexWorld";
import type { Skin } from "../skins/types";

/**
 * Objectives on open ground (M2): the Host's barricade and wagon park, and the
 * Banners' sluice-house. Each is built three times, intact, battered and broken,
 * so the Diorama swaps meshes and never rebuilds. The Host's props break the
 * lore's way ("Bring the Water"): staved barrels, overturned carts, doused
 * fire-pots that steam. Nothing in them burns. The sluice breaks into water.
 * The gatehouse stays in the walls (buildIsland).
 */

/** What the renderer draws for `hex`'s objective: its `objectiveKind`, or the old default. */
export function objectiveDressing(hex: BoardHex): ObjectiveKind | null {
  if (!hex.objectiveId) return null;
  const kind = hex.objectiveKind ?? (hex.terrain === "wall" ? "gatehouse" : null);
  // A gatehouse needs a wall to stand in.
  if (kind === "gatehouse" && hex.terrain !== "wall") return null;
  return kind;
}

/**
 * Unit world (x, z) direction an objective prop faces: toward its attackers'
 * deployment. The attackers are the side not deployed on the objective hex;
 * when nobody is, the side deployed farther from it. No deployment: toward the
 * board centre, else west.
 */
export function objectiveFacing(board: BoardLayout, at: HexCoord): [number, number] {
  const center = boardCenter(board);
  const [ox, oz] = hexToWorld(at, center);
  const centroid = (faction: string) => {
    const pts = board.hexes.filter((h) => h.deploymentFaction === faction).map((h) => hexToWorld(h.coord, center));
    if (pts.length === 0) return null;
    return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] as [number, number];
  };
  const here = board.hexes.find((h) => hexKey(h.coord) === hexKey(at))?.deploymentFaction;
  const sides = (["free_banners", "ashen_host"] as const)
    .map((f) => ({ f, c: centroid(f) }))
    .filter((s): s is { f: "free_banners" | "ashen_host"; c: [number, number] } => s.c !== null && s.f !== here)
    .sort((a, b) => Math.hypot(b.c[0] - ox, b.c[1] - oz) - Math.hypot(a.c[0] - ox, a.c[1] - oz));
  const target = sides[0]?.c ?? [0, 0];
  const dx = target[0] - ox;
  const dz = target[1] - oz;
  const len = Math.hypot(dx, dz);
  return len < 1e-6 ? [-1, 0] : [dx / len, dz / len];
}

/** How far an objective has been battered (the Diorama's `objectiveStates`). */
export type ObjectiveStage = "intact" | "battered" | "broken";
export const OBJECTIVE_STAGES: readonly ObjectiveStage[] = ["intact", "battered", "broken"];

type Point = { x: number; y: number; z: number };

/** A water jet from the sluice gate: world origin, unit direction (x, z) and strength 0..1. */
export interface WaterJet extends Point {
  dirX: number;
  dirZ: number;
  strength: number;
  /** Width of the outflow (world units); a breach runs wide. */
  width: number;
}

export interface PropStage {
  geometry: THREE.BufferGeometry;
  /** Live coals in the pots (an emissive mesh); null once they are all doused. */
  embers: THREE.BufferGeometry | null;
  /** Where doused pots steam (world). */
  steam: Point[];
  /** Water escaping the sluice (world). */
  jets: WaterJet[];
}

export interface ObjectiveProp {
  kind: Exclude<ObjectiveKind, "gatehouse">;
  coord: HexCoord;
  /** Hex centre (world) and surface height. */
  x: number;
  z: number;
  top: number;
  /** Unit (x, z) the prop is turned toward: the attackers, or downstream for the sluice. */
  facing: [number, number];
  stages: Record<ObjectiveStage, PropStage>;
  /** Pot mouths that burn at night (world), and the stage that douses each. */
  pots: Array<Point & { douse: Exclude<ObjectiveStage, "intact"> }>;
}

const PRIM = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cone6: new THREE.ConeGeometry(1, 1, 6),
  ico: new THREE.IcosahedronGeometry(1, 0),
  rock: new THREE.DodecahedronGeometry(1, 0),
  /** A clay pot: narrower at the mouth. */
  pot: new THREE.CylinderGeometry(0.72, 1, 1, 8),
  /** Pitched roof, ridge along x. */
  roof: (() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, 0);
    shape.lineTo(0.5, 0);
    shape.lineTo(0, 0.5);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5);
    g.rotateY(Math.PI / 2);
    return g;
  })(),
};

const PAL = {
  timber: color("#5a4030"),
  timberDark: color("#3e2c20"),
  plank: color("#6e5238"),
  iron: color("#2a2624"),
  clay: color("#7a4630"),
  clayDark: color("#4e2c1e"),
  barrel: color("#6a4a2e"),
  hoop: color("#2b2622"),
  ash: color("#55524e"),
  wet: color("#26231f"),
  canvas: color("#6a6052"),
  splinter: color("#8a6a48"),
  // Covenant stonework: pale dressed blocks, darker coping, slate.
  stone: color("#b4ad9c"),
  stoneDark: color("#8a8476"),
  crack: color("#2e2c2a"),
  slate: color("#4a5058"),
  gate: color("#54452f"),
  foam: color("#cfd9da"),
  water: color("#6f8e99"),
};

/** Places parts in a prop's local frame (+x toward the attackers, or downstream; y up). */
class Frame {
  constructor(
    readonly b: GeoBuilder,
    readonly base: THREE.Matrix4,
    readonly rand: () => number,
  ) {}

  /** A child frame at local (x, y, z), turned by `yaw`, then tipped about local x and z. */
  child(x: number, y: number, z: number, yaw = 0, tiltX = 0, tiltZ = 0): Frame {
    const m = this.base
      .clone()
      .multiply(new THREE.Matrix4().makeTranslation(x, y, z))
      .multiply(new THREE.Matrix4().makeRotationY(yaw))
      .multiply(new THREE.Matrix4().makeRotationX(tiltX))
      .multiply(new THREE.Matrix4().makeRotationZ(tiltZ));
    return new Frame(this.b, m, this.rand);
  }

  /** The same placement, drawing into another builder (the ember mesh). */
  into(b: GeoBuilder | null): Frame | null {
    return b ? new Frame(b, this.base, this.rand) : null;
  }

  add(prim: THREE.BufferGeometry, local: THREE.Matrix4, col: THREE.Color, jitter = 0.08) {
    this.b.add(prim, this.base.clone().multiply(local), col, jitter, this.rand);
  }

  world(x: number, y: number, z: number): Point {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(this.base);
    return { x: v.x, y: v.y, z: v.z };
  }

  /** World direction (x, z) of a local direction. */
  dir(x: number, z: number): [number, number] {
    const v = new THREE.Vector3(x, 0, z).transformDirection(this.base);
    const len = Math.hypot(v.x, v.z) || 1;
    return [v.x / len, v.z / len];
  }
}

// --- Host props ---------------------------------------------------------------

/** A cart: bed along x, wheels at z = ±0.13, resting on y = 0. `wheels` drops some. */
function cart(f: Frame, wheels: [boolean, boolean] = [true, true], load?: (bed: Frame) => void) {
  f.add(PRIM.box, trs(0, 0.12, 0, 0, 0, 0, 0.4, 0.035, 0.22), PAL.plank);
  f.add(PRIM.box, trs(0, 0.17, 0.105, 0, 0, 0, 0.4, 0.07, 0.015), PAL.timber);
  f.add(PRIM.box, trs(0, 0.17, -0.105, 0, 0, 0, 0.4, 0.07, 0.015), PAL.timber);
  f.add(PRIM.box, trs(-0.195, 0.17, 0, 0, 0, 0, 0.015, 0.07, 0.22), PAL.timber);
  f.add(PRIM.cyl6, trs(0.02, 0.08, 0, Math.PI / 2, 0, 0, 0.012, 0.28, 0.012), PAL.iron);
  wheels.forEach((on, i) => {
    if (!on) return;
    const z = i === 0 ? -0.13 : 0.13;
    f.add(PRIM.cyl8, trs(0.02, 0.08, z, Math.PI / 2, 0, 0, 0.08, 0.02, 0.08), PAL.timberDark);
    f.add(PRIM.cyl6, trs(0.02, 0.08, z * 1.08, Math.PI / 2, 0, 0, 0.02, 0.022, 0.02), PAL.iron);
  });
  f.add(PRIM.box, trs(0.33, 0.1, 0.07, 0, 0, -0.22, 0.28, 0.018, 0.018), PAL.timberDark);
  f.add(PRIM.box, trs(0.33, 0.1, -0.07, 0, 0, -0.22, 0.28, 0.018, 0.018), PAL.timberDark);
  load?.(f.child(0, 0.14, 0));
}
/** Upright, on its side (tipped about its length) or overturned, from a frame on the ground. */
const cartUpright = (f: Frame, wheels?: [boolean, boolean], load?: (bed: Frame) => void) => cart(f, wheels, load);
const cartOnSide = (f: Frame, side = 1, wheels?: [boolean, boolean]) => cart(f.child(0, 0.14, 0, 0, (Math.PI / 2) * side), wheels);
const cartOverturned = (f: Frame, wheels?: [boolean, boolean]) => cart(f.child(0, 0.21, 0, 0, Math.PI), wheels);

function looseWheel(f: Frame) {
  f.add(PRIM.cyl8, trs(0, 0.011, 0, 0, 0, 0, 0.08, 0.02, 0.08), PAL.timberDark);
  f.add(PRIM.cyl6, trs(0, 0.022, 0, 0, 0, 0, 0.02, 0.01, 0.02), PAL.iron);
}

function barrel(f: Frame) {
  f.add(PRIM.cyl8, trs(0, 0.06, 0, 0, 0, 0, 0.048, 0.12, 0.048), PAL.barrel);
  f.add(PRIM.cyl8, trs(0, 0.025, 0, 0, 0, 0, 0.051, 0.012, 0.051), PAL.hoop);
  f.add(PRIM.cyl8, trs(0, 0.095, 0, 0, 0, 0, 0.051, 0.012, 0.051), PAL.hoop);
}

/** A barrel lying on its side, along local x. */
function barrelOnSide(f: Frame) {
  barrel(f.child(0, 0.048, 0, 0, 0, Math.PI / 2).child(0, -0.06, 0));
}

/** A staved barrel: the bottom ring, a hoop and the staves sprung loose, in a dark wet spill. */
function stavedBarrel(f: Frame) {
  const r = f.rand;
  f.add(PRIM.cyl8, trs(0, 0.002, 0, 0, 0, 0, 0.13, 0.004, 0.11), PAL.wet, 0.04);
  f.add(PRIM.cyl8, trs(0, 0.022, 0, 0, 0, 0, 0.048, 0.044, 0.048), PAL.barrel);
  f.add(PRIM.cyl8, trs(0.06, 0.006, 0.05, 0.1, 0, 0.12, 0.052, 0.008, 0.052), PAL.hoop);
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + r() * 0.6;
    const d = 0.07 + r() * 0.05;
    f.add(PRIM.box, trs(Math.cos(a) * d, 0.006, Math.sin(a) * d, 0, a + (r() - 0.5) * 0.8, (r() - 0.5) * 0.2, 0.11, 0.008, 0.026), PAL.barrel);
  }
}

/** A clay fire-pot with coals heaped in the mouth (drawn into `embers`). */
function firePot(f: Frame, embers: Frame | null) {
  f.add(PRIM.pot, trs(0, 0.03, 0, 0, 0, 0, 0.04, 0.06, 0.04), PAL.clay);
  f.add(PRIM.cyl8, trs(0, 0.06, 0, 0, 0, 0, 0.031, 0.008, 0.031), PAL.clayDark);
  embers?.add(PRIM.ico, trs(0, 0.064, 0, 0.4, 0.7, 0, 0.024, 0.014, 0.024), PAL.ash, 0);
}

/** A doused pot: knocked on its side, the coals spilled as grey ash in a wet patch. */
function dousedPot(f: Frame) {
  const r = f.rand;
  f.add(PRIM.cyl8, trs(0.05, 0.002, 0, 0, 0, 0, 0.1, 0.004, 0.08), PAL.wet, 0.04);
  f.child(0, 0.032, 0, r() * 0.6, 0, Math.PI / 2 + 0.15).add(PRIM.pot, trs(0, 0, 0, 0, 0, 0, 0.04, 0.06, 0.04), PAL.clay);
  for (let i = 0; i < 3; i += 1) {
    f.add(PRIM.ico, trs(0.06 + r() * 0.05, 0.008, (r() - 0.5) * 0.07, r(), r(), 0, 0.018, 0.008, 0.016), PAL.ash, 0.15);
  }
}

/** A sharpened stake leaning toward +x by `lean` radians from upright. */
function stake(f: Frame, len: number, lean: number) {
  const ax = Math.sin(lean);
  const ay = Math.cos(lean);
  f.add(PRIM.cyl6, trs((ax * len) / 2, (ay * len) / 2, 0, 0, 0, -lean, 0.016, len, 0.016), PAL.timber);
  f.add(PRIM.cone6, trs(ax * (len + 0.025), ay * (len + 0.025), 0, 0, 0, -lean, 0.016, 0.05, 0.016), PAL.timberDark);
}

interface Out {
  steam: Point[];
  jets: WaterJet[];
  pots: ObjectiveProp["pots"];
}
const out = (): Out => ({ steam: [], jets: [], pots: [] });

/**
 * The Saltgate barricade: stacked timber baulks across the road on the
 * attackers' side, stakes leaning out at them, two carts on their sides, end
 * barrels and fire-pots along the top. Battered: the top baulk and a cart down,
 * a barrel staved, one pot doused. Broken: pulled apart.
 */
function barricade(f: Frame, embers: GeoBuilder | null, s: number): Out {
  const r = f.rand;
  const o = out();
  const line = 0.4;
  // Baulks.
  if (s < 2) {
    f.add(PRIM.box, trs(line, 0.04, 0, 0, 0.03, 0, 0.075, 0.075, 1.15), PAL.timber);
    f.add(PRIM.box, trs(line - 0.02, 0.11, 0.02, 0.03, -0.04, 0, 0.075, 0.075, 1.08), PAL.timber);
    if (s === 0) f.add(PRIM.box, trs(line + 0.02, 0.18, -0.02, -0.02, 0.05, 0, 0.075, 0.075, 0.92), PAL.timber);
    else f.add(PRIM.box, trs(line + 0.22, 0.04, 0.12, 0, 0.42, 0, 0.075, 0.075, 0.92), PAL.timber);
    for (const z of [-0.42, 0, 0.42]) f.add(PRIM.cyl6, trs(line - 0.08, 0.15, z, 0, 0, 0, 0.022, 0.3, 0.022), PAL.timberDark);
  } else {
    f.add(PRIM.box, trs(line + 0.12, 0.04, -0.18, 0, 0.35, 0, 0.075, 0.075, 0.8), PAL.timber);
    f.add(PRIM.box, trs(line - 0.1, 0.04, 0.32, 0, -0.5, 0, 0.075, 0.075, 0.62), PAL.timber);
    f.add(PRIM.box, trs(line + 0.26, 0.04, 0.3, 0, 0.9, 0, 0.075, 0.075, 0.4), PAL.timber);
    f.add(PRIM.box, trs(line + 0.02, 0.07, -0.42, 0, -0.2, 0.35, 0.075, 0.075, 0.34), PAL.timber);
    f.add(PRIM.cyl6, trs(line - 0.08, 0.15, -0.42, 0, 0, 0.12, 0.022, 0.3, 0.022), PAL.timberDark);
    f.add(PRIM.cyl6, trs(line - 0.08, 0.04, 0.42, 0, 0, 0, 0.022, 0.08, 0.022), PAL.timberDark);
  }
  if (s > 0) {
    for (let i = 0; i < 3 * s; i += 1) {
      f.add(PRIM.box, trs(line + (r() - 0.3) * 0.5, 0.008, (r() - 0.5) * 0.9, 0, r() * Math.PI, 0, 0.1, 0.012, 0.018), PAL.splinter, 0.2);
    }
  }
  // Stakes.
  const standing = s === 0 ? 5 : s === 1 ? 4 : 2;
  for (let i = 0; i < 5; i += 1) {
    const z = -0.44 + i * 0.22;
    if (i < standing) stake(f.child(line + 0.05, 0.03, z), 0.3, s === 2 ? 1.1 + i * 0.15 : 0.85 + ((i * 37) % 7) * 0.02);
    else stake(f.child(line + 0.2, 0.016, z, 0.6 * (i - 3)), 0.3, Math.PI / 2);
  }
  // Carts at each end, beds toward the attackers.
  const end = (z: number) => f.child(line - 0.02, 0, z, Math.PI / 2);
  if (s === 0) {
    cartOnSide(end(-0.66), -1);
    cartOnSide(end(0.66), 1);
  } else if (s === 1) {
    cartOnSide(end(-0.66), -1);
    cartOverturned(f.child(line + 0.06, 0, 0.66, Math.PI / 2 - 0.35));
  } else {
    cartOverturned(f.child(line - 0.1, 0, -0.62, Math.PI / 2 + 0.5));
    cartOverturned(f.child(line + 0.08, 0, 0.66, Math.PI / 2 - 0.35), [true, false]);
    looseWheel(f.child(line + 0.32, 0, 0.52));
  }
  // End barrels.
  if (s < 2) barrel(f.child(line - 0.2, 0, -0.5));
  else stavedBarrel(f.child(line - 0.22, 0, -0.38));
  if (s === 0) barrel(f.child(line - 0.22, 0, 0.52));
  else if (s === 1) stavedBarrel(f.child(line - 0.24, 0, 0.46));
  else barrelOnSide(f.child(line + 0.34, 0, -0.5, 0.7));
  // Fire-pots along the top: the third goes out first.
  const potAt = [-0.3, 0.06, 0.36];
  const knocked = [
    [-0.06, -0.16],
    [0.2, 0.08],
    [0.2, 0.36],
  ];
  potAt.forEach((z, i) => {
    const douse = i === 2 ? "battered" : "broken";
    const lit = s === 0 || (s === 1 && douse === "broken");
    if (lit) {
      const at = f.child(line, s === 0 ? 0.215 : 0.145, z);
      firePot(at, at.into(embers));
      if (s === 0) o.pots.push({ ...at.world(0, 0.07, 0), douse });
    } else {
      const at = f.child(line + knocked[i][0], 0, knocked[i][1], r() * Math.PI);
      dousedPot(at);
      o.steam.push(at.world(0.05, 0.03, 0));
    }
  });
  return o;
}

/**
 * The Host's wagon park: three carts drawn up round the back and sides (the
 * front left open for the guard), fire-pot stacks carrying the coals, barrels
 * of pitch between. Battered: a cart over, a pot stack doused, barrels staved.
 */
function wagons(f: Frame, embers: GeoBuilder | null, s: number, skin: Skin): Out {
  const r = f.rand;
  const o = out();
  const cover = PAL.canvas.clone().lerp(color(skin.factions.ashen_host.secondary), 0.25);
  const ring = 0.62;
  const spots = [100, 180, 260].map((deg) => (deg * Math.PI) / 180);
  const potStack = (at: Frame, douse: "battered" | "broken") => {
    for (const [x, z] of [
      [-0.045, -0.03],
      [0.045, 0.03],
    ]) {
      const g = at.child(x, 0, z);
      firePot(g, g.into(embers));
    }
    const top = at.child(0, 0.062, 0);
    firePot(top, top.into(embers));
    if (s === 0) o.pots.push({ ...top.world(0, 0.07, 0), douse });
  };
  const spill = (at: Frame) => {
    dousedPot(at.child(-0.04, 0, 0));
    dousedPot(at.child(0.06, 0, 0.08, 1.4));
    o.steam.push(at.world(0, 0.03, 0));
  };
  spots.forEach((a, i) => {
    const x = Math.cos(a) * ring;
    const z = Math.sin(a) * ring;
    const yaw = -a + Math.PI / 2 + ((i * 53) % 10) * 0.025 - 0.12;
    // Wagon 0 goes over when battered; all three when broken (the middle only on its side).
    const down = s === 2 || (s === 1 && i === 0);
    if (!down) {
      cartUpright(f.child(x, 0, z, yaw), [true, true], (bed) => {
        if (i === 1) {
          potStack(bed.child(0.06, 0.004, 0), "broken");
          bed.add(PRIM.box, trs(-0.1, 0.07, 0, 0, 0, 0.5, 0.2, 0.012, 0.23), cover);
        } else {
          barrel(bed.child(-0.08, 0, 0.05));
          barrel(bed.child(0.06, 0, -0.04));
          bed.add(PRIM.box, trs(0.1, 0.03, 0.06, 0, 0.3, 0, 0.1, 0.06, 0.08), cover);
        }
      });
    } else if (i === 1) {
      cartOnSide(f.child(x * 1.05, 0, z * 1.05, yaw + 0.2));
    } else {
      cartOverturned(f.child(x * 1.05, 0, z * 1.05, yaw - 0.25), i === 2 ? [false, true] : [true, true]);
      if (i === 0) barrelOnSide(f.child(x * 0.7, 0, z * 0.7 - 0.1, 0.9));
    }
  });
  const ground = [
    [40, 0.5],
    [-40, 0.5],
    [140, 0.6],
    [220, 0.6],
  ].map(([deg, d]) => {
    const a = (deg * Math.PI) / 180;
    return f.child(Math.cos(a) * d, 0, Math.sin(a) * d, ((deg * 7) % 31) * 0.1);
  });
  // Pot stacks at the front corners: the first is doused when battered.
  if (s === 0) potStack(ground[0], "battered");
  else spill(ground[0]);
  if (s < 2) potStack(ground[1], "broken");
  else spill(ground[1]);
  // Barrel stacks between the carts.
  ground.slice(2).forEach((g, i) => {
    if (s === 0 || (s === 1 && i === 1)) {
      barrelOnSide(g.child(0, 0, -0.05));
      barrelOnSide(g.child(0, 0, 0.05));
      barrel(g.child(0, 0.088, 0));
    } else {
      stavedBarrel(g);
      barrelOnSide(g.child(0.18, 0, 0.1, 0.8));
    }
  });
  if (s === 2) {
    // The coal wagon's load, spilled and doused beside it.
    const a = spots[1];
    const at = f.child(Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38, a);
    dousedPot(at);
    dousedPot(at.child(0.05, 0, -0.1, 2.2));
    o.steam.push(at.world(0.02, 0.03, -0.04));
    looseWheel(f.child(Math.cos(spots[2]) * 0.3, 0, Math.sin(spots[2]) * 0.3));
  }
  return o;
}

// --- The Banners' sluice-house --------------------------------------------------

/**
 * The sluice-house at the weir: a Covenant stone weir across the channel (local
 * z), a timber sluice gate between two piers in the middle, and a small stone
 * house with a slate roof and the Banners' pennant on the bank end. +x is
 * downstream. Battered: cracks, blocks fallen at the foot, the gate bowed and
 * jetting water. Broken: the gate gone, the piers broken, the water running
 * through the breach.
 */
function sluice(f: Frame, s: number, skin: Skin, ctx: { waterY: number; wet: boolean; houseSide: number }): Out {
  const r = f.rand;
  const o = out();
  const banner = color(skin.factions.free_banners.primary);
  const bone = color(skin.factions.free_banners.secondary);
  const H = Math.max(0.3, ctx.waterY + 0.14);
  const T = 0.18;
  const gateHalf = 0.17;
  const pier = 0.1;
  // Bank to bank across a channel hex; a shorter run on dry ground.
  const len = ctx.wet ? 1.72 : 1.0;
  // Dressed blocks: courses of slightly varied stones, so it reads as masonry, not a slab.
  const wallRun = (z0: number, z1: number, height: number, chipped: boolean) => {
    const courses = Math.max(2, Math.round(height / 0.075));
    const ch = height / courses;
    for (let c = 0; c < courses; c += 1) {
      const n = Math.max(1, Math.round((z1 - z0) / 0.13));
      const off = c % 2 ? 0.5 : 0;
      for (let k = 0; k < n; k += 1) {
        const a = z0 + ((k + off * (k === 0 ? 0 : 1)) / n) * (z1 - z0);
        const b = z0 + ((k + 1 + (k === n - 1 ? 0 : off)) / n) * (z1 - z0);
        if (b - a < 0.01) continue;
        const shade = PAL.stone.clone().multiplyScalar(0.9 + r() * 0.16);
        f.add(PRIM.box, trs(0, ch * (c + 0.5), (a + b) / 2, 0, 0, 0, T, ch * 0.96, (b - a) * 0.97), shade, 0.04);
      }
    }
    // Coping, missing a stone or two when chipped.
    const copes = Math.max(1, Math.round((z1 - z0) / 0.12));
    for (let k = 0; k < copes; k += 1) {
      if (chipped && k % 3 === 1) continue;
      const a = z0 + (k / copes) * (z1 - z0);
      const b = z0 + ((k + 1) / copes) * (z1 - z0);
      f.add(PRIM.box, trs(0, height + 0.02, (a + b) / 2, 0, 0, 0, T + 0.04, 0.04, (b - a) * 0.96), PAL.stoneDark, 0.05);
    }
  };
  const crack = (z: number, height: number) => {
    // A zigzag of dark seams down the downstream face.
    let y = height - 0.02;
    let zz = z;
    for (let i = 0; i < 4; i += 1) {
      const dy = 0.05 + r() * 0.03;
      const dz = (r() - 0.5) * 0.06;
      const l = Math.hypot(dy, dz);
      f.add(PRIM.box, trs(T / 2 + 0.003, y - dy / 2, zz + dz / 2, Math.atan2(dz, dy), 0, 0, 0.006, l, 0.01), PAL.crack, 0);
      y -= dy;
      zz += dz;
    }
  };
  const rubble = (n: number, spread: number) => {
    for (let i = 0; i < n; i += 1) {
      f.add(PRIM.rock, trs(0.14 + r() * spread, 0.03, (r() - 0.5) * 0.5, r(), r(), r(), 0.035 + r() * 0.03, 0.03, 0.04), PAL.stone, 0.15);
    }
  };

  const zA = -len / 2;
  const zB = len / 2;
  // Weir runs either side of the gate.
  wallRun(zA, -gateHalf - pier, H, s > 0);
  wallRun(gateHalf + pier, zB, H, s === 2);
  // Piers.
  const pierH = H + 0.1;
  for (const side of [-1, 1]) {
    const z = side * (gateHalf + pier / 2);
    const broken = s === 2 && side === -1;
    const h = broken ? pierH * 0.55 : pierH;
    f.add(PRIM.box, trs(0, h / 2, z, 0, 0, 0, T + 0.05, h, pier), PAL.stone, 0.05);
    if (!broken) f.add(PRIM.box, trs(0, h + 0.02, z, 0, 0, 0, T + 0.08, 0.04, pier + 0.03), PAL.stoneDark);
  }
  // The gate, with its winch beam and wheel above, and a band of the Banners' blue.
  if (s < 2) {
    const bow = s === 1 ? 0.035 : 0;
    for (let i = 0; i < 4; i += 1) {
      const z = -gateHalf + (i + 0.5) * ((gateHalf * 2) / 4);
      const lean = s === 1 ? (i - 1.5) * 0.05 : 0;
      f.add(PRIM.box, trs(0.01 + bow * (1 - Math.abs(i - 1.5) / 2), H * 0.48, z, lean, 0, 0, 0.03, H * 0.9, (gateHalf * 2) / 4 - 0.006), PAL.gate, 0.08);
    }
    f.add(PRIM.box, trs(0.03 + bow, H * 0.72, 0, 0, 0, 0, 0.012, 0.06, gateHalf * 2), banner, 0);
    f.add(PRIM.box, trs(0.03 + bow, H * 0.25, 0, 0, 0, 0, 0.012, 0.02, gateHalf * 2), PAL.iron, 0);
    f.add(PRIM.box, trs(0, pierH + 0.07, 0, 0, 0, 0, 0.05, 0.05, gateHalf * 2 + pier * 2 + 0.04), PAL.timberDark);
    f.add(PRIM.cyl8, trs(-0.04, pierH + 0.07, gateHalf * 0.6, 0, 0, Math.PI / 2, 0.06, 0.012, 0.06), PAL.iron);
  } else {
    // Torn away: one plank hanging from the standing pier, the rest gone downstream.
    f.add(PRIM.box, trs(0.04, H * 0.55, gateHalf - 0.03, 0.5, 0, 0.3, 0.03, H * 0.7, 0.06), PAL.gate);
    f.add(PRIM.box, trs(0.55, ctx.waterY - 0.01, 0.12, 0, 0.9, 0.06, 0.03, 0.28, 0.06), PAL.gate);
    f.add(PRIM.box, trs(0.7, ctx.waterY - 0.01, -0.2, 0, 2.1, -0.05, 0.03, 0.24, 0.05), PAL.gate);
  }
  // Damage.
  if (s >= 1) {
    crack(-0.28, H);
    crack(gateHalf + pier + 0.08, H);
    rubble(s === 1 ? 4 : 9, s === 1 ? 0.12 : 0.35);
  }
  if (s === 2) {
    crack(0.3, H);
    // The breach: water running through, foam at the foot.
    for (let i = 0; i < 10; i += 1) {
      const d = r();
      f.add(PRIM.ico, trs(0.14 + d * 0.5, ctx.waterY + 0.004, (r() - 0.5) * gateHalf * (2 + d * 2), r(), r(), 0, 0.05 - d * 0.02, 0.01, 0.04), PAL.foam, 0.05);
    }
  }
  if (ctx.wet && s < 2) {
    // White water at the downstream foot, where it spills over the crest.
    for (let i = 0; i < 7; i += 1) {
      const z = zA + 0.1 + ((i + 0.5) / 7) * (len - 0.2);
      if (Math.abs(z) < gateHalf + pier) continue;
      f.add(PRIM.box, trs(T / 2 + 0.05, ctx.waterY + 0.004, z, 0, (r() - 0.5) * 0.3, 0, 0.08, 0.008, len / 8), PAL.foam, 0.1);
    }
  }
  if (!ctx.wet) {
    // On dry ground, the stone-lined lade the sluice feeds, so the gate has water to hold.
    for (const side of [-1, 1]) f.add(PRIM.box, trs(0.32, 0.025, side * (gateHalf + 0.03), 0, 0, 0, 0.5, 0.05, 0.04), PAL.stoneDark);
    f.add(PRIM.box, trs(0.32, 0.012, 0, 0, 0, 0, 0.5, 0.012, gateHalf * 2), s === 0 ? PAL.wet : PAL.water, 0.04);
  }
  // Water over and through the gate: seeping jets when battered, a breach when broken.
  if (s === 1) {
    for (const z of [-0.06, 0.05]) {
      const p = f.world(0.05, H * (0.3 + r() * 0.25), z);
      const [dx, dz] = f.dir(1, (r() - 0.5) * 0.3);
      o.jets.push({ ...p, dirX: dx, dirZ: dz, strength: 0.55, width: 0.03 });
    }
  } else if (s === 2) {
    const p = f.world(0.06, Math.max(0.06, ctx.waterY * 0.8 + 0.04), 0);
    const [dx, dz] = f.dir(1, 0);
    o.jets.push({ ...p, dirX: dx, dirZ: dz, strength: 1, width: gateHalf * 2 });
  }

  // The sluice-house on the bank end: stone, slate roof, a blue door and the pennant.
  // In a channel the house stands on a stone footing up at bank height.
  const footing = ctx.wet ? ctx.waterY + 0.1 : 0;
  const hz = ctx.houseSide * (len / 2 + (ctx.wet ? 0.02 : 0.2));
  if (footing > 0) f.add(PRIM.box, trs(-0.1, footing / 2, hz, 0, 0, 0, 0.42, footing, 0.46), PAL.stoneDark, 0.05);
  const house = f.child(-0.1, footing, hz, 0);
  const hw = 0.38;
  const hd = 0.32;
  const hh = 0.26;
  house.add(PRIM.box, trs(0, 0.02, 0, 0, 0, 0, hw + 0.04, 0.04, hd + 0.04), PAL.stoneDark);
  house.add(PRIM.box, trs(0, hh / 2, 0, 0, 0, 0, hw, hh, hd), PAL.stone, 0.06);
  if (s < 2) house.add(PRIM.roof, trs(0, hh, 0, 0, Math.PI / 2, 0, hd + 0.08, 0.5, hw + 0.08), PAL.slate, 0.06);
  else {
    // Half the roof stove in by the blows.
    house.add(PRIM.roof, trs(0, hh, -hw * 0.25, 0, Math.PI / 2, 0, hd + 0.08, 0.5, hw * 0.55), PAL.slate, 0.06);
    house.add(PRIM.box, trs(0.04, hh + 0.01, hw * 0.22, 0.6, 0.2, 0.1, hd * 0.7, 0.012, hw * 0.3), PAL.slate);
  }
  house.add(PRIM.box, trs(hd / 2 + 0.003, 0.09, 0.05, 0, 0, 0, 0.008, 0.17, 0.1), banner, 0);
  house.add(PRIM.box, trs(hd / 2 + 0.004, hh - 0.025, 0, 0, 0, 0, 0.008, 0.03, hw * 0.98), banner, 0);
  house.add(PRIM.box, trs(hd / 2 + 0.003, 0.15, -0.08, 0, 0, 0, 0.008, 0.05, 0.05), PAL.crack, 0);
  if (s >= 1) {
    house.add(PRIM.box, trs(hd / 2 + 0.004, 0.12, -0.12, 0.5, 0, 0, 0.005, 0.12, 0.008), PAL.crack, 0);
  }
  // Pennant: a pole on the gable, lapis cloth with a bone stripe (no device, no fire).
  // On the weir-side gable, flying downstream.
  const poleH = 0.42;
  const gable = -ctx.houseSide * (hw / 2 - 0.03);
  const lean = s === 2 ? 0.35 : 0;
  house.add(PRIM.cyl6, trs(0, hh + 0.1 + poleH / 2, gable, 0, 0, lean, 0.011, poleH, 0.011), PAL.timberDark);
  const cloth = house.child(0, hh + 0.1, gable, 0, 0, lean).child(0, poleH - 0.07, 0);
  cloth.add(PRIM.box, trs(0.13, 0, 0, 0, 0, 0, 0.24, 0.11, 0.008), banner, 0);
  cloth.add(PRIM.box, trs(0.13, -0.035, 0, 0, 0, 0, 0.24, 0.018, 0.01), bone, 0);
  return o;
}

// --- Assembly -------------------------------------------------------------------

export interface PropContext {
  /** Board hex centre and surface height; undefined off the board. */
  surface: (coord: HexCoord) => { x: number; z: number; top: number } | undefined;
  /** Unit (x, z) the water flows. */
  flow: [number, number];
  waterLevel: number;
}

/** Builds every barricade, wagon-park and sluice prop on the board, in all three stages. */
export function buildObjectiveProps(layout: BoardLayout, ctx: PropContext, skin: Skin): ObjectiveProp[] {
  const props: ObjectiveProp[] = [];
  for (const hex of layout.hexes) {
    const kind = objectiveDressing(hex);
    if (kind !== "barricade" && kind !== "wagons" && kind !== "sluice") continue;
    const at = ctx.surface(hex.coord);
    if (!at) continue;
    // The sluice turns downstream; the Host's props toward their attackers.
    const wet = hex.terrain === "river" || hex.terrain === "ford";
    const facing: [number, number] = kind === "sluice" && wet ? ctx.flow : objectiveFacing(layout, hex.coord);
    // Local +x along `facing`: three's yaw maps +x to (cos, -sin).
    const yaw = Math.atan2(-facing[1], facing[0]);
    // The sluice-house stands on its owners' bank: away from the attackers (local +z is (-fz, fx)).
    const attack = objectiveFacing(layout, hex.coord);
    const houseSide = -facing[1] * -attack[0] + facing[0] * -attack[1] < 0 ? -1 : 1;
    const base = new THREE.Matrix4().makeTranslation(at.x, at.top, at.z).multiply(new THREE.Matrix4().makeRotationY(yaw));
    const seed = 4093 + hex.coord.q * 131 + hex.coord.r * 17;
    let pots: ObjectiveProp["pots"] = [];
    const build = (s: number): PropStage => {
      const b = new GeoBuilder();
      const e = new GeoBuilder();
      const f = new Frame(b, base, mulberry32(seed + s * 7));
      const o =
        kind === "barricade"
          ? barricade(f, e, s)
          : kind === "wagons"
            ? wagons(f, e, s, skin)
            : sluice(f, s, skin, { waterY: ctx.waterLevel - at.top, wet, houseSide });
      if (s === 0) pots = o.pots;
      return { geometry: b.build(), embers: e.vertexCount > 0 ? e.build() : null, steam: o.steam, jets: o.jets };
    };
    props.push({
      kind,
      coord: hex.coord,
      x: at.x,
      z: at.z,
      top: at.top,
      facing,
      stages: { intact: build(0), battered: build(1), broken: build(2) },
      pots,
    });
  }
  return props;
}

/** Every geometry a prop owns (for disposal). */
export function propGeometries(prop: ObjectiveProp): THREE.BufferGeometry[] {
  return OBJECTIVE_STAGES.flatMap((s) => [prop.stages[s].geometry, prop.stages[s].embers]).filter((g): g is THREE.BufferGeometry => !!g);
}
