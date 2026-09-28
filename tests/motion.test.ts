import { assertEquals } from "@std/assert"
import { scrollBehaviour } from "../src/motion.ts"

const withMatchMedia = (reduce: boolean | null, body: () => void): void => {
  const original = Reflect.get(globalThis, "matchMedia")
  if (reduce === null) Reflect.deleteProperty(globalThis, "matchMedia")
  else Reflect.set(globalThis, "matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce") }))
  try {
    body()
  } finally {
    if (original === undefined) Reflect.deleteProperty(globalThis, "matchMedia")
    else Reflect.set(globalThis, "matchMedia", original)
  }
}

Deno.test("scrollBehaviour - scrolls smoothly by default", () => {
  withMatchMedia(false, () => assertEquals(scrollBehaviour(), "smooth"))
})

Deno.test("scrollBehaviour - jumps when the reader asks for reduced motion", () => {
  withMatchMedia(true, () => assertEquals(scrollBehaviour(), "auto"))
})

Deno.test("scrollBehaviour - scrolls smoothly where the environment cannot say", () => {
  withMatchMedia(null, () => assertEquals(scrollBehaviour(), "smooth"))
})
