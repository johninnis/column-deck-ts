/**
 * Drives one column definition outside a deck, for a host's unit tests of its own columns: the test plays the deck
 * by supplying a {@linkcode ColumnHost}, then renders, refreshes, picks header entries and closes the column
 * exactly as the deck would.
 *
 * @module
 */
import type { ColumnDefinition, ColumnHost, ColumnServices, ListSelection } from "./src/column-base.ts"
import { lifecycleOf } from "./src/column-base.ts"

/** A column rendered through {@linkcode openColumn}: each method does what the matching deck control does. */
interface OpenColumn {
  /** Render the column again, as the deck does when it re-renders in place. */
  readonly render: () => Promise<void>
  /** Press the refresh button: the render's own `refresh`, or a fresh render without one. */
  readonly refresh: () => Promise<void>
  /** Pick a header menu entry. */
  readonly onMenuSelect: (action: string) => Promise<void>
  /** Pick a list selector entry. */
  readonly onListSelect: (selection: ListSelection) => Promise<void>
  /** Open the list selector. */
  readonly onListsOpen: () => Promise<void>
  /** Close the column, ending its render. */
  readonly destroy: () => void
}

const immediately = (): Promise<void> => Promise.resolve()

/** Render `definition` into `element` with `host` standing in for the deck, and hand back its controls. */
const openColumn = async <S extends ColumnServices>(
  definition: ColumnDefinition<S>,
  host: ColumnHost<S>,
  element: HTMLElement,
): Promise<OpenColumn> => {
  const lifecycle = lifecycleOf(definition)
  const render = (): Promise<void> => lifecycle.render(element, host, immediately)
  await render()
  return Object.freeze({
    render,
    refresh: () => lifecycle.refresh(element, host, immediately),
    onMenuSelect: async (action: string): Promise<void> => {
      await lifecycle.handlersOf(element).onMenuSelect?.(action)
    },
    onListSelect: async (selection: ListSelection): Promise<void> => {
      await lifecycle.handlersOf(element).onListSelect?.(selection)
    },
    onListsOpen: async (): Promise<void> => {
      await lifecycle.handlersOf(element).onListsOpen?.()
    },
    destroy: () => lifecycle.destroy(element),
  })
}

export type { ColumnHost, OpenColumn }
export { openColumn }
