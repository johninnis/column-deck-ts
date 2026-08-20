import { assertEquals } from "@std/assert"
import { DOMParser, Element as DenoDomElement } from "deno-dom"
import { createDragHandler } from "../src/drag-handler.ts"

let ready = false
const setup = (): void => {
  if (ready) return
  ready = true
  const doc = new DOMParser().parseFromString("<!DOCTYPE html><html><body></body></html>", "text/html")
  if (!doc) throw new Error("parse failed")
  Reflect.set(globalThis, "document", doc)
  Reflect.set(globalThis, "HTMLElement", DenoDomElement)
}
setup()

type DragListener = (event: DragEvent) => void

const makeColumn = (key: string, options: { readonly pinned?: boolean } = {}): HTMLElement => {
  const column = document.createElement("article")
  column.setAttribute("data-column", "")
  column.dataset.columnKey = key
  if (options.pinned) column.dataset.pinned = ""
  Object.defineProperty(column, "getBoundingClientRect", {
    value: (): { left: number; width: number } => ({ left: 100, width: 100 }),
    configurable: true,
  })
  return column
}

interface Harness {
  readonly container: HTMLElement
  readonly columns: ReadonlyArray<HTMLElement>
  readonly reorders: ReadonlyArray<{ from: number; to: number }>
  readonly fire: (type: string, event: Partial<DragEvent>) => void
  readonly listenerCount: () => number
  readonly detach: () => void
}

const makeHarness = (options: { readonly isMobile?: boolean; readonly pinnedFirst?: boolean } = {}): Harness => {
  const container = document.createElement("main")
  const columns = [
    makeColumn("a", { pinned: options.pinnedFirst ?? false }),
    makeColumn("b"),
    makeColumn("c"),
  ]
  columns.forEach((column) => container.appendChild(column))

  // deno-dom computes the reference index before detaching an already-inserted node,
  // misplacing forward moves; detaching first restores spec-compliant behaviour.
  const originalInsertBefore = container.insertBefore.bind(container)
  Object.defineProperty(container, "insertBefore", {
    value: (node: HTMLElement, ref: Node | null): Node => {
      node.remove()
      return originalInsertBefore(node, ref)
    },
    configurable: true,
  })

  const listeners = new Map<string, DragListener>()
  Object.defineProperty(container, "addEventListener", {
    value: (type: string, listener: DragListener): void => {
      listeners.set(type, listener)
    },
    configurable: true,
  })
  Object.defineProperty(container, "removeEventListener", {
    value: (type: string): void => {
      listeners.delete(type)
    },
    configurable: true,
  })

  const reorders: Array<{ from: number; to: number }> = []
  const handler = createDragHandler({
    containerElement: container,
    onReorder: (from, to) => reorders.push({ from, to }),
    isMobile: () => options.isMobile ?? false,
  })
  handler.attach()

  const fire = (type: string, event: Partial<DragEvent>): void => {
    const listener = listeners.get(type)
    if (!listener) throw new Error(`no listener for ${type}`)
    // deno-lint-ignore innis/no-type-assertions
    listener({ preventDefault: () => {}, ...event } as unknown as DragEvent)
  }

  return { container, columns, reorders, fire, listenerCount: () => listeners.size, detach: handler.detach }
}

const makeDataTransfer = (): {
  effectAllowed: string
  dropEffect: string
  data: Array<string>
  setData: (format: string, value: string) => void
} => {
  const data: Array<string> = []
  return {
    effectAllowed: "",
    dropEffect: "",
    data,
    setData: (_format: string, value: string): void => {
      data.push(value)
    },
  }
}

Deno.test("createDragHandler - dragstart marks the column and writes its key to the data transfer", () => {
  const { columns, fire } = makeHarness()
  const dataTransfer = makeDataTransfer()
  // deno-lint-ignore innis/no-type-assertions
  fire("dragstart", { target: columns[1], dataTransfer: dataTransfer as unknown as DataTransfer })
  assertEquals(columns[1]?.hasAttribute("data-dragging"), true)
  assertEquals(dataTransfer.effectAllowed, "move")
  assertEquals(dataTransfer.data, ["b"])
})

Deno.test("createDragHandler - dragstart is ignored on mobile", () => {
  const { columns, fire } = makeHarness({ isMobile: true })
  fire("dragstart", { target: columns[1] })
  assertEquals(columns[1]?.hasAttribute("data-dragging"), false)
})

Deno.test("createDragHandler - dragging left of a column's midpoint moves the dragged element before it", () => {
  const { container, columns, fire, reorders } = makeHarness()
  fire("dragstart", { target: columns[1] })
  fire("dragover", { target: columns[0], clientX: 120 })
  fire("dragend", {})
  assertEquals(
    Array.from(container.querySelectorAll("[data-column]")).map((el) => el.getAttribute("data-column-key")),
    ["b", "a", "c"],
  )
  assertEquals(reorders, [{ from: 1, to: 0 }])
  assertEquals(columns[1]?.hasAttribute("data-dragging"), false)
})

Deno.test("createDragHandler - dragging right of a column's midpoint moves the dragged element after it", () => {
  const { container, columns, fire, reorders } = makeHarness()
  fire("dragstart", { target: columns[0] })
  fire("dragover", { target: columns[1], clientX: 180 })
  fire("dragend", {})
  assertEquals(
    Array.from(container.querySelectorAll("[data-column]")).map((el) => el.getAttribute("data-column-key")),
    ["b", "a", "c"],
  )
  assertEquals(reorders, [{ from: 0, to: 1 }])
})

Deno.test("createDragHandler - dragover over a pinned column is ignored", () => {
  const { container, columns, fire, reorders } = makeHarness({ pinnedFirst: true })
  fire("dragstart", { target: columns[1] })
  fire("dragover", { target: columns[0], clientX: 120 })
  fire("dragend", {})
  assertEquals(
    Array.from(container.querySelectorAll("[data-column]")).map((el) => el.getAttribute("data-column-key")),
    ["a", "b", "c"],
  )
  assertEquals(reorders, [])
})

Deno.test("createDragHandler - dragend without movement does not report a reorder", () => {
  const { columns, fire, reorders } = makeHarness()
  fire("dragstart", { target: columns[1] })
  fire("dragend", {})
  assertEquals(reorders, [])
})

Deno.test("createDragHandler - detach removes the container listeners", () => {
  const { listenerCount, detach } = makeHarness()
  assertEquals(listenerCount(), 3)
  detach()
  assertEquals(listenerCount(), 0)
})
