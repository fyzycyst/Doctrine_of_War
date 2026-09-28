import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { useAppStore } from "../app/store";

const HEX_RADIUS = 0.55;
const HEX_HEIGHT = 0.18;

const TILE_COORDS: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

function axialToWorld(q: number, r: number): [number, number, number] {
  const x = HEX_RADIUS * Math.sqrt(3) * (q + r / 2);
  const z = HEX_RADIUS * 1.5 * r;
  return [x, 0, z];
}

function createHexShape(radius: number) {
  const shape = new THREE.Shape();

  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);

    if (i === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }

  shape.closePath();
  return shape;
}

function HexTile({
  position,
  color,
}: {
  position: [number, number, number];
  color: string;
}) {
  const geometry = useMemo(() => {
    const shape = createHexShape(HEX_RADIUS * 0.92);
    const extrude = new THREE.ExtrudeGeometry(shape, {
      depth: HEX_HEIGHT,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.02,
      bevelSegments: 1,
    });
    extrude.rotateX(-Math.PI / 2);
    extrude.translate(0, HEX_HEIGHT / 2, 0);
    return extrude;
  }, []);

  return (
    <mesh position={position} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.72} metalness={0.08} />
    </mesh>
  );
}

function PlaceholderBattlefield() {
  const quality = useAppStore((state) => state.quality);
  const tileColors = quality === "high"
    ? ["#6f5a45", "#5d4a38", "#7a634c", "#4f4032", "#8a7158", "#564536", "#72604b"]
    : ["#5c4d3f", "#5c4d3f", "#6a5846", "#5c4d3f", "#6a5846", "#5c4d3f", "#6a5846"];

  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight castShadow intensity={1.1} position={[4, 8, 3]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#1a1714" />
      </mesh>
      {TILE_COORDS.map(([q, r], index) => (
        <HexTile
          key={`${q},${r}`}
          position={axialToWorld(q, r)}
          color={tileColors[index % tileColors.length]}
        />
      ))}
      <OrbitControls
        enablePan={false}
        minDistance={4}
        maxDistance={14}
        maxPolarAngle={Math.PI / 2.2}
        target={[0, 0, 0]}
      />
    </>
  );
}

export function Scene() {
  return (
    <Canvas
      shadows
      dpr={useAppStore.getState().quality === "high" ? [1, 2] : 1}
      camera={{ position: [5.5, 5, 5.5], fov: 42, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={["#101315"]} />
      <fog attach="fog" args={["#101315", 12, 28]} />
      <PlaceholderBattlefield />
    </Canvas>
  );
}
