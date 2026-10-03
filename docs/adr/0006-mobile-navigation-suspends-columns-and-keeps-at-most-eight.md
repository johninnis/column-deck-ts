# 0006. Mobile navigation suspends the columns behind, and keeps at most eight

## Status

Accepted

## Context

On a narrow viewport the deck shows one column at a time. Navigating forward could simply close the column being left and relaunch it on "back". That is the cheap shape, but going back would then re-render from scratch: the column loses its scroll position, re-runs its queries, and shows nothing until they answer, on exactly the devices where that is slowest.

Keeping the columns behind alive costs memory instead. Every kept column holds its DOM and its render's work (subscriptions, listeners). A user who keeps drilling forward (profile, note, profile, note …) would accumulate them without bound on the devices least able to afford it.

## Decision

Navigating forward suspends the current column rather than closing it: it is detached from the document with its render's work intact and its scroll position remembered, and going back re-attaches it.

At most eight columns are kept suspended. Suspending a ninth destroys the oldest suspended column, running its teardowns, and leaves a cold entry in its place on the back-stack. Going back to a cold entry renders that column afresh.

## Consequences

A detached column keeps receiving events for as long as it is suspended; a column's render must not assume it is on screen.

Going back far enough re-renders a column instead of restoring it, losing its scroll position. Eight covers ordinary back-and-forth; the number is a tuning choice, not a limit anything else depends on.

The back-stack itself (the history the host sees, ADR-0007) is not capped; only the live columns are.

A reader will be tempted to close columns on forward navigation "to save memory", or to lift the cap. The first makes every "back" a cold render; the second lets a long drill-down exhaust a phone.
