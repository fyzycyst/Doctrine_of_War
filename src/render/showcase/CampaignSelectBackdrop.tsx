import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { BoardLayout } from "../../game/board";
import { Particles } from "../atmosphere/Particles";
import { SkyDome } from "../atmosphere/SkyDome";
import { useDisposable } from "../dispose";
import { makeBannerTexture, makeClothMaterial } from "../figures/SquadMarkers";
import { mulberry32 } from "../hexWorld";
import { LightRig } from "../lighting/LightRig";
import { AtmosphereTicker, LookProvider, useLook } from "../look/LookContext";
import { createIslandMaterial } from "../materials";
import { usePrefersReducedMotion } from "../motion";
import { PostFX } from "../post/PostFX";
import { useCanvasDpr } from "../quality";
import { emberDusk } from "../skins";
import { NOISE_GLSL } from "../shaders/noise";
import { buildIsland, type IslandBuild } from "../terrain/buildIsland";
import { Water } from "../terrain/Water";

/**
 * "Choose a campaign" backdrop (M1, P6): an establishing shot of the
 * Covenant's archipelago at dusk, composed for a campaign list on the left
 * third. Each campaign is a small cluster of two or three miniature islands
 * joined by a faint ink trail under a pennant; the clusters sit in the centre
 * and right with clear sky between them, the highlighted one nearest and
 * largest. Far behind, Cinderreach, the Ashen lands, smoulders along the
 * horizon: broken ridges, an ember haze, kiln glows and a column or two of
 * smoke (never a single peak).
 *
 * The camera holds a low, slightly drifting view (still under reduced
 * motion). Cheap: no figures, water only on the islands, a handful of
 * transparent quads for the horizon.
 */
export interface CampaignSelectChain {
  id: string;
  /** Up to three boards; more are ignored. */
  boards: BoardLayout[];
}

export interface CampaignSelectBackdropProps {
  chains: CampaignSelectChain[];
  /** The campaign under the cursor/selection: brought nearest and largest; the rest dim. */
  highlightedId?: string | null;
  frameloop?: "always" | "demand" | "never";
  /** Extra nodes inside the Canvas (lab probes). */
  inCanvas?: ReactNode;
  children?: ReactNode;
}

/** Island radius inside a cluster (world units), before per-island variation. */
const ISLAND_R = 1.9;

/**
 * Where each cluster sits (world x, y, z, scale). Slot 0 is the focal slot:
 * nearest and largest, centre-right of the frame; the others recede to the
 * right and back, leaving the left third clear for the UI.
 */
export const CLUSTER_SLOTS: Array<[number, number, number, number]> = [
  [5, 0, 7, 1.25],
  [15.5, 1.2, -5, 1],
  [7, 2.3, -14, 0.95],
  [21, 2.8, -18, 0.9],
];

/** Island offsets within a cluster (around its slot), with a per-island size factor. */
const CLUSTER_SHAPE: Array<[number, number, number, number]> = [
  [-2.9, 0, 1.4, 1.1],
  [2.3, 0.5, -0.9, 0.85],
  [0.2, 1, -4.3, 0.95],
];

/** Which slot each chain takes: the highlighted chain gets the focal slot, the rest keep their order. */
export function clusterSlots(chainIds: string[], highlightedId: string | null): number[] {
  const focal = highlightedId && chainIds.includes(highlightedId) ? highlightedId : chainIds[0];
  let next = 1;
  return chainIds.map((id) => (id === focal ? 0 : Math.min(CLUSTER_SLOTS.length - 1, next++)));
}

