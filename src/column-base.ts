/** The host-provided services bag injected into every column; the framework treats it as opaque. */
type ColumnServices = object

/** Host-provided loader for a column's CSS, HTML template, and JS assets. */
interface AssetLoader {
  readonly loadCss: (path: string) => Promise<void>
  readonly loadHtml: (path: string) => Promise<void>
  readonly loadJs: (path: string) => Promise<void>
  readonly cloneTemplate: (id: string) => DocumentFragment
}

/** A single entry in a column's header menu or list selector; `separator` renders a divider instead of an action. */
interface MenuItem {
  readonly label?: string
  readonly action?: string
  readonly separator?: boolean
  readonly disabled?: boolean
  readonly variant?: string
  readonly selected?: boolean
}

/** The user's pick from a column's list selector: the chosen action and the button element that triggered it. */
interface ListSelection {
  readonly action: string
  readonly btn: HTMLButtonElement | null
}

/** The shape of a column's per-mount mutable state; column authors supply the concrete type. */
type ColumnStateShape = object

/** Everything a column's hooks receive: launch/teardown plumbing, header controls, per-mount state, and the injected services. */
interface ColumnContext<
  S extends ColumnServices = ColumnServices,
  State extends ColumnStateShape = Record<string, unknown>,
> {
  readonly entityId: string | null
  readonly launchColumn: (type: string, entityId?: string | null) => Promise<string>
  readonly updateTitle: (title: string) => void
  readonly updateMenuItems: (items: ReadonlyArray<MenuItem>) => void
  readonly updateListItems: (items: ReadonlyArray<MenuItem>) => void
  readonly updateHeaderStatus: (status: string | null) => void
  readonly cloneTemplate: (id: string) => DocumentFragment
  readonly close: () => void
  readonly showLoading: () => void
  readonly hideLoading: () => void
  readonly onTeardown: (fn: () => void) => void
  readonly trackHandle: <T extends { readonly abort: () => void }>(handle: T) => T
  readonly state: State
  readonly services: S
}

/** Launches a column of the given type, optionally bound to an entity id, and resolves with the column key. */
type ColumnLaunchFn = ColumnContext["launchColumn"]
/** The context the framework passes to a {@linkcode ColumnDefinition}; the definition wraps it with per-mount state, loading indicators, and teardown tracking. */
type OuterColumnContext<S extends ColumnServices = ColumnServices> = Omit<
  ColumnContext<S>,
  "showLoading" | "hideLoading" | "onTeardown" | "trackHandle" | "state"
>

/** The framework-facing column contract produced by {@linkcode createColumnDefinition}: asset loading, render/refresh, and lifecycle hooks. */
interface ColumnDefinition<S extends ColumnServices = ColumnServices> {
  readonly type: string
  readonly label: string
  readonly hasClose: boolean
  readonly hasRefresh: boolean
  readonly hasLists: boolean
  readonly hasPin: boolean
  readonly singleton: boolean
  readonly menuItems: ReadonlyArray<MenuItem> | null
  readonly getTitle: (entityId?: string | null) => string
  readonly loadAssets: (assetLoader: AssetLoader) => Promise<void>
  readonly render: (contentElement: HTMLElement, context: OuterColumnContext<S>) => Promise<void>
  readonly refresh: (contentElement: HTMLElement, context: OuterColumnContext<S>) => Promise<void>
  readonly onMenuSelect:
    | ((contentElement: HTMLElement, context: OuterColumnContext<S>, action: string) => Promise<void>)
    | null
  readonly onListSelect:
    | ((contentElement: HTMLElement, context: OuterColumnContext<S>, selection: ListSelection) => Promise<void>)
    | null
  readonly onListsOpen: ((contentElement: HTMLElement, context: OuterColumnContext<S>) => Promise<void>) | null
  readonly onDestroy: (contentElement: HTMLElement) => void
}

/** Author-facing options for {@linkcode createColumnDefinition}: assets, header behaviour, and lifecycle callbacks. */
interface ColumnDefinitionParams<
  S extends ColumnServices = ColumnServices,
  State extends ColumnStateShape = Record<string, unknown>,
> {
  readonly type: string
  readonly label: string
  readonly css?: string | ReadonlyArray<string> | null
  readonly html?: string | ReadonlyArray<string> | null
  readonly js?: string | ReadonlyArray<string> | null
  readonly hasClose?: boolean
  readonly hasRefresh?: boolean
  readonly hasLists?: boolean
  readonly hasPin?: boolean
  readonly singleton?: boolean
  readonly menuItems?: ReadonlyArray<MenuItem> | null
  readonly getTitle?: (entityId?: string | null) => string
  readonly onRender: (contentElement: HTMLElement, context: ColumnContext<S, State>) => Promise<void>
  readonly onRefresh?: (contentElement: HTMLElement, context: ColumnContext<S, State>) => Promise<void>
  readonly onMenuSelect?:
    | ((contentElement: HTMLElement, context: ColumnContext<S, State>, action: string) => void | Promise<void>)
    | null
  readonly onListSelect?:
    | ((
      contentElement: HTMLElement,
      context: ColumnContext<S, State>,
      selection: ListSelection,
    ) => void | Promise<void>)
    | null
  readonly onListsOpen?:
    | ((contentElement: HTMLElement, context: ColumnContext<S, State>) => void | Promise<void>)
    | null
  readonly onDestroy?: ((state: State, contentElement: HTMLElement) => void) | null
}

const toArray = (value: string | ReadonlyArray<string> | null | undefined): ReadonlyArray<string> => {
  if (!value) return []
  return typeof value === "string" ? [value] : value
}

