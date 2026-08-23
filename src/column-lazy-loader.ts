import type { Column, ColumnKey } from "./column-state.ts"
import type { ColumnShell } from "./column-shell.ts"
import { getColumnKeyFromElement } from "./column-dom.ts"

interface PendingColumn {
  readonly column: Column
  readonly shell: ColumnShell
}

interface ColumnLazyLoaderDeps {
  readonly mountElement: HTMLElement
  readonly loadColumn: (column: Column, shell: ColumnShell) => void
}

interface ColumnLazyLoader {
  readonly enqueue: (column: Column, shell: ColumnShell) => void
  readonly cancel: (key: ColumnKey) => void
  readonly disconnect: () => void
}

const createColumnLazyLoader = ({ mountElement, loadColumn }: ColumnLazyLoaderDeps): ColumnLazyLoader => {
  const pending = new Map<ColumnKey, PendingColumn>()
  let observer: IntersectionObserver | null = null

  const getOrCreateObserver = (): IntersectionObserver => {
    if (observer) return observer
    const created = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        if (!(entry.target instanceof HTMLElement)) continue
        const key = getColumnKeyFromElement(entry.target)
        const item = key === null ? undefined : pending.get(key)
        if (!item) continue
        pending.delete(item.column.key)
        created.unobserve(entry.target)
        loadColumn(item.column, item.shell)
      }
    }, { root: mountElement, rootMargin: "200px" })
    observer = created
    return created
  }

  const enqueue = (column: Column, shell: ColumnShell): void => {
    pending.set(column.key, { column, shell })
    getOrCreateObserver().observe(shell.element)
  }

  const cancel = (key: ColumnKey): void => {
    const entry = pending.get(key)
    if (!entry) return
    observer?.unobserve(entry.shell.element)
    pending.delete(key)
  }

  const disconnect = (): void => {
    observer?.disconnect()
    observer = null
    pending.clear()
  }

  return Object.freeze({ enqueue, cancel, disconnect })
}

export type { ColumnLazyLoader, ColumnLazyLoaderDeps }
export { createColumnLazyLoader }
