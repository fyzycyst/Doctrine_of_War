import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useLook } from "../look/LookContext";
import type { Anchor } from "./buildIsland";
import { useDisposable } from "../dispose";

/** A tall hanging banner of the Free Banners over Greyford Gate, gently swaying. */
export function GateBanner({ anchor }: { anchor: Anchor }) {
  const { skin, motion } = useLook();
  const style = skin.factions.free_banners;
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 192;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = style.bannerCloth;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(96, 0);
    ctx.lineTo(96, 160);
    ctx.lineTo(48, 192);
    ctx.lineTo(0, 160);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = style.bannerEmblem;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = style.bannerEmblem;
    ctx.beginPath();
    for (let i = 0; i < 16; i += 1) {
      const r = i % 2 === 0 ? 28 : 11;
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(48 + Math.cos(a) * r, 80 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [style]);
  useEffect(() => () => texture.dispose(), [texture]);

  const material = useDisposable(() => {
    const uniforms = { uTime: { value: 0 } };
    const m = new THREE.MeshStandardMaterial({
      map: texture,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.9,
      emissive: new THREE.Color("#ffffff"),
      emissiveMap: texture,
      emissiveIntensity: 0.18,
    });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           float hang = 1.0 - uv.y;
           transformed.z += sin(uTime * 1.6 + uv.y * 4.0) * 0.025 * hang;`,
        );
    };
    m.customProgramCacheKey = () => "gate-banner";
    m.userData.uniforms = uniforms;
    return m;
  }, [texture]);

  useFrame((_, dt) => {
    material.userData.uniforms.uTime.value += dt * motion;
  });

  return (
    <mesh
      material={material}
      position={[anchor.x - 0.08, anchor.y - 0.13, anchor.z + 0.02]}
      // Face south-west, toward the default camera (look-lock #8).
      rotation={[0, -0.62, 0]}
      castShadow
    >
      <planeGeometry args={[0.2, 0.4, 2, 8]} />
    </mesh>
  );
}
