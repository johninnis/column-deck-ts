import type { Column, ColumnKey, ColumnPlacement } from "./column-state.ts"
import { findColumn, insertColumn, removeColumn } from "./column-state.ts"
import type { ColumnStore } from "./column-store.ts"
import type { ColumnRenderer } from "./column-renderer.ts"
import type { LayoutDeps } from "./column-layout.ts"
import { applyLayoutOp, moveColumn, planInsertion, repositionPinned } from "./column-layout.ts"
import { resolveScrollRegion } from "./column-shell.ts"
import { ColumnLifecycleError } from "./errors.ts"

interface DeckLayoutDeps {
  readonly mountElement: HTMLElement
  readonly store: ColumnStore
  readonly renderer: ColumnRenderer
}

interface DeckLayout {
  readonly open: (column: Column, placement: ColumnPlacement) => void
  readonly detach: (key: ColumnKey) => number
  readonly reattach: (column: Column, scrollTop: number) => void
  readonly remove: (key: ColumnKey) => void
  readonly pin: (key: ColumnKey, pinned: boolean) => boolean
  readonly move: (key: ColumnKey, toIndex: number) => boolean
}

const createDeckLayout = ({ mountElement, store, renderer }: DeckLayoutDeps): DeckLayout => {
  const layoutDeps: LayoutDeps = { getElement: (key) => renderer.shellOf(key)?.element }

  const requireShellElement = (key: ColumnKey): HTMLElement => {
    const element = renderer.shellOf(key)?.element
    if (!element) throw new ColumnLifecycleError(`Column is not mounted: ${key}`)
    return element
  }

  const place = (key: ColumnKey): void => {
    const state = store.get()
    const targetIndex = state.columns.findIndex((c) => c.key === key)
    applyLayoutOp(
      mountElement,
      planInsertion({ state, targetIndex, element: requireShellElement(key), deps: layoutDeps }),
    )
  }

  const open = (column: Column, placement: ColumnPlacement): void => {
    store.update((state) => insertColumn(state, column, placement))
    renderer.mount(column)
    place(column.key)
  }

  const contentScroller = (key: ColumnKey): HTMLElement | null => {
    const shell = renderer.shellOf(key)
    return shell ? resolveScrollRegion(shell.getContentElement()) : null
  }

  const detach = (key: ColumnKey): number => {
    const scrollTop = contentScroller(key)?.scrollTop ?? 0
    requireShellElement(key).remove()
    store.update((state) => removeColumn(state, key))
    return scrollTop
  }

  const reattach = (column: Column, scrollTop: number): void => {
    store.update((state) => insertColumn(state, column, "last"))
    place(column.key)
    const scroller = contentScroller(column.key)
    if (scroller) scroller.scrollTop = scrollTop
  }

  const remove = (key: ColumnKey): void => {
    const column = findColumn(store.get(), key)
    if (!column) return
    renderer.destroy([column])
    store.update((state) => removeColumn(state, key))
  }

  const pin = (key: ColumnKey, pinned: boolean): boolean => {
    const before = findColumn(store.get(), key)
    if (!before || before.pinned === pinned) return false
    const result = repositionPinned({ state: store.get(), key, pinned, deps: layoutDeps })
    store.update(() => result.state)
    if (result.op) applyLayoutOp(mountElement, result.op)
    renderer.renderPinned({ ...before, pinned })
    renderer.scrollIntoView(key)
    return true
  }

  const move = (key: ColumnKey, toIndex: number): boolean => {
    const result = moveColumn({ state: store.get(), key, toIndex, deps: layoutDeps })
    if (!result) return false
    store.update(() => result.state)
    applyLayoutOp(mountElement, result.op)
    renderer.scrollIntoView(key)
    return true
  }

  return Object.freeze({ open, detach, reattach, remove, pin, move })
}

export type { DeckLayout, DeckLayoutDeps }
export { createDeckLayout }
