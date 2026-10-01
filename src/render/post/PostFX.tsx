import { Bloom, EffectComposer, TiltShift2, ToneMapping, type TiltShiftEffect } from "@react-three/postprocessing";
import { useFrame, useThree } from "@react-three/fiber";
import { ToneMappingMode } from "postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useAppStore, type DofMode } from "../../app/store";
import { useLook } from "../look/LookContext";
import { GradeEffect } from "./GradeEffect";

/**
 * Depth of field per Settings mode: blur scale and focus-band taper. "subtle"
 * is the default since playtest 1 (the old full strength blurred the player's
 * own units on the near and far rows).
 */
const DOF: Record<Exclude<DofMode, "off">, { blur: number; taper: number }> = {
  on: { blur: 0.8, taper: 0.34 },
  subtle: { blur: 0.42, taper: 0.44 },
};
/** How fast the focus band glides to a newly focused company (per second). */
const FOCUS_RATE = 3;

/**
 * Post stack. High: bloom (embers, fires, rings) + tilt-shift miniature blur on
 * the near and far rows, with the in-focus band on the active/selected company
 * (Look `dofFocus`, written by the Diorama) or at `focusY` otherwise. The
 * strength follows the store's `dofMode` ("off" drops the passes). Low: tone
 * mapping and grade only (tech plan: quality toggle drops DOF/bloom).
 */
export function PostFX({ focusY = 0.56, dof }: { focusY?: number; dof?: DofMode }) {
  const { preset, quality, atmosphere, dofFocus, reducedMotion } = useLook();
  const storeDof = useAppStore((s) => s.dofMode);
  const mode = dof ?? storeDof;
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const grading = preset.grading;
  const high = quality === "high";

  // The in-focus band glides to the focused company's screen height.
  const tiltH = useRef<TiltShiftEffect>(null);
  const tiltV = useRef<TiltShiftEffect>(null);
  const band = useRef({ y: focusY, projected: new THREE.Vector3() });
  useFrame((_, dt) => {
    const b = band.current;
    let target = focusY;
    if (dofFocus.point) {
      b.projected.copy(dofFocus.point).project(camera);
      target = THREE.MathUtils.clamp((b.projected.y + 1) / 2, 0.18, 0.86);
    }
    b.y = reducedMotion ? target : b.y + (target - b.y) * Math.min(1, dt * FOCUS_RATE);
    for (const effect of [tiltH.current, tiltV.current]) {
      if (!effect) continue;
      effect.start = [0, b.y];
      effect.end = [1, b.y];
    }
  });

  useEffect(() => {
    // ToneMappingEffect picks this up via three's `toneMappingExposure` uniform.
    gl.toneMappingExposure = preset.exposure;
  }, [gl, preset.exposure]);

  const grade = useMemo(() => new GradeEffect(grading), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Weather overlay on the grade and exposure, updated every frame so shifts cross-fade.
  const tinted = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const m = atmosphere.mix;
    gl.toneMappingExposure = preset.exposure * m.exposureScale;
    tinted.set(grading.highlightTint).lerp(m.gradeTint, Math.min(1, m.gradeTintMix));
    grade.setGrade({
      ...grading,
      saturation: grading.saturation + m.saturation,
      contrast: grading.contrast + m.contrast,
      highlightTint: `#${tinted.getHexString()}`,
      splitStrength: grading.splitStrength + m.gradeTintMix * 0.25,
    });
  });
  useEffect(() => () => grade.dispose(), [grade]);

  const toneMode = preset.toneMapping === "agx" ? ToneMappingMode.AGX : ToneMappingMode.ACES_FILMIC;

  if (!high) {
    return (
      <EffectComposer key="low" multisampling={0}>
        <ToneMapping mode={toneMode} />
        <primitive object={grade} />
      </EffectComposer>
    );
  }

  const tilt = mode === "off" ? null : DOF[mode];

  return (
    <EffectComposer key={`high-${mode}`} multisampling={4}>
      <Bloom
        mipmapBlur
        intensity={grading.bloomIntensity}
        luminanceThreshold={grading.bloomThreshold}
        luminanceSmoothing={0.2}
        radius={0.7}
      />
      {/* Separable tilt-shift: horizontal then vertical, so blur is round
          (a single TiltShift2 smears embers into diagonal streaks). Start/end
          are driven per frame from the focus band. */}
      {tilt && (
        <TiltShift2 ref={tiltH} blur={grading.tiltShiftBlur * tilt.blur} taper={tilt.taper} start={[0, focusY]} end={[1, focusY]} samples={10} direction={[1, 0]} />
      )}
      {tilt && (
        <TiltShift2 ref={tiltV} blur={grading.tiltShiftBlur * tilt.blur} taper={tilt.taper} start={[0, focusY]} end={[1, focusY]} samples={10} direction={[0, 1]} />
      )}
      <ToneMapping mode={toneMode} />
      <primitive object={grade} />
    </EffectComposer>
  );
}
