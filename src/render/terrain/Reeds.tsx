import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useDisposable } from "../dispose";
import { useLook } from "../look/LookContext";
import type { IslandBuild } from "./buildIsland";

/**
 * Reed banks (marsh terrain): the builder's reed geometry with a wind-sway
 * vertex shader. The per-vertex `glow` channel is the sway weight (0 at the
 * root, 1 at the tip); reduced motion calms it to a slow lean.
 */
export function Reeds({ island }: { island: IslandBuild }) {
  const { skin, motion } = useLook();
  const material = useDisposable(() => {
    const uniforms = { uTime: { value: 0 } };
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: skin.material.roughness });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float glow;\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
float w = glow * glow;
float phase = position.x * 1.7 + position.z * 1.1;
transformed.x += (sin(uTime * 1.7 + phase) * 0.05 + sin(uTime * 3.1 + phase * 2.3) * 0.015) * w;
transformed.z += cos(uTime * 1.3 + phase * 0.8) * 0.03 * w;`,
        );
    };
    m.customProgramCacheKey = () => "reeds-sway";
    m.userData.uniforms = uniforms;
    return m;
  }, [skin.material.roughness]);

  useFrame((_, dt) => {
    material.userData.uniforms.uTime.value += dt * motion;
  });

  if (!island.reedGeometry) return null;
  return <mesh geometry={island.reedGeometry} material={material} castShadow receiveShadow />;
}
