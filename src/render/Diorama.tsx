import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useImperativeHandle, useMemo, type Ref } from "react";
import { useAppStore } from "../app/store";
import { hexKey, type BoardLayout, type HexCoord } from "../game/board";
import { GroundMist, type MistDensityMap } from "./atmosphere/GroundMist";
import { Fires } from "./atmosphere/Fires";
import { Particles } from "./atmosphere/Particles";
import { SkyDome } from "./atmosphere/SkyDome";
import { KayKitSquads } from "./figures/KayKitSquads";
import { SquadAnimator, type AnimatorScene, type SquadAnimationApi } from "./figures/squadAnimation";
import { SquadMarkers } from "./figures/SquadMarkers";
import { ToySoldierSquads } from "./figures/ToySoldierSquads";
import { placeSquads, type DioramaSquad, type FigureApproach } from "./figures/types";
import { hexToWorld } from "./hexWorld";
import { LightRig } from "./lighting/LightRig";
import { useLook } from "./look/LookContext";
import { createIslandMaterial, createOutlineMaterial } from "./materials";
import { pickBoardHex, resolveClick } from "./picking";
import { BoardHighlights } from "./terrain/BoardHighlights";
import { buildIsland } from "./terrain/buildIsland";
import { GateBanner } from "./terrain/GateBanner";
import { Water } from "./terrain/Water";

/**
 * The living diorama: floating island built from a BoardLayout, atmosphere,
 * lighting rig and squads. Must be rendered inside a <Canvas> and a
 * <LookProvider>. Contains no game logic; it only draws the state it is given.
 *
 * - Picking writes `hoveredHex`, `hoveredSquadId`, `selectedHex` and
 *   `selectedSquadId` to the app store.
 * - `animationRef` receives the `SquadAnimationApi` (march, lunge, fall, rout,
 *   rally, brace, reset) for playback to drive.
 */
export function Diorama({
  board,
  squads,
  figures = "toy",
  mistDensity,
  deploymentHexes,
  animationRef,
  onFiguresReady,
}: {
  board: BoardLayout;
  squads: DioramaSquad[];
  figures?: FigureApproach;
  mistDensity?: MistDensityMap;
  /** Hexes to tint as a pulsing deployment zone. */
  deploymentHexes?: HexCoord[];
  animationRef?: Ref<SquadAnimationApi>;
  onFiguresReady?: () => void;
}) {
  const { skin, preset } = useLook();
  const island = useMemo(() => buildIsland(board, skin), [board, skin]);
  const material = useMemo(() => createIslandMaterial(skin.material), [skin.material]);
  const outline = useMemo(
    () => (skin.material.outline ? createOutlineMaterial(skin.material.outlineColor, 0.012) : null),
    [skin.material.outline, skin.material.outlineColor],
  );
  useEffect(() => () => island.geometry.dispose(), [island]);
  useEffect(() => () => material.dispose(), [material]);

  useMemo(() => {
    material.userData.fade.uFadeColor.value.set(preset.cliffFade);
  }, [material, preset.cliffFade]);

  const placed = useMemo(() => placeSquads(squads, island, skin.figures.maxFigures), [squads, island, skin.figures.maxFigures]);

  // The animator reads placement through this scene adapter (props only, no engine).
  const scene = useMemo<AnimatorScene>(() => {
    const byId = new Map(placed.map((p) => [p.squad.id, p]));
    return {
      squad: (id) => {
        const p = byId.get(id);
        if (!p) return undefined;
        // Routing heads for the faction's home edge: Host west, Banners east.
        const home: [number, number] = p.squad.faction === "ashen_host" ? [-1, 0] : [1, 0];
        return { anchor: { x: p.x, y: p.y, z: p.z }, facing: p.squad.facing, alive: p.alive, home };
      },
      hexWorld: (hex) => {
        const y = island.surface.get(hexKey(hex));
        if (y === undefined) return undefined;
        const [x, z] = hexToWorld(hex, island.center);
        return { x, y, z };
      },
    };
  }, [placed, island]);
  const animator = useMemo(() => new SquadAnimator(scene), []); // eslint-disable-line react-hooks/exhaustive-deps
  animator.setScene(scene);
  useImperativeHandle(animationRef, () => animator, [animator]);

  const setHoveredHex = useAppStore((s) => s.setHoveredHex);
  const setHoveredSquad = useAppStore((s) => s.setHoveredSquad);
  const selectHex = useAppStore((s) => s.selectHex);
  const selectSquad = useAppStore((s) => s.selectSquad);
  const squadRefs = useMemo(() => squads.map((s) => ({ id: s.id, hex: s.hex })), [squads]);

  const onIslandMove = (e: ThreeEvent<PointerEvent>) => {
    const hex = pickBoardHex(e.point, board, island.center);
    setHoveredHex(hex);
    setHoveredSquad(resolveClick(hex, squadRefs).squadId);
  };
  const onIslandClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const { hex, squadId } = resolveClick(pickBoardHex(e.point, board, island.center), squadRefs);
    selectHex(hex);
    selectSquad(squadId);
  };
  const onFigureClick = (id: string) => {
    selectSquad(id);
    selectHex(squads.find((s) => s.id === id)?.hex ?? null);
  };

  return (
    <>
      {/* Ticks first so every consumer below sees this frame's poses. */}
      <AnimatorTicker animator={animator} />
      <SkyDome />
      <LightRig shadowRadius={island.radius * 0.8} />
      <mesh
        geometry={island.geometry}
        material={material}
        castShadow
        receiveShadow
        onPointerMove={onIslandMove}
        onPointerOut={() => {
          setHoveredHex(null);
          setHoveredSquad(null);
        }}
        onClick={onIslandClick}
      />
      {outline && <mesh geometry={island.geometry} material={outline} />}
      <Water island={island} />
      <Fires island={island} />
      {island.gateBanner && <GateBanner anchor={island.gateBanner} />}
      <BoardHighlights island={island} deploymentHexes={deploymentHexes} />
      <SquadMarkers placed={placed} animator={animator} />
      <Suspense fallback={null}>
        {figures === "kaykit" ? (
          <KayKitSquads placed={placed} />
        ) : (
          <ToySoldierSquads placed={placed} animator={animator} onSquadClick={onFigureClick} onSquadHover={setHoveredSquad} />
        )}
        <ReadySignal onReady={onFiguresReady} />
      </Suspense>
      <GroundMist island={island} densityByHex={mistDensity} />
      <Particles extent={island.radius} />
    </>
  );
}

function AnimatorTicker({ animator }: { animator: SquadAnimator }) {
  useFrame((_, dt) => animator.tick(Math.min(dt, 0.1)));
  return null;
}

function ReadySignal({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return null;
}
