import type { ColumnState } from "./column-state.ts"

/** Host-provided storage for persisting the serialised column layout between sessions. */
interface PersistenceAdapter {
  readonly save: (data: string) => void
  readonly load: () => string | null
}

interface SavedColumn {
  readonly type: string
  readonly entityId: string | null
  readonly pinned: boolean
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const parseSavedColumn = (value: unknown): SavedColumn | null => {
  if (!isObject(value) || typeof value.type !== "string") return null
  return {
    type: value.type,
    entityId: typeof value.entityId === "string" ? value.entityId : null,
    pinned: value.pinned === true,
  }
}

const parseSavedColumns = (savedState: string): ReadonlyArray<SavedColumn> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(savedState)
  } catch {
    return []
  }
  if (!isObject(parsed) || !Array.isArray(parsed.columns)) return []
  return parsed.columns.flatMap((item) => {
    const column = parseSavedColumn(item)
    return column ? [column] : []
  })
}

const serialiseColumns = (state: ColumnState): string =>
  JSON.stringify({
    columns: state.columns.map(({ type, entityId, pinned }) => ({ type, entityId, pinned })),
  })

export type { PersistenceAdapter, SavedColumn }
export { parseSavedColumns, serialiseColumns }
