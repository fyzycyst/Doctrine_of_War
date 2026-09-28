import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useAppStore } from "../../app/store";
import type { FactionId } from "../../game/engine/types";
import { useLook } from "../look/LookContext";
import type { FactionStyle } from "../skins/types";
import { cohesionArc } from "../squadLayout";
import type { SquadAnimator } from "./squadAnimation";
import type { PlacedSquad } from "./types";
import { useDisposable } from "../dispose";

/**
 * Per-squad dressing shared by both figure approaches (tech plan D7): a faction
 * banner with cloth waving in the vertex shader, a cohesion ring whose gap shows
 * lost cohesion, a soft contact shadow, a renown crest, and the selection/hover
 * highlight. Everything follows the animator's squad pose (march, rout, rally…).
 */
export function SquadMarkers({ placed, animator, waterLevel = -Infinity }: { placed: PlacedSquad[]; animator: SquadAnimator; waterLevel?: number }) {
  const { skin } = useLook();
  const clothTextures = useMemo(
    () => ({
      free_banners: makeBannerTexture("free_banners", skin.factions.free_banners),
      ashen_host: makeBannerTexture("ashen_host", skin.factions.ashen_host),
    }),
    [skin],
  );
  useEffect(() => () => Object.values(clothTextures).forEach((t) => t.dispose()), [clothTextures]);
  const shadowTexture = useDisposable(() => makeShadowTexture(), []);
  const columnTexture = useDisposable(() => makeColumnTexture(), []);

  return (
    <>
      {placed.map((p, i) => (
        <SquadMarker
          key={p.squad.id}
          placed={p}
          animator={animator}
          texture={p.squad.kind === "column" ? columnTexture : clothTextures[p.squad.faction]}
          shadow={shadowTexture}
          phase={i * 1.7}
          waterLevel={waterLevel}
        />
      ))}
    </>
  );
}

