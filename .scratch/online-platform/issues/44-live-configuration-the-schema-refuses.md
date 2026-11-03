# 44: A Live configuration the current schema refuses

Status: open
Type: task
Created: 2026-11-03
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

A Live configuration that a later deploy's schema refuses can never be
delivered, and nobody is told why. Apply validates the whole Draft, but the
Live configuration is never rewritten, so a deploy that tightens a key (a
whole number where a fraction was allowed, a smaller range) can leave a
stored Live configuration holding a value the schema now refuses. Noted by
[Apply a Draft and deliver it](32-apply-a-draft-and-deliver-it.md) and
checked while building [Confirmed and Failed](33-confirmed-and-failed.md).

What happens now (as of `online-platform#33`):
- A poll that should get the Live configuration at once calls
  `pendingDelivery` (`src/lib/platform/live-configurations.ts`), whose
  `deliveryOf` calls `encodeValues` (`src/lib/config/encodeValues.ts`), which
  throws when the schema refuses a value.
- The poll route catches it, logs `poll.failed` as an error and answers `500`.
  The mod waits about 10 s and polls again, so the same error is logged about
  every 10 s per affected game server, and the operator's error count keeps
  rising. The error message names the refused keys.
- The owner's page shows Pending for as long as this lasts, with nothing to
  say that the configuration cannot be sent or what to fix. The Draft is
  unaffected, so the owner can fix the value and Apply, but nothing points
  there.

Decide what the owner sees (for example a state on the Live configuration
naming the values to fix, beside Pending, Confirmed and Failed), what the poll
gets meanwhile (held and `no-change`, so the mod does not retry in a loop),
and log it once rather than on every poll. Whether refused values could be
dropped from the delivery instead, as values with no place in the schema are,
is part of the decision.

## Acceptance criteria

- [ ] A poll on the Supported build whose Live configuration the schema
      refuses is not answered `500`, and the mod does not poll in a 10 s loop.
- [ ] The server page says the Live configuration cannot be sent, names the
      values to fix in the Draft, and that Apply after fixing them sends it.
- [ ] It is logged once per Live configuration, by id, with no key names or
      values.
- [ ] A route-handler test stores a Live configuration the schema refuses
      and covers the poll's answer, the page, the log line and the recovery
      by Apply.
- [ ] `docs/poll-exchange.md` says what such a poll gets.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
