# Architecture — v0.3.0

- `public/` — installable PWA shell, calendar UI, modal day editor, XLSX export.
- `src/worker.js` — Telegram OIDC auth, role authorization, Durable Object state, QA conflict computation, Telegram notifications.
- `APP_STORE` Durable Object — calendar/day data, manager target, recipients, logs.
- `ADMIN_PATH` — secret route to the private admin UI.

## Roles
- `admin`: edits day records. Actual monthly tests are derived from day records and are not a separate editable aggregate.
- `manager`: calendar/day read-only; can update only monthly test target.

## Day record
`dayDetails[YYYY-MM-DD]` contains `types`, `start`, `end`, `tests`, `note`.
When `types` includes `azs`, Worker creates/updates a shift for the same date so Telegram and QA OFF use the calendar as source of truth.
