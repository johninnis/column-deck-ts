/** Produces a fresh column shell fragment; the deck clones one per mounted column. */
type ShellTemplate = () => DocumentFragment

const DEFAULT_SHELL_HTML = `<section>
  <header draggable="true">
    <h2 data-title tabindex="-1"></h2>
    <nav>
      <button type="button" aria-label="Pin column" data-pin-btn>Pin</button>
      <div data-lists-wrapper>
        <button type="button" aria-label="Lists" aria-haspopup="menu" aria-expanded="false" data-lists-btn>Lists</button>
        <ul role="menu" data-lists-list></ul>
      </div>
      <div data-menu-wrapper>
        <button type="button" aria-label="Menu" aria-haspopup="menu" aria-expanded="false" data-menu-btn>Menu</button>
        <ul role="menu" data-menu-list></ul>
      </div>
      <button type="button" aria-label="Refresh column" data-refresh-btn>Refresh</button>
      <button type="button" aria-label="Close column" data-close-btn>Close</button>
    </nav>
  </header>
  <div data-content></div>
</section>`

/** The deck's default {@linkcode ShellTemplate}: text-labelled chrome carrying every element the shell requires. */
const defaultShellTemplate: ShellTemplate = () => {
  const host = document.createElement("div")
  host.innerHTML = DEFAULT_SHELL_HTML
  const fragment = document.createDocumentFragment()
  fragment.append(...Array.from(host.childNodes))
  return fragment
}

export { defaultShellTemplate }
export type { ShellTemplate }
