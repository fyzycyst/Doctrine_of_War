import { useEffect, useMemo, type DependencyList } from "react";

/**
 * `useMemo` for GPU resources the component owns (geometries, materials,
 * textures, render targets): the previous value is disposed when the deps
 * change, and the last one on unmount. R3F only disposes objects it created
 * from JSX, not ones passed in through props.
 */
export function useDisposable<T extends { dispose(): void } | null | undefined>(factory: () => T, deps: DependencyList): T {
  const value = useMemo(factory, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => value?.dispose(), [value]);
  return value;
}
