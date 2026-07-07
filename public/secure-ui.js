/* secure-ui.js — UX cleanup + client-side safety helpers. Backend still remains source of truth. */
(function(){
  'use strict';
  const VERSION = '2026-07-07-max1';
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const ready = (fn) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, {once:true}) : fn();
  const norm = (s) => String(s || '').replace(/\s+/g,' ').trim().toLowerCase();
  const click = (el) => { if(el && typeof el.click === 'function') el.click(); };

  function tgInitData(){
    try{return window.Telegram?.WebApp?.initData || '';}catch(_){return '';}
  }

  function showBanner(){
    let b = $('#safe-security-banner');
    if(!b){
      b = document.createElement('div');
      b.id = 'safe-security-banner';
      b.className = 'safe-security-banner';
      b.textContent = 'Защищённый режим: открой сайт через Telegram Mini App, чтобы ID был проверен подписью Telegram.';
      const start = $('#start-screen') || document.body.firstElementChild;
      if(start) start.insertAdjacentElement('beforebegin', b); else document.body.prepend(b);
    }
    const inTelegram = !!tgInitData();
    b.classList.toggle('show', !inTelegram && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1');
  }

  function enhanceFetch(){
    if(window.__safeFetchPatched) return;
    window.__safeFetchPatched = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function(input, init){
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const path = (()=>{try{return new URL(url, location.href).pathname;}catch(_){return String(url);}})();
      if(init && init.body && /\/api\/(access|report)\b/.test(path)){
        try{
          const data = typeof init.body === 'string' ? JSON.parse(init.body) : null;
          if(data && !data.initData){
            const initData = tgInitData();
            if(initData) data.initData = initData;
            init.body = JSON.stringify(data);
          }
          if(path.includes('/api/report') && data && String(data.text || '').length > 2500){
            data.text = String(data.text).slice(0, 2500) + '\n…[trimmed]';
            init.body = JSON.stringify(data);
          }
        }catch(_){/* keep original */}
      }
      return nativeFetch(input, init);
    };
  }

  function debounceSearch(){
    $$('input[type="search"], input[id*="search" i], input[placeholder*="поиск" i]').forEach(inp => {
      if(inp.dataset.safeDebounced) return;
      inp.dataset.safeDebounced = '1';
      let t = null;
      const handlers = ['keyup','input'];
      handlers.forEach(type => inp.addEventListener(type, () => {
        clearTimeout(t);
        t = setTimeout(() => {
          try{ if(typeof window.filterList === 'function') window.filterList(); }catch(_){ }
        }, 120);
      }, {passive:true}));
    });
  }

  function classifyMenuItem(el){
    const t = norm(el.textContent || el.getAttribute('aria-label') || '');
    if(/изуч|тесты|вопрос|ошиб/.test(t)) return '📚 Обучение';
    if(/обычный|без времени|реальный|быстрый|начать|случайн|поряд/.test(t)) return '📝 Тесты';
    if(/истор|результ|прогресс|разбор/.test(t)) return '📊 Результаты';
    if(/подпис|премиум|активац|чек|оплат|admin|админ/.test(t)) return '🔐 Доступ';
    if(/сброс|настрой|тема|язык/.test(t)) return '⚙️ Настройки';
    return 'Ещё';
  }

  function groupDrawerMenu(){
    const list = $('.drawer-list') || $('#drawer-list') || $('.side-drawer .list') || $('.menu-drawer .list');
    if(!list || list.dataset.safeGrouped === '1') return;
    const items = Array.from(list.children).filter(el => norm(el.textContent));
    if(items.length < 5) return;
    list.dataset.safeGrouped = '1';
    const groups = new Map();
    for(const item of items){
      const name = classifyMenuItem(item);
      if(!groups.has(name)) groups.set(name, []);
      groups.get(name).push(item);
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'safe-menu-groups';
    let idx = 0;
    for(const [name, groupItems] of groups){
      const details = document.createElement('details');
      details.className = 'safe-menu-group';
      if(idx < 2) details.open = true;
      const summary = document.createElement('summary');
      summary.textContent = name;
      const box = document.createElement('div');
      box.className = 'safe-menu-items';
      groupItems.forEach(el => box.appendChild(el));
      details.append(summary, box);
      wrapper.appendChild(details);
      idx++;
    }
    list.textContent = '';
    list.appendChild(wrapper);
  }

  function findAction(patterns){
    const candidates = $$('button,a,[role="button"]');
    for(const p of patterns){
      const found = candidates.find(el => norm(el.textContent || el.getAttribute('aria-label')).includes(p));
      if(found) return found;
    }
    return null;
  }

  function addDashboard(){
    const start = $('#start-screen');
    if(!start || $('#safe-dashboard')) return;
    const anchor = start.querySelector('.center') || start;
    const dash = document.createElement('div');
    dash.id = 'safe-dashboard';
    dash.className = 'safe-dashboard';
    const actions = [
      ['📝 Начать тест', ['начать тест','обычный']],
      ['📚 Изучить', ['изучить тесты','список']],
      ['⭐ Избранные', ['избранные']],
      ['📊 История', ['история']]
    ];
    for(const [label, pats] of actions){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        const target = findAction(pats);
        if(target) click(target);
      });
      dash.appendChild(btn);
    }
    anchor.insertAdjacentElement('afterbegin', dash);
  }

  function addBottomNav(){
    if($('#safe-bottom-nav')) return;
    const nav = document.createElement('nav');
    nav.id = 'safe-bottom-nav';
    nav.className = 'safe-bottom-nav';
    nav.setAttribute('aria-label','Быстрая навигация');
    const items = [
      ['🏠','Меню', () => { try{ if(typeof window.showScreen==='function') window.showScreen('start-screen'); else location.hash=''; }catch(_){location.hash='';} }],
      ['📝','Тест', () => click(findAction(['начать тест','обычный']))],
      ['📚','Список', () => click(findAction(['изучить тесты','список']))],
      ['🔐','Доступ', () => { try{ if(typeof window.openSubscriptionModal==='function') window.openSubscriptionModal(); else click(findAction(['подпис','активац'])); }catch(_){click(findAction(['подпис','активац']));} }]
    ];
    for(const [ico, label, fn] of items){
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span class="safe-ico">${ico}</span><span>${label}</span>`;
      b.addEventListener('click', fn);
      nav.appendChild(b);
    }
    document.body.appendChild(nav);
  }

  function protectLocalStorage(){
    try{
      const limit = 1024 * 1024 * 4;
      let total = 0;
      for(let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        total += (k || '').length + (localStorage.getItem(k) || '').length;
      }
      if(total > limit){
        Object.keys(localStorage).filter(k => /history|debug|report|cache/i.test(k)).slice(0,20).forEach(k => localStorage.removeItem(k));
      }
    }catch(_){ }
  }

  function patchButtonsDoubleClick(){
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('button');
      if(!btn) return;
      const now = Date.now();
      const last = Number(btn.dataset.safeLastClick || 0);
      if(now - last < 450){
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      btn.dataset.safeLastClick = String(now);
    }, true);
  }

  function boot(){
    document.documentElement.classList.add('safe-compact');
    if(!$('.safe-skip-link')){
      const a = document.createElement('a');
      a.href = '#start-screen';
      a.className = 'safe-skip-link';
      a.textContent = 'К меню';
      document.body.prepend(a);
    }
    showBanner();
    enhanceFetch();
    debounceSearch();
    groupDrawerMenu();
    addDashboard();
    addBottomNav();
    protectLocalStorage();
    patchButtonsDoubleClick();
    setTimeout(groupDrawerMenu, 250);
    setTimeout(() => { debounceSearch(); addDashboard(); }, 700);
    window.addEventListener('hashchange', groupDrawerMenu, {passive:true});
    window.addEventListener('resize', () => document.documentElement.style.setProperty('--vh', `${innerHeight * .01}px`), {passive:true});
    console.info('[new-quiz secure-ui]', VERSION, 'loaded');
  }
  ready(boot);
})();
