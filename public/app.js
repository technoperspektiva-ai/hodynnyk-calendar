const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const monthName = d => new Intl.DateTimeFormat('uk-UA', { month:'long', year:'numeric' }).format(d);
const humanDate = value => new Intl.DateTimeFormat('uk-UA', { weekday:'long', day:'numeric', month:'long', year:'numeric' }).format(new Date(`${value}T12:00:00`));
const shortDate = value => new Intl.DateTimeFormat('uk-UA', { day:'2-digit', month:'2-digit', year:'numeric' }).format(new Date(`${value}T12:00:00`));

let viewDate = new Date();
viewDate.setDate(1);
let state = null;
let user = null;
let config = null;
let selected = isoDate(new Date());

function toast(text) {
  const el = $('#toast');
  if (!el) return;
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

function finishBoot() {
  const el = $('#bootSplash');
  if (!el) return;
  requestAnimationFrame(() => {
    el.classList.add('done');
    setTimeout(() => el.remove(), 420);
  });
}

function loginScreen(message = '') {
  $('#app').innerHTML = `
    <main class="welcome-shell">
      <section class="welcome-content">
        <div class="brand warm-brand"><img class="brand-icon" src="/icons/icon-192.png" alt=""><div><h1>Календарь робочих днів</h1><small>WORK CALENDAR</small></div></div>
        <span class="welcome-kicker">QA · АЗС · ТЕСТИ</span>
        <h2>Робочий календар без зайвого.</h2>
        <p>${message ? esc(message) : 'Увійди через Telegram, натисни дату та внеси день у кілька дотиків.'}</p>
        <div class="actions welcome-actions">
          ${config?.authConfigured ? '<a class="btn primary" href="/api/auth/login?return=/">Увійти через Telegram</a>' : '<span class="pill">Telegram login ще не налаштований</span>'}
          <button class="btn ghost" type="button" data-install-pwa hidden>Встановити PWA</button>
        </div>
      </section>
    </main>`;
  finishBoot();
}

function detailForDate(date) {
  const raw = state?.dayDetails?.[date] || {};
  const fallbackTypes = Array.isArray(state?.workLog?.[date]) ? state.workLog[date] : [];
  const shift = (state?.shifts || []).find(s => s.date === date);
  const sourceTypes = Array.isArray(raw.types) ? raw.types : fallbackTypes;
  const types = [...new Set(sourceTypes.filter(t => t === 'qa' || t === 'azs'))];
  return {
    types,
    tests: Math.max(0, Number(raw.tests || 0)),
    start: raw.start || shift?.start || '',
    end: raw.end || '',
    note: raw.note || ''
  };
}

function monthTarget() {
  return Math.max(0, Number(state?.metrics?.[monthKey(viewDate)]?.target || 0));
}

function monthStats() {
  const key = monthKey(viewDate);
  let qa = 0, azs = 0, tests = 0, workDays = 0;
  const dates = new Set([
    ...Object.keys(state?.workLog || {}),
    ...Object.keys(state?.dayDetails || {})
  ]);
  for (const date of dates) {
    if (!date.startsWith(key)) continue;
    const d = detailForDate(date);
    if (d.types.includes('qa')) qa++;
    if (d.types.includes('azs')) azs++;
    if (d.types.length) workDays++;
    tests += Math.max(0, Number(d.tests || 0));
  }
  return { qa, azs, tests, workDays, target:monthTarget() };
}

function absenceSetForMonth() {
  return new Set((state?.computed?.monthAbsences?.[monthKey(viewDate)] || []).map(x => x.date));
}

function roleLabel() {
  return user?.role === 'manager' ? 'Керівник' : 'Мій календар';
}

function renderShell() {
  $('#app').innerHTML = `
    <main class="calendar-app role-${esc(user.role)}">
      <header class="appbar">
        <div class="brand compact-brand">
          <img class="brand-icon" src="/icons/icon-192.png" alt="">
          <div><h1>Календарь робочих днів</h1><small>${esc(roleLabel())}</small></div>
        </div>
        <div class="appbar-actions">
          ${user?.picture ? `<img class="avatar" src="${esc(user.picture)}" alt="">` : ''}
          ${String(user?.id || '') === '375938798' ? '<a class="iconbtn soft admin-entry" href="/api/admin" aria-label="Адмін-панель" title="Адмін-панель">⚙</a>' : ''}
          <button class="install-chip" type="button" data-install-pwa hidden aria-label="Встановити PWA" title="Встановити PWA">PWA</button>
          <a class="iconbtn soft" href="/api/auth/logout" aria-label="Вийти">↗</a>
        </div>
      </header>

      <section class="calendar-stage">
        <section class="calendar-card">
          <div class="calendar-toolbar">
            <button class="iconbtn month-arrow" id="prevMonth" aria-label="Попередній місяць">←</button>
            <button class="month-button" id="todayMonth" type="button"><span id="monthTitle"></span><small>натисни, щоб повернутись до сьогодні</small></button>
            <button class="iconbtn month-arrow" id="nextMonth" aria-label="Наступний місяць">→</button>
            <div class="calendar-tools">
              <button class="btn export-btn" id="exportExcel" type="button">Excel</button>
              ${user.role === 'manager' ? '<button class="iconbtn manager-sync-btn" id="syncMyTelegram" type="button" aria-label="Синхронізувати Telegram" title="Синхронізувати Telegram">↻</button>' : ''}
            </div>
          </div>

          <div class="month-summary" id="monthSummary"></div>

          <div class="week"><div>Пн</div><div>Вт</div><div>Ср</div><div>Чт</div><div>Пт</div><div>Сб</div><div>Нд</div></div>
          <div class="days clean-days" id="calendarDays"></div>

          <div class="calendar-legend">
            <span><i class="legend-dot qa"></i>QA</span>
            <span><i class="legend-dot azs"></i>АЗС</span>
            <span class="legend-off"><i class="legend-dot off"></i>QA недоступний</span>
            <span class="legend-note">Натисни на дату, щоб переглянути день</span>
          </div>
        </section>
      </section>
    </main>
    <div id="modalRoot"></div>`;
  finishBoot();
}

function renderSummary() {
  const s = monthStats();
  const progress = s.target > 0 ? Math.min(100, Math.round(s.tests / s.target * 100)) : 0;
  const targetClickable = user.role === 'manager' ? 'summary-action' : '';
  $('#monthSummary').innerHTML = `
    <div class="summary-item"><span>QA</span><b>${s.qa}</b></div>
    <div class="summary-item"><span>АЗС</span><b>${s.azs}</b></div>
    <div class="summary-item"><span>Тести</span><b>${s.tests}</b></div>
    <button class="summary-item ${targetClickable}" id="targetSummary" type="button" ${user.role === 'manager' ? '' : 'disabled'}>
      <span>План</span><b>${s.target || '—'}</b>${user.role === 'manager' ? '<em>змінити</em>' : ''}
    </button>
    <div class="summary-progress" aria-label="Прогрес тестів"><i style="width:${progress}%"></i></div>`;
  $('#targetSummary')?.addEventListener('click', () => {
    if (user.role === 'manager') openTargetModal();
  });
}

function renderCalendar() {
  $('#monthTitle').textContent = monthName(viewDate);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayOffset);
  const today = isoDate(new Date());
  const offSet = absenceSetForMonth();
  let html = '';

  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const date = isoDate(d);
    const inMonth = d.getMonth() === month;
    const detail = detailForDate(date);
    const qa = detail.types.includes('qa');
    const azs = detail.types.includes('azs');
    const off = offSet.has(date);
    html += `<button class="day clean-day ${!inMonth?'out':''} ${date===today?'today':''}" data-date="${date}" aria-label="${esc(shortDate(date))}">
      <span class="daynum">${d.getDate()}</span>
      ${detail.tests > 0 ? `<span class="test-mini">${detail.tests}</span>` : ''}
      <span class="day-marks">
        ${qa ? '<i class="mark qa" title="QA"></i>' : ''}
        ${azs ? '<i class="mark azs" title="АЗС"></i>' : ''}
        ${off ? '<i class="mark off" title="QA недоступний"></i>' : ''}
      </span>
    </button>`;
  }
  $('#calendarDays').innerHTML = html;
  $$('.day[data-date]').forEach(btn => btn.addEventListener('click', () => {
    selected = btn.dataset.date;
    const clicked = new Date(`${selected}T12:00:00`);
    const changedMonth = clicked.getMonth() !== viewDate.getMonth() || clicked.getFullYear() !== viewDate.getFullYear();
    if (changedMonth) {
      viewDate = new Date(clicked.getFullYear(), clicked.getMonth(), 1);
      refreshMonth().then(() => openDayModal(selected));
    } else {
      openDayModal(selected);
    }
  }));
}

