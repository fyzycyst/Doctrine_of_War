import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { BoardLayout } from "../../game/board";
import { Particles } from "../atmosphere/Particles";
import { SkyDome } from "../atmosphere/SkyDome";
import { useDisposable } from "../dispose";
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
 * "Choose a campaign" backdrop (M1, P6): a calm establishing shot of the
 * Covenant's archipelago at dusk, one small chain of miniature islands per
 * campaign, receding toward Cinderreach, the Ashen lands, smouldering low on
 * the horizon. The camera drifts slowly across the chains (holds still under
 * reduced motion); `highlightedId` lifts one chain and dims the rest.
 *
 * Cheap: at most 3 islands per chain, no figures, low-quality island dressing
 * (water only), one far ash-land mesh with a glow shader. Mount it full-screen
 * behind the UI; `children` is the overlay slot.
 */
export interface CampaignSelectChain {
  id: string;
  /** Up to three boards; more are ignored. */
  boards: BoardLayout[];
}

export interface CampaignSelectBackdropProps {
  chains: CampaignSelectChain[];
  /** The campaign under the cursor/selection: brighter, slightly raised. */
  highlightedId?: string | null;
  frameloop?: "always" | "demand" | "never";
  /** Extra nodes inside the Canvas (lab probes). */
  inCanvas?: ReactNode;
  children?: ReactNode;
}

const ISLAND_SCALE_RADIUS = 3;
const CHAIN_GAP = 15;

/** World positions of each chain's islands: chains side by side, each a short diagonal run toward the horizon. */
export function chainLayout(chains: number, perChain: number[]): THREE.Vector3[][] {
  return Array.from({ length: chains }, (_, c) => {
    const cx = (c - (chains - 1) / 2) * CHAIN_GAP;
    return Array.from({ length: Math.min(3, perChain[c] ?? 0) }, (_, i) => new THREE.Vector3(cx + (i - 1) * 3 + (c % 2 ? 1.2 : -1.2), i * 0.6, 6 - i * 8));
  });
}

