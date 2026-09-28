import { assert, assertEquals } from "@std/assert"
import { createColumnDefinition } from "../src/column-base.ts"
import type { ListSelection } from "../src/column-base.ts"
import {
  createMockAssetLoader,
  createMockElement,
  createMockOuterContext,
  installDocumentMock,
  removeDocumentMock,
} from "./support/column-base-mocks.ts"

Deno.test("createColumnDefinition - returns correct type and label", () => {
  const def = createColumnDefinition({
    type: "test-col",
    label: "Test Column",
    onRender: () => Promise.resolve(),
  })

  assertEquals(def.type, "test-col")
  assertEquals(def.label, "Test Column")
})

Deno.test("createColumnDefinition - singleton defaults to true", () => {
  const def = createColumnDefinition({
    type: "test",
    label: "Test",
    onRender: () => Promise.resolve(),
  })

  assertEquals(def.singleton, true)
})

Deno.test("createColumnDefinition - singleton can be set to false", () => {
  const def = createColumnDefinition({
    type: "test",
    label: "Test",
    singleton: false,
    onRender: () => Promise.resolve(),
  })

  assertEquals(def.singleton, false)
})

Deno.test("createColumnDefinition - hasClose defaults to true", () => {
  const def = createColumnDefinition({
    type: "test",
    label: "Test",
    onRender: () => Promise.resolve(),
  })

  assertEquals(def.hasClose, true)
})

Deno.test("createColumnDefinition - hasRefresh defaults to true", () => {
  const def = createColumnDefinition({
    type: "test",
    label: "Test",
    onRender: () => Promise.resolve(),
  })

  assertEquals(def.hasRefresh, true)
})

Deno.test("createColumnDefinition - hasLists defaults to false", () => {
  const def = createColumnDefinition({
    type: "test",
    label: "Test",
    onRender: () => Promise.resolve(),
  })

  assertEquals(def.hasLists, false)
})

Deno.test("createColumnDefinition - getTitle returns label by default", () => {
  const def = createColumnDefinition({
    type: "test",
    label: "My Label",
    onRender: () => Promise.resolve(),
  })

  assertEquals(def.getTitle(), "My Label")
})

Deno.test("createColumnDefinition - getTitle uses custom function when provided", () => {
  const def = createColumnDefinition({
    type: "test",
    label: "Default",
    getTitle: (entityId) => entityId ? `Profile: ${entityId}` : "Default",
    onRender: () => Promise.resolve(),
  })

  assertEquals(def.getTitle("abc123"), "Profile: abc123")
  assertEquals(def.getTitle(), "Default")
})

Deno.test("createColumnDefinition - menuItems defaults to null", () => {
  const def = createColumnDefinition({
    type: "test",
    label: "Test",
    onRender: () => Promise.resolve(),
  })

  assertEquals(def.menuItems, null)
})

Deno.test("createColumnDefinition - loadAssets calls assetLoader methods for css, html, js", async () => {
  const { loader, calls } = createMockAssetLoader()
  const def = createColumnDefinition({
    type: "test",
    label: "Test",
    css: "styles/test.css",
    html: "templates/test.html",
    js: "scripts/test.js",
    onRender: () => Promise.resolve(),
  })

  await def.loadAssets(loader)

  assertEquals(calls.length, 3)
  assert(calls.some((c) => c.method === "loadCss" && c.path === "styles/test.css"))
  assert(calls.some((c) => c.method === "loadHtml" && c.path === "templates/test.html"))
  assert(calls.some((c) => c.method === "loadJs" && c.path === "scripts/test.js"))
})

Deno.test("createColumnDefinition - loadAssets handles array of assets", async () => {
  const { loader, calls } = createMockAssetLoader()
  const def = createColumnDefinition({
    type: "test",
    label: "Test",
    css: ["a.css", "b.css"],
    html: ["a.html"],
    onRender: () => Promise.resolve(),
  })

  await def.loadAssets(loader)

  assertEquals(calls.filter((c) => c.method === "loadCss").length, 2)
  assertEquals(calls.filter((c) => c.method === "loadHtml").length, 1)
})

Deno.test("createColumnDefinition - loadAssets skips null assets", async () => {
  const { loader, calls } = createMockAssetLoader()
  const def = createColumnDefinition({
    type: "test",
    label: "Test",
    onRender: () => Promise.resolve(),
  })

  await def.loadAssets(loader)

  assertEquals(calls.length, 0)
})

