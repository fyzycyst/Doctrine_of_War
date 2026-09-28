import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FactionId } from "../../game/engine/types";
import { useLook } from "../look/LookContext";
import { createFigureMaterial, createOutlineMaterial } from "../materials";
import { MAX_FIGURES, type SquadAnimator } from "./squadAnimation";
import { buildToySoldier } from "./toySoldier";
import { slotToWorld, type PlacedSquad } from "./types";

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
    </>
  );
}

const dummy = new THREE.Object3D();

/**
 * Ghosts draw in the transparent pass after the mist (renderOrder 6), so a
 * last-known position stays readable inside the fog; the dither still makes
 * them read as half-seen.
 */
function withGhostDraw(material: THREE.Material) {
  material.transparent = true;
  material.depthWrite = true;
  return material;
}
/** Ghost silhouettes are screen-door translucent and slowly breathe. */
const GHOST_FADE = 0.42;

function FactionInstances({
  faction,
  placed,
  animator,
  onSquadClick,
  onSquadHover,
}: { faction: FactionId; placed: PlacedSquad[]; animator: SquadAnimator } & FigurePickHandlers) {
  const { skin } = useLook();
  const style = skin.factions[faction];
  const live = useMemo(() => placed.filter((p) => p.squad.faction === faction && !p.squad.lastKnown), [placed, faction]);
  const ghosts = useMemo(() => placed.filter((p) => p.squad.faction === faction && p.squad.lastKnown), [placed, faction]);

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
  const outlineMaterial = useMemo(
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
        amp={skin.figures.bobAmplitude}
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
    return g;
  }, [base, capacity]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const targets = [mesh.current, outlineMesh.current].filter((m): m is THREE.InstancedMesh => !!m);
    if (targets.length === 0) return;
    const fade = geometry.getAttribute("aFade") as THREE.InstancedBufferAttribute;
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
        const visible = i < p.alive && (f?.fade ?? 1) > 0;
        if (!visible) {
          dummy.position.set(ax, -50, az);
          dummy.scale.setScalar(0);
          dummy.rotation.set(0, 0, 0);
        } else {
          const [ox, oz] = slotToWorld(slot, facing, f?.spread ?? 1);
          const idle = f?.still ? 0 : 1;
          const bob = Math.max(0, Math.sin(t * 2.2 + slot.phase)) * amp * idle;
          const sway = ghost ? 0 : Math.sin(t * 1.3 + slot.phase) * 0.04 * idle;
          dummy.position.set(ax + ox + (f?.dx ?? 0), ay + bob + (f?.dy ?? 0), az + oz + (f?.dz ?? 0));
          // Yaw first, then lean (about local z) and roll (about local x).
          dummy.rotation.set(f?.roll ?? 0, facing + slot.yaw + (f?.yaw ?? 0) + sway, -(f?.lean ?? 0) + sway * 0.3, "YXZ");
          const sc = f?.scale ?? 1;
          dummy.scale.set(sc, sc * (f?.scaleY ?? 1), sc);
        }
        dummy.updateMatrix();
        for (const m of targets) m.setMatrixAt(index, dummy.matrix);
        const breathe = ghost ? GHOST_FADE * (0.8 + 0.2 * Math.sin(t * 1.4 + s + slot.phase)) : 1;
        fade.setX(index, visible ? (f?.fade ?? 1) * breathe : 0);
      }
    });
    for (const m of targets) {
      m.count = squads.length * MAX_FIGURES;
      m.instanceMatrix.needsUpdate = true;
    }
    fade.needsUpdate = true;
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
