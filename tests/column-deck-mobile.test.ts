import { assertEquals, assertRejects } from "@std/assert"
import { ColumnLifecycleError } from "../src/errors.ts"
import { columnElement, keysInDom, makeDeck } from "./support/deck-harness.ts"

const scrollRegionOf = (mountElement: HTMLElement, key: string): HTMLElement => {
  const content = columnElement(mountElement, key).querySelector("[data-content]")
  if (!(content instanceof HTMLElement)) throw new Error(`content missing for ${key}`)
  return content
}

Deno.test("mobile - owns the back-stack, seeded by the host and exposed read-only", async () => {
  const { deck } = await makeDeck({ isMobile: true, initialMobileHistory: [{ type: "feed", entityId: null }] })
  const seeded = deck.getMobileHistory()
  await deck.launchColumn("feed")
  await deck.launchColumn("note", "deep")
  const deep = deck.getMobileHistory().length
  await deck.goBack()
  assertEquals(
    [seeded, deep, deck.getMobileHistory(), deck.getState().columns.map((c) => c.key)],
    [[{ type: "feed", entityId: null }], 2, [{ type: "feed", entityId: null }], ["feed"]],
  )
  deck.destroy()
})

Deno.test("mobile - launching shows one column at a time and goBack returns to the previous one", async () => {
  const { deck, mobileHistoryChanges } = await makeDeck({ isMobile: true })
  await deck.launchColumn("feed")
  await deck.launchColumn("note", "deep")
  const deep = [deck.getState().columns.map((c) => c.key), deck.getMobileHistory().length]
  await deck.goBack()
  assertEquals([deep, deck.getState().columns.map((c) => c.key), mobileHistoryChanges() >= 1], [
    [["note:deep"], 1],
    ["feed"],
    true,
  ])
  deck.destroy()
})

Deno.test("mobile - launching an unregistered type throws before wiping the deck", async () => {
  const { deck } = await makeDeck({ isMobile: true })
  await deck.launchColumn("feed")
  await assertRejects(() => deck.launchColumn("missing"), ColumnLifecycleError)
  assertEquals([deck.getColumnCount(), deck.getMobileHistory().length], [1, 0])
  deck.destroy()
})

Deno.test("mobile - navigation notifies and records history as soon as the shell is mounted, not after the column renders", async () => {
  const { promise: slowRender, resolve: finishRender } = Promise.withResolvers<void>()
  const { deck, mountElement, mobileHistoryChanges } = await makeDeck({ isMobile: true, slowRender })
  await deck.launchColumn("feed")
  const changesBefore = mobileHistoryChanges()

  const launched = deck.launchColumn("slow")
  await Promise.resolve()
  const observed = {
    changes: mobileHistoryChanges() - changesBefore,
    history: deck.getMobileHistory().length,
    mounted: mountElement.querySelector('[data-column="slow"]') !== null,
  }
  finishRender()
  await launched

  assertEquals(observed, { changes: 1, history: 1, mounted: true })
  deck.destroy()
})

Deno.test("mobile - goBack re-attaches the suspended column with its scroll position", async () => {
  const { deck, mountElement } = await makeDeck({ isMobile: true })
  await deck.launchColumn("feed")
  const feedElement = columnElement(mountElement, "feed")
  scrollRegionOf(mountElement, "feed").scrollTop = 120
  await deck.launchColumn("note", "1")
  const feedGoneWhileAway = mountElement.querySelector('[data-column="feed"]') === null
  await deck.goBack()

  assertEquals(
    [
      feedGoneWhileAway,
      columnElement(mountElement, "feed") === feedElement,
      scrollRegionOf(mountElement, "feed").scrollTop,
    ],
    [true, true, 120],
  )
  deck.destroy()
})

Deno.test("mobile - suspending a column does not run its teardowns; going back keeps them", async () => {
  const { deck, teardowns } = await makeDeck({ isMobile: true })
  await deck.launchColumn("widget")
  await deck.launchColumn("note", "1")
  await deck.goBack()
  assertEquals(teardowns, [])
  deck.destroy()
})

