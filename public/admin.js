const $ = (s, root=document) => root.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let state=null, user=null, config=null;

function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2200)}
async function api(url,options={}){const r=await fetch(url,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.error||`HTTP ${r.status}`);e.status=r.status;e.data=d;throw e}return d}

function blocked(message){$('#app').innerHTML=`<main class="shell login"><section class="card loginbox"><img class="brand-icon login-brand-icon" src="/icons/icon-192.png" alt=""><h1>Календарь робочих днів</h1><p>${esc(message)}</p><div class="actions" style="justify-content:center;margin-top:18px"><a class="btn" href="/">← Календар</a>${message.includes('авториза')?`<a class="btn primary" href="/api/auth/login?return=${encodeURIComponent(location.pathname)}">Telegram login</a>`:''}</div></section></main>`}

function shell(){
  $('#app').innerHTML=`<main class="shell">
    <header class="topbar admin-topbar"><div class="brand admin-brand"><img class="brand-icon" src="/icons/icon-192.png" alt=""><div><h1>Календарь робочих днів</h1><small>CONTROL</small></div></div><div class="userbar admin-userbar"><div class="admin-user-meta"><span class="pill green">Admin</span><span class="pill">${esc(user.name||user.username||user.id)}</span></div><div class="admin-nav-actions"><a class="btn ghost" href="/">Календар</a>${config.authConfigured?'<a class="btn ghost" href="/api/auth/logout">Вийти</a>':''}</div></div></header>
    <section class="admin-layout">
      <aside class="card side"><a class="active" href="#recipients">Recipients</a><a href="#managers">Managers</a><a href="#logs">Delivery log</a></aside>
      <div class="stack">
        <section class="card cardpad" id="recipients"></section>
        <section class="card cardpad" id="managers"></section>
        <section class="card cardpad" id="logs"></section>
      </div>
    </section>
  </main>`;
}

async function action(type,payload){const d=await api('/api/action',{method:'POST',body:JSON.stringify({type,payload})});state={...state,...d.state};renderAll()}

function renderRecipients(){
  const rows=state.recipients||[];
  $('#recipients').innerHTML=`
    <div class="section-title"><h2>Telegram recipients</h2><span>${rows.length}</span></div>
    <div class="formrow"><div class="field"><label>Назва</label><input id="rName" class="input" placeholder="QA Lead"></div><div class="field"><label>Telegram chat ID</label><input id="rChat" class="input" placeholder="123456789 або -100…"></div></div>
    <button class="btn primary" id="addRecipient">Додати отримувача</button>
    <div class="list" style="margin-top:14px">${rows.length?rows.map(r=>`<div class="rowitem"><div><div class="name">${esc(r.name)}</div><div class="meta">chat_id ${esc(r.chatId)}${r.telegramUserId?` · user ${esc(r.telegramUserId)}`:''}</div></div><div class="actions"><button class="switch ${r.enabled!==false?'on':''}" data-toggle-r="${esc(r.id)}" aria-label="toggle"></button><button class="btn ghost" data-test-r="${esc(r.id)}">test</button><button class="btn danger" data-del-r="${esc(r.id)}">×</button></div></div>`).join(''):'<div class="empty">Отримувачів поки немає.</div>'}</div>
    <div class="actions admin-action-grid" style="margin-top:14px">
      <button class="btn primary" id="sendTomorrow">Надіслати про завтра</button>
      <button class="btn" id="runNow">Запустити QA-перевірку</button>
      <button class="btn ghost" id="syncBot">Синхронізувати бот</button>
      ${config?.botUsername ? `<a class="btn ghost bot-open" href="https://t.me/${esc(config.botUsername)}" target="_blank" rel="noopener">Відкрити @${esc(config.botUsername)}</a>` : ''}
    </div>`;
  $('#addRecipient').onclick=async()=>{try{await action('addRecipient',{name:$('#rName').value,chatId:$('#rChat').value});toast('Отримувача додано')}catch(e){toast(e.message)}};
  $$('[data-toggle-r]').forEach(b=>b.onclick=async()=>{const r=rows.find(x=>x.id===b.dataset.toggleR);await action('updateRecipient',{id:r.id,enabled:r.enabled===false});});
  $$('[data-del-r]').forEach(b=>b.onclick=async()=>{if(confirm('Видалити отримувача?'))await action('removeRecipient',{id:b.dataset.delR})});
  $$('[data-test-r]').forEach(b=>b.onclick=async()=>{try{await api('/api/telegram/test',{method:'POST',body:JSON.stringify({recipientId:b.dataset.testR})});toast('Тест надіслано')}catch(e){toast(e.message)}finally{await reload().catch(()=>{})}});
  $('#sendTomorrow').onclick=async()=>{
    try{
      const d=await api('/api/notifications/tomorrow',{method:'POST',body:'{}'});
      if(d.skipped==='no-azs-shift') toast('На завтра немає зміни АЗС');
      else if(d.skipped==='no-recipients') toast('Немає активних отримувачів');
      else { const sent=(d.results||[]).filter(x=>x.status==='sent').length; toast(`Надіслано: ${sent}`); }
      await reload();
    }catch(e){toast(e.message)}
  };
  $('#runNow').onclick=async()=>{try{const d=await api('/api/notifications/run',{method:'POST',body:'{}'});if(d.skipped==='no-recipients') toast('Немає активних отримувачів');else {const sent=(d.results||[]).filter(x=>x.status==='sent').length;toast(`Перевірку надіслано: ${sent}`)}await reload()}catch(e){toast(e.message)}};
  $('#syncBot').onclick=async()=>{try{const d=await api('/api/telegram/sync',{method:'POST',body:'{}'});if(d.state) state={...state,...d.state};if(!d.found) toast('Чатів не знайдено: натисни Start і напиши боту повідомлення');else toast(`Синхронізовано: ${d.synced}, знайдено: ${d.found}`);renderAll()}catch(e){toast(e.data?.telegramDescription||e.message)}};
}

