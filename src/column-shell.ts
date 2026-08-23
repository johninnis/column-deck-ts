import type { MenuItem } from "./column-base.ts"
import { ColumnLifecycleError } from "./errors.ts"
import type { ShellTemplate } from "./shell-template.ts"

const query = <T extends Element>(root: ParentNode, selector: string, type: { new (): T }): T => {
  const el = root.querySelector(selector)
  if (!(el instanceof type)) throw new ColumnLifecycleError(`Required element not found: ${selector}`)
  return el
}

/**
 * Resolves the element that actually scrolls within a column's content area.
 * Columns whose content is not itself scrollable (e.g. chat columns, where an
 * inner messages container scrolls) mark the scroller with `data-scroll-region`;
 * all other columns scroll the content element directly.
 */
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
  onItemClick: (item: MenuItem, btn: HTMLButtonElement) => void,
): void => {
  list.innerHTML = ""
  items.forEach((item) => {
    const li = document.createElement("li")
    if (item.separator) {
      li.dataset.separator = ""
      list.appendChild(li)
      return
    }
    li.setAttribute("role", "none")
    const btn = document.createElement("button")
    btn.setAttribute("role", "menuitem")
    btn.textContent = item.label ?? ""
    if (item.disabled) btn.disabled = true
    if (item.variant) btn.dataset.variant = item.variant
    if (item.selected) btn.dataset.selected = ""
    btn.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation()
      onItemClick(item, btn)
    })
    li.appendChild(btn)
    list.appendChild(li)
  })
}

interface ColumnShellParams {
  readonly shellTemplate: ShellTemplate
  readonly title: string
  readonly hasClose?: boolean
  readonly hasRefresh?: boolean
  readonly hasLists?: boolean
  readonly hasPin?: boolean
  readonly menuItems?: ReadonlyArray<MenuItem> | null
  readonly onClose?: () => void
  readonly onRefresh?: () => void
  readonly onMenuSelect?: (action: string) => void
  readonly onListSelect?: (action: string, btn: HTMLButtonElement | null) => void
  readonly onListsOpen?: () => void
  readonly onFocus?: () => void
  readonly onPinChange?: (pinned: boolean) => void
  readonly scrollContainer?: HTMLElement | null
}

interface ColumnShell {
  readonly element: HTMLElement
  readonly getContentElement: () => HTMLElement
  readonly setPinned: (value: boolean, options?: { readonly notify?: boolean }) => void
  readonly updateTitle: (newTitle: string) => void
  readonly updateMenuItems: (items: ReadonlyArray<MenuItem>) => void
  readonly updateListItems: (items: ReadonlyArray<MenuItem>) => void
  readonly updateHeaderStatus: (status: string | null) => void
  readonly destroy: () => void
}

const createColumnShell = ({
  shellTemplate,
  title,
  hasClose = true,
  hasRefresh = true,
  hasLists = false,
  hasPin = true,
  menuItems = null,
  onClose = () => {},
  onRefresh = () => {},
  onMenuSelect = () => {},
  onListSelect = () => {},
  onListsOpen = () => {},
  onFocus = () => {},
  onPinChange = () => {},
  scrollContainer = null,
}: ColumnShellParams): ColumnShell => {
  const fragment = shellTemplate()
  const firstChild = fragment.firstElementChild
  if (!(firstChild instanceof HTMLElement)) {
    throw new ColumnLifecycleError("shell template must have an HTMLElement root")
  }
  const shell = firstChild
  const abortController = new AbortController()

  const titleEl = query(shell, "[data-title]", HTMLElement)
  titleEl.textContent = title

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
      onMenuSelect(item.action ?? "")
    })

  const updateListItems = (items: ReadonlyArray<MenuItem>): void =>
    populateDropdown(lists.list, items, (item, btn) => onListSelect(item.action ?? "", btn))

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

  if (menuItems === null) {
    menuWrapper.remove()
  } else {
    updateMenuItems(menuItems)
    wireDropdownToggle(menu, lists, () => {})
  }

  if (hasLists) {
    wireDropdownToggle(lists, menu, onListsOpen)
  } else {
    listsWrapper.remove()
  }

  if (hasRefresh) {
    refreshBtn.addEventListener("click", onRefresh)
  } else {
    refreshBtn.remove()
  }

  if (hasClose) {
    closeBtn.addEventListener("click", onClose)
  } else {
    closeBtn.remove()
  }

  let pinned = false
  const setPinned = (value: boolean, { notify = true }: { readonly notify?: boolean } = {}): void => {
    pinned = value
    if (pinned) {
      shell.dataset.pinned = ""
      header.setAttribute("draggable", "false")
      if (closeBtn.parentNode) closeBtn.style.display = "none"
    } else {
      delete shell.dataset.pinned
      header.setAttribute("draggable", "true")
      if (closeBtn.parentNode) closeBtn.style.display = ""
    }
    if (notify) onPinChange(pinned)
  }

  if (hasPin) {
    pinBtn.addEventListener("click", () => setPinned(!pinned))
  } else {
    pinBtn.remove()
    header.setAttribute("draggable", "false")
  }

  header.addEventListener("auxclick", (e: MouseEvent) => {
    if (e.button === 1 && !pinned) {
      e.preventDefault()
      onClose()
    }
  })

  header.addEventListener("wheel", (e: WheelEvent) => {
    if (scrollContainer && e.deltaY !== 0) {
      e.preventDefault()
      scrollContainer.scrollLeft += e.deltaY
    }
  }, { passive: false })

  header.addEventListener("dblclick", () => {
    resolveScrollRegion(content).scrollTo({ top: 0, behavior: "smooth" })
  })

  shell.addEventListener("click", onFocus)
  shell.addEventListener("focusin", onFocus)
  content.addEventListener("scroll", onFocus, { passive: true })

  const destroy = (): void => {
    abortController.abort()
  }

  return Object.freeze({
    element: shell,
    getContentElement: (): HTMLElement => content,
    setPinned,
    updateTitle,
    updateMenuItems,
    updateListItems,
    updateHeaderStatus,
    destroy,
  })
}

export type { ColumnShell, ColumnShellParams }
export { createColumnShell, resolveScrollRegion }
