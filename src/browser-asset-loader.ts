import type { AssetLoader } from "./column-base.ts"
import { ColumnLifecycleError } from "./errors.ts"

const cloneContent = (template: HTMLTemplateElement): ReadonlyArray<ChildNode> =>
  Array.from(template.content.cloneNode(true).childNodes)

/**
 * The browser implementation of {@linkcode AssetLoader}, and the deck's default: injects each CSS
 * and JS path into `document.head` once, registers every `<template>` in a fetched HTML file by id,
 * and clones registered templates — filling any `[data-partial="<id>"]` element inside the clone
 * with a clone of template `<id>`.
 */
export const createBrowserAssetLoader = (): AssetLoader => {
  const pending = new Map<string, Promise<void>>()
  const templates = new Map<string, HTMLTemplateElement>()

  const loadOnce = (path: string, load: () => Promise<void>): Promise<void> => {
    const existing = pending.get(path)
    if (existing) return existing
    const promise = load().catch((error: unknown) => {
      pending.delete(path)
      throw error
    })
    pending.set(path, promise)
    return promise
  }

  const loadCss = (path: string): Promise<void> =>
    loadOnce(path, () =>
      new Promise((resolve) => {
        const link = document.createElement("link")
        link.setAttribute("rel", "stylesheet")
        link.setAttribute("href", path)
        link.onload = (): void => resolve()
        link.onerror = (): void => resolve()
        document.head.appendChild(link)
      }))

  const loadJs = (path: string): Promise<void> =>
    loadOnce(path, () =>
      new Promise((resolve, reject) => {
        const script = document.createElement("script")
        script.setAttribute("type", "module")
        script.setAttribute("src", path)
        script.onload = (): void => resolve()
        script.onerror = (): void => reject(new ColumnLifecycleError(`Failed to load JS: ${path}`))
        document.head.appendChild(script)
      }))

  const loadHtml = (path: string): Promise<void> =>
    loadOnce(path, async () => {
      const response = await fetch(path)
      if (!response.ok) throw new ColumnLifecycleError(`Failed to load HTML: ${path}`)
      const doc = new DOMParser().parseFromString(await response.text(), "text/html")
      doc.querySelectorAll("template").forEach((template) => templates.set(template.id, template))
    })

  const cloneTemplate = (id: string): DocumentFragment => {
    const template = templates.get(id)
    if (!template) throw new ColumnLifecycleError(`Template not found: ${id}`)
    const fragment = document.createDocumentFragment()
    fragment.append(...cloneContent(template))
    fragment.querySelectorAll("[data-partial]").forEach((host) => {
      const partial = host instanceof HTMLElement ? templates.get(host.dataset.partial ?? "") : undefined
      if (partial) host.append(...cloneContent(partial))
    })
    return fragment
  }

  return Object.freeze({ loadCss, loadJs, loadHtml, cloneTemplate })
}
