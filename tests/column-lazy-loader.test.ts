import { assertEquals } from "@std/assert"
import { DOMParser, Element as DenoDomElement } from "deno-dom"
import type { Column } from "../src/column-state.ts"
import type { ColumnShell } from "../src/column-shell.ts"
import { createColumnLazyLoader } from "../src/column-lazy-loader.ts"

interface ObserverInstance {
  readonly observed: ReadonlySet<HTMLElement>
  readonly fire: (target: HTMLElement, isIntersecting: boolean) => void
}

const installFakeIntersectionObserver = (): { readonly instances: ReadonlyArray<ObserverInstance> } => {
  const instances: Array<ObserverInstance> = []

  class FakeIntersectionObserver {
    readonly #observed = new Set<HTMLElement>()
    readonly #callback: IntersectionObserverCallback
    constructor(callback: IntersectionObserverCallback) {
      this.#callback = callback
      instances.push({
        observed: this.#observed,
        fire: (target, isIntersecting) => {
          // deno-lint-ignore innis/no-type-assertions
          const entry = { target, isIntersecting } as unknown as IntersectionObserverEntry
          // deno-lint-ignore innis/no-type-assertions
          this.#callback([entry], this as unknown as IntersectionObserver)
        },
      })
    }
    observe(target: HTMLElement): void {
      this.#observed.add(target)
    }
    unobserve(target: HTMLElement): void {
      this.#observed.delete(target)
    }
    disconnect(): void {
      this.#observed.clear()
    }
  }

  Reflect.set(globalThis, "IntersectionObserver", FakeIntersectionObserver)
  return { instances }
}

let domReady = false
const setupDom = (): void => {
  if (domReady) return
  domReady = true
  const doc = new DOMParser().parseFromString("<!DOCTYPE html><html><body></body></html>", "text/html")
  if (!doc) throw new Error("parse failed")
  Reflect.set(globalThis, "document", doc)
  Reflect.set(globalThis, "HTMLElement", DenoDomElement)
}

const makeColumn = (type: string): Column => ({
  type,
  entityId: null,
  key: type,
  spawnedFrom: null,
  pinned: false,
})

const makeElement = (column: Column): HTMLElement => {
  const element = document.createElement("article")
  element.dataset.columnKey = column.key
  return element
}

const makeShell = (element: HTMLElement): ColumnShell => ({
  element,
  getContentElement: () => element,
  setPinned: () => {},
  updateTitle: () => {},
  updateMenuItems: () => {},
  updateListItems: () => {},
  updateHeaderStatus: () => {},
  destroy: () => {},
})

const requireObserver = (instances: ReadonlyArray<ObserverInstance>): ObserverInstance => {
  const first = instances[0]
  if (!first) throw new Error("expected observer to be created")
  return first
}

Deno.test("createColumnLazyLoader - fires loadColumn when an enqueued element becomes visible", () => {
  setupDom()
  const handle = installFakeIntersectionObserver()
  const mountElement = document.createElement("div")
  const loaded: Array<string> = []

  const loader = createColumnLazyLoader({
    mountElement,
    loadColumn: (column) => loaded.push(column.type),
  })

  const column = makeColumn("feed")
  const element = makeElement(column)
  loader.enqueue(column, makeShell(element))

  const observer = requireObserver(handle.instances)
  assertEquals(observer.observed.has(element), true)
  observer.fire(element, true)

  assertEquals(loaded, ["feed"])
  assertEquals(observer.observed.has(element), false)
})

Deno.test("createColumnLazyLoader - ignores non-intersecting entries", () => {
  setupDom()
  const handle = installFakeIntersectionObserver()
  const mountElement = document.createElement("div")
  const loaded: Array<string> = []

  const loader = createColumnLazyLoader({
    mountElement,
    loadColumn: (column) => loaded.push(column.type),
  })

  const column = makeColumn("feed")
  const element = makeElement(column)
  loader.enqueue(column, makeShell(element))

  const observer = requireObserver(handle.instances)
  observer.fire(element, false)

  assertEquals(loaded, [])
  assertEquals(observer.observed.has(element), true)
})

Deno.test("createColumnLazyLoader - cancel unobserves and prevents the load", () => {
  setupDom()
  const handle = installFakeIntersectionObserver()
  const mountElement = document.createElement("div")
  const loaded: Array<string> = []

  const loader = createColumnLazyLoader({
    mountElement,
    loadColumn: (column) => loaded.push(column.type),
  })

  const column = makeColumn("feed")
  const element = makeElement(column)
  loader.enqueue(column, makeShell(element))
  loader.cancel(column.key)

  const observer = requireObserver(handle.instances)
  assertEquals(observer.observed.has(element), false)

  observer.fire(element, true)
  assertEquals(loaded, [])
})

Deno.test("createColumnLazyLoader - cancel on a key that was never enqueued is a no-op", () => {
  setupDom()
  installFakeIntersectionObserver()
  const mountElement = document.createElement("div")
  const loader = createColumnLazyLoader({ mountElement, loadColumn: () => {} })
  loader.cancel("missing")
})

Deno.test("createColumnLazyLoader - reuses a single observer across enqueues", () => {
  setupDom()
  const handle = installFakeIntersectionObserver()
  const mountElement = document.createElement("div")

  const loader = createColumnLazyLoader({ mountElement, loadColumn: () => {} })

  const a = makeColumn("a")
  const b = makeColumn("b")
  loader.enqueue(a, makeShell(makeElement(a)))
  loader.enqueue(b, makeShell(makeElement(b)))

  assertEquals(handle.instances.length, 1)
  const observer = requireObserver(handle.instances)
  assertEquals(observer.observed.size, 2)
})
