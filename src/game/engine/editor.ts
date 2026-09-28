// The doctrine editor's engine side (T16, Experimental). Pure and data-driven: a
// variant is a base doctrine with its rules reordered and some numeric thresholds
// moved within bounds. Nothing else can change: no rules added or removed, no new
// condition or action kinds, no passives. Everything here fails closed.
import { doctrineLibrary } from "./doctrines";
import { scenarios } from "./scenarios";
import type { Condition, Doctrine, DoctrineLibrary, DoctrineRule, EngineScenario } from "./types";

/** One numeric condition parameter the editor may move. */
export interface ParamBound {
  min: number;
  max: number;
  step: number;
}

/**
 * Engine data: which condition parameters are editable, and within what. A parameter
 * is offered on a rule only if its current number appears in the rule's "when" text,
 * so the label can be rewritten exactly (see `editableParams`).
 */
export const EDIT_BOUNDS: Partial<Record<Condition["kind"], Record<string, ParamBound>>> = {
  selfCohesionBelow: { value: { min: 10, max: 90, step: 5 } },
  selfStrengthBelow: { value: { min: 10, max: 90, step: 5 } },
  enemyWithin: { range: { min: 1, max: 4, step: 1 } },
  enemyBelow: { value: { min: 10, max: 90, step: 5 }, range: { min: 1, max: 4, step: 1 } },
  allyAdjacentBelow: { value: { min: 10, max: 90, step: 5 } },
  allyBelow: { value: { min: 10, max: 90, step: 5 } },
  enemyOverextended: { range: { min: 1, max: 4, step: 1 } },
  wardNear: { range: { min: 2, max: 5, step: 1 }, minRange: { min: 1, max: 3, step: 1 } },
};

export const VARIANT_NAME_MAX = 60;
export const VARIANT_ID_PATTERN = /^v-[a-z0-9_-]{1,80}$/;

/** A saved edit of a base doctrine. Plain JSON. */
export interface DoctrineVariant {
  /** "v-…": never collides with a library doctrine id. */
  id: string;
  baseId: string;
  name: string;
  /** Every base rule id, once, in the new order. */
  order: string[];
  /** ruleId → param → new value. Only editable params, within bounds, on the step grid. */
  params: Record<string, Record<string, number>>;
}

export interface EditableParam {
  param: string;
  value: number;
  bound: ParamBound;
}

const whenPart = (label: string) => label.split("→")[0];
const numberPattern = (value: number) => new RegExp(`(?<![\\d.])${value}(?![\\d.])`);

/** The parameters of a base rule the editor may move (bounded, and named in its label). */
export function editableParams(rule: DoctrineRule): EditableParam[] {
  const bounds = EDIT_BOUNDS[rule.when.kind];
  if (!bounds) return [];
  const when = rule.when as unknown as Record<string, unknown>;
  return Object.entries(bounds)
    .filter(([param]) => typeof when[param] === "number" && numberPattern(when[param] as number).test(whenPart(rule.label)))
    .map(([param, bound]) => ({ param, value: when[param] as number, bound }));
}

/** Rewrites the numbers a rule's label shows for the params that changed. */
function relabel(rule: DoctrineRule, changes: Record<string, number>): string {
  const [when, ...rest] = rule.label.split("→");
  let next = when;
  const original = rule.when as unknown as Record<string, number>;
  for (const [param, value] of Object.entries(changes)) {
    next = next.replace(numberPattern(original[param]), String(value));
  }
  return [next, ...rest].join("→");
}

/**
 * The variant as a playable doctrine: the base's rules in the new order, with the edited
 * thresholds (and labels to match). Assumes a variant that passed `validateVariant`.
 */
export function deriveDoctrine(base: Doctrine, variant: Pick<DoctrineVariant, "id" | "name" | "order" | "params">): Doctrine {
  const byId = new Map(base.rules.map((rule) => [rule.id, rule]));
  return {
    ...base,
    id: variant.id,
    name: variant.name,
    passives: { ...base.passives },
    rules: variant.order.map((ruleId) => {
      const rule = byId.get(ruleId)!;
      const changes = variant.params[ruleId] ?? {};
      if (Object.keys(changes).length === 0) return structuredClone(rule);
      return {
        ...structuredClone(rule),
        when: { ...rule.when, ...changes } as Condition,
        label: relabel(rule, changes),
      };
    }),
  };
}

