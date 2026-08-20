import type { ColumnKey } from "./column-state.ts"

interface ClosedHistoryEntry {
  readonly type: string
  readonly entityId: string | null
  readonly afterKey: ColumnKey | null
}

/** One step in the mobile back-stack: the column type and optional entity id to return to. */
interface MobileHistoryEntry {
  readonly type: string
  readonly entityId: string | null
}

interface ClosedColumnsHistory {
  readonly record: (entry: ClosedHistoryEntry) => void
  readonly takeLast: () => ClosedHistoryEntry | undefined
}

const MAX_CLOSED_ENTRIES = 50

const createClosedColumnsHistory = (): ClosedColumnsHistory => {
  const stack: Array<ClosedHistoryEntry> = []
  return Object.freeze({
    record: (entry: ClosedHistoryEntry): void => {
      stack.push(entry)
      if (stack.length > MAX_CLOSED_ENTRIES) stack.shift()
    },
    takeLast: (): ClosedHistoryEntry | undefined => stack.pop(),
  })
}

export type { ClosedColumnsHistory, ClosedHistoryEntry, MobileHistoryEntry }
export { createClosedColumnsHistory }
