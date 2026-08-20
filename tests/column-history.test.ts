import { assertEquals } from "@std/assert"
import { createClosedColumnsHistory } from "../src/column-history.ts"

Deno.test("createClosedColumnsHistory - takeLast returns undefined when empty", () => {
  const history = createClosedColumnsHistory()
  assertEquals(history.takeLast(), undefined)
})

Deno.test("createClosedColumnsHistory - returns recorded entries in LIFO order", () => {
  const history = createClosedColumnsHistory()
  history.record({ type: "feed", entityId: null, afterKey: null })
  history.record({ type: "profile", entityId: "abc", afterKey: "feed" })

  assertEquals(history.takeLast(), { type: "profile", entityId: "abc", afterKey: "feed" })
  assertEquals(history.takeLast(), { type: "feed", entityId: null, afterKey: null })
  assertEquals(history.takeLast(), undefined)
})

Deno.test("createClosedColumnsHistory - takeLast removes the entry so it is not returned twice", () => {
  const history = createClosedColumnsHistory()
  history.record({ type: "feed", entityId: null, afterKey: null })
  history.takeLast()
  assertEquals(history.takeLast(), undefined)
})

Deno.test("createClosedColumnsHistory - caps the stack at 50 entries, dropping the oldest", () => {
  const history = createClosedColumnsHistory()
  for (let i = 0; i < 55; i++) {
    history.record({ type: `col-${i}`, entityId: null, afterKey: null })
  }
  const drained: Array<string> = []
  let entry = history.takeLast()
  while (entry) {
    drained.push(entry.type)
    entry = history.takeLast()
  }
  assertEquals(drained.length, 50)
  assertEquals(drained[0], "col-54")
  assertEquals(drained.at(-1), "col-5")
})
