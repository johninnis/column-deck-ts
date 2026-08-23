import { assertEquals, assertRejects } from "@std/assert"
import { DOMParser, Element as DenoDomElement } from "deno-dom"
import { createColumnDeck } from "../src/column-deck.ts"
import { createColumnDefinition } from "../src/column-base.ts"
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
  Reflect.set(globalThis, "requestAnimationFrame", (cb: FrameRequestCallback): number => {
    cb(0)
    return 0
  })
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

interface DeckOverrides {
  readonly isMobile?: boolean
  readonly saved?: string | null
  readonly initialMobileHistory?: ReadonlyArray<{ type: string; entityId: string | null }>
}

const makeDeck = async (overrides: DeckOverrides = {}) => {
  const mountElement = document.createElement("main")
  const store: { data: string | null } = { data: overrides.saved ?? null }
  const assetCalls: Array<string> = []
  const teardowns: Array<string> = []
  const refreshes: Array<string> = []
  const pinnedChanges: Array<ReadonlyArray<{ type: string; entityId: string | null }>> = []

  const assetLoader = {
    loadCss: (path: string): Promise<void> => {
      assetCalls.push(path)
      return Promise.resolve()
    },
    loadHtml: (path: string): Promise<void> => {
      assetCalls.push(path)
      return Promise.resolve()
    },
    loadJs: (): Promise<void> => Promise.resolve(),
    cloneTemplate,
  }

  const deck = await createColumnDeck({
    mountElement,
    assetLoader,
    shellTemplate: cloneTemplate,
    persistence: {
      save: (data: string): void => {
        store.data = data
      },
      load: (): string | null => store.data,
    },
    isMobile: () => overrides.isMobile ?? false,
    initialMobileHistory: overrides.initialMobileHistory,
    assetPaths: { css: ["shared.css"], templates: ["shared.html"] },
    onPinnedColumnsChange: (cols) => pinnedChanges.push(cols),
    columnDefinitions: [
      createColumnDefinition({
        type: "feed",
        label: "Feed",
        onRender: (_el, context) => {
          context.onTeardown(() => teardowns.push("feed"))
          return Promise.resolve()
        },
        onRefresh: () => {
          refreshes.push("feed")
          return Promise.resolve()
        },
      }),
      createColumnDefinition({
        type: "note",
        label: "Note",
        singleton: false,
        onRender: () => Promise.resolve(),
      }),
    ],
    services: {},
  })

  return { deck, mountElement, store, assetCalls, teardowns, refreshes, pinnedChanges }
}

Deno.test("createColumnDeck - loads shared assets and launches registered columns", async () => {
  const { deck, mountElement, assetCalls } = await makeDeck()
  assertEquals(assetCalls, ["shared.css", "shared.html"])

  const key = await deck.launchColumn("feed")
  assertEquals(key, "feed")
  assertEquals(deck.getColumnCount(), 1)
  assertEquals(mountElement.querySelectorAll("[data-column]").length, 1)
  deck.destroy()
})

Deno.test("createColumnDeck - rejects an unregistered column type", async () => {
  const { deck } = await makeDeck()
  await assertRejects(() => deck.launchColumn("missing"), ColumnLifecycleError)
  deck.destroy()
})

Deno.test("createColumnDeck - closeColumn removes the column and persists the layout", async () => {
  const { deck, store } = await makeDeck()
  const key = await deck.launchColumn("feed")
  deck.closeColumn(key)
  assertEquals(deck.getColumnCount(), 0)
  assertEquals(store.data, JSON.stringify({ columns: [] }))
  deck.destroy()
})

Deno.test("createColumnDeck - refreshColumn runs the definition's onRefresh", async () => {
  const { deck, refreshes } = await makeDeck()
  const key = await deck.launchColumn("feed")
  await deck.refreshColumn(key)
  assertEquals(refreshes, ["feed"])
  deck.destroy()
})

Deno.test("createColumnDeck - without overrides it uses the default shell, a session-storage layout and the browser asset loader", async () => {
  sessionStorage.removeItem("column-deck")
  Reflect.set(globalThis, "matchMedia", (): { matches: boolean } => ({ matches: true }))
  const mountElement = document.createElement("main")
  const deck = await createColumnDeck({
    mountElement,
    columnDefinitions: [
      createColumnDefinition({
        type: "feed",
        label: "Feed",
        onRender: (content) => {
          content.textContent = "rendered"
          return Promise.resolve()
        },
      }),
    ],
    services: {},
  })
  await deck.launchColumn("feed")
  const shell = mountElement.querySelector("[data-column]")
  assertEquals(shell?.querySelector("[data-title]")?.textContent, "Feed")
  assertEquals(shell?.querySelector("[data-content]")?.textContent, "rendered")
  assertEquals(JSON.parse(sessionStorage.getItem("column-deck") ?? "null")?.columns?.length, 1)
  deck.destroy()
  sessionStorage.removeItem("column-deck")
})

Deno.test("createColumnDeck - getFocusedColumnElement returns the column the user last focused", async () => {
  const { deck, mountElement } = await makeDeck()
  await deck.launchColumn("feed")
  const column = mountElement.querySelector("[data-column]")
  if (!(column instanceof HTMLElement)) throw new Error("column missing")
  column.dispatchEvent(new Event("click"))
  assertEquals(deck.getFocusedColumnElement(), column)
  deck.destroy()
})

Deno.test("createColumnDeck - undo re-opens the last closed column", async () => {
  const { deck } = await makeDeck()
  const key = await deck.launchColumn("note", "x")
  deck.closeColumn(key)
  await deck.undo()
  assertEquals(deck.getState().columns[0]?.entityId, "x")
  deck.destroy()
})

Deno.test("createColumnDeck - setPinned updates state and notifies the host", async () => {
  const { deck, pinnedChanges } = await makeDeck()
  const key = await deck.launchColumn("feed")
  deck.setPinned(key, true)
  assertEquals(deck.getState().columns[0]?.pinned, true)
  assertEquals(pinnedChanges.at(-1), [{ type: "feed", entityId: null }])
  deck.destroy()
})

Deno.test("createColumnDeck - restores persisted columns on construction", async () => {
  const saved = JSON.stringify({ columns: [{ type: "feed", entityId: null, pinned: false }] })
  const { deck } = await makeDeck({ saved })
  assertEquals(deck.getColumnCount(), 1)
  assertEquals(deck.getState().columns[0]?.type, "feed")
  deck.destroy()
})

Deno.test("createColumnDeck - owns the mobile history and exposes it read-only", async () => {
  const { deck } = await makeDeck({
    isMobile: true,
    initialMobileHistory: [{ type: "feed", entityId: null }],
  })
  assertEquals(deck.getMobileHistory(), [{ type: "feed", entityId: null }])

  await deck.launchColumn("feed")
  await deck.launchColumn("note", "deep")
  assertEquals(deck.getMobileHistory().length, 2)

  await deck.goBack()
  assertEquals(deck.getMobileHistory(), [{ type: "feed", entityId: null }])
  assertEquals(deck.getState().columns[0]?.type, "feed")
  deck.destroy()
})

Deno.test("createColumnDeck - destroy closes all columns and runs their teardowns", async () => {
  const { deck, mountElement, teardowns } = await makeDeck()
  await deck.launchColumn("feed")
  await deck.launchColumn("note", "a")
  deck.destroy()
  assertEquals(deck.getColumnCount(), 0)
  assertEquals(mountElement.querySelectorAll("[data-column]").length, 0)
  assertEquals(teardowns, ["feed"])
})
