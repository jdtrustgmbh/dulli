# Offline behavior and compatibility

How Dulli behaves without a connection and on which devices it is validated.

## Offline conflict policy

MVP uses entity-specific, explainable reconciliation. It does not introduce a generic CRDT layer.

| Entity/action | Offline behavior | Conflict rule |
|---|---|---|
| Task complete/undo | queue and retry | idempotent action; latest canonical completion state wins |
| Task title/owner | queue simple update | version/timestamp reconciliation; surface local/remote winner in diagnostics |
| List check/reopen | queue and retry | idempotent action; latest canonical checked state wins |
| Quick Capture | preserve draft/candidate | explicit confirmation before create; retry with idempotency key |
| Calendar provider/recurrence | read-only or reconnect | provider owns reconciliation; no unsafe silent merge |

`src/conflicts.mjs` contains the deterministic timestamp/version rule. Advanced cross-device conflict UI, recurring-event merge and attachment caching require observed conflict telemetry and remain post-MVP.

---

## Compatibility and release baseline

Validated target matrix: compact 360x800, medium 768x1024, large 1280x800 and extra-large 1920x1080. Core actions use normal links/buttons, keyboard focus and coarse-pointer targets; no workflow requires hover, touch, landscape or an optional browser API.

Optional capabilities use fallbacks: service worker/PWA install is progressive, notifications are requested only after user action, and local demo state remains usable when offline. Release smoke command: `npm run check`; runtime smoke: `npm start` then open `http://localhost:4173`.
