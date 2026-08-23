import { assertEquals, assertRejects, assertThrows } from "@std/assert"
import { DOMParser, Element as DenoDomElement } from "deno-dom"
import { createBrowserAssetLoader } from "../src/browser-asset-loader.ts"
import { ColumnLifecycleError } from "../src/errors.ts"

let ready = false
const setup = (): void => {
  if (ready) return
  ready = true
  const doc = new DOMParser().parseFromString("<!DOCTYPE html><html><head></head><body></body></html>", "text/html")
  if (!doc) throw new Error("parse failed")
  Reflect.set(globalThis, "document", doc)
  Reflect.set(globalThis, "HTMLElement", DenoDomElement)
  Reflect.set(globalThis, "DOMParser", DOMParser)
}
setup()

const TEMPLATES_HTML = `
  <template id="tpl-card"><article><h3 data-field="title"></h3><div data-partial="tpl-footer"></div></article></template>
  <template id="tpl-footer"><footer>shared</footer></template>
`

interface FetchStub {
  readonly calls: Array<string>
  readonly restore: () => void
}

const stubFetch = (html: string, ok = true): FetchStub => {
  const original = globalThis.fetch
  const calls: Array<string> = []
  Reflect.set(globalThis, "fetch", (input: string): Promise<Response> => {
    calls.push(input)
    return Promise.resolve(new Response(html, { status: ok ? 200 : 404 }))
  })
  return { calls, restore: () => Reflect.set(globalThis, "fetch", original) }
}

const headElements = (tag: string): ReadonlyArray<Element> => Array.from(document.head.querySelectorAll(tag))

const settleInjected = (tag: string): void => {
  for (const el of headElements(tag)) {
    const onload = Reflect.get(el, "onload")
    if (typeof onload === "function") onload()
  }
}

Deno.test("createBrowserAssetLoader - loadCss injects one stylesheet link per path", async () => {
  const loader = createBrowserAssetLoader()
  const first = loader.loadCss("/css/a.css")
  const second = loader.loadCss("/css/a.css")
  settleInjected("link")
  await Promise.all([first, second])
  assertEquals(headElements('link[href="/css/a.css"]').length, 1)
})

Deno.test("createBrowserAssetLoader - loadJs injects one module script per path", async () => {
  const loader = createBrowserAssetLoader()
  const first = loader.loadJs("/js/a.js")
  const second = loader.loadJs("/js/a.js")
  settleInjected("script")
  await Promise.all([first, second])
  const scripts = headElements('script[src="/js/a.js"]')
  assertEquals([scripts.length, scripts[0]?.getAttribute("type")], [1, "module"])
})

Deno.test("createBrowserAssetLoader - loadHtml registers templates and cloneTemplate clones them with partials filled", async () => {
  const fetchStub = stubFetch(TEMPLATES_HTML)
  try {
    const loader = createBrowserAssetLoader()
    await loader.loadHtml("/templates/cards.html")
    await loader.loadHtml("/templates/cards.html")
    const clone = loader.cloneTemplate("tpl-card")
    assertEquals(fetchStub.calls, ["/templates/cards.html"])
    assertEquals(clone.querySelector("[data-partial] footer")?.textContent, "shared")
  } finally {
    fetchStub.restore()
  }
})

Deno.test("createBrowserAssetLoader - cloneTemplate returns a fresh fragment each time", async () => {
  const fetchStub = stubFetch(TEMPLATES_HTML)
  try {
    const loader = createBrowserAssetLoader()
    await loader.loadHtml("/templates/cards.html")
    const first = loader.cloneTemplate("tpl-footer")
    const second = loader.cloneTemplate("tpl-footer")
    assertEquals(first.firstElementChild === second.firstElementChild, false)
  } finally {
    fetchStub.restore()
  }
})

Deno.test("createBrowserAssetLoader - cloneTemplate throws ColumnLifecycleError for an unregistered id", () => {
  const loader = createBrowserAssetLoader()
  assertThrows(() => loader.cloneTemplate("missing"), ColumnLifecycleError)
})

Deno.test("createBrowserAssetLoader - loadHtml rejects with ColumnLifecycleError when the fetch fails, and retries next time", async () => {
  const fetchStub = stubFetch("", false)
  try {
    const loader = createBrowserAssetLoader()
    await assertRejects(() => loader.loadHtml("/templates/missing.html"), ColumnLifecycleError)
    await assertRejects(() => loader.loadHtml("/templates/missing.html"), ColumnLifecycleError)
    assertEquals(fetchStub.calls.length, 2)
  } finally {
    fetchStub.restore()
  }
})
