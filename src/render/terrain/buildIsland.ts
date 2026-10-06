import * as THREE from "three";
import { hexKey, hexNeighbors, hexDistance, type BoardHex, type BoardLayout, type HexCoord, type TerrainType } from "../../game/board";
import { GeoBuilder, color, jitterColor, trs } from "../geo/GeoBuilder";
import { boardCenter, hexCorner, hexRandom, hexToWorld, islandShore, mulberry32 } from "../hexWorld";
import type { Skin } from "../skins/types";
import type { FactionId } from "../../game/engine/types";
import {
  buildObjectiveProps,
  nearestRoadGoal,
  objectiveDressing,
  objectiveHolder,
  propGeometries,
  roadGoal,
  type ObjectiveProp,
  type ObjectiveStage,
} from "./objectiveProps";

/**
 * Builds the floating-island diorama from a BoardLayout: extruded hex columns
 * with tapered, stratified cliff sides, per-terrain tile tops and code-built
 * props, all merged into one vertex-coloured geometry (one draw call).
 */

export interface IslandHex {
  coord: HexCoord;
  x: number;
  z: number;
  top: number;
  kind: "board" | "shore" | "river";
  terrain?: TerrainType;
}

export interface WaterHex {
  x: number;
  z: number;
  level: number;
  /** Deep river channel (1) vs shallow ford (0). */
  deep: number;
  /** Pool radius (marsh pools); omitted = a full hex of water. */
  radius?: number;
}

export interface Waterfall {
  x: number;
  z: number;
  level: number;
  /** Outward unit direction the water falls over. */
  dirX: number;
  dirZ: number;
  width: number;
}

export interface Anchor {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Fire anchors only: what burns here (drives flame size, light and smoke). */
  kind?: "torch" | "campfire" | "bridge" | "brazier" | "firepot";
  /** An objective's fire-pot (M2): the objective's hex key, and the stage that douses it. */
  objective?: string;
  douse?: Exclude<ObjectiveStage, "intact">;
}

export interface IslandBuild {
  geometry: THREE.BufferGeometry;
  /** Walls, towers and gatehouse as their own mesh (so an objective hit can jolt them); null if none. */
  wallGeometry: THREE.BufferGeometry | null;
  /**
   * The wall mesh per stage of its gatehouse objective (`intact` is `wallGeometry`):
   * battered masonry, then the gate breached. Null without a gatehouse objective.
   */
  wallStages: Record<ObjectiveStage, THREE.BufferGeometry> | null;
  /** The gatehouse objective's hex key, or null. */
  gateKey: string | null;
  /** Who holds the gatehouse (whose banner hangs over it): read from the deployment. */
  gateHolder: FactionId;
  /** The Host's braziers as their own mesh (shown only under nightFires); null if none. */
  brazierGeometry: THREE.BufferGeometry | null;
  /** Reed banks as their own mesh (a wind-sway material); `glow` = sway weight, 0 at the root. */
  reedGeometry: THREE.BufferGeometry | null;
  hexes: IslandHex[];
  water: WaterHex[];
  waterLevel: number;
  waterfall?: Waterfall;
  /** Unit (x, z) direction the water flows (toward the waterfall). */
  flow: [number, number];
  /** Surface height of each board hex, for placing squads. */
  surface: Map<string, number>;
  center: { x: number; z: number };
  radius: number;
  fireAnchors: Anchor[];
  gateBanner?: Anchor;
  /** Open-ground objectives (M2): barricades, wagon parks and sluices, each in three stages. */
  objectiveProps: ObjectiveProp[];
}

const CAP_RADIUS = 0.95;
const BEVEL = 0.035;
/** Hex columns stop here; below it the island is one continuous rock mass. */
const RIM_Y = -0.28;
const WATER_ABOVE_BED = 0.11;

