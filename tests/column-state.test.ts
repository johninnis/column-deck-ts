import { assertEquals } from "@std/assert"
import {
  addColumn,
  createColumn,
  createColumnState,
  findColumn,
  getPinnedCount,
  insertColumnAfter,
  removeColumn,
  reorderColumns,
  setColumnPinned,
  setLastFocused,
} from "../src/column-state.ts"

Deno.test("createColumn - creates column with defaults", () => {
  const col = createColumn({ type: "feed" })
  assertEquals(col.type, "feed")
  assertEquals(col.entityId, null)
  assertEquals(col.key, "feed")
  assertEquals(col.spawnedFrom, null)
  assertEquals(col.pinned, false)
})

Deno.test("createColumn - creates column with entityId", () => {
  const col = createColumn({ type: "profile", entityId: "abc123" })
  assertEquals(col.type, "profile")
  assertEquals(col.entityId, "abc123")
  assertEquals(col.key, "profile:abc123")
})

Deno.test("createColumn - creates column with spawnedFrom", () => {
  const col = createColumn({ type: "thread", entityId: "ev1", spawnedFrom: "feed" })
  assertEquals(col.spawnedFrom, "feed")
})

Deno.test("createColumn - creates column with pinned true", () => {
  const col = createColumn({ type: "feed", pinned: true })
  assertEquals(col.pinned, true)
})

Deno.test("createColumn - singleton column keeps a bare type key even with an entityId", () => {
  const col = createColumn({ type: "feed", entityId: "abc", singleton: true })
  assertEquals(col.key, "feed")
  assertEquals(col.entityId, "abc")
})

Deno.test("createColumn - non-singleton column derives its key from type and entityId", () => {
  const col = createColumn({ type: "note", entityId: "abc", singleton: false })
  assertEquals(col.key, "note:abc")
})

Deno.test("createColumnState - creates empty state by default", () => {
  const state = createColumnState()
  assertEquals(state.columns.length, 0)
  assertEquals(state.lastFocusedKey, null)
})

Deno.test("createColumnState - creates state with initial columns", () => {
  const col = createColumn({ type: "feed" })
  const state = createColumnState([col])
  assertEquals(state.columns.length, 1)
  assertEquals(state.columns[0]?.key, "feed")
})

Deno.test("addColumn - appends column to state", () => {
  const state = createColumnState()
  const col = createColumn({ type: "feed" })
  const newState = addColumn(state, col)
  assertEquals(newState.columns.length, 1)
  assertEquals(newState.columns[0]?.key, "feed")
})

Deno.test("addColumn - preserves existing columns", () => {
  const col1 = createColumn({ type: "feed" })
  const col2 = createColumn({ type: "notifications" })
  const state = addColumn(createColumnState(), col1)
  const newState = addColumn(state, col2)
  assertEquals(newState.columns.length, 2)
  assertEquals(newState.columns[0]?.key, "feed")
  assertEquals(newState.columns[1]?.key, "notifications")
})

Deno.test("insertColumnAfter - inserts after specified key", () => {
  const col1 = createColumn({ type: "feed" })
  const col2 = createColumn({ type: "notifications" })
  const col3 = createColumn({ type: "profile", entityId: "abc" })
  let state = addColumn(createColumnState(), col1)
  state = addColumn(state, col2)
  const newState = insertColumnAfter(state, col3, "feed")
  assertEquals(newState.columns.length, 3)
  assertEquals(newState.columns[0]?.key, "feed")
  assertEquals(newState.columns[1]?.key, "profile:abc")
  assertEquals(newState.columns[2]?.key, "notifications")
})

Deno.test("insertColumnAfter - appends when key not found", () => {
  const col1 = createColumn({ type: "feed" })
  const col2 = createColumn({ type: "profile", entityId: "abc" })
  const state = addColumn(createColumnState(), col1)
  const newState = insertColumnAfter(state, col2, "nonexistent")
  assertEquals(newState.columns.length, 2)
  assertEquals(newState.columns[0]?.key, "feed")
  assertEquals(newState.columns[1]?.key, "profile:abc")
})

Deno.test("removeColumn - removes column by key", () => {
  const col1 = createColumn({ type: "feed" })
  const col2 = createColumn({ type: "notifications" })
  let state = addColumn(createColumnState(), col1)
  state = addColumn(state, col2)
  const newState = removeColumn(state, "feed")
  assertEquals(newState.columns.length, 1)
  assertEquals(newState.columns[0]?.key, "notifications")
})

Deno.test("removeColumn - clears lastFocusedKey when removed column was focused", () => {
  const col = createColumn({ type: "feed" })
  let state = addColumn(createColumnState(), col)
  state = setLastFocused(state, "feed")
  assertEquals(state.lastFocusedKey, "feed")
  const newState = removeColumn(state, "feed")
  assertEquals(newState.lastFocusedKey, null)
})

