import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { FactionId } from "../../game/types";
import { useLook } from "../look/LookContext";
import type { FactionStyle } from "../skins/types";
import { cohesionArc } from "../squadLayout";
import type { PlacedSquad } from "./types";

/**
 * Per-squad dressing shared by both figure approaches (tech plan D7):
 * a faction banner with cloth waving in the vertex shader, a cohesion ring
 * whose gap shows lost cohesion, and a soft contact shadow.
 */
export function SquadMarkers({ placed }: { placed: PlacedSquad[] }) {
  const { skin } = useLook();
  const clothTextures = useMemo(
    () => ({
      free_banners: makeBannerTexture("free_banners", skin.factions.free_banners),
      ashen_host: makeBannerTexture("ashen_host", skin.factions.ashen_host),
    }),
    [skin],
  );
  useEffect(() => () => Object.values(clothTextures).forEach((t) => t.dispose()), [clothTextures]);
  const shadowTexture = useMemo(() => makeShadowTexture(), []);

  return (
    <>
      {placed.map((p, i) => (
        <group key={p.squad.id} position={[p.x, p.y, p.z]}>
          <ContactShadow texture={shadowTexture} />
          <CohesionRing faction={p.squad.faction} cohesion={p.squad.cohesion} facing={p.squad.facing} />
          <Banner
            texture={clothTextures[p.squad.faction]}
            faction={p.squad.faction}
            facing={p.squad.facing}
            phase={i * 1.7}
          />
        </group>
      ))}
    </>
  );
}

function ContactShadow({ texture }: { texture: THREE.Texture }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} renderOrder={1}>
      <circleGeometry args={[0.62, 24]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} opacity={0.55} color="#000000" />
    </mesh>
  );
}

function CohesionRing({ faction, cohesion, facing }: { faction: FactionId; cohesion: number; facing: number }) {
  const { skin } = useLook();
  const glow = skin.factions[faction].glow;
  const { lit } = cohesionArc(cohesion);
  const inner = 0.55;
  const outer = 0.59;
  // Arc centred on the squad's facing; the gap opens at the rear.
  const thetaLength = Math.max(0.001, lit * Math.PI * 2);
  const thetaStart = facing - thetaLength / 2;
  const litColor = useMemo(() => new THREE.Color(glow).multiplyScalar(1.5), [glow]);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
      <mesh renderOrder={2}>
        <ringGeometry args={[inner, outer, 64, 1]} />
        <meshBasicMaterial color={glow} transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <mesh renderOrder={2}>
        <ringGeometry args={[inner, outer, 64, 1, thetaStart, thetaLength]} />
        <meshBasicMaterial color={litColor} transparent opacity={0.8} depthWrite={false} />
      </mesh>
    </group>
  );
}

const clothVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
`;

function Banner({
  texture,
  faction,
  facing,
  phase,
}: {
  texture: THREE.Texture;
  faction: FactionId;
  facing: number;
  phase: number;
}) {
  const { skin } = useLook();
  const style = skin.factions[faction];
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      alphaTest: 0.5,
      roughness: 0.9,
      emissive: new THREE.Color("#ffffff"),
      emissiveMap: texture,
      emissiveIntensity: 0.22,
    });
    const uniforms = { uTime: { value: 0 }, uPhase: { value: phase } };
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${clothVertex}`)
        .replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>
           float wv = uv.x;
           float ang = uv.x * 7.0 - uTime * 4.2 + uPhase;
           objectNormal = normalize(vec3(-cos(ang) * 0.35 * wv, 0.0, 1.0));`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           transformed.z += sin(ang) * 0.035 * wv + sin(uv.y * 5.0 + uTime * 2.3) * 0.008 * wv;
           transformed.y -= wv * wv * 0.02;`,
        );
    };
    m.customProgramCacheKey = () => "banner-cloth";
    m.userData.uniforms = uniforms;
    return m;
  }, [texture, phase]);

  useFrame((_, dt) => {
    material.userData.uniforms.uTime.value += dt;
  });

  const poleHeight = 0.78;
  const w = 0.34;
  const h = 0.22;
  // Pole behind the formation, cloth streaming away from the enemy.
  const back = -0.34;
  return (
    <group rotation={[0, facing, 0]}>
      <group position={[back, 0, -0.18]}>
        <mesh castShadow position={[0, poleHeight / 2, 0]}>
          <cylinderGeometry args={[0.012, 0.014, poleHeight, 6]} />
          <meshStandardMaterial color="#4a3526" roughness={0.8} />
        </mesh>
        <mesh position={[0, poleHeight + 0.02, 0]}>
          {faction === "ashen_host" ? <coneGeometry args={[0.03, 0.08, 4]} /> : <sphereGeometry args={[0.03, 8, 6]} />}
          <meshStandardMaterial color={style.metal} metalness={0.6} roughness={0.35} />
        </mesh>
        {/* Cloth: plane in local XY, attached along its left edge to the pole, streaming backward (-x). */}
        <mesh
          castShadow
          material={material}
          position={[-w / 2, poleHeight - h / 2 - 0.03, 0]}
          rotation={[0, Math.PI, 0]}
        >
          <planeGeometry args={[w, h, 14, 4]} />
        </mesh>
      </group>
    </group>
  );
}

function makeBannerTexture(faction: FactionId, style: FactionStyle): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (faction === "free_banners") {
    // Lapis field, gold border, gold eight-pointed sun.
    ctx.fillStyle = style.bannerCloth;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = style.bannerEmblem;
    ctx.lineWidth = 12;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    ctx.fillStyle = style.secondary;
    ctx.fillRect(0, 0, 26, H); // bone hoist band
    ctx.fillStyle = style.bannerEmblem;
    const cx = W * 0.56;
    const cy = H / 2;
    ctx.beginPath();
    for (let i = 0; i < 16; i += 1) {
      const r = i % 2 === 0 ? 48 : 20;
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    // Charcoal swallowtail with a rust stripe and an ember claw-mark.
    ctx.fillStyle = style.bannerCloth;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W * 0.72, H / 2);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = style.secondary;
    ctx.fillRect(0, H * 0.78, W * 0.85, H * 0.12);
    ctx.fillRect(0, 0, 22, H);
    ctx.strokeStyle = style.bannerEmblem;
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(W * 0.24 + i * 30, H * 0.18);
      ctx.quadraticCurveTo(W * 0.34 + i * 30, H * 0.45, W * 0.26 + i * 30, H * 0.68);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeShadowTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,0.8)");
  g.addColorStop(0.6, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}
