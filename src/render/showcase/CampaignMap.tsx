import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as THREE from "three";
import { useCaptureStore } from "../../app/captureStore";
import { useAppStore } from "../../app/store";
import type { BoardLayout } from "../../game/board";
import { Particles } from "../atmosphere/Particles";
import { SkyDome } from "../atmosphere/SkyDome";
import { makeBannerTexture, makeClothMaterial } from "../figures/SquadMarkers";
import { LightRig } from "../lighting/LightRig";
import { AtmosphereTicker, LookProvider, useLook } from "../look/LookContext";
import { createIslandMaterial } from "../materials";
import { usePrefersReducedMotion } from "../motion";
import { PostFX } from "../post/PostFX";
import { canvasDpr } from "../quality";
import { emberDusk } from "../skins";
import type { TimeOfDay } from "../skins/types";
import { buildIsland, type IslandBuild } from "../terrain/buildIsland";
import { Water } from "../terrain/Water";
import { placeholderBoard, type PlaceholderKind } from "./placeholderBoards";

/**
 * Campaign map (T09/T13): the war as an archipelago of small floating islands in
 * a dusk sky, one per battle, joined by a dotted march path. Each island is a
 * miniature of the battle's board (`board`, or a placeholder until the scenario
 * exists). Status styles: locked (misty, dim), current (glowing, banner, lit
 * braziers), won (Banner flag), stalemate (half-lit), lost (ashen, Host flag).
 * Hover shows the name as an HTML label anchored in 3D; clicking a non-locked
 * island calls `onSelect`. The camera pans gently along the path.
 */
export type CampaignIslandStatus = "locked" | "current" | "won" | "stalemate" | "lost";

export interface CampaignMapBattle {
  id: string;
  title: string;
  timeOfDay: TimeOfDay;
  status: CampaignIslandStatus;
  /** The battle's board; omitted → a placeholder island of this kind. */
  board?: BoardLayout;
  placeholder?: PlaceholderKind;
}

export interface CampaignMapProps {
  battles: CampaignMapBattle[];
  onSelect?: (battleId: string) => void;
  /** Extra nodes rendered inside the Canvas (lab probes, frame stepping). */
  inCanvas?: ReactNode;
  frameloop?: "always" | "demand" | "never";
  /** Overlay content (buttons, briefing), hidden in capture mode. */
  children?: ReactNode;
}

const STATUS_LABEL: Record<CampaignIslandStatus, string> = {
  locked: "Not yet reached",
  current: "Next battle",
  won: "Victory",
  stalemate: "Held to a stalemate",
  lost: "Lost to the Host",
};

const TIME_LABEL: Record<TimeOfDay, string> = {
  dusk: "Dusk",
  nightFires: "Night, by firelight",
  rainGrey: "Rain",
  predawn: "Before dawn",
  sunrise: "Sunrise",
};

/** Target on-screen radius of every miniature, whatever its board size. */
const ISLAND_RADIUS = 2.7;

/** World placement of island i: a rising S-curve from front-left to back-right. */
export function islandPlacement(i: number, n: number): THREE.Vector3 {
  const t = n <= 1 ? 0.5 : i / (n - 1);
  const x = (t - 0.5) * 6.6 * Math.max(1, n - 1);
  const z = Math.sin(t * Math.PI * 1.6) * 2.2 - t * 2.5;
  const y = Math.sin(t * Math.PI) * 0.8 + t * 0.6;
  return new THREE.Vector3(x, y, z);
}

