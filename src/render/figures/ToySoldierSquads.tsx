import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FactionId } from "../../game/engine/types";
import { useLook } from "../look/LookContext";
import { createFigureMaterial, createOutlineMaterial } from "../materials";
import { MAX_FIGURES, type SquadAnimator } from "./squadAnimation";
import { buildCart, buildRam, buildRefugee, buildToySoldier, RAM_ROOF_TOP, RAM_SCALE } from "./toySoldier";
import { mulberry32 } from "../hexWorld";
import { slotToWorld, type PlacedSquad } from "./types";
import { useDisposable } from "../dispose";

const FACTIONS: FactionId[] = ["free_banners", "ashen_host"];

export interface FigurePickHandlers {
  onSquadClick?: (squadId: string) => void;
  onSquadHover?: (squadId: string | null) => void;
}

/**
 * Figure approach (a): per faction, one InstancedMesh for live squads and one
 * for last-known "ghost" silhouettes, nine instances per squad (one per
 * formation slot). Placement, idle bob and every animator pose (march, lunge,
 * fall, rout, rally, brace, reveal) are composed on the CPU each frame; `aFade`
 * dithers figures in and out.
 */
export function ToySoldierSquads({
  placed,
  animator,
  ...handlers
}: { placed: PlacedSquad[]; animator: SquadAnimator } & FigurePickHandlers) {
  return (
    <>
      {FACTIONS.map((faction) => (
        <FactionInstances key={faction} faction={faction} placed={placed} animator={animator} {...handlers} />
      ))}
      <ColumnInstances placed={placed} animator={animator} {...handlers} />
      <SiegeRams placed={placed} animator={animator} {...handlers} />
    </>
  );
}

const dummy = new THREE.Object3D();

/**
 * Ghosts draw in the transparent pass after the mist (renderOrder 6), so a
 * last-known position stays readable inside the fog, as a dark translucent
 * silhouette with a soft rim.
 */
function withGhostDraw(material: THREE.Material) {
  material.transparent = true;
  material.depthWrite = true;
  return material;
}
/** Ghost silhouettes are low-alpha and slowly breathe. */
const GHOST_FADE = 0.7;
const ghostBreath = (t: number, s: number, phase: number) => GHOST_FADE * (0.72 + 0.28 * Math.sin(t * 0.9 + s * 1.3 + phase * 0.3));

/** A siege squad's crew stands on the flank files, clear of the ram shed. */
const CREW_SIDE = 0.13;
const siegeCrew = (i: number, p: PlacedSquad) => p.squad.kind !== "siege" || Math.abs(p.slots[i].side) > CREW_SIDE;

function FactionInstances({
  faction,
  placed,
  animator,
  onSquadClick,
  onSquadHover,
}: { faction: FactionId; placed: PlacedSquad[]; animator: SquadAnimator } & FigurePickHandlers) {
  const { skin, motion } = useLook();
  const style = skin.factions[faction];
  const soldiers = useMemo(() => placed.filter((p) => p.squad.faction === faction && p.squad.kind !== "column"), [placed, faction]);
  const live = useMemo(() => soldiers.filter((p) => !p.squad.lastKnown), [soldiers]);
  const ghosts = useMemo(() => soldiers.filter((p) => p.squad.lastKnown), [soldiers]);

  const base = useMemo(() => buildToySoldier(faction, style, skin.figures.height), [faction, style, skin.figures.height]);
  useEffect(() => () => base.dispose(), [base]);
  const material = useMemo(
    () =>
      createFigureMaterial({
        shading: skin.material.shading,
        rimColor: style.glow,
        rimStrength: skin.figures.rimStrength * style.rim,
        glintColor: style.glow,
        cacheKey: `${faction}-${skin.material.shading}`,
      }),
    [style.glow, style.rim, skin.figures.rimStrength, skin.material.shading, faction],
  );
  const ghostMaterial = useMemo(
    () =>
      withGhostDraw(createFigureMaterial({
        shading: skin.material.shading,
        rimColor: style.glow,
        rimStrength: 0,
        glintColor: style.glow,
        cacheKey: `${faction}-${skin.material.shading}`,
        ghost: true,
      })),
    [style.glow, skin.material.shading, faction],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => ghostMaterial.dispose(), [ghostMaterial]);
  const outlineMaterial = useDisposable(
    () => (skin.material.outline ? createOutlineMaterial(skin.material.outlineColor, 0.006) : null),
    [skin.material.outline, skin.material.outlineColor],
  );

  return (
    <>
      <InstanceGroup
        squads={live}
        base={base}
        material={material}
        outline={outlineMaterial}
        animator={animator}
        amp={skin.figures.bobAmplitude * motion}
        sway={motion}
        slots={siegeCrew}
        castShadow
        onSquadClick={onSquadClick}
        onSquadHover={onSquadHover}
      />
      {ghosts.length > 0 && (
        <InstanceGroup
          squads={ghosts}
          base={base}
          material={ghostMaterial}
          outline={null}
          animator={animator}
          amp={0}
          slots={siegeCrew}
          ghost
          onSquadClick={onSquadClick}
          onSquadHover={onSquadHover}
        />
      )}
    </>
  );
}

