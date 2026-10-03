import { assertEquals } from "@std/assert"
import { popLast } from "../src/immutable-list.ts"

Deno.test("popLast splits off the last element and leaves the list untouched", () => {
  const list = [1, 2, 3]
  assertEquals([popLast(list), list], [{ rest: [1, 2], last: 3 }, [1, 2, 3]])
})

Deno.test("popLast returns null for an empty list", () => {
  assertEquals(popLast([]), null)
})
