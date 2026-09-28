import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export interface CameraShot {
  target: [number, number, number];
  /** Azimuth in degrees; 0 = looking north from the south (+z). */
  azimuth: number;
  /** Polar angle from straight down, in degrees. */
  polar: number;
  distance: number;
}

export const SHOTS: Record<"wide" | "close", CameraShot> = {
  wide: { target: [0.3, -0.4, 0.9], azimuth: 0, polar: 57, distance: 22 },
  close: { target: [2.3, 0.3, 1.1], azimuth: 18, polar: 56, distance: 6.2 },
};

const deg = THREE.MathUtils.degToRad;

/**
 * Clamped diorama orbit (tech plan §6: ±25° azimuth, limited tilt and zoom),
 * with a gentle idle drift that eases in after the user lets go.
 */
export function DioramaCamera({ shot, drift = true }: { shot: CameraShot; drift?: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((state) => state.camera);
  const idle = useRef({ since: 0, baseAz: deg(shot.azimuth), active: false });
  const target = useMemo(() => new THREE.Vector3(...shot.target), [shot]);

  useEffect(() => {
    const spherical = new THREE.Spherical(shot.distance, deg(shot.polar), deg(shot.azimuth));
    camera.position.setFromSpherical(spherical).add(target);
    camera.lookAt(target);
    controls.current?.target.copy(target);
    controls.current?.update();
    idle.current = { since: 0, baseAz: deg(shot.azimuth), active: false };
  }, [camera, shot, target]);

  useFrame(({ clock }) => {
    const c = controls.current;
    if (!c || !drift) return;
    const t = clock.elapsedTime;
    if (idle.current.active) {
      idle.current.since = t;
      return;
    }
    const idleFor = t - idle.current.since;
    const ease = THREE.MathUtils.smoothstep(idleFor, 2, 6);
    if (ease <= 0) {
      idle.current.baseAz = c.getAzimuthalAngle();
      return;
    }
    c.setAzimuthalAngle(idle.current.baseAz + Math.sin((idleFor - 2) * 0.09) * deg(6) * ease);
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.5}
      zoomSpeed={0.6}
      minAzimuthAngle={deg(shot.azimuth - 25)}
      maxAzimuthAngle={deg(shot.azimuth + 25)}
      minPolarAngle={deg(34)}
      maxPolarAngle={deg(64)}
      minDistance={5}
      maxDistance={26}
      onStart={() => {
        idle.current.active = true;
      }}
      onEnd={() => {
        idle.current.active = false;
      }}
    />
  );
}
