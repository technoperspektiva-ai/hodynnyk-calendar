const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const monthName = d => new Intl.DateTimeFormat('uk-UA', { month:'long', year:'numeric' }).format(d);
const humanDate = value => new Intl.DateTimeFormat('uk-UA', { day:'2-digit', month:'short' }).format(new Date(`${value}T12:00:00`));
const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const WEEK_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
const WEEK_LABELS = {mon:'Пн',tue:'Вт',wed:'Ср',thu:'Чт',fri:'Пт',sat:'Сб',sun:'Нд'};

let viewDate = new Date();
viewDate.setDate(1);
let selected = isoDate(new Date());
let state = null;
let user = null;
let config = null;

function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'content-type':'application/json', ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function loginScreen(message = '') {
  $('#app').innerHTML = `
    <main class="shell login">
      <section class="card loginbox">
        <div class="loginmark">H</div>
        <h1>Hodynnyk</h1>
        <p>${message ? esc(message) : 'Приватний календар АЗС та QA availability.'}</p>
        <div class="actions" style="justify-content:center;margin-top:18px">
          ${config?.authConfigured ? '<a class="btn primary" href="/api/auth/login?return=/">Увійти через Telegram</a>' : '<span class="pill">Telegram login ще не налаштований</span>'}
        </div>
      </section>
    </main>`;
}

function roleLabel() {
  return user?.role === 'manager' ? 'Керівник' : 'Мій профіль';
}

function metricForMonth() {
  const m = monthKey(viewDate);
  return state?.metrics?.[m] || { completed:0, target:0 };
}

function absencesForMonth() {
  return state?.computed?.monthAbsences?.[monthKey(viewDate)] || [];
}

function shiftsForDate(date) {
  return (state?.shifts || []).filter(s => s.date === date);
}

function renderShell() {
  $('#app').innerHTML = `
    <main class="shell role-${esc(user.role)}">
      <header class="topbar">
        <div class="brand">
          <div class="brandmark">H</div>
          <div><h1>Hodynnyk</h1><small>SHIFT / QA CONTROL</small></div>
        </div>
        <div class="userbar">
          <span class="pill green">${roleLabel()}</span>
          ${user?.picture ? `<img class="avatar" src="${esc(user.picture)}" alt="">` : ''}
          <span class="pill">${esc(user?.name || user?.username || 'User')}</span>
          <button class="btn ghost" type="button" data-install-pwa hidden>Встановити</button>
          ${config?.authConfigured ? '<a class="btn ghost" href="/api/auth/logout">Вийти</a>' : ''}
        </div>
      </header>


      <section class="stats" id="stats"></section>

      <section class="grid">
        <div class="stack">
          <section class="card cardpad">
            <div class="calendar-head">
              <div>
                <div class="section-title" style="margin-bottom:5px"><h2>Календар</h2></div>
                <div class="month" id="monthTitle"></div>
              </div>
              <div class="nav">
                <button class="iconbtn" id="prevMonth" aria-label="Попередній місяць">←</button>
                <button class="btn ghost" id="todayMonth">сьогодні</button>
                <button class="iconbtn" id="nextMonth" aria-label="Наступний місяць">→</button>
              </div>
            </div>
            <div class="week"><div>Пн</div><div>Вт</div><div>Ср</div><div>Чт</div><div>Пт</div><div>Сб</div><div>Нд</div></div>
            <div class="days" id="calendarDays"></div>
          </section>

          <section class="card cardpad">
            <div class="section-title"><h2>QA report</h2><span id="reportCount"></span></div>
            <div class="report" id="reportText"></div>
            <div class="actions" style="margin-top:12px">
              <button class="btn primary" id="copyReport">Копіювати</button>
              <button class="btn ghost" id="shareReport">Поділитися</button>
            </div>
          </section>
        </div>

        <aside class="stack">
          <section class="card cardpad" id="testsCard"></section>
          <section class="card cardpad" id="dayCard"></section>
          <section class="card cardpad admin-only" id="settingsCard"></section>
          <section class="card cardpad manager-note">
            <div class="section-title"><h2>Доступ керівника</h2></div>
            <div class="locknote">Ви можете переглядати календар і змінювати тільки місячну планку тестів. Фактичну кількість тестів та робочий графік редагує власник профілю.</div>
          </section>
        </aside>
      </section>
    </main>`;
}