export function CampaignSelectBackdrop({ chains, highlightedId = null, frameloop = "always", inCanvas, children }: CampaignSelectBackdropProps) {
  const dpr = useCanvasDpr();
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#0d0c12" }}>
      <Canvas
        shadows="soft"
        frameloop={frameloop}
        dpr={dpr}
        camera={{ fov: 36, near: 0.1, far: 400, position: [0, 5, 26] }}
        gl={{ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
        style={{ position: "absolute", inset: 0 }}
      >
        <LookProvider skin={emberDusk} timeOfDay="dusk">
          <AtmosphereTicker />
          <SkyDome />
          <LightRig shadowRadius={34} fogOffset={30} />
          <Clusters chains={chains} highlightedId={highlightedId} />
          <Cinderreach />
          <DriftCamera />
          <Particles extent={30} />
          <PostFX focusY={0.42} dof="subtle" />
          {inCanvas}
        </LookProvider>
      </Canvas>
      {children}
    </div>
  );
}

function Clusters({ chains, highlightedId }: { chains: CampaignSelectChain[]; highlightedId: string | null }) {
  const slots = clusterSlots(
    chains.map((c) => c.id),
    highlightedId,
  );
  return (
    <>
      {chains.map((chain, c) => (
        <Cluster key={chain.id} chain={chain} slot={slots[c]} lit={!highlightedId || highlightedId === chain.id} seed={c} />
      ))}
    </>
  );
}

/** One campaign: its islands, the ink trail between them, and a pennant; eases to its slot. */
function Cluster({ chain, slot, lit, seed }: { chain: CampaignSelectChain; slot: number; lit: boolean; seed: number }) {
  const { skin } = useLook();
  const group = useRef<THREE.Group>(null);
  const islands = useMemo(
    () =>
      chain.boards.slice(0, 3).map((board, i) => {
        const island = buildIsland(board, skin);
        const [x, y, z, size] = CLUSTER_SHAPE[i];
        // Mirror alternate clusters so they don't look stamped.
        const flip = seed % 2 ? -1 : 1;
        return { island, position: new THREE.Vector3(x * flip, y, z), scale: (ISLAND_R * size) / island.radius };
      }),
    [chain, skin, seed],
  );
  useEffect(
    () => () =>
      islands.forEach(({ island }) => {
        island.geometry.dispose();
        island.wallGeometry?.dispose();
        island.reedGeometry?.dispose();
      }),
    [islands],
  );
  const target = CLUSTER_SLOTS[slot];
  const goal = useMemo(() => new THREE.Vector3(target[0], target[1], target[2]), [target]);
  const init = useRef(false);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const k = init.current ? Math.min(1, dt * 2.2) : 1;
    init.current = true;
    g.position.lerp(goal, k);
    g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, target[3], k));
  });
  const peak = (island: IslandBuild) => Math.max(...island.hexes.map((h) => h.top));
  const trail = useMemo(() => islands.map(({ position, island, scale }) => position.clone().setY(position.y + peak(island) * scale + 0.25)), [islands]);
  return (
    <group ref={group}>
      {islands.map(({ island, position, scale }, i) => (
        <BackdropIsland key={i} island={island} position={position} scale={scale} lit={lit} phase={seed * 3 + i} />
      ))}
      <InkTrail points={trail} lit={lit} />
      {islands[0] && <Pennant position={[islands[0].position.x, islands[0].position.y + peak(islands[0].island) * islands[0].scale, islands[0].position.z]} lit={lit} />}
    </group>
  );
}

function BackdropIsland({ island, position, scale, lit, phase }: { island: IslandBuild; position: THREE.Vector3; scale: number; lit: boolean; phase: number }) {
  const { skin, motion } = useLook();
  const material = useDisposable(() => {
    const m = createIslandMaterial(skin.material);
    // Keep the rock underside: fade it much lower than on a battle board.
    m.userData.fade.uFadeTop.value = -2.6;
    m.userData.fade.uFadeBottom.value = -9;
    return m;
  }, [skin.material]);
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => {
    const dim = material.userData.fade.uDim;
    dim.value = THREE.MathUtils.lerp(dim.value, lit ? 0 : 0.85, Math.min(1, dt * 4));
    if (group.current) group.current.position.y = position.y + Math.sin(clock.elapsedTime * 0.35 + phase) * 0.05 * motion;
  });
  return (
    <group ref={group} position={position} scale={scale}>
      <mesh geometry={island.geometry} material={material} castShadow receiveShadow />
      <Water island={island} />
    </group>
  );
}

/** A faint dotted ink trail between a cluster's islands (arcing a little above them). */
function InkTrail({ points, lit }: { points: THREE.Vector3[]; lit: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dots = useMemo(() => {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const curve = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.9, 0)), b);
      const n = Math.max(8, Math.round(a.distanceTo(b) / 0.22));
      for (let k = 0; k <= n; k += 1) {
        const u = k / n;
        if (u > 0.22 && u < 0.78) out.push(curve.getPoint(u));
      }
    }
    return out;
  }, [points]);
  const geometry = useDisposable(() => new THREE.SphereGeometry(1, 6, 4), []);
  const material = useDisposable(() => new THREE.MeshBasicMaterial({ color: "#1c1512", transparent: true, opacity: 0.75 }), []);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const d = new THREE.Object3D();
    dots.forEach((p, i) => {
      d.position.copy(p);
      d.scale.setScalar(0.035);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [dots]);
  useFrame(() => {
    material.opacity = THREE.MathUtils.lerp(material.opacity, lit ? 0.75 : 0.35, 0.1);
  });
  if (dots.length === 0) return null;
  return <instancedMesh key={dots.length} ref={mesh} args={[geometry, material, dots.length]} frustumCulled={false} />;
}

