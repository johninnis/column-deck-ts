# @innis/column-deck

[![CI](https://github.com/johninnis/column-deck-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/johninnis/column-deck-ts/actions/workflows/ci.yml)

The multi-column UI framework. Lifecycle, registry, mount/teardown, drag-to-reorder, keyboard shortcuts, mobile back-stack, sessionStorage-backed persistence. Domain-agnostic — every column is a black box that defines its own assets, render hook, and teardown. The framework knows nothing about what a column displays or where its data comes from.

## Install

```bash
deno add jsr:@innis/column-deck
```

## Quick start

A two-column task app: a singleton list column that launches per-task detail columns. The data layer is injected as `services`; the framework never sees it.

```ts
import { createColumnDefinition, createColumnDeck } from "@innis/column-deck"

interface TaskStore {
    readonly all: () => ReadonlyArray<{ id: string; title: string; notes: string }>
    readonly get: (id: string) => { id: string; title: string; notes: string } | null
    readonly subscribe: (onChange: () => void) => () => void
}

interface Services {
    readonly taskStore: TaskStore
}

const taskListColumn = createColumnDefinition<Services>({
    type: "task-list",
    label: "Tasks",
    onRender: async (content, { services, launchColumn, onTeardown, hideLoading }): Promise<void> => {
        const renderList = (): void => {
            const list = document.createElement("ul")
            for (const task of services.taskStore.all()) {
                const item = document.createElement("li")
                item.textContent = task.title
                item.addEventListener("click", () => launchColumn("task-detail", task.id))
                list.appendChild(item)
            }
            content.replaceChildren(list)
        }
        onTeardown(services.taskStore.subscribe(renderList))
        renderList()
        hideLoading()
    },
})

const taskDetailColumn = createColumnDefinition<Services>({
    type: "task-detail",
    label: "Task",
    singleton: false,
    getTitle: (entityId) => `Task ${entityId ?? ""}`,
    onRender: async (content, { entityId, services, hideLoading }): Promise<void> => {
        const task = entityId ? services.taskStore.get(entityId) : null
        content.textContent = task ? task.notes : "Task not found"
        hideLoading()
    },
})

// These columns declare no css/html/js assets, so the loader's load hooks are inert.
// A real loader dedups and injects <link>/<template>/<script> elements per path.
const assetLoader = {
    loadCss: (): Promise<void> => Promise.resolve(),
    loadHtml: (): Promise<void> => Promise.resolve(),
    loadJs: (): Promise<void> => Promise.resolve(),
    cloneTemplate: (id: string): DocumentFragment => {
        const template = document.getElementById(id)
        if (!(template instanceof HTMLTemplateElement)) throw new Error(`Missing template: ${id}`)
        return document.importNode(template.content, true)
    },
}

const mountElement = document.querySelector("main")
if (!(mountElement instanceof HTMLElement)) throw new Error("Missing mount element")

const taskStore = createTaskStore() // your data layer

const system = await createColumnDeck({
    mountElement,
    assetLoader,
    persistence: {
        save: (data) => sessionStorage.setItem("columns", data),
        load: () => sessionStorage.getItem("columns"),
    },
    isMobile: () => !matchMedia("(min-width: 768px)").matches,
    columnDefinitions: [taskListColumn, taskDetailColumn],
    services: { taskStore },
})

await system.launchColumn("task-list")
```

## Public surface

### Top-level — `column-deck.ts`

```ts
const system = await createColumnDeck({
    mountElement,
    assetLoader,
    persistence,                  // PersistenceAdapter — { save, load }
    isMobile,                     // () => boolean
    initialMobileHistory?,        // seed for the deck-owned mobile back-stack
    assetPaths?,                  // ColumnAssetPaths — shared css/templates loaded once at init
    onPinnedColumnsChange?,       // pinned-columns listener
    onMobileHistoryChange?,       // mobile back-stack listener
    onCompose?,                   // `c` shortcut handler
    onEscape?,                    // Escape pre-handler — return true to consume the key
    columnDefinitions?,           // pre-registered ColumnDefinition<S>[]
    services,                     // S — the dependency bag every column receives
})
```

Returns a `ColumnDeck` with `launchColumn`, `closeColumn`, `refreshColumn`, `undo` (re-open last closed), `goBack` (mobile-history pop), `getState`, `getColumnCount`, `getMobileHistory`, `setPinned`, and `destroy` (close every open column — running each column's teardowns — and detach the drag/keyboard handlers and observers).

Launching an unregistered column type rejects with `ColumnLifecycleError` before any state changes.

The deck owns the mobile back-stack. Seed it with `initialMobileHistory`, observe changes via `onMobileHistoryChange`, and read it with `getMobileHistory()` — there is no shared mutable array crossing the API boundary.

The layout is written to `persistence.save` on every state change (desktop only) and restored through `persistence.load` on construction. One adapter is the single persistence channel.

`createColumnDeck<S>` is generic over the services type: the `services` value and every registered `ColumnDefinition<S>` must agree on `S`, checked at the call site. A definition declaring a narrower services requirement is assignable to a system holding a wider bag.

`createColumnDeck` is the only construction surface most callers need. It wires the registry, manager, renderer, drag handler, keyboard handler, and shell renderer in one call.

### Column definition — `column-base.ts`

```ts
interface ColumnDefinitionParams<S, State> {
    readonly type: string
    readonly label: string
    readonly css?: string | string[]
    readonly html?: string | string[]
    readonly js?: string | string[]
    readonly hasClose?: boolean
    readonly hasRefresh?: boolean
    readonly hasLists?: boolean
    readonly hasPin?: boolean
    readonly singleton?: boolean
    readonly menuItems?: MenuItem[] | null
    readonly getTitle?: (entityId?) => string
    readonly onRender: (content, context: ColumnContext<S, State>) => Promise<void>
    readonly onRefresh?: (content, context) => Promise<void>
    readonly onMenuSelect?: ...
    readonly onListSelect?: ...
    readonly onListsOpen?: ...
    readonly onDestroy?: (state, content) => void
}

createColumnDefinition<S, State>(params): ColumnDefinition<S>
```

The factory does three things:
1. Normalises `css` / `html` / `js` to arrays and wraps them in a single `loadAssets(assetLoader)` call.
2. Wires per-element state and teardown registries (a `WeakMap` of element → state, a parallel one of element → teardown callbacks).
3. Translates `OuterColumnContext` (passed by the manager) into the richer `ColumnContext` your hooks see — adding `showLoading`, `hideLoading`, `onTeardown`, `trackHandle`, and the typed `state` bag.

Anything you put in `context.state` is the same object you receive in `onDestroy`. Anything you `context.onTeardown(fn)` runs on close — and before every re-render, so a refresh never stacks a second subscription on top of the first.

`onRefresh`, when provided, replaces the default full re-render: it runs against the live DOM with the existing subscriptions intact. Without it, refresh tears down and re-renders from scratch.

`onListsOpen` fires when the user opens the column's list selector; populate it with `context.updateListItems`. `onListSelect` fires when an entry is chosen.

### Column context — `column-base.ts`

```ts
interface ColumnContext<S, State> {
    readonly entityId: string | null
    readonly launchColumn: (type, entityId?) => Promise<string>
    readonly updateTitle: (title: string) => void
    readonly updateMenuItems: (items: MenuItem[]) => void
    readonly updateListItems: (items: MenuItem[]) => void
    readonly updateHeaderStatus: (status: string | null) => void
    readonly cloneTemplate: (id) => DocumentFragment
    readonly showLoading: () => void
    readonly hideLoading: () => void
    readonly onTeardown: (fn: () => void) => void
    readonly trackHandle: <T extends { abort(): void }>(handle: T) => T
    readonly state: State
    readonly services: S
}
```

Columns *only* see their context. They never see the registry, manager, or other columns. `services` is the application-supplied dependency bundle, typed end-to-end: `createColumnDefinition<S>` fixes the `S` your hooks receive, and `createColumnDeck` only accepts definitions compatible with the `services` value it was given. `trackHandle` registers an abortable handle's `abort` as a teardown and returns the handle.

### State — `column-state.ts`

`ColumnKey = string` (`type` for singleton columns, `type:entityId` otherwise — singletons keep their bare `type` key even when bound to an entity). Pure functions:

- `createColumn`, `createColumnState`, `addColumn`, `insertColumnAfter`, `removeColumn`, `reorderColumns`, `setLastFocused`, `findColumn`, `setColumnPinned`, `pinnedColumns`, `getPinnedCount`.

State is a plain `{ columns, lastFocusedKey }` shape. The manager holds the current value in a closure and writes the serialised form to the persistence adapter.

### Registry — `column-registry.ts`

`createColumnRegistry()` returns `{ register(type, definition), get(type), has(type) }`. The registry is the single lookup the manager uses when launching a column.

### Manager — `column-manager.ts`

Internal. Owns the live column list, mount/unmount, focus, drag-reorder, mobile back-stack, undo (re-open last closed; if the column was relaunched in the meantime, undo focuses it instead of duplicating it).

### Renderer — `column-renderer.ts` + `column-shell.ts`

Internal. The renderer mounts each column's chrome (header, refresh button, menu, close, pin), loads its assets via the shell, and calls the definition's `onRender`. DOM placement flows through the same layout ops used for pinning and keyboard moves. The shell exposes the per-column DOM the chrome lives on.

### Drag + keyboard — `drag-handler.ts`, `keyboard-handler.ts`

Internal. Both are scoped to the deck's mount element. The drag handler tracks pointer events on column headers and reorders via the manager. The keyboard handler (active outside inputs) binds: `ArrowLeft`/`ArrowRight` focus the previous/next column (with `Shift`: move the column), `ArrowUp`/`ArrowDown` walk a column's `[data-navigable]` items, `Enter` activates the focused item, `Escape` clears focus and blurs (after the host's `onEscape` pre-handler), `Ctrl`/`Cmd`+`Z` re-opens the last closed column, `Home`/`End` scroll the column, `x` closes the keyboard-focused unpinned column, `r` refreshes, `c` fires `onCompose`. Browser shortcuts (`Ctrl`/`Cmd` + `x`/`r`/`c`) are left alone. Both handlers are wired by `createColumnDeck`.

### Errors — `errors.ts`

`ColumnLifecycleError` — a tagged `Error` (`tag: "ColumnLifecycleError"`) for framework-lifecycle violations: launching or mounting an unregistered column type (`column-manager.ts`, `column-renderer.ts`), or a required shell element or template root missing (`column-shell.ts`).

## Lifecycle

```
launchColumn(type, entityId)
    │
    ├─ registry.get(type) -> ColumnDefinition    -- unknown type throws here
    │
    ├─ definition.loadAssets(assetLoader)        -- runs every render; the asset loader dedups
    │
    ├─ manager creates Column { type, entityId, key, ... }
    ├─ renderer mounts shell + content element
    │
    ├─ definition.onRender(content, context)     -- your code runs here
    │
    └─ ... user interacts ...
            │
            ├─ refresh button -> definition.onRefresh(content, context)
            │                    (or teardowns + full re-render when no onRefresh is given)
            ├─ menu -> definition.onMenuSelect(content, context, action)
            ├─ lists open -> definition.onListsOpen(content, context)
            └─ close -> run teardowns + definition.onDestroy(state, content)
```

`singleton: true` (the default) means launching the same `type` twice focuses the existing column instead of creating a second instance; launching it with a different `entityId` re-renders it in place (running the previous render's teardowns first).

## Anti-patterns

- **Holding a reference to a column's content element outside its lifecycle.** It's removed from the DOM on close; references become stale. Put long-lived refs into `context.state` so they're cleaned up by `onDestroy`.
- **Subscribing to data sources / DOM events without `context.onTeardown`.** Anything that survives `onDestroy` is a leak. Always register a teardown for every subscription.
- **Talking to other columns directly.** Use `context.launchColumn(type, entityId)` — the registry resolves and the manager mounts. Reaching into another column's DOM bypasses its lifecycle.
- **Loading assets manually inside `onRender`.** Pass them in the definition's `css`/`html`/`js` keys; the renderer calls `loadAssets` for you, and the supplied asset loader is responsible for caching.
