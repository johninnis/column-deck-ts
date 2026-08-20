import type { Column, ColumnKey, ColumnState } from "./column-state.ts"
import type { MobileHistoryEntry } from "./column-history.ts"
import { addColumn } from "./column-state.ts"

interface MobileNavigatorDeps {
  readonly getState: () => ColumnState
  readonly setState: (state: ColumnState) => void
  readonly mobileHistory: Array<MobileHistoryEntry>
  readonly createColumn: (type: string, entityId: string | null) => Column
  readonly closeAllColumns: () => void
  readonly renderColumn: (column: Column, shouldScroll?: boolean) => Promise<HTMLElement>
  readonly focusColumn: (key: ColumnKey) => void
  readonly onMobileHistoryChange?: () => void
}

interface MobileNavigator {
  readonly navigateTo: (type: string, entityId: string | null) => Promise<string>
  readonly goBack: () => Promise<void>
}

const createMobileNavigator = (
  {
    getState,
    setState,
    mobileHistory,
    createColumn,
    closeAllColumns,
    renderColumn,
    focusColumn,
    onMobileHistoryChange,
  }: MobileNavigatorDeps,
): MobileNavigator => {
  const showColumn = async (type: string, entityId: string | null, shouldScroll: boolean): Promise<string> => {
    closeAllColumns()
    const column = createColumn(type, entityId)
    setState(addColumn(getState(), column))
    await renderColumn(column, shouldScroll)
    focusColumn(column.key)
    onMobileHistoryChange?.()
    return column.key
  }

  const navigateTo = (type: string, entityId: string | null): Promise<string> => {
    const current = getState().columns[0]
    if (current) mobileHistory.push({ type: current.type, entityId: current.entityId })
    return showColumn(type, entityId, true)
  }

  const goBack = async (): Promise<void> => {
    const prev = mobileHistory.pop()
    if (!prev) return
    await showColumn(prev.type, prev.entityId, false)
  }

  return Object.freeze({ navigateTo, goBack })
}

export type { MobileNavigator, MobileNavigatorDeps }
export { createMobileNavigator }