/** A small Banners pennant on the cluster's first island. */
function Pennant({ position, lit }: { position: [number, number, number]; lit: boolean }) {
  const { skin, motion } = useLook();
  const texture = useDisposable(() => makeBannerTexture("free_banners", skin.factions.free_banners), [skin]);
  const cloth = useDisposable(() => makeClothMaterial(texture, 0.7), [texture]);
  useFrame((_, dt) => {
    cloth.userData.uniforms.uTime.value += dt * (motion < 1 ? 0.3 : 1);
    cloth.emissiveIntensity = THREE.MathUtils.lerp(cloth.emissiveIntensity, lit ? 0.35 : 0.05, 0.1);
  });
  return (
    <group position={position} scale={1.6}>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.02, 0.025, 1, 6]} />
        <meshStandardMaterial color="#4a3526" />
      </mesh>
      <mesh material={cloth} position={[0.28, 0.78, 0]}>
        <planeGeometry args={[0.55, 0.36, 14, 4]} />
      </mesh>
    </group>
  );
}

let glow: THREE.Texture | null = null;
/** Soft radial glow (made on first use, never at import time). */
function glowTexture(): THREE.Texture {
  if (glow) return glow;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(c);
  return glow;
}

/** Jagged ridge profile: sharp broken crests from folded sines, many of them, no dominant peak. */
export function ridgeProfile(width: number, segments: number, seed: number, height: number) {
  const rand = mulberry32(seed);
  const crests = Array.from({ length: 9 }, () => ({ f: 0.04 + rand() * 0.25, p: rand() * 10, a: 0.3 + rand() * 0.7 }));
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -3);
  for (let i = 0; i <= segments; i += 1) {
    const x = -width / 2 + (i / segments) * width;
    let y = 0;
    for (const c of crests) y += c.a * (1 - Math.abs(Math.sin(x * c.f + c.p)));
    y = (y / crests.length) * height * (0.75 + rand() * 0.25);
    shape.lineTo(x, y);
  }
  shape.lineTo(width / 2, -3);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

/**
 * Cinderreach: three layers of broken ash ridges (darker near, hazier far),
 * a warm ember haze rising behind them, kiln glows as soft orange smudges at
 * different depths and sizes, and two thin columns of smoke.
 */
