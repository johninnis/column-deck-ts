# 0000. Record architecture decisions

## Status

Accepted

## Context

Several choices in this package read like mistakes to someone meeting them cold: render state held in a `WeakMap` keyed by a DOM element, a hard cap of eight suspended mobile columns, a keyboard listener on `document` rather than on the deck, a column definition whose type hides its own methods. Each was made for a reason that the code alone cannot carry, and each is the kind of thing a well-meaning refactor "fixes" and in doing so reintroduces the bug it prevented.

The README is for people using the package. It says what the deck does, not why it is built the way it is.

## Decision

Design rationale lives in `docs/adr/`, one Architecture Decision Record per decision, numbered sequentially from `0001`. Each record has four sections: Status, Context, Decision, Consequences.

Records are immutable once accepted. A changed decision gets a new record that restates the whole current decision and marks the old one `Superseded by ADR-NNNN`. A record holds one decision; two choices that could be revised independently get two records.

Where a choice will look wrong at the call site, a one-line comment points at its record (`// Deliberate: … see ADR-NNNN`), and a test fails if the choice is undone.

A record's filename is its four-digit number and a kebab-case slug of its title, at most 95 characters including the `.md` extension, the longest path component JSR accepts. A longer title is shortened in the filename, never in the record's heading.

## Consequences

A reviewer reads `docs/adr/` before judging the code, and does not "simplify" anything a record justifies without first writing a record that supersedes it.

The README carries no rationale sections; anything explaining *why* belongs here.