function SquadMarker({
  placed,
  animator,
  texture,
  shadow,
  phase,
  waterLevel,
}: {
  placed: PlacedSquad;
  animator: SquadAnimator;
  texture: THREE.Texture;
  /** Rings and shadows float on the water in fords instead of sinking under it. */
  waterLevel: number;
  shadow: THREE.Texture;
  phase: number;
}) {
  const { skin, reducedMotion, motion } = useLook();
  const { squad } = placed;
  const style = skin.factions[squad.faction];
  const selected = useAppStore((s) => s.selectedSquadId === squad.id);
  const hovered = useAppStore((s) => s.hoveredSquadId === squad.id);

  const root = useRef<THREE.Group>(null);
  const yawGroup = useRef<THREE.Group>(null);
  const bannerGroup = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const crest = useRef<THREE.Group>(null);
  const ground = useRef<THREE.Mesh>(null);
  const ringLift = useRef<THREE.Group>(null);
  const clothOpen = useRef<THREE.Group>(null);

  const ghost = !!squad.lastKnown;
  // The refugee Column: a small pale banner and a bone-white ring.
  const column = squad.kind === "column";
  const { lit } = cohesionArc(squad.cohesion);
  const thetaLength = Math.max(0.001, lit * Math.PI * 2);
  // Rings are kept below the figures in brightness (look-lock #7).
  const ringBase = useMemo(
    () =>
      ghost
        ? new THREE.Color("#4e586e")
        : column
          ? new THREE.Color("#e8dcc4").multiplyScalar(0.95)
          : new THREE.Color(style.glow).multiplyScalar(1.05),
    [style.glow, ghost],
  );
  const ringMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: ringBase.clone(), transparent: true, opacity: 0.62, depthWrite: false }),
    [ringBase],
  );
  const ringBackMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: style.glow, transparent: true, opacity: 0.12, depthWrite: false }),
    [style.glow],
  );
  const haloMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff4d6").multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false }),
    [],
  );
  const cloth = useMemo(() => makeClothMaterial(texture, phase, ghost), [texture, phase, ghost]);
  useEffect(() => () => [ringMat, ringBackMat, haloMat, cloth].forEach((m) => m.dispose()), [ringMat, ringBackMat, haloMat, cloth]);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const pose = animator.squadPose(squad.id);
    const a = pose?.anchor;
    root.current?.position.set(a?.x ?? placed.x, a?.y ?? placed.y, a?.z ?? placed.z);
    const lift = Math.max(0, waterLevel - (a?.y ?? placed.y));
    if (ground.current) ground.current.position.y = 0.004 + lift;
    if (ringLift.current) ringLift.current.position.y = 0.012 + lift;
    if (yawGroup.current) yawGroup.current.rotation.y = pose?.facing ?? squad.facing;

    const flash = pose?.ringFlash ?? 0;
    const fade = pose?.ringFade ?? 1;
    const emphasis = selected ? 0.9 : hovered ? 0.4 : 0;
    ringMat.color.copy(ringBase).multiplyScalar(Math.max(0.2, 1 + flash + emphasis));
    ringMat.opacity = (ghost ? 0.85 : 0.62) * fade;
    ringBackMat.opacity = ghost ? 0 : 0.12 * fade;
    if (halo.current) {
      const pulse = reducedMotion ? 0.6 : 0.5 + 0.5 * Math.sin(t * 4);
      haloMat.opacity = selected ? 0.35 + 0.35 * pulse : hovered ? 0.18 : 0;
      halo.current.scale.setScalar(1 + (selected ? 0.03 * pulse : 0));
    }

    const g = bannerGroup.current;
    if (g) {
      const bf = pose?.bannerFade ?? 1;
      g.position.y = (pose?.bannerLift ?? 0) - (1 - bf) * 0.25;
      g.rotation.z = pose?.bannerTilt ?? 0;
      g.scale.setScalar(Math.max(0.001, bf));
      g.visible = bf > 0.01;
    }
    cloth.userData.uniforms.uTime.value += dt * (reducedMotion ? 0.3 : 1);
    cloth.emissiveIntensity = 0.22 + (pose?.bannerFlare ?? 0);
    cloth.userData.uniforms.uColorMix.value = pose?.bannerColor ?? 1;
    if (clothOpen.current) clothOpen.current.scale.x = Math.max(0.05, pose?.bannerOpen ?? 1);
    // Ghost banners breathe with their silhouettes.
    if (ghost) cloth.opacity = GHOST_CLOTH_OPACITY * (0.75 + 0.25 * Math.sin(t * 0.9 * motion + phase));
    if (crest.current) crest.current.rotation.y = t * 0.8 * motion;
  });

  const poleHeight = column ? 0.6 : 0.78;
  const w = column ? 0.24 : 0.34;
  const h = column ? 0.16 : 0.22;
  return (
    <group ref={root} position={[placed.x, placed.y, placed.z]}>
      <mesh ref={ground} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} renderOrder={1}>
        <circleGeometry args={[0.62, 24]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} opacity={ghost ? 0.22 : 0.55} color="#000000" />
      </mesh>
      <group ref={yawGroup} rotation={[0, squad.facing, 0]}>
        {/* Cohesion ring: arc centred on the facing, gap at the rear. */}
        <group ref={ringLift} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <mesh renderOrder={2} material={ringBackMat}>
            <ringGeometry args={[0.55, 0.59, 64, 1]} />
          </mesh>
          {ghost ? (
            // Last-known position: a dashed grey ring (no cohesion reading).
            <mesh renderOrder={6} material={ringMat} geometry={DASHED_RING} />
          ) : (
            <mesh renderOrder={2} material={ringMat}>
              <ringGeometry args={[0.55, 0.59, 64, 1, -thetaLength / 2, thetaLength]} />
            </mesh>
          )}
          <mesh ref={halo} renderOrder={2} material={haloMat}>
            <ringGeometry args={[0.62, 0.66, 64, 1]} />
          </mesh>
        </group>
        {/* Banner: pole behind the formation, cloth streaming away from the enemy. */}
        <group position={[-0.34, 0, -0.18]}>
          <group ref={bannerGroup}>
            <mesh castShadow={!ghost} position={[0, poleHeight / 2, 0]} renderOrder={ghost ? 6 : 0}>
              <cylinderGeometry args={[0.012, 0.014, poleHeight, 6]} />
              {ghost ? (
                <meshStandardMaterial color="#26262b" roughness={0.9} transparent opacity={0.55} />
              ) : (
                <meshStandardMaterial color="#4a3526" roughness={0.8} />
              )}
            </mesh>
            <mesh position={[0, poleHeight + 0.02, 0]} renderOrder={ghost ? 6 : 0}>
              {squad.faction === "ashen_host" ? <coneGeometry args={[0.03, 0.08, 4]} /> : <sphereGeometry args={[0.03, 8, 6]} />}
              {ghost ? (
                <meshStandardMaterial color="#303036" roughness={0.6} transparent opacity={0.55} />
              ) : (
                <meshStandardMaterial color={style.trim} metalness={0.6} roughness={0.35} />
              )}
            </mesh>
            {/* Scaled about the pole so the cloth can furl and snap open (reveal). */}
            <group ref={clothOpen}>
              <mesh castShadow={!ghost} renderOrder={ghost ? 6 : 0} material={cloth} position={[-w / 2, poleHeight - h / 2 - 0.03, 0]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[w, h, 14, 4]} />
              </mesh>
            </group>
            {squad.renowned && !ghost && (
              <group ref={crest} position={[0, poleHeight + 0.13, 0]}>
                <mesh>
                  <torusGeometry args={[0.055, 0.012, 6, 16]} />
                  <meshStandardMaterial color={style.trim} emissive={style.trim} emissiveIntensity={0.9} metalness={0.7} roughness={0.3} />
                </mesh>
                <mesh scale={[0.035, 0.05, 0.035]}>
                  <octahedronGeometry args={[1, 0]} />
                  <meshStandardMaterial color="#fff0c0" emissive="#ffd27a" emissiveIntensity={1.4} />
                </mesh>
              </group>
            )}
          </group>
        </group>
      </group>
    </group>
  );
}

const clothVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
`;

const GHOST_CLOTH_OPACITY = 0.7;

const DASHED_RING = (() => {
  const dashes = 14;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < dashes; i += 1) {
    const len = ((Math.PI * 2) / dashes) * 0.55;
    parts.push(new THREE.RingGeometry(0.55, 0.585, 6, 1, (i / dashes) * Math.PI * 2, len));
  }
  return mergeGeometries(parts);
})();

export function makeClothMaterial(texture: THREE.Texture, phase: number, ghost = false) {
  // A last-known squad's banner is a colourless, tattered, translucent rag:
  // no heraldry to read.
  const m = new THREE.MeshStandardMaterial({
    map: ghost ? null : texture,
    alphaMap: null,
    color: ghost ? "#3a3b42" : "#ffffff",
    transparent: ghost,
    opacity: ghost ? GHOST_CLOTH_OPACITY : 1,
    side: THREE.DoubleSide,
    alphaTest: ghost ? 0 : 0.5,
    roughness: 0.9,
    emissive: new THREE.Color(ghost ? "#000000" : "#ffffff"),
    emissiveMap: ghost ? null : texture,
    emissiveIntensity: 0.22,
  });
  const uniforms = { uTime: { value: 0 }, uPhase: { value: phase }, uColorMix: { value: 1 } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${clothVertex}\nvarying vec2 vClothUv;`)
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvClothUv = uv;")
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
    if (!ghost) {
      // Reveal: the heraldry's colour comes back as the banner snaps open.
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uColorMix;")
        .replace(
          "#include <opaque_fragment>",
          "outgoingLight = mix(vec3(dot(outgoingLight, vec3(0.3, 0.59, 0.11))) * 0.35, outgoingLight, uColorMix);\n#include <opaque_fragment>",
        );
    }
    if (ghost) {
      // Tattered: ragged, frayed strips torn from the fly end.
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vClothUv;")
        .replace(
          "#include <clipping_planes_fragment>",
          `#include <clipping_planes_fragment>
          float strip = fract(sin(floor(vClothUv.y * 7.0) * 91.7 + 3.1) * 437.58);
          float fray = fract(sin(floor(vClothUv.y * 23.0) * 57.3 + 1.7) * 311.9);
          if (vClothUv.x > 0.5 + 0.38 * strip + 0.1 * fray) discard;`,
        );
    }
  };
  m.customProgramCacheKey = () => (ghost ? "banner-cloth-ghost" : "banner-cloth");
  m.userData.uniforms = uniforms;
  return m;
}

/** The Column's pale banner: undyed linen with a small lantern mark. */
function makeColumnTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#e6dcc6";
  ctx.fillRect(0, 0, 192, 128);
  ctx.fillStyle = "#cfc2a4";
  ctx.fillRect(0, 0, 18, 128);
  // Lantern: a small hooded frame with a warm heart.
  ctx.strokeStyle = "#6a5a44";
  ctx.lineWidth = 6;
  ctx.strokeRect(84, 40, 34, 44);
  ctx.beginPath();
  ctx.moveTo(84, 40);
  ctx.lineTo(101, 24);
  ctx.lineTo(118, 40);
  ctx.stroke();
  ctx.fillStyle = "#e0a050";
  ctx.fillRect(92, 50, 18, 24);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function makeBannerTexture(faction: FactionId, style: FactionStyle): THREE.Texture {
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