function InstanceGroup({
  squads,
  base,
  material,
  outline,
  animator,
  amp,
  sway: swayScale = 0,
  slots: slotFilter,
  ghost = false,
  castShadow = false,
  onSquadClick,
  onSquadHover,
}: {
  squads: PlacedSquad[];
  base: THREE.BufferGeometry;
  material: THREE.Material;
  outline: THREE.Material | null;
  animator: SquadAnimator;
  amp: number;
  /** Idle sway multiplier (0 = none, 1 = full; reduced motion scales it down). */
  sway?: number;
  /** Only draw formation slots for which this returns true (split variants across groups). */
  slots?: (index: number, squad: PlacedSquad) => boolean;
  ghost?: boolean;
  castShadow?: boolean;
} & FigurePickHandlers) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const outlineMesh = useRef<THREE.InstancedMesh>(null);
  const capacity = Math.max(1, squads.length * MAX_FIGURES);

  // Each group owns its geometry so its per-instance `aFade` is independent.
  const geometry = useMemo(() => {
    const g = base.clone();
    g.setAttribute("aFade", new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1));
    g.setAttribute("aSilhouette", new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
    return g;
  }, [base, capacity]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const targets = [mesh.current, outlineMesh.current].filter((m): m is THREE.InstancedMesh => !!m);
    if (targets.length === 0) return;
    const fade = geometry.getAttribute("aFade") as THREE.InstancedBufferAttribute;
    const silhouette = geometry.getAttribute("aSilhouette") as THREE.InstancedBufferAttribute;
    squads.forEach((p, s) => {
      const pose = animator.squadPose(p.squad.id);
      const ax = pose?.anchor?.x ?? p.x;
      const ay = pose?.anchor?.y ?? p.y;
      const az = pose?.anchor?.z ?? p.z;
      const facing = pose?.facing ?? p.squad.facing;
      for (let i = 0; i < MAX_FIGURES; i += 1) {
        const index = s * MAX_FIGURES + i;
        const slot = p.slots[i];
        const f = animator.figurePose(p.squad.id, i);
        const visible = i < p.alive && (f?.fade ?? 1) > 0 && (!slotFilter || slotFilter(i, p));
        if (!visible) {
          dummy.position.set(ax, -50, az);
          dummy.scale.setScalar(0);
          dummy.rotation.set(0, 0, 0);
        } else {
          const [ox, oz] = slotToWorld(slot, facing, f?.spread ?? 1);
          const idle = f?.still ? 0 : 1;
          const bob = Math.max(0, Math.sin(t * 2.2 + slot.phase)) * amp * idle;
          const sway = Math.sin(t * 1.3 + slot.phase) * 0.04 * idle * swayScale;
          dummy.position.set(ax + ox + (f?.dx ?? 0), ay + bob + (f?.dy ?? 0), az + oz + (f?.dz ?? 0));
          // Yaw first, then lean (about local z) and roll (about local x).
          dummy.rotation.set(f?.roll ?? 0, facing + slot.yaw + (f?.yaw ?? 0) + sway, -(f?.lean ?? 0) + sway * 0.3, "YXZ");
          const sc = f?.scale ?? 1;
          dummy.scale.set(sc, sc * (f?.scaleY ?? 1), sc);
        }
        dummy.updateMatrix();
        for (const m of targets) m.setMatrixAt(index, dummy.matrix);
        const breathe = ghost ? ghostBreath(t, s, slot.phase) : 1;
        fade.setX(index, visible ? (f?.fade ?? 1) * breathe : 0);
        silhouette.setX(index, f?.silhouette ?? 0);
      }
    });
    for (const m of targets) {
      m.count = squads.length * MAX_FIGURES;
      m.instanceMatrix.needsUpdate = true;
    }
    fade.needsUpdate = true;
    silhouette.needsUpdate = true;
  });

  const squadAt = (e: ThreeEvent<PointerEvent | MouseEvent>) =>
    e.instanceId === undefined ? null : (squads[Math.floor(e.instanceId / MAX_FIGURES)]?.squad.id ?? null);

  return (
    <>
      <instancedMesh
        key={capacity}
        ref={mesh}
        renderOrder={ghost ? 6 : 0}
        args={[geometry, material, capacity]}
        castShadow={castShadow}
        receiveShadow={!ghost}
        frustumCulled={false}
        onClick={(e) => {
          const id = squadAt(e);
          if (id && onSquadClick) {
            e.stopPropagation();
            onSquadClick(id);
          }
        }}
        onPointerMove={(e) => {
          const id = squadAt(e);
          if (id && onSquadHover) {
            e.stopPropagation();
            onSquadHover(id);
          }
        }}
        onPointerOut={() => onSquadHover?.(null)}
      />
      {outline && <instancedMesh key={`o-${capacity}`} ref={outlineMesh} args={[geometry, outline, capacity]} frustumCulled={false} />}
    </>
  );
}

