# @innis/column-deck

[![CI](https://github.com/johninnis/column-deck-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/johninnis/column-deck-ts/actions/workflows/ci.yml)

The multi-column UI framework. Lifecycle, registry, mount/teardown, drag-to-reorder, column-level keyboard shortcuts, mobile back-stack, layout persistence — with browser defaults for the shell, asset loading, persistence and the mobile breakpoint, each overridable. Domain-agnostic — every column is a black box that defines its own assets, render hook, and teardown. The framework knows nothing about what a column displays or where its data comes from.

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

const mountElement = document.querySelector("main")
if (!(mountElement instanceof HTMLElement)) throw new Error("Missing mount element")

const taskStore = createTaskStore() // your data layer

const system = await createColumnDeck({
    mountElement,
    columnDefinitions: [taskListColumn, taskDetailColumn],
    services: { taskStore },
})

await system.launchColumn("task-list")
```

Nothing else is required: the deck supplies the column shell, a browser asset loader, sessionStorage persistence and a 768px mobile breakpoint. Override any of them on `createColumnDeck` (below). Keys that act inside a column — and your own application shortcuts — are yours to bind; see *Drag + keyboard*. A runnable version of exactly this, with those host-side keys and the stylesheet for the deck's attributes, is `examples/minimal-host/` (`deno task example:minimal-host`, then http://localhost:8088).

## Public surface

### Top-level — `column-deck.ts`

```ts
const system = await createColumnDeck({
    mountElement,
    columnDefinitions?,           // pre-registered ColumnDefinition<S>[]
    services,                     // S — the dependency bag every column receives
    assetLoader?,                 // AssetLoader — default createBrowserAssetLoader()
    shellTemplate?,               // () => DocumentFragment — default: the deck's own shell (below)
    persistence?,                 // PersistenceAdapter — default createSessionStoragePersistence()
    isMobile?,                    // () => boolean — default !matchMedia("(min-width: 768px)").matches
    initialMobileHistory?,        // seed for the deck-owned mobile back-stack
    assetPaths?,                  // ColumnAssetPaths — shared css/templates loaded once at init
    onPinnedColumnsChange?,       // pinned-columns listener
    onMobileHistoryChange?,       // mobile back-stack listener
    onEscape?,                    // Escape pre-handler — return true to consume the key
})
```

Only `mountElement`, `services` and the column definitions are the host's to supply. The four infrastructure
seams default to the deck's browser implementations and are overridable: pass your own `AssetLoader` when
templates live somewhere other than fetched HTML files, your own `shellTemplate` to restyle the column chrome,
your own `PersistenceAdapter` to key the layout per user, your own `isMobile` for a different breakpoint.

Returns a `ColumnDeck` with `launchColumn`, `closeColumn`, `refreshColumn`, `undo` (re-open last closed), `goBack` (mobile-history pop), `getState`, `getColumnCount`, `getFocusedColumnElement` (the last-focused column's element, so the host can bind keys that act inside a column — the deck itself binds only column-level keys), `getMobileHistory`, `setPinned`, and `destroy` (close every open column — running each column's teardowns — and detach the drag/keyboard handlers and observers).

Launching an unregistered column type rejects with `ColumnLifecycleError` before any state changes.

The deck owns the mobile back-stack. Seed it with `initialMobileHistory`, observe changes via `onMobileHistoryChange`, and read it with `getMobileHistory()` — there is no shared mutable array crossing the API boundary. On mobile, navigating forward *suspends* the current column rather than closing it: its element is detached with its subscriptions and per-mount state intact and its scroll position remembered, and `goBack()` re-attaches it exactly as it was. Launching a column that is already suspended on the stack unwinds to it (closing everything above). At most eight suspended columns are kept alive; older ones are destroyed and re-rendered fresh if you return to them. `destroy()` destroys suspended columns too. Navigation notifies `onMobileHistoryChange` and moves focus as soon as the new shell is mounted — the column's own render continues behind it; the renderer yields one frame between mounting a shell and rendering its content so the chrome paints before a heavy render.

The layout is written to `persistence.save` on every state change (desktop only) and restored through `persistence.load` on construction. One adapter is the single persistence channel.

`createColumnDeck<S>` is generic over the services type: the `services` value and every registered `ColumnDefinition<S>` must agree on `S`, checked at the call site. A definition declaring a narrower services requirement is assignable to a system holding a wider bag.

`createColumnDeck` is the only construction surface most callers need. It wires the registry, manager, renderer, drag handler, keyboard handler, and shell renderer in one call.

### Asset loader — `browser-asset-loader.ts`

`createBrowserAssetLoader()` is the default `AssetLoader`: each CSS path becomes one `<link>` and each JS path one
`<script type="module">` in `document.head` (deduplicated per path, in flight or done); each HTML path is fetched
once and every `<template>` in it is registered by id; `cloneTemplate(id)` returns a fresh fragment of a registered
template, and fills any `[data-partial="<id>"]` element inside it with a clone of template `<id>` (one pass, not
recursive). A missing template or a failed load throws `ColumnLifecycleError`. Column definitions' `css`/`html`/`js`
paths and `assetPaths` go through whichever loader the deck was given, so a host that constructs its own loader
should pass that instance in and reuse it for its own cloning.

### Shell template — `shell-template.ts`

Every column is mounted into a clone of the shell. The default shell is text-labelled chrome; override it with
`shellTemplate: () => DocumentFragment` (for example `() => assetLoader.cloneTemplate("my-shell")`) to restyle
it. A custom shell must contain, and the deck throws `ColumnLifecycleError` if it lacks: a single root element,
a `header` (the drag handle) holding `[data-title]`, `[data-pin-btn]`, `[data-lists-wrapper]` with
`[data-lists-btn]` and `[data-lists-list]`, `[data-menu-wrapper]` with `[data-menu-btn]` and `[data-menu-list]`,
`[data-refresh-btn]` and `[data-close-btn]`; and a `[data-content]` element. Chrome a definition turns off
(`hasClose: false` and friends) is removed from the clone.

### Styling contract

The deck ships no CSS. It marks state with attributes for the host's stylesheet: `[data-column]` and
`[data-column-key]` on every shell root, `[data-pinned]`, `[data-dragging]`, `[data-visible]` on an open
`[data-menu-list]`/`[data-lists-list]`, `[data-separator]`, `[data-variant]` and `[data-selected]` on menu entries,
`[data-loading]` on the loading indicator, `[data-status-bar]` on the title, and the `hidden` attribute (the close button of a pinned column, for one) — so a host stylesheet must let `[hidden]` win over its own `display` rules. Column focus lands on the
header `h2`, so `header:focus-within` styles the focused column.

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
    readonly menuItems?: MenuItem[] | null        // MenuAction | MenuNotice | MenuSeparator
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

Internal. Both are scoped to the deck's mount element. The drag handler tracks pointer events on column headers and reorders via the manager. The keyboard handler (active outside inputs) binds: `ArrowLeft`/`ArrowRight` focus the previous/next column (with `Shift`: move the column), `Escape` blurs the active element (after the host's `onEscape` pre-handler), `Ctrl`/`Cmd`+`Z` re-opens the last closed column, `Home`/`End` scroll the column, `x` closes the unpinned column that contains the active element, `r` refreshes. Browser shortcuts (`Ctrl`/`Cmd` + `x`/`r`) are left alone, as is any keydown another handler has already `preventDefault`ed. Application shortcuts (launching a particular column, say) and keys that act *inside* a column (walking its items, activating one) are the host's: bind them on `document`, resolve the column with `getFocusedColumnElement()`, and `preventDefault` what you consume. Column focus lands on the header `h2` (style `header:focus-within`). Both handlers are wired by `createColumnDeck`.

### Errors — `errors.ts`

`ColumnLifecycleError` — a tagged `Error` (`tag: "ColumnLifecycleError"`) for framework-lifecycle violations: launching or mounting an unregistered column type (`column-manager.ts`, `column-renderer.ts`), a required shell element or shell root missing (`column-shell.ts`), or, in the browser asset loader, cloning an unregistered template id or failing to load an HTML or JS asset (`browser-asset-loader.ts`).

## Lifecycle

```
launchColumn(type, entityId)
    │
    ├─ registry.get(type) -> ColumnDefinition    -- unknown type throws here
    │
    ├─ definition.loadAssets(assetLoader)        -- runs every render; the asset loader dedups
    │
    ├─ manager creates Column { type, entityId, key, ... }
    ├─ renderer clones the shell template and mounts it
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
- **Loading assets manually inside `onRender`.** Pass them in the definition's `css`/`html`/`js` keys; the renderer calls `loadAssets` for you, and the asset loader (the browser default or your own) dedups per path.
