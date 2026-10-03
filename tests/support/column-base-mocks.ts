import type { AssetLoader } from "../../src/column-base.ts"
import type { ColumnHost } from "../../testing.ts"

export const createMockElement = (): HTMLElement => {
  const children: Array<unknown> = []
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

export interface MockAssetLoader {
  readonly loader: AssetLoader
  readonly calls: ReadonlyArray<{ method: string; path: string }>
}

export const createMockAssetLoader = (): MockAssetLoader => {
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
      cloneTemplate: (id: string) => ({ id } as unknown as DocumentFragment),
    },
    calls,
  }
}

export const createMockHost = (assetLoader: AssetLoader = createMockAssetLoader().loader): ColumnHost => ({
  entityId: null,
  launchColumn: () => Promise.resolve("col-1"),
  updateTitle: () => {},
  updateMenuItems: () => {},
  updateListItems: () => {},
  updateHeaderStatus: () => {},
  close: () => {},
  assetLoader,
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
