const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

const enc = new TextEncoder();
const dec = new TextDecoder();

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { ...JSON_HEADERS, ...extra }
});

const redirect = (location, headers = {}) => new Response(null, {
  status: 302,
  headers: { location, ...headers }
});

const b64url = (input) => {
  const bytes = input instanceof Uint8Array ? input : enc.encode(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const unb64url = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

const randomToken = (bytes = 32) => {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return b64url(arr);
};

const importHmacKey = (secret) => crypto.subtle.importKey(
  'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
);

async function signSession(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

async function verifySession(token, secret) {
  if (!token || !secret) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const key = await importHmacKey(secret);
  const ok = await crypto.subtle.verify('HMAC', key, unb64url(sig), enc.encode(body));
  if (!ok) return null;
  const payload = JSON.parse(dec.decode(unb64url(body)));
  if (!payload?.exp || Date.now() / 1000 > payload.exp) return null;
  return payload;
}

const parseCookies = (request) => Object.fromEntries(
  (request.headers.get('cookie') || '')
    .split(';')
    .map(v => v.trim())
    .filter(Boolean)
    .map(v => {
      const i = v.indexOf('=');
      return i === -1 ? [v, ''] : [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
    })
);

const sessionCookie = (token) => `hc_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
const clearSessionCookie = () => 'hc_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'];
const pad = n => String(n).padStart(2, '0');
const monthKey = date => date.slice(0, 7);

function naiveLocalMs(dateStr, timeStr = '00:00') {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm, 0, 0);
}

function dateFromNaive(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
}

function addDays(dateStr, days) {
  return dateFromNaive(naiveLocalMs(dateStr) + days * 86400000);
}

function weekdayFor(dateStr) {
  return DAY_KEYS[new Date(naiveLocalMs(dateStr)).getUTCDay()];
}

function localParts(timeZone = 'Europe/Kyiv', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now);
  const map = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return { date: `${map.year}-${map.month}-${map.day}`, hour: Number(map.hour), minute: Number(map.minute) };
}

function defaultState() {
  return {
    version: 4,
    settings: {
      timeZone: 'Europe/Kyiv',
      shiftStart: '08:00',
      shiftDurationHours: 24,
      recoveryHours: 0,
      notifyAt: '19:00',
      qa: {
        mon: { enabled: true, start: '09:00', end: '18:00' },
        tue: { enabled: true, start: '09:00', end: '18:00' },
        wed: { enabled: true, start: '09:00', end: '18:00' },
        thu: { enabled: true, start: '09:00', end: '18:00' },
        fri: { enabled: true, start: '09:00', end: '18:00' },
        sat: { enabled: false, start: '09:00', end: '18:00' },
        sun: { enabled: false, start: '09:00', end: '18:00' }
      }
    },
    shifts: [],
    recipients: [],
    managers: [],
    metrics: {},
    workLog: {},
    dayDetails: {},
    notificationLog: []
  };
}

function sanitizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}), qa: { ...base.settings.qa, ...(raw.settings?.qa || {}) } },
    shifts: Array.isArray(raw.shifts) ? raw.shifts.slice(-800) : [],
    recipients: Array.isArray(raw.recipients) ? raw.recipients.slice(-100) : [],
    managers: Array.isArray(raw.managers) ? raw.managers.slice(-50) : [],
    metrics: raw.metrics && typeof raw.metrics === 'object' ? raw.metrics : {},
    workLog: raw.workLog && typeof raw.workLog === 'object' ? raw.workLog : {},
    dayDetails: raw.dayDetails && typeof raw.dayDetails === 'object' ? raw.dayDetails : {},
    notificationLog: Array.isArray(raw.notificationLog) ? raw.notificationLog.slice(-300) : []
  };
}

function intervalForShift(shift, state) {
  const start = naiveLocalMs(shift.date, shift.start || state.settings.shiftStart);
  const duration = Number(shift.durationHours || state.settings.shiftDurationHours || 24);
  const end = start + duration * 3600000 + Number(state.settings.recoveryHours || 0) * 3600000;
  return { start, end };
}

function qaInterval(dateStr, state) {
  const qa = state.settings.qa?.[weekdayFor(dateStr)];
  if (!qa?.enabled) return null;
  const start = naiveLocalMs(dateStr, qa.start || '09:00');
  let end = naiveLocalMs(dateStr, qa.end || '18:00');
  if (end <= start) end += 86400000;
  return { start, end };
}

function absenceForDate(dateStr, state) {
  const qa = qaInterval(dateStr, state);
  if (!qa) return null;
  const overlaps = state.shifts.filter(shift => {
    const s = intervalForShift(shift, state);
    return s.start < qa.end && s.end > qa.start;
  });
  if (!overlaps.length) return null;
  return {
    date: dateStr,
    qaStart: state.settings.qa[weekdayFor(dateStr)].start,
    qaEnd: state.settings.qa[weekdayFor(dateStr)].end,
    shiftIds: overlaps.map(s => s.id)
  };
}

function absencesForMonth(month, state) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out = [];
  for (let d = 1; d <= days; d++) {
    const date = `${y}-${pad(m)}-${pad(d)}`;
    const a = absenceForDate(date, state);
    if (a) out.push(a);
  }
  return out;
}

function publicStateForRole(state, role) {
  const core = {
    settings: state.settings,
    shifts: state.shifts,
    metrics: state.metrics,
    workLog: state.workLog,
    dayDetails: state.dayDetails,
    computed: {
      monthAbsences: {}
    }
  };
  if (role === 'admin') {
    core.recipients = state.recipients;
    core.managers = state.managers;
    core.notificationLog = state.notificationLog;
  }
  return core;
}

function cleanText(v, max = 80) {
  return String(v ?? '').trim().slice(0, max);
}

function validateDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
}

function validateTime(v) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
}

async function sendTelegram(env, chatId, text) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.description || `Telegram HTTP ${res.status}`);
  return data;
}

function notificationText(absence) {
  const [y,m,d] = absence.date.split('-');
  return `Hodynnyk · QA availability\nЗавтра, ${d}.${m}.${y}, я буду відсутній на QA.\nНедоступність: ${absence.qaStart}–${absence.qaEnd}.`;
}

function tomorrowShiftText(date, shift, absence) {
  const [y,m,d] = date.split('-');
  const details = [
    `Hodynnyk · зміна на завтра`,
    `Завтра, ${d}.${m}.${y}, у мене зміна на АЗС.`,
    `Початок: ${shift.start || '08:00'} · тривалість: ${shift.durationHours || 24} год.`
  ];
  if (absence) details.push(`QA: відсутній ${absence.qaStart}–${absence.qaEnd}.`);
  if (shift.note) details.push(`Нотатка: ${shift.note}`);
  return details.join('\n');
}

function loginNotificationText(user, role, timeZone = 'Europe/Kyiv') {
  const when = new Intl.DateTimeFormat('uk-UA', {
    timeZone, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).format(new Date());
  const roleLabel = role === 'admin' ? 'Admin' : role === 'manager' ? 'Керівник' : 'Без доступу';
  return [
    'Hodynnyk · вхід на платформу',
    `Користувач: ${user.name || user.username || user.id}`,
    `Telegram ID: ${user.id}`,
    `Роль: ${roleLabel}`,
    `Час: ${when}`
  ].join('\n');
}

export class AppStore {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async read() {
    const raw = await this.ctx.storage.get('state');
    return sanitizeState(raw);
  }

  async write(state) {
    const safe = sanitizeState(state);
    await this.ctx.storage.put('state', safe);
    return safe;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const state = await this.read();

    if (request.method === 'GET' && url.pathname === '/state') return json({ ok: true, state });

    if (request.method === 'POST' && url.pathname === '/replace') {
      const body = await request.json().catch(() => null);
      return json({ ok: true, state: await this.write(body?.state) });
    }

    if (request.method === 'POST' && url.pathname === '/auth-flow') {
      const body = await request.json().catch(() => null);
      if (!body?.state || !body?.verifier) return json({ ok: false }, 400);
      await this.ctx.storage.put(`flow:${body.state}`, { verifier: body.verifier, returnTo: body.returnTo || '/' }, { expirationTtl: 600 });
      return json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/auth-flow/take') {
      const body = await request.json().catch(() => null);
      const key = `flow:${body?.state || ''}`;
      const flow = await this.ctx.storage.get(key);
      if (flow) await this.ctx.storage.delete(key);
      return json({ ok: !!flow, flow: flow || null }, flow ? 200 : 404);
    }

    return json({ ok: false, error: 'Not found' }, 404);
  }
}

async function storeStub(env) {
  const id = env.APP_STORE.idFromName('primary');
  return env.APP_STORE.get(id);
}

async function readState(env) {
  const stub = await storeStub(env);
  const res = await stub.fetch('https://store/state');
  const data = await res.json();
  return sanitizeState(data.state);
}

async function writeState(env, state) {
  const stub = await storeStub(env);
  const res = await stub.fetch('https://store/replace', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state })
  });
  const data = await res.json();
  return sanitizeState(data.state);
}

function authConfigured(env) {
  return !!(env.TELEGRAM_CLIENT_ID && env.TELEGRAM_CLIENT_SECRET && env.AUTH_SECRET && env.ADMIN_TELEGRAM_ID);
}

function adminPath(env) {
  // Stable owner route. ADMIN_PATH can override it, but a missing secret must not brick the admin UI.
  const raw = String(env.ADMIN_PATH || 'last-admin').trim().replace(/^\/+|\/+$/g, '');
  return /^[a-zA-Z0-9_-]{6,80}$/.test(raw) ? `/${raw}` : '/last-admin';
}



async function currentUser(request, env, state) {
  if (!authConfigured(env)) return null;
  const cookies = parseCookies(request);
  const session = await verifySession(cookies.hc_session, env.AUTH_SECRET);
  if (!session?.id) return null;
  const id = String(session.id);
  const role = roleForTelegramId(id, env, state);
  if (role === 'unauthorized') return { ...session, role };
  return { ...session, role };
}

function requireRole(user, roles) {
  return !!user && roles.includes(user.role);
}

function roleForTelegramId(id, env, state) {
  const value = String(id || '');
  if (value && value === String(env.ADMIN_TELEGRAM_ID || '')) return 'admin';
  if (state.managers.some(m => String(m.telegramId) === value && m.enabled !== false)) return 'manager';
  return 'unauthorized';
}

async function handleAction(request, env, user, state) {
  const body = await request.json().catch(() => null);
  const type = body?.type;
  const p = body?.payload || {};
  const adminOnly = new Set(['addShift','removeShift','setWorkDay','setDayDetails','setSettings','addRecipient','updateRecipient','removeRecipient','addManager','updateManager','removeManager','clearLogs']);
  if (adminOnly.has(type) && !requireRole(user, ['admin'])) return json({ ok: false, error: 'Forbidden' }, 403);
  if (type === 'setTestTarget' && !requireRole(user, ['manager'])) return json({ ok: false, error: 'Only manager can set the monthly target' }, 403);


  if (type === 'setDayDetails') {
    if (!validateDate(p.date)) return json({ ok:false,error:'Invalid date' },400);
    const allowed = new Set(['qa','azs']);
    const types = Array.isArray(p.types) ? [...new Set(p.types.map(String).filter(v => allowed.has(v)))] : [];
    const tests = Math.max(0, Math.min(9999, Math.floor(Number(p.tests || 0))));
    const start = validateTime(p.start) ? p.start : '';
    const end = validateTime(p.end) ? p.end : '';
    const note = cleanText(p.note, 120);

    if (types.length) state.workLog[p.date] = types; else delete state.workLog[p.date];
    if (types.length || tests || start || end || note) {
      state.dayDetails[p.date] = { types, tests, start, end, note, updatedAt:new Date().toISOString() };
    } else {
      delete state.dayDetails[p.date];
    }

    // Calendar is the source of truth for AЗС notifications. Marking a day as AЗС
    // creates/updates its planned shift; removing AЗС removes the shift for that date.
    if (types.includes('azs')) {
      const shiftStart = start || state.settings.shiftStart || '08:00';
      const shiftEnd = end || shiftStart;
      const startMs = naiveLocalMs(p.date, shiftStart);
      let endMs = naiveLocalMs(p.date, shiftEnd);
      if (endMs <= startMs) endMs += 86400000;
      const durationHours = Math.max(1, Math.min(48, (endMs - startMs) / 3600000));
      const existing = state.shifts.find(s => s.date === p.date);
      const nextShift = {
        id: existing?.id || crypto.randomUUID(),
        date: p.date,
        start: shiftStart,
        durationHours,
        note,
        source: 'calendar',
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      state.shifts = state.shifts.filter(s => s.date !== p.date);
      state.shifts.push(nextShift);
      state.shifts.sort((a,b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    } else {
      state.shifts = state.shifts.filter(s => s.date !== p.date);
    }
  }

  if (type === 'setWorkDay') {
    if (!validateDate(p.date)) return json({ ok:false,error:'Invalid date' },400);
    const allowed = new Set(['qa','azs']);
    const values = Array.isArray(p.types) ? [...new Set(p.types.map(String).filter(v => allowed.has(v)))] : [];
    if (values.length) state.workLog[p.date] = values;
    else delete state.workLog[p.date];
  }

  if (type === 'addShift') {
    if (!validateDate(p.date)) return json({ ok:false,error:'Invalid date' },400);
    const shift = {
      id: crypto.randomUUID(),
      date: p.date,
      start: validateTime(p.start) ? p.start : state.settings.shiftStart,
      durationHours: Math.max(1, Math.min(48, Number(p.durationHours || state.settings.shiftDurationHours || 24))),
      note: cleanText(p.note, 120),
      createdAt: new Date().toISOString()
    };
    if (!state.shifts.some(s => s.date === shift.date && s.start === shift.start)) state.shifts.push(shift);
    state.shifts.sort((a,b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  }

  if (type === 'removeShift') state.shifts = state.shifts.filter(s => s.id !== p.id);

  if (type === 'setSettings') {
    if (p.shiftStart && validateTime(p.shiftStart)) state.settings.shiftStart = p.shiftStart;
    if (p.shiftDurationHours != null) state.settings.shiftDurationHours = Math.max(1, Math.min(48, Number(p.shiftDurationHours)));
    if (p.recoveryHours != null) state.settings.recoveryHours = Math.max(0, Math.min(48, Number(p.recoveryHours)));
    if (p.notifyAt && validateTime(p.notifyAt)) state.settings.notifyAt = p.notifyAt;
    if (p.qa && typeof p.qa === 'object') {
      for (const key of DAY_KEYS) {
        if (!p.qa[key]) continue;
        state.settings.qa[key] = {
          enabled: !!p.qa[key].enabled,
          start: validateTime(p.qa[key].start) ? p.qa[key].start : state.settings.qa[key].start,
          end: validateTime(p.qa[key].end) ? p.qa[key].end : state.settings.qa[key].end
        };
      }
    }
  }

  if (type === 'setTestTarget') {
    const month = /^\d{4}-\d{2}$/.test(p.month || '') ? p.month : monthKey(localParts(state.settings.timeZone).date);
    const metric = state.metrics[month] || { completed: 0, target: 0, targetSetBy: null, updatedAt: null };
    metric.target = Math.max(0, Math.floor(Number(p.value || 0)));
    metric.targetSetBy = { id: String(user.id), name: user.name || user.username || user.id, role: user.role };
    metric.updatedAt = new Date().toISOString();
    state.metrics[month] = metric;
  }

  if (type === 'addRecipient') {
    const chatId = cleanText(p.chatId, 40);
    if (!/^-?\d{5,20}$/.test(chatId)) return json({ ok:false,error:'Invalid Telegram chat ID' },400);
    if (!state.recipients.some(r => r.chatId === chatId)) state.recipients.push({ id: crypto.randomUUID(), name: cleanText(p.name,60) || chatId, chatId, enabled: true, createdAt: new Date().toISOString() });
  }
  if (type === 'updateRecipient') {
    const r = state.recipients.find(x => x.id === p.id);
    if (r) { if (p.name != null) r.name = cleanText(p.name,60); if (p.enabled != null) r.enabled = !!p.enabled; }
  }
  if (type === 'removeRecipient') state.recipients = state.recipients.filter(r => r.id !== p.id);

  if (type === 'addManager') {
    const telegramId = cleanText(p.telegramId, 30);
    if (!/^\d{5,20}$/.test(telegramId)) return json({ ok:false,error:'Invalid Telegram user ID' },400);
    if (!state.managers.some(m => m.telegramId === telegramId)) state.managers.push({ id: crypto.randomUUID(), name: cleanText(p.name,60) || telegramId, telegramId, enabled: true, createdAt: new Date().toISOString() });
  }
  if (type === 'updateManager') {
    const m = state.managers.find(x => x.id === p.id);
    if (m) { if (p.name != null) m.name = cleanText(p.name,60); if (p.enabled != null) m.enabled = !!p.enabled; }
  }
  if (type === 'removeManager') state.managers = state.managers.filter(m => m.id !== p.id);
  if (type === 'clearLogs') state.notificationLog = [];

  const saved = await writeState(env, state);
  return json({ ok: true, state: publicStateForRole(saved, user.role) });
}

async function telegramOidcLogin(request, env) {
  if (!authConfigured(env)) return redirect('/?auth=not-configured');
  const url = new URL(request.url);
  const returnToRaw = url.searchParams.get('return') || '/';
  const returnTo = returnToRaw.startsWith('/') && !returnToRaw.startsWith('//') ? returnToRaw : '/';
  const state = randomToken(24);
  const verifier = randomToken(48);
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(verifier));
  const challenge = b64url(new Uint8Array(digest));
  const stub = await storeStub(env);
  await stub.fetch('https://store/auth-flow', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ state, verifier, returnTo }) });
  const callback = `${url.origin}/api/auth/callback`;
  const auth = new URL('https://oauth.telegram.org/auth');
  auth.searchParams.set('client_id', env.TELEGRAM_CLIENT_ID);
  auth.searchParams.set('redirect_uri', callback);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', 'openid profile');
  auth.searchParams.set('state', state);
  auth.searchParams.set('code_challenge', challenge);
  auth.searchParams.set('code_challenge_method', 'S256');
  return redirect(auth.toString());
}

async function verifyTelegramIdToken(idToken, clientId) {
  const [h,p,s] = String(idToken || '').split('.');
  if (!h || !p || !s) throw new Error('Malformed ID token');
  const header = JSON.parse(dec.decode(unb64url(h)));
  const payload = JSON.parse(dec.decode(unb64url(p)));
  if (payload.iss !== 'https://oauth.telegram.org') throw new Error('Invalid issuer');
  if (String(payload.aud) !== String(clientId)) throw new Error('Invalid audience');
  if (!payload.exp || Date.now()/1000 >= Number(payload.exp)) throw new Error('Expired token');
  const jwks = await fetch('https://oauth.telegram.org/.well-known/jwks.json').then(r => r.json());
  const jwk = jwks.keys?.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Unknown signing key');
  const alg = header.alg;
  let importAlg, verifyAlg;
  if (alg === 'RS256') {
    importAlg = { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' };
    verifyAlg = { name:'RSASSA-PKCS1-v1_5' };
  } else if (alg === 'ES256') {
    importAlg = { name:'ECDSA', namedCurve:'P-256' };
    verifyAlg = { name:'ECDSA', hash:'SHA-256' };
  } else throw new Error(`Unsupported alg ${alg}`);
  const key = await crypto.subtle.importKey('jwk', jwk, importAlg, false, ['verify']);
  const ok = await crypto.subtle.verify(verifyAlg, key, unb64url(s), enc.encode(`${h}.${p}`));
  if (!ok) throw new Error('Invalid signature');
  return payload;
}

async function telegramOidcCallback(request, env, ctx) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return json({ ok:false,error:'Missing auth parameters' },400);
  const stub = await storeStub(env);
  const flowRes = await stub.fetch('https://store/auth-flow/take', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ state }) });
  if (!flowRes.ok) return json({ ok:false,error:'Login flow expired' },400);
  const flow = (await flowRes.json()).flow;
  const callback = `${url.origin}/api/auth/callback`;
  const basic = btoa(`${env.TELEGRAM_CLIENT_ID}:${env.TELEGRAM_CLIENT_SECRET}`);
  const tokenRes = await fetch('https://oauth.telegram.org/token', {
    method:'POST',
    headers:{ 'content-type':'application/x-www-form-urlencoded', 'authorization':`Basic ${basic}` },
    body: new URLSearchParams({ grant_type:'authorization_code', code, redirect_uri:callback, client_id:env.TELEGRAM_CLIENT_ID, code_verifier:flow.verifier })
  });
  const tokens = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokens.id_token) return json({ ok:false,error:'Telegram token exchange failed', detail:tokens.error_description || tokens.error || '' },401);
  const claims = await verifyTelegramIdToken(tokens.id_token, env.TELEGRAM_CLIENT_ID);
  const id = String(claims.id || claims.sub || '');
  if (!id) return json({ ok:false,error:'Telegram user ID missing' },401);
  const payload = {
    id,
    name: claims.name || claims.given_name || claims.preferred_username || `Telegram ${id}`,
    username: claims.preferred_username || '',
    picture: claims.picture || '',
    exp: Math.floor(Date.now()/1000) + 2592000
  };
  const session = await signSession(payload, env.AUTH_SECRET);
  try {
    const appState = await readState(env);
    const role = roleForTelegramId(id, env, appState);
    if (env.TELEGRAM_BOT_TOKEN && env.ADMIN_TELEGRAM_ID) {
      const notifyPromise = sendTelegram(env, String(env.ADMIN_TELEGRAM_ID), loginNotificationText(payload, role, appState.settings.timeZone || 'Europe/Kyiv')).catch(() => null);
      if (ctx?.waitUntil) ctx.waitUntil(notifyPromise); else await notifyPromise;
    }
  } catch {}
  return redirect(flow.returnTo || '/', { 'set-cookie': sessionCookie(session) });
}

async function runNotificationCycle(env, force = false) {
  let state = await readState(env);
  const local = localParts(state.settings.timeZone || 'Europe/Kyiv');
  const [notifyHour] = String(state.settings.notifyAt || '19:00').split(':').map(Number);
  if (!force && local.hour !== notifyHour) return { ok:true, skipped:'hour', local };
  const tomorrow = addDays(local.date, 1);
  const absence = absenceForDate(tomorrow, state);
  if (!absence) return { ok:true, skipped:'no-absence', tomorrow };
  const active = state.recipients.filter(r => r.enabled !== false);
  const text = notificationText(absence);
  const results = [];
  for (const recipient of active) {
    const key = `${tomorrow}:${recipient.chatId}`;
    if (!force && state.notificationLog.some(l => l.key === key && l.status === 'sent')) {
      results.push({ recipient: recipient.name, status:'duplicate-skip' });
      continue;
    }
    try {
      await sendTelegram(env, recipient.chatId, text);
      state.notificationLog.push({ id:crypto.randomUUID(), key, date:tomorrow, recipientId:recipient.id, recipientName:recipient.name, chatId:recipient.chatId, status:'sent', text, at:new Date().toISOString() });
      results.push({ recipient:recipient.name, status:'sent' });
    } catch (error) {
      state.notificationLog.push({ id:crypto.randomUUID(), key, date:tomorrow, recipientId:recipient.id, recipientName:recipient.name, chatId:recipient.chatId, status:'error', error:String(error.message || error), at:new Date().toISOString() });
      results.push({ recipient:recipient.name, status:'error', error:String(error.message || error) });
    }
  }
  state.notificationLog = state.notificationLog.slice(-300);
  await writeState(env, state);
  return { ok:true, tomorrow, absence, results };
}

async function sendTomorrowShiftNow(env) {
  let state = await readState(env);
  const local = localParts(state.settings.timeZone || 'Europe/Kyiv');
  const tomorrow = addDays(local.date, 1);
  const shift = state.shifts.find(s => s.date === tomorrow);
  if (!shift) return { ok:true, skipped:'no-azs-shift', tomorrow };

  const absence = absenceForDate(tomorrow, state);
  const active = state.recipients.filter(r => r.enabled !== false);
  if (!active.length) return { ok:true, skipped:'no-recipients', tomorrow, shift };

  const text = tomorrowShiftText(tomorrow, shift, absence);
  const results = [];
  for (const recipient of active) {
    try {
      await sendTelegram(env, recipient.chatId, text);
      state.notificationLog.push({
        id:crypto.randomUUID(), key:`manual:${Date.now()}:${recipient.chatId}`, type:'manual-tomorrow',
        date:tomorrow, recipientId:recipient.id, recipientName:recipient.name, chatId:recipient.chatId,
        status:'sent', text, at:new Date().toISOString()
      });
      results.push({ recipient:recipient.name, status:'sent' });
    } catch (error) {
      state.notificationLog.push({
        id:crypto.randomUUID(), key:`manual:${Date.now()}:${recipient.chatId}`, type:'manual-tomorrow',
        date:tomorrow, recipientId:recipient.id, recipientName:recipient.name, chatId:recipient.chatId,
        status:'error', error:String(error.message || error), at:new Date().toISOString()
      });
      results.push({ recipient:recipient.name, status:'error', error:String(error.message || error) });
    }
  }
  state.notificationLog = state.notificationLog.slice(-300);
  await writeState(env, state);
  return { ok:true, tomorrow, shift, absence, results };
}

async function privateAdminAsset(request, env, state) {
  const url = new URL(request.url);
  const base = adminPath(env);
  if (!base) return null;
  if (url.pathname !== base && url.pathname !== `${base}/` && url.pathname !== `${base}/app.js`) return null;

  const user = await currentUser(request, env, state);
  // Do not reveal whether this private route exists to anonymous or non-admin users.
  if (!requireRole(user, ['admin'])) return new Response('Not found', { status: 404, headers: { 'cache-control':'no-store' } });

  if (url.pathname === base) return redirect(`${base}/`);
  const rewritten = new URL(request.url);
  rewritten.pathname = url.pathname === `${base}/app.js` ? '/admin.js' : '/admin.html';
  const response = await env.ASSETS.fetch(new Request(rewritten, request));
  const headers = new Headers(response.headers);
  headers.set('cache-control','no-store, private');
  headers.set('x-robots-tag','noindex, nofollow, noarchive');
  return new Response(response.body, { status:response.status, statusText:response.statusText, headers });
}

async function serveAsset(request, env) {
  const url = new URL(request.url);
  // Internal admin source files are never addressable directly.
  if (url.pathname === '/admin.html' || url.pathname === '/admin.js') {
    return new Response('Not found', { status:404, headers:{ 'cache-control':'no-store' } });
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const privateBase = adminPath(env);
    if (privateBase && (path === privateBase || path === `${privateBase}/` || path === `${privateBase}/app.js`)) {
      const stateForPrivateRoute = await readState(env);
      const privateResponse = await privateAdminAsset(request, env, stateForPrivateRoute);
      if (privateResponse) return privateResponse;
    }

    if (path === '/api/health') return json({ ok:true, app:'hodynnyk-calendar', version:'0.3.6' });
    if (path === '/api/config') return json({ ok:true, authConfigured:authConfigured(env), app:'Hodynnyk', version:'0.3.6', botUsername:String(env.TELEGRAM_BOT_USERNAME || '') });
    if (path === '/api/auth/login') return telegramOidcLogin(request, env);
    if (path === '/api/auth/callback') {
      try { return await telegramOidcCallback(request, env, ctx); }
      catch (error) { return json({ ok:false,error:String(error.message || error) },401); }
    }
    if (path === '/api/auth/logout') return redirect('/', { 'set-cookie': clearSessionCookie() });

    // Explicit owner check used by the PWA gear button. This avoids silent failures
    // caused by client-side/PWA navigation and never exposes private data to non-admins.
    if (path === '/api/admin/check') {
      const state = await readState(env);
      const user = await currentUser(request, env, state);
      const ownerId = String(env.ADMIN_TELEGRAM_ID || '375938798');
      if (!user || user.role !== 'admin' || String(user.id || '') !== ownerId) {
        return new Response('Not found', { status:404, headers:{ 'cache-control':'no-store' } });
      }
      const base = adminPath(env) || '/last-admin';
      return json({ ok:true, role:'admin', userId:String(user.id), path:`${base}/` }, 200, { 'cache-control':'no-store' });
    }

    // Private convenience entry for the owner account. The real ADMIN_PATH stays server-side.
    if (path === '/api/admin') {
      const state = await readState(env);
      const user = await currentUser(request, env, state);
      const ownerId = String(env.ADMIN_TELEGRAM_ID || '375938798');
      const base = adminPath(env);
      if (!base || !user || user.role !== 'admin' || String(user.id || '') !== ownerId) {
        return new Response('Not found', { status:404, headers:{ 'cache-control':'no-store' } });
      }
      return redirect(`${base}/`);
    }

    if (path.startsWith('/api/')) {
      let state = await readState(env);
      const user = await currentUser(request, env, state);
      if (!user) return json({ ok:false,error:'Unauthorized' },401);
      if (user.role === 'unauthorized') return json({ ok:false,error:'Telegram account is not allowed', user:{ id:user.id,name:user.name,username:user.username } },403);

      if (path === '/api/me') return json({ ok:true,user,authConfigured:authConfigured(env) });
      if (path === '/api/state' && request.method === 'GET') {
        const month = url.searchParams.get('month');
        const out = publicStateForRole(state, user.role);
        if (/^\d{4}-\d{2}$/.test(month || '')) out.computed.monthAbsences[month] = absencesForMonth(month, state);
        return json({ ok:true,user,state:out });
      }
      if (path === '/api/action' && request.method === 'POST') return handleAction(request, env, user, state);
      if (path === '/api/telegram/test' && request.method === 'POST') {
        if (!requireRole(user,['admin'])) return json({ok:false,error:'Forbidden'},403);
        const body = await request.json().catch(() => ({}));
        const recipient = state.recipients.find(r => r.id === body.recipientId);
        if (!recipient) return json({ok:false,error:'Recipient not found'},404);
        try {
          await sendTelegram(env, recipient.chatId, 'Hodynnyk · test notification\nTelegram delivery is configured correctly.');
          state.notificationLog.push({ id:crypto.randomUUID(), key:`test:${Date.now()}`, recipientId:recipient.id, recipientName:recipient.name, chatId:recipient.chatId, status:'sent', text:'Test notification', at:new Date().toISOString() });
          await writeState(env,state);
          return json({ok:true});
        } catch (error) { return json({ok:false,error:String(error.message || error)},502); }
      }
      if (path === '/api/notifications/run' && request.method === 'POST') {
        if (!requireRole(user,['admin'])) return json({ok:false,error:'Forbidden'},403);
        return json(await runNotificationCycle(env, true));
      }
      if (path === '/api/notifications/tomorrow' && request.method === 'POST') {
        if (!requireRole(user,['admin'])) return json({ok:false,error:'Forbidden'},403);
        return json(await sendTomorrowShiftNow(env));
      }
      return json({ ok:false,error:'Not found' },404);
    }

    return serveAsset(request, env);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runNotificationCycle(env, false));
  }
};
