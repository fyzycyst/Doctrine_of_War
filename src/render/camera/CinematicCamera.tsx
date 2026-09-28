import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { sampleCameraPathInto, type CameraPath, type CameraSample } from "./cameraPath";

/**
 * Drives the default camera along a CameraPath using the R3F clock, so it is
 * deterministic when frames are stepped with `advance(t)` (frame export).
 * `startAt` offsets the path; `reducedMotion` holds the first keyframe.
 */
export function CinematicCamera({
  path,
  startAt = 0,
  reducedMotion = false,
  speed = 1,
}: {
  path: CameraPath;
  startAt?: number;
  reducedMotion?: boolean;
  speed?: number;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const origin = useRef<number | null>(null);
  // One sample reused every frame: no per-frame allocation.
  const sample = useMemo<CameraSample>(() => ({ position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 30 }), []);
  useFrame(({ clock }) => {
    if (origin.current === null) origin.current = clock.elapsedTime;
    const t = reducedMotion ? 0 : (clock.elapsedTime - origin.current) * speed + startAt;
    const s = sampleCameraPathInto(path, t, sample);
    camera.position.copy(s.position);
    camera.lookAt(s.target);
    if (Math.abs(camera.fov - s.fov) > 1e-3) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}
