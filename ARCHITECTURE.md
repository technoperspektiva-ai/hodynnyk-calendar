# Architecture — v0.3.3

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


## v0.4.0
- Ручна кнопка «Запустити QA-перевірку» тепер завжди надсилає результат у Telegram.
- Якщо QA OFF завтра є — надсилається звичайне повідомлення про відсутність.
- Якщо QA OFF немає — надсилається той самий формат зі статусом «QA OFF немає / доступний за звичайним графіком».
- Cron не змінено: автоматично він надсилає повідомлення лише коли QA OFF реально є.


## v0.4.9
Manager calendar now has a compact Telegram self-sync button next to Excel. It calls `/api/telegram/sync-self` and only binds the currently authenticated manager/admin Telegram account to its private bot chat.


## v0.5.0 sync visibility fix
- Fixed stale PWA cache version (was still 0.4.4).
- Added cache-busting query params to main CSS/JS.
- Telegram self-sync button is visible for both authenticated admin and manager next to Excel.


## Telegram self-sync
Both the main manager UI and admin self-sync use the authenticated session user id. The hardcoded owner id is only an authorization rule for admin access, never the sync target.
