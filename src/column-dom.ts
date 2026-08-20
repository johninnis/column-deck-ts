import type { Column, ColumnKey } from "./column-state.ts"

const applyColumnDataset = (element: HTMLElement, column: Column): void => {
  element.dataset.column = column.type
  element.dataset.columnKey = column.key
  if (column.entityId) {
    element.dataset.entityId = column.entityId
  } else {
    delete element.dataset.entityId
  }
}

const getColumnKeyFromElement = (element: HTMLElement): ColumnKey => element.dataset.columnKey ?? ""

export { applyColumnDataset, getColumnKeyFromElement }
