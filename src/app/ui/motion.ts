// The app and the renderer share one reduced-motion hook: the OS preference, unless
// Settings override it (src/render/motion.ts reads the override from the app store).
export { usePrefersReducedMotion } from "../../render/motion";
