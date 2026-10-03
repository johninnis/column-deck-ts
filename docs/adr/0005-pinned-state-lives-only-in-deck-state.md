# 0005. Pinned state lives only in the deck's state

## Status

Accepted

## Context

A pinned column sits in a region at the head of the deck, cannot be closed and cannot be dragged. In 0.5 the pinned flag had three sources of truth: `state.columns[].pinned`, a local variable inside each shell, and the `data-pinned` attribute that the keyboard and drag handlers read back from the DOM. `deck.setPinned` updated the state but never told the shell, so a column the host pinned kept its close button, stayed draggable, and could be closed by the button, a middle-click or the `x` key. The shell's own setter also had a `notify` flag, a second code path used only when restoring a saved layout.

## Decision

The deck's state is the only source of the pinned flag.

- The shell only renders it: `renderPinned(pinned)` sets `data-pinned`, hides the close button and turns header dragging off. It holds no pinned variable and reports nothing.
- The pin button asks the deck to toggle; the deck flips the flag in state, repositions the column, and calls `renderPinned`. Host calls to `setPinned` take the same path, and so does mounting a column restored as pinned.
- `closeColumn` refuses a pinned column. The close button, middle-click, `x` and a column's own `close()` all go through it, so no input handler checks pinning itself.
- Moves (keyboard and drag) are refused when they would cross the boundary of the pinned region.

## Consequences

Reading `data-pinned` back from the DOM to make a decision is a regression; the attribute is output for stylesheets only.

A column that calls `close()` on itself while pinned stays open. Pinning is the user saying "keep this".

Tests pin each path: host pinning updates the chrome, and a pinned column survives the close button, middle-click, `x` and a drag in front of the pinned region.
