# 0010. Async failures at event edges go to reportError

## Status

Accepted

## Context

Clicks, key presses, intersection callbacks and a column's own `close()` start deck operations that return promises: refreshing, closing, undoing, running a column's menu handler, rendering a lazily restored column. A DOM event listener cannot await or return them. In 0.5 the shell's callbacks were typed as returning nothing while the deck handed them promise-returning functions, so a rejection became an unhandled rejection.

## Decision

Where an event starts a deck operation, the deck passes the result through one function that sends a rejection to `reportError`. That is the same channel the platform uses for an exception thrown synchronously from an event listener, so a failing refresh and a throwing click handler surface identically.

Promises the host calls directly (`launchColumn`, `closeColumn`, `refreshColumn`, `undo`, `goBack`) still reject to the host.

## Consequences

This is not swallowing: `reportError` fires the global `error` event and reaches the console and any error reporting the host has installed. It is the one place the deck turns a rejection into a report; everywhere else a rejection propagates to whoever awaited it.