export type VariantCheck = { ok: true; variant: DoctrineVariant; doctrine: Doctrine } | { ok: false; errors: string[] };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

/**
 * Checks anything claiming to be a variant (from storage, a file, the UI) and returns a
 * clean copy plus its derived doctrine, or every reason it was refused. Refuses unknown
 * keys, a base that is not a player doctrine, an order that is not a permutation of the
 * base's rules, and any param that is not editable, out of bounds or off the step grid.
 */
export function validateVariant(raw: unknown, library: DoctrineLibrary, playerDoctrineIds?: string[]): VariantCheck {
  const errors: string[] = [];
  if (!isPlainObject(raw)) return { ok: false, errors: ["a variant must be an object"] };
  const extra = Object.keys(raw).filter((key) => !["id", "baseId", "name", "order", "params"].includes(key));
  if (extra.length) errors.push(`unknown fields: ${extra.join(", ")}`);

  const { id, baseId, name, order, params } = raw;
  if (typeof id !== "string" || !VARIANT_ID_PATTERN.test(id)) errors.push("id must look like v-<letters, digits, - or _>");
  else if (Object.hasOwn(library, id)) errors.push("id collides with a doctrine");
  if (typeof name !== "string" || name.trim().length === 0 || name.length > VARIANT_NAME_MAX || /[\u0000-\u001f]/.test(name)) {
    errors.push(`name must be 1–${VARIANT_NAME_MAX} printable characters`);
  }
  const base = typeof baseId === "string" && Object.hasOwn(library, baseId) ? library[baseId] : undefined;
  if (!base) errors.push("base doctrine does not exist");
  else if (playerDoctrineIds && !playerDoctrineIds.includes(base.id)) errors.push("base doctrine is not one the player may use");

  if (base) {
    const ruleIds = base.rules.map((rule) => rule.id);
    if (!Array.isArray(order) || order.some((item) => typeof item !== "string")) {
      errors.push("order must list rule ids");
    } else if (order.length !== ruleIds.length || new Set(order).size !== order.length || order.some((item) => !ruleIds.includes(item as string))) {
      errors.push("order must be a permutation of the base doctrine's rules");
    }
    if (!isPlainObject(params)) {
      errors.push("params must be an object");
    } else {
      for (const [ruleId, changes] of Object.entries(params)) {
        const rule = base.rules.find((item) => item.id === ruleId);
        if (!rule) {
          errors.push(`params: no rule ${ruleId}`);
          continue;
        }
        if (!isPlainObject(changes)) {
          errors.push(`params.${ruleId} must be an object`);
          continue;
        }
        const editable = new Map(editableParams(rule).map((item) => [item.param, item.bound]));
        for (const [param, value] of Object.entries(changes)) {
          const bound = editable.get(param);
          if (!bound) {
            errors.push(`params.${ruleId}.${param} is not editable`);
          } else if (typeof value !== "number" || !Number.isInteger(value) || value < bound.min || value > bound.max || (value - bound.min) % bound.step !== 0) {
            errors.push(`params.${ruleId}.${param} must be ${bound.min}–${bound.max} in steps of ${bound.step}`);
          }
        }
        const next = { ...(rule.when as unknown as Record<string, unknown>), ...changes };
        if (typeof next.minRange === "number" && typeof next.range === "number" && next.minRange > next.range) {
          errors.push(`params.${ruleId}: minRange cannot exceed range`);
        }
      }
    }
  }
  if (errors.length || !base) return { ok: false, errors };

  const variant: DoctrineVariant = {
    id: id as string,
    baseId: base.id,
    name: (name as string).trim(),
    order: [...(order as string[])],
    params: Object.fromEntries(
      Object.entries(params as Record<string, Record<string, number>>)
        .filter(([, changes]) => Object.keys(changes).length > 0)
        .map(([ruleId, changes]) => [ruleId, { ...changes }]),
    ),
  };
  return { ok: true, variant, doctrine: deriveDoctrine(base, variant) };
}

