// A small fail-closed schema for untrusted pack data. Every reader returns a fresh value
// rebuilt from what it checked: objects keep only their declared keys (an unknown key is
// an error, so typos surface), strings, numbers and lists are bounded, and discriminated
// unions accept only known kinds with exactly their fields.
//
// Adding a condition, action, selector, win or defeat kind to the engine means adding it
// here too; the shipped-pack round-trip test fails until you do.
import { PackError } from "./types";

export type Reader<T> = (value: unknown, path: string) => T;

export function fail(path: string, problem: string): never {
  throw new PackError(`${path} ${problem}`);
}

const ID_PATTERN = /^[a-z0-9_]{1,64}$/;

export const text =
  (max = 200): Reader<string> =>
  (value, path) => {
    if (typeof value !== "string" || value.length === 0 || value.length > max) fail(path, `must be a string of 1..${max} characters`);
    return value;
  };

/** Free text that may be empty (briefings, flavor). */
export const prose =
  (max = 2000): Reader<string> =>
  (value, path) => {
    if (typeof value !== "string" || value.length > max) fail(path, `must be a string of at most ${max} characters`);
    return value;
  };

export const id: Reader<string> = (value, path) => {
  const result = text(64)(value, path);
  if (!ID_PATTERN.test(result)) fail(path, "must be a lowercase id ([a-z0-9_])");
  return result;
};

export const int =
  (min: number, max: number): Reader<number> =>
  (value, path) => {
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) fail(path, `must be an integer in ${min}..${max}`);
    return value === 0 ? 0 : value;
  };

export const num =
  (min: number, max: number): Reader<number> =>
  (value, path) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fail(path, `must be a number in ${min}..${max}`);
    return value === 0 ? 0 : value;
  };

export const bool: Reader<boolean> = (value, path) => {
  if (typeof value !== "boolean") fail(path, "must be true or false");
  return value;
};

export const oneOf =
  <T extends string | number>(...options: T[]): Reader<T> =>
  (value, path) => {
    if (!options.includes(value as T)) fail(path, `must be one of ${options.join(", ")}`);
    return value as T;
  };

export const list =
  <T>(item: Reader<T>, max: number, min = 0): Reader<T[]> =>
  (value, path) => {
    if (!Array.isArray(value)) fail(path, "must be a list");
    if (value.length < min || value.length > max) fail(path, `must have ${min}..${max} entries`);
    return value.map((entry, index) => item(entry, `${path}[${index}]`));
  };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

/** A declared field: required, or optional (absent stays absent). */
export interface Field<T> {
  read: Reader<T>;
  optional: boolean;
}
export const req = <T>(read: Reader<T>): Field<T> => ({ read, optional: false });
export const opt = <T>(read: Reader<T>): Field<T> => ({ read, optional: true });

type Shape = Record<string, Field<unknown>>;
type FromShape<S extends Shape> = { [K in keyof S as S[K]["optional"] extends true ? never : K]: S[K] extends Field<infer T> ? T : never } & {
  [K in keyof S as S[K]["optional"] extends true ? K : never]?: S[K] extends Field<infer T> ? T : never;
};

export const object =
  <S extends Shape>(shape: S): Reader<FromShape<S>> =>
  (value, path) => {
    if (!isPlainObject(value)) fail(path, "must be an object");
    const unknown = Object.keys(value).filter((key) => !Object.hasOwn(shape, key));
    if (unknown.length > 0) fail(path, `has unknown fields: ${unknown.join(", ")}`);
    const result: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(shape)) {
      if (!Object.hasOwn(value, key) || value[key] === undefined) {
        if (!field.optional) fail(`${path}.${key}`, "is required");
        continue;
      }
      result[key] = field.read(value[key], `${path}.${key}`);
    }
    return result as FromShape<S>;
  };

/** A map with checked keys and values (no prototype keys, bounded size). */
export const record =
  <K extends string, V>(key: Reader<K>, item: Reader<V>, max: number): Reader<Record<K, V>> =>
  (value, path) => {
    if (!isPlainObject(value)) fail(path, "must be an object");
    const entries = Object.entries(value);
    if (entries.length > max) fail(path, `has more than ${max} entries`);
    const result = {} as Record<K, V>;
    for (const [rawKey, rawValue] of entries) {
      result[key(rawKey, `${path} key`)] = item(rawValue, `${path}.${rawKey}`);
    }
    return result;
  };

/** A tagged union on `kind`: each kind has its own shape (its `kind` field is implied). */
export const union =
  <T>(shapes: Record<string, Shape>): Reader<T> =>
  (value, path) => {
    if (!isPlainObject(value)) fail(path, "must be an object");
    const kind = value.kind;
    if (typeof kind !== "string" || !Object.hasOwn(shapes, kind)) fail(`${path}.kind`, `must be one of ${Object.keys(shapes).join(", ")}`);
    const { kind: _kind, ...rest } = value;
    return { kind, ...object(shapes[kind])(rest, path) } as T;
  };
