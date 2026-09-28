import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { sunDirection } from "../lighting/LightRig";
import { useLook } from "../look/LookContext";
import { applyBackdrop, BACKDROP_GLSL, BACKDROP_UNIFORMS } from "../shaders/backdrop";
import { NOISE_GLSL } from "../shaders/noise";

/**
 * Diorama backdrop (screen-space dusk gradient, stars at night) plus a thin
 * sea of cloud far below the island so the cliffs appear to hang in the air.
 */
export function SkyDome() {
  const { preset } = useLook();

  const sky = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { ...BACKDROP_UNIFORMS, uStars: { value: 0 } },
        vertexShader: /* glsl */ `
          void main() {
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uStars;
          ${BACKDROP_GLSL}
          ${NOISE_GLSL}
          void main() {
            vec3 col = backdropColor(gl_FragCoord.xy);
            float y = gl_FragCoord.y / uBgResolution.y;
            if (uStars > 0.0 && y > 0.35) {
              vec2 sp = floor(gl_FragCoord.xy / 3.0);
              float st = step(0.996, hash12(sp));
              float tw = 0.6 + 0.4 * hash12(sp + 3.1);
              col += vec3(0.9, 0.9, 1.0) * st * tw * uStars * smoothstep(0.35, 0.9, y);
            }
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  );

  const clouds = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTime: { value: 0 },
          uLit: { value: new THREE.Color() },
          uShade: { value: new THREE.Color() },
        },
        vertexShader: /* glsl */ `
          varying vec2 vPos;
          void main() {
            vPos = (modelMatrix * vec4(position, 1.0)).xz;
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uLit, uShade;
          varying vec2 vPos;
          ${NOISE_GLSL}
          void main() {
            vec2 p = vPos * 0.06 + vec2(uTime * 0.004, uTime * 0.002);
            float n = fbm(p);
            float n2 = fbm(p * 2.7 - vec2(uTime * 0.006, 0.0));
            float c = smoothstep(0.5, 0.85, n * 0.75 + n2 * 0.35);
            float edge = smoothstep(90.0, 30.0, length(vPos));
            vec3 col = mix(uShade, uLit, smoothstep(0.3, 0.9, n2));
            gl_FragColor = vec4(col, c * edge * 0.55);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  );

  useMemo(() => {
    applyBackdrop(preset, sunDirection(preset.sun.azimuth, preset.sun.elevation));
    const zenith = new THREE.Color(preset.sky.zenith);
    sky.uniforms.uStars.value = Math.max(0, 1 - (zenith.r + zenith.g + zenith.b) * 40);
    clouds.uniforms.uLit.value.set(preset.sky.horizon).lerp(new THREE.Color(preset.sun.color), 0.25);
    clouds.uniforms.uShade.value.set(preset.sky.mid).lerp(new THREE.Color(preset.sky.below), 0.4);
  }, [preset, sky, clouds]);

  useFrame((state, dt) => {
    clouds.uniforms.uTime.value += dt;
    BACKDROP_UNIFORMS.uBgResolution.value.set(
      state.size.width * state.viewport.dpr,
      state.size.height * state.viewport.dpr,
    );
  });

  return (
    <>
      <mesh material={sky} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[120, 32, 16]} />
      </mesh>
      <mesh material={clouds} rotation={[-Math.PI / 2, 0, 0]} position={[0, -7, 0]} renderOrder={-5}>
        <planeGeometry args={[220, 220, 1, 1]} />
      </mesh>
    </>
  );
}
