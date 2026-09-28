import * as THREE from "three";

/**
 * Accumulates flat-shaded, vertex-coloured triangles into one BufferGeometry.
 * Everything static in the diorama (tiles, cliffs, props) is merged through
 * this so the island is a single draw call with a low-poly faceted look.
 */
export class GeoBuilder {
  private positions: number[] = [];
  private colors: number[] = [];
  /** Per-vertex emissive weight (0 = none); figures use it for ember glints. */
  private glows: number[] = [];

  get vertexCount() {
    return this.positions.length / 3;
  }

  /** Adds one triangle; winding must be counter-clockwise seen from outside. */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb = ca, cc = ca) {
    this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.colors.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
    this.glows.push(0, 0, 0);
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ca: THREE.Color, cb = ca, cc = ca, cd = ca) {
    this.tri(a, b, c, ca, cb, cc);
    this.tri(a, c, d, ca, cc, cd);
  }

  /** Merges any three geometry (e.g. a ConeGeometry) with a transform and colour. */
  add(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color, jitter = 0, rand?: () => number, glow = 0) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(matrix);
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i += 3) {
      const shade = jitter && rand ? 1 + (rand() - 0.5) * jitter : 1;
      for (let k = 0; k < 3; k += 1) {
        this.positions.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
        this.colors.push(color.r * shade, color.g * shade, color.b * shade);
        this.glows.push(glow);
      }
    }
    g.dispose();
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute("glow", new THREE.Float32BufferAttribute(this.glows, 1));
    geometry.computeVertexNormals(); // non-indexed => flat normals
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpEuler = new THREE.Euler();

/** Compose a transform from position, Euler rotation (radians) and scale. */
export function trs(
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = sx,
  sz = sx,
): THREE.Matrix4 {
  tmpPos.set(x, y, z);
  tmpQuat.setFromEuler(tmpEuler.set(rx, ry, rz));
  tmpScale.set(sx, sy, sz);
  return new THREE.Matrix4().compose(tmpPos, tmpQuat, tmpScale);
}

export function color(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

/** Shifts a colour's lightness/hue slightly: used for per-tile jitter. */
export function jitterColor(base: THREE.Color, amount: number, rand: () => number): THREE.Color {
  const c = base.clone();
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(
    (hsl.h + (rand() - 0.5) * amount * 0.25 + 1) % 1,
    Math.max(0, Math.min(1, hsl.s * (1 + (rand() - 0.5) * amount * 2))),
    Math.max(0, Math.min(1, hsl.l * (1 + (rand() - 0.5) * amount * 3))),
  );
  return c;
}
