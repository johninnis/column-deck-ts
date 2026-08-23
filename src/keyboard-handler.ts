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
  readonly onEscape?: () => boolean
}

const createKeyboardHandler = (deps: KeyboardHandlerDeps): KeyboardHandler => {
  const {
    containerElement,
    getLastFocusedElement,
    onFocusColumn,
    onUndo,
    onMoveColumn,
    onClose,
    onRefresh,
    onEscape,
  } = deps

  const getColumns = (): ReadonlyArray<HTMLElement> =>
    Array.from(containerElement.querySelectorAll<HTMLElement>("[data-column]"))

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
      onFocusColumn(getColumnKeyFromElement(nextColumn))
    }
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const isInInput = activeElement?.matches("input, textarea, [contenteditable]") === true
    const column = getLastFocusedElement()

    if (event.key === "Escape") {
      if (onEscape && onEscape()) return
      activeElement?.blur()
      return
    }

    if (isInInput) return

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      if (column) handleArrowSideways(event, column)
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

    if (event.key === "x") {
      const focusedColumn = activeElement?.closest<HTMLElement>("[data-column]") ?? null
      if (focusedColumn && focusedColumn.dataset.pinned === undefined) {
        event.preventDefault()
        onClose(getColumnKeyFromElement(focusedColumn))
      }
      return
    }

    if (event.key === "r" && column) {
      event.preventDefault()
      onRefresh(getColumnKeyFromElement(column))
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
