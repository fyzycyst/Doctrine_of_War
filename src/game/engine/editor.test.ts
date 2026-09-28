import { describe, expect, it } from "vitest";
import { createInitialState, doctrineLibrary, firstBreach, resolvePhase } from ".";
import {
  checkVariantsPayload,
  deriveDoctrine,
  EDITABLE_DOCTRINE_IDS,
  editableParams,
  isVariantAllowed,
  parseVariants,
  serializeVariants,
  unreachableRules,
  validateVariant,
  withVariants,
  type DoctrineVariant,
} from "./editor";

const shield = doctrineLibrary.shield_the_line;
const cut = (overrides: Partial<DoctrineVariant> = {}): DoctrineVariant => ({
  id: "v-shield-veterans-cut",
  baseId: "shield_the_line",
  name: "Shield the Line (Veteran's cut)",
  order: ["stl_brace", "stl_break", "stl_hold"],
  params: { stl_break: { value: 35 } },
  ...overrides,
});

describe("editable params", () => {
  it("offers only bounded numbers that the rule's label names", () => {
    expect(editableParams(shield.rules[0])).toEqual([{ param: "value", value: 20, bound: { min: 10, max: 90, step: 5 } }]);
    expect(editableParams(shield.rules[1])).toEqual([]); // enemyAdjacent: nothing to tune
    // Counterstroke's overextension range is not in its label, so it is not offered.
    const strike = doctrineLibrary.clean_counterstroke.rules.find((rule) => rule.when.kind === "enemyOverextended")!;
    expect(editableParams(strike)).toEqual([]);
  });
});

describe("deriveDoctrine", () => {
  it("reorders the rules, moves the threshold and rewrites the label to match", () => {
    const doctrine = deriveDoctrine(shield, cut());
    expect(doctrine.id).toBe("v-shield-veterans-cut");
    expect(doctrine.rules.map((rule) => rule.id)).toEqual(["stl_brace", "stl_break", "stl_hold"]);
    expect(doctrine.rules[1].when).toEqual({ kind: "selfCohesionBelow", value: 35 });
    expect(doctrine.rules[1].label).toBe("If cohesion < 35 → fall back 1 hex");
    // The base is untouched.
    expect(shield.rules[0].label).toBe("If cohesion < 20 → fall back 1 hex");
    expect(doctrine.passives).toEqual(shield.passives);
  });

  it("plays in the engine like any doctrine", () => {
    const checked = validateVariant(cut(), doctrineLibrary);
    if (!checked.ok) throw new Error(checked.errors.join("; "));
    const { scenario, doctrines } = withVariants(firstBreach, [checked], doctrineLibrary);
    const result = resolvePhase(createInitialState(scenario, { fortune: "off" }), { greyford_shields: checked.variant.id }, scenario, { doctrines });
    expect(result.state.squads.find((squad) => squad.id === "greyford_shields")?.doctrineId).toBe(checked.variant.id);
    expect(result.events.some((event) => event.kind === "ruleFired" && event.doctrineId === checked.variant.id)).toBe(true);
  });
});

describe("validateVariant (fails closed)", () => {
  const errorsOf = (raw: unknown) => {
    const result = validateVariant(raw, doctrineLibrary, firstBreach.playerDoctrineIds);
    return result.ok ? [] : result.errors;
  };

  it("accepts a good variant and returns a clean copy", () => {
    const result = validateVariant({ ...cut(), params: { stl_break: { value: 35 }, stl_hold: {} } }, doctrineLibrary);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.variant.params).toEqual({ stl_break: { value: 35 } });
  });

  it("requires the order to be a permutation of the base rules", () => {
    expect(errorsOf(cut({ order: ["stl_brace", "stl_break"] }))).toContain("order must be a permutation of the base doctrine's rules");
    expect(errorsOf(cut({ order: ["stl_brace", "stl_brace", "stl_hold"] }))).toContain("order must be a permutation of the base doctrine's rules");
    expect(errorsOf(cut({ order: ["stl_brace", "stl_break", "fw_ready"] }))).toContain("order must be a permutation of the base doctrine's rules");
  });

  it("holds every threshold to its bounds and step", () => {
    expect(errorsOf(cut({ params: { stl_break: { value: 95 } } }))[0]).toMatch(/must be 10–90 in steps of 5/);
    expect(errorsOf(cut({ params: { stl_break: { value: 33 } } }))[0]).toMatch(/steps of 5/);
    expect(errorsOf(cut({ params: { stl_break: { value: 22.5 } } }))[0]).toMatch(/steps of 5/);
    expect(errorsOf(cut({ params: { stl_brace: { value: 30 } } }))).toContain("params.stl_brace.value is not editable");
    expect(errorsOf(cut({ params: { nope: { value: 30 } } }))).toContain("params: no rule nope");
  });

  it("rejects malformed and hostile input", () => {
    for (const raw of [null, 7, "variant", [], { ...cut(), extra: true }, { ...cut(), id: "shield_the_line" }, { ...cut(), id: "../../etc" }, { ...cut(), name: "" }, { ...cut(), name: "x".repeat(61) }, { ...cut(), baseId: "iron_tide" }, { ...cut(), baseId: "nope" }, { ...cut(), params: [] }, { ...cut(), order: "stl_brace" }]) {
      expect(validateVariant(raw, doctrineLibrary, firstBreach.playerDoctrineIds).ok).toBe(false);
    }
    // A Host doctrine is not a player doctrine.
    expect(errorsOf({ ...cut(), baseId: "iron_tide", order: doctrineLibrary.iron_tide.rules.map((rule) => rule.id), params: {} })).toContain(
      "base doctrine is not one the player may use",
    );
  });
});

