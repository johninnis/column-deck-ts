import type { ColumnDefinition, ColumnServices } from "./column-base.ts"

interface ColumnRegistry<S extends ColumnServices = ColumnServices> {
  readonly get: (type: string) => ColumnDefinition<S> | null
  readonly has: (type: string) => boolean
}

const createColumnRegistry = <S extends ColumnServices>(
  definitions: ReadonlyArray<ColumnDefinition<S>>,
): ColumnRegistry<S> => {
  const byType: ReadonlyMap<string, ColumnDefinition<S>> = new Map(definitions.map((d) => [d.type, d]))
  return Object.freeze({
    get: (type: string): ColumnDefinition<S> | null => byType.get(type) ?? null,
    has: (type: string): boolean => byType.has(type),
  })
}

export type { ColumnRegistry }
export { createColumnRegistry }