Deno.test("createColumnDefinition - render calls onRender", async () => {
  installDocumentMock()
  try {
    let renderCalled = false
    const { loader } = createMockAssetLoader()
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: () => {
        renderCalled = true
        return Promise.resolve()
      },
    })

    await def.loadAssets(loader)
    await def.render(createMockElement(), createMockOuterContext())

    assertEquals(renderCalled, true)
  } finally {
    removeDocumentMock()
  }
})

Deno.test("createColumnDefinition - onDestroy runs the render's teardowns", async () => {
  installDocumentMock()
  try {
    let tornDown = false
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: (_el, context) => {
        context.onTeardown(() => {
          tornDown = true
        })
        return Promise.resolve()
      },
    })

    const el = createMockElement()
    await def.render(el, createMockOuterContext())
    def.onDestroy(el)

    assertEquals(tornDown, true)
  } finally {
    removeDocumentMock()
  }
})

Deno.test("createColumnDefinition - re-render runs the previous render's teardowns first", async () => {
  installDocumentMock()
  try {
    const tornDown: Array<number> = []
    let renderCount = 0
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: (_el, context) => {
        renderCount++
        const mountNumber = renderCount
        context.onTeardown(() => tornDown.push(mountNumber))
        return Promise.resolve()
      },
    })

    const el = createMockElement()
    const context = createMockOuterContext()
    await def.render(el, context)
    assertEquals(tornDown, [])
    await def.render(el, context)
    assertEquals(tornDown, [1])
    def.onDestroy(el)
    assertEquals(tornDown, [1, 2])
  } finally {
    removeDocumentMock()
  }
})

Deno.test("createColumnDefinition - refresh re-renders when onRender returned no refresh", async () => {
  installDocumentMock()
  try {
    let renderCount = 0
    const { loader } = createMockAssetLoader()
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: () => {
        renderCount++
        return Promise.resolve()
      },
    })

    await def.loadAssets(loader)
    const el = createMockElement()
    await def.render(el, createMockOuterContext())
    await def.refresh(el, createMockOuterContext())

    assertEquals(renderCount, 2)
  } finally {
    removeDocumentMock()
  }
})

Deno.test("createColumnDefinition - a menu selection reaches the handler the render returned", async () => {
  installDocumentMock()
  try {
    let received: string | null = null
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: () =>
        Promise.resolve({
          onMenuSelect: (action: string): void => {
            received = action
          },
        }),
    })

    const el = createMockElement()
    await def.render(el, createMockOuterContext())
    await def.onMenuSelect(el, "sort")

    assertEquals(received, "sort")
  } finally {
    removeDocumentMock()
  }
})

Deno.test("createColumnDefinition - a list selection reaches the handler the render returned", async () => {
  installDocumentMock()
  try {
    let received: string | null = null
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: () =>
        Promise.resolve({
          onListSelect: ({ action }: ListSelection): void => {
            received = action
          },
        }),
    })

    const el = createMockElement()
    await def.render(el, createMockOuterContext())
    await def.onListSelect(el, { action: "add", btn: null })

    assertEquals(received, "add")
  } finally {
    removeDocumentMock()
  }
})

Deno.test("createColumnDefinition - returned object is frozen", () => {
  const def = createColumnDefinition({
    type: "test",
    label: "Test",
    onRender: () => Promise.resolve(),
  })

  assertEquals(Object.isFrozen(def), true)
})

Deno.test("createColumnDefinition - hasPin defaults to true and can be disabled", () => {
  const withPin = createColumnDefinition({ type: "a", label: "A", onRender: () => Promise.resolve() })
  const withoutPin = createColumnDefinition({ type: "b", label: "B", hasPin: false, onRender: () => Promise.resolve() })
  assertEquals(withPin.hasPin, true)
  assertEquals(withoutPin.hasPin, false)
})

Deno.test("createColumnDefinition - opening the list selector calls the handler the render returned", async () => {
  installDocumentMock()
  try {
    let opened = false
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: () =>
        Promise.resolve({
          onListsOpen: (): void => {
            opened = true
          },
        }),
    })

    const el = createMockElement()
    await def.render(el, createMockOuterContext())
    await def.onListsOpen(el)

    assertEquals(opened, true)
  } finally {
    removeDocumentMock()
  }
})

Deno.test("createColumnDefinition - a header control whose handler the render did not return does nothing", async () => {
  installDocumentMock()
  try {
    const def = createColumnDefinition({ type: "test", label: "Test", onRender: () => Promise.resolve({}) })

    const el = createMockElement()
    await def.render(el, createMockOuterContext())
    await def.onMenuSelect(el, "sort")
    await def.onListSelect(el, { action: "add", btn: null })
    await def.onListsOpen(el)

    assertEquals(Reflect.get(el, "children").length, 1)
  } finally {
    removeDocumentMock()
  }
})
