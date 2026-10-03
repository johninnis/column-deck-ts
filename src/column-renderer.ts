import type { ColumnHandlers, ColumnHost, ColumnLifecycle, ColumnServices } from "./column-base.ts"
import { lifecycleOf, NO_HANDLERS } from "./column-base.ts"
import type { Column, ColumnKey } from "./column-state.ts"
import type { ColumnShell, ShellEvents } from "./column-shell.ts"
import type { ColumnRegistry } from "./column-registry.ts"
import { createColumnShell } from "./column-shell.ts"
import type { ShellTemplate } from "./shell-template.ts"
import { applyColumnDataset } from "./column-dom.ts"
import { ColumnLifecycleError } from "./errors.ts"
import { scrollBehaviour } from "./motion.ts"

interface ColumnBindings<S extends ColumnServices = ColumnServices> {
  readonly eventsFor: (key: ColumnKey) => ShellEvents
  readonly hostFor: (column: Column, shell: ColumnShell) => ColumnHost<S>
}

interface ColumnRendererDeps<S extends ColumnServices = ColumnServices> {
  readonly shellTemplate: ShellTemplate
  readonly registry: ColumnRegistry<S>
  readonly bindings: ColumnBindings<S>
}

interface ColumnRenderer {
  readonly mount: (column: Column) => ColumnShell
  readonly render: (column: Column) => Promise<void>
  readonly refresh: (column: Column) => Promise<void>
  readonly handlersOf: (key: ColumnKey) => ColumnHandlers
  readonly rebind: (column: Column) => void
  readonly renderPinned: (column: Column) => void
  readonly destroy: (columns: ReadonlyArray<Column>) => void
  readonly focus: (key: ColumnKey) => void
  readonly scrollIntoView: (key: ColumnKey) => void
  readonly shellOf: (key: ColumnKey) => ColumnShell | undefined
}

interface MountedColumn<S extends ColumnServices> {
  readonly shell: ColumnShell
  readonly lifecycle: ColumnLifecycle<S>
}

const nextPaint = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

const createColumnRenderer = <S extends ColumnServices = ColumnServices>(
  { shellTemplate, registry, bindings }: ColumnRendererDeps<S>,
): ColumnRenderer => {
  const mounted = new Map<ColumnKey, MountedColumn<S>>()

  const requireMounted = (key: ColumnKey): MountedColumn<S> => {
    const entry = mounted.get(key)
    if (!entry) throw new ColumnLifecycleError(`Column is not mounted: ${key}`)
    return entry
  }

  const mount = (column: Column): ColumnShell => {
    const definition = registry.get(column.type)
    if (!definition) throw new ColumnLifecycleError(`Unknown column type: ${column.type}`)
    const lifecycle = lifecycleOf(definition)
    const { getTitle, ...chrome } = lifecycle.chrome
    const shell = createColumnShell(
      shellTemplate,
      { ...chrome, title: getTitle(column.entityId) },
      bindings.eventsFor(column.key),
    )
    applyColumnDataset(shell.element, column)
    shell.renderPinned(column.pinned)
    mounted.set(column.key, { shell, lifecycle })
    return shell
  }

  const render = async (column: Column): Promise<void> => {
    const { shell, lifecycle } = requireMounted(column.key)
    await lifecycle.render(shell.getContentElement(), bindings.hostFor(column, shell), nextPaint)
  }

  const refresh = async (column: Column): Promise<void> => {
    const { shell, lifecycle } = requireMounted(column.key)
    await lifecycle.refresh(shell.getContentElement(), bindings.hostFor(column, shell), nextPaint)
  }

  const handlersOf = (key: ColumnKey): ColumnHandlers => {
    const entry = mounted.get(key)
    return entry ? entry.lifecycle.handlersOf(entry.shell.getContentElement()) : NO_HANDLERS
  }

  const rebind = (column: Column): void => {
    const { shell, lifecycle } = requireMounted(column.key)
    applyColumnDataset(shell.element, column)
    shell.updateTitle(lifecycle.chrome.getTitle(column.entityId))
  }

  const renderPinned = (column: Column): void => requireMounted(column.key).shell.renderPinned(column.pinned)

  const destroy = (columns: ReadonlyArray<Column>): void => {
    columns.forEach((column) => {
      const entry = mounted.get(column.key)
      if (!entry) return
      mounted.delete(column.key)
      entry.lifecycle.destroy(entry.shell.getContentElement())
      entry.shell.element.remove()
      entry.shell.destroy()
    })
  }

  const focus = (key: ColumnKey): void => {
    mounted.get(key)?.shell.element.querySelector<HTMLElement>("header h2")?.focus()
  }

  const scrollIntoView = (key: ColumnKey): void => {
    const element = mounted.get(key)?.shell.element
    if (!element) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        element.scrollIntoView({ behavior: scrollBehaviour(), inline: "nearest", block: "nearest" })
      })
    })
  }

  return Object.freeze({
    mount,
    render,
    refresh,
    handlersOf,
    rebind,
    renderPinned,
    destroy,
    focus,
    scrollIntoView,
    shellOf: (key: ColumnKey): ColumnShell | undefined => mounted.get(key)?.shell,
  })
}

export type { ColumnBindings, ColumnRenderer, ColumnRendererDeps }
export { createColumnRenderer }
