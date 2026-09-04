# hodynnyk-calendar — architecture v0.1

## Product

Окремий продукт. `myHabbit` не змінюється і не є кодовою базою цього застосунку.

## Stack

- Vanilla HTML/CSS/JS PWA;
- Cloudflare Workers Static Assets;
- Cloudflare Worker API;
- SQLite-backed Durable Object `AppStore`;
- Cloudflare Cron Trigger;
- Telegram Bot API;
- Telegram OIDC Login + PKCE;
- GitHub Actions → `npx wrangler deploy`.

## URL layout

```text
/
  main calendar / QA / tests

/last-admin
  recipients / managers / delivery log

/api/*
  auth + state + mutations + notifications
```

## State

Single Durable Object named `primary` stores:

```text
settings
shifts[]
recipients[]
managers[]
metrics{ YYYY-MM -> completed/target }
notificationLog[]
```

## Permissions

```text
admin
  full write access

manager
  read calendar and metrics
  write monthly target only

unknown Telegram user
  forbidden
```

`/last-admin` UI requires `admin`; all sensitive API mutations are protected server-side as well.

## Absence calculation

For each QA workday:

```text
QA interval = date + configured QA start/end
AZS interval = shift date/start + shift duration + optional recovery
QA OFF = intervals overlap
```

This means a 24h shift can automatically mark the correct QA day(s), instead of treating an entire calendar day as unavailable by definition.
