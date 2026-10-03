# 0008. The keyboard handler listens on document and acts on the focused column

## Status

Accepted

## Context

The deck binds column-level keys: arrows to move between (or with Shift, move) columns, `Home`/`End`, `r` to refresh, `x` to close, `Ctrl`/`Cmd`+`Z` to undo, `Escape`. After a page load, or once the focused column closes, DOM focus sits on `body`, outside the deck's mount element; a listener on the mount would never see those keys and the deck would go deaf until the user clicked into a column.

Up to 0.5 `x` closed the column containing `document.activeElement`, while the other keys acted on the last-focused column, so `x` and `r` could act on different columns (scrolling one column while focus sits in another updates the last-focused column but not DOM focus).

## Decision

The handler listens for `keydown` on `document`. It ignores keys while an input, textarea or contenteditable has focus (except `Escape`), ignores any keydown another handler has already `preventDefault`ed, and leaves browser shortcuts with `Ctrl`/`Cmd` alone.

Every column-level key acts on one column: the focused column, the one `getFocusedColumnElement()` returns (updated when the user clicks, focuses into, or scrolls a column). Whether that column may be closed is the deck's decision (ADR-0005), not the key handler's.

## Consequences

Host code that binds its own keys on `document` must `preventDefault` what it consumes so the deck skips it.

`x` can close a column that DOM focus is not in, as `r` can refresh one; undo reopens it.
