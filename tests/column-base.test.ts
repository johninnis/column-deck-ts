import { assertEquals } from "@std/assert"
import { createColumnDefinition } from "../src/column-base.ts"
import type { ListSelection } from "../src/column-base.ts"
import { openColumn } from "../testing.ts"
import {
  createMockAssetLoader,
  createMockElement,
  createMockHost,
  installDocumentMock,
  removeDocumentMock,
} from "./support/column-base-mocks.ts"

Deno.test("createColumnDefinition - exposes its type and label", () => {
  const def = createColumnDefinition({ type: "test-col", label: "Test Column", onRender: () => Promise.resolve() })

  assertEquals([def.type, def.label], ["test-col", "Test Column"])
})

Deno.test("createColumnDefinition - returned object is frozen", () => {
  const def = createColumnDefinition({ type: "test", label: "Test", onRender: () => Promise.resolve() })

  assertEquals(Object.isFrozen(def), true)
})

Deno.test("openColumn - loads the column's css, html and js before it renders", async () => {
  installDocumentMock()
  try {
    const { loader, calls } = createMockAssetLoader()
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      css: "styles/test.css",
      html: ["templates/a.html", "templates/b.html"],
      js: "scripts/test.js",
      onRender: () => Promise.resolve(),
    })

    await openColumn(def, createMockHost(loader), createMockElement())

    assertEquals(calls.map((call) => call.path), [
      "styles/test.css",
      "templates/a.html",
      "templates/b.html",
      "scripts/test.js",
    ])
  } finally {
    removeDocumentMock()
  }
})

Deno.test("openColumn - a column without assets loads nothing", async () => {
  installDocumentMock()
  try {
    const { loader, calls } = createMockAssetLoader()
    const def = createColumnDefinition({ type: "test", label: "Test", onRender: () => Promise.resolve() })

    await openColumn(def, createMockHost(loader), createMockElement())

    assertEquals(calls.length, 0)
  } finally {
    removeDocumentMock()
  }
})

Deno.test("openColumn - calls onRender with the host's entity", async () => {
  installDocumentMock()
  try {
    let seen: string | null = null
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: (_el, { entityId }) => {
        seen = entityId
        return Promise.resolve()
      },
    })

    await openColumn(def, { ...createMockHost(), entityId: "abc" }, createMockElement())

    assertEquals(seen, "abc")
  } finally {
    removeDocumentMock()
  }
})

Deno.test("openColumn - destroying the column runs the render's teardowns", async () => {
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

    const column = await openColumn(def, createMockHost(), createMockElement())
    column.destroy()

    assertEquals(tornDown, true)
  } finally {
    removeDocumentMock()
  }
})

Deno.test("openColumn - a re-render runs the previous render's teardowns first", async () => {
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

    const column = await openColumn(def, createMockHost(), createMockElement())
    const afterFirst = [...tornDown]
    await column.render()
    const afterSecond = [...tornDown]
    column.destroy()

    assertEquals([afterFirst, afterSecond, tornDown], [[], [1], [1, 2]])
  } finally {
    removeDocumentMock()
  }
})

Deno.test("openColumn - a teardown registered twice runs twice", async () => {
  installDocumentMock()
  try {
    let runs = 0
    const teardown = (): void => {
      runs++
    }
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: (_el, { onTeardown }) => {
        onTeardown(teardown)
        onTeardown(teardown)
        return Promise.resolve()
      },
    })

    const column = await openColumn(def, createMockHost(), createMockElement())
    column.destroy()

    assertEquals(runs, 2)
  } finally {
    removeDocumentMock()
  }
})

Deno.test("openColumn - refresh re-renders, reloading assets, when onRender returned no refresh", async () => {
  installDocumentMock()
  try {
    let renderCount = 0
    const { loader, calls } = createMockAssetLoader()
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      css: "a.css",
      onRender: () => {
        renderCount++
        return Promise.resolve()
      },
    })

    const column = await openColumn(def, createMockHost(loader), createMockElement())
    await column.refresh()

    assertEquals([renderCount, calls.length], [2, 2])
  } finally {
    removeDocumentMock()
  }
})

Deno.test("openColumn - a menu selection reaches the handler the render returned", async () => {
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

    const column = await openColumn(def, createMockHost(), createMockElement())
    await column.onMenuSelect("sort")

    assertEquals(received, "sort")
  } finally {
    removeDocumentMock()
  }
})

Deno.test("openColumn - a list selection reaches the handler the render returned", async () => {
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

    const column = await openColumn(def, createMockHost(), createMockElement())
    await column.onListSelect({ action: "add", btn: null })

    assertEquals(received, "add")
  } finally {
    removeDocumentMock()
  }
})

Deno.test("openColumn - opening the list selector calls the handler the render returned", async () => {
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

    const column = await openColumn(def, createMockHost(), createMockElement())
    await column.onListsOpen()

    assertEquals(opened, true)
  } finally {
    removeDocumentMock()
  }
})

Deno.test("openColumn - a header control whose handler the render did not return does nothing", async () => {
  installDocumentMock()
  try {
    const def = createColumnDefinition({ type: "test", label: "Test", onRender: () => Promise.resolve({}) })

    const el = createMockElement()
    const column = await openColumn(def, createMockHost(), el)
    await column.onMenuSelect("sort")
    await column.onListSelect({ action: "add", btn: null })
    await column.onListsOpen()

    assertEquals(Reflect.get(el, "children").length, 1)
  } finally {
    removeDocumentMock()
  }
})
