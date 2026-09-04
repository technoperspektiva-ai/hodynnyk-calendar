# Hodynnyk Calendar — Architecture v0.2.1

## Runtime

GitHub → Cloudflare Worker `hodynnyk-calendar` → Static Assets + Durable Object `APP_STORE`.

## PWA

`public/` contains the installable PWA shell, manifest, service worker, artwork and icons. The service worker never caches private admin routes or API responses.

## Roles

- `admin`: calendar/work log/settings/completed tests/recipients/managers.
- `manager`: read calendar/statistics + edit only monthly test target.

The same permission split is enforced by Worker API checks, not only by UI hiding.

## Private admin route

The admin route is resolved only from Cloudflare Secret `ADMIN_PATH`. Internal `admin.html` and `admin.js` cannot be fetched directly. Anonymous or non-admin access to the secret path receives 404.

## Telegram

OIDC login uses `TELEGRAM_CLIENT_ID` and `TELEGRAM_CLIENT_SECRET`.

Bot delivery uses `TELEGRAM_BOT_TOKEN`.

On successful Telegram OIDC callback the Worker asynchronously sends a login notification to `ADMIN_TELEGRAM_ID` with user name, Telegram ID and resolved role.

Regular absence notifications and manual tomorrow-shift notifications are sent to active recipients configured in the private admin panel.

## Tomorrow manual push

`POST /api/notifications/tomorrow` is admin-only. It checks tomorrow in the configured Kyiv timezone. If no planned AZS shift exists, nothing is sent. If it exists, a compact shift message is sent to all active recipients and stored in delivery log.
