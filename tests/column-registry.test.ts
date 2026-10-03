import { assertEquals } from "@std/assert"
import { createColumnRegistry } from "../src/column-registry.ts"
import { createColumnDefinition } from "../src/column-base.ts"
import type { ColumnDefinition } from "../src/column-base.ts"

const definitionOf = (type: string): ColumnDefinition =>
  createColumnDefinition({ type, label: type, onRender: () => Promise.resolve() })

Deno.test("createColumnRegistry - has is false for a type no definition declares", () => {
  assertEquals(createColumnRegistry([definitionOf("feed")]).has("search"), false)
})

Deno.test("createColumnRegistry - get is null for a type no definition declares", () => {
  assertEquals(createColumnRegistry([definitionOf("feed")]).get("search"), null)
})

Deno.test("createColumnRegistry - has is true for a declared type", () => {
  assertEquals(createColumnRegistry([definitionOf("feed")]).has("feed"), true)
})

Deno.test("createColumnRegistry - get finds each definition by its own type", () => {
  const feed = definitionOf("feed")
  const profile = definitionOf("profile")
  const registry = createColumnRegistry([feed, profile])
  assertEquals([registry.get("feed"), registry.get("profile")], [feed, profile])
})

Deno.test("createColumnRegistry - a later definition of the same type wins", () => {
  const later = definitionOf("feed")
  assertEquals(createColumnRegistry([definitionOf("feed"), later]).get("feed"), later)
})
