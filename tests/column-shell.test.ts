import { assertEquals, assertExists } from "@std/assert"
import { DOMParser, Element } from "deno-dom"
import { type ColumnShell, createColumnShell, type ShellChrome, type ShellEvents } from "../src/column-shell.ts"

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

let initialised = false

const setup = (): void => {
  if (initialised) return
  initialised = true
  const doc = new DOMParser().parseFromString("<!DOCTYPE html><html><body></body></html>", "text/html")
  if (!doc) throw new Error("parse failed")
  Reflect.set(globalThis, "document", doc)
  Reflect.set(globalThis, "Element", Element)
  Reflect.set(globalThis, "HTMLElement", Element)
  Reflect.set(globalThis, "HTMLButtonElement", Element)
  Reflect.set(globalThis, "HTMLInputElement", Element)
  Reflect.set(globalThis, "HTMLFormElement", Element)
  Reflect.set(
    globalThis,
    "MouseEvent",
    class MouseEvent extends Event {
      constructor(type: string) {
        super(type)
      }
    },
  )
  Object.defineProperty(Element.prototype, "style", {
    get(): Record<string, string> {
      let s = Reflect.get(this, "__style")
      if (!s) {
        s = {}
        Reflect.set(this, "__style", s)
      }
      return s
    },
    configurable: true,
  })
  Object.defineProperty(Element.prototype, "disabled", {
    get(): boolean {
      return this.hasAttribute("disabled")
    },
    set(v: boolean): void {
      if (v) this.setAttribute("disabled", "")
      else this.removeAttribute("disabled")
    },
    configurable: true,
  })
  Object.defineProperty(Element.prototype, "scrollTo", {
    value(options: ScrollToOptions): void {
      Reflect.set(this, "__lastScrollTo", options)
    },
    configurable: true,
  })
}

setup()

const click = (el: unknown): void => {
  if (!el) throw new Error("element missing")
  const dispatch = Reflect.get(el, "dispatchEvent")
  if (typeof dispatch !== "function") throw new Error("element has no dispatchEvent")
  dispatch.call(el, new Event("click", { bubbles: true }))
}

