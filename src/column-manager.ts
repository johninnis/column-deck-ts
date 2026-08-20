import type { AssetLoader, ColumnDefinition, ColumnServices, OuterColumnContext } from "./column-base.ts"
import type { Column, ColumnKey, ColumnState, CreateColumnParams } from "./column-state.ts"
import type { ColumnRegistry } from "./column-registry.ts"
import type { ColumnShell } from "./column-shell.ts"
import type { ColumnCallbacks, ColumnRenderer, LaunchColumnFn } from "./column-renderer.ts"
import type { MobileHistoryEntry } from "./column-history.ts"
import {
  addColumn,
  createColumn,
  createColumnState,
  findColumn,
  insertColumnAfter,
  pinnedColumns,
  removeColumn,
  reorderColumns,
  setLastFocused,
} from "./column-state.ts"
import { createColumnRenderer } from "./column-renderer.ts"
import { createColumnLazyLoader } from "./column-lazy-loader.ts"
import { createClosedColumnsHistory } from "./column-history.ts"
import { createMobileNavigator } from "./column-mobile-nav.ts"
import {
  applyLayoutOp,
  moveColumnByKeyboard,
  planInsertion,
  repositionPinned,
  resolveInsertAfterKey,
} from "./column-layout.ts"
import type { PersistenceAdapter } from "./column-persistence.ts"
import { parseSavedColumns, serialiseColumns } from "./column-persistence.ts"
import { ColumnLifecycleError } from "./errors.ts"

/** Shared assets loaded once when the deck initialises, before any column renders. */
interface ColumnAssetPaths {
  readonly css: ReadonlyArray<string>
  readonly templates: ReadonlyArray<string>
}

interface PinnedColumnDescriptor {
  readonly type: string
  readonly entityId: string | null
}

interface ColumnManagerDeps<S extends ColumnServices = ColumnServices> {
  readonly mountElement: HTMLElement
  readonly persistence: PersistenceAdapter
  readonly assetLoader: AssetLoader
  readonly assetPaths?: ColumnAssetPaths
  readonly columnRegistry: ColumnRegistry<S>
  readonly isMobile: () => boolean
  readonly initialMobileHistory?: ReadonlyArray<MobileHistoryEntry>
  readonly onPinnedColumnsChange?: ((columns: ReadonlyArray<PinnedColumnDescriptor>) => void) | null
  readonly onMobileHistoryChange?: () => void
  readonly services: S
}

interface ColumnManager {
  readonly init: () => Promise<void>
  readonly launchColumn: (type: string, entityId?: string | null) => Promise<string>
  readonly closeColumn: (key: ColumnKey) => void
  readonly refreshColumn: (key: ColumnKey) => Promise<void>
  readonly focusColumn: (key: ColumnKey) => void
  readonly reorder: (fromIndex: number, toIndex: number) => void
  readonly moveColumnKeyboard: (key: ColumnKey, direction: number) => boolean
  readonly undo: () => Promise<void>
  readonly goBack: () => Promise<void>
  readonly getLastFocusedElement: () => HTMLElement | null
  readonly getState: () => ColumnState
  readonly getColumnCount: () => number
  readonly getMobileHistory: () => ReadonlyArray<MobileHistoryEntry>
  readonly setPinned: (key: ColumnKey, pinned: boolean) => void
  readonly destroy: () => void
}

interface ColumnView<S extends ColumnServices> {
  readonly definition: ColumnDefinition<S>
  readonly shell: ColumnShell
}

