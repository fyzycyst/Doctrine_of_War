import { Bloom, EffectComposer, TiltShift2, ToneMapping } from "@react-three/postprocessing";
import { useFrame, useThree } from "@react-three/fiber";
import { ToneMappingMode } from "postprocessing";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useLook } from "../look/LookContext";
import { GradeEffect } from "./GradeEffect";

/**
 * Post stack. High: bloom (embers, fires, rings) + tilt-shift miniature blur on
 * the near and far rows. Low: tone mapping and grade only (tech plan: quality
 * toggle drops DOF/bloom).
 */
export function PostFX({ focusY = 0.56 }: { focusY?: number }) {
  const { preset, quality, atmosphere } = useLook();
  const gl = useThree((state) => state.gl);
  const grading = preset.grading;
  const high = quality === "high";

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

  const mode = preset.toneMapping === "agx" ? ToneMappingMode.AGX : ToneMappingMode.ACES_FILMIC;

  if (!high) {
    return (
      <EffectComposer key="low" multisampling={0}>
        <ToneMapping mode={mode} />
        <primitive object={grade} />
      </EffectComposer>
    );
  }

  return (
    <EffectComposer key="high" multisampling={4}>
      <Bloom
        mipmapBlur
        intensity={grading.bloomIntensity}
        luminanceThreshold={grading.bloomThreshold}
        luminanceSmoothing={0.2}
        radius={0.7}
      />
      {/* Separable tilt-shift: horizontal then vertical, so blur is round
          (a single TiltShift2 smears embers into diagonal streaks). */}
      <TiltShift2 blur={grading.tiltShiftBlur} taper={0.34} start={[0, focusY]} end={[1, focusY]} samples={10} direction={[1, 0]} />
      <TiltShift2 blur={grading.tiltShiftBlur} taper={0.34} start={[0, focusY]} end={[1, focusY]} samples={10} direction={[0, 1]} />
      <ToneMapping mode={mode} />
      <primitive object={grade} />
    </EffectComposer>
  );
}