/** A variant may be used wherever its base doctrine is allowed. */
export function isVariantAllowed(variant: Pick<DoctrineVariant, "baseId">, scenario: EngineScenario): boolean {
  return scenario.playerDoctrineIds.includes(variant.baseId);
}

/**
 * What resolvePhase needs to play variants: the scenario with each usable variant added
 * to its allowlist, and the doctrine library with the variants in it. The engine itself
 * is unchanged: variants are ordinary doctrines by the time it sees them.
 */
export function withVariants(
  scenario: EngineScenario,
  variants: Array<{ variant: Pick<DoctrineVariant, "id" | "baseId">; doctrine: Doctrine }>,
  library: DoctrineLibrary,
): { scenario: EngineScenario; doctrines: DoctrineLibrary } {
  const usable = variants.filter(({ variant }) => isVariantAllowed(variant, scenario));
  return {
    scenario: { ...scenario, playerDoctrineIds: [...scenario.playerDoctrineIds, ...usable.map(({ variant }) => variant.id)] },
    doctrines: { ...library, ...Object.fromEntries(usable.map(({ doctrine }) => [doctrine.id, doctrine])) },
  };
}

// ---------------------------------------------------------------------------
// The variants file: its own versioned store, apart from the campaign save.
// ---------------------------------------------------------------------------

export const VARIANTS_VERSION = 1;
export const MAX_VARIANTS = 24;
export const MAX_VARIANTS_BYTES = 64 * 1024;

/** Doctrines a variant may be cut from: any the player is offered in some battle. */
export const EDITABLE_DOCTRINE_IDS: string[] = [...new Set(scenarios.flatMap((scenario) => scenario.playerDoctrineIds))];

export class VariantsFileError extends Error {
  constructor(message: string) {
    super(`Doctrine variants: ${message}`);
    this.name = "VariantsFileError";
  }
}

export interface CheckedVariant {
  variant: DoctrineVariant;
  doctrine: Doctrine;
}

export function serializeVariants(variants: DoctrineVariant[]): string {
  return JSON.stringify({ version: VARIANTS_VERSION, variants });
}

/**
 * Reads a variants file. A broken file (not JSON, wrong version, too big) throws; a
 * variant that fails validation (a base rule that changed, a hand-edited number) is
 * dropped and counted, and its base doctrine plays in its place.
 */
export function parseVariants(json: unknown, library: DoctrineLibrary = doctrineLibrary): { variants: CheckedVariant[]; dropped: number } {
  if (typeof json !== "string") throw new VariantsFileError("must be a string");
  if (new TextEncoder().encode(json).length > MAX_VARIANTS_BYTES) throw new VariantsFileError(`larger than ${MAX_VARIANTS_BYTES} bytes`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new VariantsFileError("not valid JSON");
  }
  if (!isPlainObject(parsed) || parsed.version !== VARIANTS_VERSION || !Array.isArray(parsed.variants)) {
    throw new VariantsFileError(`expected { version: ${VARIANTS_VERSION}, variants: [...] }`);
  }
  if (parsed.variants.length > MAX_VARIANTS) throw new VariantsFileError(`more than ${MAX_VARIANTS} variants`);
  const variants: CheckedVariant[] = [];
  let dropped = 0;
  for (const raw of parsed.variants) {
    const checked = validateVariant(raw, library, EDITABLE_DOCTRINE_IDS);
    if (checked.ok && !variants.some((item) => item.variant.id === checked.variant.id)) {
      variants.push({ variant: checked.variant, doctrine: checked.doctrine });
    } else {
      dropped += 1;
    }
  }
  return { variants, dropped };
}

/** What a writer (Electron's main process) accepts: a file that parses with nothing dropped. */
export function checkVariantsPayload(data: unknown): string {
  const { dropped } = parseVariants(data);
  if (dropped > 0) throw new VariantsFileError(`${dropped} variant(s) failed validation`);
  return data as string;
}

/** Rules placed after an always-firing rule can never fire (a warning, not an error). */
export function unreachableRules(doctrine: Doctrine): string[] {
  const always = doctrine.rules.findIndex((rule) => rule.when.kind === "always");
  return always < 0 ? [] : doctrine.rules.slice(always + 1).map((rule) => rule.id);
}
