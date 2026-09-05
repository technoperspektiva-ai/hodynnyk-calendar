# hodynnyk-calendar v0.3.1

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

## Admin button v0.3.1

For Telegram account `375938798`, when the resolved role is `admin`, the main app bar shows a private admin button. It opens `/api/admin`, which performs a server-side role/id check and redirects to the secret `ADMIN_PATH`; the actual private path is not embedded in the frontend. Other accounts receive 404 from `/api/admin`.
