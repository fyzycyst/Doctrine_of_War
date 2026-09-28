import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FactionId } from "../../game/engine/types";
import { useLook } from "../look/LookContext";
import { createFigureMaterial, createOutlineMaterial } from "../materials";
import { MAX_FIGURES, type SquadAnimator } from "./squadAnimation";
import { buildCart, buildRefugee, buildToySoldier } from "./toySoldier";
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
  slots?: (index: number) => boolean;
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
        const visible = i < p.alive && (f?.fade ?? 1) > 0 && (!slotFilter || slotFilter(i));
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
        const breathe = ghost ? GHOST_FADE * (0.72 + 0.28 * Math.sin(t * 0.9 + s * 1.3 + slot.phase * 0.3)) : 1;
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

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
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
      });
    });
    m.count = capacity;
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh key={capacity} ref={mesh} args={[geometry, material, capacity]} castShadow receiveShadow frustumCulled={false} />;
}
