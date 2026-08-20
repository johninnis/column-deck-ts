import { assertEquals, assertRejects } from "@std/assert"
import { DOMParser, Element as DenoDomElement } from "deno-dom"
import { createColumnManager } from "../src/column-manager.ts"
import { createColumnDefinition } from "../src/column-base.ts"
import { createColumnRegistry } from "../src/column-registry.ts"
import { ColumnLifecycleError } from "../src/errors.ts"

const TEMPLATE_HTML = `<article data-column>
  <header draggable="true">
    <h2 data-title></h2>
    <nav>
      <button data-pin-btn type="button"></button>
      <div data-menu-wrapper>
        <button data-menu-btn type="button"></button>
        <ul data-menu-list></ul>
      </div>
      <div data-lists-wrapper>
        <button data-lists-btn type="button"></button>
        <ul data-lists-list></ul>
      </div>
      <button data-refresh-btn type="button"></button>
      <button data-close-btn type="button"></button>
    </nav>
  </header>
  <div data-content></div>
</article>`

let ready = false
const setup = (): void => {
  if (ready) return
  ready = true
  const doc = new DOMParser().parseFromString("<!DOCTYPE html><html><body></body></html>", "text/html")
  if (!doc) throw new Error("parse failed")
  Reflect.set(globalThis, "document", doc)
  Reflect.set(globalThis, "Element", DenoDomElement)
  Reflect.set(globalThis, "HTMLElement", DenoDomElement)
  Reflect.set(globalThis, "HTMLButtonElement", DenoDomElement)
  Reflect.set(globalThis, "requestAnimationFrame", (_cb: FrameRequestCallback): number => 0)
  Reflect.set(
    globalThis,
    "IntersectionObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
  Object.defineProperty(DenoDomElement.prototype, "focus", { value: () => {}, configurable: true })
  Object.defineProperty(DenoDomElement.prototype, "scrollIntoView", { value: () => {}, configurable: true })
}
setup()

const cloneTemplate = (): DocumentFragment => {
  const div = document.createElement("div")
  div.innerHTML = TEMPLATE_HTML
  // deno-lint-ignore innis/no-type-assertions
  return { firstElementChild: div.firstElementChild } as unknown as DocumentFragment
}

const assetLoader = {
  loadCss: (): Promise<void> => Promise.resolve(),
  loadHtml: (): Promise<void> => Promise.resolve(),
  loadJs: (): Promise<void> => Promise.resolve(),
  cloneTemplate,
}

interface HarnessOverrides {
  readonly isMobile?: boolean
  readonly saved?: string | null
}

const makeHarness = (overrides: HarnessOverrides = {}) => {
  const mountElement = document.createElement("div")
  const store: { data: string | null } = { data: overrides.saved ?? null }
  const persistence = {
    save: (data: string): void => {
      store.data = data
    },
    load: (): string | null => store.data,
  }
  const teardowns: Array<string> = []
  const columnRegistry = createColumnRegistry()
  columnRegistry.register(
    "feed",
    createColumnDefinition({ type: "feed", label: "Feed", onRender: () => Promise.resolve() }),
  )
  columnRegistry.register(
    "note",
    createColumnDefinition({ type: "note", label: "Note", singleton: false, onRender: () => Promise.resolve() }),
  )
  columnRegistry.register(
    "widget",
    createColumnDefinition({
      type: "widget",
      label: "Widget",
      onRender: (_el, context) => {
        context.onTeardown(() => teardowns.push("widget"))
        return Promise.resolve()
      },
    }),
  )

  const pinnedChanges: Array<ReadonlyArray<{ type: string; entityId: string | null }>> = []
  let mobileHistoryChanges = 0

  const manager = createColumnManager({
    mountElement,
    persistence,
    assetLoader,
    columnRegistry,
    isMobile: () => overrides.isMobile ?? false,
    onPinnedColumnsChange: (cols) => pinnedChanges.push(cols),
    onMobileHistoryChange: () => mobileHistoryChanges++,
    services: {},
  })

  return {
    manager,
    mountElement,
    store,
    teardowns,
    pinnedChanges,
    getMobileHistoryChanges: () => mobileHistoryChanges,
  }
}

Deno.test("createColumnManager - launchColumn adds a column and persists", async () => {
  const { manager, store } = makeHarness()
  await manager.launchColumn("feed")
  assertEquals(manager.getColumnCount(), 1)
  assertEquals(manager.getState().columns[0]?.type, "feed")
  assertEquals(store.data !== null, true)
})

Deno.test("createColumnManager - singleton relaunch updates entityId in place", async () => {
  const { manager } = makeHarness()
  await manager.launchColumn("feed")
  await manager.launchColumn("feed", "abc")
  assertEquals(manager.getColumnCount(), 1)
  assertEquals(manager.getState().columns[0]?.entityId, "abc")
})

Deno.test("createColumnManager - non-singleton columns coexist per entityId", async () => {
  const { manager } = makeHarness()
  await manager.launchColumn("note", "one")
  await manager.launchColumn("note", "two")
  assertEquals(manager.getColumnCount(), 2)
})

Deno.test("createColumnManager - closeColumn removes the column", async () => {
  const { manager } = makeHarness()
  const key = await manager.launchColumn("feed")
  manager.closeColumn(key)
  assertEquals(manager.getColumnCount(), 0)
})

Deno.test("createColumnManager - undo restores the last closed column", async () => {
  const { manager } = makeHarness()
  const key = await manager.launchColumn("note", "x")
  manager.closeColumn(key)
  assertEquals(manager.getColumnCount(), 0)
  await manager.undo()
  assertEquals(manager.getColumnCount(), 1)
  assertEquals(manager.getState().columns[0]?.entityId, "x")
})

Deno.test("createColumnManager - setPinned marks the column and notifies", async () => {
  const { manager, pinnedChanges } = makeHarness()
  const key = await manager.launchColumn("feed")
  manager.setPinned(key, true)
  assertEquals(manager.getState().columns.find((c) => c.key === key)?.pinned, true)
  assertEquals(pinnedChanges.at(-1)?.length, 1)
})

Deno.test("createColumnManager - reorder moves a column", async () => {
  const { manager } = makeHarness()
  await manager.launchColumn("note", "a")
  await manager.launchColumn("note", "b")
  manager.reorder(0, 1)
  assertEquals(manager.getState().columns.map((c) => c.entityId), ["b", "a"])
})

Deno.test("createColumnManager - mobile launch records history and goBack restores", async () => {
  const { manager, getMobileHistoryChanges } = makeHarness({ isMobile: true })
  await manager.launchColumn("feed")
  await manager.launchColumn("note", "deep")
  assertEquals(manager.getColumnCount(), 1)
  assertEquals(manager.getState().columns[0]?.type, "note")
  assertEquals(manager.getMobileHistory().length, 1)

  await manager.goBack()
  assertEquals(manager.getState().columns[0]?.type, "feed")
  assertEquals(getMobileHistoryChanges() >= 1, true)
})

Deno.test("createColumnManager - init restores columns from saved state", async () => {
  const saved = JSON.stringify({ columns: [{ type: "feed", entityId: null, pinned: false }] })
  const { manager } = makeHarness({ saved })
  await manager.init()
  assertEquals(manager.getColumnCount(), 1)
  assertEquals(manager.getState().columns[0]?.type, "feed")
})

Deno.test("createColumnManager - destroy closes every open column and runs registered teardowns", async () => {
  const { manager, mountElement, teardowns } = makeHarness()
  await manager.launchColumn("feed")
  await manager.launchColumn("widget")
  manager.destroy()
  assertEquals(manager.getColumnCount(), 0)
  assertEquals(mountElement.querySelectorAll("[data-column]").length, 0)
  assertEquals(teardowns, ["widget"])
})

Deno.test("createColumnManager - launching an unregistered type throws without touching state", async () => {
  const { manager } = makeHarness()
  await manager.launchColumn("feed")
  await assertRejects(() => manager.launchColumn("missing"), ColumnLifecycleError)
  assertEquals(manager.getColumnCount(), 1)
})

Deno.test("createColumnManager - mobile launch of an unregistered type throws before wiping the deck", async () => {
  const { manager } = makeHarness({ isMobile: true })
  await manager.launchColumn("feed")
  await assertRejects(() => manager.launchColumn("missing"), ColumnLifecycleError)
  assertEquals(manager.getColumnCount(), 1)
  assertEquals(manager.getMobileHistory().length, 0)
})

Deno.test("createColumnManager - undo focuses an already-relaunched column instead of duplicating it", async () => {
  const { manager } = makeHarness()
  const key = await manager.launchColumn("feed")
  manager.closeColumn(key)
  await manager.launchColumn("feed")
  await manager.undo()
  assertEquals(manager.getColumnCount(), 1)
  assertEquals(manager.getState().columns.filter((c) => c.key === "feed").length, 1)
})

Deno.test("createColumnManager - singleton column keeps its bare key and syncs the entity dataset", async () => {
  const { manager, mountElement } = makeHarness()
  await manager.launchColumn("feed", "first")
  await manager.launchColumn("feed", "second")
  const column = manager.getState().columns[0]
  assertEquals(column?.key, "feed")
  assertEquals(column?.entityId, "second")
  const element = mountElement.querySelector("[data-column]")
  assertEquals(element?.getAttribute("data-entity-id"), "second")
})

Deno.test("createColumnManager - re-rendering a column runs its previous teardowns", async () => {
  const { manager, teardowns } = makeHarness()
  const key = await manager.launchColumn("widget")
  await manager.refreshColumn(key)
  assertEquals(teardowns, ["widget"])
})

Deno.test("createColumnManager - undo restores a head-closed column to the first position", async () => {
  const { manager, mountElement } = makeHarness()
  const noteKey = await manager.launchColumn("note", "a")
  await manager.launchColumn("note", "b")
  manager.closeColumn(noteKey)
  await manager.undo()
  assertEquals(manager.getState().columns.map((c) => c.entityId), ["a", "b"])
  const elements = Array.from(mountElement.querySelectorAll("[data-column]"))
  assertEquals(elements.map((el) => el.getAttribute("data-entity-id")), ["a", "b"])
})

Deno.test("createColumnManager - destroy during asset load does not render into a dead shell", async () => {
  const renders: Array<string> = []
  let releaseCss = (): void => {}
  const gate = new Promise<void>((resolve) => {
    releaseCss = resolve
  })
  const columnRegistry = createColumnRegistry()
  columnRegistry.register(
    "slow",
    createColumnDefinition({
      type: "slow",
      label: "Slow",
      css: "slow.css",
      onRender: () => {
        renders.push("slow")
        return Promise.resolve()
      },
    }),
  )
  const manager = createColumnManager({
    mountElement: document.createElement("div"),
    persistence: { save: (): void => {}, load: (): string | null => null },
    assetLoader: { ...assetLoader, loadCss: (): Promise<void> => gate },
    columnRegistry,
    isMobile: () => false,
    onPinnedColumnsChange: () => {},
    onMobileHistoryChange: () => {},
    services: {},
  })

  const launch = manager.launchColumn("slow")
  manager.destroy()
  releaseCss()
  await launch
  assertEquals(renders, [])
})
