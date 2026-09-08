const $ = (s, root=document) => root.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let state=null, user=null, config=null;

const COLLAPSE_KEY='hodynnyk:admin-sections';
function collapsePrefs(){try{return JSON.parse(localStorage.getItem(COLLAPSE_KEY)||'{}')}catch{return {}}}
function sectionHeader(id,title,count){return `<button class="section-title section-toggle" type="button" data-section-toggle="${id}" aria-expanded="true"><span class="section-toggle-main"><span class="section-chevron" aria-hidden="true"></span><h2>${title}</h2></span><span>${count}</span></button>`}
function wireCollapsible(id,defaultCollapsed=false){
  const section=$(`#${id}`); if(!section)return;
  section.classList.add('collapsible-card');
  const prefs=collapsePrefs();
  const collapsed=Object.prototype.hasOwnProperty.call(prefs,id)?!!prefs[id]:defaultCollapsed;
  section.classList.toggle('section-collapsed',collapsed);
  const toggle=section.querySelector('[data-section-toggle]');
  if(!toggle)return;
  toggle.setAttribute('aria-expanded',String(!collapsed));
  toggle.onclick=()=>{
    const next=!section.classList.contains('section-collapsed');
    section.classList.toggle('section-collapsed',next);
    toggle.setAttribute('aria-expanded',String(!next));
    const out=collapsePrefs();out[id]=next;localStorage.setItem(COLLAPSE_KEY,JSON.stringify(out));
  };
}

function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2200)}
async function api(url,options={}){const r=await fetch(url,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.error||`HTTP ${r.status}`);e.status=r.status;e.data=d;throw e}return d}

function blocked(message){$('#app').innerHTML=`<main class="shell login"><section class="card loginbox"><img class="brand-icon login-brand-icon" src="/icons/icon-192.png" alt=""><h1>Календарь робочих днів</h1><p>${esc(message)}</p><div class="actions" style="justify-content:center;margin-top:18px"><a class="btn" href="/">← Календар</a>${message.includes('авториза')?`<a class="btn primary" href="/api/auth/login?return=${encodeURIComponent(location.pathname)}">Telegram login</a>`:''}</div></section></main>`}

function shell(){
  $('#app').innerHTML=`<main class="shell">
    <header class="topbar admin-topbar"><div class="brand admin-brand"><img class="brand-icon" src="/icons/icon-192.png" alt=""><div><h1>Календарь робочих днів</h1><small>CONTROL</small></div></div><div class="userbar admin-userbar"><div class="admin-user-meta"><span class="pill green">Admin</span><span class="pill">${esc(user.name||user.username||user.id)}</span></div><div class="admin-nav-actions"><a class="btn ghost" href="/">Календар</a>${config.authConfigured?'<a class="btn ghost" href="/api/auth/logout">Вийти</a>':''}</div></div></header>
    <section class="admin-layout">
      <aside class="card side"><a class="active" href="#recipients">Recipients</a><a href="#azsPushes">Автопуші АЗС</a><a href="#managers">Доступ</a><a href="#logs">Delivery log</a></aside>
      <div class="stack">
        <section class="card cardpad" id="recipients"></section>
        <section class="card cardpad" id="azsPushes"></section>
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
    ${sectionHeader('recipients','Telegram recipients',rows.length)}
    <div class="collapse-body"><div class="formrow"><div class="field"><label>Назва</label><input id="rName" class="input" placeholder="QA Lead"></div><div class="field"><label>Telegram chat ID</label><input id="rChat" class="input" placeholder="123456789 або -100…"></div></div>
    <button class="btn primary" id="addRecipient">Додати отримувача</button>
    <div class="list" style="margin-top:14px">${rows.length?rows.map(r=>`<div class="rowitem"><div><div class="name">${esc(r.name)}</div><div class="meta">chat_id ${esc(r.chatId)}${r.telegramUserId?` · user ${esc(r.telegramUserId)}`:''}</div></div><div class="actions"><button class="switch ${r.enabled!==false?'on':''}" data-toggle-r="${esc(r.id)}" aria-label="toggle"></button><button class="btn ghost" data-test-r="${esc(r.id)}">test</button><button class="btn danger" data-del-r="${esc(r.id)}">×</button></div></div>`).join(''):'<div class="empty">Отримувачів поки немає.</div>'}</div>
    <div class="actions admin-action-grid" style="margin-top:14px">
      <button class="btn primary" id="sendTomorrow">Надіслати про завтра</button>
      <button class="btn" id="runNow">Запустити QA-перевірку</button>
      <button class="btn ghost" id="syncBot">Синхронізувати бот</button>
      ${config?.botUsername ? `<a class="btn ghost bot-open" href="https://t.me/${esc(config.botUsername)}" target="_blank" rel="noopener">Відкрити @${esc(config.botUsername)}</a>` : ''}
    </div></div>`;
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
  $('#syncBot').onclick=async()=>{try{const d=await api('/api/telegram/sync-self',{method:'POST',body:'{}'});toast(d.message||`Telegram синхронізовано: ${d.chatId||''}`);await reload()}catch(e){toast(e.data?.telegramDescription||e.message)}};
  wireCollapsible('recipients',false);
}

