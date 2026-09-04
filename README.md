# hodynnyk-calendar

Мінімалістичний noir/green PWA для поєднання 24-годинних змін на АЗС з QA-графіком.

## v0.1

- місячний календар змін АЗС;
- автоматичне визначення QA OFF на основі перетину часових інтервалів;
- готовий QA availability report;
- місячний лічильник виконаних тестів;
- місячна планка тестів, яку може змінювати admin або manager;
- Telegram Login (OIDC);
- ролі `admin` і `manager`;
- `/last-admin` — приватна адмін-панель;
- керування Telegram recipients та manager Telegram ID;
- Telegram test message;
- автоматичне повідомлення «завтра відсутній» через Cloudflare Cron;
- журнал доставки;
- PWA / installable web app;
- deploy як Cloudflare Worker `hodynnyk-calendar`.

## Ролі

### Admin

Telegram ID admin задається секретом/змінною `ADMIN_TELEGRAM_ID`.
Admin може:

- додавати та видаляти зміни АЗС;
- змінювати QA-графік;
- змінювати фактичну кількість виконаних тестів;
- задавати місячну планку;
- заходити на `/last-admin`;
- додавати/вимикати Telegram recipients;
- додавати/вимикати manager accounts;
- надсилати test notification;
- запускати notification check вручну;
- переглядати/очищати журнал відправок.

### Manager

Manager визначається за Telegram user ID, який admin додає в `/last-admin`.
Manager може:

- переглядати календар;
- бачити QA OFF;
- бачити фактичну кількість тестів;
- задавати місячну планку тестів.

Manager не може редагувати зміни АЗС, QA-графік, фактичний test counter, recipients або manager list.

## Маршрути

- `/` — основний застосунок;
- `/last-admin` — admin panel;
- `/api/*` — Worker API.

Окремий `admin.` піддомен не використовується.

## Локальний запуск

```bash
npm install
npm run dev
```

Якщо Telegram secrets не налаштовані, Worker запускається в demo mode:

- `/` — demo admin;
- `/?demoRole=manager` — demo manager.

## Cloudflare deploy

Назва Worker: `hodynnyk-calendar`.

```bash
npm install
npx wrangler login
npx wrangler deploy
```

### Secrets

```bash
npx wrangler secret put TELEGRAM_CLIENT_ID
npx wrangler secret put TELEGRAM_CLIENT_SECRET
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put AUTH_SECRET
npx wrangler secret put ADMIN_TELEGRAM_ID
```


Згенерувати `AUTH_SECRET`, наприклад:

```bash
openssl rand -hex 32
```

## Telegram Login

У BotFather потрібно налаштувати Telegram Login / Allowed URLs для основного домену.
Callback застосунку:

```text
https://YOUR_DOMAIN/api/auth/callback
```

Worker використовує Telegram OIDC + PKCE, а сесію підписує власним `AUTH_SECRET`.

## Telegram notifications

Cloudflare Cron запускається щогодини (`0 * * * *`). У налаштуваннях застосунку задається година відправки, наприклад `19:00`.

У потрібну годину Worker:

1. визначає завтрашню дату у `Europe/Kyiv`;
2. перевіряє, чи зміна АЗС перетинає QA-графік;
3. якщо QA OFF є — надсилає повідомлення всім enabled recipients;
4. не дублює вже успішно надіслане повідомлення для того ж дня й chat ID;
5. записує результат у delivery log.

## GitHub Actions

Workflow `.github/workflows/deploy.yml` виконує deploy після push у `main`.

У GitHub Repository Secrets потрібно додати:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Telegram secrets зберігаються в Cloudflare, а не в GitHub repository.
## Адаптивність PWA

Інтерфейс mobile-first і розрахований на телефони, планшети та desktop. Підтримуються portrait/landscape, `viewport-fit=cover`, safe-area для вирізів/динамічних панелей, `100dvh`, захист від горизонтального overflow та компактний календар для екранів від ~360 px. На iOS кнопка встановлення підказує сценарій Safari → «На початковий екран».

