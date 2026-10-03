import { assertEquals } from "@std/assert"
import { createColumnDefinition } from "../src/column-base.ts"
import { openColumn } from "../testing.ts"
import {
  createMockAssetLoader,
  createMockElement,
  createMockHost,
  installDocumentMock,
  removeDocumentMock,
} from "./support/column-base-mocks.ts"

const withDocument = async (test: () => Promise<void>): Promise<void> => {
  installDocumentMock()
  try {
    await test()
  } finally {
    removeDocumentMock()
  }
}

Deno.test("openColumn - a column without a template starts with the deck's loading indicator", () =>
  withDocument(async () => {
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

    await openColumn(def, createMockHost(), el)

    assertEquals(seen, 1)
  }))

Deno.test("openColumn - a declared template replaces the content before onRender", () =>
  withDocument(async () => {
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

    await openColumn(def, createMockHost(), el)

    assertEquals(seen, [{ id: "test-template" }])
  }))

Deno.test("openColumn - refresh calls the refresh the render returned instead of re-rendering", () =>
  withDocument(async () => {
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

    const column = await openColumn(def, createMockHost(), createMockElement())
    await column.refresh()

    assertEquals(calls, ["render", "own refresh"])
  }))

Deno.test("openColumn - refresh calls a synchronous refresh the render returned", () =>
  withDocument(async () => {
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

    const column = await openColumn(def, createMockHost(), createMockElement())
    await column.refresh()

    assertEquals(calls, ["own refresh"])
  }))

Deno.test("openColumn - a re-render forgets the handlers the previous render returned", () =>
  withDocument(async () => {
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

    const column = await openColumn(def, createMockHost(), createMockElement())
    await column.render()
    await column.onMenuSelect("sort")

    assertEquals(calls, ["render 1", "render 2"])
  }))

Deno.test("openColumn - a render overtaken by a newer render does not install its handlers", () =>
  withDocument(async () => {
    const calls: Array<string> = []
    const { promise: gate, resolve: openGate } = Promise.withResolvers<void>()
    const { promise: secondStarted, resolve: markSecondStarted } = Promise.withResolvers<void>()
    let renders = 0
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: async () => {
        renders++
        const mine = renders
        calls.push(`render ${mine}`)
        if (mine === 2) {
          markSecondStarted()
          await gate
        }
        return {
          refresh: (): void => {
            calls.push(`refresh from render ${mine}`)
          },
        }
      },
    })

    const column = await openColumn(def, createMockHost(), createMockElement())
    const second = column.render()
    await secondStarted
    await column.render()
    openGate()
    await second
    await column.refresh()

    assertEquals(calls, ["render 1", "render 2", "render 3", "refresh from render 3"])
  }))

Deno.test("openColumn - a destroyed column keeps no handlers", () =>
  withDocument(async () => {
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

    const column = await openColumn(def, createMockHost(), createMockElement())
    column.destroy()
    await column.refresh()

    assertEquals(calls, ["render", "render"])
  }))

Deno.test("openColumn - a render's signal aborts when the next render starts", () =>
  withDocument(async () => {
    const signals: Array<AbortSignal> = []
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: (_el, { signal }) => {
        signals.push(signal)
        return Promise.resolve()
      },
    })

    const column = await openColumn(def, createMockHost(), createMockElement())
    await column.render()

    assertEquals(signals.map((signal) => signal.aborted), [true, false])
  }))

Deno.test("openColumn - a render's signal aborts when the column closes", () =>
  withDocument(async () => {
    const signals: Array<AbortSignal> = []
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: (_el, { signal }) => {
        signals.push(signal)
        return Promise.resolve()
      },
    })

    const column = await openColumn(def, createMockHost(), createMockElement())
    column.destroy()

    assertEquals(signals.map((signal) => signal.aborted), [true])
  }))

Deno.test("openColumn - a teardown registered after the column closed runs at once", () =>
  withDocument(async () => {
    const { promise: gate, resolve: openGate } = Promise.withResolvers<void>()
    let tornDown = 0
    let finished: Promise<void> = Promise.resolve()
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: (_el, { onTeardown }) => {
        finished = gate.then(() =>
          onTeardown(() => {
            tornDown++
          })
        )
        return Promise.resolve()
      },
    })

    const column = await openColumn(def, createMockHost(), createMockElement())
    column.destroy()
    openGate()
    await finished

    assertEquals(tornDown, 1)
  }))