// Reusable primitive geometries (low-poly on purpose).
const PRIM = {
  rock: new THREE.DodecahedronGeometry(1, 0),
  cone6: new THREE.ConeGeometry(1, 1, 6),
  cone8: new THREE.ConeGeometry(1, 1, 8),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
  ico: new THREE.IcosahedronGeometry(1, 0),
  roof: (() => {
    // Triangular prism roof, ridge along x.
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

/** Disposes every geometry an island build owns (the stages and props included). */
export function disposeIsland(island: IslandBuild) {
  const all = new Set<THREE.BufferGeometry | null>([
    island.geometry,
    island.wallGeometry,
    ...(island.wallStages ? Object.values(island.wallStages) : []),
    island.reedGeometry,
    island.brazierGeometry,
    ...island.objectiveProps.flatMap(propGeometries),
  ]);
  all.forEach((g) => g?.dispose());
}

export function buildIsland(layout: BoardLayout, skin: Skin): IslandBuild {
  const center = boardCenter(layout);
  const b = new GeoBuilder();
  const rand = mulberry32(1337);
  const T = skin.terrain;
  const I = skin.island;
  const jitter = skin.material.tileJitter;

  const boardByKey = new Map(layout.hexes.map((hex) => [hexKey(hex.coord), hex]));
  const fordHexes = layout.hexes.filter((hex) => hex.terrain === "ford");
  const shore = islandShore(layout, 2, 0.6);

  // Water routing. A board with `river` hexes gets a sunken channel that runs off
  // the board at both ends: a spring pool upstream and a waterfall downstream.
  // A board with only fords drains them west, through the shore, over the edge.
  const riverKeys = new Set<string>();
  let waterfall: Waterfall | undefined;
  const shoreKeys = new Set(shore.map((s2) => hexKey(s2.coord)));
  const boardWater = layout.hexes.filter((hex) => hex.terrain === "ford" || hex.terrain === "river");
  const hasRiver = layout.hexes.some((hex) => hex.terrain === "river");
  let upstream: HexCoord | null = null;
  let flowDir: [number, number] = [-1, 0];
  const extend = (from: HexCoord, dir: [number, number], steps: number) => {
    let cursor = from;
    for (let step = 0; step < steps; step += 1) {
      const [cx, cz] = hexToWorld(cursor, center);
      const next = hexNeighbors(cursor)
        .filter((n) => !boardByKey.has(hexKey(n)) && !riverKeys.has(hexKey(n)))
        .map((n) => {
          const [nx, nz] = hexToWorld(n, center);
          return { n, score: (nx - cx) * dir[0] + (nz - cz) * dir[1] };
        })
        .sort((a, c) => c.score - a.score)[0]?.n;
      if (!next) break;
      riverKeys.add(hexKey(next));
      if (!shoreKeys.has(hexKey(next))) {
        shore.push({ coord: next, ring: step + 1 });
        shoreKeys.add(hexKey(next));
      }
      cursor = next;
    }
  };
  if (hasRiver) {
    // Flow along the river's long axis, north (upstream) to south (downstream).
    const sorted = [...boardWater].sort((a, c) => worldZ(a.coord) - worldZ(c.coord) || worldX(a.coord) - worldX(c.coord));
    const up = sorted[0].coord;
    const down = sorted[sorted.length - 1].coord;
    const [ux, uz] = hexToWorld(up, center);
    const [dx, dz] = hexToWorld(down, center);
    const len = Math.hypot(dx - ux, dz - uz) || 1;
    const dir: [number, number] = [(dx - ux) / len, (dz - uz) / len];
    flowDir = dir;
    extend(down, dir, 2);
    upstream = up;
    extend(up, [-dir[0], -dir[1]], 1);
  } else if (boardWater.length > 0) {
    const westMost = [...boardWater].sort((a, c) => worldX(a.coord) - worldX(c.coord))[0];
    extend(westMost.coord, [-1, -0.3], 2);
  }
  const upstreamKey = upstream ? hexKey(upstream) : null;

  function worldX(c: HexCoord) {
    return hexToWorld(c, center)[0];
  }
  function worldZ(c: HexCoord) {
    return hexToWorld(c, center)[1];
  }

  const hexes: IslandHex[] = [];
  for (const hex of layout.hexes) {
    const [x, z] = hexToWorld(hex.coord, center);
    hexes.push({ coord: hex.coord, x, z, top: T[hex.terrain].height, kind: "board", terrain: hex.terrain });
  }
  for (const s of shore) {
    const [x, z] = hexToWorld(s.coord, center);
    const key = hexKey(s.coord);
    const isRiver = riverKeys.has(key);
    const r = hexRandom(s.coord, 3);
    const bed = hasRiver ? T.river.height : T.ford.height;
    const top = isRiver ? bed : s.ring === 1 ? 0.2 + r * 0.08 : -0.02 + r * 0.1;
    hexes.push({ coord: s.coord, x, z, top, kind: isRiver ? "river" : "shore" });
  }

  const radius = Math.max(...hexes.map((h) => Math.hypot(h.x, h.z))) + 1;
  const waterLevel = T.ford.height + WATER_ABOVE_BED;
  const surface = new Map<string, number>();
  const water: WaterHex[] = [];
  const fireAnchors: Anchor[] = [];
  let gateBanner: Anchor | undefined;

  const cliffTop = color(I.cliffTop);
  const cliffBottom = color(I.cliffBottom);
  const strata = color(I.strata);

  // --- Columns (tile tops + short earthen sides) ----------------------------
  for (const hex of hexes) {
    const hr = mulberry32(hexKey(hex.coord).length * 977 + hex.coord.q * 131 + hex.coord.r * 7919);
    const topColorHex =
      hex.kind === "board" ? T[hex.terrain!].top : hex.kind === "river" ? (hasRiver ? T.river.top : T.ford.top) : I.shoreTop;
    const topColor = jitterColor(color(topColorHex), jitter, hr);
    addColumn(b, hex, topColor, cliffTop, hr);
    if (hex.kind === "board") surface.set(hexKey(hex.coord), hex.top);
    if (hex.terrain === "ford" || hex.terrain === "river" || hex.kind === "river") {
      const deep = hex.terrain === "river" || (hex.kind === "river" && hasRiver) ? 1 : 0;
      water.push({ x: hex.x, z: hex.z, level: waterLevel, deep });
    }
  }

  // --- One continuous jagged rock mass under the whole island --------------
  addRockMass(b, hexes, radius, cliffTop, cliffBottom, strata);

  // Waterfall over the outer edge of the last river hex.
  const riverHexes = hexes.filter((h) => h.kind === "river" && !isUpstreamSpring(h));
  function isUpstreamSpring(h: IslandHex) {
    if (!upstreamKey) return false;
    const up = boardByKey.get(upstreamKey)!.coord;
    return hexDistance(h.coord, up) === 1 && riverKeys.has(hexKey(h.coord)) && h.z < worldZ(up);
  }
  if (riverHexes.length > 0) {
    const last = riverHexes[riverHexes.length - 1];
    const outward = new THREE.Vector2(last.x, last.z).normalize();
    // Snap to the closest flat-top edge normal so the fall sits on a hex face.
    const normals = [30, 90, 150, 210, 270, 330].map((deg) => {
      const a = (deg * Math.PI) / 180;
      return new THREE.Vector2(Math.cos(a), Math.sin(a));
    });
    const edge = normals.sort((p, q) => q.dot(outward) - p.dot(outward))[0];
    const apothem = Math.sqrt(3) / 2;
    waterfall = {
      x: last.x + edge.x * apothem * 1.0,
      z: last.z + edge.y * apothem * 1.0,
      level: waterLevel,
      dirX: edge.x,
      dirZ: edge.y,
      width: 0.8,
    };
  }

  // --- Terrain dressing -----------------------------------------------------
  const rb = new GeoBuilder();
  const roadColor = color(T.road.accent ?? T.road.top);
  const stone = color(T.ridge.accent ?? "#a8a296");
  const foliage = color(I.foliage);
  const foliageDark = color(I.foliageDark);
  const trunk = color(I.trunk);

  for (const hex of hexes) {
    const hr = mulberry32(hex.coord.q * 7349 + hex.coord.r * 3181 + 11);
    if (hex.kind === "board") {
      switch (hex.terrain) {
        case "field":
          dressField(b, hex, hr, foliage, foliageDark);
          break;
        case "ridge":
          dressRidge(b, hex, hr, stone, foliage, foliageDark, trunk);
          break;
        case "ford":
          dressFord(b, hex, hr, stone, foliage);
          break;
        case "marsh":
          water.push(...dressMarsh(b, hex, hr, foliageDark, trunk));
          break;
        case "reeds":
          dressReeds(rb, hex, hr, color(T.reeds.accent ?? "#a8995c"), foliageDark);
          break;
        case "river":
          dressRiver(b, hex, hr, stone, foliage);
          break;
        case "ruin":
          dressRuin(b, hex, hr, stone, foliageDark);
          break;
        case "road":
          break; // roads are drawn as connected strips below
        case "wall":
          break; // walls are drawn as one continuous line below
      }
    } else if (hex.kind === "shore") {
      dressShore(b, hex, hr, foliage, foliageDark, trunk, stone, center, radius);
    } else if (hasRiver) {
      dressRiver(b, hex, hr, stone, foliage);
    } else {
      dressFord(b, hex, hr, stone, foliage);
    }
  }

  drawRoads(b, layout, hexes, roadColor, T[`field`].top, rand);
  const wb = new GeoBuilder();
  const gate = layout.hexes.find((h) => h.terrain === "wall" && objectiveDressing(h) === "gatehouse");
  const gateKey = gate ? hexKey(gate.coord) : null;
  const gateHolder: FactionId = (gate && objectiveHolder(layout, gate.coord)) || "free_banners";
  // Intact walls draw from the island's `rand` exactly as before stages existed; the
  // battered and breached builds replay those draws (see drawWalls).
  const draws: number[] = [];
  const wall = drawWalls(wb, layout, hexes, skin, () => {
    const v = rand();
    draws.push(v);
    return v;
  }, 0, rand, gateHolder);
  const stageWalls = (stage: 1 | 2) => {
    const sb = new GeoBuilder();
    let i = 0;
    drawWalls(sb, layout, hexes, skin, () => draws[i++] ?? 0.5, stage, mulberry32(9157 + stage * 31), gateHolder);
    return sb.build();
  };
  gateBanner = wall.gateBanner;
  fireAnchors.push(...wall.torches);
  drawTown(b, hexes, skin, rand);

  const boardHex = new Map(hexes.filter((h) => h.kind === "board").map((h) => [hexKey(h.coord), h]));
  const objectiveProps = buildObjectiveProps(
    layout,
    { surface: (c) => boardHex.get(hexKey(c)), flow: flowDir, waterLevel },
    skin,
  );
  for (const prop of objectiveProps) {
    for (const pot of prop.pots) fireAnchors.push({ ...pot, yaw: 0, kind: "firepot", objective: hexKey(prop.coord), douse: pot.douse });
  }

  // Host campfires on the west shore, near the ford.
  const westShore = hexes
    .filter((h) => h.kind === "shore")
    .sort((a, c) => a.x - c.x)
    .slice(0, 6)
    .sort((a, c) => Math.abs(a.z) - Math.abs(c.z));
  for (const h of westShore.slice(0, 2)) {
    const fx = h.x + 0.1;
    const fz = h.z;
    // Log pile.
    for (let i = 0; i < 3; i += 1) {
      b.add(PRIM.cyl6, trs(fx, h.top + 0.03, fz, Math.PI / 2, (i * Math.PI) / 3, 0, 0.025, 0.22, 0.025), trunk);
    }
    ring(b, fx, h.top, fz, 0.13, 7, stone, hr1(h));
    fireAnchors.push({ x: fx, y: h.top + 0.05, z: fz, yaw: 0, kind: "campfire" });
  }

  const bb = new GeoBuilder();
  const boardDressing = layout.fordDressing ?? "bridgeWrecks";
  if (hasRiver) {
    // Ember Ford: the Host fired its own bridges. Charred wreckage at a ford is
    // the key light at night (cold stumps by day). A ford's own `fordDressing`
    // overrides the board's (shallows that never had a bridge).
    for (const ford of hexes.filter((h) => h.terrain === "ford")) {
      if ((boardByKey.get(hexKey(ford.coord))?.fordDressing ?? boardDressing) !== "bridgeWrecks") continue;
      fireAnchors.push(...drawBridgeWreck(b, ford, waterLevel, mulberry32(ford.coord.q * 97 + ford.coord.r * 13 + 3)));
    }
  }
  if (hasRiver && boardDressing === "bridgeWrecks") {
    // Braziers mark the Host's bank, in their own mesh so they only stand at night.
    const hostBank = layout.hexes
      .filter((h) => h.deploymentFaction === "ashen_host")
      .filter((h) => hexNeighbors(h.coord).some((n) => {
        const t = boardByKey.get(hexKey(n))?.terrain;
        return t === "river" || t === "ford";
      }))
      .map((h) => hexes.find((x) => x.kind === "board" && x.coord.q === h.coord.q && x.coord.r === h.coord.r)!)
      .sort((a, c) => a.z - c.z);
    const picks = hostBank.filter((_, i) => i % 2 === 0).slice(0, 3);
    for (const h of picks) fireAnchors.push(drawBrazier(bb, h, mulberry32(h.coord.q * 31 + h.coord.r * 7 + 9)));
  }

  const wallGeometry = wb.vertexCount > 0 ? wb.build() : null;
  return {
    geometry: b.build(),
    wallGeometry,
    wallStages: wallGeometry && gateKey ? { intact: wallGeometry, battered: stageWalls(1), broken: stageWalls(2) } : null,
    gateKey,
    gateHolder,
    brazierGeometry: bb.vertexCount > 0 ? bb.build() : null,
    reedGeometry: rb.vertexCount > 0 ? rb.build() : null,
    hexes,
    water,
    waterLevel,
    waterfall,
    flow: hasRiver || !waterfall ? flowDir : [waterfall.dirX, waterfall.dirZ],
    surface,
    center,
    radius,
    fireAnchors,
    gateBanner,
    objectiveProps,
  };
}

function hr1(h: IslandHex) {
  return mulberry32(h.coord.q * 17 + h.coord.r * 31 + 5);
}

// ---------------------------------------------------------------------------

function addColumn(b: GeoBuilder, hex: IslandHex, topColor: THREE.Color, cliffTop: THREE.Color, rand: () => number) {
  const { x, z, top } = hex;
  const v = (px: number, py: number, pz: number) => new THREE.Vector3(x + px, py, z + pz);
  const noise = hex.kind === "board" && hex.terrain !== "road" && hex.terrain !== "wall" ? 0.02 : 0.012;

  // Top cap: centre, inner ring, outer ring, bevel ring.
  const c0 = v(0, top + (rand() - 0.5) * noise, 0);
  const inner: THREE.Vector3[] = [];
  const outer: THREE.Vector3[] = [];
  const bevel: THREE.Vector3[] = [];
  const innerCol: THREE.Color[] = [];
  for (let i = 0; i < 6; i += 1) {
    const [ix, iz] = hexCorner(i, 0.52);
    inner.push(v(ix, top + (rand() - 0.5) * noise, iz));
    const patch = rand();
    const c = topColor.clone().multiplyScalar(0.9 + rand() * 0.2);
    // Occasional sun-bleached or damp patches so big tiles are not flat colour.
    if (patch > 0.8) c.lerp(new THREE.Color("#b8a468"), 0.35);
    else if (patch < 0.15) c.multiplyScalar(0.85);
    innerCol.push(c);
    const [ox, oz] = hexCorner(i, CAP_RADIUS);
    outer.push(v(ox, top, oz));
    const [bx, bz] = hexCorner(i, 1);
    bevel.push(v(bx, top - BEVEL, bz));
  }
  // Seams are kept soft (look-lock #6): edges only slightly darker than the tile.
  const edgeCol = topColor.clone().multiplyScalar(0.93);
  const bevelCol = topColor.clone().lerp(cliffTop, 0.25).multiplyScalar(0.9);
  const centerCol = topColor.clone().multiplyScalar(1.03);

  for (let i = 0; i < 6; i += 1) {
    const j = (i + 1) % 6;
    // Winding: corners go counter-clockwise in x/z, which is clockwise seen from +y,
    // so order (centre, j, i) faces up.
    b.tri(c0, inner[j], inner[i], centerCol, innerCol[j], innerCol[i]);
    b.quad(inner[i], inner[j], outer[j], outer[i], innerCol[i], innerCol[j], edgeCol, edgeCol);
    b.quad(outer[i], outer[j], bevel[j], bevel[i], bevelCol, bevelCol, bevelCol, bevelCol);
  }

  // Short straight earthen side down to the rim; the rock mass continues below.
  const soil = cliffTop.clone().lerp(bevelCol, 0.25);
  const bottom: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i += 1) {
    const [cx, cz] = hexCorner(i, 1);
    bottom.push(v(cx, RIM_Y - 0.02, cz));
  }
  for (let i = 0; i < 6; i += 1) {
    const j = (i + 1) % 6;
    b.quad(bevel[i], bevel[j], bottom[j], bottom[i], soil, soil, cliffTop, cliffTop);
  }
}

/**
 * Outer boundary of the union of island hexes, as world-space (x, z) points in
 * the same winding as hex corners (so faces built from it point outward).
 * Returns the longest closed loop.
 */
export function islandBoundary(hexes: Array<{ coord: HexCoord; x: number; z: number }>): Array<[number, number]> {
  // Neighbour across the edge between corner i and i+1 (flat-top, see hexCorner).
  const across: HexCoord[] = [
    { q: 1, r: 0 },
    { q: 0, r: 1 },
    { q: -1, r: 1 },
    { q: -1, r: 0 },
    { q: 0, r: -1 },
    { q: 1, r: -1 },
  ];
  const keys = new Set(hexes.map((h) => hexKey(h.coord)));
  const k = (x: number, z: number) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`;
  const next = new Map<string, [number, number]>();
  for (const h of hexes) {
    for (let i = 0; i < 6; i += 1) {
      const n = across[i];
      if (keys.has(hexKey({ q: h.coord.q + n.q, r: h.coord.r + n.r }))) continue;
      const [ax, az] = hexCorner(i, 1);
      const [bx, bz] = hexCorner((i + 1) % 6, 1);
      next.set(k(h.x + ax, h.z + az), [h.x + bx, h.z + bz]);
    }
  }
  const visited = new Set<string>();
  let best: Array<[number, number]> = [];
  for (const startKey of next.keys()) {
    if (visited.has(startKey)) continue;
    const loop: Array<[number, number]> = [];
    let key = startKey;
    while (!visited.has(key) && next.has(key)) {
      visited.add(key);
      const p = next.get(key)!;
      loop.push(p);
      key = k(p[0], p[1]);
    }
    if (loop.length > best.length) best = loop;
  }
  return best;
}

/**
 * The island underside: rings that follow the island outline, bulge slightly,
 * then taper to a point with jagged, stratified faces plus hanging spikes —
 * one continuous rock mass instead of per-hex columns (look-lock #1).
 */
function addRockMass(
  b: GeoBuilder,
  hexes: IslandHex[],
  radius: number,
  cliffTop: THREE.Color,
  cliffBottom: THREE.Color,
  strata: THREE.Color,
) {
  const loop = islandBoundary(hexes);
  if (loop.length < 3) return;
  const rand = mulberry32(4242);
  const cx = loop.reduce((s2, p) => s2 + p[0], 0) / loop.length;
  const cz = loop.reduce((s2, p) => s2 + p[1], 0) / loop.length;
  const ph = Array.from({ length: 4 }, () => rand() * Math.PI * 2);
  const depth = Math.max(3.5, radius * 0.75);
  const LEVELS = 12;

  const rings: THREE.Vector3[][] = [];
  const cols: THREE.Color[][] = [];
  for (let l = 0; l <= LEVELS; l += 1) {
    const t = l / LEVELS;
    const yBase = RIM_Y - depth * Math.pow(t, 1.1);
    // Slight overhang just under the rim, then a long taper.
    const scale = l === 0 ? 1 : Math.pow(1 - t, 0.8) * (1 + 0.09 * Math.sin(Math.PI * Math.min(1, t * 2.2)));
    const ring: THREE.Vector3[] = [];
    const ringCols: THREE.Color[] = [];
    const bandTint = l % 3 === 1 ? 0.35 : 0;
    const base = cliffTop.clone().lerp(cliffBottom, Math.pow(t, 0.7)).lerp(strata, bandTint);
    for (const [px, pz] of loop) {
      const a = Math.atan2(pz - cz, px - cx);
      const n =
        0.5 * Math.sin(3 * a + ph[0] + l * 0.7) + 0.3 * Math.sin(7 * a + ph[1] - l * 1.3) + 0.2 * Math.sin(13 * a + ph[2] + l * 2.1);
      const jag = l === 0 ? 1 : 1 + 0.17 * n * Math.min(1, t * 3) + (rand() - 0.5) * 0.12 * Math.min(1, t * 4);
      const y = l === 0 ? yBase : yBase + (rand() - 0.5) * 0.3 * Math.min(1, t * 3);
      ring.push(new THREE.Vector3(cx + (px - cx) * scale * jag, y, cz + (pz - cz) * scale * jag));
      ringCols.push(base.clone().multiplyScalar(0.88 + rand() * 0.2));
    }
    rings.push(ring);
    cols.push(ringCols);
  }
  for (let l = 0; l < LEVELS; l += 1) {
    const top = rings[l];
    const low = rings[l + 1];
    for (let i = 0; i < top.length; i += 1) {
      const j = (i + 1) % top.length;
      b.quad(top[i], top[j], low[j], low[i], cols[l][i], cols[l][j], cols[l + 1][j], cols[l + 1][i]);
    }
  }
  const last = rings[LEVELS];
  const tip = new THREE.Vector3(cx + (rand() - 0.5) * 0.6, RIM_Y - depth - 1.2, cz + (rand() - 0.5) * 0.6);
  for (let i = 0; i < last.length; i += 1) {
    const j = (i + 1) % last.length;
    b.tri(last[i], last[j], tip, cols[LEVELS][i], cols[LEVELS][j], cliffBottom);
  }

  // Hanging spikes break up the silhouette.
  for (let s2 = 0; s2 < 18; s2 += 1) {
    const l = 2 + Math.floor(rand() * (LEVELS - 5));
    const ring = rings[l];
    const p = ring[Math.floor(rand() * ring.length)];
    const inward = new THREE.Vector3(cx - p.x, 0, cz - p.z).multiplyScalar(0.12 + rand() * 0.1);
    const h = 0.6 + rand() * 1.6;
    const r = 0.18 + rand() * 0.3;
    const c = cols[l][0].clone().multiplyScalar(0.8 + rand() * 0.25);
    b.add(PRIM.cone6, trs(p.x + inward.x, p.y - h / 2 + 0.1, p.z + inward.z, Math.PI, rand() * 3, (rand() - 0.5) * 0.3, r, h, r), c, 0.2, rand);
  }
}

function tuft(b: GeoBuilder, x: number, y: number, z: number, col: THREE.Color, rand: () => number, scale = 1) {
  for (let i = 0; i < 3; i += 1) {
    const h = (0.07 + rand() * 0.05) * scale;
    b.add(
      PRIM.cone6,
      trs(x + (rand() - 0.5) * 0.06, y + h / 2, z + (rand() - 0.5) * 0.06, (rand() - 0.5) * 0.5, 0, (rand() - 0.5) * 0.5, 0.018 * scale, h, 0.018 * scale),
      col,
      0.3,
      rand,
    );
  }
}

function rock(b: GeoBuilder, x: number, y: number, z: number, size: number, col: THREE.Color, rand: () => number) {
  b.add(
    PRIM.rock,
    trs(x, y + size * 0.35, z, rand() * 3, rand() * 3, rand() * 3, size, size * (0.6 + rand() * 0.35), size * (0.8 + rand() * 0.3)),
    col,
    0.25,
    rand,
  );
}

function pine(b: GeoBuilder, x: number, y: number, z: number, h: number, leaf: THREE.Color, dark: THREE.Color, trunkCol: THREE.Color, rand: () => number) {
  b.add(PRIM.cyl6, trs(x, y + h * 0.12, z, 0, 0, 0, 0.03 * h * 2, h * 0.24, 0.03 * h * 2), trunkCol);
  for (let i = 0; i < 3; i += 1) {
    const s = (1 - i * 0.26) * h * 0.34;
    b.add(PRIM.cone6, trs(x, y + h * (0.32 + i * 0.22), z, 0, rand() * 2, 0, s, h * 0.38, s), i % 2 ? dark : leaf, 0.2, rand);
  }
}

function roundTree(b: GeoBuilder, x: number, y: number, z: number, h: number, leaf: THREE.Color, trunkCol: THREE.Color, rand: () => number) {
  b.add(PRIM.cyl6, trs(x, y + h * 0.25, z, 0, 0, 0, 0.035 * h * 2, h * 0.5, 0.035 * h * 2), trunkCol);
  b.add(PRIM.ico, trs(x, y + h * 0.68, z, rand(), rand(), rand(), h * 0.3, h * 0.28, h * 0.3), leaf, 0.25, rand);
  b.add(PRIM.ico, trs(x + h * 0.12, y + h * 0.55, z + h * 0.08, rand(), rand(), rand(), h * 0.2), leaf.clone().multiplyScalar(0.85), 0.25, rand);
}

function ring(b: GeoBuilder, x: number, y: number, z: number, radius: number, n: number, col: THREE.Color, rand: () => number) {
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    rock(b, x + Math.cos(a) * radius, y, z + Math.sin(a) * radius, 0.035, col, rand);
  }
}

/** Random point in the outer band of a hex (keeps the centre free for squads). */
function edgePoint(hex: IslandHex, rand: () => number, min = 0.55, max = 0.8): [number, number] {
  const a = rand() * Math.PI * 2;
  const r = min + rand() * (max - min);
  return [hex.x + Math.cos(a) * r, hex.z + Math.sin(a) * r];
}

function dressField(b: GeoBuilder, hex: IslandHex, rand: () => number, leaf: THREE.Color, dark: THREE.Color) {
  const n = 6 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i += 1) {
    const [x, z] = edgePoint(hex, rand, 0.4, 0.85);
    tuft(b, x, hex.top, z, rand() > 0.5 ? leaf : dark, rand);
  }
  // Wildflowers: tiny bright dots that catch the low sun.
  const petals = [color("#e8dcc4"), color("#d4a64a"), color("#b86a4a")];
  for (let i = 0; i < 5; i += 1) {
    const [x, z] = edgePoint(hex, rand, 0.3, 0.85);
    b.add(PRIM.ico, trs(x, hex.top + 0.03, z, 0, 0, 0, 0.012), petals[Math.floor(rand() * petals.length)]);
  }
  if (rand() > 0.55) {
    const [x, z] = edgePoint(hex, rand, 0.65, 0.8);
    b.add(PRIM.ico, trs(x, hex.top + 0.05, z, rand(), rand(), rand(), 0.09, 0.07, 0.09), dark, 0.2, rand);
  }
}

function dressRidge(b: GeoBuilder, hex: IslandHex, rand: () => number, stone: THREE.Color, leaf: THREE.Color, dark: THREE.Color, trunkCol: THREE.Color) {
  const clusters = 2 + Math.floor(rand() * 2);
  for (let c = 0; c < clusters; c += 1) {
    const [cx, cz] = edgePoint(hex, rand, 0.55, 0.75);
    const n = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i += 1) {
      rock(b, cx + (rand() - 0.5) * 0.22, hex.top, cz + (rand() - 0.5) * 0.22, 0.07 + rand() * 0.1, stone, rand);
    }
  }
  if (rand() > 0.35) {
    const [x, z] = edgePoint(hex, rand, 0.62, 0.78);
    pine(b, x, hex.top, z, 0.45 + rand() * 0.2, leaf, dark, trunkCol, rand);
  }
  for (let i = 0; i < 3; i += 1) {
    const [x, z] = edgePoint(hex, rand, 0.3, 0.8);
    tuft(b, x, hex.top, z, dark, rand);
  }
}

/**
 * Marsh: dark wet peat with a few dark pools (returned as water patches),
 * sedge tussocks and the odd dead stump.
 */
function dressMarsh(b: GeoBuilder, hex: IslandHex, rand: () => number, sedge: THREE.Color, wood: THREE.Color): WaterHex[] {
  const pools: WaterHex[] = [];
  const n = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i += 1) {
    const [x, z] = edgePoint(hex, rand, 0.15, 0.55);
    pools.push({ x, z, level: hex.top + 0.012, deep: 0.8, radius: 0.18 + rand() * 0.14 });
  }
  const tussock = sedge.clone().multiplyScalar(0.9);
  for (let i = 0; i < 9; i += 1) {
    const [x, z] = edgePoint(hex, rand, 0.2, 0.88);
    tuft(b, x, hex.top, z, rand() > 0.4 ? tussock : sedge.clone().lerp(new THREE.Color("#8a7a4a"), 0.4), rand, 1.3);
  }
  if (rand() > 0.5) {
    const [x, z] = edgePoint(hex, rand, 0.5, 0.8);
    b.add(PRIM.cyl6, trs(x, hex.top + 0.06, z, (rand() - 0.5) * 0.4, rand() * 3, (rand() - 0.5) * 0.4, 0.03, 0.12, 0.03), wood.clone().multiplyScalar(0.6));
  }
  return pools;
}

/**
 * Reed banks: dense clumps of tall stalks with seed heads, taller than the
 * figures so they screen what stands behind them. Written into their own
 * builder; the per-vertex `glow` channel carries the sway weight (0 at root).
 */
function dressReeds(rb: GeoBuilder, hex: IslandHex, rand: () => number, reed: THREE.Color, dark: THREE.Color) {
  const clumps = 7 + Math.floor(rand() * 3);
  for (let c = 0; c < clumps; c += 1) {
    const [cx, cz] = edgePoint(hex, rand, 0.22, 0.82);
    const stalks = 9 + Math.floor(rand() * 7);
    for (let i = 0; i < stalks; i += 1) {
      const x = cx + (rand() - 0.5) * 0.18;
      const z = cz + (rand() - 0.5) * 0.18;
      const h = 0.45 + rand() * 0.35;
      const base = hex.top;
      const weight = (y: number) => Math.max(0, Math.min(1, (y - base) / h));
      const col = reed.clone().lerp(dark, rand() * 0.45);
      const lean = (rand() - 0.5) * 0.25;
      rb.add(PRIM.cone6, trs(x, base + h / 2, z, lean, rand() * 3, (rand() - 0.5) * 0.25, 0.012, h, 0.012), col, 0.2, rand, weight);
      if (rand() > 0.45) {
        rb.add(PRIM.ico, trs(x + lean * 0.3 * h, base + h * 0.92, z, 0, 0, 0, 0.018, 0.05, 0.018), color("#6a4a2a"), 0, undefined, weight);
      }
    }
  }
}

/** Deep channel: no stepping stones, just reeds and wet rocks along the banks. */
function dressRiver(b: GeoBuilder, hex: IslandHex, rand: () => number, stone: THREE.Color, leaf: THREE.Color) {
  for (let i = 0; i < 6; i += 1) {
    const [x, z] = edgePoint(hex, rand, 0.72, 0.88);
    tuft(b, x, hex.top + 0.1, z, leaf, rand, 2.2);
  }
  for (let i = 0; i < 2; i += 1) {
    const [x, z] = edgePoint(hex, rand, 0.6, 0.8);
    rock(b, x, hex.top + 0.12, z, 0.05 + rand() * 0.05, stone.clone().multiplyScalar(0.6), rand);
  }
}

function dressFord(b: GeoBuilder, hex: IslandHex, rand: () => number, stone: THREE.Color, leaf: THREE.Color) {
  // Stepping stones across the ford, plus reeds at the banks.
  const lane = (rand() - 0.5) * 0.5;
  for (let i = -2; i <= 2; i += 1) {
    if (rand() < 0.25) continue;
    const x = hex.x + i * 0.24 + (rand() - 0.5) * 0.08;
    const z = hex.z + lane + (rand() - 0.5) * 0.22;
    const s = 0.05 + rand() * 0.04;
    b.add(PRIM.cyl8, trs(x, hex.top + WATER_ABOVE_BED - 0.02, z, 0, rand() * 3, 0, s, 0.06, s * (0.7 + rand() * 0.4)), stone.clone().multiplyScalar(0.8), 0.25, rand);
  }
  for (let i = 0; i < 5; i += 1) {
    const [x, z] = edgePoint(hex, rand, 0.7, 0.85);
    tuft(b, x, hex.top + 0.05, z, leaf, rand, 1.8);
  }
}

function dressRuin(b: GeoBuilder, hex: IslandHex, rand: () => number, stone: THREE.Color, moss: THREE.Color) {
  const masonry = stone.clone().multiplyScalar(0.95);
  // Broken pillars.
  const pillars = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < pillars; i += 1) {
    const [x, z] = edgePoint(hex, rand, 0.45, 0.72);
    const h = 0.18 + rand() * 0.32;
    b.add(PRIM.cyl8, trs(x, hex.top + h / 2, z, 0, rand(), 0, 0.075, h, 0.075), masonry, 0.1, rand);
    b.add(PRIM.cyl8, trs(x, hex.top + h + 0.02, z, 0.35, rand(), 0.2, 0.08, 0.05, 0.08), masonry.clone().multiplyScalar(1.05));
    if (rand() > 0.4) {
      // Fallen drum.
      b.add(PRIM.cyl8, trs(x + 0.12, hex.top + 0.05, z + 0.08, Math.PI / 2, rand() * 3, 0, 0.065, 0.16, 0.065), masonry);
    }
  }
  // A broken wall fragment with stepped top.
  const [wx, wz] = edgePoint(hex, rand, 0.55, 0.65);
  const yaw = rand() * Math.PI;
  for (let i = 0; i < 4; i += 1) {
    const h = 0.28 - i * 0.06 + rand() * 0.03;
    const off = (i - 1.5) * 0.11;
    b.add(PRIM.box, trs(wx + Math.cos(yaw) * off, hex.top + h / 2, wz - Math.sin(yaw) * off, 0, yaw, 0, 0.11, h, 0.09), masonry, 0.12, rand);
  }
  for (let i = 0; i < 5; i += 1) {
    const [x, z] = edgePoint(hex, rand, 0.3, 0.85);
    rock(b, x, hex.top, z, 0.035 + rand() * 0.035, masonry, rand);
  }
  const [mx, mz] = edgePoint(hex, rand, 0.5, 0.8);
  tuft(b, mx, hex.top, mz, moss, rand);
}

function dressShore(
  b: GeoBuilder,
  hex: IslandHex,
  rand: () => number,
  leaf: THREE.Color,
  dark: THREE.Color,
  trunkCol: THREE.Color,
  stone: THREE.Color,
  _center: { x: number; z: number },
  _radius: number,
) {
  // Keep the camera side (south, +z) low so trees never hide the board.
  const southFacing = hex.z > 2.2;
  const treeChance = southFacing ? 0.12 : 0.75;
  const trees = rand() < treeChance ? 1 + Math.floor(rand() * (southFacing ? 1 : 3)) : 0;
  for (let i = 0; i < trees; i += 1) {
    const [x, z] = edgePoint(hex, rand, 0.1, 0.6);
    const h = southFacing ? 0.35 : 0.5 + rand() * 0.35;
    if (rand() > 0.45) pine(b, x, hex.top, z, h, leaf, dark, trunkCol, rand);
    else roundTree(b, x, hex.top, z, h * 0.9, rand() > 0.5 ? leaf : dark.clone().lerp(leaf, 0.5), trunkCol, rand);
  }
  const rocks = Math.floor(rand() * 3);
  for (let i = 0; i < rocks; i += 1) {
    const [x, z] = edgePoint(hex, rand, 0.2, 0.8);
    rock(b, x, hex.top, z, 0.05 + rand() * 0.08, stone.clone().multiplyScalar(0.85), rand);
  }
  for (let i = 0; i < 4; i += 1) {
    const [x, z] = edgePoint(hex, rand, 0.1, 0.85);
    tuft(b, x, hex.top, z, rand() > 0.5 ? leaf : dark, rand);
  }
}

// --- Fires (Ember Ford) -------------------------------------------------------

/** Burnt bridge timbers slumped across a ford; returns fire anchors on the wreck. */
function drawBridgeWreck(b: GeoBuilder, ford: IslandHex, waterLevel: number, rand: () => number): Anchor[] {
  const char = color("#1e1712");
  const charLit = color("#3a2418");
  const y = waterLevel;
  // Two stumps of the span still standing on each bank side, the middle collapsed.
  for (const side of [-1, 1]) {
    const px = ford.x + side * 0.62;
    for (const dz of [-0.2, 0.2]) {
      b.add(PRIM.cyl6, trs(px, y + 0.08, ford.z + dz, (rand() - 0.5) * 0.2, 0, (rand() - 0.5) * 0.2, 0.035, 0.3, 0.035), char);
    }
    // Deck planks, broken off toward the middle.
    b.add(PRIM.box, trs(px - side * 0.12, y + 0.2, ford.z, 0, (rand() - 0.5) * 0.2, side * (0.12 + rand() * 0.1), 0.45, 0.04, 0.46), charLit, 0.3, rand);
  }
  // Fallen beams half-sunk in the water.
  for (let i = 0; i < 4; i += 1) {
    b.add(
      PRIM.box,
      trs(ford.x + (rand() - 0.5) * 0.5, y + 0.02, ford.z + (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.4, rand() * Math.PI, (rand() - 0.5) * 0.3, 0.5, 0.05, 0.07),
      char,
      0.3,
      rand,
    );
  }
  return [
    { x: ford.x - 0.5, y: y + 0.22, z: ford.z + (rand() - 0.5) * 0.2, yaw: 0, kind: "bridge" },
    { x: ford.x + 0.45, y: y + 0.22, z: ford.z + (rand() - 0.5) * 0.2, yaw: 0, kind: "bridge" },
  ];
}

/** An iron brazier on its tripod at the west edge of a hex. */
function drawBrazier(b: GeoBuilder, hex: IslandHex, rand: () => number): Anchor {
  const iron = color("#2a2624");
  const a = Math.PI + (rand() - 0.5) * 1.2; // west side of the hex
  const x = hex.x + Math.cos(a) * 0.7;
  const z = hex.z + Math.sin(a) * 0.7;
  const h = 0.26;
  for (let i = 0; i < 3; i += 1) {
    const la = (i / 3) * Math.PI * 2;
    b.add(PRIM.cyl6, trs(x + Math.cos(la) * 0.05, hex.top + h / 2, z + Math.sin(la) * 0.05, Math.sin(la) * 0.25, 0, -Math.cos(la) * 0.25, 0.008, h, 0.008), iron);
  }
  b.add(PRIM.cyl8, trs(x, hex.top + h, z, 0, 0, 0, 0.075, 0.05, 0.075), iron);
  b.add(PRIM.cyl8, trs(x, hex.top + h + 0.027, z, 0, 0, 0, 0.06, 0.006, 0.06), color("#6a2a10"), 0, undefined, 0);
  return { x, y: hex.top + h + 0.03, z, yaw: 0, kind: "brazier" };
}

// --- Roads -----------------------------------------------------------------

function drawRoads(b: GeoBuilder, layout: BoardLayout, hexes: IslandHex[], roadCol: THREE.Color, fieldHex: string, rand: () => number) {
  const byKey = new Map(hexes.map((h) => [hexKey(h.coord), h]));
  const roads = layout.hexes.filter((h) => h.terrain === "road");
  if (roads.length === 0) return;
  // Each road leads to its nearest objective, ties to the Host's (M2: a board may have
  // two); with none, to the first wall.
  const goalCoord = roadGoal(layout);
  const goal = goalCoord ? { coord: goalCoord } : undefined;
  const goalFor = (c: HexCoord) => nearestRoadGoal(layout, c) ?? goalCoord!;
  const isRoadish = (c: HexCoord) => {
    const h = layout.hexes.find((x) => x.coord.q === c.q && x.coord.r === c.r);
    return h && (h.terrain === "road" || h.terrain === "wall");
  };
  const edges: Array<[IslandHex, IslandHex, boolean]> = [];
  const inflow = new Set<string>();
  for (const road of roads) {
    const from = byKey.get(hexKey(road.coord))!;
    if (!goal) continue;
    const target = goalFor(road.coord);
    // A road may run up to its objective's hex too (half a strip, to the edge).
    const options = hexNeighbors(road.coord).filter((n) => isRoadish(n) || hexKey(n) === hexKey(target));
    if (options.length === 0) continue;
    const here = hexDistance(road.coord, target);
    const best = options
      .filter((n) => hexDistance(n, target) < here)
      .sort((a, c) => hexDistance(a, target) - hexDistance(c, target))[0];
    if (!best) continue;
    const to = byKey.get(hexKey(best))!;
    const toWall = layout.hexes.find((h) => hexKey(h.coord) === hexKey(best))?.terrain !== "road";
    edges.push([from, to, toWall]);
    inflow.add(hexKey(best));
  }
  if (!goal) {
    // No gate to converge on: link neighbouring road hexes, and let roads run
    // down into fords (half strips, since the ford bed sits lower).
    const typeAt = (c: HexCoord) => layout.hexes.find((x) => x.coord.q === c.q && x.coord.r === c.r)?.terrain;
    for (const road of roads) {
      const from = byKey.get(hexKey(road.coord))!;
      for (const n of hexNeighbors(road.coord)) {
        const t = typeAt(n);
        const to = byKey.get(hexKey(n));
        if (!to) continue;
        if (t === "road" && hexKey(n) > hexKey(road.coord)) edges.push([from, to, false]);
        if (t === "ford") edges.push([from, to, true]);
        inflow.add(hexKey(road.coord));
      }
    }
  }
  // Roads that nothing flows into lead off toward the attackers (west).
  for (const road of roads) {
    if (inflow.has(hexKey(road.coord))) continue;
    const from = byKey.get(hexKey(road.coord))!;
    const west = hexNeighbors(road.coord)
      .map((n) => byKey.get(hexKey(n)))
      .filter((h): h is IslandHex => !!h && h.x < from.x - 0.5)
      .sort((a, c) => Math.abs(a.z - from.z) - Math.abs(c.z - from.z))[0];
    if (west) edges.push([from, west, true]);
  }

  const dirt = roadCol.clone();
  const verge = roadCol.clone().lerp(color(fieldHex), 0.55);
  const rut = roadCol.clone().multiplyScalar(0.78);
  for (const [from, to, half] of edges) {
    const len = half ? 0.5 : 1;
    const ex = from.x + (to.x - from.x) * len;
    const ez = from.z + (to.z - from.z) * len;
    ribbon(b, from.x, from.z, ex, ez, from.top + 0.006, dirt, verge, rut);
  }
  for (const road of roads) {
    const h = byKey.get(hexKey(road.coord))!;
    // Junction patch.
    const pts = 8;
    const c0 = new THREE.Vector3(h.x, h.top + 0.007, h.z);
    for (let i = 0; i < pts; i += 1) {
      const a0 = (i / pts) * Math.PI * 2;
      const a1 = ((i + 1) / pts) * Math.PI * 2;
      const r0 = 0.22 + rand() * 0.04;
      const r1 = 0.22 + rand() * 0.04;
      b.tri(
        c0,
        new THREE.Vector3(h.x + Math.cos(a1) * r1, h.top + 0.006, h.z + Math.sin(a1) * r1),
        new THREE.Vector3(h.x + Math.cos(a0) * r0, h.top + 0.006, h.z + Math.sin(a0) * r0),
        dirt,
        verge,
        verge,
      );
    }
  }
}

function ribbon(b: GeoBuilder, x0: number, z0: number, x1: number, z1: number, y: number, dirt: THREE.Color, verge: THREE.Color, rut: THREE.Color) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const nx = -dz / len;
  const nz = dx / len;
  // Cross-section offsets (verge, rut, centre, rut, verge).
  const offs = [-0.2, -0.1, 0, 0.1, 0.2];
  const cols = [verge, rut, dirt, rut, verge];
  for (let k = 0; k < offs.length - 1; k += 1) {
    const a = new THREE.Vector3(x0 + nx * offs[k], y, z0 + nz * offs[k]);
    const bb = new THREE.Vector3(x1 + nx * offs[k], y, z1 + nz * offs[k]);
    const c = new THREE.Vector3(x1 + nx * offs[k + 1], y, z1 + nz * offs[k + 1]);
    const d = new THREE.Vector3(x0 + nx * offs[k + 1], y, z0 + nz * offs[k + 1]);
    // Ensure upward-facing winding.
    const up = new THREE.Vector3().subVectors(bb, a).cross(new THREE.Vector3().subVectors(d, a)).y > 0;
    // (a, bb, d) faces up when the cross product points +y; keep that winding.
    if (up) b.quad(a, bb, c, d, cols[k], cols[k], cols[k + 1], cols[k + 1]);
    else b.quad(a, d, c, bb, cols[k], cols[k + 1], cols[k + 1], cols[k]);
  }
}

// --- Walls & gate ------------------------------------------------------------

/**
 * The wall line and its gatehouse. `stage` (CR6: the Host's gate under a
 * breakObjective) 0 = intact, 1 = battered (cracked masonry, merlons knocked
 * off, rubble, the doors bowed and split), 2 = breached (a tower top down, the
 * lintel cracked, the doors burst in, the gate banner fallen). The Banners never
 * use fire: nothing burns. Base parts draw from `rand` in the same order at every
 * stage (parts a stage removes go into `gone`, a throwaway builder), so the
 * intact walls are exactly the pre-stage ones; damage draws from `dmg`.
 */
function drawWalls(
  b: GeoBuilder,
  layout: BoardLayout,
  hexes: IslandHex[],
  skin: Skin,
  rand: () => number,
  stage: 0 | 1 | 2 = 0,
  dmg: () => number = rand,
  holder: FactionId = "free_banners",
) {
  const byKey = new Map(hexes.map((h) => [hexKey(h.coord), h]));
  const walls = layout.hexes
    .filter((h) => h.terrain === "wall")
    .map((h) => ({ board: h, hex: byKey.get(hexKey(h.coord))! }))
    .sort((a, c) => a.hex.z - c.hex.z);
  const torches: Anchor[] = [];
  let gateBanner: Anchor | undefined;
  if (walls.length === 0) return { torches, gateBanner };
  const gone = new GeoBuilder();

  const masonry = color(skin.terrain.wall.accent ?? "#a8a296");
  const masonryDark = masonry.clone().multiplyScalar(0.78);
  const roof = color(skin.factions.ashen_host.secondary).lerp(color("#3a3230"), 0.35);
  const wood = color("#2a1c12");
  const crack = color("#2a2622");
  const H = 0.46;
  const THICK = 0.2;
  const apothem = Math.sqrt(3) / 2;

  /** `knock`: drop every n-th merlon (0 = keep all). */
  const segment = (x: number, y: number, z0: number, z1: number, knock = 0) => {
    const len = z1 - z0;
    if (len <= 0.01) return;
    b.add(PRIM.box, trs(x, y + H / 2, (z0 + z1) / 2, 0, 0, 0, THICK, H, len), masonry, 0.06, rand);
    // Plinth.
    b.add(PRIM.box, trs(x, y + 0.04, (z0 + z1) / 2, 0, 0, 0, THICK + 0.06, 0.08, len), masonryDark);
    // Merlons.
    const n = Math.max(1, Math.floor(len / 0.14));
    for (let i = 0; i < n; i += 1) {
      const z = z0 + ((i + 0.5) / n) * len;
      (knock && i % knock === 1 ? gone : b).add(PRIM.box, trs(x, y + H + 0.045, z, 0, 0, 0, THICK, 0.09, 0.075), masonry, 0.1, rand);
    }
  };
  /** `topple`: the tower's top half and roof are down (breached). */
  const tower = (x: number, y: number, z: number, r: number, h: number, topple = false) => {
    const into = topple ? gone : b;
    into.add(PRIM.cyl8, trs(x, y + h / 2, z, 0, Math.PI / 8, 0, r, h, r), masonry, 0.06, rand);
    into.add(PRIM.cyl8, trs(x, y + h + 0.03, z, 0, Math.PI / 8, 0, r * 1.12, 0.06, r * 1.12), masonryDark);
    into.add(PRIM.cone8, trs(x, y + h + 0.06 + r * 0.8, z, 0, Math.PI / 8, 0, r * 1.2, r * 1.6, r * 1.2), roof, 0.08, rand);
    // Arrow slit.
    b.add(PRIM.box, trs(x - r * 0.98, y + h * 0.6, z, 0, 0, 0, 0.02, 0.1, 0.03), wood);
    if (topple) {
      // A broken stump with a jagged crown, its stones spilled west.
      const hs = h * 0.58;
      b.add(PRIM.cyl8, trs(x, y + hs / 2, z, 0, Math.PI / 8, 0, r, hs, r), masonry, 0.06, dmg);
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2 + dmg();
        b.add(PRIM.box, trs(x + Math.cos(a) * r * 0.75, y + hs + 0.02 + dmg() * 0.05, z + Math.sin(a) * r * 0.75, dmg(), a, dmg() * 0.4, 0.06, 0.07 + dmg() * 0.05, 0.05), masonry, 0.1, dmg);
      }
      rubble(x - 0.25, y, z, 9, 0.3);
    }
  };
  const rubble = (x: number, y: number, z: number, n: number, spread: number) => {
    for (let i = 0; i < n; i += 1) {
      const s = 0.03 + dmg() * 0.035;
      b.add(PRIM.rock, trs(x - dmg() * spread, y + s * 0.6, z + (dmg() - 0.5) * spread * 1.4, dmg(), dmg(), dmg(), s * 1.3, s, s), masonry, 0.15, dmg);
    }
  };
  /** A zigzag of dark seams down a west face at (x, z), from height y1 to y0. */
  const seam = (x: number, y0: number, y1: number, z: number) => {
    let y = y1;
    let zz = z;
    while (y > y0 + 0.04) {
      const dy = 0.05 + dmg() * 0.04;
      const dz = (dmg() - 0.5) * 0.07;
      const l = Math.hypot(dy, dz);
      b.add(PRIM.box, trs(x, y - dy / 2, zz + dz / 2, Math.atan2(dz, dy), 0, 0, 0.008, l, 0.012), crack, 0);
      y -= dy;
      zz += dz;
    }
  };

  const x = walls[0].hex.x;
  for (const { board, hex } of walls) {
    const z0 = hex.z - apothem;
    const z1 = hex.z + apothem;
    if (objectiveDressing(board) === "gatehouse") {
      // Gatehouse: two towers flanking an arched gate.
      const gap = 0.26;
      const knock = stage === 0 ? 0 : stage === 1 ? 3 : 2;
      segment(x, hex.top, z0, hex.z - gap - 0.14, knock);
      segment(x, hex.top, hex.z + gap + 0.14, z1, knock);
      tower(x, hex.top, hex.z - gap, 0.16, 0.74, stage === 2);
      tower(x, hex.top, hex.z + gap, 0.16, 0.74);
      // Lintel + arch.
      (stage === 2 ? gone : b).add(PRIM.box, trs(x, hex.top + 0.5, hex.z, 0, 0, 0, THICK + 0.04, 0.16, gap * 2 - 0.08), masonry);
      b.add(PRIM.cyl8, trs(x, hex.top + 0.36, hex.z, Math.PI / 2, 0, Math.PI / 2, 0.17, THICK + 0.02, 0.1), masonryDark);
      // Doors (dark wood) recessed in the opening.
      (stage > 0 ? gone : b).add(PRIM.box, trs(x + 0.02, hex.top + 0.18, hex.z, 0, 0, 0, 0.06, 0.36, gap * 2 - 0.14), wood);
      (stage > 0 ? gone : b).add(PRIM.box, trs(x - 0.02, hex.top + 0.18, hex.z, 0, 0, 0, 0.012, 0.3, 0.02), color("#4a3020"));
      const leaf = (gap * 2 - 0.14) / 2;
      if (stage === 1) {
        // Bowed and split: the two leaves pushed in at the meeting edge, a plank sprung.
        for (const side of [-1, 1]) {
          b.add(PRIM.box, trs(x + 0.035, hex.top + 0.18, hex.z + side * leaf * 0.5, 0, side * 0.16, 0, 0.06, 0.36, leaf * 0.98), wood);
        }
        b.add(PRIM.box, trs(x - 0.04, hex.top + 0.12, hex.z + 0.04, 0.5, 0.3, 0.2, 0.012, 0.18, 0.02), color("#4a3020"));
        seam(x - 0.006, hex.top + 0.05, hex.top + 0.34, hex.z - 0.01);
      } else if (stage === 2) {
        // Burst in: one leaf hanging off its hinge, the other flat inside, splinters.
        b.add(PRIM.box, trs(x + 0.1, hex.top + 0.2, hex.z + leaf, 0.35, 0.9, 0.12, 0.05, 0.34, leaf * 0.95), wood);
        b.add(PRIM.box, trs(x + 0.32, hex.top + 0.03, hex.z - leaf * 0.3, 0, 0.4, Math.PI / 2, 0.05, 0.34, leaf * 0.95), wood);
        for (let i = 0; i < 6; i += 1) {
          b.add(PRIM.box, trs(x + (dmg() - 0.3) * 0.5, hex.top + 0.01, hex.z + (dmg() - 0.5) * 0.4, 0, dmg() * Math.PI, 0, 0.1, 0.012, 0.018), color("#6a4a30"), 0.2, dmg);
        }
        // The lintel cracked in two, sagging into the opening.
        for (const side of [-1, 1]) {
          b.add(PRIM.box, trs(x, hex.top + 0.47, hex.z + side * (gap * 0.5 - 0.02), side * 0.22, 0, 0, THICK + 0.04, 0.15, gap - 0.06), masonry, 0.08, dmg);
        }
        rubble(x + 0.05, hex.top, hex.z, 7, 0.2);
        // The holder's gate banner, torn down onto the rubble.
        const cloth = color(skin.factions[holder].bannerCloth);
        b.add(PRIM.box, trs(x - 0.24, hex.top + 0.03, hex.z + 0.08, 0.08, 0.5, 0.04, 0.12, 0.012, 0.22), cloth, 0.06, dmg);
        b.add(PRIM.box, trs(x - 0.18, hex.top + 0.05, hex.z + 0.18, 0, 0.3, 0.5, 0.012, 0.012, 0.3), wood);
      }
      if (stage > 0) {
        // Cracked masonry on the west faces, and stones at the foot.
        for (const dz of [-gap, gap]) seam(x - 0.161, hex.top + 0.05, hex.top + 0.66, hex.z + dz + (dmg() - 0.5) * 0.06);
        for (const dz of [-gap - 0.3, gap + 0.34]) seam(x - THICK / 2 - 0.002, hex.top + 0.08, hex.top + H - 0.02, hex.z + dz);
        rubble(x - 0.2, hex.top, hex.z - gap, stage === 1 ? 4 : 6, 0.25);
        rubble(x - 0.2, hex.top, hex.z + gap, stage === 1 ? 3 : 6, 0.25);
      }
      gateBanner = { x: x - THICK / 2 - 0.02, y: hex.top + 0.44, z: hex.z, yaw: Math.PI };
      // The gate's torches go out when it is breached.
      const douse = { objective: hexKey(board.coord), douse: "broken" as const };
      torches.push({ x: x - 0.2, y: hex.top + 0.5, z: hex.z - gap, yaw: 0, kind: "torch", ...douse });
      torches.push({ x: x - 0.2, y: hex.top + 0.5, z: hex.z + gap, yaw: 0, kind: "torch", ...douse });
    } else {
      segment(x, hex.top, z0, z1);
    }
  }
  // End towers.
  const first = walls[0].hex;
  const last = walls[walls.length - 1].hex;
  tower(x, first.top, first.z - apothem, 0.19, 0.64);
  tower(x, last.top, last.z + apothem, 0.19, 0.64);
  // A ruined continuation north, into the Broken Watch.
  segment(x, first.top - 0.02, first.z - apothem - 0.9, first.z - apothem - 0.25);
  return { torches, gateBanner };
}

/** A few cottages of Greyford behind the wall (east shore). */
function drawTown(b: GeoBuilder, hexes: IslandHex[], skin: Skin, rand: () => number) {
  const east = hexes
    .filter((h) => h.kind === "shore")
    .sort((a, c) => c.x - a.x)
    .slice(0, 5)
    .filter((h) => h.z < 3);
  const plaster = color(skin.factions.free_banners.secondary).multiplyScalar(0.85);
  const roof = color("#6a3a2a");
  const timber = color("#3a2818");
  for (const h of east.slice(0, 3)) {
    const yaw = (rand() - 0.5) * 0.6 + Math.PI / 6;
    const w = 0.34 + rand() * 0.1;
    const d = 0.26;
    const hh = 0.2 + rand() * 0.06;
    const x = h.x + (rand() - 0.5) * 0.3;
    const z = h.z + (rand() - 0.5) * 0.3;
    b.add(PRIM.box, trs(x, h.top + hh / 2, z, 0, yaw, 0, w, hh, d), plaster, 0.05, rand);
    b.add(PRIM.box, trs(x, h.top + 0.02, z, 0, yaw, 0, w + 0.02, 0.04, d + 0.02), timber);
    b.add(PRIM.roof, trs(x, h.top + hh, z, 0, yaw, 0, w + 0.06, 0.5, d + 0.1), roof, 0.08, rand);
    b.add(PRIM.box, trs(x + 0.08, h.top + hh + 0.12, z, 0, yaw, 0, 0.05, 0.14, 0.05), timber);
  }
}
