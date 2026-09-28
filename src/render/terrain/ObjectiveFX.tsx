import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ObjectiveShake, SquadAnimator } from "../figures/squadAnimation";
import { mulberry32 } from "../hexWorld";
import { useLook } from "../look/LookContext";
import type { IslandBuild } from "./buildIsland";

/**
 * The walls/gatehouse as their own mesh, and the objective-hit effects driven
 * by `SquadAnimator.shakeObjective`: the masonry jolts (a damped shudder,
 * skipped under reduced motion), a dust burst billows out and a few stones fall.
 * Time comes from the animator, so pause/setTimeScale apply to the effects too.
 */
export function WallsAndObjectiveFX({
  island,
  material,
  animator,
  onPointerMove,
  onPointerOut,
  onClick,
}: {
  island: IslandBuild;
  material: THREE.Material;
  animator: SquadAnimator;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: () => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const { reducedMotion } = useLook();
  const wall = useRef<THREE.Mesh>(null);
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
    const m = wall.current;
    if (!m) return;
    let dx = 0;
    let dy = 0;
    let rz = 0;
    if (!reducedMotion) {
      for (const s of active) {
        const env = s.intensity * Math.exp(-s.t * 5.5);
        dx += Math.sin(s.t * 58) * 0.045 * env;
        dy += Math.abs(Math.sin(s.t * 41)) * 0.012 * env;
        rz += Math.sin(s.t * 47 + 1.3) * 0.006 * env;
      }
    }
    m.position.set(dx, dy, 0);
    m.rotation.set(0, 0, rz);
  });

  return (
    <>
      {island.wallGeometry && (
        <mesh
          ref={wall}
          geometry={island.wallGeometry}
          material={material}
          castShadow
          receiveShadow
          onPointerMove={onPointerMove}
          onPointerOut={onPointerOut}
          onClick={onClick}
        />
      )}
      {shakes.current.map((s) => (
        <Fragment key={s.id} shake={s} animator={animator} />
      ))}
    </>
  );
}

function Fragment({ shake, animator }: { shake: ObjectiveShake; animator: SquadAnimator }) {
  return (
    <>
      <DustBurst id={shake.id} at={shake.at} intensity={shake.intensity} animator={animator} />
      <FallingStones id={shake.id} at={shake.at} intensity={shake.intensity} animator={animator} />
    </>
  );
}

/** Local time of a shake by id (the animator owns the clock). */
function shakeTime(animator: SquadAnimator, id: number) {
  return animator.activeShakes().find((s) => s.id === id)?.t ?? 99;
}

function DustBurst({ id, at, intensity, animator }: { id: number; at: { x: number; y: number; z: number }; intensity: number; animator: SquadAnimator }) {
  const count = 60;
  const geometry = useMemo(() => {
    const rand = mulberry32(id * 7919);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < seed.length; i += 1) seed[i] = rand();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(at.x, at.y, at.z), 4);
    return g;
  }, [id, at]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        // Burst from the gate's outer (west) face, where the blow landed.
        uniforms: { uT: { value: 0 }, uOrigin: { value: new THREE.Vector3(at.x - 0.28, at.y, at.z) }, uI: { value: intensity } },
        vertexShader: /* glsl */ `
          attribute vec4 aSeed;
          uniform float uT, uI;
          uniform vec3 uOrigin;
          varying float vA;
          void main() {
            float a = aSeed.x * 6.2832;
            float out1 = (1.0 - exp(-uT * 3.2)) * (0.45 + aSeed.y * 0.75) * (0.6 + 0.4 * uI);
            // Mostly outward (west), low and rolling, rising slowly.
            vec3 dir = normalize(vec3(-1.2 + cos(a) * 0.8, 0.0, sin(a)));
            vec3 p = uOrigin + dir * out1 + vec3(0.0, 0.05 + aSeed.z * 0.4 + uT * (0.15 + aSeed.w * 0.25), 0.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            vA = smoothstep(0.0, 0.06, uT) * (1.0 - smoothstep(0.45, 1.4, uT)) * (0.55 + 0.45 * uI);
            gl_PointSize = (240.0 + aSeed.w * 300.0) * (0.45 + uT * 1.2) / -mv.z;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            // Very soft falloff so overlapping puffs merge into a cloud.
            float a = pow(max(0.0, 1.0 - d * 2.0), 2.2) * vA;
            gl_FragColor = vec4(vec3(0.7, 0.62, 0.52), a * 0.42);
          }
        `,
      }),
    [at, intensity],
  );
  useFrame(() => {
    material.uniforms.uT.value = shakeTime(animator, id);
  });
  return <points geometry={geometry} material={material} renderOrder={7} />;
}

function FallingStones({ id, at, intensity, animator }: { id: number; at: { x: number; y: number; z: number }; intensity: number; animator: SquadAnimator }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const n = Math.max(3, Math.round(4 + 5 * Math.min(1.5, intensity)));
  const stones = useMemo(() => {
    const rand = mulberry32(id * 104729);
    return Array.from({ length: n }, () => ({
      x: (rand() - 0.5) * 0.3,
      z: (rand() - 0.5) * 0.9,
      y0: 0.45 + rand() * 0.25,
      vx: -0.35 - rand() * 0.55,
      vz: (rand() - 0.5) * 0.5,
      vy: 0.4 + rand() * 0.6,
      spin: rand() * 12,
      size: 0.035 + rand() * 0.04,
      delay: rand() * 0.15,
    }));
  }, [id, n]);
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
      dummy.scale.setScalar(s.size * (1 - Math.max(0, (t - 1.0) / 0.4)));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, n]} castShadow frustumCulled={false}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#8c8676" roughness={0.9} flatShading />
    </instancedMesh>
  );
}
