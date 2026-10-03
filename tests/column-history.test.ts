import { assertEquals } from "@std/assert"
import { type ClosedColumnsHistory, recordClosed } from "../src/column-history.ts"
import { popLast } from "../src/immutable-list.ts"

Deno.test("recordClosed appends without mutating, so the last entry is the latest close", () => {
  const first = { type: "feed", entityId: null, afterKey: null }
  const second = { type: "profile", entityId: "abc", afterKey: "feed" }
  const once = recordClosed([], first)
  const history = recordClosed(once, second)
  assertEquals([popLast(history)?.last, once.length, history.length], [second, 1, 2])
})

Deno.test("recordClosed caps the history at 50 entries, dropping the oldest", () => {
  let history: ClosedColumnsHistory = []
  for (let i = 0; i < 55; i++) history = recordClosed(history, { type: `col-${i}`, entityId: null, afterKey: null })
  assertEquals([history.length, history[0]?.type, history.at(-1)?.type], [50, "col-5", "col-54"])
})
