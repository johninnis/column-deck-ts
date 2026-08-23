import { assertEquals } from "@std/assert"
import { DOMParser, Element as DenoDomElement } from "deno-dom"
import { createKeyboardHandler } from "../src/keyboard-handler.ts"
import type { KeyboardHandlerDeps } from "../src/keyboard-handler.ts"

let activeElement: HTMLElement | null = null

let ready = false
const setup = (): void => {
  if (ready) return
  ready = true
  const doc = new DOMParser().parseFromString("<!DOCTYPE html><html><body></body></html>", "text/html")
  if (!doc) throw new Error("parse failed")
  Reflect.set(globalThis, "document", doc)
  Reflect.set(globalThis, "HTMLElement", DenoDomElement)
  Object.defineProperty(DenoDomElement.prototype, "focus", {
    value(this: HTMLElement): void {
      activeElement = this
    },
    configurable: true,
  })
  Object.defineProperty(DenoDomElement.prototype, "blur", {
    value(this: HTMLElement): void {
      Reflect.set(this, "__blurred", true)
      if (activeElement === this) activeElement = null
    },
    configurable: true,
  })
  Object.defineProperty(DenoDomElement.prototype, "scrollTo", {
    value(options: ScrollToOptions): void {
      Reflect.set(this, "__lastScrollTo", options)
    },
    configurable: true,
  })
}
setup()

interface KeyModifiers {
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
  readonly shiftKey?: boolean
  readonly defaultPrevented?: boolean
}

interface DocumentStub {
  readonly press: (key: string, modifiers?: KeyModifiers) => { readonly prevented: boolean }
  readonly setActiveElement: (element: HTMLElement | null) => void
  readonly activeElement: () => HTMLElement | null
  readonly listenerCount: () => number
  readonly restore: () => void
}

const installDocumentStub = (): DocumentStub => {
  const original = Reflect.get(globalThis, "document")
  const listeners = new Set<(event: KeyboardEvent) => void>()
  activeElement = null
  Reflect.set(globalThis, "document", {
    addEventListener: (_type: string, listener: (event: KeyboardEvent) => void): void => {
      listeners.add(listener)
    },
    removeEventListener: (_type: string, listener: (event: KeyboardEvent) => void): void => {
      listeners.delete(listener)
    },
    get activeElement(): HTMLElement | null {
      return activeElement
    },
  })
  return {
    press: (key, modifiers = {}) => {
      let prevented = false
      // deno-lint-ignore innis/no-type-assertions
      const event = {
        key,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        defaultPrevented: false,
        ...modifiers,
        preventDefault: (): void => {
          prevented = true
        },
      } as unknown as KeyboardEvent
      listeners.forEach((listener) => listener(event))
      return { prevented }
    },
    setActiveElement: (element) => {
      activeElement = element
    },
    activeElement: () => activeElement,
    listenerCount: () => listeners.size,
    restore: () => Reflect.set(globalThis, "document", original),
  }
}

const makeColumn = (key: string, options: { readonly pinned?: boolean } = {}): HTMLElement => {
  const column = document.createElement("article")
  column.setAttribute("data-column", "")
  column.dataset.columnKey = key
  if (options.pinned) column.dataset.pinned = ""
  column.innerHTML = "<header><h2></h2></header><div data-content></div>"
  return column
}

interface HarnessCalls {
  readonly focused: Array<string>
  readonly moved: Array<{ key: string; direction: number }>
  readonly closed: Array<string>
  readonly refreshed: Array<string>
  undone: number
}

interface Harness {
  readonly container: HTMLElement
  readonly columns: ReadonlyArray<HTMLElement>
  readonly stub: DocumentStub
  readonly detach: () => void
  readonly calls: HarnessCalls
}

const makeHarness = (
  options: {
    readonly columns?: ReadonlyArray<HTMLElement>
    readonly focusedColumn?: number | null
    readonly deps?: Partial<KeyboardHandlerDeps>
  } = {},
): Harness => {
  const container = document.createElement("main")
  const columns = options.columns ?? [makeColumn("a"), makeColumn("b"), makeColumn("c")]
  columns.forEach((column) => container.appendChild(column))
  const focusedIndex = options.focusedColumn === undefined ? 0 : options.focusedColumn

  const calls: HarnessCalls = {
    focused: [],
    moved: [],
    closed: [],
    refreshed: [],
    undone: 0,
  }

  const stub = installDocumentStub()
  const handler = createKeyboardHandler({
    containerElement: container,
    getLastFocusedElement: () => focusedIndex === null ? null : columns[focusedIndex] ?? null,
    onFocusColumn: (key) => calls.focused.push(key),
    onUndo: () => calls.undone++,
    onMoveColumn: (key, direction) => {
      calls.moved.push({ key, direction })
      return true
    },
    onClose: (key) => calls.closed.push(key),
    onRefresh: (key) => calls.refreshed.push(key),
    ...options.deps,
  })
  handler.attach()

  return { container, columns, stub, detach: handler.detach, calls }
}

const withHarness = (options: Parameters<typeof makeHarness>[0], fn: (harness: Harness) => void): void => {
  const harness = makeHarness(options)
  try {
    fn(harness)
  } finally {
    harness.stub.restore()
  }
}

Deno.test("createKeyboardHandler - ArrowRight focuses the next column", () => {
  withHarness({}, ({ stub, calls }) => {
    const { prevented } = stub.press("ArrowRight")
    assertEquals(prevented, true)
    assertEquals(calls.focused, ["b"])
  })
})

