import { assertEquals } from "@std/assert"
import { DOMParser, Element as DenoDomElement } from "deno-dom"
import type { DropTarget } from "../src/column-layout.ts"
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

const makeColumn = (key: string): HTMLElement => {
  const column = document.createElement("article")
  column.setAttribute("data-column", "")
  column.dataset.columnKey = key
  Object.defineProperty(column, "getBoundingClientRect", {
    value: (): { left: number; width: number } => ({ left: 100, width: 100 }),
    configurable: true,
  })
  return column
}

interface Harness {
  readonly container: HTMLElement
  readonly columns: ReadonlyArray<HTMLElement>
  readonly drags: ReadonlyArray<{ key: string; target: DropTarget }>
  readonly fire: (type: string, event: FakeDragEvent) => void
  readonly listenerCount: () => number
  readonly detach: () => void
}

interface FakeDragEvent {
  readonly target?: EventTarget | undefined
  readonly dataTransfer?: DataTransfer | undefined
  readonly clientX?: number | undefined
}

const makeHarness = (options: { readonly isMobile?: boolean } = {}): Harness => {
  const container = document.createElement("main")
  const columns = [makeColumn("a"), makeColumn("b"), makeColumn("c")]
  columns.forEach((column) => container.appendChild(column))

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

  const drags: Array<{ key: string; target: DropTarget }> = []
  const handler = createDragHandler({
    containerElement: container,
    onDragOver: (key, target) => drags.push({ key, target }),
    isMobile: () => options.isMobile ?? false,
  })
  handler.attach()

  const fire = (type: string, event: FakeDragEvent): void => {
    const listener = listeners.get(type)
    if (!listener) throw new Error(`no listener for ${type}`)
    listener({ preventDefault: () => {}, ...event } as unknown as DragEvent)
  }

  return { container, columns, drags, fire, listenerCount: () => listeners.size, detach: handler.detach }
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

const keysOf = (container: HTMLElement): ReadonlyArray<string | null> =>
  Array.from(container.querySelectorAll("[data-column]")).map((el) => el.getAttribute("data-column-key"))

Deno.test("createDragHandler - dragging left of a column's midpoint asks to drop before it and moves nothing itself", () => {
  const { container, columns, fire, drags } = makeHarness()
  fire("dragstart", { target: columns[1] })
  fire("dragover", { target: columns[0], clientX: 120 })
  assertEquals([drags, keysOf(container)], [[{ key: "b", target: { key: "a", side: "before" } }], ["a", "b", "c"]])
})

Deno.test("createDragHandler - dragging right of a column's midpoint asks to drop after it", () => {
  const { columns, fire, drags } = makeHarness()
  fire("dragstart", { target: columns[0] })
  fire("dragover", { target: columns[1], clientX: 180 })
  assertEquals(drags, [{ key: "a", target: { key: "b", side: "after" } }])
})

Deno.test("createDragHandler - dragging over the dragged column itself asks nothing", () => {
  const { columns, fire, drags } = makeHarness()
  fire("dragstart", { target: columns[1] })
  fire("dragover", { target: columns[1], clientX: 120 })
  assertEquals(drags, [])
})

Deno.test("createDragHandler - dragend clears the dragging marker and ends the drag", () => {
  const { columns, fire, drags } = makeHarness()
  fire("dragstart", { target: columns[1] })
  fire("dragend", {})
  fire("dragover", { target: columns[0], clientX: 120 })
  assertEquals([columns[1]?.hasAttribute("data-dragging"), drags], [false, []])
})

Deno.test("createDragHandler - detach removes the container listeners", () => {
  const { listenerCount, detach } = makeHarness()
  assertEquals(listenerCount(), 3)
  detach()
  assertEquals(listenerCount(), 0)
})
