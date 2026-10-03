import { assertEquals, assertRejects } from "@std/assert"
import { createColumnDeck } from "../src/column-deck.ts"
import { createColumnDefinition } from "../src/column-base.ts"
import { ColumnLifecycleError } from "../src/errors.ts"
import {
  captureReportedErrors,
  cloneShell,
  columnElement,
  dispatch,
  dispatchBubbled,
  inertAssetLoader,
  keysInDom,
  makeDeck,
  settle,
} from "./support/deck-harness.ts"

Deno.test("createColumnDeck - loads shared assets before anything renders", async () => {
  const loaded: Array<string> = []
  const record = (path: string): Promise<void> => {
    loaded.push(path)
    return Promise.resolve()
  }
  const deck = await createColumnDeck({
    mountElement: document.createElement("main"),
    assetLoader: { ...inertAssetLoader, loadCss: record, loadHtml: record },
    shellTemplate: cloneShell,
    persistence: { save: () => {}, load: () => null },
    isMobile: () => false,
    assetPaths: { css: ["shared.css"], templates: ["shared.html"] },
    services: {},
  })
  assertEquals(loaded, ["shared.css", "shared.html"])
  deck.destroy()
})

Deno.test("createColumnDeck - launchColumn mounts a registered column and persists the layout", async () => {
  const { deck, mountElement, store } = await makeDeck()
  const key = await deck.launchColumn("feed")
  assertEquals([key, deck.getColumnCount(), keysInDom(mountElement), store.data !== null], ["feed", 1, ["feed"], true])
  deck.destroy()
})

Deno.test("createColumnDeck - rejects an unregistered column type without touching state", async () => {
  const { deck } = await makeDeck()
  await deck.launchColumn("feed")
  await assertRejects(() => deck.launchColumn("missing"), ColumnLifecycleError)
  assertEquals(deck.getColumnCount(), 1)
  deck.destroy()
})

Deno.test("createColumnDeck - relaunching a singleton with another entity re-renders it in place under its bare key", async () => {
  const { deck, mountElement, teardowns } = await makeDeck()
  await deck.launchColumn("feed", "first")
  await deck.launchColumn("feed", "second")
  assertEquals(
    [deck.getState().columns.map((c) => [c.key, c.entityId]), columnElement(mountElement, "feed").dataset.entityId],
    [[["feed", "second"]], "second"],
  )
  assertEquals(teardowns, ["feed"])
  deck.destroy()
})

Deno.test("createColumnDeck - non-singleton columns coexist per entity", async () => {
  const { deck } = await makeDeck()
  await deck.launchColumn("note", "one")
  await deck.launchColumn("note", "two")
  await deck.launchColumn("note", "one")
  assertEquals(deck.getState().columns.map((c) => c.key), ["note:one", "note:two"])
  deck.destroy()
})

Deno.test("createColumnDeck - a column launched from another opens directly after it", async () => {
  const { deck } = await makeDeck({
    extraDefinitions: [
      createColumnDefinition({
        type: "spawner",
        label: "Spawner",
        onRender: (_el, { launchColumn }) =>
          Promise.resolve({
            refresh: async (): Promise<void> => {
              await launchColumn("note", "child")
            },
          }),
      }),
    ],
  })
  await deck.launchColumn("feed")
  await deck.launchColumn("spawner")
  await deck.launchColumn("widget")
  await deck.refreshColumn("spawner")
  assertEquals(deck.getState().columns.map((c) => c.key), ["feed", "spawner", "note:child", "widget"])
  deck.destroy()
})

Deno.test("createColumnDeck - closeColumn removes the column, runs its teardowns and persists", async () => {
  const { deck, store, teardowns } = await makeDeck()
  const key = await deck.launchColumn("feed")
  await deck.closeColumn(key)
  assertEquals([deck.getColumnCount(), store.data, teardowns], [0, JSON.stringify({ columns: [] }), ["feed"]])
  deck.destroy()
})