function toggleModalType(type) {
  const btn = $(`[data-type="${type}"]`, $('#dayModal'));
  if (!btn || btn.disabled) return;
  btn.classList.toggle('active');
  const any = $$('[data-type].active', $('#dayModal')).map(x => x.dataset.type);
  const start = $('#dayStart');
  const end = $('#dayEnd');
  if (any.length === 1 && !start.value && !end.value) {
    if (any[0] === 'qa') { start.value = '09:00'; end.value = '18:00'; }
    if (any[0] === 'azs') { start.value = state.settings.shiftStart || '08:00'; end.value = state.settings.shiftStart || '08:00'; }
  }
}

function openDayModal(date) {
  selected = date;
  const d = detailForDate(date);
  const editable = user.role === 'admin';
  const off = absenceSetForMonth().has(date);
  const title = humanDate(date);
  const testsLabel = d.tests ? `${d.tests} тестів` : 'тести не внесені';

  $('#modalRoot').innerHTML = `
    <div class="modal-backdrop" id="dayModal" role="dialog" aria-modal="true" aria-labelledby="dayModalTitle">
      <section class="modal-sheet">
        <div class="modal-head">
          <div><span class="modal-kicker">${esc(shortDate(date))}</span><h2 id="dayModalTitle">${esc(title)}</h2></div>
          <button class="modal-close" type="button" data-close-modal aria-label="Закрити">×</button>
        </div>

        <div class="modal-body">
          <div class="modal-section">
            <label class="modal-label">Робота</label>
            <div class="type-picker">
              <button class="type-choice ${d.types.includes('qa')?'active':''}" data-type="qa" type="button" ${editable?'':'disabled'}><i></i><b>QA</b></button>
              <button class="type-choice ${d.types.includes('azs')?'active':''}" data-type="azs" type="button" ${editable?'':'disabled'}><i></i><b>АЗС</b></button>
            </div>
            ${off ? '<div class="modal-alert">Цей день перетинається з плановою зміною АЗС → QA недоступний</div>' : ''}
          </div>

          <div class="modal-section">
            <label class="modal-label">Графік дня</label>
            <div class="time-grid">
              <label><span>Початок</span><input id="dayStart" class="modal-input" type="time" value="${esc(d.start)}" ${editable?'':'disabled'}></label>
              <label><span>Кінець</span><input id="dayEnd" class="modal-input" type="time" value="${esc(d.end)}" ${editable?'':'disabled'}></label>
            </div>
          </div>

          <div class="modal-section">
            <label class="modal-label" for="dayTests">Виконані тести</label>
            <div class="tests-editor ${editable?'editable':''}">
              <input id="dayTests" type="number" min="0" max="9999" inputmode="numeric" value="${d.tests || 0}" ${editable?'':'disabled'} aria-label="Кількість виконаних тестів">
              <span>${editable ? 'натисни на цифру, щоб виправити' : esc(testsLabel)}</span>
            </div>
          </div>

          <div class="modal-section note-section">
            <label class="modal-label" for="dayNote">Нотатка <small>необов’язково</small></label>
            <textarea id="dayNote" class="modal-input modal-note" maxlength="120" placeholder="Коротко про день" ${editable?'':'disabled'}>${esc(d.note)}</textarea>
          </div>
        </div>

        <div class="modal-actions">
          ${editable ? '<button class="btn danger-quiet" id="clearDay" type="button">Очистити день</button><button class="btn primary modal-save" id="saveDay" type="button">Зберегти</button>' : '<button class="btn primary modal-save" data-close-modal type="button">Готово</button>'}
        </div>
      </section>
    </div>`;

  const root = $('#dayModal');
  $$('[data-close-modal]', root).forEach(el => el.addEventListener('click', closeModal));
  root.addEventListener('click', e => { if (e.target === root) closeModal(); });
  document.addEventListener('keydown', modalEscape, { once:true });

  if (editable) {
    $$('[data-type]', root).forEach(btn => btn.addEventListener('click', () => toggleModalType(btn.dataset.type)));
    $('#dayTests')?.addEventListener('focus', e => e.target.select());
    $('#clearDay')?.addEventListener('click', async () => {
      if (!confirm('Очистити всі дані цього дня?')) return;
      await saveDayDetails({ types:[], start:'', end:'', tests:0, note:'' });
    });
    $('#saveDay')?.addEventListener('click', async () => {
      const types = $$('[data-type].active', root).map(x => x.dataset.type);
      await saveDayDetails({
        types,
        start:$('#dayStart').value,
        end:$('#dayEnd').value,
        tests:Number($('#dayTests').value || 0),
        note:$('#dayNote').value
      });
    });
  }
}