Deno.test("createKeyboardHandler - ArrowLeft at the first column does nothing", () => {
  withHarness({}, ({ stub, calls }) => {
    const { prevented } = stub.press("ArrowLeft")
    assertEquals(prevented, false)
    assertEquals(calls.focused, [])
  })
})

Deno.test("createKeyboardHandler - Shift+ArrowRight moves the focused column", () => {
  withHarness({}, ({ stub, calls }) => {
    stub.press("ArrowRight", { shiftKey: true })
    assertEquals(calls.moved, [{ key: "a", direction: 1 }])
    assertEquals(calls.focused, [])
  })
})

Deno.test("createKeyboardHandler - arrows are ignored when no column is focused", () => {
  withHarness({ focusedColumn: null }, ({ stub, calls }) => {
    stub.press("ArrowRight")
    assertEquals(calls.focused, [])
  })
})

Deno.test("createKeyboardHandler - a keydown another handler already consumed is ignored", () => {
  withHarness({}, ({ stub, calls }) => {
    const { prevented } = stub.press("ArrowRight", { defaultPrevented: true })
    assertEquals(prevented, false)
    assertEquals(calls.focused, [])
  })
})

Deno.test("createKeyboardHandler - Escape blurs the active element", () => {
  withHarness({}, ({ stub, columns: [column] }) => {
    const heading = column?.querySelector("h2")
    if (!(heading instanceof HTMLElement)) throw new Error("heading missing")
    stub.setActiveElement(heading)
    stub.press("Escape")
    assertEquals(stub.activeElement(), null)
  })
})

Deno.test("createKeyboardHandler - a consuming onEscape pre-handler stops further escape handling", () => {
  withHarness({ deps: { onEscape: () => true } }, ({ stub, columns: [column] }) => {
    const heading = column?.querySelector("h2")
    if (!(heading instanceof HTMLElement)) throw new Error("heading missing")
    stub.setActiveElement(heading)
    stub.press("Escape")
    assertEquals(stub.activeElement(), heading)
  })
})

Deno.test("createKeyboardHandler - keys other than Escape are ignored while typing in an input", () => {
  const input = document.createElement("input")
  withHarness({}, ({ stub, calls }) => {
    stub.setActiveElement(input)
    stub.press("ArrowRight")
    stub.press("r")
    assertEquals(calls.focused, [])
    assertEquals(calls.refreshed, [])

    stub.press("Escape")
    assertEquals(Reflect.get(input, "__blurred"), true)
  })
})

Deno.test("createKeyboardHandler - Ctrl+Z and Cmd+Z trigger undo; plain z does not", () => {
  withHarness({}, ({ stub, calls }) => {
    stub.press("z", { ctrlKey: true })
    stub.press("z", { metaKey: true })
    stub.press("z")
    assertEquals(calls.undone, 2)
  })
})

Deno.test("createKeyboardHandler - x closes the unpinned column that contains the active element", () => {
  withHarness({}, ({ stub, columns, calls }) => {
    const heading = columns[0]?.querySelector("h2")
    if (!(heading instanceof HTMLElement)) throw new Error("heading missing")
    stub.setActiveElement(heading)
    stub.press("x")
    assertEquals(calls.closed, ["a"])
  })
})

Deno.test("createKeyboardHandler - x closes the column holding focus even when another column was focused last", () => {
  withHarness({ focusedColumn: 0 }, ({ stub, columns, calls }) => {
    const heading = columns[1]?.querySelector("h2")
    if (!(heading instanceof HTMLElement)) throw new Error("heading missing")
    stub.setActiveElement(heading)
    stub.press("x")
    assertEquals(calls.closed, ["b"])
  })
})

Deno.test("createKeyboardHandler - Ctrl+X does not close the column", () => {
  withHarness({}, ({ stub, columns, calls }) => {
    const heading = columns[0]?.querySelector("h2")
    if (!(heading instanceof HTMLElement)) throw new Error("heading missing")
    stub.setActiveElement(heading)
    stub.press("x", { ctrlKey: true })
    assertEquals(calls.closed, [])
  })
})

Deno.test("createKeyboardHandler - x is ignored for pinned columns and columns without focus", () => {
  const columns = [makeColumn("a", { pinned: true }), makeColumn("b")]
  withHarness({ columns }, ({ stub, columns: [pinned], calls }) => {
    const heading = pinned?.querySelector("h2")
    if (!(heading instanceof HTMLElement)) throw new Error("heading missing")
    stub.setActiveElement(heading)
    stub.press("x")
    assertEquals(calls.closed, [])
  })
})

Deno.test("createKeyboardHandler - r refreshes the focused column; Ctrl+R is left to the browser", () => {
  withHarness({}, ({ stub, calls }) => {
    stub.press("r")
    stub.press("r", { ctrlKey: true })
    assertEquals(calls.refreshed, ["a"])
  })
})

Deno.test("createKeyboardHandler - Home and End scroll the focused column's content", () => {
  withHarness({}, ({ stub, columns }) => {
    const content = columns[0]?.querySelector("[data-content]")
    if (!content) throw new Error("content missing")
    stub.press("End")
    assertEquals(Reflect.get(content, "__lastScrollTo"), { top: content.scrollHeight, behavior: "smooth" })
    stub.press("Home")
    assertEquals(Reflect.get(content, "__lastScrollTo"), { top: 0, behavior: "smooth" })
  })
})

Deno.test("createKeyboardHandler - detach removes the document listener", () => {
  withHarness({}, ({ stub, detach }) => {
    assertEquals(stub.listenerCount(), 1)
    detach()
    assertEquals(stub.listenerCount(), 0)
  })
})
