# hodynnyk-calendar v0.3.0

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