function modalEscape(e) {
  if (e.key === 'Escape') closeModal();
}

function closeModal() {
  $('#modalRoot').innerHTML = '';
}

async function saveDayDetails(payload) {
  try {
    const result = await api('/api/action', {
      method:'POST',
      body:JSON.stringify({ type:'setDayDetails', payload:{ date:selected, ...payload } })
    });
    state = result.state;
    localStorage.setItem('hodynnyk:last-state', JSON.stringify(state));
    await refreshMonth(false);
    closeModal();
    toast('День збережено');
  } catch (error) {
    toast(error.message);
  }
}

function openTargetModal() {
  const target = monthTarget();
  $('#modalRoot').innerHTML = `
    <div class="modal-backdrop" id="targetModal" role="dialog" aria-modal="true">
      <section class="modal-sheet compact-modal">
        <div class="modal-head"><div><span class="modal-kicker">${esc(monthName(viewDate))}</span><h2>Планка тестів</h2></div><button class="modal-close" data-close-modal type="button">×</button></div>
        <div class="modal-body"><div class="target-big"><input id="targetValue" type="number" min="0" max="99999" inputmode="numeric" value="${target}"><span>тестів за місяць</span></div></div>
        <div class="modal-actions"><button class="btn primary modal-save" id="saveTarget" type="button">Зберегти планку</button></div>
      </section>
    </div>`;
  $$('[data-close-modal]').forEach(el => el.addEventListener('click', closeModal));
  $('#targetValue').focus(); $('#targetValue').select();
  $('#saveTarget').addEventListener('click', async () => {
    try {
      const d = await api('/api/action', { method:'POST', body:JSON.stringify({ type:'setTestTarget', payload:{ month:monthKey(viewDate), value:Number($('#targetValue').value || 0) } }) });
      state = d.state;
      closeModal(); renderSummary(); toast('Планку збережено');
    } catch (e) { toast(e.message); }
  });
}