function renderStats() {
  const metric = metricForMonth();
  const absences = absencesForMonth();
  const shifts = (state.shifts || []).filter(s => s.date.startsWith(monthKey(viewDate)));
  const progress = metric.target > 0 ? Math.min(100, Math.round(metric.completed / metric.target * 100)) : 0;
  $('#stats').innerHTML = `
    <div class="stat"><div class="label">Тести / місяць</div><div class="value">${metric.completed || 0}</div><div class="sub">ціль ${metric.target || '—'}</div><div class="progress"><i style="width:${progress}%"></i></div></div>
    <div class="stat"><div class="label">Зміни АЗС</div><div class="value">${shifts.length}</div><div class="sub">у ${esc(monthName(viewDate))}</div></div>
    <div class="stat"><div class="label">QA OFF</div><div class="value">${absences.length}</div><div class="sub">робочих днів з конфліктом</div></div>`;
}

function renderCalendar() {
  $('#monthTitle').textContent = monthName(viewDate);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayOffset);
  const today = isoDate(new Date());
  const absenceSet = new Set(absencesForMonth().map(a => a.date));
  let html = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const date = isoDate(d);
    const inMonth = d.getMonth() === month;
    const shifts = shiftsForDate(date);
    const off = absenceSet.has(date);
    html += `<button class="day ${!inMonth?'out':''} ${date===today?'today':''} ${date===selected?'selected':''}" data-date="${date}">
      <span class="daynum">${d.getDate()}</span>
      <span class="dots">
        ${shifts.length ? `<span class="dot azs">АЗС ${esc(shifts[0].start || state.settings.shiftStart)}</span>` : ''}
        ${off ? '<span class="dot off">QA OFF</span>' : ''}
      </span>
    </button>`;
  }
  $('#calendarDays').innerHTML = html;
  $$('.day').forEach(btn => btn.addEventListener('click', () => {
    selected = btn.dataset.date;
    const d = new Date(`${selected}T12:00:00`);
    if (d.getMonth() !== viewDate.getMonth() || d.getFullYear() !== viewDate.getFullYear()) {
      viewDate = new Date(d.getFullYear(), d.getMonth(), 1);
      refreshMonth();
    } else {
      renderCalendar();
      renderDayCard();
    }
  }));
}

function renderTests() {
  const metric = metricForMonth();
  const setter = metric.targetSetBy?.name ? ` · ${esc(metric.targetSetBy.name)}` : '';
  const adminEditor = user.role === 'admin' ? `
    <div class="actions" style="margin-top:16px">
      <button class="btn" data-inc="1">+1 тест</button>
      <button class="btn" data-inc="5">+5</button>
      <button class="btn ghost" id="setCompleted">Задати свою цифру</button>
    </div>
    <div class="locknote" style="margin-top:14px">Планку встановлює тільки керівник. Для вас вона доступна лише для перегляду.</div>` : `
    <div class="target-editor" style="margin-top:16px">
      <div class="field"><label>Планка на місяць</label><input class="input" id="targetValue" type="number" min="0" value="${metric.target || 0}"></div>
      <button class="btn primary" id="saveTarget">Зберегти планку</button>
    </div>
    <div class="locknote" style="margin-top:14px">Виконану кількість тестів редагує тільки власник профілю.</div>`;
  $('#testsCard').innerHTML = `
    <div class="section-title"><h2>Monthly tests</h2><span>${esc(monthKey(viewDate))}</span></div>
    <div class="big-num">${metric.completed || 0}<span style="font-size:18px;color:var(--muted);font-weight:500"> / ${metric.target || '—'}</span></div>
    <div class="helper" style="margin:5px 0 0">Виконано / планка${setter}</div>
    ${adminEditor}`;

  if (user.role === 'admin') {
    $$('[data-inc]').forEach(btn => btn.addEventListener('click', async () => {
      await action('incrementTests', { month:monthKey(viewDate), delta:Number(btn.dataset.inc) });
    }));
    $('#setCompleted')?.addEventListener('click', async () => {
      const current = metricForMonth().completed || 0;
      const v = prompt('Скільки тестів виконано цього місяця?', current);
      if (v == null) return;
      await action('setTestsCompleted', { month:monthKey(viewDate), value:Number(v) });
    });
  } else {
    $('#saveTarget')?.addEventListener('click', async () => {
      await action('setTestTarget', { month:monthKey(viewDate), value:Number($('#targetValue').value || 0) });
      toast('Планку збережено');
    });
  }
}

