# 0003. Render state is keyed by the content element

## Status

Accepted

## Context

One column definition serves every column of its type: a non-singleton type such as a note column can be open several times at once, each with its own render, lifetime and handlers. The definition therefore needs per-column state, and something to find it by.

The deck identifies a mounted column to the definition by the content element it renders into. The element exists for exactly as long as the column is mounted, is unique per column, and is already what the render receives. A column key would also be unique, but the definition does not know keys, and a key outlives a column that closes and is reopened.

## Decision

Each definition holds one `WeakMap` from content element to the live render: its `AbortController` and the handlers `onRender` returned. Starting a render replaces the entry; closing deletes it.

## Consequences

A `WeakMap` keyed by a DOM node reads like a leak waiting to happen; it is the opposite. When the deck drops a closed column's element the entry is collectable even if a teardown path was missed.

There is one map, not one per concern: the controller and the handlers of a render are written and forgotten together, so they live in one record.
