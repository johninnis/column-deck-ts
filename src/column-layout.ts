import type { ColumnKey, ColumnPlacement, ColumnState } from "./column-state.ts"
import { pinnedColumns, reorderColumns, setColumnPinned } from "./column-state.ts"

type LayoutOp =
  | { readonly kind: "prepend"; readonly element: HTMLElement }
  | { readonly kind: "append"; readonly element: HTMLElement }
  | { readonly kind: "insert-before"; readonly element: HTMLElement; readonly anchor: HTMLElement }

interface LayoutDeps {
  readonly getElement: (key: ColumnKey) => HTMLElement | undefined
}

interface RepositionResult {
  readonly state: ColumnState
  readonly op: LayoutOp | null
}

interface MoveResult {
  readonly state: ColumnState
  readonly op: LayoutOp
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
  readonly toIndex: number
  readonly deps: LayoutDeps
}

interface DropTarget {
  readonly key: ColumnKey
  readonly side: "before" | "after"
}

const resolveInsertAfterKey = (state: ColumnState, spawnedFrom: ColumnKey | null): ColumnKey | null => {
  if (!spawnedFrom) return null
  const spawnedIndex = state.columns.findIndex((c) => c.key === spawnedFrom)
  if (spawnedIndex === -1) return null
  const pinnedCount = pinnedColumns(state).length
  if (spawnedIndex + 1 < pinnedCount) {
    const lastPinned = state.columns[pinnedCount - 1]
    return lastPinned?.key ?? spawnedFrom
  }
  return spawnedFrom
}

const placementAfter = (
  state: ColumnState,
  afterKey: ColumnKey | null,
  fallback: "first" | "last",
): ColumnPlacement => {
  const resolved = resolveInsertAfterKey(state, afterKey)
  if (resolved) return { after: resolved }
  const lastPinned = pinnedColumns(state).at(-1)
  return fallback === "first" && lastPinned ? { after: lastPinned.key } : fallback
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
  const pinnedCount = pinnedColumns(pinChanged).length
  const targetIndex = pinned ? pinnedCount - 1 : pinnedCount
  const element = deps.getElement(key)

  if (currentIndex === targetIndex || !element) return { state: pinChanged, op: null }

  const reordered = reorderColumns(pinChanged, currentIndex, targetIndex)
  return { state: reordered, op: planInsertion({ state: reordered, targetIndex, element, deps }) }
}

const indexOfKey = (state: ColumnState, key: ColumnKey): number => state.columns.findIndex((c) => c.key === key)

const indexByStep = (state: ColumnState, key: ColumnKey, direction: number): number => {
  const fromIndex = indexOfKey(state, key)
  return fromIndex === -1 ? -1 : fromIndex + direction
}

const indexBeside = (state: ColumnState, key: ColumnKey, target: DropTarget): number => {
  const fromIndex = indexOfKey(state, key)
  const targetIndex = indexOfKey(state, target.key)
  if (fromIndex === -1 || targetIndex === -1) return -1
  const shift = targetIndex < fromIndex ? 0 : -1
  return targetIndex + shift + (target.side === "after" ? 1 : 0)
}

const moveColumn = ({ state, key, toIndex, deps }: MoveColumnArgs): MoveResult | null => {
  const fromIndex = indexOfKey(state, key)
  if (fromIndex === -1 || fromIndex === toIndex) return null
  if (toIndex < 0 || toIndex >= state.columns.length) return null

  const column = state.columns[fromIndex]
  if (!column) return null

  const pinnedCount = pinnedColumns(state).length
  if (column.pinned !== (toIndex < pinnedCount)) return null

  const element = deps.getElement(key)
  if (!element) return null

  const reordered = reorderColumns(state, fromIndex, toIndex)
  return { state: reordered, op: planInsertion({ state: reordered, targetIndex: toIndex, element, deps }) }
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
  DropTarget,
  LayoutDeps,
  LayoutOp,
  MoveColumnArgs,
  MoveResult,
  PlanInsertionArgs,
  RepositionPinnedArgs,
  RepositionResult,
}
export {
  applyLayoutOp,
  indexBeside,
  indexByStep,
  moveColumn,
  placementAfter,
  planInsertion,
  repositionPinned,
  resolveInsertAfterKey,
}