function renderDayCard() {
  const shifts = shiftsForDate(selected);
  const editable = user.role === 'admin';
  const shift = shifts[0];
  $('#dayCard').innerHTML = `
    <div class="section-title"><h2>${esc(humanDate(selected))}</h2><span>${shift ? 'АЗС' : 'вільно'}</span></div>
    ${editable ? `
      <div class="formrow">
        <div class="field"><label>Старт</label><input id="shiftStart" class="input" type="time" value="${esc(shift?.start || state.settings.shiftStart || '08:00')}"></div>
        <div class="field"><label>Тривалість, год</label><input id="shiftDuration" class="input" type="number" min="1" max="48" value="${esc(shift?.durationHours || state.settings.shiftDurationHours || 24)}"></div>
      </div>
      <div class="field" style="margin-bottom:12px"><label>Нотатка</label><input id="shiftNote" class="input" maxlength="120" value="${esc(shift?.note || '')}" placeholder="необов'язково"></div>
      <div class="actions">
        ${shift ? '<button class="btn danger" id="removeShift">Видалити зміну</button>' : '<button class="btn primary" id="addShift">Додати зміну</button>'}
      </div>` : `
      <div class="helper">${shift ? `Зміна АЗС: ${esc(shift.start)} · ${esc(shift.durationHours)} год.` : 'На цю дату зміна АЗС не внесена.'}</div>`}`;
  $('#addShift')?.addEventListener('click', async () => {
    await action('addShift', { date:selected, start:$('#shiftStart').value, durationHours:Number($('#shiftDuration').value), note:$('#shiftNote').value });
    toast('Зміну додано');
  });
  $('#removeShift')?.addEventListener('click', async () => {
    if (!confirm('Видалити цю зміну АЗС?')) return;
    await action('removeShift', { id:shift.id });
    toast('Зміну видалено');
  });
}

