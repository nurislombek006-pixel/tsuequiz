// Netlify Function backend for Economy Pro / QuizBot.
// Works with or without @netlify/blobs. If Blobs are available, admin changes persist.

const STORE_NAME = 'quizbot-data';
const STATE_KEY = 'access_state_v2';
let memoryState = null;

function env(){ return process.env || {}; }
function json(status, data, headers={}){ return { statusCode: status, headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...headers }, body: JSON.stringify(data) }; }
function text(status, body, headers={}){ return { statusCode: status, headers: { 'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store', ...headers }, body: String(body) }; }
function cors(event){
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const allowed = String(env().ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
  let self = '';
  try { self = `https://${event.headers.host}`; } catch(e) {}
  const allow = !origin ? (self || '*') : (allowed.length ? (allowed.includes(origin) ? origin : (self || origin)) : origin);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Telegram-Init-Data,X-Admin-Secret',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
}
async function getBlobStore(){
  try { const mod = await import('@netlify/blobs'); return mod.getStore(STORE_NAME); } catch(e) { return null; }
}
async function readState(){
  const store = await getBlobStore();
  if(store){
    try { const data = await store.get(STATE_KEY, { type:'json' }); if(data) return normalize(data); } catch(e) {}
  }
  if(!memoryState) memoryState = normalize({});
  return memoryState;
}
async function writeState(state){
  state.updatedAt = new Date().toISOString();
  const clean = normalize(state);
  const store = await getBlobStore();
  if(store){ try { await store.setJSON(STATE_KEY, clean); return clean; } catch(e) { try { await store.set(STATE_KEY, JSON.stringify(clean)); return clean; } catch(_){} } }
  memoryState = clean; return clean;
}
function normalize(s){ return { premium: s?.premium && typeof s.premium==='object' ? s.premium : {}, banned: s?.banned && typeof s.banned==='object' ? s.banned : {}, devices: s?.devices && typeof s.devices==='object' ? s.devices : {}, updatedAt: s?.updatedAt || null }; }
function bodyJson(event){ try { return JSON.parse(event.body || '{}'); } catch(e) { return {}; } }
function adminOk(event){ const secret = String(env().ADMIN_SECRET || '').trim(); if(!secret) return false; const h = event.headers?.['x-admin-secret'] || event.headers?.['X-Admin-Secret'] || ''; const allowUrl = String(env().ALLOW_ADMIN_KEY_IN_URL||'') === '1'; const q = allowUrl ? (event.queryStringParameters?.key || '') : ''; return h === secret || q === secret; }
function uid(event, body={}){ return String(body.user_id || event.queryStringParameters?.user_id || '').replace(/\D+/g,''); }
function device(event, body={}){ return String(body.device_id || event.queryStringParameters?.device_id || '').trim().slice(0,120); }
function isActive(rec){ if(!rec) return false; if(rec.active === false) return false; if(rec.until){ const t = new Date(String(rec.until).includes('T') ? rec.until : rec.until+'T23:59:59').getTime(); if(Number.isFinite(t) && Date.now() > t) return false; } return true; }
function safeState(state){ return { premium: state.premium, banned: state.banned, devices: state.devices, updatedAt: state.updatedAt }; }
async function sendTelegram(textMsg){
  const token = env().BOT_TOKEN || env().APP_BOT_TOKEN || env().REPORT_BOT_TOKEN;
  const chat = env().CHAT_ID || env().OWNER_ID;
  if(!token || !chat) return { sent:false, reason:'BOT_TOKEN or CHAT_ID/OWNER_ID missing' };
  try{
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ chat_id: chat, text: textMsg.slice(0,3900), parse_mode:'HTML', disable_web_page_preview:true }) });
    const j = await r.json().catch(()=>({})); return { sent:r.ok, telegram:j };
  }catch(e){ return { sent:false, error:String(e.message||e) }; }
}
function esc(s){ return String(s??'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }

export async function handler(event, context){
  const h = cors(event);
  if(event.httpMethod === 'OPTIONS') return text(204, '', h);
  const rawPath = event.path || '/api/health';
  const path = rawPath.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '') || '/health';

  try{
    if(path === '/health'){
      return json(200, { ok:true, service:'economy-pro-netlify', time:new Date().toISOString(), storage: (await getBlobStore()) ? 'netlify-blobs' : 'memory-fallback' }, h);
    }

    if(path === '/access' && event.httpMethod === 'GET'){
      const state = await readState(); const id = uid(event); const dev = device(event); const ban = state.banned[id]; const rec = state.premium[id]; const lock = state.devices[id];
      let premium = isActive(rec); let reason = '';
      if(lock && lock.device_id && dev && lock.device_id !== dev){ premium = false; reason = lock.reason || 'Доступ привязан к другому устройству'; }
      return json(200, { ok:true, user_id:id, device_id:dev, premium, banned:!!ban, reason: ban?.reason || reason, record: rec ? { active:isActive(rec), until:rec.until||null } : null }, h);
    }

    if(path === '/admin/state' && event.httpMethod === 'GET'){
      if(!adminOk(event)) return json(401, { ok:false, error:'admin secret required' }, h);
      return json(200, { ok:true, state:safeState(await readState()) }, h);
    }

    if(path === '/admin/access' && event.httpMethod === 'POST'){
      if(!adminOk(event)) return json(401, { ok:false, error:'admin secret required' }, h);
      const b = bodyJson(event); const id = String(b.user_id||'').replace(/\D+/g,''); if(!id) return json(400,{ok:false,error:'user_id required'},h);
      const state = await readState(); const action = String(b.action||'premium');
      if(action === 'premium') state.premium[id] = { active:true, until:b.until||'', device_id:b.device_id||'', note:b.note||'', updatedAt:new Date().toISOString() };
      if(action === 'remove_premium') delete state.premium[id];
      if(action === 'ban') state.banned[id] = { reason:b.reason||'Заблокирован администратором', updatedAt:new Date().toISOString() };
      if(action === 'unban') delete state.banned[id];
      if(action === 'lock_device') state.devices[id] = { device_id:b.device_id||'', reason:b.reason||'Доступ привязан к другому устройству', updatedAt:new Date().toISOString() };
      if(action === 'unlock_device') delete state.devices[id];
      await writeState(state); return json(200, { ok:true, action, user_id:id, state:safeState(state) }, h);
    }

    if(path === '/report' && event.httpMethod === 'POST'){
      const b = bodyJson(event); const r = b.result || {}; const msg = `📊 <b>Новый результат</b>\nПользователь: <code>${esc(b.user_id||'-')}</code>\nУстройство: <code>${esc(b.device_id||'-')}</code>\nРежим: ${esc(r.type||'-')}\nРезультат: <b>${esc(r.correct)}/${esc(r.total)} (${esc(r.percent)}%)</b>\nВремя: ${new Date().toLocaleString('ru-RU')}`;
      const sent = await sendTelegram(msg); return json(200, { ok:true, report:sent }, h);
    }

    if(path === '/tests' && event.httpMethod === 'GET'){
      return json(200, { ok:true, note:'Frontend loads /questions.json. This endpoint is alive.' }, h);
    }

    return json(404, { ok:false, error:'not found', path }, h);
  }catch(e){ return json(500, { ok:false, error:String(e.message||e) }, h); }
}
