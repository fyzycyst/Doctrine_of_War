import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useLook } from "../look/LookContext";
import type { Anchor, IslandBuild } from "../terrain/buildIsland";

/**
 * Campfires, gate torches and (night) the burning-river light. Lights stay
 * mounted at all times and only change intensity, so switching presets never
 * forces a shader recompile.
 */
export function Fires({ island }: { island: IslandBuild }) {
  const { preset } = useLook();
  const lights = useRef<Array<THREE.PointLight | null>>([]);
  const flames = useRef<Array<THREE.Mesh | null>>([]);
  const riverLight = useRef<THREE.PointLight>(null);
  const on = preset.fires.intensity;

  const flameMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(preset.fires.color).multiplyScalar(6), toneMapped: true }),
    [preset.fires.color],
  );

  const river = useMemo(() => {
    if (island.water.length === 0) return null;
    const x = island.water.reduce((s, w) => s + w.x, 0) / island.water.length;
    const z = island.water.reduce((s, w) => s + w.z, 0) / island.water.length;
    return new THREE.Vector3(x, island.waterLevel + 0.6, z);
  }, [island]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    island.fireAnchors.forEach((_, i) => {
      const flick = 0.75 + 0.25 * Math.sin(t * 9 + i * 3.1) * Math.sin(t * 5.3 + i);
      const light = lights.current[i];
      if (light) light.intensity = on * flick * (i < 2 ? 0.45 : 1);
      const flame = flames.current[i];
      if (flame) flame.scale.set(1, 0.8 + 0.4 * flick, 1);
    });
    if (riverLight.current) {
      riverLight.current.intensity = preset.waterGlow * 6 * (0.8 + 0.2 * Math.sin(t * 2.3));
    }
  });

  return (
    <>
      {island.fireAnchors.map((a: Anchor, i) => (
        <group key={i} position={[a.x, a.y, a.z]}>
          <pointLight
            ref={(el) => {
              lights.current[i] = el;
            }}
            color={preset.fires.color}
            intensity={0}
            distance={3.2}
            decay={1.6}
            position={[0, 0.18, 0]}
          />
          {on > 0 && (
            <mesh
              ref={(el) => {
                flames.current[i] = el;
              }}
              material={flameMaterial}
              position={[0, 0.07, 0]}
            >
              <coneGeometry args={[0.045, 0.14, 5]} />
            </mesh>
          )}
        </group>
      ))}
      {river && (
        <pointLight ref={riverLight} position={river} color={preset.fires.color} intensity={0} distance={5} decay={1.4} />
      )}
    </>
  );
}