/**
 * Builds a {@linkcode ColumnDefinition} from author callbacks, wiring per-mount state,
 * teardown registration, loading indicators, and asset loading around them.
 */
const createColumnDefinition = <
  S extends ColumnServices = ColumnServices,
  State extends ColumnStateShape = Record<string, unknown>,
>({
  type,
  label,
  css = null,
  html = null,
  js = null,
  hasClose = true,
  hasRefresh = true,
  hasLists = false,
  hasPin = true,
  singleton = true,
  menuItems = null,
  getTitle = () => label,
  onRender,
  onRefresh,
  onMenuSelect = null,
  onListSelect = null,
  onListsOpen = null,
  onDestroy = null,
}: ColumnDefinitionParams<S, State>): ColumnDefinition<S> => {
  const columnState = new WeakMap<HTMLElement, State>()
  const columnTeardowns = new WeakMap<HTMLElement, Array<() => void>>()

  const getColumnState = (element: HTMLElement): State => {
    let state = columnState.get(element)
    if (!state) {
      // State starts empty and is populated by the column's onRender. The framework is
      // generic over State and cannot construct the author's concrete shape, so the empty
      // seed is asserted at this boundary.
      // deno-lint-ignore innis/no-type-assertions
      state = {} as State
      columnState.set(element, state)
    }
    return state
  }

  const registerTeardown = (element: HTMLElement, fn: () => void): void => {
    let list = columnTeardowns.get(element)
    if (!list) {
      list = []
      columnTeardowns.set(element, list)
    }
    list.push(fn)
  }

  const runTeardowns = (element: HTMLElement): void => {
    const list = columnTeardowns.get(element)
    if (!list) return
    columnTeardowns.delete(element)
    const errors: Array<unknown> = []
    for (const fn of list) {
      try {
        fn()
      } catch (err) {
        errors.push(err)
      }
    }
    if (errors.length === 0) return
    // Every teardown runs even if some throw; their failures are collected and
    // surfaced together as one AggregateError. The rethrow is deferred so the
    // host's global error handler sees it without aborting column close or the
    // remaining teardowns — the framework has no error sink in its public surface.
    const aggregate = new AggregateError(errors, "Column teardown failed")
    setTimeout(() => {
      throw aggregate
    }, 0)
  }

  const loadAssets = async (assetLoader: AssetLoader): Promise<void> => {
    await Promise.all([
      ...toArray(css).map((path) => assetLoader.loadCss(path)),
      ...toArray(html).map((path) => assetLoader.loadHtml(path)),
      ...toArray(js).map((path) => assetLoader.loadJs(path)),
    ])
  }

  const showLoading = (el: HTMLElement): void => {
    if (!el.querySelector("[data-loading]")) {
      const loading = document.createElement("div")
      loading.setAttribute("data-loading", "")
      el.appendChild(loading)
    }
  }

  const hideLoading = (el: HTMLElement): void => {
    el.querySelector("[data-loading]")?.remove()
  }

  const buildContext = (contentElement: HTMLElement, context: OuterColumnContext<S>): ColumnContext<S, State> => ({
    ...context,
    showLoading: () => showLoading(contentElement),
    hideLoading: () => hideLoading(contentElement),
    onTeardown: (fn: () => void): void => registerTeardown(contentElement, fn),
    trackHandle: <T extends { readonly abort: () => void }>(handle: T): T => {
      registerTeardown(contentElement, () => handle.abort())
      return handle
    },
    state: getColumnState(contentElement),
  })

  const render = async (contentElement: HTMLElement, context: OuterColumnContext<S>): Promise<void> => {
    runTeardowns(contentElement)
    showLoading(contentElement)
    await onRender(contentElement, buildContext(contentElement, context))
  }

  const refresh = async (contentElement: HTMLElement, context: OuterColumnContext<S>): Promise<void> => {
    if (onRefresh) {
      await onRefresh(contentElement, buildContext(contentElement, context))
      return
    }
    await render(contentElement, context)
  }

  const wrappedOnMenuSelect = onMenuSelect
    ? async (contentElement: HTMLElement, context: OuterColumnContext<S>, action: string): Promise<void> => {
      await onMenuSelect(contentElement, buildContext(contentElement, context), action)
    }
    : null

  const wrappedOnListSelect = onListSelect
    ? async (contentElement: HTMLElement, context: OuterColumnContext<S>, selection: ListSelection): Promise<void> => {
      await onListSelect(contentElement, buildContext(contentElement, context), selection)
    }
    : null

  const wrappedOnListsOpen = onListsOpen
    ? async (contentElement: HTMLElement, context: OuterColumnContext<S>): Promise<void> => {
      await onListsOpen(contentElement, buildContext(contentElement, context))
    }
    : null

  const wrappedOnDestroy = (contentElement: HTMLElement): void => {
    runTeardowns(contentElement)
    if (onDestroy) {
      onDestroy(getColumnState(contentElement), contentElement)
    }
    columnState.delete(contentElement)
  }

  return Object.freeze({
    type,
    label,
    hasClose,
    hasRefresh,
    hasLists,
    hasPin,
    singleton,
    menuItems,
    getTitle,
    loadAssets,
    render,
    refresh,
    onMenuSelect: wrappedOnMenuSelect,
    onListSelect: wrappedOnListSelect,
    onListsOpen: wrappedOnListsOpen,
    onDestroy: wrappedOnDestroy,
  })
}

export type {
  AssetLoader,
  ColumnContext,
  ColumnDefinition,
  ColumnDefinitionParams,
  ColumnLaunchFn,
  ColumnServices,
  ColumnStateShape,
  ListSelection,
  MenuItem,
  OuterColumnContext,
}
export { createColumnDefinition }
