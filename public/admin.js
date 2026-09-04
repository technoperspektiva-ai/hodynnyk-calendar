const $ = (s, root=document) => root.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let state=null, user=null, config=null;

function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2200)}
async function api(url,options={}){const r=await fetch(url,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.error||`HTTP ${r.status}`);e.status=r.status;e.data=d;throw e}return d}

function blocked(message){$('#app').innerHTML=`<main class="shell login"><section class="card loginbox"><div class="loginmark">H</div><h1>last-admin</h1><p>${esc(message)}</p><div class="actions" style="justify-content:center;margin-top:18px"><a class="btn" href="/">← Календар</a>${message.includes('авториза')?'<a class="btn primary" href="/api/auth/login?return=/last-admin">Telegram login</a>':''}</div></section></main>`}

function shell(){
  $('#app').innerHTML=`<main class="shell">
    <header class="topbar"><div class="brand"><div class="brandmark">H</div><div><h1>Hodynnyk</h1><small>LAST ADMIN</small></div></div><div class="userbar"><span class="pill green">Admin</span><span class="pill">${esc(user.name||user.username||user.id)}</span><button class="btn ghost" type="button" data-install-pwa hidden>Встановити</button><a class="btn ghost" href="/">Календар</a>${config.authConfigured?'<a class="btn ghost" href="/api/auth/logout">Вийти</a>':''}</div></header>
    ${user.demo?'<div class="card cardpad" style="margin-bottom:18px"><div class="helper">Demo mode. Після додавання Cloudflare secrets доступ до цієї сторінки матиме тільки ADMIN_TELEGRAM_ID.</div></div>':''}
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
    <div class="helper" style="margin-bottom:14px">Сюди прийде повідомлення ввечері, якщо наступного дня ти недоступний для QA.</div>
    <div class="formrow"><div class="field"><label>Назва</label><input id="rName" class="input" placeholder="QA Lead"></div><div class="field"><label>Telegram chat ID</label><input id="rChat" class="input" placeholder="123456789 або -100…"></div></div>
    <button class="btn primary" id="addRecipient">Додати отримувача</button>
    <div class="list" style="margin-top:14px">${rows.length?rows.map(r=>`<div class="rowitem"><div><div class="name">${esc(r.name)}</div><div class="meta">${esc(r.chatId)}</div></div><div class="actions"><button class="switch ${r.enabled!==false?'on':''}" data-toggle-r="${esc(r.id)}" aria-label="toggle"></button><button class="btn ghost" data-test-r="${esc(r.id)}">test</button><button class="btn danger" data-del-r="${esc(r.id)}">×</button></div></div>`).join(''):'<div class="empty">Отримувачів поки немає.</div>'}</div>
    <div class="actions" style="margin-top:14px"><button class="btn" id="runNow">Запустити перевірку зараз</button></div>`;
  $('#addRecipient').onclick=async()=>{try{await action('addRecipient',{name:$('#rName').value,chatId:$('#rChat').value});toast('Отримувача додано')}catch(e){toast(e.message)}};
  $$('[data-toggle-r]').forEach(b=>b.onclick=async()=>{const r=rows.find(x=>x.id===b.dataset.toggleR);await action('updateRecipient',{id:r.id,enabled:r.enabled===false});});
  $$('[data-del-r]').forEach(b=>b.onclick=async()=>{if(confirm('Видалити отримувача?'))await action('removeRecipient',{id:b.dataset.delR})});
  $$('[data-test-r]').forEach(b=>b.onclick=async()=>{try{await api('/api/telegram/test',{method:'POST',body:JSON.stringify({recipientId:b.dataset.testR})});toast('Тест надіслано');await reload()}catch(e){toast(e.message)}});
  $('#runNow').onclick=async()=>{try{const d=await api('/api/notifications/run',{method:'POST',body:'{}'});toast(d.skipped==='no-absence'?'На завтра QA OFF немає':'Перевірку виконано');await reload()}catch(e){toast(e.message)}};
}

function $$(s,root=document){return [...root.querySelectorAll(s)]}

function renderManagers(){
  const rows=state.managers||[];
  $('#managers').innerHTML=`
    <div class="section-title"><h2>Manager access</h2><span>${rows.length}</span></div>
    <div class="helper" style="margin-bottom:14px">Керівник входить через Telegram, бачить календар і лічильник та може змінити тільки місячну планку тестів.</div>
    <div class="formrow"><div class="field"><label>Ім'я</label><input id="mName" class="input" placeholder="QA Manager"></div><div class="field"><label>Telegram user ID</label><input id="mId" class="input" placeholder="123456789"></div></div>
    <button class="btn primary" id="addManager">Додати керівника</button>
    <div class="list" style="margin-top:14px">${rows.length?rows.map(m=>`<div class="rowitem"><div><div class="name">${esc(m.name)}</div><div class="meta">Telegram ID ${esc(m.telegramId)}</div></div><div class="actions"><button class="switch ${m.enabled!==false?'on':''}" data-toggle-m="${esc(m.id)}"></button><button class="btn danger" data-del-m="${esc(m.id)}">×</button></div></div>`).join(''):'<div class="empty">Доступ керівнику ще не доданий.</div>'}</div>`;
  $('#addManager').onclick=async()=>{try{await action('addManager',{name:$('#mName').value,telegramId:$('#mId').value});toast('Керівника додано')}catch(e){toast(e.message)}};
  $$('[data-toggle-m]').forEach(b=>b.onclick=async()=>{const m=rows.find(x=>x.id===b.dataset.toggleM);await action('updateManager',{id:m.id,enabled:m.enabled===false})});
  $$('[data-del-m]').forEach(b=>b.onclick=async()=>{if(confirm('Прибрати доступ керівника?'))await action('removeManager',{id:b.dataset.delM})});
}

function renderLogs(){
  const rows=[...(state.notificationLog||[])].reverse().slice(0,80);
  $('#logs').innerHTML=`<div class="section-title"><h2>Delivery log</h2><span>${rows.length}</span></div>
    ${rows.length?`<div style="overflow:auto"><table class="table"><thead><tr><th>Коли</th><th>Кому</th><th>Статус</th><th>Дата QA</th></tr></thead><tbody>${rows.map(l=>`<tr><td>${esc(new Date(l.at).toLocaleString('uk-UA'))}</td><td>${esc(l.recipientName||l.chatId||'—')}</td><td class="${l.status==='sent'?'success':'error'}">${esc(l.status)}</td><td>${esc(l.date||'test')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Відправок ще не було.</div>'}
    <div class="actions" style="margin-top:14px"><button class="btn danger" id="clearLogs">Очистити журнал</button></div>`;
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
