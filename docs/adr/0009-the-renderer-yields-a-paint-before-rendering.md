# 0009. The renderer yields a paint before a column renders

## Status

Accepted

## Context

Launching a column mounts its shell (header, title, controls) and then renders its content. A heavy render started in the same task keeps the browser from painting the new shell until it finishes, so a click appears to do nothing for as long as the render takes.

## Decision

Between loading a column's assets and calling its `onRender`, the deck waits one animation frame and a macrotask, so the mounted chrome paints first. On mobile, navigation notifies the host and moves focus as soon as the shell is mounted, while the render continues behind it.

## Consequences

`onRender` never runs synchronously with a launch; code that assumes it has rendered by the time `launchColumn` returns must await the returned promise.

`openColumn` in `@innis/column-deck/testing` does not wait for a paint, since there is nothing to paint in a unit test.
