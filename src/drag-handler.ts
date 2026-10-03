import type { DropTarget } from "./column-layout.ts"
import type { ColumnKey } from "./column-state.ts"
import { getColumnKeyFromElement } from "./column-dom.ts"

interface DragHandler {
  readonly attach: () => void
  readonly detach: () => void
}

interface DragHandlerDeps {
  readonly containerElement: HTMLElement
  readonly onDragOver: (key: ColumnKey, target: DropTarget) => void
  readonly isMobile: () => boolean
}

const columnOf = (target: EventTarget | null): HTMLElement | null =>
  target instanceof HTMLElement ? target.closest<HTMLElement>("[data-column]") : null

const createDragHandler = ({ containerElement, onDragOver, isMobile }: DragHandlerDeps): DragHandler => {
  let dragged: { readonly element: HTMLElement; readonly key: ColumnKey } | null = null

  const handleDragStart = (event: DragEvent): void => {
    if (isMobile()) return
    const element = columnOf(event.target)
    const key = element ? getColumnKeyFromElement(element) : null
    if (!element || key === null) return

    dragged = { element, key }
    element.dataset.dragging = ""
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setData("text/plain", key)
    }
  }

  const handleDragOver = (event: DragEvent): void => {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
    if (!dragged) return

    const targetColumn = columnOf(event.target)
    const targetKey = targetColumn ? getColumnKeyFromElement(targetColumn) : null
    if (!targetColumn || targetKey === null || targetKey === dragged.key) return

    const rect = targetColumn.getBoundingClientRect()
    const side = event.clientX < rect.left + rect.width / 2 ? "before" : "after"
    onDragOver(dragged.key, { key: targetKey, side })
  }

  const handleDragEnd = (): void => {
    if (!dragged) return
    delete dragged.element.dataset.dragging
    dragged = null
  }

  const attach = (): void => {
    containerElement.addEventListener("dragstart", handleDragStart)
    containerElement.addEventListener("dragover", handleDragOver)
    containerElement.addEventListener("dragend", handleDragEnd)
  }

  const detach = (): void => {
    containerElement.removeEventListener("dragstart", handleDragStart)
    containerElement.removeEventListener("dragover", handleDragOver)
    containerElement.removeEventListener("dragend", handleDragEnd)
  }

  return Object.freeze({ attach, detach })
}

export type { DragHandler, DragHandlerDeps }
export { createDragHandler }