/**
 * The refugee Column (noncombatant squads): lantern-bearers and staff-walkers
 * on alternating formation slots (so strength loss and every animation work as
 * for soldiers), plus two covered carts that follow the squad's anchor.
 */
function ColumnInstances({
  placed,
  animator,
  onSquadClick,
  onSquadHover,
}: { placed: PlacedSquad[]; animator: SquadAnimator } & FigurePickHandlers) {
  const { skin, motion } = useLook();
  const columns = useMemo(() => placed.filter((p) => p.squad.kind === "column" && !p.squad.lastKnown), [placed]);
  const lantern = useDisposable(() => buildRefugee(skin.figures.height * 0.92, 0), [skin.figures.height]);
  const staff = useDisposable(() => buildRefugee(skin.figures.height * 0.92, 1), [skin.figures.height]);
  const material = useDisposable(
    () =>
      createFigureMaterial({
        shading: skin.material.shading,
        rimColor: "#e8dcc4",
        rimStrength: skin.figures.rimStrength * 0.4,
        glintColor: "#ffb060",
        cacheKey: `column-${skin.material.shading}`,
      }),
    [skin.material.shading, skin.figures.rimStrength],
  );
  if (columns.length === 0) return null;
  const common = { squads: columns, material, outline: null, animator, amp: skin.figures.bobAmplitude * motion, sway: motion, castShadow: true, onSquadClick, onSquadHover };
  return (
    <>
      <InstanceGroup {...common} base={lantern} slots={(i) => i % 2 === 0} />
      <InstanceGroup {...common} base={staff} slots={(i) => i % 2 === 1} />
      <Carts columns={columns} animator={animator} />
    </>
  );
}

