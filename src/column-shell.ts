import type { MenuAction, MenuItem } from "./column-base.ts"
import { ColumnLifecycleError } from "./errors.ts"
import { scrollBehaviour } from "./motion.ts"
import type { ShellTemplate } from "./shell-template.ts"

const query = <T extends Element>(root: ParentNode, selector: string, type: { new (): T }): T => {
  const el = root.querySelector(selector)
  if (!(el instanceof type)) throw new ColumnLifecycleError(`Required element not found: ${selector}`)
  return el
}

const resolveScrollRegion = (content: HTMLElement): HTMLElement => {
  const region = content.querySelector("[data-scroll-region]")
  return region instanceof HTMLElement ? region : content
}

interface DropdownControl {
  readonly btn: HTMLButtonElement
  readonly list: HTMLElement
}

const setDropdownOpen = (dropdown: DropdownControl, open: boolean): void => {
  if (open) {
    dropdown.list.dataset.visible = ""
  } else {
    delete dropdown.list.dataset.visible
  }
  dropdown.btn.setAttribute("aria-expanded", String(open))
}

const isDropdownClosed = (dropdown: DropdownControl): boolean => dropdown.list.dataset.visible === undefined

const populateDropdown = (
  list: HTMLElement,
  items: ReadonlyArray<MenuItem>,
  onItemClick: (item: MenuAction, btn: HTMLButtonElement) => void,
): void => {
  list.innerHTML = ""
  items.forEach((item) => {
    const li = document.createElement("li")
    if ("separator" in item) {
      li.dataset.separator = ""
      list.appendChild(li)
      return
    }
    li.setAttribute("role", "none")
    const btn = document.createElement("button")
    btn.setAttribute("type", "button")
    btn.setAttribute("role", "menuitem")
    btn.textContent = item.label
    if ("disabled" in item) {
      btn.disabled = true
    } else {
      if (item.variant) btn.dataset.variant = item.variant
      if (item.selected) btn.dataset.selected = ""
      btn.addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation()
        onItemClick(item, btn)
      })
    }
    li.appendChild(btn)
    list.appendChild(li)
  })
}

interface ShellChrome {
  readonly title: string
  readonly hasClose: boolean
  readonly hasRefresh: boolean
  readonly hasLists: boolean
  readonly hasPin: boolean
  readonly menuItems: ReadonlyArray<MenuItem> | null
}

interface ShellEvents {
  readonly onClose: () => void
  readonly onRefresh: () => void
  readonly onMenuSelect: (action: string) => void
  readonly onListSelect: (action: string, btn: HTMLButtonElement | null) => void
  readonly onListsOpen: () => void
  readonly onTogglePin: () => void
  readonly onFocus: () => void
  readonly onHeaderWheel: (deltaY: number) => void
}

interface ColumnShell {
  readonly element: HTMLElement
  readonly getContentElement: () => HTMLElement
  readonly renderPinned: (pinned: boolean) => void
  readonly updateTitle: (newTitle: string) => void
  readonly updateMenuItems: (items: ReadonlyArray<MenuItem>) => void
  readonly updateListItems: (items: ReadonlyArray<MenuItem>) => void
  readonly updateHeaderStatus: (status: string | null) => void
  readonly destroy: () => void
}

