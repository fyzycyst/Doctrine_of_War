import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { hexKey } from "../../game/board";
import type { ObjectiveShake, SquadAnimator } from "../figures/squadAnimation";
import { mulberry32 } from "../hexWorld";
import { useLook } from "../look/LookContext";
import type { IslandBuild } from "./buildIsland";
import type { ObjectiveProp, ObjectiveStage, WaterJet } from "./objectiveProps";
import { useDisposable } from "../dispose";

/**
 * The walls/gatehouse as their own mesh, the open-ground objective props (M2:
 * barricade, wagon park, sluice-house) in their current stage, and the
 * objective-hit effects driven by `SquadAnimator.shakeObjective`.
 *
 * - Gatehouse hit: the masonry jolts (skipped under reduced motion), a dust
 *   burst billows out and a few stones fall.
 * - Barricade / wagons hit: a smaller jolt, splinters and a puff of steam and
 *   smoke (the Banners never use fire). Battered and broken, the doused pots
 *   steam.
 * - Sluice hit: stone chips and spray. Battered, water jets from the gate;
 *   broken, it runs through the breach.
 *
 * Reduced motion: no jolt and no thrown debris; the stage meshes are static and
 * the only particles are a light, slow steam or spray.
 * Time comes from the animator, so pause/setTimeScale apply to the hits too.
 */
