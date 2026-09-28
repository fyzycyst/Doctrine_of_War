import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { FactionId } from "../../game/types";
import { useLook } from "../look/LookContext";
import { addRimLight } from "../materials";
import type { PlacedFigure, PlacedSquad } from "./types";

/**
 * Figure approach (b): CC0 rigged low-poly characters by Kay Lousberg (KayKit).
 * - Free Banners: KayKit Adventurers "Knight"
 * - Ashen Host:   KayKit Skeletons "Skeleton_Warrior"
 * Licence: CC0 1.0 (LICENSE.txt in each pack). Fetched by `npm run fetch:cc0`.
 *
 * Each figure is a cloned SkinnedMesh with its own AnimationMixer: far more
 * draw calls than approach (a); fine for a comparison, not for scale.
 */

const BASE = `${import.meta.env.BASE_URL}assets/cc0/kaykit/`;
const MODELS: Record<FactionId, { url: string; idle: string; keep: string[] }> = {
  free_banners: {
    url: `${BASE}Knight.glb`,
    idle: "Idle",
    keep: ["1H_Sword", "Badge_Shield", "Knight_Helmet", "Knight_Cape", "Knight_ArmLeft", "Knight_ArmRight", "Knight_Body", "Knight_Head", "Knight_LegLeft", "Knight_LegRight"],
  },
  ashen_host: {
    url: `${BASE}Skeleton_Warrior.glb`,
    idle: "Idle_Combat",
    keep: [],
  },
};

export function KayKitSquads({ placed }: { placed: PlacedSquad[] }) {
  return (
    <>
      <FactionFigures faction="free_banners" placed={placed} />
      <FactionFigures faction="ashen_host" placed={placed} />
    </>
  );
}

function FactionFigures({ faction, placed }: { faction: FactionId; placed: PlacedSquad[] }) {
  const { skin } = useLook();
  const style = skin.factions[faction];
  const model = MODELS[faction];
  const gltf = useGLTF(model.url);
  const figures = useMemo(() => placed.flatMap((p) => p.figures).filter((f) => f.faction === faction), [placed, faction]);

  // Measure once so figures match the toy soldiers' height.
  const scale = useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const h = box.max.y - box.min.y || 1;
    return (skin.figures.height * 1.15) / h;
  }, [gltf.scene, skin.figures.height]);

  const instances = useMemo(() => {
    const clip = gltf.animations.find((a) => a.name === model.idle) ?? gltf.animations[0];
    return figures.map((f: PlacedFigure) => {
      const root = cloneSkinned(gltf.scene) as THREE.Object3D;
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (model.keep.length && !model.keep.includes(o.name)) {
          o.visible = false;
          return;
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Recolour cloth and shields into faction colours; keep the atlas elsewhere.
        const isCloth = /Cape|Cloak/.test(o.name);
        const isShield = /Shield/.test(o.name);
        const src = mesh.material as THREE.MeshStandardMaterial;
        const m = isCloth
          ? new THREE.MeshStandardMaterial({ color: faction === "free_banners" ? style.primary : style.secondary, roughness: 0.85 })
          : isShield
            ? new THREE.MeshStandardMaterial({ color: style.shield, roughness: 0.6 })
            : src.clone();
        mesh.material = addRimLight(m, style.glow, skin.figures.rimStrength * style.rim * 0.8, `kaykit-${faction}-${isCloth || isShield ? "flat" : "tex"}`);
      });
      root.position.set(f.x, f.y + 0.012, f.z);
      // KayKit characters face +z; our facing yaw is measured from +x.
      root.rotation.y = f.yaw + Math.PI / 2;
      root.scale.setScalar(scale);
      const mixer = new THREE.AnimationMixer(root);
      if (clip) {
        const action = mixer.clipAction(clip);
        action.play();
        action.time = (f.phase / (Math.PI * 2)) * clip.duration;
      }
      return { root, mixer };
    });
  }, [gltf, figures, model, faction, scale, style, skin.figures.rimStrength]);

  useEffect(
    () => () => {
      instances.forEach(({ mixer }) => mixer.stopAllAction());
    },
    [instances],
  );

  useFrame((_, dt) => {
    for (const { mixer } of instances) mixer.update(dt);
  });

  return (
    <>
      {instances.map(({ root }, i) => (
        <primitive key={i} object={root} />
      ))}
    </>
  );
}
