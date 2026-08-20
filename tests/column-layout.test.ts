import { assertEquals } from "@std/assert"
import { DOMParser, Element as DenoDomElement } from "deno-dom"
import type { ColumnKey, ColumnState } from "../src/column-state.ts"
import { addColumn, createColumn, createColumnState } from "../src/column-state.ts"
import { applyLayoutOp, moveColumnByKeyboard, repositionPinned, resolveInsertAfterKey } from "../src/column-layout.ts"
import type { LayoutDeps } from "../src/column-layout.ts"

let domReady = false
const setupDom = (): void => {
  if (domReady) return
  domReady = true
  const doc = new DOMParser().parseFromString("<!DOCTYPE html><html><body></body></html>", "text/html")
  if (!doc) throw new Error("parse failed")
  Reflect.set(globalThis, "document", doc)
  Reflect.set(globalThis, "HTMLElement", DenoDomElement)
}

interface World {
  readonly state: ColumnState
  readonly elements: ReadonlyMap<ColumnKey, HTMLElement>
  readonly deps: LayoutDeps
}

const requireElement = (elements: ReadonlyMap<ColumnKey, HTMLElement>, key: ColumnKey): HTMLElement => {
  const el = elements.get(key)
  if (!el) throw new Error(`missing test element ${key}`)
  return el
}

const buildWorld = (entries: ReadonlyArray<{ type: string; pinned?: boolean }>): World => {
  setupDom()
  const elements = new Map<ColumnKey, HTMLElement>()
  let state = createColumnState()
  entries.forEach(({ type, pinned }) => {
    const column = createColumn({ type, pinned: pinned ?? false })
    state = addColumn(state, column)
    const element = document.createElement("article")
    element.dataset.column = type
    elements.set(column.key, element)
  })
  return { state, elements, deps: { getElement: (key) => elements.get(key) } }
}

Deno.test("resolveInsertAfterKey - returns null when spawnedFrom is null", () => {
  assertEquals(resolveInsertAfterKey(createColumnState(), null), null)
})

Deno.test("resolveInsertAfterKey - returns null when spawnedFrom is not in state", () => {
  assertEquals(resolveInsertAfterKey(buildWorld([{ type: "feed" }]).state, "missing"), null)
})

Deno.test("resolveInsertAfterKey - returns spawnedFrom when it sits outside the pinned region", () => {
  const { state } = buildWorld([
    { type: "pinned-a", pinned: true },
    { type: "regular-a" },
    { type: "regular-b" },
  ])
  assertEquals(resolveInsertAfterKey(state, "regular-a"), "regular-a")
})

Deno.test("resolveInsertAfterKey - bumps to the last pinned key when spawn happens inside the pinned region", () => {
  const { state } = buildWorld([
    { type: "pinned-a", pinned: true },
    { type: "pinned-b", pinned: true },
    { type: "regular" },
  ])
  assertEquals(resolveInsertAfterKey(state, "pinned-a"), "pinned-b")
})

Deno.test("resolveInsertAfterKey - returns the spawn key when it is the last pinned column", () => {
  const { state } = buildWorld([
    { type: "pinned-a", pinned: true },
    { type: "pinned-b", pinned: true },
    { type: "regular" },
  ])
  assertEquals(resolveInsertAfterKey(state, "pinned-b"), "pinned-b")
})

Deno.test("repositionPinned - pinning moves the column to the end of the pinned region and plans an insert-before its successor", () => {
  const { state, elements, deps } = buildWorld([
    { type: "pinned-a", pinned: true },
    { type: "regular-a" },
    { type: "regular-b" },
  ])

  const result = repositionPinned({ state, key: "regular-b", pinned: true, deps })

  assertEquals(result.state.columns.map((c) => c.type), ["pinned-a", "regular-b", "regular-a"])
  assertEquals(result.element, requireElement(elements, "regular-b"))
  assertEquals(result.op, {
    kind: "insert-before",
    element: requireElement(elements, "regular-b"),
    anchor: requireElement(elements, "regular-a"),
  })
})

Deno.test("repositionPinned - unpinning moves the column to the head of the regular region", () => {
  const { state, elements, deps } = buildWorld([
    { type: "pinned-a", pinned: true },
    { type: "pinned-b", pinned: true },
    { type: "regular-a" },
  ])

  const result = repositionPinned({ state, key: "pinned-a", pinned: false, deps })

  assertEquals(result.state.columns.map((c) => c.type), ["pinned-b", "pinned-a", "regular-a"])
  assertEquals(result.op, {
    kind: "insert-before",
    element: requireElement(elements, "pinned-a"),
    anchor: requireElement(elements, "regular-a"),
  })
})

Deno.test("repositionPinned - pinning into an empty pinned region prepends", () => {
  const { state, elements, deps } = buildWorld([{ type: "regular-a" }, { type: "regular-b" }])

  const result = repositionPinned({ state, key: "regular-b", pinned: true, deps })

  assertEquals(result.state.columns.map((c) => c.type), ["regular-b", "regular-a"])
  assertEquals(result.op, { kind: "prepend", element: requireElement(elements, "regular-b") })
})

