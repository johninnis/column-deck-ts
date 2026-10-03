const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

export const scrollBehaviour = (): ScrollBehavior =>
  typeof globalThis.matchMedia === "function" && globalThis.matchMedia(REDUCED_MOTION).matches ? "auto" : "smooth"
