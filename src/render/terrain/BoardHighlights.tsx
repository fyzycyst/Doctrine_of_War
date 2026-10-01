import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useAppStore } from "../../app/store";
import { hexKey, type HexCoord } from "../../game/board";
import { hexToWorld } from "../hexWorld";
import { useLook } from "../look/LookContext";
import type { IslandBuild } from "./buildIsland";
import { useDisposable } from "../dispose";
import { MarchZone } from "./MarchZone";

export type ZoneStyle = "deploy" | "march";

/**
 * Hex overlays drawn on the tile tops: a hover outline, a selected-hex outline
 * (both from the store), a pulsing deployment-zone tint for a set of hexes
 * passed in as a prop, and a pulsing emphasis outline on the hex playback is acting on.
 */
export function BoardHighlights({
  island,
  deploymentHexes,
  deploymentColor = "#ffcf6e",
  zoneStyle = "deploy",
  marchFrom = null,
  emphasisHex = null,
}: {
  island: IslandBuild;
  deploymentHexes?: HexCoord[];
  deploymentColor?: string;
  /** "deploy": the gold pulse; "march": silver-blue edges and chevrons from `marchFrom` (T21 muster). */
  zoneStyle?: ZoneStyle;
  marchFrom?: HexCoord | null;
  /** T19: emphasis without moving the camera (the acting company during playback). */
  emphasisHex?: HexCoord | null;
}) {
  const hovered = useAppStore((s) => s.hoveredHex);
  const selected = useAppStore((s) => s.selectedHex);

  const at = (hex: HexCoord | null) => {
    if (!hex) return null;
    const y = island.surface.get(hexKey(hex));
    if (y === undefined) return null;
    const [x, z] = hexToWorld(hex, island.center);
    return new THREE.Vector3(x, y + 0.02, z);
  };
  const hoverPos = at(hovered);
  const selectedPos = at(selected);
  const emphasisPos = at(emphasisHex);

  return (
    <>
      {deploymentHexes && deploymentHexes.length > 0 && zoneStyle === "deploy" && (
        <DeploymentZone island={island} hexes={deploymentHexes} color={deploymentColor} />
      )}
      {deploymentHexes && deploymentHexes.length > 0 && zoneStyle === "march" && <MarchZone island={island} hexes={deploymentHexes} from={marchFrom} />}
      {hoverPos && (
        <HexOutline position={hoverPos} color="#fff4d6" opacity={0.45} width={0.05} />
      )}
      {selectedPos && <HexOutline position={selectedPos} color="#ffd27a" opacity={0.85} width={0.07} pulse />}
      {emphasisPos && <HexOutline position={emphasisPos} color="#fff4d6" opacity={0.95} width={0.11} pulse />}
    </>
  );
}

function HexOutline({
  position,
  color,
  opacity,
  width,
  pulse = false,
}: {
  position: THREE.Vector3;
  color: string;
  opacity: number;
  width: number;
  pulse?: boolean;
}) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const { reducedMotion } = useLook();
  useFrame(({ clock }) => {
    if (pulse && mat.current) mat.current.opacity = opacity * (reducedMotion ? 0.85 : 0.7 + 0.3 * Math.sin(clock.elapsedTime * 4));
  });
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
      {/* thetaStart 0 puts a corner on +x, matching flat-top hexes. */}
      <ringGeometry args={[0.93 - width, 0.93, 6, 1]} />
      <meshBasicMaterial
        ref={mat}
        color={new THREE.Color(color).multiplyScalar(1.4)}
        transparent
        opacity={opacity}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

function DeploymentZone({ island, hexes, color }: { island: IslandBuild; hexes: HexCoord[]; color: string }) {
  const geometry = useMemo(() => {
    const parts = hexes.flatMap((hex) => {
      const y = island.surface.get(hexKey(hex));
      if (y === undefined) return [];
      const [x, z] = hexToWorld(hex, island.center);
      const g = new THREE.CircleGeometry(0.9, 6);
      g.rotateX(-Math.PI / 2);
      g.translate(x, y + 0.018, z);
      return [g];
    });
    return parts.length ? mergeGeometries(parts) : null;
  }, [hexes, island]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uStatic: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime, uStatic;
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float r = length(vUv - 0.5) * 2.0;
            float edge = mix(0.35, 1.0, smoothstep(0.55, 0.95, r));
            // Reduced motion: a steady tint instead of a pulse.
            float pulse = mix(0.6 + 0.4 * sin(uTime * 2.2), 0.8, uStatic);
            gl_FragColor = vec4(uColor * edge * pulse * 0.14, 1.0);
          }
        `,
      }),
    [color],
  );
  const { reducedMotion: still } = useLook();
  useFrame((_, dt) => {
    material.uniforms.uTime.value += dt;
    material.uniforms.uStatic.value = still ? 1 : 0;
  });
  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} renderOrder={3} />;
}
