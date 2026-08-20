import type { ColumnKey } from "./column-state.ts"
import { getColumnKeyFromElement } from "./column-dom.ts"
import { resolveScrollRegion } from "./column-shell.ts"

interface KeyboardHandler {
  readonly attach: () => void
  readonly detach: () => void
}

interface KeyboardHandlerDeps {
  readonly containerElement: HTMLElement
  readonly getLastFocusedElement: () => HTMLElement | null
  readonly onFocusColumn: (key: ColumnKey) => void
  readonly onUndo: () => void
  readonly onMoveColumn: (key: ColumnKey, direction: number) => boolean
  readonly onClose: (key: ColumnKey) => void
  readonly onRefresh: (key: ColumnKey) => void
  readonly onCompose?: () => void
  readonly onEscape?: () => boolean
}

const NAVIGABLE_SELECTOR = "[data-navigable]"

const createKeyboardHandler = (deps: KeyboardHandlerDeps): KeyboardHandler => {
  const {
    containerElement,
    getLastFocusedElement,
    onFocusColumn,
    onUndo,
    onMoveColumn,
    onClose,
    onRefresh,
    onCompose,
    onEscape,
  } = deps

  const getColumns = (): ReadonlyArray<HTMLElement> =>
    Array.from(containerElement.querySelectorAll<HTMLElement>("[data-column]"))

  const getNavigableItems = (column: HTMLElement): ReadonlyArray<HTMLElement> => {
    const content = column.querySelector("[data-content]")
    if (!content) return []
    return Array.from(content.querySelectorAll<HTMLElement>(NAVIGABLE_SELECTOR))
  }

  const getFocusedItem = (column: HTMLElement): HTMLElement | null =>
    column.querySelector("[data-content] [data-keyboard-focus]")

  const clearItemFocus = (column: HTMLElement): void => {
    const focused = getFocusedItem(column)
    if (focused) delete focused.dataset.keyboardFocus
  }

  const focusItem = (column: HTMLElement, item: HTMLElement | undefined): void => {
    if (!item) return
    clearItemFocus(column)
    item.dataset.keyboardFocus = ""
    item.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }

  const isItemVisible = (item: HTMLElement, container: Element): boolean => {
    const containerRect = container.getBoundingClientRect()
    const itemRect = item.getBoundingClientRect()
    return itemRect.bottom > containerRect.top && itemRect.top < containerRect.bottom
  }

  const findVisibleItem = (
    items: ReadonlyArray<HTMLElement>,
    container: Element,
    fromEnd: boolean,
  ): HTMLElement | null => {
    const ordered = fromEnd ? [...items].reverse() : items
    return ordered.find((item) => isItemVisible(item, container)) ?? null
  }

  const navigateItems = (column: HTMLElement, direction: number): void => {
    const items = getNavigableItems(column)
    if (items.length === 0) return

    const currentFocused = getFocusedItem(column)

    if (!currentFocused) {
      const content = column.querySelector("[data-content]")
      const visible = content ? findVisibleItem(items, content, direction === -1) : null
      const fallback = direction === 1 ? items[0] : items[items.length - 1]
      focusItem(column, visible ?? fallback)
      return
    }

    const currentIndex = items.indexOf(currentFocused)
    const nextIndex = currentIndex + direction
    if (nextIndex < 0 || nextIndex >= items.length) return

    focusItem(column, items[nextIndex])
  }

  const handleArrowSideways = (event: KeyboardEvent, column: HTMLElement): void => {
    const columns = getColumns()
    if (columns.length < 2) return

    const direction = event.key === "ArrowLeft" ? -1 : 1

    if (event.shiftKey) {
      event.preventDefault()
      onMoveColumn(getColumnKeyFromElement(column), direction)
      return
    }

    const nextColumn = columns[columns.indexOf(column) + direction]
    if (nextColumn) {
      event.preventDefault()
      clearItemFocus(column)
      onFocusColumn(getColumnKeyFromElement(nextColumn))
    }
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const isInInput = activeElement?.matches("input, textarea, [contenteditable]") === true
    const column = getLastFocusedElement()

    if (event.key === "Escape") {
      if (onEscape && onEscape()) return
      if (!isInInput && column) clearItemFocus(column)
      activeElement?.blur()
      return
    }

    if (isInInput) return

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      if (column) handleArrowSideways(event, column)
      return
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (!column) return
      event.preventDefault()
      navigateItems(column, event.key === "ArrowDown" ? 1 : -1)
      return
    }

    if (event.key === "Enter") {
      if (!column) return
      const focusedItem = getFocusedItem(column)
      if (focusedItem) {
        event.preventDefault()
        focusedItem.click()
      }
      return
    }

    if (event.key === "z" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      onUndo()
      return
    }

    if (event.key === "Home" || event.key === "End") {
      if (!column) return
      const content = column.querySelector("[data-content]")
      if (!(content instanceof HTMLElement)) return
      event.preventDefault()
      const scroller = resolveScrollRegion(content)
      scroller.scrollTo({ top: event.key === "Home" ? 0 : scroller.scrollHeight, behavior: "smooth" })
      return
    }

    if (event.ctrlKey || event.metaKey) return

    if (event.key === "x" && column) {
      if (column.querySelector("header[data-keyboard-focus]") && column.dataset.pinned === undefined) {
        event.preventDefault()
        onClose(getColumnKeyFromElement(column))
      }
      return
    }

    if (event.key === "r" && column) {
      event.preventDefault()
      onRefresh(getColumnKeyFromElement(column))
      return
    }

    if (event.key === "c" && onCompose) {
      event.preventDefault()
      onCompose()
    }
  }

  const attach = (): void => {
    document.addEventListener("keydown", handleKeyDown)
  }

  const detach = (): void => {
    document.removeEventListener("keydown", handleKeyDown)
  }

  return Object.freeze({ attach, detach })
}

export type { KeyboardHandler, KeyboardHandlerDeps }
export { createKeyboardHandler }
