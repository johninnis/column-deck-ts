# 0012. Restored columns render when they come into view

## Status

Accepted

## Context

On desktop the deck restores the saved layout on construction. A host with many saved columns would otherwise render all of them at once on page load, each starting its own queries, while the reader can see only a few.

## Decision

Restoring mounts every saved column's shell in place straight away, so the layout is complete, but renders each column's content only when its shell comes within 200px of the deck's visible area. Closing a column before it came into view cancels its pending render.

## Consequences

A restored column that is off screen shows its chrome but no content until it is scrolled near. Columns launched after start-up render at once.
