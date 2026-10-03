import type { ColumnState } from "./column-state.ts"
import { createColumnState } from "./column-state.ts"

interface ColumnStore {
  readonly get: () => ColumnState
  readonly update: (change: (state: ColumnState) => ColumnState) => void
}

const createColumnStore = (): ColumnStore => {
  let state = createColumnState()
  return Object.freeze({
    get: (): ColumnState => state,
    update: (change: (state: ColumnState) => ColumnState): void => {
      state = change(state)
    },
  })
}

export type { ColumnStore }
export { createColumnStore }