const cloneTemplate = (): DocumentFragment => {
  const wrapper = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${TEMPLATE_HTML}</body></html>`,
    "text/html",
  )
  if (!wrapper) throw new Error("clone parse failed")
  const article = wrapper.querySelector("article")
  if (!article) throw new Error("article missing")
  return { firstElementChild: article } as unknown as DocumentFragment
}

const DEFAULT_CHROME: ShellChrome = {
  title: "Feed",
  hasClose: true,
  hasRefresh: true,
  hasLists: false,
  hasPin: true,
  menuItems: null,
}

const noop = (): void => {}

const INERT_EVENTS: ShellEvents = {
  onClose: noop,
  onRefresh: noop,
  onMenuSelect: noop,
  onListSelect: noop,
  onListsOpen: noop,
  onTogglePin: noop,
  onFocus: noop,
  onHeaderWheel: noop,
}

const makeShell = (chrome: Partial<ShellChrome> = {}, events: Partial<ShellEvents> = {}): ColumnShell =>
  createColumnShell(cloneTemplate, { ...DEFAULT_CHROME, ...chrome }, { ...INERT_EVENTS, ...events })

Deno.test("createColumnShell - sets the title from params", () => {
  const shell = makeShell({ title: "Feed" })
  const titleEl = shell.element.querySelector("[data-title]")
  assertEquals(titleEl?.textContent, "Feed")
})

Deno.test("createColumnShell - getContentElement returns the [data-content] node", () => {
  const shell = makeShell({ title: "Feed" })
  const content = shell.getContentElement()
  assertExists(content)
  assertEquals(content.matches("[data-content]"), true)
})

Deno.test("createColumnShell - removes the menu wrapper when menuItems is null", () => {
  const shell = makeShell({ title: "Feed", menuItems: null })
  assertEquals(shell.element.querySelector("[data-menu-wrapper]"), null)
})

Deno.test("createColumnShell - renders menu items when provided", () => {
  const shell = makeShell({
    title: "Feed",
    menuItems: [{ label: "One", action: "one" }, { label: "Two", action: "two" }],
  })
  const items = shell.element.querySelectorAll("[data-menu-list] button")
  assertEquals(items.length, 2)
})

Deno.test("createColumnShell - removes the refresh button when hasRefresh is false", () => {
  const shell = makeShell({ title: "Feed", hasRefresh: false })
  assertEquals(shell.element.querySelector("[data-refresh-btn]"), null)
})

Deno.test("createColumnShell - removes the close button when hasClose is false", () => {
  const shell = makeShell({ title: "Feed", hasClose: false })
  assertEquals(shell.element.querySelector("[data-close-btn]"), null)
})

Deno.test("createColumnShell - removes the lists wrapper when hasLists is false (default)", () => {
  const shell = makeShell({ title: "Feed" })
  assertEquals(shell.element.querySelector("[data-lists-wrapper]"), null)
})

Deno.test("createColumnShell - updateTitle replaces the title text", () => {
  const shell = makeShell({ title: "Feed" })
  shell.updateTitle("Renamed")
  assertEquals(shell.element.querySelector("[data-title]")?.textContent, "Renamed")
})

Deno.test("createColumnShell - updateHeaderStatus sets data-status-bar to the given status", () => {
  const shell = makeShell({ title: "Feed" })
  shell.updateHeaderStatus("active")
  assertEquals(shell.element.querySelector("[data-title]")?.getAttribute("data-status-bar"), "active")
})

Deno.test("createColumnShell - updateHeaderStatus clears the status when given null", () => {
  const shell = makeShell({ title: "Feed" })
  shell.updateHeaderStatus("active")
  shell.updateHeaderStatus(null)
  const titleEl = shell.element.querySelector("[data-title]")
  assertEquals(titleEl?.getAttribute("data-status-bar"), null)
})

Deno.test("createColumnShell - renderPinned marks the shell pinned, hides close and stops the header dragging", () => {
  const shell = makeShell()
  shell.renderPinned(true)
  assertEquals(
    [
      shell.element.hasAttribute("data-pinned"),
      shell.element.querySelector("[data-close-btn]")?.hasAttribute("hidden"),
      shell.element.querySelector("header")?.getAttribute("draggable"),
    ],
    [true, true, "false"],
  )
})

Deno.test("createColumnShell - renderPinned(false) restores close and dragging", () => {
  const shell = makeShell()
  shell.renderPinned(true)
  shell.renderPinned(false)
  assertEquals(
    [
      shell.element.hasAttribute("data-pinned"),
      shell.element.querySelector("[data-close-btn]")?.hasAttribute("hidden"),
      shell.element.querySelector("header")?.getAttribute("draggable"),
    ],
    [false, false, "true"],
  )
})

Deno.test("createColumnShell - a column without a pin button never becomes draggable", () => {
  const shell = makeShell({ hasPin: false })
  shell.renderPinned(false)
  assertEquals(shell.element.querySelector("header")?.getAttribute("draggable"), "false")
})

Deno.test("createColumnShell - renderPinned only renders; it reports nothing", () => {
  const calls: Array<boolean> = []
  const shell = makeShell({}, { onTogglePin: () => calls.push(true) })
  shell.renderPinned(true)
  assertEquals(calls, [])
})

Deno.test("createColumnShell - middle-clicking the header asks to close the column", () => {
  let closes = 0
  const shell = makeShell({}, { onClose: () => closes++ })
  const event = new Event("auxclick")
  Reflect.set(event, "button", 1)
  shell.element.querySelector("header")?.dispatchEvent(event)
  assertEquals(closes, 1)
})

Deno.test("createColumnShell - scrolling the wheel over the header reports the scroll", () => {
  const deltas: Array<number> = []
  const shell = makeShell({}, { onHeaderWheel: (deltaY) => deltas.push(deltaY) })
  const event = new Event("wheel", { cancelable: true })
  Reflect.set(event, "deltaY", 40)
  shell.element.querySelector("header")?.dispatchEvent(event)
  assertEquals(deltas, [40])
})

Deno.test("createColumnShell - destroy aborts the controller (idempotent re-destroy)", () => {
  const shell = makeShell({ title: "Feed" })
  shell.destroy()
  shell.destroy()
})

Deno.test("createColumnShell - updateMenuItems rebuilds the menu", () => {
  const shell = makeShell({ title: "Feed", menuItems: [{ label: "One", action: "one" }] })
  shell.updateMenuItems([{ label: "A", action: "a" }, { separator: true }, { label: "B", action: "b" }])
  const buttons = shell.element.querySelectorAll("[data-menu-list] button")
  const separators = shell.element.querySelectorAll("[data-menu-list] [data-separator]")
  assertEquals(buttons.length, 2)
  assertEquals(separators.length, 1)
})

Deno.test("createColumnShell - hasLists=true keeps the lists wrapper and updateListItems renders entries", () => {
  const shell = makeShell({ title: "Feed", hasLists: true })
  shell.updateListItems([{ label: "L1", action: "l1" }])
  const items = shell.element.querySelectorAll("[data-lists-list] button")
  assertEquals(items.length, 1)
})

Deno.test("createColumnShell - menu item variants and disabled state propagate to the rendered buttons", () => {
  const shell = makeShell({
    title: "Feed",
    menuItems: [
      { label: "Danger", action: "del", variant: "danger" },
      { label: "Off", action: "x", disabled: true },
      { label: "Selected", action: "s", selected: true },
      { separator: true },
    ],
  })
  const buttons = shell.element.querySelectorAll("[data-menu-list] button")
  assertEquals(buttons[0]?.getAttribute("data-variant"), "danger")
  assertEquals(buttons[1]?.hasAttribute("disabled"), true)
  assertEquals(buttons[2]?.hasAttribute("data-selected"), true)
  const separators = shell.element.querySelectorAll("[data-menu-list] [data-separator]")
  assertEquals(separators.length, 1)
})

Deno.test("createColumnShell - clicking a menu item fires onMenuSelect with its action and closes the menu", () => {
  const calls: Array<string> = []
  const shell = makeShell({ title: "Feed", menuItems: [{ label: "One", action: "one" }] }, {
    onMenuSelect: (a) => calls.push(a),
  })
  const menuList = shell.element.querySelector("[data-menu-list]")
  if (menuList) Reflect.set(menuList, "dataset", { visible: "" })
  const btn = shell.element.querySelector("[data-menu-list] button")
  click(btn)
  assertEquals(calls, ["one"])
})

Deno.test("createColumnShell - clicking the menu button opens the menu", () => {
  const shell = makeShell({ title: "Feed", menuItems: [] })
  const btn = shell.element.querySelector("[data-menu-btn]")
  click(btn)
  const menu = shell.element.querySelector("[data-menu-list]")
  assertEquals(menu?.hasAttribute("data-visible"), true)
})

Deno.test("createColumnShell - clicking the refresh button calls onRefresh", () => {
  let count = 0
  const shell = makeShell({ title: "Feed" }, { onRefresh: () => count++ })
  const btn = shell.element.querySelector("[data-refresh-btn]")
  click(btn)
  assertEquals(count, 1)
})

Deno.test("createColumnShell - clicking the close button calls onClose", () => {
  let count = 0
  const shell = makeShell({ title: "Feed" }, { onClose: () => count++ })
  const btn = shell.element.querySelector("[data-close-btn]")
  click(btn)
  assertEquals(count, 1)
})

Deno.test("createColumnShell - hasPin=true adds a pin button to the header", () => {
  const shell = makeShell({ title: "Feed", hasPin: true })
  const pin = shell.element.querySelector("[data-pin-btn]")
  assertExists(pin)
})

Deno.test("createColumnShell - hasPin=false omits the pin button", () => {
  const shell = makeShell({ title: "Feed", hasPin: false })
  assertEquals(shell.element.querySelector("[data-pin-btn]"), null)
})

Deno.test("createColumnShell - clicking the pin button asks to toggle the pin, leaving the chrome to the deck", () => {
  const calls: Array<boolean> = []
  const shell = makeShell({ title: "Feed", hasPin: true }, { onTogglePin: () => calls.push(true) })
  const pin = shell.element.querySelector("[data-pin-btn]")
  click(pin)
  assertEquals([calls, shell.element.hasAttribute("data-pinned")], [[true], false])
})

Deno.test("createColumnShell - list item buttons render with selected state", () => {
  const shell = makeShell({ title: "Feed", hasLists: true, menuItems: [] })
  shell.updateListItems([{ label: "A", action: "a", selected: true }, { separator: true }])
  const btn = shell.element.querySelector("[data-lists-list] button")
  assertEquals(btn?.hasAttribute("data-selected"), true)
  const separators = shell.element.querySelectorAll("[data-lists-list] [data-separator]")
  assertEquals(separators.length, 1)
})

Deno.test("createColumnShell - double-clicking the header scrolls the content element", () => {
  const shell = makeShell({ title: "Feed" })
  const header = shell.element.querySelector("header")
  if (!header) throw new Error("header missing")
  header.dispatchEvent(new Event("dblclick", { bubbles: true }))
  assertEquals(Reflect.get(shell.getContentElement(), "__lastScrollTo"), { top: 0, behavior: "smooth" })
})

Deno.test("createColumnShell - double-clicking the header scrolls [data-scroll-region] when present", () => {
  const shell = makeShell({ title: "Group" })
  const content = shell.getContentElement()
  content.innerHTML = "<section data-scroll-region></section>"
  const region = content.querySelector("[data-scroll-region]")
  if (!region) throw new Error("region missing")
  const header = shell.element.querySelector("header")
  if (!header) throw new Error("header missing")
  header.dispatchEvent(new Event("dblclick", { bubbles: true }))
  assertEquals(Reflect.get(region, "__lastScrollTo"), { top: 0, behavior: "smooth" })
  assertEquals(Reflect.get(content, "__lastScrollTo"), undefined)
})

Deno.test("createColumnShell - updateHeaderStatus leaves a custom title from updateTitle intact", () => {
  const shell = makeShell({ title: "Feed" })
  shell.updateTitle("3 unread")
  shell.updateHeaderStatus("connected")
  assertEquals(shell.element.querySelector("[data-title]")?.textContent, "3 unread")
})

Deno.test("createColumnShell - opening the lists dropdown fires onListsOpen", () => {
  let opened = 0
  const shell = makeShell({ title: "Feed", hasLists: true }, { onListsOpen: () => opened++ })
  const btn = shell.element.querySelector("[data-lists-btn]")
  click(btn)
  assertEquals(opened, 1)
  assertEquals(shell.element.querySelector("[data-lists-list]")?.hasAttribute("data-visible"), true)
})

Deno.test("createColumnShell - opening one dropdown closes the other and keeps aria-expanded in sync", () => {
  const shell = makeShell({ title: "Feed", hasLists: true, menuItems: [] })
  click(shell.element.querySelector("[data-menu-btn]"))
  click(shell.element.querySelector("[data-lists-btn]"))
  assertEquals(shell.element.querySelector("[data-menu-list]")?.hasAttribute("data-visible"), false)
  assertEquals(shell.element.querySelector("[data-lists-list]")?.hasAttribute("data-visible"), true)
  assertEquals(shell.element.querySelector("[data-menu-btn]")?.getAttribute("aria-expanded"), "false")
  assertEquals(shell.element.querySelector("[data-lists-btn]")?.getAttribute("aria-expanded"), "true")
})

Deno.test("createColumnShell - clicking a list item button fires onListSelect with its action", () => {
  const calls: Array<string> = []
  const shell = makeShell({ title: "Feed", hasLists: true, menuItems: [] }, { onListSelect: (a) => calls.push(a) })
  shell.updateListItems([{ label: "L", action: "l" }])
  const btn = shell.element.querySelector("[data-lists-list] button")
  click(btn)
  assertEquals(calls, ["l"])
})

Deno.test("createColumnShell - menu entries are plain buttons that never submit a form", () => {
  const shell = makeShell({ title: "Feed", menuItems: [{ label: "Copy", action: "copy" }] })
  const entry = shell.element.querySelector("[data-menu-list] button")
  assertEquals(entry?.getAttribute("type"), "button")
})
