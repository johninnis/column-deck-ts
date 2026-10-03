import type { Column, ColumnKey, ColumnRef } from "./column-state.ts"

const MAX_SUSPENDED_COLUMNS = 8

interface SuspendedEntry {
  readonly kind: "suspended"
  readonly column: Column
  readonly scrollTop: number
}

interface ColdEntry extends ColumnRef {
  readonly kind: "cold"
}

type MobileStackEntry = SuspendedEntry | ColdEntry

type MobileStack = ReadonlyArray<MobileStackEntry>

interface StackChange {
  readonly stack: MobileStack
  readonly destroyed: ReadonlyArray<Column>
}

interface Unwound extends StackChange {
  readonly target: SuspendedEntry
}

const isSuspended = (entry: MobileStackEntry): entry is SuspendedEntry => entry.kind === "suspended"

const cold = (entry: ColumnRef): ColdEntry => ({ kind: "cold", type: entry.type, entityId: entry.entityId })

const historyEntryOf = (entry: MobileStackEntry): ColumnRef =>
  isSuspended(entry)
    ? { type: entry.column.type, entityId: entry.column.entityId }
    : { type: entry.type, entityId: entry.entityId }

const seedStack = (history: ReadonlyArray<ColumnRef>): MobileStack => history.map(cold)

const historyOf = (stack: MobileStack): ReadonlyArray<ColumnRef> => stack.map(historyEntryOf)

const coolOldestBeyondCap = (stack: MobileStack): StackChange => {
  const suspendedIndexes = stack.flatMap((entry, index) => isSuspended(entry) ? [index] : [])
  const cooling = new Set(suspendedIndexes.slice(0, Math.max(0, suspendedIndexes.length - MAX_SUSPENDED_COLUMNS)))
  return {
    stack: stack.map((entry, index) => cooling.has(index) ? cold(historyEntryOf(entry)) : entry),
    destroyed: stack.flatMap((entry, index) => cooling.has(index) && isSuspended(entry) ? [entry.column] : []),
  }
}

const suspendOnto = (stack: MobileStack, column: Column, scrollTop: number): StackChange =>
  coolOldestBeyondCap([...stack, { kind: "suspended", column, scrollTop }])

const unwindTo = (stack: MobileStack, key: ColumnKey): Unwound | null => {
  const index = stack.findLastIndex((entry) => isSuspended(entry) && entry.column.key === key)
  const target = stack[index]
  if (index === -1 || !target || !isSuspended(target)) return null
  return {
    stack: stack.slice(0, index),
    target,
    destroyed: stack.slice(index + 1).filter(isSuspended).map((entry) => entry.column),
  }
}

const clearStack = (stack: MobileStack): StackChange => ({
  stack: [],
  destroyed: stack.filter(isSuspended).map((entry) => entry.column),
})

export type { MobileStack, MobileStackEntry, StackChange, SuspendedEntry }
export { clearStack, historyOf, seedStack, suspendOnto, unwindTo }
