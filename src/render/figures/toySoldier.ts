import * as THREE from "three";
import type { FactionId } from "../../game/engine/types";
import { GeoBuilder, color, trs } from "../geo/GeoBuilder";
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
