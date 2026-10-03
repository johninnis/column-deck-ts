import type { AssetLoader, ColumnDefinition, ColumnHost, ColumnServices } from "./column-base.ts"
import { lifecycleOf } from "./column-base.ts"
import type { PersistenceAdapter } from "./column-persistence.ts"
import { createSessionStoragePersistence, parseSavedColumns, serialiseColumns } from "./column-persistence.ts"
import type { Column, ColumnKey, ColumnPlacement, ColumnRef, ColumnState } from "./column-state.ts"
import {
  createColumn,
  createColumnState,
  findColumn,
  pinnedColumns,
  replaceColumn,
  setLastFocused,
} from "./column-state.ts"
import type { DropTarget } from "./column-layout.ts"
import { indexBeside, indexByStep, placementAfter } from "./column-layout.ts"
import type { ColumnShell, ShellEvents } from "./column-shell.ts"
import { type ClosedColumnsHistory, recordClosed } from "./column-history.ts"
import { popLast } from "./immutable-list.ts"
import { createColumnStore } from "./column-store.ts"
import { createColumnRegistry } from "./column-registry.ts"
import { createColumnRenderer } from "./column-renderer.ts"
import { createDeckLayout } from "./deck-layout.ts"
import { createMobileNavigator } from "./column-mobile-nav.ts"
import { createColumnLazyLoader } from "./column-lazy-loader.ts"
import { createDragHandler } from "./drag-handler.ts"
import { createKeyboardHandler } from "./keyboard-handler.ts"
import { createBrowserAssetLoader } from "./browser-asset-loader.ts"
import { defaultShellTemplate, type ShellTemplate } from "./shell-template.ts"
import { ColumnLifecycleError } from "./errors.ts"

const isNarrowViewport = (): boolean => !matchMedia("(min-width: 768px)").matches

// Deliberate: the one event-edge catch, reporting rather than swallowing — see ADR-0010
const reportRejection = (outcome: void | Promise<unknown>): void => {
  if (outcome instanceof Promise) outcome.catch(reportError)
}

/** Shared assets loaded once when the deck initialises, before any column renders. */
interface ColumnAssetPaths {
  readonly css: ReadonlyArray<string>
  readonly templates: ReadonlyArray<string>
}

/** What the host hands {@linkcode createColumnDeck}: the mount point, column definitions and services, plus optional overrides for the asset loader, shell template, persistence and mobile breakpoint (each defaults to the deck's browser implementation) and the lifecycle callbacks. */
interface ColumnDeckDeps<S extends ColumnServices = ColumnServices> {
  readonly mountElement: HTMLElement
  readonly assetLoader?: AssetLoader | undefined
  readonly shellTemplate?: ShellTemplate | undefined
  readonly persistence?: PersistenceAdapter | undefined
  readonly isMobile?: (() => boolean) | undefined
  readonly initialMobileHistory?: ReadonlyArray<ColumnRef> | undefined
  readonly assetPaths?: ColumnAssetPaths | undefined
  readonly onPinnedColumnsChange?: ((columns: ReadonlyArray<ColumnRef>) => void) | undefined
  readonly onMobileHistoryChange?: (() => void) | undefined
  readonly onEscape?: (() => boolean) | undefined
  readonly columnDefinitions?: ReadonlyArray<ColumnDefinition<S>> | undefined
  readonly services: S
}

/** The running column deck: launch, close, refresh, undo, back navigation, pinning, state inspection (including the focused column's element, for host-side keyboard handling inside a column), and teardown. */
interface ColumnDeck {
  readonly launchColumn: (type: string, entityId?: string | null) => Promise<string>
  readonly closeColumn: (key: ColumnKey) => Promise<void>
  readonly refreshColumn: (key: ColumnKey) => Promise<void>
  readonly undo: () => Promise<void>
  readonly goBack: () => Promise<void>
  readonly getState: () => ColumnState
  readonly getColumnCount: () => number
  readonly getFocusedColumnElement: () => HTMLElement | null
  readonly getMobileHistory: () => ReadonlyArray<ColumnRef>
  readonly setPinned: (key: ColumnKey, pinned: boolean) => void
  readonly destroy: () => void
}

