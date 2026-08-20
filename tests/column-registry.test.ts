import { assertEquals } from "@std/assert"
import { createColumnRegistry } from "../src/column-registry.ts"
import { createColumnDefinition } from "../src/column-base.ts"
import type { ColumnDefinition } from "../src/column-base.ts"

const createMockDefinition = (): ColumnDefinition =>
  createColumnDefinition({ type: "mock", label: "Mock", onRender: () => Promise.resolve() })

Deno.test("createColumnRegistry - has returns false for unregistered type", () => {
  const registry = createColumnRegistry()
  assertEquals(registry.has("feed"), false)
})

Deno.test("createColumnRegistry - get returns null for unregistered type", () => {
  const registry = createColumnRegistry()
  assertEquals(registry.get("feed"), null)
})

Deno.test("createColumnRegistry - register and has returns true", () => {
  const registry = createColumnRegistry()
  const def = createMockDefinition()
  registry.register("feed", def)
  assertEquals(registry.has("feed"), true)
})

Deno.test("createColumnRegistry - register and get returns the definition", () => {
  const registry = createColumnRegistry()
  const def = createMockDefinition()
  registry.register("feed", def)
  assertEquals(registry.get("feed"), def)
})

Deno.test("createColumnRegistry - register multiple types independently", () => {
  const registry = createColumnRegistry()
  const feedDef = createMockDefinition()
  const profileDef = createMockDefinition()
  registry.register("feed", feedDef)
  registry.register("profile", profileDef)
  assertEquals(registry.get("feed"), feedDef)
  assertEquals(registry.get("profile"), profileDef)
  assertEquals(registry.has("feed"), true)
  assertEquals(registry.has("profile"), true)
  assertEquals(registry.has("search"), false)
})

Deno.test("createColumnRegistry - register overwrites existing definition", () => {
  const registry = createColumnRegistry()
  const def1 = createMockDefinition()
  const def2 = createMockDefinition()
  registry.register("feed", def1)
  registry.register("feed", def2)
  assertEquals(registry.get("feed"), def2)
})