Deno.test("createColumnDeck - undo re-opens the last closed column where it was", async () => {
  const { deck, mountElement } = await makeDeck()
  await deck.launchColumn("note", "a")
  await deck.launchColumn("note", "b")
  await deck.launchColumn("note", "c")
  await deck.closeColumn("note:b")
  await deck.undo()
  assertEquals(keysInDom(mountElement), ["note:a", "note:b", "note:c"])
  deck.destroy()
})

Deno.test("createColumnDeck - undo re-opens a head-closed column at the head", async () => {
  const { deck, mountElement } = await makeDeck()
  await deck.launchColumn("note", "a")
  await deck.launchColumn("note", "b")
  await deck.closeColumn("note:a")
  await deck.undo()
  assertEquals([deck.getState().columns.map((c) => c.key), keysInDom(mountElement)], [
    ["note:a", "note:b"],
    ["note:a", "note:b"],
  ])
  deck.destroy()
})

Deno.test("createColumnDeck - undo of a relaunched singleton restores the closed entity instead of duplicating it", async () => {
  const { deck } = await makeDeck()
  await deck.launchColumn("feed", "a")
  await deck.closeColumn("feed")
  await deck.launchColumn("feed", "b")
  await deck.undo()
  assertEquals(deck.getState().columns.map((c) => [c.key, c.entityId]), [["feed", "a"]])
  deck.destroy()
})

Deno.test("createColumnDeck - refreshColumn runs the refresh the column's render returned", async () => {
  const { deck, refreshes } = await makeDeck()
  await deck.launchColumn("feed")
  await deck.refreshColumn("feed")
  assertEquals(refreshes, ["feed"])
  deck.destroy()
})

Deno.test("createColumnDeck - refreshing a column without its own refresh re-renders it, reloading its assets", async () => {
  const loadedCss: Array<string> = []
  const { deck } = await makeDeck({
    assetLoader: {
      ...inertAssetLoader,
      loadCss: (path: string): Promise<void> => {
        loadedCss.push(path)
        return Promise.resolve()
      },
    },
    extraDefinitions: [
      createColumnDefinition({ type: "styled", label: "Styled", css: "styled.css", onRender: () => Promise.resolve() }),
    ],
  })
  await deck.launchColumn("styled")
  await deck.refreshColumn("styled")
  assertEquals(loadedCss, ["styled.css", "styled.css"])
  deck.destroy()
})

Deno.test("createColumnDeck - a column closed while its assets load never renders", async () => {
  const { promise: cssGate, resolve: releaseCss } = Promise.withResolvers<void>()
  const renders: Array<string> = []
  const { deck } = await makeDeck({
    assetLoader: { ...inertAssetLoader, loadCss: () => cssGate },
    extraDefinitions: [
      createColumnDefinition({
        type: "styled",
        label: "Styled",
        css: "styled.css",
        onRender: () => {
          renders.push("styled")
          return Promise.resolve()
        },
      }),
    ],
  })
  const launch = deck.launchColumn("styled")
  await settle()
  await deck.closeColumn("styled")
  releaseCss()
  await launch
  assertEquals(renders, [])
  deck.destroy()
})

Deno.test("createColumnDeck - destroy during asset load does not render into a dead shell", async () => {
  const { promise: cssGate, resolve: releaseCss } = Promise.withResolvers<void>()
  const renders: Array<string> = []
  const { deck } = await makeDeck({
    assetLoader: { ...inertAssetLoader, loadCss: () => cssGate },
    extraDefinitions: [
      createColumnDefinition({
        type: "styled",
        label: "Styled",
        css: "styled.css",
        onRender: () => {
          renders.push("styled")
          return Promise.resolve()
        },
      }),
    ],
  })
  const launch = deck.launchColumn("styled")
  deck.destroy()
  releaseCss()
  await launch
  assertEquals(renders, [])
})

