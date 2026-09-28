import * as THREE from "three";
import type { FactionId } from "../../game/engine/types";
import { GeoBuilder, color, trs } from "../geo/GeoBuilder";
import { mulberry32 } from "../hexWorld";
import type { FactionStyle } from "../skins/types";

/**
 * Figure approach (a): a code-built "toy soldier" miniature, merged into one
 * vertex-coloured geometry per faction so a whole army is one InstancedMesh.
 *
 * Local frame: +x forward, +y up, +z the figure's right hand; the pivot is the
 * centre of the base so fall/tilt tweens rotate about the feet. Built at the
 * reference height 0.34 and scaled by the skin's `figures.height`.
 *
 * Value contrast first (look-lock #3/#4): the Banners are bright bone and lapis
 * with steel kettle helms and a small gold plume; the Host are dark charcoal
 * masses whose only bright notes are emissive ember glints (the `glow` channel).
 */

const REF_HEIGHT = 0.34;

const G = {
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone6: new THREE.ConeGeometry(1, 1, 6),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  box: new THREE.BoxGeometry(1, 1, 1),
  head: new THREE.IcosahedronGeometry(1, 1),
  dome: new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
  ball: new THREE.IcosahedronGeometry(1, 0),
  torso: new THREE.CylinderGeometry(0.048, 0.056, 0.09, 8),
};