function Cinderreach() {
  const { motion } = useLook();
  const layers = useMemo(
    () => [
      { z: -96, y: -7.5, h: 3.2, seed: 11, color: "#1a0f12" },
      { z: -108, y: -7, h: 3.8, seed: 23, color: "#2a171c" },
      { z: -120, y: -6.4, h: 4.4, seed: 37, color: "#3c2329" },
    ],
    [],
  );
  const ridgeGeometries = useMemo(() => layers.map((l) => ridgeProfile(320, 260, l.seed, l.h)), [layers]);
  useEffect(() => () => ridgeGeometries.forEach((g) => g.dispose()), [ridgeGeometries]);
  // Solid at the crests, dissolving into the haze below so the land has no hard bottom edge.
  const ridgeMaterials = useMemo(
    () =>
      layers.map(
        (l) =>
          new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            fog: false,
            uniforms: { uColor: { value: new THREE.Color(l.color) } },
            vertexShader: /* glsl */ `
              varying float vY;
              void main() {
                vY = position.y;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `,
            fragmentShader: /* glsl */ `
              uniform vec3 uColor;
              varying float vY;
              void main() {
                gl_FragColor = vec4(uColor, smoothstep(-3.0, 0.6, vY));
                #include <colorspace_fragment>
              }
            `,
          }),
      ),
    [layers],
  );
  useEffect(() => () => ridgeMaterials.forEach((m) => m.dispose()), [ridgeMaterials]);
  const hazeMaterial = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vUv;
          ${NOISE_GLSL}
          void main() {
            // Rising ember haze: strongest just above the ridges, torn by slow noise.
            float n = fbm(vec2(vUv.x * 9.0, vUv.y * 2.5 - uTime * 0.03));
            // clamp: interpolated uv can step just past 1, and pow() of a negative is NaN,
            // which the bloom pass spreads into a black frame.
            float a = smoothstep(0.0, 0.18, vUv.y) * pow(clamp(1.0 - vUv.y, 0.0, 1.0), 2.2) * (0.55 + 0.6 * n);
            a *= 1.0 - pow(abs(vUv.x - 0.5) * 2.0, 6.0);
            gl_FragColor = vec4(vec3(1.0, 0.38, 0.12) * a * 0.5, 1.0);
          }
        `,
      }),
    [],
  );
  const smokeMaterial = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vUv;
          ${NOISE_GLSL}
          void main() {
            // A thin column that widens, leans and thins as it rises; ember-lit at the foot.
            float y = vUv.y;
            float lean = y * y * 0.35;
            float w = 0.06 + y * 0.28;
            float x = vUv.x - 0.5 - lean + (fbm(vec2(y * 3.0 - uTime * 0.05, 1.7)) - 0.5) * 0.25 * y;
            float body = smoothstep(w, w * 0.2, abs(x));
            float n = fbm(vec2(vUv.x * 6.0, y * 5.0 - uTime * 0.12));
            float a = body * (0.4 + 0.6 * n) * smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.5, 1.0, y)) * 0.4;
            vec3 col = mix(vec3(0.45, 0.17, 0.07), vec3(0.09, 0.07, 0.08), smoothstep(0.0, 0.3, y));
            gl_FragColor = vec4(col, a);
          }
        `,
      }),
    [],
  );
  // Kiln glows: soft smudges at several depths and sizes, scattered along the band.
  const kilns = useMemo(() => {
    const rand = mulberry32(57);
    return Array.from({ length: 18 }, () => {
      const layer = Math.floor(rand() * 3);
      return { x: (rand() - 0.5) * 260, layer, s: (1.4 + rand() * 3.4) * (1 - layer * 0.2), phase: rand() * 6.28, warm: rand() };
    });
  }, []);
  const glowMap = useMemo(() => glowTexture(), []);
  const kilnRefs = useRef<Array<THREE.Sprite | null>>([]);
  useFrame(({ clock }, dt) => {
    hazeMaterial.uniforms.uTime.value += dt * motion;
    smokeMaterial.uniforms.uTime.value += dt * motion;
    kilns.forEach((k, i) => {
      const s = kilnRefs.current[i];
      if (!s) return;
      const flick = 0.85 + 0.15 * Math.sin(clock.elapsedTime * 1.6 * motion + k.phase);
      s.scale.set(k.s * 1.6 * flick, k.s * flick, 1);
    });
  });
  return (
    <group>
      <mesh position={[0, 3, -128]} material={hazeMaterial}>
        <planeGeometry args={[380, 30]} />
      </mesh>
      {[
        [-46, -110],
        [64, -116],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 4 + i * 1.5, z]} material={smokeMaterial}>
          <planeGeometry args={[12, 22]} />
        </mesh>
      ))}
      {layers.map((l, i) => (
        <mesh key={l.seed} geometry={ridgeGeometries[i]} material={ridgeMaterials[i]} position={[0, l.y, l.z]} renderOrder={-2 - i} />
      ))}
      {kilns.map((k, i) => (
        <sprite
          key={i}
          ref={(el) => void (kilnRefs.current[i] = el)}
          position={[k.x, layers[k.layer].y + 0.4 + (k.warm - 0.5) * 0.8, layers[k.layer].z + 1]}
          scale={[k.s * 1.6, k.s, 1]}
        >
          <spriteMaterial
            map={glowMap}
            color={new THREE.Color(k.warm > 0.5 ? "#ff7a2e" : "#ff5a22").multiplyScalar(0.35 + 0.3 * (1 - k.layer / 2))}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            fog={false}
          />
        </sprite>
      ))}
    </group>
  );
}

/** A low, cinematic view across the clusters toward the horizon, drifting slightly (still under reduced motion). */
function DriftCamera() {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const reduced = usePrefersReducedMotion();
  useFrame(({ clock }) => {
    const t = reduced ? 0 : clock.elapsedTime;
    // Narrow screens step back a little so the right-hand clusters stay in frame.
    const back = Math.max(0, 1.6 - aspect) * 10;
    camera.position.set(-1 + Math.sin(t * 0.04) * 1.4, 5.2 + Math.sin(t * 0.03) * 0.3, 27 + back);
    camera.lookAt(5 + Math.sin(t * 0.04) * 0.8, 0.6, -10);
  });
  return null;
}
