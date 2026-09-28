import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FactionId } from "../../game/types";
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
 * Figure approach (a): one InstancedMesh per faction with nine instances per
 * squad (one per formation slot). Placement, idle bob and every animator pose
 * (march, lunge, fall, rout, rally, brace) are composed on the CPU each frame;
 * `aFade` dithers fallen/routed figures away.
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

function FactionInstances({
  faction,
  placed,
  animator,
  onSquadClick,
  onSquadHover,
}: { faction: FactionId; placed: PlacedSquad[]; animator: SquadAnimator } & FigurePickHandlers) {
  const { skin } = useLook();
  const style = skin.factions[faction];
  const mesh = useRef<THREE.InstancedMesh>(null);
  const outline = useRef<THREE.InstancedMesh>(null);
  const squads = useMemo(() => placed.filter((p) => p.squad.faction === faction), [placed, faction]);
  const capacity = Math.max(1, squads.length * MAX_FIGURES);

  const geometry = useMemo(() => {
    const g = buildToySoldier(faction, style, skin.figures.height);
    g.setAttribute("aFade", new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1));
    return g;
  }, [faction, style, skin.figures.height, capacity]);
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
  const outlineMaterial = useMemo(
    () => (skin.material.outline ? createOutlineMaterial(skin.material.outlineColor, 0.006) : null),
    [skin.material.outline, skin.material.outlineColor],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  const amp = skin.figures.bobAmplitude;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const targets = [mesh.current, outline.current].filter((m): m is THREE.InstancedMesh => !!m);
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
          const sway = Math.sin(t * 1.3 + slot.phase) * 0.04 * idle;
          dummy.position.set(ax + ox + (f?.dx ?? 0), ay + bob + (f?.dy ?? 0), az + oz + (f?.dz ?? 0));
          // Yaw first, then lean (about local z) and roll (about local x).
          dummy.rotation.set(f?.roll ?? 0, facing + slot.yaw + (f?.yaw ?? 0) + sway, -(f?.lean ?? 0) + sway * 0.3, "YXZ");
          const sc = f?.scale ?? 1;
          dummy.scale.set(sc, sc * (f?.scaleY ?? 1), sc);
        }
        dummy.updateMatrix();
        for (const m of targets) m.setMatrixAt(index, dummy.matrix);
        fade.setX(index, visible ? (f?.fade ?? 1) : 0);
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
        key={`${faction}-${capacity}`}
        ref={mesh}
        args={[geometry, material, capacity]}
        castShadow
        receiveShadow
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
      {outlineMaterial && (
        <instancedMesh key={`o-${faction}-${capacity}`} ref={outline} args={[geometry, outlineMaterial, capacity]} frustumCulled={false} />
      )}
    </>
  );
}
