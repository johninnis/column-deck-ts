# 0001. A render's lifetime is one AbortSignal

## Status

Accepted

## Context

A column's render starts work that must stop when the render ends: subscriptions, event listeners, network queries, timers. The render ends when the column re-renders or closes. Renders are asynchronous, so a render can still be running when it ends, and code after its first `await` can go on registering work after the fact.

Up to 0.5 the deck offered four ways to tie work to a render (`onTeardown`, `trackHandle`, `handleSlot`, `signal`), kept teardowns in a list keyed by the column's content element, treated the render's `AbortController` as one more entry in that list, and tracked whether a render was still current twice: a generation counter in the definition and a shell-identity check in the renderer. That shape had a verified leak. A render that awaited and then called `onTeardown` after the column closed registered into a fresh list that nothing would ever run. A render overtaken by a newer one registered its late teardowns into the newer render's list, so they ran at the wrong time. Each `handleSlot()` added a teardown, so a column that created one per refresh grew its list without bound.

The platform already has a primitive for "this piece of work has ended": `AbortSignal`. Browsers and Deno accept it across `addEventListener`, `fetch`, streams and timers-by-convention, and it answers "has it already ended?" through `aborted`.

## Decision

Each render owns exactly one `AbortController`. Its signal is the render's lifetime:

- `context.signal` is that signal.
- `context.onTeardown(fn)` runs `fn` at once when the signal has already aborted, and otherwise adds `fn` as a one-shot `abort` listener. A late registration from a closed or overtaken render therefore runs immediately instead of landing in some other render's list.
- Ending a render is `controller.abort()`: a re-render aborts the previous render's controller before it starts, and closing a column aborts it.
- Whether a render is still current is whether its signal has aborted. There is no generation counter and no separate shell-identity check. The steps before `onRender` (loading assets, yielding a paint) check the same signal, so a column closed while its assets load never renders.

The context exposes `signal`, `onTeardown` and one primitive for replaceable work (ADR-0002). There is no handle-tracking API: work that can be stopped takes the signal, or registers its own stop with `onTeardown`.

## Consequences

Each registered teardown is wrapped so the same function registered twice runs twice, as it did when teardowns were a list; `addEventListener` would otherwise drop the duplicate.

A teardown that throws is reported by the platform the way any throwing event listener is, and the remaining teardowns still run.

A column that held `{ abort() }` handles migrates by passing `signal` to whatever started the work, or by `onTeardown(() => handle.abort())`. Reintroducing `trackHandle` or a list of teardowns keyed by element would bring back the late-registration leak; `tests/column-base-handlers.test.ts` pins both late-registration cases.
