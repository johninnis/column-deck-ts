import { assertEquals } from "@std/assert"
import { createColumn } from "../src/column-state.ts"
import {
  clearStack,
  historyOf,
  type MobileStack,
  popTop,
  seedStack,
  suspendOnto,
  unwindTo,
} from "../src/column-mobile-stack.ts"

const column = (type: string, entityId: string | null = null) =>
  createColumn({ type, entityId, singleton: entityId === null })

const suspendMany = (stack: MobileStack, columns: ReadonlyArray<ReturnType<typeof column>>): MobileStack =>
  columns.reduce<MobileStack>((acc, col) => suspendOnto(acc, col, 0).stack, stack)

Deno.test("seedStack turns history entries into cold entries and historyOf reads them back", () => {
  const stack = seedStack([{ type: "feed", entityId: null }, { type: "note", entityId: "1" }])
  assertEquals(historyOf(stack), [{ type: "feed", entityId: null }, { type: "note", entityId: "1" }])
})

Deno.test("suspendOnto pushes the column and destroys nothing while under the cap", () => {
  const change = suspendOnto([], column("feed"), 120)
  assertEquals([change.destroyed, historyOf(change.stack), change.stack[0]?.kind], [[], [{
    type: "feed",
    entityId: null,
  }], "suspended"])
})

Deno.test("suspendOnto cools the oldest suspended entry once the cap is exceeded, keeping its place in history", () => {
  const first = column("note", "0")
  const stack = suspendMany([], [first, ...Array.from({ length: 7 }, (_, i) => column("note", String(i + 1)))])
  const change = suspendOnto(stack, column("note", "8"), 0)
  assertEquals(
    [change.destroyed, change.stack[0]?.kind, change.stack.length, historyOf(change.stack)[0]],
    [[first], "cold", 9, { type: "note", entityId: "0" }],
  )
})

Deno.test("popTop returns the top entry and the rest; null on an empty stack", () => {
  const stack = suspendMany([], [column("feed"), column("note", "1")])
  const popped = popTop(stack)
  assertEquals([popped?.entry.kind, historyOf(popped?.stack ?? []), popTop([])], ["suspended", [{
    type: "feed",
    entityId: null,
  }], null])
})

Deno.test("unwindTo returns the most recent suspended entry for the key, what was above it for destruction, and the stack below", () => {
  const feed = column("feed")
  const widget = column("widget")
  const note = column("note", "1")
  const stack = suspendMany([], [feed, widget, note])
  const unwound = unwindTo(stack, "feed")
  assertEquals([unwound?.target.column, unwound?.destroyed, unwound?.stack], [feed, [widget, note], []])
})

Deno.test("unwindTo ignores cold entries and returns null when the key is not suspended", () => {
  const stack = suspendMany(seedStack([{ type: "feed", entityId: null }]), [column("note", "1")])
  assertEquals(unwindTo(stack, "feed"), null)
})

Deno.test("clearStack empties the stack and destroys every suspended column", () => {
  const feed = column("feed")
  const stack = suspendMany(seedStack([{ type: "note", entityId: "0" }]), [feed])
  assertEquals(clearStack(stack), { stack: [], destroyed: [feed] })
})