function renderAzsPushes(){
  const rows=[...(state.azsAutoPushes||[])].sort((a,b)=>String(a.time).localeCompare(String(b.time)));
  $('#azsPushes').innerHTML=`
    ${sectionHeader('azsPushes','Автопуші АЗС',rows.length)}
    <div class="collapse-body">
      <div class="auto-push-toolbar">
        <div class="field auto-push-count-field"><label>Кількість пушів на день</label><input id="azsPushCount" class="input" type="number" inputmode="numeric" min="0" max="12" value="${rows.length}"></div>
        <button class="btn primary" id="applyAzsPushCount">Застосувати</button>
        <button class="btn" id="addAzsPush">+ Додати час</button>
      </div>
      <div class="meta auto-push-note">Пуш відправляється тільки коли на завтра в календарі стоїть АЗС.</div>
      <div class="list auto-push-list" style="margin-top:14px">
        ${rows.length?rows.map((r,i)=>`<div class="rowitem auto-push-row">
          <div class="auto-push-index">${i+1}</div>
          <div class="field auto-push-time"><label>Час</label><input class="input" type="time" value="${esc(r.time)}" data-azs-time="${esc(r.id)}"></div>
          <div class="actions auto-push-actions"><button class="switch ${r.enabled!==false?'on':''}" data-toggle-azs="${esc(r.id)}" aria-label="toggle"></button><button class="btn danger" data-del-azs="${esc(r.id)}">×</button></div>
        </div>`).join(''):'<div class="empty">Автоматичні пуші вимкнені.</div>'}
      </div>
    </div>`;

  $('#addAzsPush').onclick=async()=>{try{await action('addAzsAutoPush',{time:'19:00',enabled:true});toast('Час додано')}catch(e){toast(e.message)}};
  $('#applyAzsPushCount').onclick=async()=>{
    try{
      const count=Math.max(0,Math.min(12,Number($('#azsPushCount').value||0)));
      const current=[...(state.azsAutoPushes||[])].sort((a,b)=>String(a.time).localeCompare(String(b.time)));
      const defaults=['09:00','12:00','15:00','18:00','19:00','20:00','21:00','22:00','08:00','10:00','16:00','23:00'];
      const items=[];
      for(let i=0;i<count;i++) items.push(current[i]||{time:defaults[i]||'19:00',enabled:true});
      await action('replaceAzsAutoPushes',{items});
      toast(`Пушів на день: ${count}`);
    }catch(e){toast(e.message)}
  };
  $$('[data-azs-time]').forEach(input=>input.onchange=async()=>{try{await action('updateAzsAutoPush',{id:input.dataset.azsTime,time:input.value});toast('Час збережено')}catch(e){toast(e.message)}});
  $$('[data-toggle-azs]').forEach(b=>b.onclick=async()=>{const r=rows.find(x=>x.id===b.dataset.toggleAzs);if(r)await action('updateAzsAutoPush',{id:r.id,enabled:r.enabled===false})});
  $$('[data-del-azs]').forEach(b=>b.onclick=async()=>{if(confirm('Видалити цей автоматичний пуш?'))await action('removeAzsAutoPush',{id:b.dataset.delAzs})});
  wireCollapsible('azsPushes',false);
}

function $$(s,root=document){return [...root.querySelectorAll(s)]}

