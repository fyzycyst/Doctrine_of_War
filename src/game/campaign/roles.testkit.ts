// Generic helpers for role tests (docs/CAMPAIGN.md, "roles are defined by what they achieve").
// A battle's role testkit (cinderRoad2.roles.testkit.ts, …) declares its roles' posts and
// fillers; these build the unfilled-role plans the gate plays and the call-coverage check.
import { doctrineLibrary } from "../engine/doctrines";
import type { Action, Doctrine, DoctrineLibrary, EngineScenario, Orders } from "../engine/types";

/** A role as the battle sheet declares it: the posts that fill it, and its fillers by orders. */
export interface RoleDeclaration {
  posts: readonly string[];
  /** Doctrines that fill the role by their orders alone (muster-dependent fillers are not listed). */
  fillers: readonly string[];
}

export interface NamedPlan {
  name: string;
  orders: Orders;
}

/** The stock doctrines this battle offers that do not fill `role` by orders. */
export function nonFillers(scenario: EngineScenario, role: RoleDeclaration): string[] {
  return scenario.playerDoctrineIds.filter((doctrineId) => !role.fillers.includes(doctrineId));
}

/**
 * The cartesian product: every way to give each of `role`'s posts one of the battle's stock
 * non-filler doctrines, the other posts as in `base`. These are the plans that leave the role
 * unfilled by orders (mixed orders included: a mixed watch is still no watch).
 */
export function unfilledCombos(scenario: EngineScenario, base: Orders, role: RoleDeclaration): NamedPlan[] {
  const doctrines = nonFillers(scenario, role);
  return role.posts.reduce<NamedPlan[]>(
    (plans, post) =>
      plans.flatMap((plan) => doctrines.map((doctrineId) => ({ name: plan.name ? `${plan.name}, ${post}=${doctrineId}` : `${post}=${doctrineId}`, orders: { ...plan.orders, [post]: doctrineId } }))),
    [{ name: "", orders: { ...base } }],
  );
}

/** `count` items spread evenly through `items` (deterministic; all of them if count >= length). */
export function spread<T>(items: readonly T[], count: number): T[] {
  if (count >= items.length) return [...items];
  return Array.from({ length: count }, (_, index) => items[Math.floor((index * items.length) / count)]);
}

const strikesObjective = (action: Action) =>
  action.kind === "bombard" || ((action.kind === "attack" || action.kind === "counterCharge") && action.target.kind === "objective");

/**
 * Whether any rule of `doctrine` can damage an enemy objective (an attack or counter-charge on
 * an objective, or a bombardment). Editor variants reorder rules and move bounded numbers but
 * cannot add an action, so a doctrine without one cannot strike, whatever its variant.
 */
export function canStrikeEnemyObjective(doctrine: Doctrine): boolean {
  return doctrine.rules.some((rule) => strikesObjective(rule.then));
}

/** The battle's stock doctrines that can strike an enemy objective. */
export function objectiveStrikers(scenario: EngineScenario, library: DoctrineLibrary = doctrineLibrary): string[] {
  return scenario.playerDoctrineIds.filter((doctrineId) => canStrikeEnemyObjective(library[doctrineId]));
}

/** A file-name slug for a named call: "carried: greedy" -> "carried-greedy". */
export function callSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
