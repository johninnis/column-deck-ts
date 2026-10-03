# 0011. Every asset kind rejects on failure

## Status

Accepted

## Context

The browser asset loader rejected when a column's HTML or JS failed to load but resolved when its CSS failed, so a missing stylesheet rendered an unstyled column silently while a missing script failed loudly. Tolerating a missing stylesheet can look kinder, but it hides a broken deployment and makes the three asset kinds behave differently for no reason a caller can see.

## Decision

`createBrowserAssetLoader` rejects with `ColumnLifecycleError` when any asset fails to load, CSS included, and forgets the failed path so the next render retries it.

## Consequences

A column whose stylesheet fails does not render; its launch rejects, or the failure is reported (ADR-0010) when the render was started by an event. A host that wants a column to render without its stylesheet supplies its own `AssetLoader`.