function $$(s,root=document){return [...root.querySelectorAll(s)]}

function renderManagers(){
  const rows=state.managers||[];
  $('#managers').innerHTML=`
    <div class="section-title"><h2>Manager access</h2><span>${rows.length}</span></div>
    <div class="formrow"><div class="field"><label>Ім'я</label><input id="mName" class="input" placeholder="QA Manager"></div><div class="field"><label>Telegram user ID</label><input id="mId" class="input" placeholder="123456789"></div></div>
    <button class="btn primary" id="addManager">Додати керівника</button>
    <div class="list" style="margin-top:14px">${rows.length?rows.map(m=>`<div class="rowitem"><div><div class="name">${esc(m.name)}</div><div class="meta">Telegram ID ${esc(m.telegramId)}</div></div><div class="actions"><button class="switch ${m.enabled!==false?'on':''}" data-toggle-m="${esc(m.id)}"></button><button class="btn danger" data-del-m="${esc(m.id)}">×</button></div></div>`).join(''):'<div class="empty">Доступ керівнику ще не доданий.</div>'}</div>`;
  $('#addManager').onclick=async()=>{try{await action('addManager',{name:$('#mName').value,telegramId:$('#mId').value});toast('Керівника додано')}catch(e){toast(e.message)}};
  $$('[data-toggle-m]').forEach(b=>b.onclick=async()=>{const m=rows.find(x=>x.id===b.dataset.toggleM);await action('updateManager',{id:m.id,enabled:m.enabled===false})});
  $$('[data-del-m]').forEach(b=>b.onclick=async()=>{if(confirm('Прибрати доступ керівника?'))await action('removeManager',{id:b.dataset.delM})});
}

