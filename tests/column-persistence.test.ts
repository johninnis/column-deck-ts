import { assertEquals } from "@std/assert"
import { parseSavedColumns, serialiseColumns } from "../src/column-persistence.ts"
import { addColumn, createColumn, createColumnState } from "../src/column-state.ts"

Deno.test("parseSavedColumns - reads the columns field of the wrapper object", () => {
  const columns = parseSavedColumns(JSON.stringify({
    columns: [
      { type: "feed", entityId: null, pinned: true },
      { type: "profile", entityId: "abc" },
    ],
  }))
  assertEquals(columns, [
    { type: "feed", entityId: null, pinned: true },
    { type: "profile", entityId: "abc", pinned: false },
  ])
})

Deno.test("parseSavedColumns - rejects a bare array; only the serialised wrapper format is accepted", () => {
  assertEquals(parseSavedColumns(JSON.stringify([{ type: "feed" }])), [])
})

Deno.test("parseSavedColumns - returns [] for invalid JSON", () => {
  assertEquals(parseSavedColumns("{not json"), [])
})

Deno.test("parseSavedColumns - returns [] when the payload is neither array nor wrapper", () => {
  assertEquals(parseSavedColumns(JSON.stringify({ foo: "bar" })), [])
  assertEquals(parseSavedColumns(JSON.stringify("a string")), [])
})

Deno.test("parseSavedColumns - skips entries that are not objects or lack a string type", () => {
  const columns = parseSavedColumns(JSON.stringify({
    columns: [
      { type: "feed" },
      "not an object",
      { entityId: "x" },
      { type: 42 },
    ],
  }))
  assertEquals(columns, [{ type: "feed", entityId: null, pinned: false }])
})

Deno.test("parseSavedColumns - coerces a non-string entityId and a non-true pinned", () => {
  const columns = parseSavedColumns(JSON.stringify({ columns: [{ type: "feed", entityId: 123, pinned: "yes" }] }))
  assertEquals(columns, [{ type: "feed", entityId: null, pinned: false }])
})

Deno.test("serialiseColumns - empty state serialises to an empty columns array", () => {
  assertEquals(serialiseColumns(createColumnState()), JSON.stringify({ columns: [] }))
})

Deno.test("serialiseColumns - keeps only type, entityId, and pinned per column", () => {
  let state = createColumnState()
  state = addColumn(state, createColumn({ type: "feed", entityId: null, pinned: true, spawnedFrom: "ignored" }))
  state = addColumn(state, createColumn({ type: "profile", entityId: "abc" }))
  assertEquals(
    serialiseColumns(state),
    JSON.stringify({
      columns: [
        { type: "feed", entityId: null, pinned: true },
        { type: "profile", entityId: "abc", pinned: false },
      ],
    }),
  )
})

Deno.test("serialiseColumns / parseSavedColumns round-trip preserves the saved descriptors", () => {
  let state = createColumnState()
  state = addColumn(state, createColumn({ type: "feed", pinned: true }))
  state = addColumn(state, createColumn({ type: "profile", entityId: "abc" }))

  assertEquals(parseSavedColumns(serialiseColumns(state)), [
    { type: "feed", entityId: null, pinned: true },
    { type: "profile", entityId: "abc", pinned: false },
  ])
})