export function CampaignSelectBackdrop({ chains, highlightedId = null, frameloop = "always", inCanvas, children }: CampaignSelectBackdropProps) {
  const dpr = useCanvasDpr();
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#0d0c12" }}>
      <Canvas
        shadows="soft"
        frameloop={frameloop}
        dpr={dpr}
        camera={{ fov: 30, near: 0.1, far: 400, position: [0, 10, 26] }}
        gl={{ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
        style={{ position: "absolute", inset: 0 }}
      >
        <LookProvider skin={emberDusk} timeOfDay="dusk">
          <AtmosphereTicker />
          <SkyDome />
          <LightRig shadowRadius={34} fogOffset={42} />
          <Chains chains={chains} highlightedId={highlightedId} />
          <Cinderreach />
          <DriftCamera span={Math.max(1, chains.length - 1) * CHAIN_GAP} />
          <Particles extent={30} />
          <PostFX focusY={0.42} dof="subtle" />
          {inCanvas}
        </LookProvider>
      </Canvas>
      {children}
    </div>
  );
}

function Chains({ chains, highlightedId }: { chains: CampaignSelectChain[]; highlightedId: string | null }) {
  const { skin } = useLook();
  const layout = useMemo(() => chainLayout(chains.length, chains.map((c) => c.boards.length)), [chains]);
  const built = useMemo(
    () =>
      chains.map((chain, c) =>
        chain.boards.slice(0, 3).map((board, i) => {
          const island = buildIsland(board, skin);
          return { key: `${chain.id}-${i}`, chainId: chain.id, island, position: layout[c][i], scale: ISLAND_SCALE_RADIUS / island.radius };
        }),
      ),
    [chains, layout, skin],
  );
  useEffect(
    () => () =>
      built.flat().forEach(({ island }) => {
        island.geometry.dispose();
        island.wallGeometry?.dispose();
        island.reedGeometry?.dispose();
      }),
    [built],
  );
  return (
    <>
      {built.flat().map((b) => (
        <BackdropIsland key={b.key} island={b.island} position={b.position} scale={b.scale} lit={!highlightedId || highlightedId === b.chainId} raised={highlightedId === b.chainId} />
      ))}
    </>
  );
}

function BackdropIsland({ island, position, scale, lit, raised }: { island: IslandBuild; position: THREE.Vector3; scale: number; lit: boolean; raised: boolean }) {
  const { skin, motion } = useLook();
  const material = useDisposable(() => createIslandMaterial(skin.material), [skin.material]);
  const group = useRef<THREE.Group>(null);
  const bob = useMemo(() => mulberry32(Math.round(position.x * 100 + position.z * 7))() * Math.PI * 2, [position]);
  useFrame(({ clock }, dt) => {
    const g = group.current;
    if (!g) return;
    const dim = material.userData.fade.uDim;
    dim.value = THREE.MathUtils.lerp(dim.value, lit ? 0 : 1, Math.min(1, dt * 4));
    const lift = raised ? 0.9 : 0;
    g.position.set(position.x, THREE.MathUtils.lerp(g.position.y, position.y + lift, Math.min(1, dt * 3)) + Math.sin(clock.elapsedTime * 0.35 + bob) * 0.004 * motion, position.z);
  });
  return (
    <group ref={group} position={position} scale={scale}>
      <mesh geometry={island.geometry} material={material} castShadow receiveShadow />
      <Water island={island} />
    </group>
  );
}

/**
 * Cinderreach on the horizon: a long, low, broken band of ash-land far behind
 * the chains (no single peak: many low ridges), dotted with the small orange
 * glows of kiln-towns and a faint ember haze above them.
 */
function Cinderreach() {
  const { motion } = useLook();
  const geometry = useMemo(() => {
    const rand = mulberry32(911);
    const g = new THREE.PlaneGeometry(320, 30, 160, 12);
    g.rotateX(-Math.PI / 2);
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // Many low, uneven ridges along the whole horizon; flattened at the near edge.
      const ridges = 0.5 + 0.3 * Math.sin(x * 0.11 + 0.7) + 0.25 * Math.sin(x * 0.29 + 2.1) + 0.15 * Math.sin(x * 0.71);
      const back = THREE.MathUtils.smoothstep(z, 15, -10);
      pos.setY(i, Math.max(0, ridges) * 5.5 * back + rand() * 0.4 - 1.5);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        fog: false,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec3 vPos;
          void main() {
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec3 vPos;
          ${NOISE_GLSL}
          void main() {
            // Ash-dark, a touch of dusk on the ridge tops, thin ember seams.
            vec3 col = mix(vec3(0.025, 0.018, 0.022), vec3(0.075, 0.045, 0.045), smoothstep(-1.0, 2.5, vPos.y));
            float seam = smoothstep(0.66, 0.7, fbm(vPos.xz * vec2(0.06, 0.3) + vec2(uTime * 0.008, 0.0)));
            col += vec3(0.9, 0.3, 0.08) * seam * 0.35 * (0.8 + 0.2 * sin(uTime * 1.3 + vPos.x));
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  );
  // Kiln-towns: many small glows scattered along the band (none special).
  const kilns = useMemo(() => {
    const rand = mulberry32(57);
    return Array.from({ length: 26 }, () => ({ x: (rand() - 0.5) * 280, z: -4 - rand() * 14, s: 0.6 + rand() * 1.1, phase: rand() * 6.28 }));
  }, []);
  const kilnMesh = useRef<THREE.InstancedMesh>(null);
  const kilnMat = useDisposable(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff7a30").multiplyScalar(2.2), fog: false }), []);
  const kilnGeo = useDisposable(() => new THREE.SphereGeometry(1, 8, 6), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  // Ember haze: a soft vertical falloff (strongest just above the ridges).
  const hazeMaterial = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            float a = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.25, 1.0, vUv.y)) * (1.0 - pow(abs(vUv.x - 0.5) * 2.0, 4.0));
            gl_FragColor = vec4(vec3(1.0, 0.42, 0.16) * a * 0.22, 1.0);
          }
        `,
      }),
    [],
  );
  useFrame(({ clock }, dt) => {
    material.uniforms.uTime.value += dt * motion;
    const m = kilnMesh.current;
    if (!m) return;
    kilns.forEach((k, i) => {
      const flick = 0.85 + 0.15 * Math.sin(clock.elapsedTime * 2.1 * motion + k.phase);
      dummy.position.set(k.x, 0.9, k.z);
      dummy.scale.setScalar(0.32 * k.s * flick);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <group position={[0, -5, -72]}>
      <mesh geometry={geometry} material={material} />
      <instancedMesh ref={kilnMesh} args={[kilnGeo, kilnMat, kilns.length]} frustumCulled={false} />
      {/* A faint ember haze over the ash-land. */}
      <mesh position={[0, 7, -18]} material={hazeMaterial}>
        <planeGeometry args={[360, 22]} />
      </mesh>
    </group>
  );
}

/** A slow drift across the chains (holds still under reduced motion). */
function DriftCamera({ span }: { span: number }) {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const reduced = usePrefersReducedMotion();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const width = span + 14;
    const dist = Math.max(22, width / 2 / Math.tan(THREE.MathUtils.degToRad(15)) / Math.min(aspect, 2));
    const pan = reduced ? 0 : Math.sin(t * 0.05) * span * 0.15;
    camera.position.set(pan, dist * 0.3, 10 + dist * 0.8);
    // Look across the chains toward the horizon, so Cinderreach sits in the upper band.
    camera.lookAt(pan * 0.7, -1, -14);
  });
  return null;
}
