/**
 * The smallest useful host for @innis/column-deck: three column definitions, the deck with every
 * default in place, and the two things the deck deliberately leaves to the host — an application
 * shortcut (`k` launches a column) and in-column keys (ArrowUp/ArrowDown walk the focused column's
 * items, Enter activates one).
 *
 * Build and serve with `deno task example:minimal-host`, then open http://localhost:8088.
 */
import { type ColumnDeck, createColumnDeck, createColumnDefinition } from "../../mod.ts"

interface Note {
  readonly id: string
  readonly title: string
  readonly body: string
}

interface Services {
  readonly notes: ReadonlyArray<Note>
}

const NOTES: ReadonlyArray<Note> = Array.from({ length: 12 }, (_, i) => ({
  id: String(i + 1),
  title: `Note ${i + 1}`,
  body: `Body of note ${i + 1}.`,
}))

const listColumn = createColumnDefinition<Services>({
  type: "list",
  label: "Notes",
  onRender: (content, { services, launchColumn, hideLoading }) => {
    const list = document.createElement("ul")
    for (const note of services.notes) {
      const item = document.createElement("li")
      item.setAttribute("data-navigable", "")
      item.textContent = note.title
      item.addEventListener("click", () => launchColumn("detail", note.id))
      list.appendChild(item)
    }
    content.replaceChildren(list)
    hideLoading()
    return Promise.resolve()
  },
})

const detailColumn = createColumnDefinition<Services>({
  type: "detail",
  label: "Note",
  singleton: false,
  getTitle: (entityId) => `Note ${entityId ?? ""}`,
  onRender: (content, { entityId, services, hideLoading }) => {
    const note = services.notes.find((n) => n.id === entityId)
    content.textContent = note ? note.body : "Note not found"
    hideLoading()
    return Promise.resolve()
  },
})

const customColumn = createColumnDefinition<Services>({
  type: "custom",
  label: "Custom",
  onRender: (content, { hideLoading }) => {
    content.textContent = "Launched by the host's own shortcut (k)."
    hideLoading()
    return Promise.resolve()
  },
})

const mountElement = document.querySelector("main")
if (!(mountElement instanceof HTMLElement)) throw new Error("Missing <main>")

const deck: ColumnDeck = await createColumnDeck<Services>({
  mountElement,
  columnDefinitions: [listColumn, detailColumn, customColumn],
  services: { notes: NOTES },
})

if (deck.getColumnCount() === 0) await deck.launchColumn("list")

const moveItemFocus = (column: HTMLElement, direction: 1 | -1): void => {
  const items = Array.from(column.querySelectorAll<HTMLElement>("[data-content] [data-navigable]"))
  const current = document.activeElement instanceof HTMLElement ? items.indexOf(document.activeElement) : -1
  const next = items[current === -1 ? (direction === 1 ? 0 : items.length - 1) : current + direction]
  if (!next) return
  next.tabIndex = -1
  next.focus()
}

document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented) return
  if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return

  if (event.key === "k") {
    event.preventDefault()
    deck.launchColumn("custom")
    return
  }

  const column = deck.getFocusedColumnElement()
  if (!column) return
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault()
    moveItemFocus(column, event.key === "ArrowDown" ? 1 : -1)
  }
  if (
    event.key === "Enter" && document.activeElement instanceof HTMLElement &&
    document.activeElement.matches("[data-navigable]")
  ) {
    event.preventDefault()
    document.activeElement.click()
  }
})
