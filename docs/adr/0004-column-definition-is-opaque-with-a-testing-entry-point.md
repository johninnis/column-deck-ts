# 0004. A column definition is opaque; tests drive it through `@innis/column-deck/testing`

## Status

Accepted

## Context

Up to 0.5 `ColumnDefinition` exposed the deck's calling convention: `render`, `refresh`, `onMenuSelect`, `onListSelect`, `onListsOpen` and `onDestroy`, each taking a content element and an `OuterColumnContext`, which was exported too. Nothing but the deck should call those, and a host that did could render a column outside any deck and bypass its lifecycle.

Hosts do need to exercise a single column in their own unit tests: render it with stand-in services, press its refresh, pick a menu entry, close it. The one host using the package does exactly this across many test files.

## Decision

`ColumnDefinition` exposes only `type` and `label`. The deck reaches the rest through a symbol-keyed property that is not exported from the package.

A second entry point, `@innis/column-deck/testing`, exports `openColumn(definition, host, element)`, the `ColumnHost` type a test fills in to stand in for the deck, and the `OpenColumn` controls it returns. `openColumn` drives the definition through the same lifecycle the deck uses, so a test sees what a real column sees, apart from the deck's paint yield (ADR-0009).

## Consequences

The main entry point cannot be used to drive a definition by hand. Tests can, deliberately, through an entry point whose name says what it is for.

`ColumnHost` is the deck's side of the contract and changes when that contract changes; hosts that build one in tests change with it.

The symbol-keyed property appears in the published type as an unnamed member; its type is internal on purpose.
