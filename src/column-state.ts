/** Uniquely identifies an open column: `type` for singletons, `type:entityId` for entity-bound instances. */
type ColumnKey = string

/** Names a column by type and optional entity — enough to launch it again. */
interface ColumnRef {
  readonly type: string
  readonly entityId: string | null
}

/** An open column: its type, optional entity binding, derived key, spawning column, and pinned flag. */
interface Column extends ColumnRef {
  readonly key: ColumnKey
  readonly spawnedFrom: ColumnKey | null
  readonly pinned: boolean
}

/** Immutable snapshot of the column layout: the ordered open columns and the last-focused key. */
interface ColumnState {
  readonly columns: ReadonlyArray<Column>
  readonly lastFocusedKey: ColumnKey | null
}

type ColumnPlacement = "first" | "last" | { readonly after: ColumnKey }

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

const insertColumn = (state: ColumnState, column: Column, placement: ColumnPlacement): ColumnState => {
  if (placement === "first") return { ...state, columns: [column, ...state.columns] }
  const index = placement === "last" ? -1 : state.columns.findIndex((c) => c.key === placement.after)
  if (index === -1) return addColumn(state, column)
  return { ...state, columns: state.columns.toSpliced(index + 1, 0, column) }
}

const removeColumn = (state: ColumnState, key: ColumnKey): ColumnState => ({
  ...state,
  columns: state.columns.filter((c) => c.key !== key),
  lastFocusedKey: state.lastFocusedKey === key ? null : state.lastFocusedKey,
})

const replaceColumn = (state: ColumnState, column: Column): ColumnState => ({
  ...state,
  columns: state.columns.map((c) => c.key === column.key ? column : c),
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

export type { Column, ColumnKey, ColumnPlacement, ColumnRef, ColumnState, CreateColumnParams }
export {
  addColumn,
  createColumn,
  createColumnState,
  findColumn,
  insertColumn,
  pinnedColumns,
  removeColumn,
  reorderColumns,
  replaceColumn,
  setColumnPinned,
  setLastFocused,
}
