import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { firstBreach, serializeVariants, type DoctrineVariant } from "../../game/engine";
import { memoryStore } from "../flow/testKit";
import { useGame } from "../game/gameStore";
import { getDoctrine } from "../game/view";
import { useVariants, variantId } from "./variantStore";

const cut: DoctrineVariant = {
  id: "v-shield_the_line-veterans-cut",
  baseId: "shield_the_line",
  name: "Shield the Line (Veteran's cut)",
  order: ["stl_brace", "stl_break", "stl_hold"],
  params: { stl_break: { value: 35 } },
};

function freshVariants(data: string | null = null) {
  const store = memoryStore(data);
  useVariants.setState({ status: "idle", variants: [], notice: null, store });
  return store;
}

describe("the variants store", () => {
  it("round-trips through its store", async () => {
    const store = freshVariants();
    await act(() => useVariants.getState().load());
    expect(useVariants.getState()).toMatchObject({ status: "ready", variants: [], notice: null });
    const saved = await act(() => useVariants.getState().save(cut));
    expect(saved.ok).toBe(true);
    expect(JSON.parse(store.data!)).toEqual({ version: 1, variants: [cut] });

    freshVariants(store.data);
    await act(() => useVariants.getState().load());
    expect(useVariants.getState().variants.map((item) => item.variant)).toEqual([cut]);
    expect(useVariants.getState().variants[0].doctrine.rules[1].label).toBe("If cohesion < 35 → fall back 1 hex");
  });

  it("fails closed: a broken file gives the standard doctrines and says so", async () => {
    freshVariants("{ not json");
    await act(() => useVariants.getState().load());
    expect(useVariants.getState().variants).toEqual([]);
    expect(useVariants.getState().notice).toMatch(/could not be read/);

    freshVariants(serializeVariants([cut, { ...cut, id: "v-bad", params: { stl_break: { value: 99 } } }]));
    await act(() => useVariants.getState().load());
    expect(useVariants.getState().variants.map((item) => item.variant.id)).toEqual([cut.id]);
    expect(useVariants.getState().notice).toMatch(/1 saved variant no longer fits/);
  });

  it("refuses an invalid variant and a duplicate name without writing", async () => {
    const store = freshVariants();
    const bad = await act(() => useVariants.getState().save({ ...cut, order: ["stl_hold", "stl_hold", "stl_brace"] }));
    expect(bad.ok).toBe(false);
    expect(store.data).toBeNull();
    await act(() => useVariants.getState().save(cut));
    const twin = await act(() => useVariants.getState().save({ ...cut, id: "v-shield_the_line-twin" }));
    expect(twin).toEqual({ ok: false, errors: ["Another variant already has that name."] });
  });

  it("makes unique, valid ids", () => {
    expect(variantId("shield_the_line", "Shield the Line (Veteran's cut)", [])).toBe("v-shield_the_line-shield-the-line-veteran-s-cut");
    expect(variantId("shield_the_line", "!!!", ["v-shield_the_line-cut"])).toBe("v-shield_the_line-cut-2");
  });
});

describe("variants in battle", () => {
  beforeEach(async () => {
    freshVariants();
    await act(() => useVariants.getState().save(cut));
    act(() => useGame.getState().loadBattle(firstBreach, { seed: firstBreach.curatedSeed ?? 1, fortune: "on" }, "command"));
  });

  it("can be ordered where its base is allowed, plays in the engine, and marks the battle", () => {
    expect(useGame.getState().customOrders).toBe(false);
    expect(useGame.getState().assignDoctrine("greyford_shields", cut.id)).toBe(true);
    expect(getDoctrine(cut.id)?.name).toBe(cut.name);
    act(() => useGame.getState().sealOrders());
    const log = useGame.getState().log[0];
    expect(log.events.some((event) => event.kind === "ruleFired" && event.doctrineId === cut.id)).toBe(true);
    expect(useGame.getState().customOrders).toBe(true);
  });

  it("is refused where its base is not allowed", () => {
    act(() =>
      useGame.getState().loadBattle({ ...firstBreach, playerDoctrineIds: ["fighting_withdrawal"] }, { seed: 1, fortune: "on" }, "command"),
    );
    expect(useGame.getState().assignDoctrine("greyford_shields", cut.id)).toBe(false);
  });

  it("keeps the variant and the battle's order when a delete cannot be written", async () => {
    expect(useGame.getState().assignDoctrine("greyford_shields", cut.id)).toBe(true);
    const failing = { read: async () => null, write: async () => Promise.reject(new Error("disk full")) };
    useVariants.setState({ store: failing });
    const removed = await act(() => useVariants.getState().remove(cut.id));
    expect(removed).toBe(false);
    expect(useVariants.getState().variants.map((item) => item.variant.id)).toEqual([cut.id]);
    expect(useGame.getState().orders.greyford_shields).toBe(cut.id);
    expect(useVariants.getState().notice).toMatch(/could not be saved \(disk full\)/);
  });

  it("falls back to the standing doctrine when a variant is deleted mid-battle", async () => {
    useGame.getState().assignDoctrine("greyford_shields", cut.id);
    await act(() => useVariants.getState().remove(cut.id));
    expect(useGame.getState().orders.greyford_shields).toBeUndefined();
    expect(useGame.getState().assignDoctrine("greyford_shields", cut.id)).toBe(false);
  });
});
