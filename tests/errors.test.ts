import { assert, assertEquals } from "@std/assert"
import { ColumnLifecycleError } from "../src/errors.ts"

Deno.test("ColumnLifecycleError - carries the supplied reason as the message", () => {
  const error = new ColumnLifecycleError("assets not loaded")
  assertEquals(error.message, "assets not loaded")
})

Deno.test("ColumnLifecycleError - sets the error name", () => {
  assertEquals(new ColumnLifecycleError("boom").name, "ColumnLifecycleError")
})

Deno.test("ColumnLifecycleError - exposes a discriminating tag", () => {
  assertEquals(new ColumnLifecycleError("boom").tag, "ColumnLifecycleError")
})

Deno.test("ColumnLifecycleError - is an instance of Error", () => {
  assert(new ColumnLifecycleError("boom") instanceof Error)
})