export function CampaignMap({ battles, onSelect, inCanvas, frameloop = "always", children }: CampaignMapProps) {
  const quality = useAppStore((s) => s.quality);
  const captureMode = useCaptureStore((s) => s.captureMode);
  const [hovered, setHovered] = useState<string | null>(null);
  // 3D label anchors (written by the islands) and their DOM labels (positioned per frame).
  const anchors = useRef(new Map<string, THREE.Vector3>());
  const labelEls = useRef(new Map<string, HTMLDivElement>());
  const labelled = captureMode ? [] : battles.filter((b) => b.id === hovered || b.status === "current");
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#0d0c12" }}>
      <Canvas
        shadows="soft"
        frameloop={frameloop}
        dpr={canvasDpr(quality)}
        camera={{ fov: 32, near: 0.1, far: 300, position: [0, 12, 20] }}
        gl={{ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
        style={{ position: "absolute", inset: 0 }}
      >
        <LookProvider skin={emberDusk} timeOfDay="dusk">
          <AtmosphereTicker />
          <SkyDome />
          <LightRig shadowRadius={22} />
          <Archipelago battles={battles} onSelect={onSelect} hovered={hovered} setHovered={setHovered} anchors={anchors.current} />
          <LabelProjector anchors={anchors.current} labels={labelEls.current} />
          <Particles extent={18} />
          <PostFX focusY={0.5} />
          {inCanvas}
        </LookProvider>
      </Canvas>
      {labelled.map((b) => (
        <div
          key={b.id}
          ref={(el) => {
            if (el) labelEls.current.set(b.id, el);
            else labelEls.current.delete(b.id);
          }}
          style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 5, visibility: "hidden" }}
        >
          <div style={labelStyle(b.status)}>
            <div style={{ fontFamily: "Cinzel, Georgia, serif", fontSize: 15, letterSpacing: "0.08em" }}>{b.title}</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>
              {STATUS_LABEL[b.status]} · {TIME_LABEL[b.timeOfDay]}
            </div>
          </div>
        </div>
      ))}
      {!captureMode && children}
    </div>
  );
}

/** Projects each island's label anchor to the screen and moves its DOM label there. */
function LabelProjector({ anchors, labels }: { anchors: Map<string, THREE.Vector3>; labels: Map<string, HTMLDivElement> }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    for (const [id, el] of labels) {
      const a = anchors.get(id);
      if (!a) continue;
      v.copy(a).project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.style.visibility = v.z < 1 ? "visible" : "hidden";
    }
  });
  return null;
}

function Archipelago({
  battles,
  onSelect,
  hovered,
  setHovered,
  anchors,
}: {
  battles: CampaignMapBattle[];
  onSelect?: (id: string) => void;
  hovered: string | null;
  setHovered: (id: string | null) => void;
  anchors: Map<string, THREE.Vector3>;
}) {
  const { skin } = useLook();
  const reduced = usePrefersReducedMotion();

  const islands = useMemo(
    () =>
      battles.map((b, i) => {
        const board = b.board ?? placeholderBoard(b.placeholder ?? (i % 2 === 0 ? "saltmarsh" : "holdForDawn"));
        const island = buildIsland(board, skin);
        return { battle: b, island, position: islandPlacement(i, battles.length), scale: ISLAND_RADIUS / island.radius };
      }),
    [battles, skin],
  );
  useEffect(() => () => islands.forEach((i) => i.island.geometry.dispose()), [islands]);

  const current = Math.max(
    0,
    battles.findIndex((b) => b.status === "current"),
  );

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  return (
    <>
      <MapCamera points={islands.map((i) => i.position)} focus={current} reduced={reduced} />
      <MarchPath points={islands.map((i) => i.position)} reached={current} />
      {islands.map(({ battle, island, position, scale }) => (
        <MiniIsland
          key={battle.id}
          battle={battle}
          island={island}
          position={position}
          scale={scale}
          hovered={hovered === battle.id}
          anchor={anchors}
          onHover={(on) => setHovered(on ? battle.id : null)}
          onSelect={() => battle.status !== "locked" && onSelect?.(battle.id)}
        />
      ))}
    </>
  );
}

/**
 * Frames the whole archipelago and pans gently along it (a slow drift biased
 * toward the current battle). Reduced motion holds still.
 */
function MapCamera({ points, focus, reduced }: { points: THREE.Vector3[]; focus: number; reduced: boolean }) {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const center = useMemo(() => points.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / points.length), [points]);
  const span = useMemo(() => Math.max(8, ...points.map((p) => p.distanceTo(center) * 2)), [points, center]);
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    const bias = points[focus] ? points[focus].clone().sub(center).multiplyScalar(0.1) : new THREE.Vector3();
    const pan = reduced ? 0 : Math.sin(clock.elapsedTime * 0.07) * span * 0.06;
    target.copy(center).add(bias).add(new THREE.Vector3(pan, 0, 0));
    // Fit the span (plus an island on each end) horizontally for this aspect.
    const fov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov);
    const width = span + ISLAND_RADIUS * 3;
    const dist = width / 2 / Math.tan(fov / 2) / Math.min(aspect, 2);
    camera.position.set(target.x + dist * 0.06, target.y + dist * 0.55, target.z + dist * 0.84);
    // Aim above the islands so they sit in the middle band, not the top.
    camera.lookAt(target.x, target.y + dist * 0.08, target.z);
  });
  return null;
}

