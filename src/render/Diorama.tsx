import { Suspense, useEffect, useMemo } from "react";
import type { BoardLayout } from "../game/board";
import { GroundMist, type MistDensityMap } from "./atmosphere/GroundMist";
import { Fires } from "./atmosphere/Fires";
import { Particles } from "./atmosphere/Particles";
import { SkyDome } from "./atmosphere/SkyDome";
import { KayKitSquads } from "./figures/KayKitSquads";
import { SquadMarkers } from "./figures/SquadMarkers";
import { ToySoldierSquads } from "./figures/ToySoldierSquads";
import { placeSquads, type DioramaSquad, type FigureApproach } from "./figures/types";
import { LightRig } from "./lighting/LightRig";
import { useLook } from "./look/LookContext";
import { createIslandMaterial, createOutlineMaterial } from "./materials";
import { buildIsland } from "./terrain/buildIsland";
import { Water } from "./terrain/Water";
import { GateBanner } from "./terrain/GateBanner";

/**
 * The living diorama: floating island built from a BoardLayout, atmosphere,
 * lighting rig and squads. Must be rendered inside a <Canvas> and a
 * <LookProvider>. Contains no game logic; it only draws the state it is given.
 */
export function Diorama({
  board,
  squads,
  figures = "toy",
  mistDensity,
  onFiguresReady,
}: {
  board: BoardLayout;
  squads: DioramaSquad[];
  figures?: FigureApproach;
  mistDensity?: MistDensityMap;
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

  return (
    <>
      <SkyDome />
      <LightRig shadowRadius={island.radius * 0.8} />
      <mesh geometry={island.geometry} material={material} castShadow receiveShadow />
      {outline && <mesh geometry={island.geometry} material={outline} />}
      <Water island={island} />
      <Fires island={island} />
      {island.gateBanner && <GateBanner anchor={island.gateBanner} />}
      <SquadMarkers placed={placed} />
      <Suspense fallback={null}>
        {figures === "kaykit" ? <KayKitSquads placed={placed} /> : <ToySoldierSquads placed={placed} />}
        <ReadySignal onReady={onFiguresReady} />
      </Suspense>
      <GroundMist island={island} densityByHex={mistDensity} />
      <Particles extent={island.radius} />
    </>
  );
}

function ReadySignal({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return null;
}
