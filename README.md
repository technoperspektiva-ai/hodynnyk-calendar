## v0.4.4

- Telegram delivery log now shows exact Telegram API error details, chat_id, type and time.
- Failed test notifications are persisted in the log.
- Admin can export the complete Telegram delivery log to UTF-8 TXT on the device.
- Keeps v0.4.2 calendar/header/admin cleanup behavior.

- Removed PWA install button from admin panel.
- Keeps v0.4.1 strict Excel work-type filtering.

# hodynnyk-calendar v0.3.3

PWA-first робочий календар для QA + АЗС.

## Головний UX
- Головний екран — календар без постійних форм.
- Натискання на дату відкриває модальне вікно.
- Admin у модалці задає QA / АЗС, початок, кінець, кількість тестів і нотатку.
- Повторне натискання на дату дозволяє виправити дані.
- Manager бачить ті самі дані read-only.
- Manager може змінювати тільки місячну планку тестів.
- Місячна кількість виконаних тестів автоматично сумується з денних записів.
- Excel ↓ експортує поточний місяць у справжній `.xlsx` без зовнішніх бібліотек.

## Telegram
- Позначка АЗС у календарі синхронізується з плановою зміною для QA OFF і Telegram-пушів.
- Cron надсилає повідомлення про завтрашню відсутність.
- `/last-admin` (значення задається через `ADMIN_PATH`) має ручну кнопку «Надіслати про завтра».
- Admin отримує повідомлення в бот при успішній Telegram-авторизації користувача.

## Deploy
```bash
npm install
npx wrangler deploy
```

## Required secrets
```text
TELEGRAM_CLIENT_ID
TELEGRAM_CLIENT_SECRET
AUTH_SECRET
ADMIN_TELEGRAM_ID
TELEGRAM_BOT_TOKEN
ADMIN_PATH
```

`TELEGRAM_BOT_USERNAME=HodynnykCalendar_bot` заданий у `wrangler.jsonc` як звичайна variable.

## Admin button v0.3.3

For Telegram account `375938798`, when the resolved role is `admin`, the main app bar shows a private admin button. It opens `/api/admin`, which performs a server-side role/id check and redirects to the secret `ADMIN_PATH`; the actual private path is not embedded in the frontend. Other accounts receive 404 from `/api/admin`.

## v0.4.0 — persistent runtime configuration

The non-sensitive runtime values are now declared in `wrangler.jsonc`: `ADMIN_TELEGRAM_ID`, `TELEGRAM_CLIENT_ID`, `TELEGRAM_BOT_USERNAME`, and `ADMIN_PATH`. Only the bot token, Telegram client secret, and the session `AUTH_SECRET` must be stored as Cloudflare Secrets.


## v0.4.0 owner fix
- Telegram ID `375938798` is hardcoded as the owner/admin.
- The gear is a native link to `/last-admin/` rather than a JS navigation button.
- Owner recognition no longer depends on `ADMIN_TELEGRAM_ID` being present at runtime.
- Header controls are aligned consistently on narrow screens.


## v0.4.0
- Ручна кнопка «Запустити QA-перевірку» тепер завжди надсилає результат у Telegram.
- Якщо QA OFF завтра є — надсилається звичайне повідомлення про відсутність.
- Якщо QA OFF немає — надсилається той самий формат зі статусом «QA OFF немає / доступний за звичайним графіком».
- Cron не змінено: автоматично він надсилає повідомлення лише коли QA OFF реально є.


## v0.4.1
- Excel export now recognizes only explicit `qa` and `azs` day types.
- Unknown/legacy day markers no longer export as AZS.
- `detailForDate()` normalizes stored types before calendar/statistics/export use.

## v0.4.9
Manager calendar now has a compact Telegram self-sync button next to Excel. It calls `/api/telegram/sync-self` and only binds the currently authenticated manager/admin Telegram account to its private bot chat.


## v0.5.3 sync visibility fix
- Fixed stale PWA cache version (was still 0.4.4).
- Added cache-busting query params to main CSS/JS.
- Telegram self-sync button is visible for both authenticated admin and manager next to Excel.


## v0.5.3
- Admin bot sync uses the currently authenticated Telegram session (`/api/telegram/sync-self`).
- Manager sync button opens a compact modal with a direct link to `@HodynnykCalendar_bot` and a separate sync action.