/** A dotted march line between islands: gold up to the current battle, grey after. */
function MarchPath({ points, reached }: { points: THREE.Vector3[]; reached: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dots = useMemo(() => {
    const out: Array<{ p: THREE.Vector3; seg: number; u: number }> = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i].clone().add(new THREE.Vector3(0, 0.55, 0));
      const b = points[i + 1].clone().add(new THREE.Vector3(0, 0.55, 0));
      const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 1.2, 0));
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      // Leave a gap near each island so the line reads as a road between them.
      const n = Math.max(6, Math.round(a.distanceTo(b) / 0.42));
      for (let k = 0; k <= n; k += 1) {
        const u = k / n;
        if (u > 0.27 && u < 0.73) out.push({ p: curve.getPoint(u), seg: i, u });
      }
    }
    return out;
  }, [points]);
  const gold = useMemo(() => new THREE.Color("#ffcf6e").multiplyScalar(2.2), []);
  const grey = useMemo(() => new THREE.Color("#8a8a96").multiplyScalar(0.7), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    dots.forEach((d, i) => m.setColorAt(i, d.seg < reached ? gold : grey));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [dots, reached, gold, grey]);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    dots.forEach((d, i) => {
      // A slow ripple marches along the traversed road.
      const pulse = d.seg < reached ? 1 + 0.35 * Math.max(0, Math.sin(clock.elapsedTime * 2.2 - (d.seg + d.u) * 6)) : 1;
      dummy.position.copy(d.p);
      dummy.scale.setScalar(0.07 * pulse);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, Math.max(1, dots.length)]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial toneMapped />
    </instancedMesh>
  );
}

function MiniIsland({
  battle,
  island,
  position,
  scale,
  hovered,
  anchor,
  onHover,
  onSelect,
}: {
  battle: CampaignMapBattle;
  island: IslandBuild;
  position: THREE.Vector3;
  scale: number;
  hovered: boolean;
  anchor: Map<string, THREE.Vector3>;
  onHover: (on: boolean) => void;
  onSelect: () => void;
}) {
  const { skin } = useLook();
  const status = battle.status;
  const material = useMemo(() => {
    const m = createIslandMaterial(skin.material);
    m.userData.fade.uDim.value = status === "locked" ? 0.85 : status === "stalemate" ? 0.45 : 0;
    m.userData.fade.uAsh.value = status === "lost" ? 0.9 : 0;
    return m;
  }, [skin.material, status]);
  useEffect(() => () => material.dispose(), [material]);

  const group = useRef<THREE.Group>(null);
  const bob = useMemo(() => Math.random() * Math.PI * 2, []);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.position.set(position.x, position.y + Math.sin(t * 0.4 + bob) * 0.08, position.z);
    const target = hovered && status !== "locked" ? 1.06 : 1;
    const s = THREE.MathUtils.lerp(g.scale.x / scale, target, 0.12) * scale;
    g.scale.setScalar(s);
    // Label anchor: above the island's flag.
    const a = anchor.get(battle.id) ?? new THREE.Vector3();
    anchor.set(battle.id, a.set(0, labelHeight, 0).applyMatrix4(g.matrixWorld));
  });

  const labelHeight = Math.max(...island.hexes.map((h) => h.top)) + island.radius * 0.95;
  return (
    <group ref={group} position={position} scale={scale}>
      <mesh
        geometry={island.geometry}
        material={material}
        castShadow
        receiveShadow
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(true);
        }}
        onPointerOut={() => onHover(false)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />
      {status !== "locked" && <Water island={island} />}
      <StatusDressing status={status} island={island} />
    </group>
  );
}

const labelStyle = (status: CampaignIslandStatus): CSSProperties => ({
  whiteSpace: "nowrap",
  padding: "5px 10px",
  borderRadius: 4,
  background: "rgba(20, 16, 22, 0.8)",
  border: `1px solid ${status === "current" ? "rgba(255, 207, 110, 0.85)" : "rgba(212, 166, 74, 0.45)"}`,
  color: "#efe3c8",
  font: "13px/1.35 'Alegreya Sans', system-ui, sans-serif",
  textAlign: "center",
  boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
});