export function buildToySoldier(faction: FactionId, style: FactionStyle, height: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const primary = color(style.primary);
  const secondary = color(style.secondary);
  const metal = color(style.metal);
  const trim = color(style.trim);
  const shieldCol = color(style.shield);
  const skin = color(style.skin);
  const base = color("#1d1916");
  const host = faction === "ashen_host";
  const leather = color(host ? "#1e1816" : "#3a3130");
  const wood = color(host ? "#2a1e18" : "#5a4030");
  const glint = style.glint;

  // Miniature base.
  b.add(G.cyl8, trs(0, 0.009, 0, 0, 0, 0, 0.068, 0.018, 0.068), base);
  // Legs.
  b.add(G.box, trs(0, 0.06, -0.018, 0, 0, 0, 0.042, 0.085, 0.03), leather);
  b.add(G.box, trs(0, 0.06, 0.018, 0, 0, 0, 0.042, 0.085, 0.03), leather);
  // Torso + skirt.
  b.add(G.cyl8, trs(0, 0.108, 0, 0, 0, 0, 0.056, 0.04, 0.05), primary);
  b.add(G.torso, trs(0, 0.162, 0, 0, 0, 0, 1), primary);

  if (host) {
    // Ragged dark cloak on the back, iron pauldrons.
    b.add(G.box, trs(-0.044, 0.14, 0, 0, 0, -0.12, 0.014, 0.16, 0.09), secondary);
    b.add(G.cyl8, trs(0, 0.122, 0, 0, 0, 0, 0.058, 0.012, 0.052), color("#2a2020"));
    b.add(G.ball, trs(0, 0.2, -0.054, 0, 0, 0, 0.03), metal);
    b.add(G.ball, trs(0, 0.2, 0.054, 0, 0, 0, 0.03), metal);
    b.add(G.head, trs(0.004, 0.238, 0, 0, 0, 0, 0.042), skin);
    // Spiked iron helm with a full face guard and an ember eye slit.
    b.add(G.dome, trs(0, 0.245, 0, 0, 0, 0, 0.052, 0.058, 0.052), metal);
    b.add(G.cyl8, trs(0, 0.245, 0, 0, 0, 0, 0.053, 0.012, 0.053), color(style.trim).multiplyScalar(0.6));
    b.add(G.cone6, trs(0, 0.33, 0, 0, 0, 0, 0.017, 0.08, 0.017), metal);
    b.add(G.cone6, trs(0, 0.365, 0, 0, 0, 0, 0.005, 0.014, 0.005), color("#5a2410"), 0, undefined, glint * 0.35);
    b.add(G.box, trs(0.042, 0.232, 0, 0, 0, 0, 0.012, 0.04, 0.054), metal.clone().multiplyScalar(0.8));
    b.add(G.box, trs(0.049, 0.24, 0, 0, 0, 0, 0.004, 0.007, 0.036), color("#ff7a2e"), 0, undefined, glint * 0.9);
    // Round dark shield with a rust rim.
    b.add(G.cyl8, trs(0.02, 0.15, -0.07, Math.PI / 2, 0.35, 0, 0.066, 0.012, 0.066), shieldCol);
    b.add(G.cyl8, trs(0.018, 0.15, -0.066, Math.PI / 2, 0.35, 0, 0.072, 0.006, 0.072), trim.clone().multiplyScalar(0.8));
    b.add(G.ball, trs(0.024, 0.15, -0.078, 0, 0, 0, 0.014), metal);
  } else {
    // Bone tabard over lapis, bone pauldrons, gold belt.
    b.add(G.box, trs(0.046, 0.135, 0, 0, 0, 0.06, 0.012, 0.13, 0.05), secondary);
    b.add(G.cyl8, trs(0, 0.122, 0, 0, 0, 0, 0.058, 0.012, 0.052), trim.clone().multiplyScalar(0.85));
    b.add(G.ball, trs(0, 0.2, -0.052, 0, 0, 0, 0.028), secondary);
    b.add(G.ball, trs(0, 0.2, 0.052, 0, 0, 0, 0.028), secondary);
    b.add(G.head, trs(0.004, 0.238, 0, 0, 0, 0, 0.042), skin);
    // Steel kettle helm: dome + wide brim; small gold plume.
    b.add(G.dome, trs(0, 0.25, 0, 0, 0, 0, 0.047, 0.044, 0.047), metal);
    b.add(G.cyl8, trs(0, 0.25, 0, 0, 0, 0, 0.068, 0.007, 0.068), metal.clone().multiplyScalar(0.92));
    b.add(G.ball, trs(-0.008, 0.302, 0, 0, 0, 0, 0.014, 0.018, 0.011), trim);
    // Heater shield: bone face, lapis border, gold boss.
    b.add(G.box, trs(0.018, 0.165, -0.066, 0, 0.35, 0, 0.112, 0.085, 0.006), primary);
    b.add(G.box, trs(0.02, 0.165, -0.07, 0, 0.35, 0, 0.1, 0.075, 0.012), shieldCol);
    b.add(G.cone4, trs(0.02, 0.112, -0.07, Math.PI, 0.35 + Math.PI / 4, 0, 0.07, 0.04, 0.012), shieldCol);
    b.add(G.ball, trs(0.025, 0.16, -0.078, 0, 0, 0, 0.012), trim);
  }

  // Spear in the right hand (+z): shaft, tip, hand.
  b.add(G.cyl6, trs(0.03, 0.21, 0.066, 0, 0, -0.08, 0.007, 0.42, 0.007), wood);
  b.add(
    G.cone6,
    trs(0.047, 0.44, 0.066, 0, 0, -0.08, 0.014, 0.05, 0.014),
    host ? color("#4a2010") : metal,
    0,
    undefined,
    host ? glint * 0.3 : 0,
  );
  b.add(G.ball, trs(0.028, 0.16, 0.066, 0, 0, 0, 0.018), skin);

  const g = b.build();
  const s = height / REF_HEIGHT;
  g.scale(s, s, s);
  return g;
}

/**
 * The refugee Column (noncombatants): hooded walkers in undyed wool with
 * bundles on their backs and lanterns (the `glow` channel), no helmets, shields
 * or spears. Same pivot and frame as the soldiers so every animation applies.
 */
