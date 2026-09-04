# Hodynnyk Calendar — architecture

- PWA frontend: calendar, QA conflicts, monthly completed tests and manager-set target.
- Cloudflare Worker: auth, role enforcement, private control route, API and Telegram notification scheduler.
- Durable Object: shifts, settings, recipients, managers, monthly metrics and delivery log.
- Telegram OIDC: required for both owner and manager.
- Telegram Bot API: absence notifications.
- Cloudflare Cron: checks tomorrow's QA conflict.

## Permissions

Owner/admin:
- write shifts and QA settings
- write own completed-test count
- read target
- manage recipients and manager Telegram IDs through the private control route

Manager:
- read calendar and metrics
- write monthly target only

The monthly target endpoint is server-enforced as manager-only. The completed-test endpoints are server-enforced as owner-only.

## Private control route

Its pathname is stored only in the `ADMIN_PATH` Cloudflare secret. The public PWA does not link, advertise, shortcut or cache it.