/** Carts sit at the head and tail of the Column, turning and moving with it. */
function Carts({ columns, animator }: { columns: PlacedSquad[]; animator: SquadAnimator }) {
  const { skin, motion } = useLook();
  const mesh = useRef<THREE.InstancedMesh>(null);
  const capacity = Math.max(1, columns.length * 2);
  const geometry = useDisposable(() => {
    const g = buildCart(skin.figures.height);
    // The figure material reads a per-instance fade and silhouette; carts are always fully shown.
    g.setAttribute("aFade", new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1));
    g.setAttribute("aSilhouette", new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
    return g;
  }, [skin.figures.height, capacity]);
  const material = useDisposable(
    () =>
      createFigureMaterial({
        shading: skin.material.shading,
        rimColor: "#e8dcc4",
        rimStrength: 0.1,
        glintColor: "#ffb060",
        cacheKey: `cart-${skin.material.shading}`,
      }),
    [skin.material.shading],
  );
  const offsets: Array<[number, number]> = [
    [0.12, 0.32],
    [-0.28, -0.3],
  ];

  // Each cart's lantern also gets a soft additive glow: the Column's warm
  // lights are the small warm accent of a grey Saltmarsh frame.
  const glowGeometry = useDisposable(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(capacity * 3), 3));
    g.setAttribute("aGlow", new THREE.Float32BufferAttribute(new Float32Array(capacity), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    return g;
  }, [capacity]);
  const glowMaterial = useDisposable(() => createLanternGlowMaterial(), []);
  const lanternFwd = 0.13 * (skin.figures.height / 0.34);
  const lanternUp = 0.19 * (skin.figures.height / 0.34);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    const glowPos = glowGeometry.getAttribute("position") as THREE.BufferAttribute;
    const glowAmt = glowGeometry.getAttribute("aGlow") as THREE.BufferAttribute;
    columns.forEach((p, s) => {
      const pose = animator.squadPose(p.squad.id);
      const facing = pose?.facing ?? p.squad.facing;
      const gone = (pose?.ringFade ?? 1) <= 0.01 || p.alive === 0;
      const cos = Math.cos(facing);
      const sin = Math.sin(facing);
      offsets.forEach(([fwd, side], k) => {
        const idx = s * offsets.length + k;
        if (gone || (k === 1 && p.alive < 4)) {
          dummy.scale.setScalar(0);
        } else {
          const ax = pose?.anchor?.x ?? p.x;
          const ay = pose?.anchor?.y ?? p.y;
          const az = pose?.anchor?.z ?? p.z;
          dummy.position.set(ax + fwd * cos + side * sin, ay + Math.abs(Math.sin(t * 3 + k)) * 0.004 * motion, az - fwd * sin + side * cos);
          dummy.rotation.set(0, facing, Math.sin(t * 2.1 + k) * 0.01 * motion);
          dummy.scale.setScalar(1);
        }
        dummy.updateMatrix();
        m.setMatrixAt(idx, dummy.matrix);
        const lf = fwd + lanternFwd;
        glowPos.setXYZ(idx, dummy.position.x + (lf - fwd) * cos, dummy.position.y + lanternUp, dummy.position.z - (lf - fwd) * sin);
        glowAmt.setX(idx, gone || (k === 1 && p.alive < 4) ? 0 : 0.85 + 0.15 * Math.sin(t * 9.1 * motion + idx * 2.3));
      });
    });
    m.count = capacity;
    m.instanceMatrix.needsUpdate = true;
    glowPos.needsUpdate = true;
    glowAmt.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh key={capacity} ref={mesh} args={[geometry, material, capacity]} castShadow receiveShadow frustumCulled={false} />
      <points geometry={glowGeometry} material={glowMaterial} renderOrder={7} frustumCulled={false} />
    </>
  );
}

/** Soft warm additive point glows (world-size, so they shrink with distance). */
function createLanternGlowMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color("#ffb45a") }, uSize: { value: 0.8 } },
    vertexShader: /* glsl */ `
      attribute float aGlow;
      uniform float uSize;
      varying float vGlow;
      void main() {
        vGlow = aGlow;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aGlow > 0.0 ? uSize * projectionMatrix[1][1] * 500.0 / -mv.z : 0.0;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * 5.0) * vGlow;
        gl_FragColor = vec4(uColor * a * 1.2, a);
      }
    `,
  });
}

/**
 * Siege engines (the Cinderram): one ram shed per siege squad at its anchor,
 * turning and moving with it, under wet hides until sunrise burns them off.
 * The crew are ordinary figures on the flank files (see `siegeCrew`). The ram
 * follows the squad's first figure for reveal fade/silhouette and vanishes
 * when the squad is destroyed or routs. Last-known rams draw as ghosts.
 */
