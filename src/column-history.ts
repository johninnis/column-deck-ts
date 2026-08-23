import type { ColumnKey, ColumnRef } from "./column-state.ts"
import { popLast } from "./immutable-list.ts"

/** A closed column remembered for undo: what it was and which column it sat after. */
interface ClosedHistoryEntry extends ColumnRef {
  readonly afterKey: ColumnKey | null
}

/** Closed columns, oldest first, capped so undo never grows without bound. */
type ClosedColumnsHistory = ReadonlyArray<ClosedHistoryEntry>

const MAX_CLOSED_ENTRIES = 50

const recordClosed = (history: ClosedColumnsHistory, entry: ClosedHistoryEntry): ClosedColumnsHistory =>
  [...history, entry].slice(-MAX_CLOSED_ENTRIES)

const takeLastClosed = (
  history: ClosedColumnsHistory,
): { readonly history: ClosedColumnsHistory; readonly entry: ClosedHistoryEntry } | null => {
  const popped = popLast(history)
  return popped ? { history: popped.rest, entry: popped.last } : null
}

export type { ClosedColumnsHistory, ClosedHistoryEntry }
export { recordClosed, takeLastClosed }