export function buildRefugee(height: number, variant: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const robe = color(["#7a6a58", "#6a5e52", "#857560"][variant % 3]);
  const hood = color(["#5a4a3e", "#4e4a44", "#6a5040"][variant % 3]);
  const skin = color("#d8b08c");
  const bundle = color("#b8a888");
  const brass = color("#8a6a3a");
  b.add(G.cyl8, trs(0, 0.009, 0, 0, 0, 0, 0.062, 0.018, 0.062), color("#2a2420"));
  // Long robe to the ground, narrower shoulders than a soldier.
  b.add(new THREE.CylinderGeometry(0.036, 0.058, 0.2, 8), trs(0, 0.118, 0, 0, 0, 0, 1), robe);
  b.add(G.head, trs(0.006, 0.232, 0, 0, 0, 0, 0.036), skin);
  // Hood: a dome pulled forward, with a short cowl down the back.
  b.add(G.dome, trs(-0.004, 0.236, 0, 0.12, 0, 0, 0.045, 0.05, 0.045), hood);
  b.add(G.box, trs(-0.03, 0.2, 0, 0, 0, 0.1, 0.02, 0.07, 0.07), hood);
  // Bundle on the back.
  b.add(G.ball, trs(-0.055, 0.17, 0, 0, 0, 0, 0.038, 0.045, 0.04), bundle);
  if (variant % 2 === 0) {
    // Lantern held low at the side: brass frame, glowing heart.
    b.add(G.cyl6, trs(0.03, 0.14, 0.05, 0, 0, 0, 0.004, 0.05, 0.004), brass);
    b.add(G.box, trs(0.03, 0.105, 0.05, 0, 0, 0, 0.032, 0.04, 0.032), brass);
    b.add(G.box, trs(0.03, 0.105, 0.05, 0, 0, 0, 0.026, 0.034, 0.026), color("#ffcf8a"), 0, undefined, 1.4);
  } else {
    // A walking staff instead.
    b.add(G.cyl6, trs(0.035, 0.15, 0.05, 0, 0, -0.1, 0.005, 0.3, 0.005), color("#5a4030"));
  }
  const g = b.build();
  const s = height / REF_HEIGHT;
  g.scale(s, s, s);
  return g;
}

/** A covered cart for the Column: wooden bed, two wheels, canvas tilt, lantern. */
export function buildCart(height: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const wood = color("#5a4030");
  const dark = color("#3a2a20");
  const canvas = color("#d8ccb0");
  // Bed and shafts (the cart faces +x like the figures).
  b.add(G.box, trs(0, 0.1, 0, 0, 0, 0, 0.3, 0.05, 0.17), wood);
  b.add(G.box, trs(0.2, 0.08, 0.055, 0, 0, 0.12, 0.16, 0.012, 0.012), dark);
  b.add(G.box, trs(0.2, 0.08, -0.055, 0, 0, 0.12, 0.16, 0.012, 0.012), dark);
  // Wheels.
  for (const side of [-1, 1]) {
    b.add(G.cyl8, trs(-0.02, 0.065, side * 0.095, Math.PI / 2, 0, 0, 0.065, 0.018, 0.065), dark);
    b.add(G.cyl6, trs(-0.02, 0.065, side * 0.105, Math.PI / 2, 0, 0, 0.012, 0.012, 0.012), wood);
  }
  // Canvas tilt: the +x half of a cylinder (θ 0..π), turned so it arches over the bed.
  b.add(new THREE.CylinderGeometry(0.09, 0.09, 0.28, 10, 1, false, 0, Math.PI), trs(-0.01, 0.125, 0, 0, 0, Math.PI / 2, 1), canvas, 0.12);
  // A lantern hung at the front.
  b.add(G.box, trs(0.13, 0.19, 0, 0, 0, 0, 0.02, 0.026, 0.02), color("#ffcf8a"), 0, undefined, 1);
  const g = b.build();
  const s = height / REF_HEIGHT;
  g.scale(s, s, s);
  return g;
}

/**
 * A siege ram (the Cinderram), in two parts so the hides can burn away on
 * screen (sunrise):
 * - "frame": a wheeled timber shed with an iron-shod ram beam slung under a
 *   gabled frame of rafters, the head glowing like a coal, a few charred
 *   scraps on the rafters;
 * - "hides": the soaked ox-hides heaped over that frame (dark, lumpy, with
 *   embers smouldering along the ridge: the ram's line of light at the wide
 *   shot), hanging down the sides.
 * Faces +x like the figures; pivot at the centre of the footprint.
 */