function SiegeRams({ placed, animator, ...handlers }: { placed: PlacedSquad[]; animator: SquadAnimator } & FigurePickHandlers) {
  const { skin, timeOfDay, reducedMotion } = useLook();
  const sieges = useMemo(() => placed.filter((p) => p.squad.kind === "siege"), [placed]);
  const live = useMemo(() => sieges.filter((p) => !p.squad.lastKnown), [sieges]);
  const ghosts = useMemo(() => sieges.filter((p) => p.squad.lastKnown), [sieges]);
  const frame = useDisposable(() => buildRam(skin.figures.height, "frame"), [skin.figures.height]);
  const hides = useDisposable(() => buildRam(skin.figures.height, "hides"), [skin.figures.height]);
  const glow = skin.factions.ashen_host.glow;
  const material = useDisposable(
    () => createFigureMaterial({ shading: skin.material.shading, rimColor: glow, rimStrength: 0.12, glintColor: glow, cacheKey: `ram-${skin.material.shading}` }),
    [skin.material.shading, glow],
  );
  const ghostMaterial = useDisposable(
    () => withGhostDraw(createFigureMaterial({ shading: skin.material.shading, rimColor: glow, rimStrength: 0, glintColor: glow, cacheKey: `ram-${skin.material.shading}`, ghost: true })),
    [skin.material.shading, glow],
  );

  // The hides burn away at sunrise: 0 = on, 1 = gone. Arriving at sunrise
  // starts them gone; the switch plays a ~1 s burn (steam, sink, fade), cut
  // under reduced motion. Going back (a lab fade) snaps them on again.
  const hidesOn = timeOfDay !== "sunrise";
  const burn = useRef(hidesOn ? 0 : 1);
  useFrame((_, dt) => {
    const target = hidesOn ? 0 : 1;
    if (target === 0 || reducedMotion) burn.current = target;
    else burn.current = Math.min(1, burn.current + dt / HIDE_BURN_TIME);
  });

  if (sieges.length === 0) return null;
  const common = { animator, ...handlers };
  return (
    <>
      {live.length > 0 && (
        <>
          <RamGroup squads={live} base={frame} material={material} {...common} />
          <RamGroup squads={live} base={hides} material={material} burn={burn} {...common} />
          <RamSteam squads={live} animator={animator} burn={burn} />
        </>
      )}
      {ghosts.length > 0 && (
        <>
          <RamGroup squads={ghosts} base={frame} material={ghostMaterial} ghost {...common} />
          <RamGroup squads={ghosts} base={hides} material={ghostMaterial} ghost burn={burn} {...common} />
        </>
      )}
    </>
  );
}

/** Seconds for the Cinderram's hides to burn away when the sun comes up. */
const HIDE_BURN_TIME = 1;
const STEAM_PUFFS = 18;

/**
 * Steam off the burning hides: puffs rise from the roof and swell as `burn`
 * runs 0 → 1, each on its own delay, and are gone by the end.
 */
function RamSteam({ squads, animator, burn }: { squads: PlacedSquad[]; animator: SquadAnimator; burn: { current: number } }) {
  const { skin } = useLook();
  const capacity = Math.max(1, squads.length * STEAM_PUFFS);
  const seedsArr = useMemo(() => {
    const rand = mulberry32(31);
    return Array.from({ length: STEAM_PUFFS }, () => ({ x: (rand() - 0.5) * 0.55, z: (rand() - 0.5) * 0.2, delay: rand() * 0.55, drift: (rand() - 0.5) * 0.3 }));
  }, []);
  const geometry = useDisposable(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(capacity * 3), 3));
    g.setAttribute("aPuff", new THREE.Float32BufferAttribute(new Float32Array(capacity * 2), 2));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    return g;
  }, [capacity]);
  const material = useDisposable(() => createSteamMaterial(), []);
  const points = useRef<THREE.Points>(null);
  const scale = (skin.figures.height / 0.34) * RAM_SCALE;

  useFrame(() => {
    const b = burn.current;
    if (points.current) points.current.visible = b > 0 && b < 1;
    if (b <= 0 || b >= 1) return;
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const puff = geometry.getAttribute("aPuff") as THREE.BufferAttribute;
    squads.forEach((p, s) => {
      const pose = animator.squadPose(p.squad.id);
      const facing = pose?.facing ?? p.squad.facing;
      const cos = Math.cos(facing);
      const sin = Math.sin(facing);
      const ax = pose?.anchor?.x ?? p.x;
      const ay = pose?.anchor?.y ?? p.y;
      const az = pose?.anchor?.z ?? p.z;
      seedsArr.forEach((sd, k) => {
        const i = s * STEAM_PUFFS + k;
        const age = THREE.MathUtils.clamp((b - sd.delay) / 0.45, 0, 1);
        const lx = sd.x * scale;
        const lz = (sd.z + sd.drift * age) * scale;
        pos.setXYZ(i, ax + lx * cos + lz * sin, ay + (RAM_ROOF_TOP * 0.85 + age * 0.6) * scale, az - lx * sin + lz * cos);
        puff.setXY(i, age > 0 && age < 1 ? Math.sin(Math.PI * age) : 0, age);
      });
    });
    pos.needsUpdate = true;
    puff.needsUpdate = true;
  });
  return <points ref={points} geometry={geometry} material={material} renderOrder={7} frustumCulled={false} visible={false} />;
}

