import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useLook } from "../look/LookContext";

/** Azimuth 0 = east (+x), 90 = north (-z); elevation above the horizon. */
export function sunDirection(azimuthDeg: number, elevationDeg: number): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const el = THREE.MathUtils.degToRad(elevationDeg);
  return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el));
}

/**
 * One rig, swappable values: warm key (sun) with shadows from the Banners'
 * side, cool fill from the Host's side, hemisphere ambient, and scene fog.
 */
export function LightRig({ shadowRadius = 9 }: { shadowRadius?: number }) {
  const { preset, quality } = useLook();
  const scene = useThree((state) => state.scene);
  const sunPos = useMemo(() => sunDirection(preset.sun.azimuth, preset.sun.elevation).multiplyScalar(22), [preset]);
  const fillPos = useMemo(() => sunDirection(preset.fill.azimuth, preset.fill.elevation).multiplyScalar(20), [preset]);
  const mapSize = quality === "high" ? 2048 : 1024;

  useEffect(() => {
    scene.fog = new THREE.Fog(preset.fog.color, preset.fog.near, preset.fog.far);
    return () => {
      scene.fog = null;
    };
  }, [scene, preset.fog.color, preset.fog.near, preset.fog.far]);

  return (
    <>
      <hemisphereLight args={[preset.hemisphere.sky, preset.hemisphere.ground, preset.hemisphere.intensity]} />
      <directionalLight
        key={`sun-${mapSize}`}
        position={sunPos}
        color={preset.sun.color}
        intensity={preset.sun.intensity}
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-left={-shadowRadius}
        shadow-camera-right={shadowRadius}
        shadow-camera-top={shadowRadius}
        shadow-camera-bottom={-shadowRadius}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-bias={-0.0005}
        shadow-normalBias={0.025}
      />
      <directionalLight position={fillPos} color={preset.fill.color} intensity={preset.fill.intensity} />
    </>
  );
}
