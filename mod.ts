export { ColumnLifecycleError } from "./src/errors.ts"

export { createColumnDefinition } from "./src/column-base.ts"
export type {
  AssetLoader,
  ColumnContext,
  ColumnDefinition,
  ColumnDefinitionParams,
  ColumnLaunchFn,
  ColumnServices,
  ColumnStateShape,
  ListSelection,
  MenuAction,
  MenuItem,
  MenuNotice,
  MenuSeparator,
  OuterColumnContext,
} from "./src/column-base.ts"

export type { Column, ColumnKey, ColumnRef, ColumnState } from "./src/column-state.ts"

export { createColumnDeck } from "./src/column-deck.ts"
export type { ColumnDeck, ColumnDeckDeps } from "./src/column-deck.ts"

export type { ColumnAssetPaths } from "./src/column-manager.ts"
export { createSessionStoragePersistence } from "./src/column-persistence.ts"
export type { PersistenceAdapter } from "./src/column-persistence.ts"
export { createBrowserAssetLoader } from "./src/browser-asset-loader.ts"
export type { ShellTemplate } from "./src/shell-template.ts"