/** Soft, swelling grey-white steam puffs (world-size points). */
function createSteamMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color("#e8e4e0") } },
    vertexShader: /* glsl */ `
      attribute vec2 aPuff;
      varying float vA;
      void main() {
        vA = aPuff.x;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aPuff.x > 0.0 ? (0.1 + 0.26 * aPuff.y) * projectionMatrix[1][1] * 500.0 / -mv.z : 0.0;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.1, d) * vA * 0.38;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

function RamGroup({
  squads,
  base,
  material,
  animator,
  ghost = false,
  burn,
  onSquadClick,
  onSquadHover,
}: {
  squads: PlacedSquad[];
  base: THREE.BufferGeometry;
  material: THREE.Material;
  animator: SquadAnimator;
  ghost?: boolean;
  /** The hides layer: sinks, squashes and fades out as this runs 0 → 1. */
  burn?: { current: number };
} & FigurePickHandlers) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const capacity = Math.max(1, squads.length);
  const geometry = useDisposable(() => {
    const g = base.clone();
    g.setAttribute("aFade", new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1));
    g.setAttribute("aSilhouette", new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
    return g;
  }, [base, capacity]);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    const fade = geometry.getAttribute("aFade") as THREE.InstancedBufferAttribute;
    const silhouette = geometry.getAttribute("aSilhouette") as THREE.InstancedBufferAttribute;
    squads.forEach((p, s) => {
      const pose = animator.squadPose(p.squad.id);
      const f = animator.figurePose(p.squad.id, 0);
      const b = burn?.current ?? 0;
      const gone = p.alive === 0 || (pose?.ringFade ?? 1) <= 0.01 || b >= 1;
      if (gone) {
        dummy.scale.setScalar(0);
      } else {
        // Burning hides slump onto the frame: sink and squash, fading late.
        dummy.position.set(pose?.anchor?.x ?? p.x, (pose?.anchor?.y ?? p.y) + (f?.dy ?? 0) * 0.3 - b * 0.06, pose?.anchor?.z ?? p.z);
        dummy.rotation.set(0, pose?.facing ?? p.squad.facing, 0);
        dummy.scale.set(1 + 0.04 * b, 1 - 0.45 * b * b, 1 + 0.06 * b);
      }
      dummy.updateMatrix();
      m.setMatrixAt(s, dummy.matrix);
      const burnFade = 1 - THREE.MathUtils.smoothstep(b, 0.45, 1);
      fade.setX(s, gone ? 0 : (f?.fade ?? 1) * burnFade * (ghost ? ghostBreath(t, s, 0) : 1));
      silhouette.setX(s, f?.silhouette ?? 0);
    });
    m.count = squads.length;
    m.instanceMatrix.needsUpdate = true;
    fade.needsUpdate = true;
    silhouette.needsUpdate = true;
  });

  return (
    <instancedMesh
      key={capacity}
      ref={mesh}
      renderOrder={ghost ? 6 : 0}
      args={[geometry, material, capacity]}
      castShadow={!ghost}
      receiveShadow={!ghost}
      frustumCulled={false}
      onClick={(e) => {
        const id = e.instanceId === undefined ? null : squads[e.instanceId]?.squad.id;
        if (id && onSquadClick) {
          e.stopPropagation();
          onSquadClick(id);
        }
      }}
      onPointerMove={(e) => {
        const id = e.instanceId === undefined ? null : squads[e.instanceId]?.squad.id;
        if (id && onSquadHover) {
          e.stopPropagation();
          onSquadHover(id);
        }
      }}
      onPointerOut={() => onSquadHover?.(null)}
    />
  );
}
