const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

/** `smooth` unless the reader has asked for reduced motion, or the environment cannot say. */
export const scrollBehaviour = (): ScrollBehavior =>
  typeof globalThis.matchMedia === "function" && globalThis.matchMedia(REDUCED_MOTION).matches ? "auto" : "smooth"