/** Flags, braziers, glow, mist and ash per status (in island-local units). */
function StatusDressing({ status, island }: { status: CampaignIslandStatus; island: IslandBuild }) {
  const r = island.radius;
  const peak = Math.max(...island.hexes.filter((h) => h.kind === "board").map((h) => h.top));
  return (
    <>
      {(status === "current" || status === "won" || status === "stalemate") && (
        <Flag faction="free_banners" height={status === "stalemate" ? 1.3 : 2.4} position={[0, peak, 0]} scale={r / 5} />
      )}
      {status === "lost" && <Flag faction="ashen_host" height={2.4} position={[0, peak, 0]} scale={r / 5} />}
      {status === "current" && <CurrentGlow radius={r} />}
      {status === "stalemate" && <Braziers radius={r} count={1} />}
      {status === "locked" && <MistVeil radius={r} />}
      {status === "lost" && <MistVeil radius={r} ash />}
    </>
  );
}

function Flag({
  faction,
  height,
  position,
  scale,
}: {
  faction: "free_banners" | "ashen_host";
  height: number;
  position: [number, number, number];
  scale: number;
}) {
  const { skin } = useLook();
  const texture = useMemo(() => makeBannerTexture(faction, skin.factions[faction]), [faction, skin]);
  const cloth = useMemo(() => makeClothMaterial(texture, 1.3), [texture]);
  useEffect(() => () => {
    texture.dispose();
    cloth.dispose();
  }, [texture, cloth]);
  useFrame((_, dt) => {
    cloth.userData.uniforms.uTime.value += dt;
  });
  const s = 3.2 * scale;
  return (
    <group position={position} scale={s}>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.02, 0.025, 1, 6]} />
        <meshStandardMaterial color="#4a3526" />
      </mesh>
      <mesh material={cloth} position={[0.28, 1 - 0.2 - (2.4 - height) * 0.18, 0]}>
        <planeGeometry args={[0.55, 0.36, 14, 4]} />
      </mesh>
    </group>
  );
}

let glowTexture: THREE.Texture | null = null;
/** Soft radial glow texture, created on first use (never at import time). */
function getGlowTexture(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

/** The next battle glows: warm light, a soft halo beneath the island and lit braziers. */
function CurrentGlow({ radius }: { radius: number }) {
  const light = useRef<THREE.PointLight>(null);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (light.current) light.current.intensity = 9 + Math.sin(t * 3.1) * 1.5;
    if (halo.current) halo.current.opacity = 0.35 + 0.15 * Math.sin(t * 1.6);
  });
  return (
    <>
      <pointLight ref={light} position={[0, 2.5, 0]} color="#ffb060" distance={radius * 3} decay={1.2} intensity={9} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]} renderOrder={-1}>
        <circleGeometry args={[radius * 1.9, 48]} />
        <meshBasicMaterial
          ref={halo}
          map={getGlowTexture()}
          color={new THREE.Color("#ffb060").multiplyScalar(1.4)}
          transparent
          opacity={0.4}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <Braziers radius={radius} count={3} />
    </>
  );
}

function Braziers({ radius, count }: { radius: number; count: number }) {
  const flame = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff8a3d").multiplyScalar(6) }), []);
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    group.current?.children.forEach((c, i) => c.scale.set(1, 0.8 + 0.35 * Math.sin(clock.elapsedTime * 9 + i * 2), 1));
  });
  return (
    <group ref={group}>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + 0.6;
        return (
          <mesh key={i} material={flame} position={[Math.cos(a) * radius * 0.55, 0.55, Math.sin(a) * radius * 0.55]}>
            <coneGeometry args={[0.18, 0.55, 5]} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Locked: soft mist billboards hugging the island. Lost: drifting ash-smoke. */
function MistVeil({ radius, ash = false }: { radius: number; ash?: boolean }) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);
  const puffs = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        a: (i / 9) * Math.PI * 2,
        r: radius * (0.55 + (i % 3) * 0.2),
        y: 0.6 + (i % 4) * 0.35,
        s: radius * (0.9 + (i % 2) * 0.4),
      })),
    [radius],
  );
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.y = clock.elapsedTime * (ash ? 0.05 : 0.025);
  });
  return (
    <group ref={group}>
      {puffs.map((p, i) => (
        <sprite key={i} position={[Math.cos(p.a) * p.r, p.y, Math.sin(p.a) * p.r]} scale={[p.s, p.s * 0.6, 1]}>
          <spriteMaterial
            map={texture}
            color={ash ? "#3a3432" : "#a89cb0"}
            transparent
            opacity={ash ? 0.5 : 0.42}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  );
}