Deno.test("mobile - launching a column already on the stack unwinds to it and closes what was above", async () => {
  const { deck, mountElement, teardowns } = await makeDeck({ isMobile: true })
  await deck.launchColumn("feed")
  const feedElement = columnElement(mountElement, "feed")
  await deck.launchColumn("widget")
  await deck.launchColumn("note", "1")
  await deck.launchColumn("feed")

  assertEquals(
    [columnElement(mountElement, "feed") === feedElement, deck.getMobileHistory().length, teardowns],
    [true, 0, ["widget"]],
  )
  deck.destroy()
})

Deno.test("mobile - destroy tears down suspended columns", async () => {
  const { deck, teardowns } = await makeDeck({ isMobile: true })
  await deck.launchColumn("widget")
  await deck.launchColumn("feed")
  deck.destroy()
  assertEquals(teardowns, ["widget", "feed"])
})

Deno.test("mobile - the oldest suspended column beyond the cap is destroyed and re-rendered fresh on return", async () => {
  const { deck, mountElement, teardowns } = await makeDeck({ isMobile: true })
  await deck.launchColumn("widget")
  for (let i = 1; i <= 9; i++) await deck.launchColumn("note", String(i))
  const destroyedWhileSuspended = [...teardowns]
  for (let i = 1; i <= 9; i++) await deck.goBack()

  assertEquals(
    [
      destroyedWhileSuspended,
      mountElement.querySelector('[data-column="widget"]') !== null,
      deck.getMobileHistory().length,
    ],
    [["widget"], true, 0],
  )
  deck.destroy()
})

Deno.test("mobile - closing the current column goes back to the previous one", async () => {
  const { deck, mountElement, teardowns } = await makeDeck({ isMobile: true })
  await deck.launchColumn("feed")
  await deck.launchColumn("widget")
  await deck.closeColumn("widget")
  assertEquals(
    [deck.getState().columns.map((c) => c.key), keysInDom(mountElement), deck.getMobileHistory().length, teardowns],
    [["feed"], ["feed"], 0, ["widget"]],
  )
  deck.destroy()
})

Deno.test("mobile - undo after a close navigates back to the closed column", async () => {
  const { deck, mountElement } = await makeDeck({ isMobile: true })
  await deck.launchColumn("feed")
  await deck.launchColumn("note", "deep")
  await deck.closeColumn("note:deep")
  await deck.undo()
  assertEquals(
    [deck.getState().columns.map((c) => c.key), keysInDom(mountElement), deck.getMobileHistory()],
    [["note:deep"], ["note:deep"], [{ type: "feed", entityId: null }]],
  )
  deck.destroy()
})

Deno.test("mobile - closing the only column empties the deck and undo brings it back", async () => {
  const { deck, mountElement } = await makeDeck({ isMobile: true })
  await deck.launchColumn("feed")
  await deck.closeColumn("feed")
  const closed = [deck.getColumnCount(), keysInDom(mountElement)]
  await deck.undo()
  assertEquals([closed, keysInDom(mountElement)], [[0, []], ["feed"]])
  deck.destroy()
})

Deno.test("mobile - neither saves nor restores the layout", async () => {
  const saved = JSON.stringify({ columns: [{ type: "feed", entityId: null, pinned: false }] })
  const { deck, store } = await makeDeck({ isMobile: true, saved })
  const restored = deck.getColumnCount()
  await deck.launchColumn("widget")
  assertEquals([restored, store.data], [0, saved])
  deck.destroy()
})

Deno.test("mobile - launching the column already showing keeps it and leaves the back-stack alone", async () => {
  const { deck, mountElement, teardowns } = await makeDeck({ isMobile: true })
  await deck.launchColumn("feed")
  await deck.launchColumn("feed")
  assertEquals([keysInDom(mountElement), deck.getMobileHistory().length, teardowns], [["feed"], 0, []])
  deck.destroy()
})

Deno.test("mobile - launching the showing singleton with another entity replaces it in place", async () => {
  const { deck, mountElement, teardowns } = await makeDeck({ isMobile: true })
  await deck.launchColumn("feed")
  await deck.launchColumn("feed", "other")
  assertEquals(
    [
      keysInDom(mountElement),
      deck.getState().columns.map((c) => c.entityId),
      deck.getMobileHistory().length,
      teardowns,
    ],
    [["feed"], ["other"], 0, ["feed"]],
  )
  deck.destroy()
})
