import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { lazy, Suspense, useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import * as THREE from "three";
import { useAppStore } from "../app/store";
import { hexKey, type BoardLayout, type HexCoord } from "../game/board";
import { GroundMist, type MistDensityMap } from "./atmosphere/GroundMist";
import { Fires } from "./atmosphere/Fires";
import { Particles } from "./atmosphere/Particles";
import { SkyDome } from "./atmosphere/SkyDome";
import { SquadAnimator, type AnimatorScene, type SquadAnimationApi } from "./figures/squadAnimation";
import { SquadMarkers } from "./figures/SquadMarkers";
import { ToySoldierSquads } from "./figures/ToySoldierSquads";
import { placeSquads, type DioramaSquad, type FigureApproach, type PlacedSquad } from "./figures/types";
import { wideShotFor } from "./camera/DioramaCamera";
import { boardRadius, hexToWorld } from "./hexWorld";
import { LightRig } from "./lighting/LightRig";
import { AtmosphereTicker, useLook } from "./look/LookContext";
import type { FactionId } from "../game/engine/types";
import { createIslandMaterial, createOutlineMaterial } from "./materials";
import { pickBoardHex, resolveClick } from "./picking";
import { BoardHighlights, type ZoneStyle } from "./terrain/BoardHighlights";
import { ExitMarkers } from "./terrain/ExitMarkers";
import { buildIsland } from "./terrain/buildIsland";
import { GateBanner } from "./terrain/GateBanner";
import { WallsAndObjectiveFX } from "./terrain/ObjectiveFX";
import { Reeds } from "./terrain/Reeds";
import { Water } from "./terrain/Water";
import { useDisposable } from "./dispose";

/**
 * Figure approach (b), the CC0 KayKit pack, is lab-only: the module (and its
 * gitignored GLBs) only exist in dev builds. In production `figures="kaykit"`
 * falls back to the toy soldiers, and the import is dead code the bundler drops.
 */
const KayKitSquads = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import("./figures/KayKitSquads")).KayKitSquads }))
  : null;

/**
 * The living diorama: floating island built from a BoardLayout, atmosphere,
 * lighting rig and squads. Must be rendered inside a <Canvas> and a
 * <LookProvider>. Contains no game logic; it only draws the state it is given.
 *
 * - Picking writes `hoveredHex`, `hoveredSquadId`, `selectedHex` and
 *   `selectedSquadId` to the app store.
 * - `animationRef` receives the `SquadAnimationApi` (march, lunge, fall, rout,
 *   rally, brace, reveal, reset) for playback to drive.
 * - `visibility` turns on fog of war: unseen board hexes fill with a tall, dim
 *   mist and desaturate; `lastKnown` enemies draw as silhouettes; a squad that
 *   becomes visible plays `reveal` while the mist over it parts.
 * - Weather comes from the <LookProvider weather> and cross-fades by itself.
 */