function renderSettings() {
  if (user.role !== 'admin') return;
  const s = state.settings;
  $('#settingsCard').innerHTML = `
    <div class="section-title"><h2>Робоча логіка</h2><span>Admin</span></div>
    <div class="formrow">
      <div class="field"><label>АЗС старт</label><input id="setShiftStart" class="input" type="time" value="${esc(s.shiftStart)}"></div>
      <div class="field"><label>АЗС, год</label><input id="setDuration" class="input" type="number" min="1" max="48" value="${esc(s.shiftDurationHours)}"></div>
    </div>
    <div class="formrow">
      <div class="field"><label>Recovery, год</label><input id="setRecovery" class="input" type="number" min="0" max="48" value="${esc(s.recoveryHours || 0)}"></div>
      <div class="field"><label>Notify hour</label><input id="setNotify" class="input" type="time" step="3600" value="${esc((s.notifyAt || '19:00').slice(0,3)+'00')}"></div>
    </div>
    <div class="section-title" style="margin-top:16px"><h2>QA графік</h2><span>по днях</span></div>
    <div class="list" id="qaRows">
      ${WEEK_KEYS.map(k => { const q=s.qa[k]; return `<div class="rowitem"><label style="display:flex;align-items:center;gap:8px;min-width:58px"><input data-qa-enabled="${k}" type="checkbox" ${q.enabled?'checked':''}> ${WEEK_LABELS[k]}</label><div style="display:flex;gap:6px"><input data-qa-start="${k}" class="input" style="width:96px" type="time" value="${esc(q.start)}"><input data-qa-end="${k}" class="input" style="width:96px" type="time" value="${esc(q.end)}"></div></div>` }).join('')}
    </div>
    <button class="btn primary" id="saveSettings" style="margin-top:12px">Зберегти графік</button>`;
  $('#saveSettings').addEventListener('click', async () => {
    const qa = {};
    WEEK_KEYS.forEach(k => qa[k] = {
      enabled:$(`[data-qa-enabled="${k}"]`).checked,
      start:$(`[data-qa-start="${k}"]`).value,
      end:$(`[data-qa-end="${k}"]`).value
    });
    await action('setSettings', {
      shiftStart:$('#setShiftStart').value,
      shiftDurationHours:Number($('#setDuration').value),
      recoveryHours:Number($('#setRecovery').value),
      notifyAt:$('#setNotify').value.slice(0,3)+'00',
      qa
    });
    toast('Графік оновлено');
  });
}

function renderReport() {
  const list = absencesForMonth();
  $('#reportCount').textContent = `${list.length} дн.`;
  const title = `QA availability · ${monthName(viewDate)}`;
  const body = list.length
    ? list.map(a => `• ${humanDate(a.date)} — відсутній ${a.qaStart}–${a.qaEnd}`).join('\n')
    : 'Конфліктів із QA-графіком немає.';
  $('#reportText').textContent = `${title}\n${body}`;
}

async function action(type, payload) {
  try {
    const data = await api('/api/action', { method:'POST', body:JSON.stringify({ type, payload }) });
    state = { ...state, ...data.state, computed:state.computed };
    await refreshMonth();
  } catch (e) {
    toast(e.message);
  }
}

async function refreshMonth() {
  try {
    const data = await api(`/api/state?month=${encodeURIComponent(monthKey(viewDate))}`);
    state = data.state;
    user = data.user;
    renderStats();
    renderCalendar();
    renderTests();
    renderDayCard();
    renderSettings();
    renderReport();
  } catch (e) {
    if (e.status === 401) loginScreen();
    else toast(e.message);
  }
}

function bindStaticEvents() {
  $('#prevMonth').addEventListener('click', () => { viewDate.setMonth(viewDate.getMonth()-1); refreshMonth(); });
  $('#nextMonth').addEventListener('click', () => { viewDate.setMonth(viewDate.getMonth()+1); refreshMonth(); });
  $('#todayMonth').addEventListener('click', () => { viewDate = new Date(); viewDate.setDate(1); selected = isoDate(new Date()); refreshMonth(); });
  $('#copyReport').addEventListener('click', async () => { await navigator.clipboard.writeText($('#reportText').textContent); toast('Звіт скопійовано'); });
  $('#shareReport').addEventListener('click', async () => {
    const text = $('#reportText').textContent;
    if (navigator.share) await navigator.share({ title:'Hodynnyk · QA availability', text }).catch(()=>{});
    else { await navigator.clipboard.writeText(text); toast('Звіт скопійовано'); }
  });
}

async function boot() {
  try {
    config = await api('/api/config');
    const data = await api(`/api/state?month=${encodeURIComponent(monthKey(viewDate))}`);
    user = data.user;
    state = data.state;
    renderShell();
    bindStaticEvents();
    renderStats(); renderCalendar(); renderTests(); renderDayCard(); renderSettings(); renderReport();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
  } catch (e) {
    if (e.status === 401) loginScreen();
    else if (e.status === 403) loginScreen(`Telegram акаунт не має доступу. ID: ${e.data?.user?.id || '—'}`);
    else loginScreen(`Помилка запуску: ${e.message}`);
  }
}

boot();
