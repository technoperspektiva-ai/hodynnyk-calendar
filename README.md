# Hodynnyk Calendar

Minimalist PWA for AZS shifts, QA availability, monthly test progress and Telegram notifications.

## Roles

- **Owner/admin**: edits AZS shifts, QA schedule, notification settings and their own completed-test counter. The owner **cannot edit the monthly target**.
- **Manager**: read-only calendar/progress view and the **only role allowed to edit the monthly test target**. The manager cannot edit completed tests, shifts, recipients or access settings.

## Telegram login

Telegram OIDC is mandatory in production. Register the site origin and `/api/auth/callback` as Allowed URLs in BotFather, then configure these Cloudflare secrets:

```bash
npx wrangler secret put TELEGRAM_CLIENT_ID
npx wrangler secret put TELEGRAM_CLIENT_SECRET
npx wrangler secret put AUTH_SECRET
npx wrangler secret put ADMIN_TELEGRAM_ID
npx wrangler secret put TELEGRAM_BOT_TOKEN
```

Generate a strong random `AUTH_SECRET`. `ADMIN_TELEGRAM_ID` is the owner's Telegram user ID.

## Private control route

The control route is not hard-coded into the repository. Set it privately in Cloudflare:

```bash
npx wrangler secret put ADMIN_PATH
```

Use a private path value known only to the owner. The route is server-protected and returns `404` to anonymous and non-admin users. It is not linked from the main UI, PWA manifest or service-worker cache.

## Deploy

```bash
npm install
npx wrangler deploy
```

Worker name: `hodynnyk-calendar`.
