# Movement UI — live acceptance and commit closeout

Status: completed; live-environment validation passed
Accepted: 2026-09-08 (America/Los_Angeles)
Mod build stamp: **20260908-151711**

The user reported “All validated in live environment” and requested closing
Movement and committing both repositories. All 13 new controls and the combined
UI flow are completed. The schema contains 170 Character keys in 12 categories,
including 22 Movement keys, plus 63 Weapon keys.

The completed verification includes 40 UI tests / 305 assertions, TypeScript,
real persistence/review/selected apply and exact captured RCON commands consumed
by the PIE parser. User live acceptance is recorded separately; individual live
cases and installed server/client pak identities were not supplied.

This document is included in the local UI closeout commit with the schema,
explicit-value editor integration, fixtures and reproducible evidence. The mod
repository carries the detailed native evidence and corresponding closeout.
No deployment or push is part of this commit request.