async function refreshMonth(fetchState = true) {
  if (fetchState) {
    const d = await api(`/api/state?month=${encodeURIComponent(monthKey(viewDate))}`);
    user = d.user;
    state = d.state;
    localStorage.setItem('hodynnyk:last-state', JSON.stringify(state));
  } else {
    const d = await api(`/api/state?month=${encodeURIComponent(monthKey(viewDate))}`);
    user = d.user;
    state = d.state;
    localStorage.setItem('hodynnyk:last-state', JSON.stringify(state));
  }
  renderSummary();
  renderCalendar();
}

function setupEvents() {
  $('#prevMonth').addEventListener('click', async () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth()-1, 1);
    await refreshMonth();
  });
  $('#nextMonth').addEventListener('click', async () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth()+1, 1);
    await refreshMonth();
  });
  $('#todayMonth').addEventListener('click', async () => {
    const now = new Date(); viewDate = new Date(now.getFullYear(), now.getMonth(), 1); selected = isoDate(now);
    await refreshMonth();
  });
  $('#exportExcel').addEventListener('click', exportCurrentMonthXlsx);
  $('#syncMyTelegram')?.addEventListener('click', syncMyTelegram);
}

async function syncMyTelegram() {
  const btn = $('#syncMyTelegram');
  if (!btn) return;
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const out = await api('/api/telegram/sync-self', { method:'POST' });
    toast(out.message || 'Telegram синхронізовано');
  } catch (error) {
    toast(error.message || 'Не вдалося синхронізувати Telegram');
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

// Minimal dependency-free XLSX writer (ZIP store + inline strings).
function crc32(bytes) {
  if (!crc32.table) {
    crc32.table = Array.from({length:256}, (_, n) => {
      let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1); return c>>>0;
    });
  }
  let c=0xffffffff; for(const b of bytes) c=crc32.table[(c^b)&255]^(c>>>8); return (c^0xffffffff)>>>0;
}
function le16(n){return Uint8Array.of(n&255,(n>>>8)&255)}
function le32(n){return Uint8Array.of(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255)}
function joinBytes(parts){const len=parts.reduce((a,b)=>a+b.length,0),out=new Uint8Array(len);let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out}
function zipStore(files) {
  const enc = new TextEncoder(), locals=[], centrals=[]; let offset=0;
  for (const file of files) {
    const name=enc.encode(file.name), data=typeof file.data==='string'?enc.encode(file.data):file.data, crc=crc32(data);
    const local=joinBytes([le32(0x04034b50),le16(20),le16(0),le16(0),le16(0),le16(0),le32(crc),le32(data.length),le32(data.length),le16(name.length),le16(0),name,data]);
    locals.push(local);
    const central=joinBytes([le32(0x02014b50),le16(20),le16(20),le16(0),le16(0),le16(0),le16(0),le32(crc),le32(data.length),le32(data.length),le16(name.length),le16(0),le16(0),le16(0),le16(0),le32(0),le32(offset),name]);
    centrals.push(central); offset += local.length;
  }
  const centralSize=centrals.reduce((a,b)=>a+b.length,0);
  const end=joinBytes([le32(0x06054b50),le16(0),le16(0),le16(files.length),le16(files.length),le32(centralSize),le32(offset),le16(0)]);
  return joinBytes([...locals,...centrals,end]);
}
function xmlEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))}
function colName(n){let s='';while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
function xlsxCell(value,row,col,style=0){const ref=`${colName(col)}${row}`;if(typeof value==='number'&&Number.isFinite(value))return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;return `<c r="${ref}" t="inlineStr" s="${style}"><is><t>${xmlEsc(value)}</t></is></c>`}
function buildXlsx(rows) {
  const sheetRows = rows.map((row,ri)=>`<row r="${ri+1}">${row.map((v,ci)=>xlsxCell(v,ri+1,ci+1,ri===0?1:0)).join('')}</row>`).join('');
  const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:H${rows.length}"/><cols><col min="1" max="1" width="13" customWidth="1"/><col min="2" max="2" width="14" customWidth="1"/><col min="3" max="3" width="16" customWidth="1"/><col min="4" max="5" width="11" customWidth="1"/><col min="6" max="6" width="10" customWidth="1"/><col min="7" max="7" width="34" customWidth="1"/><col min="8" max="8" width="12" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:H${rows.length}"/></worksheet>`;
  const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hodynnyk" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEADBBF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const types=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wbRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return zipStore([
    {name:'[Content_Types].xml',data:types},{name:'_rels/.rels',data:rootRels},{name:'xl/workbook.xml',data:workbook},{name:'xl/_rels/workbook.xml.rels',data:wbRels},{name:'xl/worksheets/sheet1.xml',data:sheet},{name:'xl/styles.xml',data:styles}
  ]);
}

function exportCurrentMonthXlsx() {
  const key = monthKey(viewDate);
  const [year, month] = key.split('-').map(Number);
  const days = new Date(year, month, 0).getDate();
  const offSet = absenceSetForMonth();
  const rows = [['Дата','День','Робота','Початок','Кінець','Тести','Нотатка','QA статус']];
  const weekdays = new Intl.DateTimeFormat('uk-UA',{weekday:'long'});
  for (let day=1; day<=days; day++) {
    const date = `${year}-${pad(month)}-${pad(day)}`;
    const d = detailForDate(date);
    if (!d.types.length && !d.tests && !d.start && !d.end && !d.note && !offSet.has(date)) continue;
    const work = d.types
      .filter(t => t === 'qa' || t === 'azs')
      .map(t => t === 'qa' ? 'QA' : 'АЗС')
      .join(' + ');
    rows.push([date, weekdays.format(new Date(`${date}T12:00:00`)), work, d.start, d.end, d.tests || 0, d.note, offSet.has(date)?'QA недоступний':'']);
  }
  if (rows.length === 1) rows.push([`${key}`, '', 'Даних за місяць ще немає', '', '', 0, '', '']);
  rows.push(['','','','','','', '', '']);
  const s = monthStats();
  rows.push(['Підсумок','','QA днів',s.qa,'АЗС днів',s.azs,'Тести',s.tests]);
  rows.push(['План тестів',s.target || 0,'','','','','','']);

  const bytes = buildXlsx(rows);
  const blob = new Blob([bytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `hodynnyk-${key}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  toast('Excel-файл збережено');
}

async function boot() {
  try {
    config = await api('/api/config');
    const d = await api(`/api/state?month=${encodeURIComponent(monthKey(viewDate))}`);
    user = d.user; state = d.state;
    localStorage.setItem('hodynnyk:last-state', JSON.stringify(state));
    renderShell(); renderSummary(); renderCalendar(); setupEvents();
  } catch (error) {
    if (error.status === 401) return loginScreen();
    if (error.status === 403) return loginScreen('Цей Telegram-акаунт ще не має доступу до календаря.');
    loginScreen(`Помилка підключення: ${error.message}`);
  }
}

boot();