/**
 * Assembles and starts the column deck: registers the column definitions, restores
 * persisted columns, and attaches drag-to-reorder and keyboard handlers. Call
 * `destroy()` on the returned {@linkcode ColumnDeck} to close every open column
 * and detach everything.
 */
const createColumnDeck = async <S extends ColumnServices = ColumnServices>({
  mountElement,
  assetLoader = createBrowserAssetLoader(),
  shellTemplate = defaultShellTemplate,
  persistence = createSessionStoragePersistence(),
  isMobile = isNarrowViewport,
  initialMobileHistory = [],
  assetPaths,
  onPinnedColumnsChange,
  onMobileHistoryChange,
  onEscape,
  columnDefinitions = [],
  services,
}: ColumnDeckDeps<S>): Promise<ColumnDeck> => {
  const registry = createColumnRegistry(columnDefinitions)
  const store = createColumnStore()
  let closedHistory: ClosedColumnsHistory = []

  const columnFor = ({ type, entityId }: ColumnRef, pinned = false): Column => {
    const definition = registry.get(type)
    if (!definition) throw new ColumnLifecycleError(`Unknown column type: ${type}`)
    return createColumn({ type, entityId, pinned, singleton: lifecycleOf(definition).singleton })
  }

  const eventsFor = (key: ColumnKey): ShellEvents => ({
    onClose: () => reportRejection(closeColumn(key)),
    onRefresh: () => reportRejection(refreshColumn(key)),
    onMenuSelect: (action) => reportRejection(renderer.handlersOf(key).onMenuSelect?.(action)),
    onListSelect: (action, btn) => reportRejection(renderer.handlersOf(key).onListSelect?.({ action, btn })),
    onListsOpen: () => reportRejection(renderer.handlersOf(key).onListsOpen?.()),
    onTogglePin: () => togglePinned(key),
    onFocus: () => store.update((state) => setLastFocused(state, key)),
    onHeaderWheel: (deltaY) => {
      mountElement.scrollLeft += deltaY
    },
  })

  const hostFor = (column: Column, shell: ColumnShell): ColumnHost<S> => ({
    entityId: column.entityId,
    launchColumn: (type, entityId = null) => launchColumn(type, entityId, column.key),
    updateTitle: shell.updateTitle,
    updateMenuItems: shell.updateMenuItems,
    updateListItems: shell.updateListItems,
    updateHeaderStatus: shell.updateHeaderStatus,
    close: () => reportRejection(closeColumn(column.key)),
    assetLoader,
    services,
  })

  const renderer = createColumnRenderer({ shellTemplate, registry, bindings: { eventsFor, hostFor } })
  const layout = createDeckLayout({ mountElement, store, renderer })
  const mobile = createMobileNavigator({
    store,
    layout,
    renderer,
    columnFor,
    history: { initial: initialMobileHistory, onChange: onMobileHistoryChange },
  })
  const lazyLoader = createColumnLazyLoader({
    mountElement,
    loadColumn: (column) => reportRejection(renderer.render(column)),
  })

  const persist = (): void => {
    if (!isMobile()) persistence.save(serialiseColumns(store.get()))
  }

  const focusExisting = (key: ColumnKey): string => {
    renderer.scrollIntoView(key)
    renderer.focus(key)
    return key
  }

  const rebind = async (column: Column, entityId: string | null): Promise<void> => {
    const rebound: Column = { ...column, entityId }
    store.update((state) => replaceColumn(state, rebound))
    renderer.rebind(rebound)
    await renderer.render(rebound)
    persist()
  }

  const launch = async (ref: ColumnRef, placement: ColumnPlacement): Promise<string> => {
    const column = columnFor(ref)
    const existing = findColumn(store.get(), column.key)
    if (existing) {
      if (existing.entityId !== ref.entityId) await rebind(existing, ref.entityId)
      return focusExisting(existing.key)
    }
    const opened: Column = { ...column, spawnedFrom: typeof placement === "object" ? placement.after : null }
    layout.open(opened, placement)
    renderer.scrollIntoView(opened.key)
    await renderer.render(opened)
    renderer.focus(opened.key)
    persist()
    return opened.key
  }

  const launchColumn = async (
    type: string,
    entityId: string | null,
    spawnedFrom: ColumnKey | null,
  ): Promise<string> => {
    if (isMobile()) return mobile.navigateTo({ type, entityId })
    return launch({ type, entityId }, placementAfter(store.get(), spawnedFrom, "last"))
  }

  const closeColumn = async (key: ColumnKey): Promise<void> => {
    const { columns } = store.get()
    const index = columns.findIndex((c) => c.key === key)
    const column = columns[index]
    if (!column || column.pinned) return
    lazyLoader.cancel(key)
    closedHistory = recordClosed(closedHistory, {
      type: column.type,
      entityId: column.entityId,
      afterKey: columns[index - 1]?.key ?? null,
    })
    if (isMobile()) return mobile.close(key)
    layout.remove(key)
    const remaining = store.get().columns
    const neighbour = remaining[index] ?? remaining[index - 1]
    if (neighbour) renderer.focus(neighbour.key)
    persist()
  }

  const undo = async (): Promise<void> => {
    const popped = popLast(closedHistory)
    if (!popped) return
    closedHistory = popped.rest
    const { type, entityId, afterKey } = popped.last
    if (isMobile()) {
      await mobile.navigateTo({ type, entityId })
      return
    }
    await launch({ type, entityId }, placementAfter(store.get(), afterKey, "first"))
  }

  const refreshColumn = async (key: ColumnKey): Promise<void> => {
    const column = findColumn(store.get(), key)
    if (column) await renderer.refresh(column)
  }

  const setPinned = (key: ColumnKey, pinned: boolean): void => {
    if (!layout.pin(key, pinned)) return
    persist()
    onPinnedColumnsChange?.(pinnedColumns(store.get()).map(({ type, entityId }) => ({ type, entityId })))
  }

  const togglePinned = (key: ColumnKey): void => {
    const column = findColumn(store.get(), key)
    if (column) setPinned(key, !column.pinned)
  }

  const moveTo = (key: ColumnKey, toIndex: number): void => {
    if (layout.move(key, toIndex)) persist()
  }

  const getFocusedColumnElement = (): HTMLElement | null => {
    const key = store.get().lastFocusedKey
    return key === null ? null : renderer.shellOf(key)?.element ?? null
  }

  const restoreSavedLayout = (): void => {
    const saved = persistence.load()
    if (!saved) return
    for (const { type, entityId, pinned } of parseSavedColumns(saved)) {
      if (!registry.has(type)) continue
      const column = columnFor({ type, entityId }, pinned)
      if (findColumn(store.get(), column.key)) continue
      layout.open(column, "last")
      const element = renderer.shellOf(column.key)?.element
      if (element) lazyLoader.enqueue(column, element)
    }
  }

  const dragHandler = createDragHandler({
    containerElement: mountElement,
    onDragOver: (key: ColumnKey, target: DropTarget) => moveTo(key, indexBeside(store.get(), key, target)),
    isMobile,
  })

  const keyboardHandler = createKeyboardHandler({
    containerElement: mountElement,
    getFocusedColumnElement,
    onFocusColumn: renderer.focus,
    onUndo: () => reportRejection(undo()),
    onMoveColumn: (key, direction) => moveTo(key, indexByStep(store.get(), key, direction)),
    onClose: (key) => reportRejection(closeColumn(key)),
    onRefresh: (key) => reportRejection(refreshColumn(key)),
    onEscape,
  })

  await Promise.all([
    ...(assetPaths?.css ?? []).map((path) => assetLoader.loadCss(path)),
    ...(assetPaths?.templates ?? []).map((path) => assetLoader.loadHtml(path)),
  ])
  if (!isMobile()) restoreSavedLayout()
  dragHandler.attach()
  keyboardHandler.attach()

  const destroy = (): void => {
    dragHandler.detach()
    keyboardHandler.detach()
    lazyLoader.disconnect()
    mobile.destroy()
    renderer.destroy(store.get().columns)
    store.update(() => createColumnState())
  }

  return Object.freeze({
    launchColumn: (type: string, entityId: string | null = null) => launchColumn(type, entityId, null),
    closeColumn,
    refreshColumn,
    undo,
    goBack: mobile.goBack,
    getState: store.get,
    getColumnCount: () => store.get().columns.length,
    getFocusedColumnElement,
    getMobileHistory: mobile.getHistory,
    setPinned,
    destroy,
  })
}

export type { ColumnAssetPaths, ColumnDeck, ColumnDeckDeps }
export { createColumnDeck }
