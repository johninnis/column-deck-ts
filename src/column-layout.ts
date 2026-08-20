import type { ColumnKey, ColumnState } from "./column-state.ts"
import { getPinnedCount, reorderColumns, setColumnPinned } from "./column-state.ts"

type LayoutOp =
  | { readonly kind: "prepend"; readonly element: HTMLElement }
  | { readonly kind: "append"; readonly element: HTMLElement }
  | { readonly kind: "insert-before"; readonly element: HTMLElement; readonly anchor: HTMLElement }

interface LayoutDeps {
  readonly getElement: (key: ColumnKey) => HTMLElement | undefined
}

interface RepositionResult {
  readonly state: ColumnState
  readonly element: HTMLElement | null
  readonly op: LayoutOp | null
}

interface MoveResult {
  readonly state: ColumnState
  readonly moved: boolean
  readonly element: HTMLElement | null
  readonly op: LayoutOp | null
}

interface RepositionPinnedArgs {
  readonly state: ColumnState
  readonly key: ColumnKey
  readonly pinned: boolean
  readonly deps: LayoutDeps
}

interface MoveColumnArgs {
  readonly state: ColumnState
  readonly key: ColumnKey
  readonly direction: number
  readonly deps: LayoutDeps
}

const resolveInsertAfterKey = (state: ColumnState, spawnedFrom: ColumnKey | null): ColumnKey | null => {
  if (!spawnedFrom) return null
  const spawnedIndex = state.columns.findIndex((c) => c.key === spawnedFrom)
  if (spawnedIndex === -1) return null
  const pinnedCount = getPinnedCount(state)
  if (spawnedIndex + 1 < pinnedCount) {
    const lastPinned = state.columns[pinnedCount - 1]
    return lastPinned?.key ?? spawnedFrom
  }
  return spawnedFrom
}

interface PlanInsertionArgs {
  readonly state: ColumnState
  readonly targetIndex: number
  readonly element: HTMLElement
  readonly deps: LayoutDeps
}

const planInsertion = ({ state, targetIndex, element, deps }: PlanInsertionArgs): LayoutOp => {
  if (targetIndex === 0) return { kind: "prepend", element }
  const following = state.columns[targetIndex + 1]
  const anchor = following ? deps.getElement(following.key) : undefined
  return anchor ? { kind: "insert-before", element, anchor } : { kind: "append", element }
}

const repositionPinned = ({ state, key, pinned, deps }: RepositionPinnedArgs): RepositionResult => {
  const pinChanged = setColumnPinned(state, key, pinned)
  const currentIndex = pinChanged.columns.findIndex((c) => c.key === key)
  const pinnedCount = getPinnedCount(pinChanged)
  const targetIndex = pinned ? pinnedCount - 1 : pinnedCount
  const element = deps.getElement(key) ?? null

  if (currentIndex === targetIndex || !element) {
    return { state: pinChanged, element, op: null }
  }

  const reordered = reorderColumns(pinChanged, currentIndex, targetIndex)
  return { state: reordered, element, op: planInsertion({ state: reordered, targetIndex, element, deps }) }
}

const moveColumnByKeyboard = ({ state, key, direction, deps }: MoveColumnArgs): MoveResult => {
  const noMove: MoveResult = { state, moved: false, element: null, op: null }

  const fromIndex = state.columns.findIndex((c) => c.key === key)
  if (fromIndex === -1) return noMove

  const toIndex = fromIndex + direction
  if (toIndex < 0 || toIndex >= state.columns.length) return noMove

  const column = state.columns[fromIndex]
  if (!column) return noMove

  const pinnedCount = getPinnedCount(state)
  if (column.pinned !== (toIndex < pinnedCount)) return noMove

  const element = deps.getElement(key)
  if (!element) return noMove

  const reordered = reorderColumns(state, fromIndex, toIndex)
  return {
    state: reordered,
    moved: true,
    element,
    op: planInsertion({ state: reordered, targetIndex: toIndex, element, deps }),
  }
}

const applyLayoutOp = (mountElement: HTMLElement, op: LayoutOp): void => {
  switch (op.kind) {
    case "prepend":
      mountElement.prepend(op.element)
      return
    case "append":
      mountElement.appendChild(op.element)
      return
    case "insert-before":
      mountElement.insertBefore(op.element, op.anchor)
      return
  }
}

export type {
  LayoutDeps,
  LayoutOp,
  MoveColumnArgs,
  MoveResult,
  PlanInsertionArgs,
  RepositionPinnedArgs,
  RepositionResult,
}
export { applyLayoutOp, moveColumnByKeyboard, planInsertion, repositionPinned, resolveInsertAfterKey }
