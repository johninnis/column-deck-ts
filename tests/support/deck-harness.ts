import { DOMParser, Element as DenoDomElement } from "deno-dom"
import { createColumnDeck } from "../../src/column-deck.ts"
import type { ColumnDeck } from "../../src/column-deck.ts"
import { createColumnDefinition } from "../../src/column-base.ts"
import type { AssetLoader, ColumnDefinition } from "../../src/column-base.ts"
import type { ColumnRef } from "../../src/column-state.ts"

const TEMPLATE_HTML = `<article data-column>
  <header draggable="true">
    <h2 data-title></h2>
    <nav>
      <button data-pin-btn type="button"></button>
      <div data-menu-wrapper>
        <button data-menu-btn type="button"></button>
        <ul data-menu-list></ul>
      </div>
      <div data-lists-wrapper>
        <button data-lists-btn type="button"></button>
        <ul data-lists-list></ul>
      </div>
      <button data-refresh-btn type="button"></button>
      <button data-close-btn type="button"></button>
    </nav>
  </header>
  <div data-content></div>
</article>`

let ready = false
export const setupDeckDom = (): void => {
  if (ready) return
  ready = true
  const doc = new DOMParser().parseFromString("<!DOCTYPE html><html><body></body></html>", "text/html")
  if (!doc) throw new Error("parse failed")
  Reflect.set(globalThis, "document", doc)
  Reflect.set(globalThis, "Element", DenoDomElement)
  Reflect.set(globalThis, "HTMLElement", DenoDomElement)
  Reflect.set(globalThis, "HTMLButtonElement", DenoDomElement)
  Reflect.set(globalThis, "requestAnimationFrame", (cb: FrameRequestCallback): number => {
    cb(0)
    return 0
  })
  Reflect.set(
    globalThis,
    "IntersectionObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
  Object.defineProperty(DenoDomElement.prototype, "focus", { value: () => {}, configurable: true })
  Object.defineProperty(DenoDomElement.prototype, "scrollIntoView", { value: () => {}, configurable: true })
  Object.defineProperty(DenoDomElement.prototype, "getBoundingClientRect", {
    value: (): { left: number; width: number } => ({ left: 0, width: 100 }),
    configurable: true,
  })
}
setupDeckDom()

export const cloneShell = (): DocumentFragment => {
  const div = document.createElement("div")
  div.innerHTML = TEMPLATE_HTML
  return { firstElementChild: div.firstElementChild } as unknown as DocumentFragment
}

export const inertAssetLoader: AssetLoader = {
  loadCss: (): Promise<void> => Promise.resolve(),
  loadHtml: (): Promise<void> => Promise.resolve(),
  loadJs: (): Promise<void> => Promise.resolve(),
  cloneTemplate: cloneShell,
}

export interface DeckOverrides {
  readonly isMobile?: boolean
  readonly saved?: string | null
  readonly initialMobileHistory?: ReadonlyArray<ColumnRef>
  readonly slowRender?: Promise<void>
  readonly assetLoader?: AssetLoader
  readonly extraDefinitions?: ReadonlyArray<ColumnDefinition>
}

export interface DeckHarness {
  readonly deck: ColumnDeck
  readonly mountElement: HTMLElement
  readonly store: { data: string | null }
  readonly teardowns: ReadonlyArray<string>
  readonly refreshes: ReadonlyArray<string>
  readonly pinnedChanges: ReadonlyArray<ReadonlyArray<ColumnRef>>
  readonly mobileHistoryChanges: () => number
}

export const makeDeck = async (overrides: DeckOverrides = {}): Promise<DeckHarness> => {
  const mountElement = document.createElement("main")
  document.body.appendChild(mountElement)
  const store: { data: string | null } = { data: overrides.saved ?? null }
  const teardowns: Array<string> = []
  const refreshes: Array<string> = []
  const pinnedChanges: Array<ReadonlyArray<ColumnRef>> = []
  let mobileHistoryChanges = 0

  const deck = await createColumnDeck({
    mountElement,
    assetLoader: overrides.assetLoader ?? inertAssetLoader,
    shellTemplate: cloneShell,
    persistence: {
      save: (data: string): void => {
        store.data = data
      },
      load: (): string | null => store.data,
    },
    isMobile: () => overrides.isMobile ?? false,
    initialMobileHistory: overrides.initialMobileHistory,
    onPinnedColumnsChange: (cols) => pinnedChanges.push(cols),
    onMobileHistoryChange: () => mobileHistoryChanges++,
    columnDefinitions: [
      createColumnDefinition({
        type: "feed",
        label: "Feed",
        onRender: (_el, { onTeardown }) => {
          onTeardown(() => teardowns.push("feed"))
          return Promise.resolve({
            refresh: (): void => {
              refreshes.push("feed")
            },
          })
        },
      }),
      createColumnDefinition({ type: "note", label: "Note", singleton: false, onRender: () => Promise.resolve() }),
      createColumnDefinition({
        type: "widget",
        label: "Widget",
        onRender: (_el, { onTeardown }) => {
          onTeardown(() => teardowns.push("widget"))
          return Promise.resolve()
        },
      }),
      createColumnDefinition({
        type: "slow",
        label: "Slow",
        onRender: () => overrides.slowRender ?? Promise.resolve(),
      }),
      ...(overrides.extraDefinitions ?? []),
    ],
    services: {},
  })

  return {
    deck,
    mountElement,
    store,
    teardowns,
    refreshes,
    pinnedChanges,
    mobileHistoryChanges: () => mobileHistoryChanges,
  }
}

export const columnElement = (mountElement: HTMLElement, key: string): HTMLElement => {
  const element = mountElement.querySelector(`[data-column-key="${key}"]`)
  if (!(element instanceof HTMLElement)) throw new Error(`column ${key} is not mounted`)
  return element
}

export const keysInDom = (mountElement: HTMLElement): ReadonlyArray<string | null> =>
  Array.from(mountElement.querySelectorAll("[data-column]")).map((el) => el.getAttribute("data-column-key"))

export const dispatch = (
  target: EventTarget | null | undefined,
  type: string,
  fields: Record<string, unknown> = {},
): void => {
  if (!target) throw new Error(`no target for ${type}`)
  const event = new Event(type, { bubbles: true, cancelable: true })
  for (const [name, value] of Object.entries(fields)) Reflect.set(event, name, value)
  target.dispatchEvent(event)
}

export const dispatchBubbled = (
  mountElement: HTMLElement,
  target: EventTarget | null | undefined,
  { type, ...fields }: { readonly type: string } & Record<string, unknown>,
): void => {
  if (!target) throw new Error(`no target for ${type}`)
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, "target", { value: target })
  for (const [name, value] of Object.entries(fields)) Reflect.set(event, name, value)
  mountElement.dispatchEvent(event)
}

export interface ReportedErrors {
  readonly errors: ReadonlyArray<unknown>
  readonly restore: () => void
}

export const captureReportedErrors = (): ReportedErrors => {
  const original = Reflect.get(globalThis, "reportError")
  const errors: Array<unknown> = []
  Reflect.set(globalThis, "reportError", (error: unknown): void => {
    errors.push(error)
  })
  return { errors, restore: () => Reflect.set(globalThis, "reportError", original) }
}

export const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}