function renderManagers(){
  const users=state.accessUsers||[];
  const requests=state.accessRequests||[];
  $('#managers').innerHTML=`
    ${sectionHeader('managers','Доступ користувачів',users.length)}
    <div class="collapse-body"><div class="formrow">
      <div class="field"><label>Ім'я</label><input id="uName" class="input" placeholder="QA Manager"></div>
      <div class="field"><label>Telegram user ID</label><input id="uId" class="input" inputmode="numeric" placeholder="123456789"></div>
    </div>
    <div class="formrow compact-access-row">
      <label class="access-check"><input id="uTarget" type="checkbox" checked> Може ставити планку</label>
      <label class="access-check"><input id="uNotify" type="checkbox" checked> Telegram-сповіщення</label>
    </div>
    <div class="field"><label>Примітка</label><input id="uNote" class="input" placeholder="Наприклад: QA lead"></div>
    <button class="btn primary" id="addAccessUser">Додати доступ</button>

    ${requests.length?`<div class="access-subtitle">Запити на доступ <span>${requests.length}</span></div>
      <div class="list access-request-list">${requests.map(r=>`<div class="rowitem access-request"><div><div class="name">${esc(r.name||r.telegramId)}</div><div class="meta">ID ${esc(r.telegramId)}${r.username?` · @${esc(r.username)}`:''} · ${esc(r.lastLoginAt?new Date(r.lastLoginAt).toLocaleString('uk-UA'):'')}</div></div><div class="actions"><button class="btn primary" data-approve-u="${esc(r.id)}">Дозволити</button><button class="btn danger" data-deny-u="${esc(r.id)}">×</button></div></div>`).join('')}</div>`:''}

    <div class="list access-user-list" style="margin-top:14px">${users.length?users.map(u=>`<div class="rowitem access-user"><div class="access-user-main"><div class="name">${esc(u.name||u.telegramId)}</div><div class="meta">Telegram ID ${esc(u.telegramId)} · Керівник${u.note?` · ${esc(u.note)}`:''}</div><div class="access-flags"><span class="mini-pill ${u.canSetTarget!==false?'on':''}">Планка</span><span class="mini-pill ${u.notifications!==false?'on':''}">Telegram</span></div></div><div class="actions"><button class="switch ${u.enabled!==false?'on':''}" data-toggle-u="${esc(u.id)}" aria-label="toggle"></button><button class="btn ghost" data-edit-u="${esc(u.id)}">Редагувати</button><button class="btn danger" data-del-u="${esc(u.id)}">×</button></div></div>`).join(''):'<div class="empty">Користувачів з доступом ще немає.</div>'}</div></div>`;

  $('#addAccessUser').onclick=async()=>{try{await action('addAccessUser',{name:$('#uName').value,telegramId:$('#uId').value,role:'manager',canSetTarget:$('#uTarget').checked,notifications:$('#uNotify').checked,note:$('#uNote').value});toast('Доступ додано')}catch(e){toast(e.message)}};
  $$('[data-approve-u]').forEach(b=>b.onclick=async()=>{try{await action('approveAccessRequest',{id:b.dataset.approveU,canSetTarget:true,notifications:true});toast('Доступ дозволено')}catch(e){toast(e.message)}});
  $$('[data-deny-u]').forEach(b=>b.onclick=async()=>{if(confirm('Відхилити запит?'))await action('denyAccessRequest',{id:b.dataset.denyU})});
  $$('[data-toggle-u]').forEach(b=>b.onclick=async()=>{const u=users.find(x=>x.id===b.dataset.toggleU);await action('updateAccessUser',{id:u.id,enabled:u.enabled===false})});
  $$('[data-edit-u]').forEach(b=>b.onclick=async()=>{const u=users.find(x=>x.id===b.dataset.editU);if(!u)return;const name=prompt('Ім\'я',u.name||'');if(name===null)return;const note=prompt('Примітка',u.note||'');if(note===null)return;const canSetTarget=confirm('Дозволити змінювати місячну планку?');const notifications=confirm('Дозволити Telegram-сповіщення?');await action('updateAccessUser',{id:u.id,name,note,canSetTarget,notifications});});
  $$('[data-del-u]').forEach(b=>b.onclick=async()=>{if(confirm('Прибрати доступ користувача?'))await action('removeAccessUser',{id:b.dataset.delU})});
  wireCollapsible('managers',false);
}

function logTypeLabel(l){
  if(l.type==='test') return 'Тест';
  if(l.type==='manual-tomorrow') return 'Ручний пуш';
  if(l.type==='auto-azs') return `Автопуш АЗС${l.scheduleTime?` ${l.scheduleTime}`:''}`;
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
  $('#logs').innerHTML=`${sectionHeader('logs','Telegram logs',all.length)}
    <div class="collapse-body">${rows.length?`<div class="log-table-wrap"><table class="table"><thead><tr><th>Коли</th><th>Тип</th><th>Кому / chat_id</th><th>Статус</th><th>Деталі</th></tr></thead><tbody>${rows.map(l=>`<tr><td>${esc(l.at?new Date(l.at).toLocaleString('uk-UA'):'—')}</td><td>${esc(logTypeLabel(l))}</td><td><div>${esc(l.recipientName||'—')}</div><div class="meta">${esc(l.chatId||'—')}</div></td><td class="${l.status==='sent'?'success':'error'}">${esc(String(l.status||'—').toUpperCase())}</td><td class="log-detail">${esc(l.status==='error'?logErrorText(l):(l.text||'OK'))}</td></tr>`).join('')}</tbody></table></div><div class="log-cards">${rows.map(l=>`<article class="log-card"><div class="log-card-head"><strong>${esc(logTypeLabel(l))}</strong><span class="${l.status==='sent'?'success':'error'}">${esc(String(l.status||'—').toUpperCase())}</span></div><div class="log-card-time">${esc(l.at?new Date(l.at).toLocaleString('uk-UA'):'—')}</div><div class="log-card-recipient">${esc(l.recipientName||'—')} <span>${esc(l.chatId||'—')}</span></div><div class="log-card-detail">${esc(l.status==='error'?logErrorText(l):(l.text||'OK'))}</div></article>`).join('')}</div>`:'<div class="empty">Відправок ще не було.</div>'}
    <div class="actions log-actions" style="margin-top:14px"><button class="btn" id="downloadLogs">Зберегти TXT</button><button class="btn danger" id="clearLogs">Очистити журнал</button></div></div>`;
  $('#downloadLogs').onclick=logsToTxt;
  $('#clearLogs').onclick=async()=>{if(confirm('Очистити журнал?'))await action('clearLogs',{})};
  wireCollapsible('logs',true);
}

function renderAll(){renderRecipients();renderAzsPushes();renderManagers();renderLogs()}
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