const createColumnManager = <S extends ColumnServices = ColumnServices>({
  mountElement,
  persistence,
  assetLoader,
  assetPaths,
  columnRegistry,
  isMobile,
  initialMobileHistory = [],
  onPinnedColumnsChange = null,
  onMobileHistoryChange,
  services,
}: ColumnManagerDeps<S>): ColumnManager => {
  let state: ColumnState = createColumnState()
  const closedHistory = createClosedColumnsHistory()
  const mobileHistory: Array<MobileHistoryEntry> = [...initialMobileHistory]

  const renderer: ColumnRenderer<S> = createColumnRenderer({
    scrollContainer: mountElement,
    assetLoader,
    columnRegistry,
    getState: () => state,
    onFocus: (key) => {
      state = setLastFocused(state, key)
    },
  })

  const layoutDeps = { getElement: renderer.getElement }

  const buildColumn = (params: CreateColumnParams): Column =>
    createColumn({ ...params, singleton: columnRegistry.get(params.type)?.singleton ?? false })

  const resolveColumnView = (column: Column): ColumnView<S> | null => {
    const definition = columnRegistry.get(column.type)
    const shell = renderer.getShell(column.key)
    return definition && shell ? { definition, shell } : null
  }

  const buildOuterContext = (column: Column, shell: ColumnShell): OuterColumnContext<S> => ({
    entityId: column.entityId,
    launchColumn: (t: string, e?: string | null): Promise<string> => launchColumn(t, e, column.key),
    updateTitle: shell.updateTitle,
    updateMenuItems: shell.updateMenuItems,
    updateListItems: shell.updateListItems,
    updateHeaderStatus: shell.updateHeaderStatus,
    cloneTemplate: assetLoader.cloneTemplate,
    close: () => closeColumn(column.key),
    services,
  })

  const lazyLoader = createColumnLazyLoader({
    mountElement,
    loadColumn: (column, shell) => {
      renderer.loadColumnContent(column, shell, buildOuterContext(column, shell))
    },
  })

  const persist = (): void => {
    if (isMobile()) return
    persistence.save(serialiseColumns(state))
  }

  const notifyPinnedChange = (): void => {
    onPinnedColumnsChange?.(pinnedColumns(state).map(({ type, entityId }) => ({ type, entityId })))
  }

  const closeAllColumns = (): void => {
    renderer.removeColumnElements(state.columns)
    state = createColumnState()
  }

  const createColumnCallbacks = (column: Column): ColumnCallbacks => ({
    onClose: () => closeColumn(column.key),
    onRefresh: () => refreshColumn(column.key),
    onMenuSelect: async (action: string): Promise<void> => {
      const view = resolveColumnView(column)
      if (!view?.definition.onMenuSelect) return
      await view.definition.onMenuSelect(view.shell.getContentElement(), buildOuterContext(column, view.shell), action)
    },
    onListSelect: async (action: string, btn: HTMLButtonElement | null): Promise<void> => {
      const view = resolveColumnView(column)
      if (!view?.definition.onListSelect) return
      await view.definition.onListSelect(view.shell.getContentElement(), buildOuterContext(column, view.shell), {
        action,
        btn,
      })
    },
    onListsOpen: async (): Promise<void> => {
      const view = resolveColumnView(column)
      if (!view?.definition.onListsOpen) return
      await view.definition.onListsOpen(view.shell.getContentElement(), buildOuterContext(column, view.shell))
    },
    onPinChange: (pinned: boolean): void => applyPinState(column.key, pinned),
  })

  const attachColumnElement = (column: Column, element: HTMLElement): void => {
    const targetIndex = state.columns.findIndex((c) => c.key === column.key)
    applyLayoutOp(mountElement, planInsertion({ state, targetIndex, element, deps: layoutDeps }))
  }

  const renderColumnWithCallbacks = async (column: Column, shouldScroll = false): Promise<HTMLElement> => {
    const shell = renderer.mountColumnShell(column, createColumnCallbacks(column))
    attachColumnElement(column, shell.element)
    if (shouldScroll) renderer.scrollToElement(shell.element)
    await renderer.loadColumnContent(column, shell, buildOuterContext(column, shell))
    return shell.element
  }

  const mobileNav = createMobileNavigator({
    getState: () => state,
    setState: (next) => {
      state = next
    },
    mobileHistory,
    createColumn: (type, entityId) => buildColumn({ type, entityId }),
    closeAllColumns,
    renderColumn: renderColumnWithCallbacks,
    focusColumn: renderer.focusColumn,
    onMobileHistoryChange,
  })

  const updateSingletonColumn = async (column: Column, entityId: string | null): Promise<void> => {
    const updated: Column = { ...column, entityId }
    state = {
      ...state,
      columns: state.columns.map((c) => c.key === column.key ? updated : c),
    }
    const view = resolveColumnView(updated)
    if (!view) return
    renderer.syncColumnDataset(updated)
    view.shell.updateTitle(view.definition.getTitle(entityId))
    await renderer.loadColumnContent(updated, view.shell, buildOuterContext(updated, view.shell))
  }

  const focusExistingColumn = (column: Column): string => {
    const element = renderer.getElement(column.key)
    if (element) renderer.scrollToElement(element)
    renderer.focusColumn(column.key)
    return column.key
  }

  const launchColumn: LaunchColumnFn = async (
    type: string,
    entityId: string | null = null,
    spawnedFrom: ColumnKey | null = null,
  ): Promise<string> => {
    const definition = columnRegistry.get(type)
    if (!definition) throw new ColumnLifecycleError(`Unknown column type: ${type}`)

    if (isMobile()) return mobileNav.navigateTo(type, entityId)

    if (definition.singleton) {
      const existing = state.columns.find((c) => c.type === type)
      if (existing && renderer.getElement(existing.key)) {
        if (entityId !== existing.entityId) {
          await updateSingletonColumn(existing, entityId)
          persist()
        }
        return focusExistingColumn(existing)
      }
    }

    const existing = state.columns.find((c) => c.type === type && c.entityId === entityId)
    if (existing) return focusExistingColumn(existing)

    const insertAfterKey = resolveInsertAfterKey(state, spawnedFrom)
    const column = buildColumn({ type, entityId, spawnedFrom: insertAfterKey })
    state = insertAfterKey ? insertColumnAfter(state, column, insertAfterKey) : addColumn(state, column)

    await renderColumnWithCallbacks(column, true)
    renderer.focusColumn(column.key)
    persist()
    return column.key
  }

  const closeColumn = (key: ColumnKey): void => {
    if (!renderer.getElement(key)) return
    lazyLoader.cancel(key)

    const closedIndex = state.columns.findIndex((c) => c.key === key)
    const closedColumn = state.columns[closedIndex]
    if (!closedColumn) return

    closedHistory.record({
      type: closedColumn.type,
      entityId: closedColumn.entityId,
      afterKey: state.columns[closedIndex - 1]?.key ?? null,
    })

    renderer.removeColumnElements([{ key }])
    state = removeColumn(state, key)

    const focusTarget = state.columns[closedIndex] ?? state.columns[closedIndex - 1]
    if (focusTarget) renderer.focusColumn(focusTarget.key)

    persist()
    if (closedColumn.pinned) notifyPinnedChange()
  }

  const undo = async (): Promise<void> => {
    const last = closedHistory.takeLast()
    if (!last) return

    const afterExists = last.afterKey !== null && state.columns.some((c) => c.key === last.afterKey)
    const column = buildColumn({
      type: last.type,
      entityId: last.entityId,
      spawnedFrom: afterExists ? last.afterKey : null,
    })

    const existing = findColumn(state, column.key)
    if (existing) {
      focusExistingColumn(existing)
      return
    }

    if (afterExists && last.afterKey) {
      state = insertColumnAfter(state, column, last.afterKey)
    } else {
      state = { ...state, columns: [column, ...state.columns] }
    }

    await renderColumnWithCallbacks(column)
    renderer.focusColumn(column.key)
    persist()
  }

  const refreshColumn = async (key: ColumnKey): Promise<void> => {
    const column = findColumn(state, key)
    if (!column) return
    const view = resolveColumnView(column)
    if (!view) return
    await view.definition.refresh(view.shell.getContentElement(), buildOuterContext(column, view.shell))
  }

  const reorder = (fromIndex: number, toIndex: number): void => {
    state = reorderColumns(state, fromIndex, toIndex)
    persist()
  }

  const applyPinState = (key: ColumnKey, pinned: boolean): void => {
    const before = findColumn(state, key)
    if (!before || before.pinned === pinned) return
    const result = repositionPinned({ state, key, pinned, deps: layoutDeps })
    state = result.state
    if (result.op) applyLayoutOp(mountElement, result.op)
    if (result.element) renderer.scrollToElement(result.element)
    persist()
    notifyPinnedChange()
  }

  const moveColumnKeyboard = (key: ColumnKey, direction: number): boolean => {
    const result = moveColumnByKeyboard({ state, key, direction, deps: layoutDeps })
    if (!result.moved) return false
    state = result.state
    if (result.op) applyLayoutOp(mountElement, result.op)
    if (result.element) renderer.scrollToElement(result.element)
    persist()
    return true
  }

  const getLastFocusedElement = (): HTMLElement | null =>
    state.lastFocusedKey ? renderer.getElement(state.lastFocusedKey) ?? null : null

  const restoreFromSavedState = (savedState: string): void => {
    const seenKeys = new Set<ColumnKey>()
    for (const saved of parseSavedColumns(savedState)) {
      if (!columnRegistry.has(saved.type)) continue
      const column = buildColumn({ type: saved.type, entityId: saved.entityId, pinned: saved.pinned })
      if (seenKeys.has(column.key)) continue
      seenKeys.add(column.key)
      state = addColumn(state, column)
      const shell = renderer.mountColumnShell(column, createColumnCallbacks(column))
      attachColumnElement(column, shell.element)
      if (column.pinned) shell.setPinned(true, { notify: false })
      lazyLoader.enqueue(column, shell)
    }
  }

  const init = async (): Promise<void> => {
    const cssPaths = assetPaths?.css ?? []
    const templatePaths = assetPaths?.templates ?? []
    await Promise.all([
      ...cssPaths.map((path) => assetLoader.loadCss(path)),
      ...templatePaths.map((path) => assetLoader.loadHtml(path)),
    ])

    if (isMobile()) return

    const savedState = persistence.load()
    if (savedState) restoreFromSavedState(savedState)
  }

  const destroy = (): void => {
    lazyLoader.disconnect()
    closeAllColumns()
  }

  return Object.freeze({
    init,
    launchColumn: (type: string, entityId?: string | null) => launchColumn(type, entityId),
    closeColumn,
    refreshColumn,
    focusColumn: renderer.focusColumn,
    reorder,
    moveColumnKeyboard,
    undo,
    goBack: mobileNav.goBack,
    getLastFocusedElement,
    getState: () => state,
    getColumnCount: () => state.columns.length,
    getMobileHistory: () => [...mobileHistory],
    setPinned: applyPinState,
    destroy,
  })
}

export type { ColumnAssetPaths, ColumnManager, ColumnManagerDeps }
export { createColumnManager }