Deno.test("createColumnDeck - a header control whose handler rejects reports the failure instead of leaving it unhandled", async () => {
  const reported = captureReportedErrors()
  try {
    const failure = new Error("refresh failed")
    const { deck, mountElement } = await makeDeck({
      extraDefinitions: [
        createColumnDefinition({
          type: "failing",
          label: "Failing",
          onRender: () => Promise.resolve({ refresh: () => Promise.reject(failure) }),
        }),
      ],
    })
    await deck.launchColumn("failing")
    dispatch(columnElement(mountElement, "failing").querySelector("[data-refresh-btn]"), "click")
    await settle()
    assertEquals(reported.errors, [failure])
    deck.destroy()
  } finally {
    reported.restore()
  }
})

Deno.test("createColumnDeck - a column with default options shows pin, refresh and close but no lists or menu", async () => {
  const { deck, mountElement } = await makeDeck()
  await deck.launchColumn("widget")
  const shell = columnElement(mountElement, "widget")
  assertEquals(
    ["[data-pin-btn]", "[data-refresh-btn]", "[data-close-btn]", "[data-lists-wrapper]", "[data-menu-wrapper]"].map(
      (selector) => shell.querySelector(selector) !== null,
    ),
    [true, true, true, false, false],
  )
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
  await deck.launchColumn("widget")
  const feed = columnElement(mountElement, "feed")
  dispatch(feed, "click")
  assertEquals(deck.getFocusedColumnElement(), feed)
  deck.destroy()
})

Deno.test("createColumnDeck - restores persisted columns on construction", async () => {
  const saved = JSON.stringify({ columns: [{ type: "feed", entityId: null, pinned: false }, { type: "missing" }] })
  const { deck, mountElement } = await makeDeck({ saved })
  assertEquals([deck.getState().columns.map((c) => c.key), keysInDom(mountElement)], [["feed"], ["feed"]])
  deck.destroy()
})

Deno.test("createColumnDeck - dragging a column beside another moves it in the layout and persists the order", async () => {
  const { deck, mountElement, store } = await makeDeck()
  await deck.launchColumn("note", "a")
  await deck.launchColumn("note", "b")
  await deck.launchColumn("note", "c")
  dispatchBubbled(mountElement, columnElement(mountElement, "note:c").querySelector("header"), { type: "dragstart" })
  dispatchBubbled(mountElement, columnElement(mountElement, "note:a"), { type: "dragover", clientX: 10 })
  dispatchBubbled(mountElement, columnElement(mountElement, "note:c"), { type: "dragend" })
  assertEquals(
    [deck.getState().columns.map((c) => c.key), keysInDom(mountElement), JSON.parse(store.data ?? "{}").columns[0]],
    [["note:c", "note:a", "note:b"], ["note:c", "note:a", "note:b"], { type: "note", entityId: "c", pinned: false }],
  )
  deck.destroy()
})

Deno.test("createColumnDeck - destroy closes all columns and runs their teardowns", async () => {
  const { deck, mountElement, teardowns } = await makeDeck()
  await deck.launchColumn("feed")
  await deck.launchColumn("widget")
  deck.destroy()
  assertEquals([deck.getColumnCount(), keysInDom(mountElement), teardowns], [0, [], ["feed", "widget"]])
})

Deno.test("createColumnDeck - pressing x closes the focused column", async () => {
  const { deck, mountElement } = await makeDeck()
  await deck.launchColumn("feed")
  await deck.launchColumn("widget")
  dispatch(columnElement(mountElement, "feed"), "click")
  dispatch(document, "keydown", { key: "x" })
  await settle()
  assertEquals(deck.getState().columns.map((c) => c.key), ["widget"])
  deck.destroy()
})

Deno.test("createColumnDeck - middle-clicking a column's header closes it", async () => {
  const { deck, mountElement } = await makeDeck()
  await deck.launchColumn("feed")
  dispatch(columnElement(mountElement, "feed").querySelector("header"), "auxclick", { button: 1 })
  await settle()
  assertEquals(deck.getColumnCount(), 0)
  deck.destroy()
})
