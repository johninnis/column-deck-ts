# 0007. The deck owns the mobile back-stack

## Status

Accepted

## Context

On a narrow viewport the deck shows one column at a time, and "back" should return to the previous column as the user left it (ADR-0006). Earlier versions left the history array to the host and passed it back and forth, which let two owners disagree about it.

Closing and undo also have to mean something on mobile. In 0.5 closing a mobile column removed it and left the deck empty with a stale history entry, and undo re-inserted the column through the desktop insertion path.

## Decision

- The deck owns the back-stack. The host seeds it with `initialMobileHistory`, is told about changes through `onMobileHistoryChange`, and reads it with `getMobileHistory()`; no mutable array crosses the boundary.
- `goBack()` returns to the previous entry on the stack. Launching a column already suspended on the stack unwinds to it, closing what was above.
- Closing the current column goes back to the previous one. Closing the only column leaves the deck empty.
- Undo navigates to the closed column, as launching it would.
- On mobile the deck neither saves nor restores the desktop layout.

## Consequences

Mobile and desktop share one close and one undo in the deck's public surface; only the navigator decides what they mean on a narrow viewport.

The host's back button calls `goBack()`; it does not record anything for undo, since leaving a column by navigation is not closing it.
