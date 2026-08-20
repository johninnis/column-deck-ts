import type { ColumnDefinition, ColumnServices } from "./column-base.ts"

interface ColumnRegistry<S extends ColumnServices = ColumnServices> {
  readonly register: (type: string, definition: ColumnDefinition<S>) => void
  readonly get: (type: string) => ColumnDefinition<S> | null
  readonly has: (type: string) => boolean
}

const createColumnRegistry = <S extends ColumnServices = ColumnServices>(): ColumnRegistry<S> => {
  const columns = new Map<string, ColumnDefinition<S>>()

  const register = (type: string, definition: ColumnDefinition<S>): void => {
    columns.set(type, definition)
  }

  const get = (type: string): ColumnDefinition<S> | null => columns.get(type) ?? null

  const has = (type: string): boolean => columns.has(type)

  return Object.freeze({ register, get, has })
}

export type { ColumnRegistry }
export { createColumnRegistry }
