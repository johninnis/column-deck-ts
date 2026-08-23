/** Splits a list into its last element and the rest; `null` for an empty list. */
const popLast = <T>(list: ReadonlyArray<T>): { readonly rest: ReadonlyArray<T>; readonly last: T } | null => {
  const last = list[list.length - 1]
  return last === undefined ? null : { rest: list.slice(0, -1), last }
}

export { popLast }