/** Fog-of-war input, from the engine's `visibleState` for the player's faction. */
export interface DioramaVisibility {
  /** Board hexes the viewer can see right now. */
  visibleHexes: HexCoord[];
  /** Enemies shown where they were last seen (engine `lastKnown: true`). */
  lastKnown: Array<{ squadId: string; hex: HexCoord; faction: FactionId; strength?: number; cohesion?: number }>;
}
export function Diorama({
  board,
  squads,
  figures = "toy",
  mistDensity,
  deploymentHexes,
  zoneStyle = "deploy",
  exitHexes,
  emphasisHex,
  visibility,
  animationRef,
  onFiguresReady,
  onReveal,
}: {
  board: BoardLayout;
  squads: DioramaSquad[];
  figures?: FigureApproach;
  mistDensity?: MistDensityMap;
  /** Hexes to tint as a pulsing deployment zone. */
  deploymentHexes?: HexCoord[];
  /**
   * How `deploymentHexes` are drawn: "deploy" (default, the gold pulse) or
   * "march" (T21 muster: where the selected company can march; silver-blue
   * edges and chevrons pointing away from it).
   */
  zoneStyle?: ZoneStyle;
  /**
   * Hexes to mark as a "way out" (e.g. Saltmarsh's southern edge): a soft pale
   * glow toward the off-board side and faint chevrons drifting off the board.
   */
  exitHexes?: HexCoord[];
  /** The hex to emphasise with a pulsing outline (playback's acting company; T19). */
  emphasisHex?: HexCoord | null;
  /** Fog of war; omit for everything visible. */
  visibility?: DioramaVisibility;
  animationRef?: Ref<SquadAnimationApi>;
  onFiguresReady?: () => void;
  /** Squads that just came out of the fog (e.g. to play the `reveal` SFX). */
  onReveal?: (squadIds: string[]) => void;
}) {
  const { skin, preset, atmosphere } = useLook();
  const island = useMemo(() => buildIsland(board, skin), [board, skin]);
  const material = useMemo(() => createIslandMaterial(skin.material), [skin.material]);
  const outline = useDisposable(
    () => (skin.material.outline ? createOutlineMaterial(skin.material.outlineColor, 0.012) : null),
    [skin.material.outline, skin.material.outlineColor],
  );
  useEffect(
    () => () => {
      island.geometry.dispose();
      island.wallGeometry?.dispose();
      island.reedGeometry?.dispose();
    },
    [island],
  );
  useEffect(() => () => material.dispose(), [material]);

  useMemo(() => {
    material.userData.fade.uFadeColor.value.set(preset.cliffFade);
  }, [material, preset.cliffFade]);

  // Last-known enemies join the draw list as silhouettes (unless also visible).
  // Squads may already carry `lastKnown` (from `dioramaSquads(view.squads)`);
  // `visibility.lastKnown` adds any ghost not already in the list.
  const drawn = useMemo<DioramaSquad[]>(() => {
    if (!visibility) return squads;
    const live = new Set(squads.map((s) => s.id));
    const ghosts = visibility.lastKnown
      .filter((g) => !live.has(g.squadId))
      .map((g) => ({
        id: g.squadId,
        faction: g.faction,
        hex: g.hex,
        strength: g.strength ?? 66,
        cohesion: g.cohesion ?? 60,
        facing: g.faction === "free_banners" ? Math.PI : 0,
        lastKnown: true,
      }));
    return [...squads, ...ghosts];
  }, [squads, visibility]);

  const placed = useMemo(() => placeSquads(drawn, island, skin.figures.maxFigures), [drawn, island, skin.figures.maxFigures]);

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

  // Fog field: eases toward the new visibility (instant on first mount).
  const fogInit = useRef(false);
  useEffect(() => {
    atmosphere.setFog(
      board.hexes.map((h) => h.coord),
      visibility ? knownHexes(visibility.visibleHexes, exitHexes) : null,
      !fogInit.current,
    );
    fogInit.current = true;
  }, [atmosphere, board, visibility, exitHexes]);

  // Reveal: squads that are drawn live now but were hidden or ghosts before.
  const shown = useRef<Set<string> | null>(null);
  useEffect(() => {
    const now = new Set(drawn.filter((s) => !s.lastKnown).map((s) => s.id));
    const before = shown.current;
    shown.current = now;
    if (!before || !visibility) return;
    const revealed = [...now].filter((id) => !before.has(id));
    if (revealed.length === 0) return;
    revealed.forEach((id) => {
      void animator.reveal(id);
      const p = placed.find((q) => q.squad.id === id);
      if (p) atmosphere.swirl(p.x, p.z);
    });
    onReveal?.(revealed);
  }, [drawn, visibility, animator, onReveal, placed, atmosphere]);

  // March zone (T21): chevrons point away from the selected company.
  const selectedSquadId = useAppStore((s) => s.selectedSquadId);
  const marchFrom = useMemo(
    () => (zoneStyle === "march" ? (drawn.find((d) => d.id === selectedSquadId)?.hex ?? null) : null),
    [zoneStyle, drawn, selectedSquadId],
  );

  const setHoveredHex = useAppStore((s) => s.setHoveredHex);
  const setHoveredSquad = useAppStore((s) => s.setHoveredSquad);
  const selectHex = useAppStore((s) => s.selectHex);
  const selectSquad = useAppStore((s) => s.selectSquad);
  const squadRefs = useMemo(() => drawn.map((s) => ({ id: s.id, hex: s.hex })), [drawn]);

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
    selectHex(drawn.find((s) => s.id === id)?.hex ?? null);
  };

  return (
    <>
      {/* Tickers first so every consumer below sees this frame's state. */}
      <AtmosphereTicker />
      <AnimatorTicker animator={animator} />
      <DofFocusWriter placed={placed} animator={animator} />
      <SkyDome />
      <LightRig shadowRadius={island.radius * 0.8} fogOffset={fogOffsetFor(board)} />
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
      <WallsAndObjectiveFX
        island={island}
        material={material}
        animator={animator}
        onPointerMove={onIslandMove}
        onPointerOut={() => {
          setHoveredHex(null);
          setHoveredSquad(null);
        }}
        onClick={onIslandClick}
      />
      {outline && <mesh geometry={island.geometry} material={outline} />}
      <Water island={island} />
      <Reeds island={island} />
      <Fires island={island} />
      {island.gateBanner && <GateBanner anchor={island.gateBanner} />}
      <BoardHighlights island={island} deploymentHexes={deploymentHexes} zoneStyle={zoneStyle} marchFrom={marchFrom} emphasisHex={emphasisHex} />
      {exitHexes && exitHexes.length > 0 && <ExitMarkers board={board} island={island} hexes={exitHexes} />}
      <SquadMarkers placed={placed} animator={animator} waterLevel={island.waterLevel} />
      <Suspense fallback={null}>
        {figures === "kaykit" && KayKitSquads ? (
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

/**
 * Depth of field follows the company that matters: the active one during
 * playback (`focusSquadId`), else the selected one; otherwise null (PostFX's
 * default band over the board). Read imperatively so it never re-renders.
 */
function DofFocusWriter({ placed, animator }: { placed: PlacedSquad[]; animator: SquadAnimator }) {
  const { dofFocus } = useLook();
  const point = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => () => void (dofFocus.point = null), [dofFocus]);
  useFrame(() => {
    const { focusSquadId, selectedSquadId } = useAppStore.getState();
    const id = focusSquadId ?? selectedSquadId;
    const p = id ? placed.find((q) => q.squad.id === id) : undefined;
    if (!p) {
      dofFocus.point = null;
      return;
    }
    const a = animator.squadPose(p.squad.id)?.anchor;
    dofFocus.point = point.set(a?.x ?? p.x, (a?.y ?? p.y) + 0.15, a?.z ?? p.z);
  });
  return null;
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

/** Wide-shot distance the skin's fog presets are tuned for (Ember Ford's board). */
const FOG_REF_DISTANCE = 26;
/** Push the fog back on boards bigger than that, so their wide shot isn't buried. */
function fogOffsetFor(board: BoardLayout): number {
  return Math.max(0, wideShotFor(board).distance - FOG_REF_DISTANCE);
}

/**
 * Hexes the fog of war leaves clear: what the player sees, plus a known exit
 * edge (the player always knows where the way out is, so it never reads as
 * unknown ground). Squads there are still drawn per `visibility`.
 */
export function knownHexes(visible: HexCoord[], exits?: HexCoord[]): HexCoord[] {
  if (!exits || exits.length === 0) return visible;
  const seen = new Set(visible.map(hexKey));
  return [...visible, ...exits.filter((h) => !seen.has(hexKey(h)))];
}
