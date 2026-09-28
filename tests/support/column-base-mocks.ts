import type { AssetLoader, OuterColumnContext } from "../../src/column-base.ts"

export const createMockElement = (): HTMLElement => {
  const children: Array<unknown> = []
  // deno-lint-ignore innis/no-type-assertions
  return {
    querySelector: () => null,
    appendChild: (child: unknown) => {
      children.push(child)
    },
    setAttribute: () => {},
    remove: () => {},
    replaceChildren: (...nodes: Array<unknown>) => {
      children.splice(0, children.length, ...nodes)
    },
    children,
  } as unknown as HTMLElement
}

export const createMockAssetLoader = (): {
  loader: AssetLoader
  calls: ReadonlyArray<{ method: string; path: string }>
} => {
  const calls: Array<{ method: string; path: string }> = []
  return {
    loader: {
      loadCss: (path: string) => {
        calls.push({ method: "loadCss", path })
        return Promise.resolve()
      },
      loadHtml: (path: string) => {
        calls.push({ method: "loadHtml", path })
        return Promise.resolve()
      },
      loadJs: (path: string) => {
        calls.push({ method: "loadJs", path })
        return Promise.resolve()
      },
      // deno-lint-ignore innis/no-type-assertions
      cloneTemplate: (id: string) => ({ id } as unknown as DocumentFragment),
    },
    calls,
  }
}

export const createMockOuterContext = (): OuterColumnContext => ({
  entityId: null,
  launchColumn: () => Promise.resolve("col-1"),
  updateTitle: () => {},
  updateMenuItems: () => {},
  updateListItems: () => {},
  updateHeaderStatus: () => {},
  close: () => {},
  // deno-lint-ignore innis/no-type-assertions
  cloneTemplate: (id: string) => ({ id } as unknown as DocumentFragment),
  services: {},
})

export const installDocumentMock = (): void => {
  Reflect.set(globalThis, "document", {
    createElement: (tag: string) => ({
      tagName: tag,
      setAttribute: () => {},
      appendChild: () => {},
      querySelector: () => null,
      remove: () => {},
      textContent: "",
      get innerHTML(): string {
        return ""
      },
    }),
    querySelector: () => null,
  })
}

export const removeDocumentMock = (): void => {
  Reflect.deleteProperty(globalThis, "document")
}
