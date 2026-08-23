import type { AssetLoader, ColumnServices, OuterColumnContext } from "./column-base.ts"
import type { Column, ColumnKey } from "./column-state.ts"
import type { ColumnShell } from "./column-shell.ts"
import type { ColumnRegistry } from "./column-registry.ts"
import { createColumnShell } from "./column-shell.ts"
import type { ShellTemplate } from "./shell-template.ts"
import { applyColumnDataset } from "./column-dom.ts"
import { ColumnLifecycleError } from "./errors.ts"

type LaunchColumnFn = (type: string, entityId?: string | null, spawnedFrom?: ColumnKey | null) => Promise<string>

interface ColumnCallbacks {
  readonly onClose: () => void
  readonly onRefresh: () => void
  readonly onMenuSelect: (action: string) => Promise<void>
  readonly onListSelect: (action: string, btn: HTMLButtonElement | null) => Promise<void>
  readonly onListsOpen: () => Promise<void>
  readonly onPinChange: (pinned: boolean) => void
}

interface ColumnRendererDeps<S extends ColumnServices = ColumnServices> {
  readonly scrollContainer: HTMLElement
  readonly assetLoader: AssetLoader
  readonly shellTemplate: ShellTemplate
  readonly columnRegistry: ColumnRegistry<S>
  readonly onFocus: (key: ColumnKey) => void
}

interface ColumnRenderer<S extends ColumnServices = ColumnServices> {
  readonly scrollToElement: (element: HTMLElement) => void
  readonly focusColumn: (key: ColumnKey) => void
  readonly mountColumnShell: (column: Column, callbacks: ColumnCallbacks) => ColumnShell
  readonly syncColumnDataset: (column: Column) => void
  readonly loadColumnContent: (column: Column, shell: ColumnShell, context: OuterColumnContext<S>) => Promise<void>
  readonly destroyColumns: (columns: ReadonlyArray<Column>) => void
  readonly getElement: (key: ColumnKey) => HTMLElement | undefined
  readonly getShell: (key: ColumnKey) => ColumnShell | undefined
}

const nextPaint = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

const createColumnRenderer = <S extends ColumnServices = ColumnServices>({
  scrollContainer,
  assetLoader,
  shellTemplate,
  columnRegistry,
  onFocus,
}: ColumnRendererDeps<S>): ColumnRenderer<S> => {
  const columnShells = new Map<ColumnKey, ColumnShell>()

  const scrollToElement = (element: HTMLElement): void => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        element.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" })
      })
    })
  }

  const mountColumnShell = (
    column: Column,
    { onClose, onRefresh, onMenuSelect, onListSelect, onListsOpen, onPinChange }: ColumnCallbacks,
  ): ColumnShell => {
    const definition = columnRegistry.get(column.type)
    if (!definition) {
      throw new ColumnLifecycleError(`Unknown column type: ${column.type}`)
    }

    const shell = createColumnShell({
      shellTemplate,
      title: definition.getTitle(column.entityId),
      hasClose: definition.hasClose,
      hasRefresh: definition.hasRefresh,
      hasLists: definition.hasLists,
      hasPin: definition.hasPin,
      menuItems: definition.menuItems,
      onClose,
      onRefresh,
      onMenuSelect,
      onListSelect,
      onListsOpen,
      onPinChange,
      onFocus: () => onFocus(column.key),
      scrollContainer,
    })

    applyColumnDataset(shell.element, column)
    columnShells.set(column.key, shell)

    return shell
  }

  const syncColumnDataset = (column: Column): void => {
    const shell = columnShells.get(column.key)
    if (shell) applyColumnDataset(shell.element, column)
  }

  const loadColumnContent = async (
    column: Column,
    shell: ColumnShell,
    context: OuterColumnContext<S>,
  ): Promise<void> => {
    const definition = columnRegistry.get(column.type)
    if (!definition) return
    await definition.loadAssets(assetLoader)
    await nextPaint()
    // The column may have been closed or the deck destroyed while assets loaded; onDestroy has
    // already run for it, so rendering now would wire up work nothing will ever tear down.
    if (columnShells.get(column.key) !== shell) return
    await definition.render(shell.getContentElement(), context)
  }

  const destroyColumns = (columns: ReadonlyArray<Column>): void => {
    columns.forEach((col) => {
      const shell = columnShells.get(col.key)
      if (!shell) return
      columnRegistry.get(col.type)?.onDestroy(shell.getContentElement())
      shell.element.remove()
      shell.destroy()
      columnShells.delete(col.key)
    })
  }

  const getElement = (key: ColumnKey): HTMLElement | undefined => columnShells.get(key)?.element

  const getShell = (key: ColumnKey): ColumnShell | undefined => columnShells.get(key)

  const focusColumn = (key: ColumnKey): void => {
    const shell = columnShells.get(key)
    if (!shell) return
    shell.element.querySelector<HTMLElement>("header h2")?.focus()
  }

  return Object.freeze({
    scrollToElement,
    focusColumn,
    mountColumnShell,
    syncColumnDataset,
    loadColumnContent,
    destroyColumns,
    getElement,
    getShell,
  })
}

export type { ColumnCallbacks, ColumnRenderer, ColumnRendererDeps, LaunchColumnFn }
export { createColumnRenderer }
