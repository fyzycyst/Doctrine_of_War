import { lazy, Suspense } from "react";

const Scene = lazy(async () => {
  const module = await import("./Scene");
  return { default: module.Scene };
});

export function SceneBackground() {
  if (import.meta.env.VITEST) {
    return null;
  }

  return (
    <div className="scene-background" aria-hidden="true">
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </div>
  );
}
