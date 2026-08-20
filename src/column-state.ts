/** Uniquely identifies an open column: `type` for singletons, `type:entityId` for entity-bound instances. */
type ColumnKey = string

/** An open column: its type, optional entity binding, derived key, spawning column, and pinned flag. */
interface Column {
  readonly type: string
  readonly entityId: string | null
  readonly key: ColumnKey
  readonly spawnedFrom: ColumnKey | null
  readonly pinned: boolean
}

/** Immutable snapshot of the column layout: the ordered open columns and the last-focused key. */
interface ColumnState {
  readonly columns: ReadonlyArray<Column>
  readonly lastFocusedKey: ColumnKey | null
}

/** Inputs for creating a {@linkcode Column}; the key is derived from `type`, `entityId`, and `singleton`. */
interface CreateColumnParams {
  readonly type: string
  readonly entityId?: string | null
  readonly spawnedFrom?: ColumnKey | null
  readonly pinned?: boolean
  readonly singleton?: boolean
}

const getColumnKey = (type: string, entityId: string | null, singleton: boolean): ColumnKey =>
  !singleton && entityId ? `${type}:${entityId}` : type

const createColumn = (
  { type, entityId = null, spawnedFrom = null, pinned = false, singleton = false }: CreateColumnParams,
): Column => ({
  type,
  entityId,
  key: getColumnKey(type, entityId, singleton),
  spawnedFrom,
  pinned,
})

const createColumnState = (columns: ReadonlyArray<Column> = []): ColumnState => ({
  columns,
  lastFocusedKey: null,
})

const addColumn = (state: ColumnState, column: Column): ColumnState => ({
  ...state,
  columns: [...state.columns, column],
})

const insertColumnAfter = (state: ColumnState, column: Column, afterKey: ColumnKey): ColumnState => {
  const index = state.columns.findIndex((c) => c.key === afterKey)
  if (index === -1) {
    return addColumn(state, column)
  }
  const columns = [...state.columns]
  columns.splice(index + 1, 0, column)
  return { ...state, columns }
}

const removeColumn = (state: ColumnState, key: ColumnKey): ColumnState => ({
  ...state,
  columns: state.columns.filter((c) => c.key !== key),
  lastFocusedKey: state.lastFocusedKey === key ? null : state.lastFocusedKey,
})

const reorderColumns = (state: ColumnState, fromIndex: number, toIndex: number): ColumnState => {
  const columns = [...state.columns]
  const moved = columns.splice(fromIndex, 1)[0]
  if (!moved) return state
  columns.splice(toIndex, 0, moved)
  return { ...state, columns }
}

const setLastFocused = (state: ColumnState, key: ColumnKey): ColumnState => ({
  ...state,
  lastFocusedKey: key,
})

const findColumn = (state: ColumnState, key: ColumnKey): Column | undefined => state.columns.find((c) => c.key === key)

const setColumnPinned = (state: ColumnState, key: ColumnKey, pinned: boolean): ColumnState => ({
  ...state,
  columns: state.columns.map((c) => c.key === key ? { ...c, pinned } : c),
})

const pinnedColumns = (state: ColumnState): ReadonlyArray<Column> => state.columns.filter((c) => c.pinned)

const getPinnedCount = (state: ColumnState): number => pinnedColumns(state).length

export type { Column, ColumnKey, ColumnState, CreateColumnParams }
export {
  addColumn,
  createColumn,
  createColumnState,
  findColumn,
  getPinnedCount,
  insertColumnAfter,
  pinnedColumns,
  removeColumn,
  reorderColumns,
  setColumnPinned,
  setLastFocused,
}
