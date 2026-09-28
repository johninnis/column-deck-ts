/** The host-provided services bag injected into every column; the framework treats it as opaque. */
type ColumnServices = object

/** Host-provided loader for a column's CSS, HTML template, and JS assets. */
interface AssetLoader {
  readonly loadCss: (path: string) => Promise<void>
  readonly loadHtml: (path: string) => Promise<void>
  readonly loadJs: (path: string) => Promise<void>
  readonly cloneTemplate: (id: string) => DocumentFragment
}

/** A divider between entries in a column's header menu or list selector. */
interface MenuSeparator {
  readonly separator: true
}

/** An actionable entry in a column's header menu or list selector. */
interface MenuAction {
  readonly label: string
  readonly action: string
  readonly variant?: string
  readonly selected?: boolean
}

/** A greyed-out, non-actionable entry that tells the user something ("No lists yet", "Loading…"). */
interface MenuNotice {
  readonly label: string
  readonly disabled: true
}

/** A single entry in a column's header menu or list selector. */
type MenuItem = MenuSeparator | MenuAction | MenuNotice

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

/** A column's own refresh, returned from `onRender`: the refresh button calls it instead of re-rendering. */
type ColumnRefresh = () => void | Promise<void>

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
  /**
   * The id of a registered `<template>` whose clone replaces the content element's children before every
   * `onRender`. A column with a template gets no loading indicator from the deck, since the mount would remove it
   * at once; a column that loads asynchronously calls `showLoading` itself.
   */
  readonly template?: string | null
  readonly hasClose?: boolean
  readonly hasRefresh?: boolean
  readonly hasLists?: boolean
  readonly hasPin?: boolean
  readonly singleton?: boolean
  readonly menuItems?: ReadonlyArray<MenuItem> | null
  readonly getTitle?: (entityId?: string | null) => string
  /**
   * Render the column. Resolve with a {@linkcode ColumnRefresh} to have the refresh button refresh in place,
   * against the live DOM with the render's subscriptions intact; resolve with nothing to have refresh tear
   * down and render again.
   */
  readonly onRender: (
    contentElement: HTMLElement,
    context: ColumnContext<S, State>,
  ) => Promise<void | ColumnRefresh>
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
  template = null,
  hasClose = true,
  hasRefresh = true,
  hasLists = false,
  hasPin = true,
  singleton = true,
  menuItems = null,
  getTitle = () => label,
  onRender,
  onMenuSelect = null,
  onListSelect = null,
  onListsOpen = null,
  onDestroy = null,
}: ColumnDefinitionParams<S, State>): ColumnDefinition<S> => {
  const columnState = new WeakMap<HTMLElement, State>()
  const columnTeardowns = new WeakMap<HTMLElement, Array<() => void>>()
  const columnRefreshes = new WeakMap<HTMLElement, ColumnRefresh>()
  const renderGenerations = new WeakMap<HTMLElement, number>()

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
    if (errors.length > 0) reportError(new AggregateError(errors, "Column teardown failed"))
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
    columnRefreshes.delete(contentElement)
    const generation = (renderGenerations.get(contentElement) ?? 0) + 1
    renderGenerations.set(contentElement, generation)
    if (template) contentElement.replaceChildren(context.cloneTemplate(template))
    else showLoading(contentElement)
    const ownRefresh = await onRender(contentElement, buildContext(contentElement, context))
    // A render that a newer render or a destroy overtook while it ran must not install its refresh.
    if (ownRefresh && renderGenerations.get(contentElement) === generation) {
      columnRefreshes.set(contentElement, ownRefresh)
    }
  }

  const refresh = async (contentElement: HTMLElement, context: OuterColumnContext<S>): Promise<void> => {
    const ownRefresh = columnRefreshes.get(contentElement)
    if (ownRefresh) {
      await ownRefresh()
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
    columnRefreshes.delete(contentElement)
    renderGenerations.delete(contentElement)
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
  ColumnRefresh,
  ColumnServices,
  ColumnStateShape,
  ListSelection,
  MenuAction,
  MenuItem,
  MenuNotice,
  MenuSeparator,
  OuterColumnContext,
}
export { createColumnDefinition }
