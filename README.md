# Hodynnyk Calendar v0.2.1

PWA для особистого календаря QA/АЗС з Telegram-авторизацією, місячним лічильником тестів, планкою від керівника та Telegram-сповіщеннями.

## Що є у v0.2.1

- installable PWA для телефону/ПК;
- адаптація portrait / landscape / safe-area;
- cozy UI у стилі myHabbit з новим artwork;
- loading screen на artwork;
- нова PWA-іконка;
- тап по даті → фактична робота `QA`, `АЗС` або обидва;
- автоматичні місячні підсумки QA/АЗС;
- окремі планові зміни АЗС для QA OFF та Telegram;
- admin редагує тільки фактичну кількість тестів;
- manager редагує тільки місячну планку тестів;
- прихована admin-панель через `ADMIN_PATH`;
- автоматичне повідомлення адміну при Telegram-вході користувача;
- ручна кнопка в admin-панелі «Надіслати про завтра» — відправляє пуш тільки якщо на завтра є запланована зміна АЗС;
- автоматичний Cron QA OFF на завтра;
- Telegram delivery log.

## Deploy

```bash
npm install
npx wrangler deploy
```

Worker name: `hodynnyk-calendar`.

## Cloudflare secrets

```bash
npx wrangler secret put TELEGRAM_CLIENT_ID
npx wrangler secret put TELEGRAM_CLIENT_SECRET
npx wrangler secret put AUTH_SECRET
npx wrangler secret put ADMIN_TELEGRAM_ID
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put ADMIN_PATH
```

`ADMIN_PATH` зберігається тільки як Cloudflare Secret і не прописаний у frontend/manifest/service-worker.

`TELEGRAM_BOT_USERNAME` не є секретом і вже заданий у `wrangler.jsonc`:

```text
HodynnykCalendar_bot
```

## Важливо для Telegram-пушів

Адмін має хоча б один раз відкрити `@HodynnykCalendar_bot` і натиснути Start, інакше Telegram Bot API не дозволить боту першим написати в приватний чат.

Для звичайних сповіщень отримувачі керуються в прихованій admin-панелі через Telegram `chat_id`. Ручна кнопка «Надіслати про завтра» використовує цей список активних отримувачів.

Повідомлення про вхід на платформу надсилається напряму на `ADMIN_TELEGRAM_ID`.

## Telegram Login

Redirect URI:

```text
https://<your-domain>/api/auth/callback
```

Trusted Origin:

```text
https://<your-domain>
```

## Перевірка

```bash
npm run check
npx wrangler secret list
```
