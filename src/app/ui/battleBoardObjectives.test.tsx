// M2 follow-up: a battered or broken objective reaches the Diorama from BattleBoard.
// The 3D layer is stubbed; the Diorama stub records the props it is given.
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firstBreach } from "../../game/engine";
import { useGame } from "../game/gameStore";
import { BattleBoard } from "./BattleBoard";

const seen = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));

vi.mock("@react-three/fiber", () => ({ Canvas: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../../render/Diorama", () => ({
  Diorama: (props: Record<string, unknown>) => {
    seen.props.push(props);
    return null;
  },
}));
vi.mock("../../render/camera/DioramaCamera", async () => ({ ...(await import("../../render/camera/shots")), DioramaCamera: () => null }));
vi.mock("../../render/look/LookContext", () => ({ LookProvider: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../../render/post/PostFX", () => ({ PostFX: () => null }));
vi.mock("./PlaybackStage", () => ({ PlaybackStage: () => null }));
vi.mock("./TerrainChip", () => ({ TerrainChip: () => null }));
vi.mock("./MusterPlans", () => ({ MusterPlans: () => null }));
vi.mock("./FrameProbe", () => ({ FrameProbe: () => null }));
vi.mock("../../audio", () => ({ useAmbience: () => {} }));

const gate = firstBreach.objectives[0];
const last = () => seen.props[seen.props.length - 1];
function withIntegrity(integrity: number) {
  const view = useGame.getState().view;
  act(() => useGame.setState({ view: { ...view, objectives: view.objectives.map((o) => ({ ...o, integrity })) } }));
}

beforeEach(() => {
  seen.props = [];
  act(() => useGame.getState().loadBattle(firstBreach, { fortune: "off", seed: 1 }, "command"));
});
afterEach(() => cleanup());

describe("BattleBoard objective stages (M2)", () => {
  it("passes no stage for an untouched objective", () => {
    render(<BattleBoard />);
    expect(last().objectiveStates).toEqual([]);
  });

  it("passes a battered, then a broken objective to the Diorama", () => {
    render(<BattleBoard />);
    withIntegrity(Math.floor(gate.integrity * 0.5));
    expect(last().objectiveStates).toEqual([{ hex: gate.hex, stage: "battered" }]);
    withIntegrity(0);
    expect(last().objectiveStates).toEqual([{ hex: gate.hex, stage: "broken" }]);
  });

  it("passes each objective's strength and holder for its ring (T27 §2a)", () => {
    render(<BattleBoard />);
    expect(last().objectiveStrength).toEqual([{ hex: gate.hex, fraction: 1, holder: gate.defender }]);
    withIntegrity(Math.floor(gate.integrity / 4));
    expect(last().objectiveStrength).toEqual([{ hex: gate.hex, fraction: Math.floor(gate.integrity / 4) / gate.integrity, holder: gate.defender }]);
  });
});