Deno.test("openColumn - an overtaken render's late teardown runs at once, not with the newer render", () =>
  withDocument(async () => {
    const { promise: gate, resolve: openGate } = Promise.withResolvers<void>()
    const tornDown: Array<string> = []
    let renders = 0
    let lateRegistration: Promise<void> = Promise.resolve()
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: (_el, { onTeardown }) => {
        renders++
        if (renders === 1) {
          lateRegistration = gate.then(() => onTeardown(() => tornDown.push("first")))
        }
        return Promise.resolve()
      },
    })

    const column = await openColumn(def, createMockHost(), createMockElement())
    await column.render()
    openGate()
    await lateRegistration
    const beforeClose = [...tornDown]
    column.destroy()

    assertEquals([beforeClose, tornDown], [["first"], ["first"]])
  }))

Deno.test("openColumn - a column closed while its assets load never renders", () =>
  withDocument(async () => {
    const { promise: cssGate, resolve: releaseCss } = Promise.withResolvers<void>()
    let cssLoads = 0
    const loader = {
      ...createMockAssetLoader().loader,
      loadCss: (): Promise<void> => ++cssLoads === 1 ? Promise.resolve() : cssGate,
    }
    let renders = 0
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      css: "slow.css",
      onRender: () => {
        renders++
        return Promise.resolve()
      },
    })

    const column = await openColumn(def, createMockHost(loader), createMockElement())
    const rerender = column.render()
    column.destroy()
    releaseCss()
    await rerender

    assertEquals(renders, 1)
  }))

Deno.test("openColumn - taking a slot's next signal aborts the signal it gave before", () =>
  withDocument(async () => {
    const taken: Array<AbortSignal> = []
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: (_el, { signalSlot }) => {
        const slot = signalSlot()
        taken.push(slot.next(), slot.next())
        return Promise.resolve()
      },
    })

    await openColumn(def, createMockHost(), createMockElement())

    assertEquals(taken.map((signal) => signal.aborted), [true, false])
  }))

Deno.test("openColumn - closing a column aborts the signal its slot holds", () =>
  withDocument(async () => {
    const taken: Array<AbortSignal> = []
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: (_el, { signalSlot }) => {
        taken.push(signalSlot().next())
        return Promise.resolve()
      },
    })

    const column = await openColumn(def, createMockHost(), createMockElement())
    column.destroy()

    assertEquals(taken.map((signal) => signal.aborted), [true])
  }))

Deno.test("openColumn - aborting a slot aborts the signal it holds", () =>
  withDocument(async () => {
    const taken: Array<AbortSignal> = []
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: (_el, { signalSlot }) => {
        const slot = signalSlot()
        taken.push(slot.next())
        slot.abort()
        return Promise.resolve()
      },
    })

    await openColumn(def, createMockHost(), createMockElement())

    assertEquals(taken.map((signal) => signal.aborted), [true])
  }))

Deno.test("openColumn - a slot created inside a refresh is aborted when the column closes", () =>
  withDocument(async () => {
    const taken: Array<AbortSignal> = []
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: (_el, { signalSlot }) =>
        Promise.resolve({
          refresh: (): void => {
            taken.push(signalSlot().next())
          },
        }),
    })

    const column = await openColumn(def, createMockHost(), createMockElement())
    await column.refresh()
    await column.refresh()
    column.destroy()

    assertEquals(taken.map((signal) => signal.aborted), [true, true])
  }))

Deno.test("openColumn - a slot adds no listener to the render's signal however often it is replaced", () =>
  withDocument(async () => {
    let added = 0
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: (_el, { signal, signalSlot }) => {
        const addEventListener = signal.addEventListener.bind(signal)
        Object.defineProperty(signal, "addEventListener", {
          value: (...args: Parameters<AbortSignal["addEventListener"]>): void => {
            added++
            addEventListener(...args)
          },
        })
        const slot = signalSlot()
        for (let i = 0; i < 5; i++) slot.next()
        return Promise.resolve()
      },
    })

    await openColumn(def, createMockHost(), createMockElement())

    assertEquals(added, 0)
  }))

Deno.test("openColumn - two columns of one definition keep separate renders", () =>
  withDocument(async () => {
    const refreshed: Array<string> = []
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      singleton: false,
      onRender: (_el, { entityId }) =>
        Promise.resolve({
          refresh: (): void => {
            refreshed.push(entityId ?? "none")
          },
        }),
    })

    const first = await openColumn(def, { ...createMockHost(), entityId: "one" }, createMockElement())
    const second = await openColumn(def, { ...createMockHost(), entityId: "two" }, createMockElement())
    first.destroy()
    await second.refresh()

    assertEquals(refreshed, ["two"])
  }))
