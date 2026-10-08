import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { BoardLayout } from "../../game/board";
import { parseCaptureShot } from "./captureParams";
import { closeShotOn } from "./shots";

type Controls = { target: THREE.Vector3; update: () => void };

/**
 * Dev capture (see `parseCaptureShot`): holds the app's camera and orbit controls on a
 * close beat for its first frames, so a capture of a real battle frames the moment the
 * lab would. Renders nothing; the Diorama mounts it in dev builds only.
 */
export function CaptureShot({ board }: { board: BoardLayout }) {
  const spec = useMemo(() => (typeof window === "undefined" ? null : parseCaptureShot(window.location.search)), []);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const frames = useRef(0);
  useFrame(() => {
    // A few frames, so the default shot's own setup (the orbit controls mounting) cannot win.
    if (!spec || !controls || frames.current > 5) return;
    const shot = closeShotOn(board, spec.hexes, spec.azimuth);
    const target = new THREE.Vector3(...shot.target);
    const deg = THREE.MathUtils.degToRad;
    camera.position.setFromSpherical(new THREE.Spherical(shot.distance, deg(shot.polar), deg(shot.azimuth))).add(target);
    controls.target.copy(target);
    controls.update();
    frames.current += 1;
  });
  return null;
}
