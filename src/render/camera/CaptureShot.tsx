import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { BoardLayout } from "../../game/board";
import { parseCaptureShot } from "./captureParams";
import { closeShotOn } from "./shots";

type Controls = { target: THREE.Vector3; update: () => void };

/**
 * Dev capture (see `parseCaptureShot`): holds the app's camera and orbit controls on a
 * close beat for its first frames, so a capture of a real battle frames the moment the
 * lab would. `window.__captureAim("captureShot=…&captureAz=…")` re-aims it mid-capture
 * (the product video's cut between a wide and a close beat in one run). Renders nothing;
 * the Diorama mounts it in dev builds only.
 */
export function CaptureShot({ board }: { board: BoardLayout }) {
  const spec = useRef(typeof window === "undefined" ? null : parseCaptureShot(window.location.search));
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const frames = useRef(0);
  useEffect(() => {
    const w = window as unknown as { __captureAim?: (query: string) => void };
    w.__captureAim = (query: string) => {
      spec.current = parseCaptureShot(query.startsWith("?") ? query : `?${query}`);
      frames.current = 0;
    };
    return () => {
      delete w.__captureAim;
    };
  }, []);
  useFrame(() => {
    const s = spec.current;
    // A few frames, so the default shot's own setup (the orbit controls mounting) cannot win.
    if (!s || !controls || frames.current > 5) return;
    const beat = closeShotOn(board, s.hexes, s.azimuth);
    const shot = { ...beat, distance: s.distance ?? beat.distance, polar: s.polar ?? beat.polar };
    const target = new THREE.Vector3(...shot.target);
    const deg = THREE.MathUtils.degToRad;
    camera.position.setFromSpherical(new THREE.Spherical(shot.distance, deg(shot.polar), deg(shot.azimuth))).add(target);
    controls.target.copy(target);
    controls.update();
    frames.current += 1;
  });
  return null;
}
