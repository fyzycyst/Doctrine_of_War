import * as THREE from "three";
import type { FactionId } from "../../game/types";
import { GeoBuilder, color, trs } from "../geo/GeoBuilder";
import type { FactionStyle } from "../skins/types";

/**
 * Figure approach (a): a code-built "toy soldier" miniature, merged into one
 * vertex-coloured geometry per faction so a whole army is one InstancedMesh.
 *
 * Local frame: +x forward, +y up, +z the figure's right hand. Built at the
 * reference height 0.34 and scaled by the skin's `figures.height`.
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
};

export function buildToySoldier(faction: FactionId, style: FactionStyle, height: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const primary = color(style.primary);
  const secondary = color(style.secondary);
  const metal = color(style.metal);
  const shieldCol = color(style.shield);
  const skin = color(style.skin);
  const base = color("#1d1916");
  const leather = color(faction === "free_banners" ? "#3a3130" : "#241c1a");
  const wood = color("#5a4030");
  const host = faction === "ashen_host";

  // Miniature base.
  b.add(G.cyl8, trs(0, 0.009, 0, 0, 0, 0, 0.068, 0.018, 0.068), base);
  // Legs.
  b.add(G.box, trs(0, 0.06, -0.018, 0, 0, 0, 0.042, 0.085, 0.03), leather);
  b.add(G.box, trs(0, 0.06, 0.018, 0, 0, 0, 0.042, 0.085, 0.03), leather);
  // Torso (slight taper) + skirt.
  b.add(G.cyl8, trs(0, 0.108, 0, 0, 0, 0, 0.056, 0.04, 0.05), primary);
  b.add(new THREE.CylinderGeometry(0.048, 0.056, 0.09, 8), trs(0, 0.162, 0, 0, 0, 0, 1), primary);
  // Tabard / cloak in the secondary colour.
  if (host) {
    b.add(G.box, trs(-0.042, 0.14, 0, 0.0, 0, -0.12, 0.014, 0.15, 0.085), secondary); // cloak (back)
  } else {
    b.add(G.box, trs(0.046, 0.135, 0, 0, 0, 0.06, 0.012, 0.13, 0.05), secondary); // tabard (front)
  }
  // Belt.
  b.add(G.cyl8, trs(0, 0.122, 0, 0, 0, 0, 0.058, 0.012, 0.052), host ? color("#3a2a20") : metal.clone().multiplyScalar(0.8));
  // Pauldrons.
  const shoulder = host ? metal : secondary;
  b.add(G.ball, trs(0, 0.2, -0.052, 0, 0, 0, 0.028), shoulder);
  b.add(G.ball, trs(0, 0.2, 0.052, 0, 0, 0, 0.028), shoulder);
  // Head.
  b.add(G.head, trs(0.004, 0.238, 0, 0, 0, 0, 0.042), skin);
  if (host) {
    // Spiked iron helm with a rust crest band and a face guard.
    b.add(G.dome, trs(0, 0.245, 0, 0, 0, 0, 0.05, 0.055, 0.05), metal);
    b.add(G.cyl8, trs(0, 0.245, 0, 0, 0, 0, 0.051, 0.012, 0.051), secondary);
    b.add(G.cone6, trs(0, 0.325, 0, 0, 0, 0, 0.016, 0.07, 0.016), metal);
    b.add(G.box, trs(0.04, 0.232, 0, 0, 0, 0, 0.01, 0.035, 0.05), metal.clone().multiplyScalar(0.7));
  } else {
    // Rounded kettle helm with brim and a lapis plume.
    b.add(G.dome, trs(0, 0.248, 0, 0, 0, 0, 0.048, 0.048, 0.048), metal);
    b.add(G.cyl8, trs(0, 0.25, 0, 0, 0, 0, 0.066, 0.008, 0.066), metal.clone().multiplyScalar(0.9));
    b.add(G.box, trs(-0.005, 0.305, 0, 0, 0, 0, 0.06, 0.03, 0.012), primary.clone().multiplyScalar(1.3));
  }
  // Shield on the left arm (-z), angled forward.
  if (host) {
    b.add(G.cyl8, trs(0.02, 0.15, -0.07, Math.PI / 2, 0.35, 0, 0.066, 0.012, 0.066), shieldCol);
    b.add(G.cyl8, trs(0.018, 0.15, -0.066, Math.PI / 2, 0.35, 0, 0.072, 0.006, 0.072), metal.clone().multiplyScalar(0.6));
    b.add(G.ball, trs(0.024, 0.15, -0.078, 0, 0, 0, 0.014), metal);
  } else {
    // Heater shield: box + point, bone face with lapis border.
    b.add(G.box, trs(0.02, 0.165, -0.07, 0, 0.35, 0, 0.1, 0.075, 0.012), shieldCol);
    b.add(G.cone4, trs(0.02, 0.112, -0.07, Math.PI, 0.35 + Math.PI / 4, 0, 0.07, 0.04, 0.012), shieldCol);
    b.add(G.box, trs(0.018, 0.165, -0.066, 0, 0.35, 0, 0.112, 0.085, 0.006), primary);
    b.add(G.ball, trs(0.025, 0.16, -0.078, 0, 0, 0, 0.013), metal);
  }
  // Spear in the right hand (+z): shaft, tip, hand.
  b.add(G.cyl6, trs(0.03, 0.21, 0.066, 0, 0, -0.08, 0.007, 0.42, 0.007), wood);
  b.add(G.cone6, trs(0.047, 0.44, 0.066, 0, 0, -0.08, 0.014, 0.05, 0.014), metal);
  b.add(G.ball, trs(0.028, 0.16, 0.066, 0, 0, 0, 0.018), skin);

  const g = b.build();
  const s = height / REF_HEIGHT;
  g.scale(s, s, s);
  return g;
}
