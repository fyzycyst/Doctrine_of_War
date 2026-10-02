// The pack registry (M1, P1).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ashAndBanner } from "../campaign/definition";
import { doctrineLibrary } from "../engine/doctrines";
import { scenarios } from "../engine/scenarios";
import { lintPacks } from "./lint";
import { parsePackManifest, readDoctrine, readScenario, SCHEMA_KINDS } from "./manifest";
import { createRegistry, firstCall, registry, shippedPacks } from "./registry";
import { PackError, RULES_REVISION, type PackManifest } from "./types";

const clone = (pack: PackManifest = firstCall): PackManifest => structuredClone(pack);
const reason = (raw: unknown) => {
  try {
    parsePackManifest(raw);
    return "parsed";
  } catch (error) {
    expect(error).toBeInstanceOf(PackError);
    return (error as Error).message;
  }
};

describe("parsePackManifest (untrusted data)", () => {
  it("round-trips every shipped pack exactly: nothing dropped, nothing added", () => {
    for (const pack of shippedPacks) {
      expect(parsePackManifest(JSON.parse(JSON.stringify(pack)))).toEqual(JSON.parse(JSON.stringify(pack)));
    }
  });

  it("refuses unknown fields, unknown kinds, bad ids, out-of-range numbers and oversized lists", () => {
    const extra = { ...clone(), installer: "run.sh" };
    expect(reason(extra)).toMatch(/pack has unknown fields: installer/);

    const kind = clone();
    (kind.scenarios[0].winCondition as unknown as { kind: string }).kind = "detonate";
    expect(reason(kind)).toMatch(/winCondition.kind must be one of/);

    const rule = clone();
    rule.doctrines.push(structuredClone(doctrineLibrary.shield_the_line));
    (rule.doctrines[0].rules[0].then as unknown as { kind: string }).kind = "eval";
    expect(reason(rule)).toMatch(/doctrines\[0\]\.rules\[0\]\.then\.kind/);

    const badId = clone();
    badId.campaigns[0].companies[0].id = "Greyford Shields";
    expect(reason(badId)).toMatch(/companies\[0\]\.id must be a lowercase id/);

    const strength = clone();
    strength.scenarios[0].squads[0].strength = 1e9;
    expect(reason(strength)).toMatch(/squads\[0\]\.strength must be an integer in 1\.\.100/);

    const huge = clone();
    huge.campaigns[0].battles = Array.from({ length: 12 }, () => structuredClone(huge.campaigns[0].battles[0]));
    expect(reason(huge)).toMatch(/battles must have 1\.\.11 entries/);

    expect(reason("not a pack")).toMatch(/pack must be an object/);
    expect(reason(JSON.parse('{"__proto__": {"polluted": true}}'))).toMatch(/pack/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("the pack schema keeps up with the engine", () => {
  it("has a case for every member of every engine union (read from engine/types.ts)", () => {
    const source = readFileSync(path.join(__dirname, "..", "engine", "types.ts"), "utf8");
    for (const [union, kinds] of Object.entries(SCHEMA_KINDS)) {
      const start = source.indexOf(`export type ${union} =`);
      expect(start, union).toBeGreaterThanOrEqual(0);
      const end = source.indexOf("\nexport ", start + 1);
      const body = source.slice(start, end < 0 ? undefined : end);
      const engineKinds = [...body.matchAll(/kind: "(\w+)"/g)].map((match) => match[1]);
      const inherited = /^\s*\| EnemySelector$/m.test(body) ? SCHEMA_KINDS.EnemySelector : [];
      expect([...new Set(kinds)].sort(), union).toEqual([...new Set([...engineKinds, ...inherited])].sort());
    }
  });

  it("round-trips every core doctrine and the offensive kinds (aheadOfLine, breakObjective)", () => {
    for (const doctrine of Object.values(doctrineLibrary)) {
      expect(readDoctrine(JSON.parse(JSON.stringify(doctrine)), "doctrine"), doctrine.id).toEqual(doctrine);
    }
    expect(Object.values(doctrineLibrary).some((doctrine) => doctrine.rules.some((rule) => rule.when.kind === "aheadOfLine"))).toBe(true);
    const offensive = { ...structuredClone(scenarios[0]), id: "offensive", winCondition: { kind: "breakObjective", objectiveId: scenarios[0].objectives[0].id } };
    expect(readScenario(JSON.parse(JSON.stringify(offensive)), "scenario")).toEqual(offensive);
    expect(() => readScenario({ ...offensive, winCondition: { kind: "breakObjective" } }, "scenario")).toThrow(/objectiveId is required/);
    const ahead = { kind: "aheadOfLine", by: 99 };
    const doctrine = { ...structuredClone(doctrineLibrary.shield_the_line), rules: [{ id: "x", label: "If ahead → hold", when: ahead, then: { kind: "hold" } }] };
    expect(() => readDoctrine(doctrine, "doctrine")).toThrow(/by must be an integer in 1\.\.8/);
  });
});

describe("lintPacks (cross-pack ids and references)", () => {
  it("passes the shipped packs", () => {
    expect(lintPacks(shippedPacks, doctrineLibrary)).toEqual([]);
  });

  it("refuses ids reused across packs: packs, campaigns, companies, scenarios, doctrines, skirmishes", () => {
    const twin = clone();
    const problems = lintPacks([firstCall, twin], doctrineLibrary);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/pack id first_call is used by/),
        expect.stringMatching(/campaign id ash_and_banner is used by/),
        expect.stringMatching(/company id greyford_shields is used by campaign ash_and_banner and campaign ash_and_banner/),
        expect.stringMatching(/scenario id first_breach is used by/),
        expect.stringMatching(/skirmish id skirmish_first_breach is used by/),
      ]),
    );
    const doctrine = clone();
    doctrine.id = "other";
    doctrine.campaigns = [];
    doctrine.scenarios = [];
    doctrine.skirmishes = [];
    doctrine.doctrines = [structuredClone(doctrineLibrary.iron_tide)];
    expect(lintPacks([firstCall, doctrine], doctrineLibrary)).toContain("doctrine id iron_tide is used by the core library and pack other");
  });

  it("refuses broken references inside a pack", () => {
    const pack = clone();
    pack.skirmishes.push({ id: "skirmish_ghost", title: "Ghost", scenarioId: "ghost_ford" });
    pack.campaigns[0].battles[1].scenarioId = "ghost_ford";
    pack.scenarios[0].squads[0].doctrineId = "iron_tide";
    pack.scenarios[1].hostSchedule[0].orders = { pyre_sworn: "shield_the_line" };
    pack.campaigns[0].companies.push({ id: "levy", name: "Levy", role: "frontline" });
    pack.readsContent = [99];
    const problems = lintPacks([pack], doctrineLibrary);
    expect(problems).toEqual(
      expect.arrayContaining([
        "pack first_call: skirmish skirmish_ghost names scenario ghost_ford, not in this pack",
        "campaign ash_and_banner: battle battle_1 names scenario ghost_ford, not in this pack",
        "scenario first_breach: squad greyford_shields has the other side's doctrine iron_tide",
        "scenario ember_ford: phase 1 orders pyre_sworn onto shield_the_line, not a host doctrine",
        'campaign ash_and_banner: "levy" is reserved for levies',
        "pack first_call: readsContent must include its own content revision",
      ]),
    );
  });
});

describe("the registry", () => {
  it("serves the shipped content: the intro campaign and every engine scenario", () => {
    expect(registry.campaign("ash_and_banner")).toMatchObject({ pack: { id: "first_call" }, campaign: { id: ashAndBanner.id } });
    expect(registry.campaign("ash_and_banner")?.campaign).toEqual(ashAndBanner);
    expect(registry.scenarios().map((item) => item.id)).toEqual(scenarios.map((item) => item.id));
    expect(registry.scenario("hold_for_dawn")).toEqual(scenarios.find((item) => item.id === "hold_for_dawn"));
    expect(registry.skirmishes().map(({ skirmish }) => skirmish.scenarioId)).toEqual(scenarios.map((item) => item.id));
    expect(registry.campaign("nowhere")).toBeUndefined();
  });

  it("fails closed: a set with a lint problem exposes nothing", () => {
    expect(() => createRegistry([firstCall, clone()])).toThrow(PackError);
    expect(() => createRegistry([{ id: "x" }])).toThrow(/pack.title is required/);
  });

  it("says why a saved run cannot continue on this build", () => {
    const run = { packId: "first_call", packRevision: 1, campaignId: "ash_and_banner", contentRevision: 1, rulesRevision: RULES_REVISION };
    expect(registry.compatibility(run)).toEqual({ ok: true });
    expect(registry.compatibility({ ...run, packId: "shoal_towns" })).toMatchObject({ ok: false, reason: expect.stringMatching(/pack this build does not have/) });
    expect(registry.compatibility({ ...run, campaignId: "sluice_line" })).toMatchObject({ ok: false });
    expect(registry.compatibility({ ...run, contentRevision: 7 })).toMatchObject({ ok: false, reason: expect.stringMatching(/different edition/) });
    expect(registry.compatibility({ ...run, rulesRevision: 9 })).toMatchObject({ ok: false, reason: expect.stringMatching(/rules this build does not support/) });
    // A run saved by a newer (or unknown) pack format is not continued.
    expect(registry.compatibility({ ...run, packRevision: 2 })).toMatchObject({ ok: false, reason: expect.stringMatching(/pack format this build does not read/) });
  });
});
