# 0002. Replaceable work uses a signal slot built on AbortSignal.any

## Status

Accepted

## Context

Some work a render starts is replaced rather than accumulated: the query behind a list that its refresh reloads, a search re-run as the user types. Starting the next one must stop the previous one, and whatever is running must still stop when the render ends.

The 0.5.1 `handleSlot()` held one `{ abort() }` handle and registered a teardown per slot. That kept a bespoke handle type in the public surface, and a column that created a slot inside its refresh added a teardown to the render every time.

Deriving each replacement signal from the render's signal by hand (`signal.addEventListener("abort", …)` per replacement) would add a listener to the render's signal on every call.

## Decision

`context.signalSlot()` returns a `SignalSlot` with `next()` and `abort()`. `next()` aborts the signal handed out before and returns `AbortSignal.any([renderSignal, fresh.signal])` from a fresh controller, so the returned signal aborts on the next `next()`, on `abort()`, or when the render ends. `abort()` aborts the current signal without starting anything new.

`AbortSignal.any` tracks dependent signals weakly and adds no listener to the source signal, so neither `next()` nor creating a slot inside a refresh grows anything on the render.

## Consequences

The package needs `AbortSignal.any` (Chrome 116, Firefox 124, Safari 17.4, Deno 1.39).

Work passed to a slot must accept a signal, or register its own stop on the signal it is given: `slot.next().addEventListener("abort", () => handle.abort())`.

A test asserts that `next()` adds no listener to the render's signal; replacing `AbortSignal.any` with manual listener wiring fails it.
