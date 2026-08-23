import type { Column, ColumnKey, ColumnRef, ColumnState } from "./column-state.ts"
import type { MobileStack, StackChange, SuspendedEntry } from "./column-mobile-stack.ts"
import { addColumn, createColumnState } from "./column-state.ts"
import { clearStack, historyOf, popTop, seedStack, suspendOnto, unwindTo } from "./column-mobile-stack.ts"

interface MobileNavigatorDeps {
  readonly getState: () => ColumnState
  readonly setState: (state: ColumnState) => void
  readonly initialHistory: ReadonlyArray<ColumnRef>
  readonly createColumn: (type: string, entityId: string | null) => Column
  readonly renderColumn: (column: Column, shouldScroll?: boolean) => Promise<HTMLElement>
  readonly suspendColumn: (column: Column) => number
  readonly restoreColumn: (column: Column, scrollTop: number) => void
  readonly destroyColumns: (columns: ReadonlyArray<Column>) => void
  readonly closeAllColumns: () => void
  readonly focusColumn: (key: ColumnKey) => void
  readonly onMobileHistoryChange?: () => void
}

interface MobileNavigator {
  readonly navigateTo: (type: string, entityId: string | null) => Promise<string>
  readonly goBack: () => Promise<void>
  readonly getHistory: () => ReadonlyArray<ColumnRef>
  readonly destroy: () => void
}

const createMobileNavigator = (
  {
    getState,
    setState,
    initialHistory,
    createColumn,
    renderColumn,
    suspendColumn,
    restoreColumn,
    destroyColumns,
    closeAllColumns,
    focusColumn,
    onMobileHistoryChange,
  }: MobileNavigatorDeps,
): MobileNavigator => {
  let stack: MobileStack = seedStack(initialHistory)

  const apply = (change: StackChange): void => {
    destroyColumns(change.destroyed)
    stack = change.stack
  }

  const presented = (column: Column): string => {
    focusColumn(column.key)
    onMobileHistoryChange?.()
    return column.key
  }

  const show = async (column: Column, shouldScroll: boolean): Promise<string> => {
    setState(addColumn(getState(), column))
    const rendered = renderColumn(column, shouldScroll)
    const key = presented(column)
    await rendered
    return key
  }

  const restore = ({ column, scrollTop }: SuspendedEntry): string => {
    setState(addColumn(getState(), column))
    restoreColumn(column, scrollTop)
    return presented(column)
  }

  const suspendCurrent = (): void => {
    const current = getState().columns[0]
    if (!current) return
    const scrollTop = suspendColumn(current)
    setState(createColumnState())
    apply(suspendOnto(stack, current, scrollTop))
  }

  const navigateTo = (type: string, entityId: string | null): Promise<string> => {
    const column = createColumn(type, entityId)
    const unwound = unwindTo(stack, column.key)
    if (!unwound) {
      suspendCurrent()
      return show(column, true)
    }
    closeAllColumns()
    apply(unwound)
    if (unwound.target.column.entityId === entityId) return Promise.resolve(restore(unwound.target))
    destroyColumns([unwound.target.column])
    return show(column, true)
  }

  const goBack = async (): Promise<void> => {
    const popped = popTop(stack)
    if (!popped) return
    closeAllColumns()
    stack = popped.stack
    if (popped.entry.kind === "suspended") {
      restore(popped.entry)
      return
    }
    await show(createColumn(popped.entry.type, popped.entry.entityId), false)
  }

  const getHistory = (): ReadonlyArray<ColumnRef> => historyOf(stack)

  const destroy = (): void => apply(clearStack(stack))

  return Object.freeze({ navigateTo, goBack, getHistory, destroy })
}

export type { MobileNavigator, MobileNavigatorDeps }
export { createMobileNavigator }
