import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

// Shot framing is pure and lives in shots.ts (no drei/R3F imports), so the
// renderer's tests and the fog offset don't load the orbit controls.
export { closeShot, wideShot, wideShotFor, type CameraShot } from "./shots";
import type { CameraShot } from "./shots";

const deg = THREE.MathUtils.degToRad;

/**
 * Horizontal orbit either side of the shot's azimuth, in degrees. Playtest 1
 * asked for much more than the original ±25°: ±90° gives full side-on views
 * of the board. The polar clamp is unchanged, so the board never flips.
 */
export const AZIMUTH_RANGE = 90;

/**
 * Clamped diorama orbit (±AZIMUTH_RANGE azimuth, limited tilt and zoom), with a
 * gentle idle drift that eases in after the user lets go.
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
      minAzimuthAngle={deg(shot.azimuth - AZIMUTH_RANGE)}
      maxAzimuthAngle={deg(shot.azimuth + AZIMUTH_RANGE)}
      minPolarAngle={deg(34)}
      maxPolarAngle={deg(64)}
      minDistance={4.5}
      maxDistance={Math.max(26, shot.distance * 1.4)}
      onStart={() => {
        idle.current.active = true;
      }}
      onEnd={() => {
        idle.current.active = false;
      }}
    />
  );
}
