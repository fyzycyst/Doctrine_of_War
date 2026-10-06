import { describe, expect, it } from "vitest";
import { cinderRoad1 } from "../game/engine/scenarios/cinderRoad1";
import { cinderRoad2 } from "../game/engine/scenarios/cinderRoad2";
import { emberFord } from "../game/engine/scenarios/emberFord";
import { firstBreach } from "../game/engine/scenarios/firstBreach";
import { holdForDawn } from "../game/engine/scenarios/holdForDawn";
import { saltmarshColumn } from "../game/engine/scenarios/saltmarshColumn";
import { facingFor } from "./fromEngine";
import { cinderRoad6LabBoard } from "./lab/cinderRoad6Lab";
import { sides } from "./sides";

describe("which way each side faces and flees (CR6: the Banners attack east)", () => {
  it("keeps today's convention on every shipped board: Banners face west and flee east", () => {
    for (const s of [firstBreach, emberFord, saltmarshColumn, holdForDawn, cinderRoad1, cinderRoad2]) {
      const d = sides(s.board);
      expect(d.free_banners.facing, s.id).toBe(facingFor("free_banners"));
      expect(d.ashen_host.facing, s.id).toBe(facingFor("ashen_host"));
      expect(d.free_banners.home, s.id).toEqual([1, 0]);
      expect(d.ashen_host.home, s.id).toEqual([-1, 0]);
    }
  });

  it("turns both sides round when the Banners deploy west of the Host", () => {
    const d = sides(cinderRoad6LabBoard);
    expect(d.free_banners.facing).toBe(0);
    expect(d.ashen_host.facing).toBe(Math.PI);
    expect(d.free_banners.home).toEqual([-1, 0]);
    expect(d.ashen_host.home).toEqual([1, 0]);
  });
});
