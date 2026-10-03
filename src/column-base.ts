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

/**
 * Hands out one live `AbortSignal` at a time for work a render starts again, such as the query behind a list it
 * reloads. Taking the next signal aborts the one handed out before it, and every signal the slot hands out aborts
 * when the render ends.
 */
interface SignalSlot {
  /** Abort the signal handed out before and return a fresh one that lives until the next call or the render's end. */
  readonly next: () => AbortSignal
  /** Abort the signal handed out last without starting anything new. */
  readonly abort: () => void
}

/** What the deck provides to a column: its entity, the header it can change, the deck's launch and close, the asset loader and the services. */
interface ColumnHost<S extends ColumnServices = ColumnServices> {
  readonly entityId: string | null
  readonly launchColumn: (type: string, entityId?: string | null) => Promise<string>
  readonly updateTitle: (title: string) => void
  readonly updateMenuItems: (items: ReadonlyArray<MenuItem>) => void
  readonly updateListItems: (items: ReadonlyArray<MenuItem>) => void
  readonly updateHeaderStatus: (status: string | null) => void
  readonly close: () => void
  readonly assetLoader: AssetLoader
  readonly services: S
}

/** Everything a column's render receives: the deck's side of the contract, the render's lifetime, and loading control. */
interface ColumnContext<S extends ColumnServices = ColumnServices> extends Omit<ColumnHost<S>, "assetLoader"> {
  readonly cloneTemplate: (id: string) => DocumentFragment
  readonly showLoading: () => void
  readonly hideLoading: () => void
  /** Aborts when this render ends: when the column re-renders or closes. Pass it as `{ signal }` to anything that takes one. */
  readonly signal: AbortSignal
  /** Run `fn` when this render ends; at once if it has already ended. */
  readonly onTeardown: (fn: () => void) => void
  /** A {@linkcode SignalSlot} for work the render starts again, such as a query its refresh reloads. */
  readonly signalSlot: () => SignalSlot
}

/**
 * What a column's `onRender` hands the deck: how its refresh button, header menu and list selector act. Each is a
 * closure over the render, so it works against the live DOM with the render's subscriptions intact. Each may act
 * synchronously or return a promise.
 */
interface ColumnHandlers {
  /** Refresh in place; without it the refresh button renders the column again. */
  readonly refresh?: (() => void | Promise<void>) | undefined
  /** Act on the header menu item the user picked. */
  readonly onMenuSelect?: ((action: string) => void | Promise<void>) | undefined
  /** Act on the list selector entry the user picked. */
  readonly onListSelect?: ((selection: ListSelection) => void | Promise<void>) | undefined
  /** Fill the list selector as it opens. */
  readonly onListsOpen?: (() => void | Promise<void>) | undefined
}

/** Author-facing options for {@linkcode createColumnDefinition}: assets, header behaviour, and the render. */
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

interface ColumnChromeOptions {
  readonly hasClose: boolean
  readonly hasRefresh: boolean
  readonly hasLists: boolean
  readonly hasPin: boolean
  readonly menuItems: ReadonlyArray<MenuItem> | null
  readonly getTitle: (entityId?: string | null) => string
}

type NextPaint = () => Promise<void>

interface ColumnLifecycle<S extends ColumnServices = ColumnServices> {
  readonly singleton: boolean
  readonly chrome: ColumnChromeOptions
  readonly render: (element: HTMLElement, host: ColumnHost<S>, nextPaint: NextPaint) => Promise<void>
  readonly refresh: (element: HTMLElement, host: ColumnHost<S>, nextPaint: NextPaint) => Promise<void>
  readonly handlersOf: (element: HTMLElement) => ColumnHandlers
  readonly destroy: (element: HTMLElement) => void
}

const lifecycleKey: unique symbol = Symbol("column lifecycle")

/**
 * A column type the deck can mount, built by {@linkcode createColumnDefinition} and registered through
 * `createColumnDeck`'s `columnDefinitions`. Only its `type` and `label` are readable; the deck drives the rest.
 */
interface ColumnDefinition<S extends ColumnServices = ColumnServices> {
  readonly type: string
  readonly label: string
  readonly [lifecycleKey]: ColumnLifecycle<S>
}

const lifecycleOf = <S extends ColumnServices>(definition: ColumnDefinition<S>): ColumnLifecycle<S> =>
  definition[lifecycleKey]

