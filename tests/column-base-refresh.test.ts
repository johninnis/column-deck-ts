import { assertEquals } from "@std/assert"
import { createColumnDefinition } from "../src/column-base.ts"
import {
  createMockElement,
  createMockOuterContext,
  installDocumentMock,
  removeDocumentMock,
} from "./support/column-base-mocks.ts"

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

Deno.test("createColumnDefinition - refresh calls the refresh onRender returned instead of re-rendering", async () => {
  installDocumentMock()
  try {
    const calls: Array<string> = []
    const def = createColumnDefinition({
      type: "test",
      label: "Test",
      onRender: () => {
        calls.push("render")
        return Promise.resolve(() => {
          calls.push("own refresh")
          return Promise.resolve()
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

Deno.test("createColumnDefinition - a re-render forgets the refresh the previous render returned", async () => {
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
        return Promise.resolve(() => {
          calls.push("stale refresh")
          return Promise.resolve()
        })
      },
    })

    const el = createMockElement()
    await def.render(el, createMockOuterContext())
    await def.render(el, createMockOuterContext())
    await def.refresh(el, createMockOuterContext())

    assertEquals(calls, ["render 1", "render 2", "render 3"])
  } finally {
    removeDocumentMock()
  }
})