function logTypeLabel(l){
  if(l.type==='test') return 'Тест';
  if(l.type==='manual-tomorrow') return 'Ручний пуш';
  return l.key?.startsWith('test:') ? 'Тест' : 'Cron / перевірка';
}
function logErrorText(l){
  const parts=[];
  if(l.telegramDescription) parts.push(l.telegramDescription);
  else if(l.error) parts.push(l.error);
  if(l.telegramErrorCode) parts.push(`Telegram code: ${l.telegramErrorCode}`);
  if(l.httpStatus) parts.push(`HTTP: ${l.httpStatus}`);
  if(l.errorKind && l.errorKind!=='telegram') parts.push(`Kind: ${l.errorKind}`);
  if(l.telegramParameters?.retry_after) parts.push(`Retry after: ${l.telegramParameters.retry_after}s`);
  if(l.telegramParameters?.migrate_to_chat_id) parts.push(`Migrate chat_id: ${l.telegramParameters.migrate_to_chat_id}`);
  return parts.join(' · ') || '—';
}
function logsToTxt(){
  const rows=[...(state.notificationLog||[])].reverse();
  const lines=[
    'Календарь робочих днів — Telegram delivery log',
    `Exported: ${new Date().toLocaleString('uk-UA')}`,
    `Entries: ${rows.length}`,
    '='.repeat(72),
    ''
  ];
  rows.forEach((l,i)=>{
    lines.push(`#${i+1}`);
    lines.push(`Time: ${l.at ? new Date(l.at).toLocaleString('uk-UA') : '—'}`);
    lines.push(`Type: ${logTypeLabel(l)}`);
    lines.push(`Recipient: ${l.recipientName || '—'}`);
    lines.push(`Chat ID: ${l.chatId || '—'}`);
    lines.push(`Status: ${String(l.status||'—').toUpperCase()}`);
    lines.push(`Date: ${l.date || '—'}`);
    if(l.text) lines.push(`Message: ${String(l.text).replace(/\n/g,' | ')}`);
    if(l.status==='error') lines.push(`Error: ${logErrorText(l)}`);
    lines.push('-'.repeat(72));
  });
  const blob=new Blob(['\uFEFF'+lines.join('\n')],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  a.href=url;a.download=`hodynnyk-telegram-log-${stamp}.txt`;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function renderLogs(){
  const all=[...(state.notificationLog||[])].reverse();
  const rows=all.slice(0,100);
  $('#logs').innerHTML=`<div class="section-title"><h2>Telegram logs</h2><span>${all.length}</span></div>
    ${rows.length?`<div class="log-table-wrap"><table class="table"><thead><tr><th>Коли</th><th>Тип</th><th>Кому / chat_id</th><th>Статус</th><th>Деталі</th></tr></thead><tbody>${rows.map(l=>`<tr><td>${esc(l.at?new Date(l.at).toLocaleString('uk-UA'):'—')}</td><td>${esc(logTypeLabel(l))}</td><td><div>${esc(l.recipientName||'—')}</div><div class="meta">${esc(l.chatId||'—')}</div></td><td class="${l.status==='sent'?'success':'error'}">${esc(String(l.status||'—').toUpperCase())}</td><td class="log-detail">${esc(l.status==='error'?logErrorText(l):(l.text||'OK'))}</td></tr>`).join('')}</tbody></table></div><div class="log-cards">${rows.map(l=>`<article class="log-card"><div class="log-card-head"><strong>${esc(logTypeLabel(l))}</strong><span class="${l.status==='sent'?'success':'error'}">${esc(String(l.status||'—').toUpperCase())}</span></div><div class="log-card-time">${esc(l.at?new Date(l.at).toLocaleString('uk-UA'):'—')}</div><div class="log-card-recipient">${esc(l.recipientName||'—')} <span>${esc(l.chatId||'—')}</span></div><div class="log-card-detail">${esc(l.status==='error'?logErrorText(l):(l.text||'OK'))}</div></article>`).join('')}</div>`:'<div class="empty">Відправок ще не було.</div>'}
    <div class="actions log-actions" style="margin-top:14px"><button class="btn" id="downloadLogs">Зберегти TXT</button><button class="btn danger" id="clearLogs">Очистити журнал</button></div>`;
  $('#downloadLogs').onclick=logsToTxt;
  $('#clearLogs').onclick=async()=>{if(confirm('Очистити журнал?'))await action('clearLogs',{})};
}

function renderAll(){renderRecipients();renderManagers();renderLogs()}
async function reload(){const d=await api('/api/state');user=d.user;state=d.state;renderAll()}

async function boot(){
  try{
    config=await api('/api/config');
    const d=await api('/api/state'); user=d.user; state=d.state;
    if(user.role!=='admin'){blocked('Цей маршрут доступний тільки адміністратору.');return}
    shell();renderAll();
  }catch(e){if(e.status===401)blocked('Потрібна Telegram-авторизація.');else if(e.status===403)blocked('Цей Telegram акаунт не має прав адміністратора.');else blocked(`Помилка: ${e.message}`)}
}
boot();