export function WallsAndObjectiveFX({
  island,
  material,
  animator,
  objectiveStages,
  onPointerMove,
  onPointerOut,
  onClick,
}: {
  island: IslandBuild;
  material: THREE.Material;
  animator: SquadAnimator;
  /** Battered or broken objectives by hex key; absent = intact. */
  objectiveStages?: ReadonlyMap<string, ObjectiveStage>;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: () => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const { reducedMotion } = useLook();
  const wall = useRef<THREE.Mesh>(null);
  const propGroups = useRef<Array<THREE.Group | null>>([]);
  const shakes = useRef<ObjectiveShake[]>([]);
  const ids = useRef("");
  // Re-render only when the set of active hits changes; the effects animate in useFrame.
  const [, setVersion] = useState(0);

  useFrame(() => {
    const active = animator.activeShakes();
    shakes.current = active;
    const key = active.map((s) => s.id).join(",");
    if (key !== ids.current) {
      ids.current = key;
      setVersion((n) => n + 1);
    }
    // The gatehouse jolts for hits that aren't on a prop; each prop for its own.
    const jolt = (list: ObjectiveShake[]) => {
      let dx = 0;
      let dy = 0;
      let rz = 0;
      if (!reducedMotion) {
        for (const s of list) {
          const env = s.intensity * Math.exp(-s.t * 5.5);
          dx += Math.sin(s.t * 58) * 0.045 * env;
          dy += Math.abs(Math.sin(s.t * 41)) * 0.012 * env;
          rz += Math.sin(s.t * 47 + 1.3) * 0.006 * env;
        }
      }
      return { dx, dy, rz };
    };
    const m = wall.current;
    if (m) {
      const j = jolt(active.filter((s) => !propAt(island, s)));
      m.position.set(j.dx, j.dy, 0);
      m.rotation.set(0, 0, j.rz);
    }
    island.objectiveProps.forEach((prop, i) => {
      const g = propGroups.current[i];
      if (!g) return;
      const j = jolt(active.filter((s) => propAt(island, s) === prop));
      // Half the gatehouse's jolt, along the prop's facing.
      g.position.set(j.dx * 0.5 * prop.facing[0], j.dy * 0.5, j.dx * 0.5 * prop.facing[1]);
    });
  });

  return (
    <>
      {island.wallGeometry && (
        <mesh
          ref={wall}
          // The gatehouse's stage (CR6: the Host's gate battered, then breached).
          geometry={island.wallStages?.[objectiveStages?.get(island.gateKey ?? "") ?? "intact"] ?? island.wallGeometry}
          material={material}
          castShadow
          receiveShadow
          onPointerMove={onPointerMove}
          onPointerOut={onPointerOut}
          onClick={onClick}
        />
      )}
      {island.objectiveProps.map((prop, i) => {
        const stage = prop.stages[objectiveStages?.get(hexKey(prop.coord)) ?? "intact"];
        return (
          <group key={hexKey(prop.coord)}>
            <group
              ref={(el) => {
                propGroups.current[i] = el;
              }}
            >
              <mesh
                geometry={stage.geometry}
                material={material}
                castShadow
                receiveShadow
                onPointerMove={onPointerMove}
                onPointerOut={onPointerOut}
                onClick={onClick}
              />
              {stage.embers && <Embers geometry={stage.embers} />}
            </group>
            {stage.steam.length > 0 && <Steam sources={stage.steam} />}
            {stage.jets.length > 0 && <WaterJets jets={stage.jets} floor={island.waterLevel} />}
          </group>
        );
      })}
      {shakes.current.map((s) => (
        <HitFX key={s.id} shake={s} prop={propAt(island, s)} animator={animator} reducedMotion={reducedMotion} />
      ))}
    </>
  );
}

/** The open-ground prop a hit landed on, if any (hits carry a world point, not a hex). */
function propAt(island: IslandBuild, s: ObjectiveShake): ObjectiveProp | undefined {
  return island.objectiveProps.find((p) => Math.hypot(p.x - s.at.x, p.z - s.at.z) < 0.6);
}

const STEAM: [number, number, number] = [0.82, 0.84, 0.85];
const SMOKE_STEAM: [number, number, number] = [0.62, 0.62, 0.6];
const SPRAY: [number, number, number] = [0.85, 0.92, 0.95];
const DUST: [number, number, number] = [0.7, 0.62, 0.52];

function HitFX({ shake, prop, animator, reducedMotion }: { shake: ObjectiveShake; prop?: ObjectiveProp; animator: SquadAnimator; reducedMotion: boolean }) {
  const common = { id: shake.id, at: shake.at, intensity: shake.intensity, animator };
  if (!prop) {
    // The gatehouse, unchanged: dust out of the west face and falling stones.
    return (
      <>
        <Burst {...common} dir={[-1, 0]} color={DUST} />
        <Debris {...common} dir={[-1, 0]} kind="stone" />
      </>
    );
  }
  if (prop.kind === "sluice") {
    return (
      <>
        <Burst {...common} dir={[0, 0]} color={SPRAY} rise={2.2} alpha={reducedMotion ? 0.5 : 1} />
        {!reducedMotion && <Debris {...common} dir={[0, 0]} kind="stone" />}
      </>
    );
  }
  // The Host's props: steam and smoke off doused coals, and splinters. No flame.
  return (
    <>
      <Burst {...common} dir={prop.facing} color={SMOKE_STEAM} rise={1.8} alpha={reducedMotion ? 0.5 : 1} />
      {!reducedMotion && <Debris {...common} dir={prop.facing} kind="splinter" />}
    </>
  );
}

/** Local time of a shake by id (the animator owns the clock). */
function shakeTime(animator: SquadAnimator, id: number) {
  return animator.activeShakes().find((s) => s.id === id)?.t ?? 99;
}

type Vec3 = { x: number; y: number; z: number };

/**
 * A soft billow from the struck face (`dir`, or all round when [0, 0]): dust off
 * masonry, steam and smoke off wet coals, spray off the sluice.
 */
function Burst({
  id,
  at,
  intensity,
  animator,
  dir,
  color,
  rise = 1,
  alpha = 1,
}: {
  id: number;
  at: Vec3;
  intensity: number;
  animator: SquadAnimator;
  dir: [number, number];
  color: [number, number, number];
  rise?: number;
  alpha?: number;
}) {
  const count = 60;
  const geometry = useDisposable(() => {
    const rand = mulberry32(id * 7919);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < seed.length; i += 1) seed[i] = rand();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(at.x, at.y, at.z), 4);
    return g;
  }, [id, at]);
  const material = useDisposable(() => {
    const radial = dir[0] === 0 && dir[1] === 0;
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uT: { value: 0 },
        uOrigin: { value: new THREE.Vector3(at.x + dir[0] * 0.28, at.y, at.z + dir[1] * 0.28) },
        uDir: { value: new THREE.Vector2(dir[0], dir[1]) },
        uI: { value: intensity },
        uRise: { value: rise },
        uRadial: { value: radial ? 1 : 0 },
        uColor: { value: new THREE.Color(...color) },
        uAlpha: { value: 0.42 * alpha },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uT, uI, uRise, uRadial;
        uniform vec3 uOrigin;
        uniform vec2 uDir;
        varying float vA;
        void main() {
          float a = aSeed.x * 6.2832;
          float out1 = (1.0 - exp(-uT * 3.2)) * (0.45 + aSeed.y * 0.75) * (0.6 + 0.4 * uI);
          // Mostly out of the struck face, low and rolling; or evenly all round.
          vec2 d = mix(uDir * 1.2 + vec2(cos(a), sin(a)) * 0.8, vec2(cos(a), sin(a)), uRadial);
          vec3 dir = normalize(vec3(d.x, 0.0, d.y));
          vec3 p = uOrigin + dir * out1 + vec3(0.0, 0.05 + aSeed.z * 0.4 + uT * (0.15 + aSeed.w * 0.25) * uRise, 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = smoothstep(0.0, 0.06, uT) * (1.0 - smoothstep(0.45, 1.4, uT)) * (0.55 + 0.45 * uI);
          gl_PointSize = (240.0 + aSeed.w * 300.0) * (0.45 + uT * 1.2) / -mv.z;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uAlpha;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          // Very soft falloff so overlapping puffs merge into a cloud.
          float a = pow(max(0.0, 1.0 - d * 2.0), 2.2) * vA;
          gl_FragColor = vec4(uColor, a * uAlpha);
        }
      `,
    });
  }, [at, intensity, dir[0], dir[1], rise, alpha, color]);
  useFrame(() => {
    material.uniforms.uT.value = shakeTime(animator, id);
  });
  return <points geometry={geometry} material={material} renderOrder={7} />;
}

/** Stones off masonry, or splinters off timber, thrown out of the struck face (or all round). */
function Debris({ id, at, intensity, animator, dir, kind }: { id: number; at: Vec3; intensity: number; animator: SquadAnimator; dir: [number, number]; kind: "stone" | "splinter" }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const n = Math.max(3, Math.round(4 + 5 * Math.min(1.5, intensity)));
  const stones = useMemo(() => {
    const rand = mulberry32(id * 104729);
    const radial = dir[0] === 0 && dir[1] === 0;
    return Array.from({ length: n }, () => {
      const a = rand() * Math.PI * 2;
      const out = 0.35 + rand() * 0.55;
      const [ox, oz] = radial ? [Math.cos(a), Math.sin(a)] : dir;
      // Sideways scatter across the struck face.
      const side = (rand() - 0.5) * 0.5;
      return {
        x: (rand() - 0.5) * 0.3,
        z: (rand() - 0.5) * 0.9 * (radial ? 0.4 : 1),
        y0: 0.45 + rand() * 0.25,
        vx: ox * out - oz * side,
        vz: oz * out + ox * side,
        vy: 0.4 + rand() * 0.6,
        spin: rand() * 12,
        size: 0.035 + rand() * 0.04,
        delay: rand() * 0.15,
      };
    });
  }, [id, n, dir]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const t = shakeTime(animator, id);
    stones.forEach((s, i) => {
      const lt = Math.max(0, t - s.delay);
      let y = s.y0 + s.vy * lt - 4.9 * lt * lt;
      const landed = y < 0.02;
      if (landed) y = 0.02;
      const tt = landed ? Math.min(lt, (s.vy + Math.sqrt(s.vy * s.vy + 4 * 4.9 * (s.y0 - 0.02))) / (2 * 4.9)) : lt;
      dummy.position.set(at.x + s.x + s.vx * tt, at.y + y, at.z + s.z + s.vz * tt);
      dummy.rotation.set(s.spin * tt, s.spin * 0.7 * tt, 0);
      const k = s.size * (1 - Math.max(0, (t - 1.0) / 0.4));
      if (kind === "splinter") dummy.scale.set(k * 2.4, k * 0.35, k * 0.6);
      else dummy.scale.setScalar(k);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, n]} castShadow frustumCulled={false}>
      {kind === "splinter" ? <boxGeometry args={[1, 1, 1]} /> : <dodecahedronGeometry args={[1, 0]} />}
      <meshStandardMaterial color={kind === "splinter" ? "#8a6a48" : "#8c8676"} roughness={0.9} flatShading />
    </instancedMesh>
  );
}

/** The live coals in the Host's pots: a faint ember glow, breathing slowly (steady under reduced motion). */
function Embers({ geometry }: { geometry: THREE.BufferGeometry }) {
  const { motion } = useLook();
  const base = useMemo(() => new THREE.Color("#ff6a24"), []);
  const material = useDisposable(() => new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(2.2) }), [base]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const k = 2.2 + motion * (0.5 * Math.sin(t * 1.7) + 0.25 * Math.sin(t * 4.3));
    material.color.copy(base).multiplyScalar(k);
  });
  return <mesh geometry={geometry} material={material} />;
}

/** Steam rising off doused pots: pale, slow, thin. Lighter and nearly still under reduced motion. */
function Steam({ sources }: { sources: Vec3[] }) {
  const { quality, motion, reducedMotion } = useLook();
  const dpr = useThree((s) => s.viewport.dpr);
  const per = quality === "high" ? 14 : 6;
  const geometry = useDisposable(() => {
    const n = sources.length * per;
    const rand = mulberry32(sources.length * 31 + 5);
    const origin = new Float32Array(n * 3);
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i += 1) {
      const s = sources[Math.floor(i / per)];
      origin.set([s.x, s.y, s.z], i * 3);
      seed.set([rand(), rand(), rand(), rand()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(origin, 3));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 4));
    g.computeBoundingSphere();
    g.boundingSphere!.radius += 2;
    return g;
  }, [sources, per]);
  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uPixel: { value: dpr }, uAlpha: { value: reducedMotion ? 0.16 : 0.3 }, uColor: { value: new THREE.Color(...STEAM) } },
        vertexShader: /* glsl */ `
          attribute vec4 aSeed;
          uniform float uTime, uPixel;
          varying float vA;
          void main() {
            float life = 2.6 + aSeed.x * 1.8;
            float t = mod(uTime + aSeed.y * life, life);
            float k = t / life;
            vec3 p = position;
            p.y += t * 0.16;
            p.x += t * 0.03 + sin(t * 1.4 + aSeed.z * 20.0) * 0.04 * k;
            p.z += cos(t * 1.1 + aSeed.w * 20.0) * 0.04 * k;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            vA = smoothstep(0.0, 0.15, k) * (1.0 - smoothstep(0.4, 1.0, k));
            gl_PointSize = (2.0 + k * 6.0) * 26.0 * uPixel / -mv.z;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uAlpha;
          varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * vA * uAlpha);
          }
        `,
      }),
    [dpr, reducedMotion],
  );
  useFrame((_, dt) => {
    material.uniforms.uTime.value += dt * motion;
  });
  return <points geometry={geometry} material={material} renderOrder={5} />;
}

/**
 * Water escaping the sluice: thin arcing jets from a battered gate, a broad gush
 * through a breach. Droplets fall to the water surface (`floor`). Lighter and
 * nearly still under reduced motion (the breach's sheet of water is geometry).
 */
function WaterJets({ jets, floor }: { jets: WaterJet[]; floor: number }) {
  const { quality, motion, reducedMotion } = useLook();
  const dpr = useThree((s) => s.viewport.dpr);
  const per = (quality === "high" ? 60 : 24) * (reducedMotion ? 0.5 : 1);
  const geometry = useDisposable(() => {
    const counts = jets.map((j) => Math.max(8, Math.round(per * (0.4 + j.strength))));
    const n = counts.reduce((a, b) => a + b, 0);
    const rand = mulberry32(jets.length * 977 + 3);
    const origin = new Float32Array(n * 3);
    const jet = new Float32Array(n * 4);
    const seed = new Float32Array(n * 4);
    let i = 0;
    jets.forEach((j, k) => {
      for (let c = 0; c < counts[k]; c += 1, i += 1) {
        // Spread across the outflow's width (perpendicular to its direction).
        const off = (rand() - 0.5) * j.width;
        origin.set([j.x - j.dirZ * off, j.y, j.z + j.dirX * off], i * 3);
        jet.set([j.dirX, j.dirZ, j.strength, j.width], i * 4);
        seed.set([rand(), rand(), rand(), rand()], i * 4);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(origin, 3));
    g.setAttribute("aJet", new THREE.Float32BufferAttribute(jet, 4));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 4));
    g.computeBoundingSphere();
    g.boundingSphere!.radius += 2;
    return g;
  }, [jets, per]);
  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uPixel: { value: dpr },
          uFloor: { value: floor },
          uAlpha: { value: reducedMotion ? 0.3 : 0.6 },
          uColor: { value: new THREE.Color(...SPRAY) },
        },
        vertexShader: /* glsl */ `
          attribute vec4 aJet;
          attribute vec4 aSeed;
          uniform float uTime, uPixel, uFloor;
          varying float vA;
          void main() {
            float life = 0.55 + aSeed.x * 0.35;
            float t = mod(uTime + aSeed.y * life, life);
            float k = t / life;
            float speed = (0.5 + aSeed.z * 0.5) * (0.4 + aJet.z * 0.9);
            vec3 p = position;
            p.x += aJet.x * speed * t;
            p.z += aJet.y * speed * t + (aSeed.w - 0.5) * 0.12 * t;
            p.y += (0.25 + aSeed.w * 0.3) * aJet.z * t - 2.2 * t * t;
            // Splash on the surface: a little spread, then gone.
            float landed = step(p.y, uFloor);
            p.y = max(p.y, uFloor + 0.01);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            vA = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.6, 1.0, k)) * (1.0 - 0.6 * landed);
            gl_PointSize = (0.35 + aSeed.z * 0.4 + landed * 0.8 + aJet.w * 1.5) * 26.0 * uPixel / -mv.z;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uAlpha;
          varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            gl_FragColor = vec4(uColor, smoothstep(0.5, 0.1, d) * vA * uAlpha);
          }
        `,
      }),
    [dpr, floor, reducedMotion],
  );
  useFrame((_, dt) => {
    material.uniforms.uTime.value += dt * motion;
  });
  return <points geometry={geometry} material={material} renderOrder={6} />;
}
