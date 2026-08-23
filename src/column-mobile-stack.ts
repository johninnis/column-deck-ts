import type { Column, ColumnKey, ColumnRef } from "./column-state.ts"
import { popLast } from "./immutable-list.ts"

const MAX_SUSPENDED_COLUMNS = 8

/** A column kept alive off-screen: the renderer still holds its shell; only the scroll offset needs remembering. */
interface SuspendedEntry {
  readonly kind: "suspended"
  readonly column: Column
  readonly scrollTop: number
}

/** A place on the stack whose column has been destroyed (or was only ever seeded) and must be rendered afresh. */
interface ColdEntry extends ColumnRef {
  readonly kind: "cold"
}

type MobileStackEntry = SuspendedEntry | ColdEntry

type MobileStack = ReadonlyArray<MobileStackEntry>

/** A stack transition: the new stack plus the columns the caller must now destroy. */
interface StackChange {
  readonly stack: MobileStack
  readonly destroyed: ReadonlyArray<Column>
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
  const excess = stack.filter(isSuspended).length - MAX_SUSPENDED_COLUMNS
  if (excess <= 0) return { stack, destroyed: [] }
  const destroyed: Array<Column> = []
  const cooled = stack.map((entry) => {
    if (!isSuspended(entry) || destroyed.length >= excess) return entry
    destroyed.push(entry.column)
    return cold(historyEntryOf(entry))
  })
  return { stack: cooled, destroyed }
}

/** Pushes a suspended column, cooling the oldest suspended entries past the cap. */
const suspendOnto = (stack: MobileStack, column: Column, scrollTop: number): StackChange =>
  coolOldestBeyondCap([...stack, { kind: "suspended", column, scrollTop }])

/** Takes the top entry off the stack. */
const popTop = (stack: MobileStack): { readonly stack: MobileStack; readonly entry: MobileStackEntry } | null => {
  const popped = popLast(stack)
  return popped ? { stack: popped.rest, entry: popped.last } : null
}

/**
 * Unwinds to the most recent suspended entry holding `key`: that entry leaves the stack as the
 * target, and every suspended column above it is destroyed.
 */
const unwindTo = (
  stack: MobileStack,
  key: ColumnKey,
):
  | { readonly stack: MobileStack; readonly target: SuspendedEntry; readonly destroyed: ReadonlyArray<Column> }
  | null => {
  const index = stack.findLastIndex((entry) => isSuspended(entry) && entry.column.key === key)
  const target = stack[index]
  if (index === -1 || !target || !isSuspended(target)) return null
  return {
    stack: stack.slice(0, index),
    target,
    destroyed: stack.slice(index + 1).filter(isSuspended).map((entry) => entry.column),
  }
}

/** Empties the stack, destroying every suspended column. */
const clearStack = (stack: MobileStack): StackChange => ({
  stack: [],
  destroyed: stack.filter(isSuspended).map((entry) => entry.column),
})

export type { MobileStack, MobileStackEntry, StackChange, SuspendedEntry }
export { clearStack, historyOf, popTop, seedStack, suspendOnto, unwindTo }
