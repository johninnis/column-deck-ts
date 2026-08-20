import type { AssetLoader, ColumnDefinition, ColumnServices } from "./column-base.ts"
import type { PersistenceAdapter } from "./column-persistence.ts"
import type { ColumnKey, ColumnState } from "./column-state.ts"
import type { MobileHistoryEntry } from "./column-history.ts"
import type { ColumnAssetPaths } from "./column-manager.ts"
import { createColumnManager } from "./column-manager.ts"
import { createDragHandler } from "./drag-handler.ts"
import { createKeyboardHandler } from "./keyboard-handler.ts"
import { createColumnRegistry } from "./column-registry.ts"

/** Everything the host injects into {@linkcode createColumnDeck}: mount point, asset loader, persistence, callbacks, column definitions, and services. */
interface ColumnDeckDeps<S extends ColumnServices = ColumnServices> {
  readonly mountElement: HTMLElement
  readonly assetLoader: AssetLoader
  readonly persistence: PersistenceAdapter
  readonly isMobile: () => boolean
  readonly initialMobileHistory?: ReadonlyArray<MobileHistoryEntry>
  readonly assetPaths?: ColumnAssetPaths
  readonly onPinnedColumnsChange?: ((columns: ReadonlyArray<{ type: string; entityId: string | null }>) => void) | null
  readonly onMobileHistoryChange?: () => void
  readonly onCompose?: () => void
  readonly onEscape?: () => boolean
  readonly columnDefinitions?: ReadonlyArray<ColumnDefinition<S>>
  readonly services: S
}

/** The running column deck: launch, close, refresh, undo, back navigation, pinning, state inspection, and teardown. */
interface ColumnDeck {
  readonly launchColumn: (type: string, entityId?: string | null) => Promise<string>
  readonly closeColumn: (key: ColumnKey) => void
  readonly refreshColumn: (key: ColumnKey) => Promise<void>
  readonly undo: () => Promise<void>
  readonly goBack: () => Promise<void>
  readonly getState: () => ColumnState
  readonly getColumnCount: () => number
  readonly getMobileHistory: () => ReadonlyArray<MobileHistoryEntry>
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
  assetLoader,
  persistence,
  isMobile,
  initialMobileHistory,
  assetPaths,
  onPinnedColumnsChange = null,
  onMobileHistoryChange,
  onCompose,
  onEscape,
  columnDefinitions = [],
  services,
}: ColumnDeckDeps<S>): Promise<ColumnDeck> => {
  const columnRegistry = createColumnRegistry<S>()

  columnDefinitions.forEach((def) => columnRegistry.register(def.type, def))

  const manager = createColumnManager({
    mountElement,
    persistence,
    assetLoader,
    assetPaths,
    columnRegistry,
    isMobile,
    initialMobileHistory,
    onPinnedColumnsChange,
    onMobileHistoryChange,
    services,
  })

  const dragHandler = createDragHandler({
    containerElement: mountElement,
    onReorder: manager.reorder,
    isMobile,
  })

  const keyboardHandler = createKeyboardHandler({
    containerElement: mountElement,
    getLastFocusedElement: manager.getLastFocusedElement,
    onFocusColumn: manager.focusColumn,
    onUndo: manager.undo,
    onMoveColumn: manager.moveColumnKeyboard,
    onClose: manager.closeColumn,
    onRefresh: manager.refreshColumn,
    onCompose,
    onEscape,
  })

  await manager.init()
  dragHandler.attach()
  keyboardHandler.attach()

  const destroy = (): void => {
    dragHandler.detach()
    keyboardHandler.detach()
    manager.destroy()
  }

  return Object.freeze({
    launchColumn: (type: string, entityId?: string | null) => manager.launchColumn(type, entityId),
    closeColumn: manager.closeColumn,
    refreshColumn: manager.refreshColumn,
    undo: manager.undo,
    goBack: manager.goBack,
    getState: manager.getState,
    getColumnCount: manager.getColumnCount,
    getMobileHistory: manager.getMobileHistory,
    setPinned: manager.setPinned,
    destroy,
  })
}

export type { ColumnDeck, ColumnDeckDeps }
export { createColumnDeck }