const createColumnShell = (shellTemplate: ShellTemplate, chrome: ShellChrome, events: ShellEvents): ColumnShell => {
  const fragment = shellTemplate()
  const firstChild = fragment.firstElementChild
  if (!(firstChild instanceof HTMLElement)) {
    throw new ColumnLifecycleError("shell template must have an HTMLElement root")
  }
  const shell = firstChild
  const abortController = new AbortController()

  const titleEl = query(shell, "[data-title]", HTMLElement)
  titleEl.textContent = chrome.title

  const menuWrapper = query(shell, "[data-menu-wrapper]", HTMLElement)
  const listsWrapper = query(shell, "[data-lists-wrapper]", HTMLElement)
  const refreshBtn = query(shell, "[data-refresh-btn]", HTMLElement)
  const closeBtn = query(shell, "[data-close-btn]", HTMLElement)
  const pinBtn = query(shell, "[data-pin-btn]", HTMLButtonElement)
  const header = query(shell, "header", HTMLElement)
  const content = query(shell, "[data-content]", HTMLElement)

  const menu: DropdownControl = {
    btn: query(shell, "[data-menu-btn]", HTMLButtonElement),
    list: query(shell, "[data-menu-list]", HTMLElement),
  }
  const lists: DropdownControl = {
    btn: query(shell, "[data-lists-btn]", HTMLButtonElement),
    list: query(shell, "[data-lists-list]", HTMLElement),
  }

  const updateMenuItems = (items: ReadonlyArray<MenuItem>): void =>
    populateDropdown(menu.list, items, (item) => {
      setDropdownOpen(menu, false)
      events.onMenuSelect(item.action)
    })

  const updateListItems = (items: ReadonlyArray<MenuItem>): void =>
    populateDropdown(lists.list, items, (item, btn) => events.onListSelect(item.action, btn))

  const updateTitle = (newTitle: string): void => {
    titleEl.textContent = newTitle
  }

  const updateHeaderStatus = (status: string | null): void => {
    if (status !== null) {
      titleEl.dataset.statusBar = status
    } else {
      delete titleEl.dataset.statusBar
    }
  }

  const wireDropdownToggle = (dropdown: DropdownControl, other: DropdownControl, onOpen: () => void): void => {
    dropdown.btn.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation()
      const opening = isDropdownClosed(dropdown)
      setDropdownOpen(dropdown, opening)
      if (opening) {
        setDropdownOpen(other, false)
        onOpen()
      }
    })
    document.addEventListener("click", () => setDropdownOpen(dropdown, false), { signal: abortController.signal })
  }

  if (chrome.menuItems === null) {
    menuWrapper.remove()
  } else {
    updateMenuItems(chrome.menuItems)
    wireDropdownToggle(menu, lists, () => {})
  }

  if (chrome.hasLists) {
    wireDropdownToggle(lists, menu, events.onListsOpen)
  } else {
    listsWrapper.remove()
  }

  if (chrome.hasRefresh) {
    refreshBtn.addEventListener("click", events.onRefresh)
  } else {
    refreshBtn.remove()
  }

  if (chrome.hasClose) {
    closeBtn.addEventListener("click", events.onClose)
  } else {
    closeBtn.remove()
  }

  const renderPinned = (pinned: boolean): void => {
    closeBtn.toggleAttribute("hidden", pinned)
    header.setAttribute("draggable", String(chrome.hasPin && !pinned))
    if (pinned) {
      shell.dataset.pinned = ""
    } else {
      delete shell.dataset.pinned
    }
  }

  if (chrome.hasPin) {
    pinBtn.addEventListener("click", events.onTogglePin)
  } else {
    pinBtn.remove()
    header.setAttribute("draggable", "false")
  }

  header.addEventListener("auxclick", (e: MouseEvent) => {
    if (e.button !== 1) return
    e.preventDefault()
    events.onClose()
  })

  header.addEventListener("wheel", (e: WheelEvent) => {
    if (e.deltaY === 0) return
    e.preventDefault()
    events.onHeaderWheel(e.deltaY)
  }, { passive: false })

  header.addEventListener("dblclick", () => {
    resolveScrollRegion(content).scrollTo({ top: 0, behavior: scrollBehaviour() })
  })

  shell.addEventListener("click", events.onFocus)
  shell.addEventListener("focusin", events.onFocus)
  content.addEventListener("scroll", events.onFocus, { passive: true })

  const destroy = (): void => {
    abortController.abort()
  }

  return Object.freeze({
    element: shell,
    getContentElement: (): HTMLElement => content,
    renderPinned,
    updateTitle,
    updateMenuItems,
    updateListItems,
    updateHeaderStatus,
    destroy,
  })
}

export type { ColumnShell, ShellChrome, ShellEvents }
export { createColumnShell, resolveScrollRegion }
