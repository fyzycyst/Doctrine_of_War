import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { sampleCameraPath, type CameraPath } from "./cameraPath";

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
  useFrame(({ clock }) => {
    if (origin.current === null) origin.current = clock.elapsedTime;
    const t = reducedMotion ? 0 : (clock.elapsedTime - origin.current) * speed + startAt;
    const s = sampleCameraPath(path, t);
    camera.position.copy(s.position);
    camera.lookAt(s.target);
    if (Math.abs(camera.fov - s.fov) > 1e-3) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}
