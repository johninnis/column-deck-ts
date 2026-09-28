import { assertEquals } from "@std/assert"
import { createColumnDefinition } from "../src/column-base.ts"
import {
  createMockElement,
  createMockOuterContext,
  installDocumentMock,
  removeDocumentMock,
} from "./support/column-base-mocks.ts"

Deno.test("createColumnDefinition - a column without a template starts with the deck's loading indicator", async () => {
  installDocumentMock()
  try {
    let seen = 0
    const el = createMockElement()
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: () => {
        seen = Reflect.get(el, "children").length
        return Promise.resolve()
      },
    })

    await def.render(el, createMockOuterContext())

    assertEquals(seen, 1)
  } finally {
    removeDocumentMock()
  }
})

Deno.test("createColumnDefinition - a declared template replaces the content before onRender", async () => {
  installDocumentMock()
  try {
    let seen: ReadonlyArray<unknown> = []
    const el = createMockElement()
    el.appendChild(document.createElement("p"))
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      template: "test-template",
      onRender: () => {
        seen = [...Reflect.get(el, "children")]
        return Promise.resolve()
      },
    })

    await def.render(el, createMockOuterContext())

    assertEquals(seen, [{ id: "test-template" }])
  } finally {
    removeDocumentMock()
  }
})

Deno.test("createColumnDefinition - refresh calls the refresh the render returned instead of re-rendering", async () => {
  installDocumentMock()
  try {
    const calls: Array<string> = []
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: () => {
        calls.push("render")
        return Promise.resolve({
          refresh: (): Promise<void> => {
            calls.push("own refresh")
            return Promise.resolve()
          },
        })
      },
    })

    const el = createMockElement()
    await def.render(el, createMockOuterContext())
    await def.refresh(el, createMockOuterContext())

    assertEquals(calls, ["render", "own refresh"])
  } finally {
    removeDocumentMock()
  }
})

Deno.test("createColumnDefinition - refresh calls a synchronous refresh the render returned", async () => {
  installDocumentMock()
  try {
    const calls: Array<string> = []
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: () =>
        Promise.resolve({
          refresh: (): void => {
            calls.push("own refresh")
          },
        }),
    })

    const el = createMockElement()
    await def.render(el, createMockOuterContext())
    await def.refresh(el, createMockOuterContext())

    assertEquals(calls, ["own refresh"])
  } finally {
    removeDocumentMock()
  }
})

Deno.test("createColumnDefinition - a re-render forgets the handlers the previous render returned", async () => {
  installDocumentMock()
  try {
    const calls: Array<string> = []
    let renders = 0
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: () => {
        renders++
        calls.push(`render ${renders}`)
        if (renders > 1) return Promise.resolve()
        return Promise.resolve({
          onMenuSelect: (): void => {
            calls.push("stale menu")
          },
        })
      },
    })

    const el = createMockElement()
    await def.render(el, createMockOuterContext())
    await def.render(el, createMockOuterContext())
    await def.onMenuSelect(el, "sort")

    assertEquals(calls, ["render 1", "render 2"])
  } finally {
    removeDocumentMock()
  }
})

Deno.test("createColumnDefinition - a render overtaken by a newer render does not install its handlers", async () => {
  installDocumentMock()
  try {
    const calls: Array<string> = []
    const { promise: firstGate, resolve: openFirst } = Promise.withResolvers<void>()
    let renders = 0
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: async () => {
        renders++
        const mine = renders
        calls.push(`render ${mine}`)
        if (mine === 1) await firstGate
        return {
          refresh: (): void => {
            calls.push(`refresh from render ${mine}`)
          },
        }
      },
    })

    const el = createMockElement()
    const first = def.render(el, createMockOuterContext())
    await def.render(el, createMockOuterContext())
    openFirst()
    await first
    await def.refresh(el, createMockOuterContext())

    assertEquals(calls, ["render 1", "render 2", "refresh from render 2"])
  } finally {
    removeDocumentMock()
  }
})

Deno.test("createColumnDefinition - a destroyed column keeps no handlers", async () => {
  installDocumentMock()
  try {
    const calls: Array<string> = []
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: () => {
        calls.push("render")
        return Promise.resolve({
          refresh: (): void => {
            calls.push("stale refresh")
          },
        })
      },
    })

    const el = createMockElement()
    await def.render(el, createMockOuterContext())
    def.onDestroy(el)
    await def.refresh(el, createMockOuterContext())

    assertEquals(calls, ["render", "render"])
  } finally {
    removeDocumentMock()
  }
})

Deno.test("createColumnDefinition - a render's signal aborts when the next render starts", async () => {
  installDocumentMock()
  try {
    const signals: Array<AbortSignal> = []
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: (_el, { signal }) => {
        signals.push(signal)
        return Promise.resolve()
      },
    })

    const el = createMockElement()
    await def.render(el, createMockOuterContext())
    await def.render(el, createMockOuterContext())

    assertEquals(signals.map((signal) => signal.aborted), [true, false])
  } finally {
    removeDocumentMock()
  }
})

Deno.test("createColumnDefinition - a render's signal aborts when the column closes", async () => {
  installDocumentMock()
  try {
    const signals: Array<AbortSignal> = []
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: (_el, { signal }) => {
        signals.push(signal)
        return Promise.resolve()
      },
    })

    const el = createMockElement()
    await def.render(el, createMockOuterContext())
    def.onDestroy(el)

    assertEquals(signals.map((signal) => signal.aborted), [true])
  } finally {
    removeDocumentMock()
  }
})
