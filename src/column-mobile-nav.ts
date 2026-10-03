import type { Column, ColumnKey, ColumnRef } from "./column-state.ts"
import type { ColumnStore } from "./column-store.ts"
import type { ColumnRenderer } from "./column-renderer.ts"
import type { DeckLayout } from "./deck-layout.ts"
import type { MobileStack, StackChange, SuspendedEntry } from "./column-mobile-stack.ts"
import { clearStack, historyOf, seedStack, suspendOnto, unwindTo } from "./column-mobile-stack.ts"
import { popLast } from "./immutable-list.ts"

interface MobileHistory {
  readonly initial: ReadonlyArray<ColumnRef>
  readonly onChange: (() => void) | undefined
}

interface MobileNavigatorDeps {
  readonly store: ColumnStore
  readonly layout: DeckLayout
  readonly renderer: ColumnRenderer
  readonly columnFor: (ref: ColumnRef) => Column
  readonly history: MobileHistory
}

interface MobileNavigator {
  readonly navigateTo: (ref: ColumnRef) => Promise<string>
  readonly goBack: () => Promise<void>
  readonly close: (key: ColumnKey) => Promise<void>
  readonly getHistory: () => ReadonlyArray<ColumnRef>
  readonly destroy: () => void
}

const createMobileNavigator = (
  { store, layout, renderer, columnFor, history }: MobileNavigatorDeps,
): MobileNavigator => {
  let stack: MobileStack = seedStack(history.initial)

  const current = (): Column | undefined => store.get().columns[0]

  const apply = (change: StackChange): void => {
    renderer.destroy(change.destroyed)
    stack = change.stack
  }

  const presented = (column: Column): string => {
    renderer.focus(column.key)
    history.onChange?.()
    return column.key
  }

  const show = async (column: Column): Promise<string> => {
    layout.open(column, "last")
    const rendered = renderer.render(column)
    const key = presented(column)
    await rendered
    return key
  }

  const restore = ({ column, scrollTop }: SuspendedEntry): string => {
    layout.reattach(column, scrollTop)
    return presented(column)
  }

  const suspendCurrent = (): void => {
    const column = current()
    if (!column) return
    apply(suspendOnto(stack, column, layout.detach(column.key)))
  }

  const closeCurrent = (): void => {
    const column = current()
    if (column) layout.remove(column.key)
  }

  const replaceCurrent = (column: Column): Promise<string> => {
    closeCurrent()
    return show(column)
  }

  const navigateTo = (ref: ColumnRef): Promise<string> => {
    const column = columnFor(ref)
    const showing = current()
    if (showing?.key === column.key) {
      if (showing.entityId === ref.entityId) return Promise.resolve(presented(showing))
      return replaceCurrent(column)
    }
    const unwound = unwindTo(stack, column.key)
    if (!unwound) {
      suspendCurrent()
      return show(column)
    }
    closeCurrent()
    apply(unwound)
    if (unwound.target.column.entityId === ref.entityId) return Promise.resolve(restore(unwound.target))
    renderer.destroy([unwound.target.column])
    return show(column)
  }

  const goBack = async (): Promise<void> => {
    const popped = popLast(stack)
    if (!popped) return
    closeCurrent()
    stack = popped.rest
    if (popped.last.kind === "suspended") {
      restore(popped.last)
      return
    }
    await show(columnFor(popped.last))
  }

  const close = async (key: ColumnKey): Promise<void> => {
    if (current()?.key !== key) return
    if (stack.length > 0) await goBack()
    else closeCurrent()
  }

  const getHistory = (): ReadonlyArray<ColumnRef> => historyOf(stack)

  const destroy = (): void => apply(clearStack(stack))

  return Object.freeze({ navigateTo, goBack, close, getHistory, destroy })
}

export type { MobileHistory, MobileNavigator, MobileNavigatorDeps }
export { createMobileNavigator }
