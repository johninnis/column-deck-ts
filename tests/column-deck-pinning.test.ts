import { assertEquals } from "@std/assert"
import { columnElement, dispatch, dispatchBubbled, keysInDom, makeDeck } from "./support/deck-harness.ts"

const chromeOf = (shell: HTMLElement): ReadonlyArray<unknown> => [
  shell.hasAttribute("data-pinned"),
  shell.querySelector("[data-close-btn]")?.hasAttribute("hidden"),
  shell.querySelector("header")?.getAttribute("draggable"),
]

Deno.test("setPinned - the host pinning a column updates its chrome", async () => {
  const { deck, mountElement } = await makeDeck()
  await deck.launchColumn("feed")
  deck.setPinned("feed", true)
  assertEquals(chromeOf(columnElement(mountElement, "feed")), [true, true, "false"])
  deck.destroy()
})

Deno.test("setPinned - the host unpinning a column restores its chrome", async () => {
  const { deck, mountElement } = await makeDeck()
  await deck.launchColumn("feed")
  deck.setPinned("feed", true)
  deck.setPinned("feed", false)
  assertEquals(chromeOf(columnElement(mountElement, "feed")), [false, false, "true"])
  deck.destroy()
})

Deno.test("setPinned - pinning moves the column into the pinned region, persists and notifies the host", async () => {
  const { deck, mountElement, store, pinnedChanges } = await makeDeck()
  await deck.launchColumn("note", "a")
  await deck.launchColumn("feed")
  deck.setPinned("feed", true)
  assertEquals(
    [keysInDom(mountElement), JSON.parse(store.data ?? "{}").columns[0], pinnedChanges],
    [["feed", "note:a"], { type: "feed", entityId: null, pinned: true }, [[{ type: "feed", entityId: null }]]],
  )
  deck.destroy()
})

Deno.test("closeColumn - a pinned column is not closed", async () => {
  const { deck, teardowns } = await makeDeck()
  await deck.launchColumn("feed")
  deck.setPinned("feed", true)
  await deck.closeColumn("feed")
  assertEquals([deck.getColumnCount(), teardowns], [1, []])
  deck.destroy()
})

Deno.test("closeColumn - middle-clicking a pinned column's header leaves it open", async () => {
  const { deck, mountElement } = await makeDeck()
  await deck.launchColumn("feed")
  deck.setPinned("feed", true)
  dispatch(columnElement(mountElement, "feed").querySelector("header"), "auxclick", { button: 1 })
  assertEquals(deck.getColumnCount(), 1)
  deck.destroy()
})

Deno.test("closeColumn - pressing x on a pinned column leaves it open", async () => {
  const { deck, mountElement } = await makeDeck()
  await deck.launchColumn("feed")
  deck.setPinned("feed", true)
  dispatch(columnElement(mountElement, "feed"), "click")
  dispatch(document, "keydown", { key: "x" })
  assertEquals(deck.getColumnCount(), 1)
  deck.destroy()
})

Deno.test("pin button - clicking it pins the column through the deck, and again unpins it", async () => {
  const { deck, mountElement } = await makeDeck()
  await deck.launchColumn("feed")
  const pin = columnElement(mountElement, "feed").querySelector("[data-pin-btn]")
  dispatch(pin, "click")
  const pinned = [deck.getState().columns[0]?.pinned, chromeOf(columnElement(mountElement, "feed"))]
  dispatch(pin, "click")
  const unpinned = [deck.getState().columns[0]?.pinned, chromeOf(columnElement(mountElement, "feed"))]
  assertEquals([pinned, unpinned], [[true, [true, true, "false"]], [false, [false, false, "true"]]])
  deck.destroy()
})

Deno.test("drag - a column dragged in front of a pinned column stays behind it", async () => {
  const { deck, mountElement } = await makeDeck()
  await deck.launchColumn("feed")
  await deck.launchColumn("note", "a")
  deck.setPinned("feed", true)
  dispatchBubbled(mountElement, columnElement(mountElement, "note:a").querySelector("header"), { type: "dragstart" })
  dispatchBubbled(mountElement, columnElement(mountElement, "feed"), { type: "dragover", clientX: 10 })
  dispatchBubbled(mountElement, columnElement(mountElement, "note:a"), { type: "dragend" })
  assertEquals([deck.getState().columns.map((c) => c.key), keysInDom(mountElement)], [
    ["feed", "note:a"],
    ["feed", "note:a"],
  ])
  deck.destroy()
})

Deno.test("restore - a column saved pinned comes back with pinned chrome", async () => {
  const saved = JSON.stringify({ columns: [{ type: "feed", entityId: null, pinned: true }] })
  const { deck, mountElement } = await makeDeck({ saved })
  assertEquals(chromeOf(columnElement(mountElement, "feed")), [true, true, "false"])
  deck.destroy()
})

Deno.test("undo - a column closed from the head of the unpinned region comes back behind the pinned columns", async () => {
  const { deck, mountElement } = await makeDeck()
  await deck.launchColumn("feed")
  await deck.launchColumn("note", "a")
  await deck.closeColumn("feed")
  await deck.launchColumn("widget")
  deck.setPinned("widget", true)
  await deck.undo()
  assertEquals(keysInDom(mountElement), ["widget", "feed", "note:a"])
  deck.destroy()
})
