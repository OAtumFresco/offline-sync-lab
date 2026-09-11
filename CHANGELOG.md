# Changelog

## 0.1.0 — 2026-09-11

First runnable release of this independent engineering lab.

- Persistent IndexedDB outbox and an offline app shell.
- Transactional SQLite receipts for idempotent delivery.
- Fault injection that loses a response after committing a note.
- Actual request-based reachability, including recovery with a stale offline hint.
- 13 unit/integration tests and 18 browser checks across Chromium, Firefox and WebKit.
- English and Portuguese documentation, recorded demo, SVG diagrams and CI.

## Run

Use Node 22.13+ (Node 22 or 24 recommended). Download the source or clone the repository, then run `npm start`. Runtime npm dependencies are not required. Browser testing instructions are in the README.

## Scope

Append-only notes, one user, local storage may be evicted; receipt growth is unbounded in this teaching version. No authentication, conflict resolution or production load validation.

This is a local teaching implementation. No open-source license has been assigned; see NOTICE.