Deno.test("removeColumn - preserves lastFocusedKey when different column removed", () => {
  const col1 = createColumn({ type: "feed" })
  const col2 = createColumn({ type: "notifications" })
  let state = addColumn(createColumnState(), col1)
  state = addColumn(state, col2)
  state = setLastFocused(state, "feed")
  const newState = removeColumn(state, "notifications")
  assertEquals(newState.lastFocusedKey, "feed")
})

Deno.test("removeColumn - no-op for non-existent key", () => {
  const col = createColumn({ type: "feed" })
  const state = addColumn(createColumnState(), col)
  const newState = removeColumn(state, "nonexistent")
  assertEquals(newState.columns.length, 1)
})

Deno.test("reorderColumns - moves column from one position to another", () => {
  const col1 = createColumn({ type: "feed" })
  const col2 = createColumn({ type: "notifications" })
  const col3 = createColumn({ type: "search" })
  let state = addColumn(createColumnState(), col1)
  state = addColumn(state, col2)
  state = addColumn(state, col3)
  const newState = reorderColumns(state, 0, 2)
  assertEquals(newState.columns[0]?.key, "notifications")
  assertEquals(newState.columns[1]?.key, "search")
  assertEquals(newState.columns[2]?.key, "feed")
})

Deno.test("reorderColumns - moves column backward", () => {
  const col1 = createColumn({ type: "feed" })
  const col2 = createColumn({ type: "notifications" })
  const col3 = createColumn({ type: "search" })
  let state = addColumn(createColumnState(), col1)
  state = addColumn(state, col2)
  state = addColumn(state, col3)
  const newState = reorderColumns(state, 2, 0)
  assertEquals(newState.columns[0]?.key, "search")
  assertEquals(newState.columns[1]?.key, "feed")
  assertEquals(newState.columns[2]?.key, "notifications")
})

Deno.test("setLastFocused - sets the lastFocusedKey", () => {
  const state = createColumnState()
  const newState = setLastFocused(state, "feed")
  assertEquals(newState.lastFocusedKey, "feed")
})

Deno.test("setLastFocused - overwrites previous lastFocusedKey", () => {
  let state = createColumnState()
  state = setLastFocused(state, "feed")
  state = setLastFocused(state, "notifications")
  assertEquals(state.lastFocusedKey, "notifications")
})

Deno.test("findColumn - returns column when found", () => {
  const col = createColumn({ type: "feed" })
  const state = addColumn(createColumnState(), col)
  const found = findColumn(state, "feed")
  assertEquals(found?.key, "feed")
  assertEquals(found?.type, "feed")
})

Deno.test("findColumn - returns undefined when not found", () => {
  const state = createColumnState()
  const found = findColumn(state, "nonexistent")
  assertEquals(found, undefined)
})

Deno.test("setColumnPinned - sets pinned to true", () => {
  const col = createColumn({ type: "feed" })
  const state = addColumn(createColumnState(), col)
  const newState = setColumnPinned(state, "feed", true)
  assertEquals(newState.columns[0]?.pinned, true)
})

Deno.test("setColumnPinned - sets pinned to false", () => {
  const col = createColumn({ type: "feed", pinned: true })
  const state = addColumn(createColumnState(), col)
  const newState = setColumnPinned(state, "feed", false)
  assertEquals(newState.columns[0]?.pinned, false)
})

Deno.test("setColumnPinned - does not affect other columns", () => {
  const col1 = createColumn({ type: "feed" })
  const col2 = createColumn({ type: "notifications" })
  let state = addColumn(createColumnState(), col1)
  state = addColumn(state, col2)
  const newState = setColumnPinned(state, "feed", true)
  assertEquals(newState.columns[0]?.pinned, true)
  assertEquals(newState.columns[1]?.pinned, false)
})

Deno.test("getPinnedCount - returns zero for no pinned columns", () => {
  const col = createColumn({ type: "feed" })
  const state = addColumn(createColumnState(), col)
  assertEquals(getPinnedCount(state), 0)
})

Deno.test("getPinnedCount - counts pinned columns correctly", () => {
  const col1 = createColumn({ type: "feed", pinned: true })
  const col2 = createColumn({ type: "notifications" })
  const col3 = createColumn({ type: "search", pinned: true })
  let state = addColumn(createColumnState(), col1)
  state = addColumn(state, col2)
  state = addColumn(state, col3)
  assertEquals(getPinnedCount(state), 2)
})

Deno.test("getPinnedCount - returns zero for empty state", () => {
  const state = createColumnState()
  assertEquals(getPinnedCount(state), 0)
})
