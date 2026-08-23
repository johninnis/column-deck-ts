import { getColumnKeyFromElement } from "./column-dom.ts"

interface DragHandler {
  readonly attach: () => void
  readonly detach: () => void
}

interface DragHandlerDeps {
  readonly containerElement: HTMLElement
  readonly onReorder: (fromIndex: number, toIndex: number) => void
  readonly isMobile: () => boolean
}

const createDragHandler = ({ containerElement, onReorder, isMobile }: DragHandlerDeps): DragHandler => {
  let draggedElement: HTMLElement | null = null
  let originalIndex: number | null = null

  const getColumnElements = (): ReadonlyArray<HTMLElement> =>
    Array.from(containerElement.querySelectorAll<HTMLElement>("[data-column]"))

  const getColumnIndex = (element: HTMLElement): number => getColumnElements().indexOf(element)

  const handleDragStart = (event: DragEvent): void => {
    if (isMobile()) return

    if (!(event.target instanceof HTMLElement)) return
    const column = event.target.closest<HTMLElement>("[data-column]")
    if (!column) return

    draggedElement = column
    originalIndex = getColumnIndex(column)
    column.dataset.dragging = ""

    const key = getColumnKeyFromElement(column)
    if (event.dataTransfer && key !== null) {
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setData("text/plain", key)
    }
  }

  const handleDragOver = (event: DragEvent): void => {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move"
    }

    if (!draggedElement) return

    if (!(event.target instanceof HTMLElement)) return
    const targetColumn = event.target.closest<HTMLElement>("[data-column]")
    if (!targetColumn || targetColumn === draggedElement) return
    if (targetColumn.dataset.pinned !== undefined) return

    const rect = targetColumn.getBoundingClientRect()
    const midpoint = rect.left + rect.width / 2

    if (event.clientX < midpoint) {
      containerElement.insertBefore(draggedElement, targetColumn)
    } else {
      containerElement.insertBefore(draggedElement, targetColumn.nextSibling)
    }
  }

  const handleDragEnd = (): void => {
    if (!draggedElement) return

    delete draggedElement.dataset.dragging
    const newIndex = getColumnIndex(draggedElement)

    if (originalIndex !== null && originalIndex !== newIndex) {
      onReorder(originalIndex, newIndex)
    }

    draggedElement = null
    originalIndex = null
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
