const icons = window.CloserIcons;
const svg = name => (icons[name] || icons.phone).replace(/<svg\b/, '<svg aria-hidden="true" focusable="false"');
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = svg(el.dataset.icon));
const $ = id => document.getElementById(id);
const text = (id, value) => $(id).textContent = value;
const duration = ms => { const minutes = Math.floor((ms || 0) / 60000); return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`; };
const dayString = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const offsetDay = (day, offset) => new Date(Date.parse(day + 'T12:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
const sampleIcons = {'com.instagram.android': '/icons/instagram.png', 'com.whatsapp': '/icons/whatsapp.png', 'com.google.android.youtube': '/icons/youtube.png', 'com.spotify.music': '/icons/spotify.jpg', 'com.android.chrome': '/icons/chrome.png'};
const demoApps = [['com.instagram.android', 'Instagram', 72], ['com.whatsapp', 'WhatsApp', 48], ['com.google.android.youtube', 'YouTube', 36], ['com.spotify.music', 'Spotify', 29], ['com.android.chrome', 'Chrome', 19]].map(([packageName, name, minutes]) => ({packageName, name, durationMs: minutes * 60000}));
const hours = [0, 0, 0, 0, 0, 0, 3, 5, 12, 17, 22, 9, 15, 11, 22, 16, 8, 19, 20, 13, 11, 1, 0, 0].map(n => n * 60000);
function demoDay(offset, total) { return {day: dayString(offset), capturedAt: Date.now(), screenTimeMs: total * 60000, unlocks: offset === 0 ? 47 : 59 + offset, hourly: hours.map(n => Math.floor(n * total / 204)), apps: demoApps.map(a => ({...a, durationMs: Math.floor(a.durationMs * total / 204)})), currentApp: demoApps[0], screenOn: true, battery: 82, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone}; }
let demo = true, range = 'today', allApps = false, device = null, deviceId = null, viewerToken = null, lastError = '', polling = false, pairing = null;
let hostedSession = null, appIcons = {}, loadedIconVersion = -1;
let currentView='overview', customDay=null, extraDays=[], renderContext={}, rangeLoadedAt=0, historyDays=[], historyCursor=null, historyTotal=0, historyApp=null, sessions=[], sessionCursor=null, sessionPages=1, sessionLoadedAt=0, rangeRequest=0;
let ownerKey = sessionStorage.getItem('closer-owner') || '';
const fragment = new URLSearchParams(location.hash.slice(1));
if (fragment.has('view') && fragment.has('device')) {
  viewerToken = fragment.get('view'); deviceId = fragment.get('device');
  sessionStorage.setItem('closer-view', JSON.stringify({viewerToken, deviceId}));
  history.replaceState(null, '', location.pathname);
} else {
  try { const saved = JSON.parse(sessionStorage.getItem('closer-view') || 'null'); if (saved) { viewerToken = saved.viewerToken; deviceId = saved.deviceId; } } catch {}
}
if (!deviceId) deviceId = localStorage.getItem('closer-device');
if (deviceId) demo = false;
text('today-date', new Date().toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}));

function setAppIcon(element, app, fallback = 'phone') {
  element.replaceChildren();
  const src = app && (demo ? sampleIcons[app.packageName] : appIcons[app.packageName]);
  if (src) {
    const image = document.createElement('img'); image.src = src; image.alt = ''; image.width = 64; image.height = 64;
    image.onerror = () => { image.remove(); element.textContent = app.name?.charAt(0).toUpperCase() || '?'; };
    element.append(image);
  } else if (app) element.textContent = app.name?.charAt(0).toUpperCase() || '?';
  else element.innerHTML = svg(fallback);
}
function toast(message) { text('toast', message); $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 4500); }
function openSettings() {
  text('form-error', ''); text('dialog-title', demo ? 'Connect your phone' : 'Sharing settings');
  $('owner-key').value = ownerKey;
  $('pair-form').hidden = !!viewerToken || !!(hostedSession?.hosted && !hostedSession.signedIn);
  $('viewer-info').hidden = !viewerToken; $('share-controls').hidden = demo || !!viewerToken;
  $('settings-dialog').showModal();
}
$('settings-button').onclick = openSettings; $('connect-top').onclick = openSettings;
$('close-dialog').onclick = () => $('settings-dialog').close();
$('settings-dialog').addEventListener('click', event => {
  if (event.target === $('settings-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); }
});
document.querySelectorAll('[data-range]').forEach(button => button.onclick = () => {
  range = button.dataset.range; customDay=null;
  document.querySelectorAll('[data-range]').forEach(item => { item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button)); });
  render(); animateView($('overview-view')); refreshRange(); loadSessions(true);
});
$('all-apps').onclick = () => { allApps = !allApps; render(); };
async function request(path, {method = 'GET', data, auth = viewerToken || ownerKey} = {}) {
  const response = await fetch(path, {method, cache: 'no-store', headers: {...(auth ? {Authorization: 'Bearer ' + auth} : {}), ...(data ? {'Content-Type': 'application/json'} : {})}, body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(12000)});
  if (!response.ok) { const body = await response.json().catch(() => ({})); const error=Error(body.error || `Server returned ${response.status}`);error.status=response.status;throw error; }
  return response.json();
}
function setNotice(message, error = false) {
  $('notice').classList.toggle('error-notice', error); text('notice-text', message);
  $('notice').querySelector('.sample-tag').hidden = !demo; $('connect-top').hidden = !!viewerToken;
  text('connect-top', demo ? 'Connect phone →' : 'Manage sharing →');
}
function render() {
  const days = demo ? sampleDays() : device?.paused?[]:[...new Map([...extraDays, ...(device?.days || [])].map(day=>[day.day,day])).values()];
  const current = demo ? days[0] : device?.snapshot;
  let today = dayString(0);
  if (current?.timezone) {
    try { const parts = new Intl.DateTimeFormat('en-US', {timeZone: current.timezone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date()); const part = type => parts.find(p => p.type === type).value; today = part('year') + '-' + part('month') + '-' + part('day'); } catch {}
  }
  const periodStart=offsetDay(today,range==='month'?-29:-6);
  const weekDays = days.filter(d => d.day >= periodStart && d.day <= today);
  let selected = range === 'today' ? days.find(d => d.day === today) : range === 'yesterday' ? days.find(d => d.day === offsetDay(today, -1)) : range==='date'?days.find(d=>d.day===customDay):null;
  if ((range === 'week'||range==='month') && weekDays.length) {
    const apps = new Map();
    for (const day of weekDays) for (const app of day.apps) apps.set(app.packageName, {...app, durationMs: app.durationMs + (apps.get(app.packageName)?.durationMs || 0)});
    selected = {screenTimeMs: weekDays.reduce((sum, d) => sum + d.screenTimeMs, 0), unlocks: weekDays.reduce((sum, d) => sum + d.unlocks, 0), apps: [...apps.values()], hourly: [], day: today};
  }
  const paused = !demo && device?.paused, offline = !demo && (!device?.updatedAt || Date.now() - device.updatedAt > 30000);
  const active = !!current?.screenOn && !paused && !offline, app = active ? current?.currentApp : null;
  document.querySelector('.live-card').dataset.state = paused ? 'paused' : offline ? 'offline' : 'active';
  setAppIcon($('current-icon'), app, paused ? 'pause' : 'phone');
  text('live-status', demo ? 'SAMPLE ACTIVITY' : paused ? 'SHARING PAUSED' : offline ? 'OFFLINE' : active ? 'USING NOW' : 'SCREEN OFF');
  text('live-title', paused ? 'Sharing paused' : offline ? 'Phone offline' : active ? app?.name || 'Phone unlocked' : 'Phone locked');
  text('current-description', paused ? 'Resume sharing from the phone.' : offline ? 'Waiting for the phone to reconnect.' : active ? 'Phone unlocked' : 'No app is currently in use.');
  text('phone-name', demo ? 'Sample phone' : device?.name || 'Android phone'); text('battery-text', current?.battery != null ? `${current.battery}% battery` : 'Battery unavailable');
  text('connection-badge', demo ? 'Android' : paused ? 'Paused' : offline ? 'Offline' : 'Connected');
  const age = Math.max(0, Math.floor((Date.now() - (device?.updatedAt || Date.now())) / 1000));
  text('sync-text', demo ? 'Sample data · no phone connected' : paused ? 'Sharing paused by the owner' : device?.updatedAt ? `Updated ${age < 60 ? age + 's' : Math.floor(age / 60) + 'm'} ago · refreshes every 5s` : 'Waiting for the first phone update');
  text('person-title', demo ? 'Sample Android phone' : device?.name || 'Android phone');
  if (!demo) setNotice(lastError ? 'Unable to refresh. ' + lastError : paused ? 'Activity is hidden while sharing is paused.' : offline ? 'Phone offline. Showing its last shared totals.' : 'Connected. Only people with your viewing link can see this activity.', !!lastError);
  text('period-title', range === 'today' ? 'Today’s overview' : range === 'yesterday' ? 'Yesterday’s overview' : range==='date'?formatDay(customDay):range==='month'?'Last 30 days':'Last 7 days');
  const total = selected?.screenTimeMs || 0, minutes = Math.floor(total / 60000);
  $('screen-time').replaceChildren();
  if (selected) { const h = document.createElement('span'); h.textContent = 'h'; const m = document.createElement('span'); m.textContent = 'm'; $('screen-time').append(String(Math.floor(minutes / 60)), h, ' ' + String(minutes % 60), m); }
  else text('screen-time', '—');
  text('unlock-count', selected ? String(selected.unlocks) : '—');
  const previous = selected && days.find(d => d.day === offsetDay(selected.day, -1));
  if (range !== 'week' && range!=='month' && selected && previous) {
    const diff = previous.screenTimeMs ? Math.round((selected.screenTimeMs - previous.screenTimeMs) / previous.screenTimeMs * 100) : null;
    text('screen-change', diff === null ? 'No comparison' : `${Math.abs(diff)}% ${diff <= 0 ? 'less' : 'more'}`); text('screen-caption', diff === null ? '' : 'than previous day');
    const unlockDiff = selected.unlocks - previous.unlocks;
    text('unlock-change', `${Math.abs(unlockDiff)} ${unlockDiff <= 0 ? 'fewer' : 'more'}`); text('unlock-caption', 'than previous day');
  } else {
    text('screen-change', (range === 'week'||range==='month') ? `${weekDays.length} days shared` : selected ? 'First day shared' : 'No data'); text('screen-caption', '');
    text('unlock-change', selected ? 'Screen unlock events' : 'No data'); text('unlock-caption', '');
  }
  const apps = (selected?.apps || []).slice().sort((a, b) => b.durationMs - a.durationMs), favorite = apps[0], sum = apps.reduce((s, a) => s + a.durationMs, 0);
  text('top-app', favorite?.name || 'No app data'); text('top-duration', favorite ? duration(favorite.durationMs) : '—'); text('top-share', sum ? Math.round(favorite.durationMs / sum * 100) + '%' : '—'); setAppIcon($('top-icon'), favorite);
  renderContext={days,today,selected,apps,weekDays};
  const visibleApps=apps.filter(app=>app.name.toLowerCase().includes($('app-search').value.trim().toLowerCase()));
  if($('app-sort').value==='name')visibleApps.sort((a,b)=>a.name.localeCompare(b.name));
  text('app-count', `${visibleApps.length} ${visibleApps.length === 1 ? 'app' : 'apps'}`);
  const list = $('app-list'); list.replaceChildren();
  for (const app of visibleApps.slice(0, allApps ? 300 : 5)) {
    const row = document.createElement('button'); row.type='button';row.className = 'app-row';row.setAttribute('aria-label','View '+app.name+' details');row.onclick=()=>openApp(app);
    const icon = document.createElement('div'); icon.className = 'app-icon'; setAppIcon(icon, app);
    const details = document.createElement('div'); details.className = 'app-details';
    const heading = document.createElement('div'); heading.className = 'app-row-heading';
    const name = document.createElement('strong'); name.textContent = app.name;
    const value = document.createElement('span'); value.textContent = duration(app.durationMs); heading.append(name, value);
    const track = document.createElement('div'); track.className = 'progress-track'; const bar = document.createElement('span'); bar.style.width = (sum ? app.durationMs / sum * 100 : 0) + '%'; track.append(bar);
    details.append(heading, track); row.append(icon, details); list.append(row);
  }
  if (!visibleApps.length) { const p = document.createElement('p'); p.className = 'empty-apps'; p.textContent = paused ? 'Activity is hidden while sharing is paused.' : $('app-search').value?'No apps match your search.':'No app activity shared for this period.'; list.append(p); }
  $('all-apps').hidden = visibleApps.length <= 5; text('all-apps', allApps ? 'Show fewer apps' : `Show all ${visibleApps.length} apps`);
  text('rhythm-title', (range === 'week'||range==='month') ? 'Screen time by day' : 'Screen time by hour'); text('chart-total', selected ? duration(total) : '—'); text('chart-caption', (range === 'week'||range==='month') ? `Daily totals for the last ${range==='month'?30:7} days` : 'When the phone was in use');
  let data = selected?.hourly || Array(24).fill(0), labels = data.map((_, i) => `${i}:00`);
  if (range === 'week'||range==='month') { const sorted = [...weekDays].sort((a, b) => a.day.localeCompare(b.day)); data = sorted.map(d => d.screenTimeMs); labels = sorted.map(d => new Date(d.day + 'T12:00:00Z').toLocaleDateString(undefined, range==='month'?{month:'short',day:'numeric'}:{weekday:'short'})); }
  const maximum = Math.max((range === 'week'||range==='month') ? 3600000 : 1800000, ...data), roundedMax = Math.ceil(maximum / ((range === 'week'||range==='month') ? 3600000 : 600000)) * ((range === 'week'||range==='month') ? 3600000 : 600000);
  text('axis-max', duration(roundedMax)); text('axis-mid', duration(roundedMax / 2));
  const chart = $('usage-chart'); chart.replaceChildren();
  data.forEach((value, i) => { const bar = document.createElement('div'); bar.className = 'chart-bar' + (value === Math.max(...data) && value > 0 ? ' highlight' : ''); bar.style.height = Math.max(1, value / roundedMax * 100) + '%'; bar.dataset.tooltip = labels[i] + ' · ' + duration(value); bar.tabIndex = 0; bar.setAttribute('aria-label', bar.dataset.tooltip); chart.append(bar); });
  chart.setAttribute('aria-label', ((range === 'week'||range==='month') ? 'Daily' : 'Hourly') + ' screen time: ' + labels.map((label, i) => label + ' ' + duration(data[i])).join(', '));
  $('chart-labels').replaceChildren(); for (const label of (range === 'week'||range==='month') ? labels.filter((_,i)=>range!=='month'||i%7===0||i===labels.length-1) : ['12 AM', '6 AM', '12 PM', '6 PM', '11 PM']) { const span = document.createElement('span'); span.textContent = label; $('chart-labels').append(span); }
  text('rhythm-note', current?.timezone ? `Phone timezone: ${current.timezone.replaceAll('_', ' ')}` : 'Times follow the phone’s timezone.');
  $('share-controls').hidden = demo || !!viewerToken;
  const chosen=range==='date'?customDay:range==='yesterday'?offsetDay(today,-1):today;
  $('selected-date').max=today;$('selected-date').value=chosen;$('next-day').disabled=chosen>=today;$('back-today').hidden=range==='today';
}
async function refresh() {
  if (polling || document.hidden || (!deviceId&&!viewerToken&&!pairing&&!ownerKey&&!hostedSession?.signedIn)) return; polling = true;
  try {
    if (pairing && Date.now() > pairing.expiresAt) { text('pair-expiry', 'Code expired. Create a new pairing code.'); pairing = null; }
    if (pairing || (!deviceId && !viewerToken)) {
      const response = await request('/api/devices', {auth: ownerKey}); const found = pairing ? response.devices.find(d => d.id === pairing.deviceId) : response.devices[0];
      if (found) { deviceId = found.id; localStorage.setItem('closer-device', deviceId); if (pairing) { pairing = null; $('pairing-result').hidden = true; toast('Phone connected.'); } }
    }
    if (deviceId) {
      device = await request('/api/devices/' + deviceId); demo = false; lastError = '';
      if (device.paused) { if($('app-dialog').open)$('app-dialog').close();historyApp=null;appIcons = {}; loadedIconVersion = -1; extraDays=[];historyDays=[];historyTotal=0;sessions=[];historyCursor=null;sessionCursor=null;renderHistory();renderSessions(); }
      else if ((device.iconVersion || 0) !== loadedIconVersion) {
        try { const result = await request('/api/devices/' + deviceId + '/icons'); appIcons = result.icons; loadedIconVersion = result.version; } catch { /* Usage remains visible if icon loading is temporarily unavailable. */ }
      }
      render();
      if(Date.now()-rangeLoadedAt>60000)refreshRange();
      if(Date.now()-sessionLoadedAt>30000)loadSessions(false);
    }
  } catch (error) {
    if (!demo || viewerToken) { demo = false; lastError = error.message;if(error.status===401||error.status===404){device=null;extraDays=[];appIcons={};historyDays=[];historyTotal=0;sessions=[];historyCursor=null;sessionCursor=null;renderHistory();renderSessions();}render(); }
  } finally { polling = false; }
}
$('pair-form').onsubmit = async event => {
  event.preventDefault(); ownerKey = $('owner-key').value.trim(); sessionStorage.setItem('closer-owner', ownerKey); text('form-error', ''); $('generate-code').disabled = true;
  try { pairing = await request('/api/pairings', {method: 'POST', data: {name: $('device-name').value}, auth: ownerKey}); text('pairing-code', pairing.code); text('server-url', location.origin); text('pair-expiry', 'Expires in 10 minutes. Waiting for your phone…'); $('pairing-result').hidden = false; }
  catch (error) { text('form-error', error.message); } finally { $('generate-code').disabled = false; }
};
$('share-link').onclick = async () => {
  try {
    const response = await request('/api/devices/' + deviceId + '/viewer', {method: 'POST', auth: ownerKey}); const link = location.origin + '/#device=' + encodeURIComponent(deviceId) + '&view=' + encodeURIComponent(response.viewerToken);
    try { await navigator.clipboard.writeText(link); toast('Viewing link copied. Previous link revoked.'); }
    catch { const box = document.createElement('input'); box.value = link; box.readOnly = true; box.setAttribute('aria-label', 'Private viewing link'); $('share-controls').append(box); box.select(); toast('Copy the selected viewing link.'); }
  } catch (error) { text('form-error', error.message); }
};
$('pause-sharing').onclick = async () => {
  try { await request('/api/devices/' + deviceId + '/sharing', {method: 'POST', data: {paused: true}, auth: ownerKey}); await refresh(); toast('Sharing paused. Resume from your phone.'); }
  catch (error) { text('form-error', error.message); }
};
$('delete-phone').onclick = async () => {
  if (!confirm('Disconnect this phone and permanently delete its shared history?')) return;
  try { await request('/api/devices/' + deviceId, {method: 'DELETE', auth: ownerKey}); deviceId = null; device = null; demo = true; extraDays=[];historyDays=[];sessions=[];historyApp=null;historyCursor=null;sessionCursor=null;rangeRequest++;historyRequest++;sessionRequest++;appIcons = {}; loadedIconVersion = -1; localStorage.removeItem('closer-device'); $('settings-dialog').close(); render(); setNotice('Phone disconnected. Shared data deleted.'); }
  catch (error) { text('form-error', error.message); }
};
initializeViews();
render();
request('/api/session').then(session => { hostedSession = session; $('owner-key').hidden = session.hosted; $('owner-key-label').hidden = session.hosted; $('hosted-signin').hidden = !session.hosted || session.signedIn || !!viewerToken; $('pair-form').hidden = !!viewerToken || (session.hosted && !session.signedIn); refreshRange(); loadSessions(true);}).catch(() => {});
refresh(); setInterval(refresh, 5000); document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

function sampleDays(){return Array.from({length:365},(_,i)=>demoDay(-i,i===0?204:i===1?249:130+Math.round((Math.sin(i*1.7)+1)*55)+(i%5)*13));}
function formatDay(day){return new Date(day+'T12:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
function animateView(element){if(!matchMedia('(prefers-reduced-motion: reduce)').matches)element.animate([{opacity:.4,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});}
function period(){const today=renderContext.today||dayString(0);return range==='week'||range==='month'?{from:offsetDay(today,range==='month'?-29:-6),to:today}:{from:range==='date'?customDay:range==='yesterday'?offsetDay(today,-1):today,to:range==='date'?customDay:range==='yesterday'?offsetDay(today,-1):today};}
function selectDay(day){customDay=day;range='date';document.querySelectorAll('[data-range]').forEach(button=>{button.classList.remove('selected');button.setAttribute('aria-pressed','false');});render();refreshRange();loadSessions(true);switchView('overview');animateView($('overview-view'));}
function updateTabs(){const active=document.querySelector(`[data-view="${currentView}"]`),tabs=document.querySelector('.view-tabs');tabs.style.setProperty('--tab-left',active.offsetLeft+'px');tabs.style.setProperty('--tab-width',active.offsetWidth+'px');}
function switchView(view){currentView=view;document.querySelectorAll('[data-view]').forEach(button=>{button.classList.toggle('active',button.dataset.view===view);button.setAttribute('aria-current',button.dataset.view===view?'page':'false');});$('overview-view').hidden=view!=='overview';$('history-view').hidden=view!=='history';updateTabs();if(view==='history')loadHistory(true);}
function initializeViews(){
 document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>switchView(button.dataset.view));
 window.addEventListener('resize',updateTabs);requestAnimationFrame(updateTabs);
 $('previous-day').onclick=()=>selectDay(offsetDay($('selected-date').value,-1));$('next-day').onclick=()=>selectDay(offsetDay($('selected-date').value,1));
 $('selected-date').onchange=()=>{if($('selected-date').value&&$('selected-date').value<=(renderContext.today||dayString(0)))selectDay($('selected-date').value);};
 $('back-today').onclick=()=>document.querySelector('[data-range="today"]').click();
 $('app-search').oninput=()=>render();$('app-sort').onchange=()=>render();
 $('history-filters').onsubmit=event=>{event.preventDefault();if($('history-from').value&&$('history-to').value&&$('history-from').value>$('history-to').value){text('history-error','The start date must come before the end date.');return;}loadHistory(true);};
 $('clear-history-filters').onclick=()=>{$('history-from').value='';$('history-to').value='';historyApp=null;loadHistory(true);};
 $('more-history').onclick=()=>loadHistory(false);$('more-sessions').onclick=()=>loadSessions(false,true);$('export-button').onclick=exportHistory;
 $('close-app-dialog').onclick=()=>$('app-dialog').close();
}
async function refreshRange(){
 if(demo||!deviceId||hostedSession?.database!=='mongodb')return;
 const version=++rangeRequest,{from,to}=period(),queryFrom=range==='week'||range==='month'?from:offsetDay(to,-6);$('overview-view').classList.add('loading');
 try{const result=await request('/api/devices/'+deviceId+'/history?'+new URLSearchParams({from:queryFrom,to,detail:'true',limit:'62'}));if(version!==rangeRequest||device?.paused)return;extraDays=[...new Map([...extraDays,...result.days].map(day=>[day.day,day])).values()].slice(-120);rangeLoadedAt=Date.now();render();}
 catch(error){toast('Could not load this period. '+error.message);rangeLoadedAt=Date.now();}
 finally{if(version===rangeRequest)$('overview-view').classList.remove('loading');}
}
function openApp(app){
 const {days,selected}=renderContext;setAppIcon($('detail-icon'),app);text('detail-name',app.name);text('detail-period',$('period-title').textContent);text('detail-total',duration(app.durationMs));
 const sum=selected.apps.reduce((total,item)=>total+item.durationMs,0);text('detail-share',(sum?Math.round(app.durationMs/sum*100):0)+'% of app time in this period');
 const {to}=period(),series=Array.from({length:7},(_,i)=>{const day=offsetDay(to,i-6),record=days.find(d=>d.day===day);return {day,value:record?.apps.find(item=>item.packageName===app.packageName)?.durationMs||0,known:!!record};});
 const max=Math.max(60000,...series.map(item=>item.value));$('detail-chart').replaceChildren();$('detail-chart-labels').replaceChildren();
 for(const item of series){const bar=document.createElement('div');bar.style.height=Math.max(2,item.value/max*100)+'%';bar.title=formatDay(item.day)+' · '+(item.known?duration(item.value):'No shared data');$('detail-chart').append(bar);const label=document.createElement('span');label.textContent=new Date(item.day+'T12:00:00Z').toLocaleDateString(undefined,{weekday:'short'});$('detail-chart-labels').append(label);}
 $('detail-history').onclick=()=>{$('app-dialog').close();historyApp=app;$('history-from').value='';$('history-to').value='';switchView('history');};$('app-dialog').showModal();
}
let historyRequest=0;
async function loadHistory(reset){
 const version=++historyRequest; text('history-error','');$('more-history').disabled=true;
 if(reset){historyDays=[];historyCursor=null;$('history-list').innerHTML=Array.from({length:4},()=>'<div class="history-placeholder"><div class="skeleton"></div></div>').join('');}
 try{
  const from=$('history-from').value,to=$('history-to').value;
  if(demo){let records=sampleDays().filter(day=>(!from||day.day>=from)&&(!to||day.day<=to)&&(!historyApp||day.apps.some(app=>app.packageName===historyApp.packageName)));historyTotal=records.length;const start=reset?0:historyDays.length;const next=records.slice(start,start+20).map(day=>({day:day.day,screenTimeMs:day.screenTimeMs,unlocks:day.unlocks,topApp:historyApp?day.apps.find(app=>app.packageName===historyApp.packageName):day.apps[0]}));historyDays.push(...next);historyCursor=start+20<records.length?'sample':null;text('history-meta','Sample history · 365 days available to explore');}
  else{
   if(!deviceId||hostedSession?.database!=='mongodb'){historyDays=[];historyCursor=null;historyTotal=0;renderHistory();text('history-meta','Connect your self-hosted MongoDB server to browse history.');return;}
   const params=new URLSearchParams({limit:'30'});if(from)params.set('from',from);if(to)params.set('to',to);if(historyApp)params.set('app',historyApp.packageName);if(!reset&&historyCursor)params.set('cursor',historyCursor);
   const result=await request('/api/devices/'+deviceId+'/history?'+params);if(version!==historyRequest||device?.paused)return;historyDays.push(...result.days);historyCursor=result.nextCursor;historyTotal=result.total;text('history-meta',result.firstDay?`Saved since ${formatDay(result.firstDay)} · retained until you delete it`:'History starts with the first phone sync.');
  }
  if(version===historyRequest)renderHistory();
 }catch(error){if(version===historyRequest){text('history-error',error.message);renderHistory();}}finally{if(version===historyRequest)$('more-history').disabled=false;}
}
function renderHistory(){
 const list=$('history-list');list.replaceChildren();
 for(const day of historyDays){const row=document.createElement('button');row.type='button';row.className='history-row';row.onclick=()=>selectDay(day.day);row.setAttribute('aria-label','View activity for '+formatDay(day.day));
  const date=document.createElement('span');date.className='history-date';const strong=document.createElement('strong');strong.textContent=formatDay(day.day);const weekday=document.createElement('small');weekday.textContent=new Date(day.day+'T12:00:00Z').toLocaleDateString(undefined,{weekday:'long'});date.append(strong,weekday);
  const screen=document.createElement('span');screen.textContent=duration(day.screenTimeMs);const unlocks=document.createElement('span');unlocks.textContent=day.unlocks;
  const app=document.createElement('span');app.className='history-app';const image=document.createElement('span');image.className='app-icon';setAppIcon(image,day.topApp);const name=document.createElement('span');name.textContent=day.topApp?.name||'—';app.append(image,name);
  row.append(date,screen,unlocks,app);const arrow=document.createElement('span');arrow.innerHTML=svg('next');row.append(arrow);list.append(row);
 }
 if(!historyDays.length){const p=document.createElement('p');p.className='empty-apps';p.innerHTML='<span class="empty-history-icon">'+svg('calendar')+'</span>';p.append(device?.paused?'History is hidden while sharing is paused.':'No shared activity for these dates.');list.append(p);}
 $('more-history').hidden=!historyCursor;text('history-count',`Showing ${historyDays.length} of ${historyTotal} days`);
 $('history-app-filter').hidden=!historyApp;$('history-app-filter').replaceChildren();if(historyApp){$('history-app-filter').append('Showing days with '+historyApp.name);const clear=document.createElement('button');clear.className='text-button';clear.textContent='Clear';clear.onclick=()=>{historyApp=null;loadHistory(true);};$('history-app-filter').append(clear);}
}
function sampleSessions(){const {to}=period();return [17,16,14,13,11,9,8,7].map((hour,i)=>({id:'sample-'+to+'-'+hour,start:Date.parse(to+'T'+String(hour).padStart(2,'0')+':00:00'),end:Date.parse(to+'T'+String(hour).padStart(2,'0')+':00:00')+(18-i%4)*60000,day:to,app:demoApps[i%demoApps.length],durationMs:(18-i%4)*60000,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}));}
let sessionRequest=0;
async function loadSessions(reset,more=false){
 const version=++sessionRequest;if(reset){sessions=[];sessionCursor=null;sessionPages=1;}
 try{
  if(demo){sessions=sampleSessions();sessionCursor=null;}
  else if(deviceId&&hostedSession?.database==='mongodb'){
   const params=new URLSearchParams(period());if(more&&sessionCursor)params.set('cursor',sessionCursor);
   const result=await request('/api/devices/'+deviceId+'/sessions?'+params);if(version!==sessionRequest||device?.paused)return;
   sessions=[...new Map([...sessions,...result.sessions].map(session=>[session.id,session])).values()].sort((a,b)=>b.start-a.start);if(more)sessionPages++;if(reset||more||sessionPages===1)sessionCursor=result.nextCursor;
  }else sessions=[];
  sessionLoadedAt=Date.now();renderSessions();
 }catch(error){sessionLoadedAt=Date.now();if(reset){$('timeline-list').replaceChildren();const p=document.createElement('p');p.className='empty-apps';p.textContent='Timeline unavailable. '+error.message;$('timeline-list').append(p);}}
}
function renderSessions(){
 const list=$('timeline-list');list.replaceChildren();for(const session of sessions){const row=document.createElement('div');row.className='timeline-row';const icon=document.createElement('div');icon.className='app-icon';setAppIcon(icon,session.app);const copy=document.createElement('div');copy.className='timeline-copy';const name=document.createElement('strong');name.textContent=session.app.name;const time=document.createElement('span');const formatter=new Intl.DateTimeFormat(undefined,{timeZone:session.timezone||'UTC',hour:'numeric',minute:'2-digit'});time.textContent=(range==='week'||range==='month'?formatDay(session.day)+' · ':'')+formatter.format(new Date(session.start))+' – '+formatter.format(new Date(session.end));copy.append(name,time);const value=document.createElement('span');value.className='timeline-duration';value.textContent=session.durationMs>=60000?duration(session.durationMs):Math.max(0,Math.round(session.durationMs/1000))+'s';row.append(icon,copy,value);list.append(row);}
 if(!sessions.length){const p=document.createElement('p');p.className='empty-apps';p.textContent=device?.paused?'Timeline hidden while sharing is paused.':'Sessions appear while the phone is actively sharing.';list.append(p);}
 $('more-sessions').hidden=!sessionCursor;
}
async function exportHistory(){
 const button=$('export-button');button.disabled=true;button.setAttribute('aria-busy','true');textExport('Exporting…');
 try{
  let blob;const params=currentView==='history'?new URLSearchParams({...($('history-from').value?{from:$('history-from').value}:{}),...($('history-to').value?{to:$('history-to').value}:{})}):new URLSearchParams(period());
  if(currentView==='history'&&historyApp)params.set('app',historyApp.packageName);
  if(demo){const safe=value=>'"'+String(value??'').replace(/^[\s]*[=+\-@]/,"'$&").replaceAll('"','""')+'"';const lines=['Date,Screen time minutes,Unlocks,App,App minutes'];for(const day of sampleDays().filter(day=>(!params.get('from')||day.day>=params.get('from'))&&(!params.get('to')||day.day<=params.get('to'))))for(const app of day.apps.filter(app=>!params.get('app')||app.packageName===params.get('app')))lines.push([day.day,Math.round(day.screenTimeMs/60000),day.unlocks,app.name,Math.round(app.durationMs/60000)].map(safe).join(','));blob=new Blob([lines.join('\r\n')],{type:'text/csv'});}
  else{if(!deviceId||hostedSession?.database!=='mongodb')throw Error('Export is available on your self-hosted MongoDB server.');const response=await fetch('/api/devices/'+deviceId+'/export?'+params,{headers:{Authorization:'Bearer '+(viewerToken||ownerKey)}});if(!response.ok){const result=await response.json();throw Error(result.error||'Export failed');}blob=await response.blob();}
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=demo?'closer-sample-history.csv':'closer-history.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('History exported as CSV.');
 }catch(error){toast(error.message);}finally{button.disabled=false;button.removeAttribute('aria-busy');textExport('Export');}
}
function textExport(label){$('export-button').querySelector('.export-label').textContent=label;}
