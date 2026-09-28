import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
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
  const { preset, quality, atmosphere } = useLook();
  const sun = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
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

  // Weather overlay: dim the key light, lift ambient, pull the fog in.
  useFrame(() => {
    const m = atmosphere.mix;
    if (sun.current) sun.current.intensity = preset.sun.intensity * m.sunScale;
    if (fill.current) fill.current.intensity = preset.fill.intensity * (0.5 + 0.5 * m.sunScale);
    if (hemi.current) hemi.current.intensity = preset.hemisphere.intensity * m.ambientScale;
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = preset.fog.near * m.fogScale;
      fog.far = preset.fog.far * m.fogScale;
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={[preset.hemisphere.sky, preset.hemisphere.ground, preset.hemisphere.intensity]} />
      <directionalLight
        key={`sun-${mapSize}`}
        ref={sun}
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
      <directionalLight ref={fill} position={fillPos} color={preset.fill.color} intensity={preset.fill.intensity} />
    </>
  );
}