Deno.test("repositionPinned - returns no op when the column is already at the target index", () => {
  const { state, deps } = buildWorld([
    { type: "pinned-a", pinned: true },
    { type: "regular-a" },
  ])

  const result = repositionPinned({ state, key: "regular-a", pinned: false, deps })

  assertEquals(result.op, null)
  assertEquals(result.state.columns.map((c) => c.type), ["pinned-a", "regular-a"])
})

Deno.test("moveColumnByKeyboard - moves right and plans insert-before the new successor", () => {
  const { state, elements, deps } = buildWorld([
    { type: "regular-a" },
    { type: "regular-b" },
    { type: "regular-c" },
  ])

  const result = moveColumnByKeyboard({ state, key: "regular-a", direction: 1, deps })

  assertEquals(result.moved, true)
  assertEquals(result.state.columns.map((c) => c.type), ["regular-b", "regular-a", "regular-c"])
  assertEquals(result.op, {
    kind: "insert-before",
    element: requireElement(elements, "regular-a"),
    anchor: requireElement(elements, "regular-c"),
  })
})

Deno.test("moveColumnByKeyboard - moves right to the end and plans an append", () => {
  const { state, elements, deps } = buildWorld([{ type: "regular-a" }, { type: "regular-b" }])

  const result = moveColumnByKeyboard({ state, key: "regular-a", direction: 1, deps })

  assertEquals(result.moved, true)
  assertEquals(result.state.columns.map((c) => c.type), ["regular-b", "regular-a"])
  assertEquals(result.op, { kind: "append", element: requireElement(elements, "regular-a") })
})

Deno.test("moveColumnByKeyboard - moves left and plans a prepend when landing at index zero", () => {
  const { state, elements, deps } = buildWorld([{ type: "regular-a" }, { type: "regular-b" }])

  const result = moveColumnByKeyboard({ state, key: "regular-b", direction: -1, deps })

  assertEquals(result.moved, true)
  assertEquals(result.state.columns.map((c) => c.type), ["regular-b", "regular-a"])
  assertEquals(result.op, { kind: "prepend", element: requireElement(elements, "regular-b") })
})

Deno.test("moveColumnByKeyboard - refuses to cross from regular into pinned region", () => {
  const { state, deps } = buildWorld([
    { type: "pinned-a", pinned: true },
    { type: "regular-a" },
  ])

  const result = moveColumnByKeyboard({ state, key: "regular-a", direction: -1, deps })

  assertEquals(result.moved, false)
  assertEquals(result.op, null)
})

Deno.test("moveColumnByKeyboard - refuses to cross from pinned into regular region", () => {
  const { state, deps } = buildWorld([
    { type: "pinned-a", pinned: true },
    { type: "regular-a" },
  ])

  const result = moveColumnByKeyboard({ state, key: "pinned-a", direction: 1, deps })

  assertEquals(result.moved, false)
  assertEquals(result.op, null)
})

Deno.test("moveColumnByKeyboard - refuses to move past the ends of the column list", () => {
  const { state, deps } = buildWorld([{ type: "regular-a" }, { type: "regular-b" }])

  assertEquals(moveColumnByKeyboard({ state, key: "regular-a", direction: -1, deps }).moved, false)
  assertEquals(moveColumnByKeyboard({ state, key: "regular-b", direction: 1, deps }).moved, false)
})

Deno.test("moveColumnByKeyboard - refuses to move a column that is not in state", () => {
  const { state, deps } = buildWorld([{ type: "regular-a" }])

  assertEquals(moveColumnByKeyboard({ state, key: "missing", direction: 1, deps }).moved, false)
})

Deno.test("moveColumnByKeyboard - refuses to move when the DOM element is missing", () => {
  const { state } = buildWorld([{ type: "regular-a" }, { type: "regular-b" }])
  const result = moveColumnByKeyboard({
    state,
    key: "regular-a",
    direction: 1,
    deps: { getElement: () => undefined },
  })
  assertEquals(result.moved, false)
})

Deno.test("applyLayoutOp - prepend places the element first in the mount", () => {
  setupDom()
  const mount = document.createElement("div")
  const existing = document.createElement("span")
  mount.appendChild(existing)
  const incoming = document.createElement("article")
  applyLayoutOp(mount, { kind: "prepend", element: incoming })
  assertEquals(mount.firstChild, incoming)
})

Deno.test("applyLayoutOp - append places the element last in the mount", () => {
  setupDom()
  const mount = document.createElement("div")
  const existing = document.createElement("span")
  mount.appendChild(existing)
  const incoming = document.createElement("article")
  applyLayoutOp(mount, { kind: "append", element: incoming })
  assertEquals(mount.lastChild, incoming)
})

Deno.test("applyLayoutOp - insert-before places the element directly in front of the anchor", () => {
  setupDom()
  const mount = document.createElement("div")
  const first = document.createElement("span")
  const anchor = document.createElement("span")
  mount.appendChild(first)
  mount.appendChild(anchor)
  const incoming = document.createElement("article")
  applyLayoutOp(mount, { kind: "insert-before", element: incoming, anchor })
  assertEquals(Array.from(mount.children), [first, incoming, anchor])
})
