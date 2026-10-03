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
import { type ColumnHandlers, createColumnDefinition, createColumnDeck } from "@innis/column-deck"

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
    onRender: async (content, { services, launchColumn, onTeardown }): Promise<ColumnHandlers> => {
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
        return { refresh: renderList }
    },
})

const taskDetailColumn = createColumnDefinition<Services>({
    type: "task-detail",
    label: "Task",
    singleton: false,
    getTitle: (entityId) => `Task ${entityId ?? ""}`,
    onRender: async (content, { entityId, services }): Promise<void> => {
        const task = entityId ? services.taskStore.get(entityId) : null
        content.textContent = task ? task.notes : "Task not found"
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

Nothing else is required: the deck supplies the column shell, a browser asset loader, sessionStorage persistence and a 768px mobile breakpoint. Override any of them on `createColumnDeck` (below). Keys that act inside a column — and your own application shortcuts — are yours to bind; see *Drag + keyboard*. A runnable version of this, with a declared template, returned refresh and menu handlers, those host-side keys and the stylesheet for the deck's attributes, is `examples/minimal-host/` (`deno task example:minimal-host`, then http://localhost:8088).

## Public surface

### Top-level — `column-deck.ts`

```ts
const deck = await createColumnDeck({
    mountElement,
    columnDefinitions?,           // ColumnDefinition<S>[]
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

Only `mountElement`, `services` and the column definitions are the host's to supply. The four infrastructure seams default to the deck's browser implementations and are overridable: pass your own `AssetLoader` when templates live somewhere other than fetched HTML files, your own `shellTemplate` to restyle the column chrome, your own `PersistenceAdapter` to key the layout per user, your own `isMobile` for a different breakpoint.

Returns a `ColumnDeck`:

| Member | What it does |
| --- | --- |
| `launchColumn(type, entityId?)` | Opens a column, or focuses it when one with the same key is open (a singleton showing another entity re-renders with the new one). Resolves with the column key once it has rendered. Rejects with `ColumnLifecycleError` for an unregistered type, before any state changes. |
| `closeColumn(key)` | Closes a column, running its teardowns. A pinned column is not closed. On mobile, closing the current column goes back to the previous one. |
| `refreshColumn(key)` | Runs the `refresh` the column's render returned, or renders it again. |
| `undo()` | Re-opens the last closed column where it was (up to fifty are remembered). |
| `goBack()` | Pops the mobile back-stack. |
| `setPinned(key, pinned)` | Pins or unpins a column: moves it in or out of the pinned region at the head of the deck and updates its chrome. |
| `getState()`, `getColumnCount()` | The current layout. |
| `getFocusedColumnElement()` | The focused column's element, so the host can bind keys that act inside a column. |
| `getMobileHistory()` | The mobile back-stack, read-only. |
| `destroy()` | Closes every open and suspended column, running their teardowns, and detaches the drag and keyboard handlers and observers. |

The deck owns the mobile back-stack. Seed it with `initialMobileHistory`, observe changes via `onMobileHistoryChange`, and read it with `getMobileHistory()`. On mobile, navigating forward *suspends* the current column rather than closing it: its element is detached with its render's work and handlers intact and its scroll position remembered, and `goBack()` re-attaches it exactly as it was. Launching a column that is already suspended on the stack unwinds to it (closing everything above). At most eight suspended columns are kept alive; older ones are destroyed and rendered fresh if you return to them. Closing the current column goes back; `undo()` navigates to the column last closed. Navigation notifies `onMobileHistoryChange` and moves focus as soon as the new shell is mounted, and the column renders behind it.

On desktop the layout is written to `persistence.save` on every change and restored through `persistence.load` on construction; restored columns render as they come into view. On mobile the deck neither saves nor restores it.

`createColumnDeck<S>` is generic over the services type: the `services` value and every registered `ColumnDefinition<S>` must agree on `S`, checked at the call site. A definition declaring a narrower services requirement is assignable to a deck holding a wider bag.

### Asset loader — `browser-asset-loader.ts`

`createBrowserAssetLoader()` is the default `AssetLoader`: each CSS path becomes one `<link>` and each JS path one `<script type="module">` in `document.head` (deduplicated per path, in flight or done); each HTML path is fetched once and every `<template>` in it is registered by id; `cloneTemplate(id)` returns a fresh fragment of a registered template, and fills any `[data-partial="<id>"]` element inside it with a clone of template `<id>` (one pass, not recursive). A missing template, or any asset that fails to load, throws or rejects with `ColumnLifecycleError`; a failed path is retried on the next load. Column definitions' `css`/`html`/`js` paths and `assetPaths` go through whichever loader the deck was given, so a host that constructs its own loader should pass that instance in and reuse it for its own cloning.

### Shell template — `shell-template.ts`

Every column is mounted into a clone of the shell. The default shell is text-labelled chrome; override it with `shellTemplate: () => DocumentFragment` (for example `() => assetLoader.cloneTemplate("my-shell")`) to restyle it. A custom shell must contain, and the deck throws `ColumnLifecycleError` if it lacks: a single root element, a `header` (the drag handle) holding `[data-title]`, `[data-pin-btn]`, `[data-lists-wrapper]` with `[data-lists-btn]` and `[data-lists-list]`, `[data-menu-wrapper]` with `[data-menu-btn]` and `[data-menu-list]`, `[data-refresh-btn]` and `[data-close-btn]`; and a `[data-content]` element. Chrome a definition turns off (`hasClose: false` and friends) is removed from the clone.

### Styling contract

The deck ships no CSS. It marks state with attributes for the host's stylesheet: `[data-column]` and `[data-column-key]` on every shell root, `[data-pinned]`, `[data-dragging]`, `[data-visible]` on an open `[data-menu-list]`/`[data-lists-list]`, `[data-separator]`, `[data-variant]` and `[data-selected]` on menu entries, `[data-loading]` on the loading indicator, `[data-status-bar]` on the title, and the `hidden` attribute (the close button of a pinned column, for one) — so a host stylesheet must let `[hidden]` win over its own `display` rules. Column focus lands on the header `h2`, so `header:focus-within` styles the focused column. A column whose content does not scroll itself marks its scrolling element with `[data-scroll-region]`; the deck scrolls and remembers the scroll position of that element instead. The deck's own scrolling (bringing a column into view, double-clicking a header, `Home`/`End`) is smooth, and jumps instead when the reader prefers reduced motion.

### Column definition — `column-base.ts`

```ts
interface ColumnDefinitionParams<S> {
    readonly type: string
    readonly label: string
    readonly css?: string | string[]
    readonly html?: string | string[]
    readonly js?: string | string[]
    readonly template?: string                    // mounted into the content before every onRender
    readonly hasClose?: boolean                   // default true
    readonly hasRefresh?: boolean                 // default true
    readonly hasLists?: boolean                   // default false
    readonly hasPin?: boolean                     // default true
    readonly singleton?: boolean                  // default true
    readonly menuItems?: MenuItem[] | null        // MenuAction | MenuNotice | MenuSeparator
    readonly getTitle?: (entityId?) => string     // default: the label
    readonly onRender: (content, context: ColumnContext<S>) => Promise<void | ColumnHandlers>
}

interface ColumnHandlers {
    readonly refresh?: () => void | Promise<void>
    readonly onMenuSelect?: (action: string) => void | Promise<void>
    readonly onListSelect?: (selection: ListSelection) => void | Promise<void>
    readonly onListsOpen?: () => void | Promise<void>
}

createColumnDefinition<S>(params): ColumnDefinition<S>
```

A `ColumnDefinition` is opaque: you register it with the deck and read its `type` and `label`; the deck does the rest. Before every render the deck loads the definition's `css`/`html`/`js` through the asset loader (which dedups per path) and waits for the new shell to paint.

`template`, when given, names a registered `<template>`; its clone replaces the content element's children before every `onRender`, so a column never clears and mounts its own markup. A column without one starts over the deck's loading indicator instead. A templated column that then waits on something calls `showLoading` itself, and shows what it can while it waits.

`onRender` may resolve with `ColumnHandlers`: what the refresh button, the header menu and the list selector call. Each is a closure over the render, so it acts on the live DOM with the render's work intact, and whatever a render needs to remember lives in its own local variables. Each may act synchronously or return a promise. Without a `refresh`, the refresh button renders the column again. A re-render or a close forgets the previous render's handlers, and a render that a newer render overtook never installs its own.

`onListsOpen` is called when the user opens the column's list selector; populate it with `context.updateListItems`. `onListSelect` is called when an entry is chosen.

### Column context — `column-base.ts`

```ts
interface ColumnContext<S> {
    readonly entityId: string | null
    readonly launchColumn: (type, entityId?) => Promise<string>
    readonly updateTitle: (title: string) => void
    readonly updateMenuItems: (items: MenuItem[]) => void
    readonly updateListItems: (items: MenuItem[]) => void
    readonly updateHeaderStatus: (status: string | null) => void
    readonly cloneTemplate: (id) => DocumentFragment
    readonly close: () => void
    readonly showLoading: () => void
    readonly hideLoading: () => void
    readonly signal: AbortSignal
    readonly onTeardown: (fn: () => void) => void
    readonly signalSlot: () => SignalSlot         // { next(): AbortSignal; abort(): void }
    readonly services: S
}
```

Columns *only* see their context. They never see the registry, the deck's internals, or other columns. `services` is the application-supplied dependency bundle, typed end-to-end: `createColumnDefinition<S>` fixes the `S` your render receives, and `createColumnDeck` only accepts definitions compatible with the `services` value it was given.

A render's lifetime is its `signal`: it aborts when the column re-renders or closes. Pass it to anything that takes one — `target.addEventListener(type, handler, { signal })`, `fetch(url, { signal })`, your own queries. `onTeardown(fn)` runs `fn` when the render ends, and at once if it already has, so a render that registers something after an `await` never leaks it. For work the render starts again, such as the query a refresh reloads, take a `signalSlot()` once and call `slot.next()` for each run: it aborts the signal it handed out before and returns a fresh one that also aborts when the render ends. `slot.abort()` stops the current run without starting another.

```ts
onRender: async (content, { signal, signalSlot, onTeardown, services }) => {
    onTeardown(services.store.subscribe(render))            // a subscription that returns its unsubscribe
    window.addEventListener("resize", layout, { signal })   // anything that takes a signal
    const query = signalSlot()
    const load = (): void => {
        services.search(term, { signal: query.next() })      // each load aborts the previous one
    }
    load()
    return { refresh: load }
}
```

### Testing a column — `@innis/column-deck/testing`

`openColumn(definition, host, element)` renders one definition into `element` outside any deck, with `host` (a `ColumnHost`: the entity, header callbacks, `launchColumn`, `close`, the asset loader and services) standing in for the deck. It resolves with the column's controls — `render`, `refresh`, `onMenuSelect`, `onListSelect`, `onListsOpen` and `destroy` — each doing what the matching deck control does, so a unit test drives a column exactly as a user would.

```ts
import { openColumn } from "@innis/column-deck/testing"

const column = await openColumn(taskListColumn, { ...fakeHost, services }, document.createElement("section"))
await column.refresh()
column.destroy()
```

### State — `column-state.ts`

`ColumnKey = string` (`type` for singleton columns, `type:entityId` otherwise — singletons keep their bare `type` key even when bound to an entity). `getState()` returns a plain, immutable `{ columns, lastFocusedKey }` snapshot; each `Column` carries `type`, `entityId`, `key`, `spawnedFrom` and `pinned`.

### Drag + keyboard

Dragging a column's header moves it beside the column under the pointer; a column cannot be dragged into, or out of, the pinned region, and a pinned column cannot be dragged. On mobile dragging is off.

The keyboard handler listens on `document`, and ignores keys while an input, textarea or contenteditable has focus (except `Escape`), any keydown another handler has already `preventDefault`ed, and browser shortcuts (`Ctrl`/`Cmd` + `x`/`r`). It binds: `ArrowLeft`/`ArrowRight` focus the previous/next column (with `Shift`: move the column), `Escape` blurs the active element (after the host's `onEscape` pre-handler), `Ctrl`/`Cmd`+`Z` re-opens the last closed column, `Home`/`End` scroll the column, `x` closes the column, `r` refreshes it. Every column key acts on the focused column — the one `getFocusedColumnElement()` returns, which follows clicks, focus and scrolling. Application shortcuts (launching a particular column, say) and keys that act *inside* a column (walking its items, activating one) are the host's: bind them on `document`, resolve the column with `getFocusedColumnElement()`, and `preventDefault` what you consume. Middle-clicking a header closes the column; scrolling the wheel over a header scrolls the deck sideways.

### Errors — `errors.ts`

`ColumnLifecycleError` — a tagged `Error` (`tag: "ColumnLifecycleError"`) for framework-lifecycle violations: launching an unregistered column type, a required shell element or shell root missing, or, in the browser asset loader, cloning an unregistered template id or failing to load a CSS, HTML or JS asset.

A failure in work the deck starts from a click, a key or a column coming into view (refreshing, closing, a header handler, a lazy render) is passed to `reportError`, so it reaches the global `error` event like any exception from an event listener. Promises you await yourself reject to you.

## Lifecycle

```
launchColumn(type, entityId)
    │
    ├─ unknown type rejects here, before any state changes
    ├─ the deck adds the Column { type, entityId, key, ... } to its state
    ├─ clones the shell template and mounts it in place
    │
    ├─ loads the definition's css / html / js       -- every render; the asset loader dedups
    ├─ yields one paint
    ├─ mounts definition.template into the content (or the loading indicator, without one)
    │
    ├─ definition.onRender(content, context)        -- your code runs here and returns its handlers
    │
    └─ ... user interacts ...
            │
            ├─ refresh button -> handlers.refresh()
            │                    (or a fresh render, ending the previous one, when it returned none)
            ├─ menu -> handlers.onMenuSelect(action)
            ├─ lists open -> handlers.onListsOpen()
            ├─ list entry -> handlers.onListSelect(selection)
            └─ close -> the render's signal aborts, its teardowns run, its handlers are forgotten
```

`singleton: true` (the default) means launching the same `type` twice focuses the existing column instead of creating a second instance; launching it with a different `entityId` re-renders it in place (ending the previous render first).

## Anti-patterns

- **Holding a reference to a column's content element outside its lifecycle.** It's removed from the DOM on close; references become stale. Keep references in the render's own local variables, which its handlers close over and a close releases.
- **Starting work without tying it to the render.** Anything that survives a close is a leak. Pass `signal`, or register the stop with `onTeardown`.
- **Aborting the previous query yourself on every refresh.** Take one `signalSlot()` and pass `slot.next()` to each run.
- **Talking to other columns directly.** Use `context.launchColumn(type, entityId)` — the deck resolves and mounts. Reaching into another column's DOM bypasses its lifecycle.
- **Keeping a render's functions or data outside the render for a header control to find later.** Return the handlers from `onRender`; they close over what they need, and a re-render replaces them.
- **Clearing the content and mounting your own markup at the top of `onRender`.** Declare `template` and the deck mounts it for you.
- **Waiting on something before mounting.** Mount the template, show what you can, and fill in the rest as it arrives.
- **Loading assets manually inside `onRender`.** Pass them in the definition's `css`/`html`/`js` keys; the deck loads them before every render, and the asset loader dedups per path.
- **Reading `data-pinned` to decide anything.** It is styling output; ask `getState()`.

## Upgrading from 0.5

- `trackHandle(handle)` is gone: pass `signal` to whatever started the work, or `onTeardown(() => handle.abort())`.
- `handleSlot()` is gone: `const slot = signalSlot()`, then pass `slot.next()` to each run (or `slot.next().addEventListener("abort", () => handle.abort())` for work that only returns a handle). `slot.abort()` is unchanged.
- `ColumnDefinition` no longer exposes `render`, `refresh`, `onMenuSelect`, `onListSelect`, `onListsOpen`, `onDestroy`, `loadAssets` or its options, and `OuterColumnContext` is no longer exported: drive a definition in tests with `openColumn` from `@innis/column-deck/testing`.
- `Abortable`, `HandleSlot`, `ColumnLaunchFn` and `OuterColumnContext` are no longer exported; use `ColumnContext["launchColumn"]` for the launch function's type.
- `closeColumn` returns a promise, and refuses pinned columns. `setPinned` now updates the column's chrome.
- `onPinnedColumnsChange` no longer accepts `null`.
- `x` closes the focused column rather than the column holding DOM focus.
- `createBrowserAssetLoader().loadCss` rejects when the stylesheet fails to load.

## Design decisions

The reasons behind choices that may look surprising are recorded in [`docs/adr/`](docs/adr/).