export function buildRam(height: number, part: "frame" | "hides"): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const rand = mulberry32(7);
  const wood = color("#5a4030");
  const dark = color("#33261c");
  const iron = color("#2c2826");
  const hide = color("#5a4436");
  const hideWet = color("#6e5646");
  if (part === "frame") {
    // Chassis and six solid wheels.
    b.add(G.box, trs(0, 0.075, 0, 0, 0, 0, 0.58, 0.035, 0.24), wood);
    for (const side of [-1, 1]) {
      b.add(G.box, trs(0, 0.075, side * 0.12, 0, 0, 0, 0.62, 0.03, 0.03), dark);
      for (const x of [-0.2, 0, 0.2]) {
        b.add(G.cyl8, trs(x, 0.055, side * 0.145, Math.PI / 2, 0, 0, 0.055, 0.025, 0.055), dark);
        b.add(G.cyl6, trs(x, 0.055, side * 0.16, Math.PI / 2, 0, 0, 0.014, 0.012, 0.014), iron);
      }
      // Corner posts.
      for (const x of [-0.25, 0.25]) b.add(G.box, trs(x, 0.16, side * 0.11, 0, 0, 0, 0.025, 0.17, 0.025), wood);
    }
    // Ram beam slung under the roof, iron head with an ember-hot tip.
    b.add(G.cyl6, trs(0.06, 0.17, 0, 0, 0, Math.PI / 2, 0.028, 0.6, 0.028), wood);
    b.add(G.cone4, trs(0.4, 0.17, 0, 0, 0, -Math.PI / 2, 0.05, 0.12, 0.05), color("#ff6a20"), 0, undefined, 1);
    b.add(G.box, trs(0.34, 0.17, 0, 0, 0, 0, 0.03, 0.07, 0.07), iron);
    for (const x of [-0.12, 0.12]) b.add(G.box, trs(x, 0.21, 0, 0, 0, 0, 0.008, 0.07, 0.008), iron);
    // Gable rafters (just inside the hides) and a ridge pole.
    for (const x of [-0.26, -0.09, 0.09, 0.26]) {
      for (const side of [-1, 1]) b.add(G.box, trs(x, 0.32, side * 0.064, -side * 0.52, 0, 0, 0.02, 0.27, 0.02), dark);
    }
    b.add(G.box, trs(0, 0.43, 0, 0, 0, 0, 0.6, 0.02, 0.02), dark);
    // Charred scraps still clinging to the rafters.
    b.add(G.box, trs(-0.18, 0.33, 0.066, -0.52, 0, 0, 0.14, 0.12, 0.008), color("#1e1814"), 0.04, rand, 0.15);
    b.add(G.box, trs(0.2, 0.31, -0.075, 0.52, 0, 0, 0.1, 0.1, 0.008), color("#1e1814"), 0.04, rand, 0.15);
  } else {
    // Gabled roof as a triangular prism along x, heaped with sagging hides.
    // rx −π/2 turns the prism's first edge up: a ridge, not a trough.
    b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.6, 3), trs(0, 0.285, 0, -Math.PI / 2, Math.PI / 2, 0, 1), hide, 0.04, rand);
    for (let i = 0; i < 7; i += 1) {
      const x = -0.26 + i * 0.087 + (rand() - 0.5) * 0.03;
      const side = i % 2 === 0 ? 1 : -1;
      b.add(G.ball, trs(x, 0.3 + rand() * 0.03, side * (0.05 + rand() * 0.04), rand(), rand(), rand(), 0.07, 0.035, 0.09), i % 3 === 0 ? hideWet : hide, 0.05, rand);
    }
    // Hides hanging down the sides like skirts.
    for (const side of [-1, 1]) b.add(G.box, trs(0, 0.17, side * 0.135, 0.12 * side, 0, 0, 0.56, 0.1, 0.012), hide, 0.04, rand);
    b.add(G.box, trs(0, 0.452, 0, 0, 0, 0, 0.56, 0.014, 0.024), color("#ff7a30"), 0, undefined, 0.55);
  }
  const g = b.build();
  // A touch over figure scale so the engine dominates its hex.
  const s = (height / REF_HEIGHT) * RAM_SCALE;
  g.scale(s, s, s);
  return g;
}

/** Ram geometry scale relative to a figure; the roof top sits at 0.455 of the reference height. */
export const RAM_SCALE = 1.25;
export const RAM_ROOF_TOP = 0.455;