describe("where variants may be used", () => {
  it("only where the base is allowed, and the engine allowlist follows", () => {
    const checked = validateVariant(cut(), doctrineLibrary);
    if (!checked.ok) throw new Error("variant");
    expect(isVariantAllowed(checked.variant, firstBreach)).toBe(true);
    const noShield = { ...firstBreach, playerDoctrineIds: ["fighting_withdrawal"] };
    expect(isVariantAllowed(checked.variant, noShield)).toBe(false);
    expect(withVariants(noShield, [checked], doctrineLibrary).scenario.playerDoctrineIds).toEqual(["fighting_withdrawal"]);
  });
});

describe("unreachable rules", () => {
  it("flags rules after an Otherwise", () => {
    expect(unreachableRules(deriveDoctrine(shield, cut({ order: ["stl_hold", "stl_brace", "stl_break"], params: {} })))).toEqual(["stl_brace", "stl_break"]);
    expect(unreachableRules(shield)).toEqual([]);
  });
});

describe("the variants file", () => {
  it("round-trips, and drops a bad variant while keeping the rest", () => {
    const good = cut();
    const json = serializeVariants([good]);
    expect(parseVariants(json).variants.map((item) => item.variant)).toEqual([good]);
    expect(checkVariantsPayload(json)).toBe(json);

    const mixed = JSON.stringify({ version: 1, variants: [good, { ...good, id: "v-other", order: ["stl_hold"] }, good] });
    const parsed = parseVariants(mixed);
    expect(parsed.variants).toHaveLength(1);
    expect(parsed.dropped).toBe(2); // the malformed one, and the duplicate id
    expect(() => checkVariantsPayload(mixed)).toThrow(/failed validation/);
  });

  it("refuses a broken file outright", () => {
    for (const bad of [null, "not json", "[]", JSON.stringify({ version: 2, variants: [] }), JSON.stringify({ version: 1, variants: {} }), "x".repeat(70_000)]) {
      expect(() => parseVariants(bad)).toThrow(/Doctrine variants/);
    }
    expect(() => parseVariants(JSON.stringify({ version: 1, variants: Array(25).fill(cut()) }))).toThrow(/more than 24/);
  });
});

describe("the bounds against the final rules (T17)", () => {
  it("offers exactly these thresholds: a rule id or label change shows up here", () => {
    const offered = EDITABLE_DOCTRINE_IDS.flatMap((id) =>
      doctrineLibrary[id].rules.flatMap((rule) => editableParams(rule).map(({ param, value, bound }) => `${rule.id}.${param}=${value} [${bound.min}–${bound.max}/${bound.step}]`)),
    );
    expect(offered).toEqual([
      "stl_break.value=20 [10–90/5]",
      "fw_rout_guard.value=50 [10–90/5]",
      "rs_rally.value=75 [10–90/5]",
      "rs_seek.value=50 [10–90/5]",
      "cc_disengage.value=30 [10–90/5]",
    ]);
  });

  it("never offers a Host doctrine, or a bombard, to the player's editor", () => {
    for (const id of EDITABLE_DOCTRINE_IDS) {
      expect(doctrineLibrary[id].faction).toBe("free_banners");
      expect(doctrineLibrary[id].rules.some((rule) => rule.then.kind === "bombard")).toBe(false);
    }
    expect(EDITABLE_DOCTRINE_IDS).not.toContain("hurl_fire");
    const hurl = doctrineLibrary.hurl_fire;
    const result = validateVariant(
      { id: "v-hurl", baseId: "hurl_fire", name: "Hurl Fire", order: hurl.rules.map((rule) => rule.id), params: {} },
      doctrineLibrary,
      EDITABLE_DOCTRINE_IDS,
    );
    expect(result.ok).toBe(false);
  });

  it("keeps Counterstroke's new strike (power, label) intact when its orders move", () => {
    const counter = doctrineLibrary.clean_counterstroke;
    const doctrine = deriveDoctrine(counter, {
      id: "v-counter",
      name: "Counterstroke (bold)",
      order: ["cc_answer", "cc_strike", "cc_disengage", "cc_wait"],
      params: { cc_disengage: { value: 15 } },
    });
    const answer = doctrine.rules[0];
    expect(answer.label).toBe("If enemy adjacent → strike back from guard");
    expect(answer.then).toEqual(counter.rules.find((rule) => rule.id === "cc_answer")!.then);
    expect(doctrine.rules[2].label).toBe("If cohesion < 15 → fall back 1 hex");
    expect(editableParams(counter.rules.find((rule) => rule.id === "cc_answer")!)).toEqual([]);
  });
});
