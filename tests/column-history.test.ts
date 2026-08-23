import { assertEquals } from "@std/assert"
import { type ClosedColumnsHistory, recordClosed, takeLastClosed } from "../src/column-history.ts"

Deno.test("takeLastClosed returns null for an empty history", () => {
  assertEquals(takeLastClosed([]), null)
})

Deno.test("recordClosed appends and takeLastClosed returns entries in LIFO order without mutating", () => {
  const first = { type: "feed", entityId: null, afterKey: null }
  const second = { type: "profile", entityId: "abc", afterKey: "feed" }
  const history = recordClosed(recordClosed([], first), second)
  const taken = takeLastClosed(history)
  assertEquals([taken?.entry, takeLastClosed(taken?.history ?? [])?.entry, history.length], [second, first, 2])
})

Deno.test("recordClosed caps the history at 50 entries, dropping the oldest", () => {
  let history: ClosedColumnsHistory = []
  for (let i = 0; i < 55; i++) history = recordClosed(history, { type: `col-${i}`, entityId: null, afterKey: null })
  assertEquals([history.length, history[0]?.type, history.at(-1)?.type], [50, "col-5", "col-54"])
})
