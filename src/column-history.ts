import type { ColumnKey, ColumnRef } from "./column-state.ts"

interface ClosedHistoryEntry extends ColumnRef {
  readonly afterKey: ColumnKey | null
}

type ClosedColumnsHistory = ReadonlyArray<ClosedHistoryEntry>

const MAX_CLOSED_ENTRIES = 50

const recordClosed = (history: ClosedColumnsHistory, entry: ClosedHistoryEntry): ClosedColumnsHistory =>
  [...history, entry].slice(-MAX_CLOSED_ENTRIES)

export type { ClosedColumnsHistory, ClosedHistoryEntry }
export { recordClosed }
