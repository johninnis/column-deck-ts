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

/** Everything a column's render receives: launch/teardown plumbing, header controls, and the injected services. */
interface ColumnContext<S extends ColumnServices = ColumnServices> {
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
  /** Aborts when this render's teardowns run; pass it as `{ signal }` to `addEventListener`. */
  readonly signal: AbortSignal
  readonly services: S
}

/** Launches a column of the given type, optionally bound to an entity id, and resolves with the column key. */
type ColumnLaunchFn = ColumnContext["launchColumn"]
/** The context the framework passes to a {@linkcode ColumnDefinition}; the definition wraps it with loading indicators and teardown tracking. */
type OuterColumnContext<S extends ColumnServices = ColumnServices> = Omit<
  ColumnContext<S>,
  "showLoading" | "hideLoading" | "onTeardown" | "trackHandle" | "signal"
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
  readonly onMenuSelect: (contentElement: HTMLElement, action: string) => Promise<void>
  readonly onListSelect: (contentElement: HTMLElement, selection: ListSelection) => Promise<void>
  readonly onListsOpen: (contentElement: HTMLElement) => Promise<void>
  readonly onDestroy: (contentElement: HTMLElement) => void
}

/**
 * What a column's `onRender` hands the deck: how its refresh button, header menu and list selector act. Each is a
 * closure over the render, so it works against the live DOM with the render's subscriptions intact. Each may act
 * synchronously or return a promise.
 */
interface ColumnHandlers {
  /** Refresh in place; without it the refresh button tears the column down and renders it again. */
  readonly refresh?: (() => void | Promise<void>) | undefined
  /** Act on the header menu item the user picked. */
  readonly onMenuSelect?: ((action: string) => void | Promise<void>) | undefined
  /** Act on the list selector entry the user picked. */
  readonly onListSelect?: ((selection: ListSelection) => void | Promise<void>) | undefined
  /** Fill the list selector as it opens. */
  readonly onListsOpen?: (() => void | Promise<void>) | undefined
}

/** Author-facing options for {@linkcode createColumnDefinition}: assets, header behaviour, and lifecycle callbacks. */
interface ColumnDefinitionParams<S extends ColumnServices = ColumnServices> {
  readonly type: string
  readonly label: string
  readonly css?: string | ReadonlyArray<string> | null
  readonly html?: string | ReadonlyArray<string> | null
  readonly js?: string | ReadonlyArray<string> | null
  /**
   * The id of a registered `<template>` whose clone replaces the content element's children before every
   * `onRender`. A column with a template gets no loading indicator from the deck, since the mount would remove it
   * at once; a column that then waits on something calls `showLoading` itself.
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
   * Render the column into its content element: into its mounted `template` when it declares one, otherwise over the
   * deck's loading indicator. Resolve with the {@linkcode ColumnHandlers} the header controls should call.
   */
  readonly onRender: (contentElement: HTMLElement, context: ColumnContext<S>) => Promise<void | ColumnHandlers>
}

const toArray = (value: string | ReadonlyArray<string> | null | undefined): ReadonlyArray<string> => {
  if (!value) return []
  return typeof value === "string" ? [value] : value
}

/**
 * Builds a {@linkcode ColumnDefinition} from author callbacks, wiring teardown registration, loading indicators,
 * asset loading and the handlers each render returns around them.
 */
const createColumnDefinition = <S extends ColumnServices = ColumnServices>({
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
}: ColumnDefinitionParams<S>): ColumnDefinition<S> => {
  const columnTeardowns = new WeakMap<HTMLElement, Array<() => void>>()
  const columnHandlers = new WeakMap<HTMLElement, ColumnHandlers>()
  const renderGenerations = new WeakMap<HTMLElement, number>()

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

  const buildContext = (contentElement: HTMLElement, context: OuterColumnContext<S>): ColumnContext<S> => {
    const lifetime = new AbortController()
    registerTeardown(contentElement, () => lifetime.abort())
    return {
      ...context,
      showLoading: () => showLoading(contentElement),
      hideLoading: () => hideLoading(contentElement),
      onTeardown: (fn: () => void): void => registerTeardown(contentElement, fn),
      trackHandle: <T extends { readonly abort: () => void }>(handle: T): T => {
        registerTeardown(contentElement, () => handle.abort())
        return handle
      },
      signal: lifetime.signal,
    }
  }

  const render = async (contentElement: HTMLElement, context: OuterColumnContext<S>): Promise<void> => {
    runTeardowns(contentElement)
    columnHandlers.delete(contentElement)
    const generation = (renderGenerations.get(contentElement) ?? 0) + 1
    renderGenerations.set(contentElement, generation)
    if (template) contentElement.replaceChildren(context.cloneTemplate(template))
    else showLoading(contentElement)
    const handlers = await onRender(contentElement, buildContext(contentElement, context))
    // A render that a newer render or a destroy overtook while it ran must not install its handlers.
    if (handlers && renderGenerations.get(contentElement) === generation) {
      columnHandlers.set(contentElement, handlers)
    }
  }

  const refresh = async (contentElement: HTMLElement, context: OuterColumnContext<S>): Promise<void> => {
    const ownRefresh = columnHandlers.get(contentElement)?.refresh
    if (ownRefresh) {
      await ownRefresh()
      return
    }
    await render(contentElement, context)
  }

  const onMenuSelect = async (contentElement: HTMLElement, action: string): Promise<void> => {
    await columnHandlers.get(contentElement)?.onMenuSelect?.(action)
  }

  const onListSelect = async (contentElement: HTMLElement, selection: ListSelection): Promise<void> => {
    await columnHandlers.get(contentElement)?.onListSelect?.(selection)
  }

  const onListsOpen = async (contentElement: HTMLElement): Promise<void> => {
    await columnHandlers.get(contentElement)?.onListsOpen?.()
  }

  const onDestroy = (contentElement: HTMLElement): void => {
    runTeardowns(contentElement)
    columnHandlers.delete(contentElement)
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
    onMenuSelect,
    onListSelect,
    onListsOpen,
    onDestroy,
  })
}

export type {
  AssetLoader,
  ColumnContext,
  ColumnDefinition,
  ColumnDefinitionParams,
  ColumnHandlers,
  ColumnLaunchFn,
  ColumnServices,
  ListSelection,
  MenuAction,
  MenuItem,
  MenuNotice,
  MenuSeparator,
  OuterColumnContext,
}
export { createColumnDefinition }
