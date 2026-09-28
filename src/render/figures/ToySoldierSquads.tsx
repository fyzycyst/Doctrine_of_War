import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FactionId } from "../../game/types";
import { useLook } from "../look/LookContext";
import { addRimLight, createOutlineMaterial } from "../materials";
import { buildToySoldier } from "./toySoldier";
import type { PlacedSquad } from "./types";

const FACTIONS: FactionId[] = ["free_banners", "ashen_host"];

/** Figure approach (a): one InstancedMesh per faction, idle bob on the CPU. */
export function ToySoldierSquads({ placed }: { placed: PlacedSquad[] }) {
  return (
    <>
      {FACTIONS.map((faction) => (
        <FactionInstances key={faction} faction={faction} placed={placed} />
      ))}
    </>
  );
}

function FactionInstances({ faction, placed }: { faction: FactionId; placed: PlacedSquad[] }) {
  const { skin } = useLook();
  const style = skin.factions[faction];
  const mesh = useRef<THREE.InstancedMesh>(null);
  const outline = useRef<THREE.InstancedMesh>(null);
  const figures = useMemo(() => placed.flatMap((p) => p.figures).filter((f) => f.faction === faction), [placed, faction]);

  const geometry = useMemo(() => buildToySoldier(faction, style, skin.figures.height), [faction, style, skin.figures.height]);
  const material = useMemo(() => {
    const m =
      skin.material.shading === "toon"
        ? new THREE.MeshToonMaterial({ vertexColors: true })
        : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.05 });
    return addRimLight(m, style.glow, skin.figures.rimStrength * style.rim, `toy-${faction}-${skin.material.shading}`);
  }, [style.glow, style.rim, skin.figures.rimStrength, skin.material.shading, faction]);
  const outlineMaterial = useMemo(
    () => (skin.material.outline ? createOutlineMaterial(skin.material.outlineColor, 0.006) : null),
    [skin.material.outline, skin.material.outlineColor],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const amp = skin.figures.bobAmplitude;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const targets = [mesh.current, outline.current].filter((m): m is THREE.InstancedMesh => !!m);
    figures.forEach((f, i) => {
      const bob = Math.max(0, Math.sin(t * 2.2 + f.phase)) * amp;
      const sway = Math.sin(t * 1.3 + f.phase) * 0.04;
      dummy.position.set(f.x, f.y + bob, f.z);
      dummy.rotation.set(0, f.yaw + sway, sway * 0.3);
      dummy.updateMatrix();
      for (const m of targets) m.setMatrixAt(i, dummy.matrix);
    });
    for (const m of targets) {
      m.count = figures.length;
      m.instanceMatrix.needsUpdate = true;
    }
  });

  const capacity = Math.max(1, figures.length);
  return (
    <>
      <instancedMesh
        key={`${faction}-${capacity}`}
        ref={mesh}
        args={[geometry, material, capacity]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      {outlineMaterial && (
        <instancedMesh key={`o-${faction}-${capacity}`} ref={outline} args={[geometry, outlineMaterial, capacity]} frustumCulled={false} />
      )}
    </>
  );
}
