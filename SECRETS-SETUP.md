# Cloudflare setup — v0.3.5

These values are now shipped as Wrangler vars and do NOT need to be re-entered in Cloudflare:

- `ADMIN_TELEGRAM_ID=375938798`
- `TELEGRAM_CLIENT_ID=8821803679`
- `TELEGRAM_BOT_USERNAME=HodynnykCalendar_bot`
- `ADMIN_PATH=last-admin`

Only these 3 values must remain Cloudflare Secrets:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CLIENT_SECRET`
- `AUTH_SECRET`

`AUTH_SECRET` must be a long random string. It must NOT be `last-admin`.
Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then save it once:

```bash
npx wrangler secret put AUTH_SECRET
```

Normal future `npx wrangler deploy` operations to the same `hodynnyk-calendar` Worker do not require re-entering these secrets.