interface LiveRender {
  readonly controller: AbortController
  readonly handlers: ColumnHandlers
}

const NO_HANDLERS: ColumnHandlers = Object.freeze({})

const toArray = (value: string | ReadonlyArray<string> | null | undefined): ReadonlyArray<string> => {
  if (!value) return []
  return typeof value === "string" ? [value] : value
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

const teardownOn = (lifetime: AbortSignal) => (fn: () => void): void => {
  if (lifetime.aborted) fn()
  // Deliberate: wrapped so a teardown registered twice runs twice — see ADR-0001
  else lifetime.addEventListener("abort", () => fn(), { once: true })
}

const signalSlotOn = (lifetime: AbortSignal) => (): SignalSlot => {
  let current: AbortController | null = null
  const abort = (): void => current?.abort()
  const next = (): AbortSignal => {
    abort()
    current = new AbortController()
    return AbortSignal.any([lifetime, current.signal])
  }
  return Object.freeze({ next, abort })
}

const contextFor = <S extends ColumnServices>(
  element: HTMLElement,
  { assetLoader, ...host }: ColumnHost<S>,
  lifetime: AbortSignal,
): ColumnContext<S> => ({
  ...host,
  cloneTemplate: assetLoader.cloneTemplate,
  showLoading: () => showLoading(element),
  hideLoading: () => hideLoading(element),
  signal: lifetime,
  onTeardown: teardownOn(lifetime),
  signalSlot: signalSlotOn(lifetime),
})

/**
 * Builds a {@linkcode ColumnDefinition} from the column's options and render: the deck loads its assets, mounts its
 * template, calls `onRender` with a {@linkcode ColumnContext}, and routes its header controls to the handlers the
 * render returned.
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
  // Deliberate: keyed by the content element, one entry per mounted column — see ADR-0003
  const liveRenders = new WeakMap<HTMLElement, LiveRender>()

  const loadAssets = async (assetLoader: AssetLoader): Promise<void> => {
    await Promise.all([
      ...toArray(css).map((path) => assetLoader.loadCss(path)),
      ...toArray(html).map((path) => assetLoader.loadHtml(path)),
      ...toArray(js).map((path) => assetLoader.loadJs(path)),
    ])
  }

  const render = async (element: HTMLElement, host: ColumnHost<S>, nextPaint: NextPaint): Promise<void> => {
    liveRenders.get(element)?.controller.abort()
    const controller = new AbortController()
    liveRenders.set(element, { controller, handlers: NO_HANDLERS })
    await loadAssets(host.assetLoader)
    await nextPaint()
    if (controller.signal.aborted) return
    if (template) element.replaceChildren(host.assetLoader.cloneTemplate(template))
    else showLoading(element)
    const handlers = await onRender(element, contextFor(element, host, controller.signal))
    if (handlers && !controller.signal.aborted) liveRenders.set(element, { controller, handlers })
  }

  const handlersOf = (element: HTMLElement): ColumnHandlers => liveRenders.get(element)?.handlers ?? NO_HANDLERS

  const refresh = async (element: HTMLElement, host: ColumnHost<S>, nextPaint: NextPaint): Promise<void> => {
    const ownRefresh = handlersOf(element).refresh
    if (ownRefresh) await ownRefresh()
    else await render(element, host, nextPaint)
  }

  const destroy = (element: HTMLElement): void => {
    liveRenders.get(element)?.controller.abort()
    liveRenders.delete(element)
  }

  const lifecycle: ColumnLifecycle<S> = Object.freeze({
    singleton,
    chrome: Object.freeze({ hasClose, hasRefresh, hasLists, hasPin, menuItems, getTitle }),
    render,
    refresh,
    handlersOf,
    destroy,
  })

  return Object.freeze({ type, label, [lifecycleKey]: lifecycle })
}

export type {
  AssetLoader,
  ColumnChromeOptions,
  ColumnContext,
  ColumnDefinition,
  ColumnDefinitionParams,
  ColumnHandlers,
  ColumnHost,
  ColumnLifecycle,
  ColumnServices,
  ListSelection,
  MenuAction,
  MenuItem,
  MenuNotice,
  MenuSeparator,
  NextPaint,
  SignalSlot,
}
export { createColumnDefinition, lifecycleOf, NO_HANDLERS }
