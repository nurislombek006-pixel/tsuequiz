(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const LS='eco_ready_v1_'; const cfg=window.APP_CONFIG||{}; const FREE_LIMIT=Number(cfg.freeLimit||3); const ADMIN=cfg.adminUsername||'nurislombekm';
let DATA=[], mode='normal', selectedCount='20', quiz=[], qi=0, answers=[], confirmed=[], timer=null, left=0, realTimer=null, realLeft=1800, realAnswers=[], realFinished=false, lastResult=null;
const letters=['A','B','C','D','E','F'];
function save(k,v){try{localStorage.setItem(LS+k,JSON.stringify(v))}catch(e){}}
function load(k,d){try{const v=JSON.parse(localStorage.getItem(LS+k)); return v ?? d}catch(e){return d}}
function del(k){try{localStorage.removeItem(LS+k)}catch(e){}}
function fmtTime(s){s=Math.max(0,Number(s)||0); const m=Math.floor(s/60), ss=s%60; return `${m}:${String(ss).padStart(2,'0')}`}
function shuffle(a){a=[...a]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]} return a}
function tg(){const w=window.Telegram&&window.Telegram.WebApp; try{w?.ready?.(); w?.expand?.()}catch(e){} return w||null}
function userId(){const u=tg()?.initDataUnsafe?.user; return String(u?.id||load('manual_user','')).replace(/\D+/g,'')}
function deviceId(){let id=load('device_id',''); if(!id){id='D-'+Math.random().toString(36).slice(2,8).toUpperCase()+'-'+Date.now().toString(36).slice(-5).toUpperCase(); save('device_id',id)} return id}
function dayUsage(){const now=Date.now(), day=86400000; let a=load('usage',[]).map(Number).filter(x=>now-x<day); save('usage',a); return a}
function isPremiumLocal(){return !!load('premium_cache',false)}
async function refreshAccess(){
  const uid=userId(); const dev=deviceId();
  $('#userLine').textContent='Telegram ID: '+(uid||'не найден'); $('#deviceLine').textContent='Device: '+dev;
  try{ const r=await fetch(`/api/access?user_id=${encodeURIComponent(uid)}&device_id=${encodeURIComponent(dev)}`,{headers:{'X-Telegram-Init-Data':tg()?.initData||''}}); const j=await r.json(); if(j&&j.ok){save('premium_cache',!!j.premium); if(j.banned){showPay('Доступ заблокирован: '+(j.reason||''));} } }catch(e){}
  renderAccess();
}
function renderAccess(){const p=isPremiumLocal(); $('#accessBadge').textContent=p?'Премиум пользователь':'Обычный пользователь'; $('#accessBadge').style.color=p?'var(--ok)':'var(--warn)'; const used=dayUsage().length; const leftN=p?'∞':Math.max(0,FREE_LIMIT-used); $('#limitNote').textContent=p?'Премиум активен: лимитов нет.':`Бесплатно осталось: ${leftN}/${FREE_LIMIT} теста за 24 часа.`}
function canStart(){if(isPremiumLocal()) return true; const u=dayUsage(); if(u.length>=FREE_LIMIT){showPay(`Лимит бесплатных тестов исчерпан (${FREE_LIMIT}/${FREE_LIMIT}). Оформи премиум или подожди 24 часа.`); return false} return true}
function registerStart(){if(isPremiumLocal()) return; const u=dayUsage(); u.push(Date.now()); save('usage',u); renderAccess()}
async function loadData(){
  try{const r=await fetch('/questions.json?v=20260707'); const j=await r.json(); DATA=j.subjects.macro.tests||[]}catch(e){DATA=[]}
  if(!DATA.length){DATA=[{id:'fallback-1',question:'Что изучает макроэкономика?',options:['фирму','экономику в целом','один товар','только бухгалтерию'],answer:1}]}
  buildRanges(); updateHome(); $('#loader')?.classList.add('hide');
}
function buildRanges(){const sel=$('#rangeSelect'); sel.innerHTML='<option value="all">Все вопросы</option>'; for(let i=0;i<DATA.length;i+=50){const a=i+1,b=Math.min(DATA.length,i+50); const o=document.createElement('option'); o.value=`${i}-${b}`; o.textContent=`${a}–${b}`; sel.appendChild(o)}}
function favorites(){return load('favorites',[])} function mistakes(){return load('mistakes',[])} function studied(){return load('studied',[])} function history(){return load('history',[])}
function setArr(k,a){save(k,[...new Set(a)])}
function updateHome(){
  $('#totalCount').textContent=DATA.length; $('#favCount').textContent=favorites().length; $('#mistakeCount').textContent=mistakes().length;
  const st=studied(); $('#progressText').textContent=`${st.length}/${DATA.length}`; $('#progressFill').style.width=(DATA.length?st.length/DATA.length*100:0)+'%';
  renderAccess(); checkResume(); renderStats();
}
function checkResume(){const r=load('resume',null); $('#resumeCard').classList.toggle('hidden',!r)}
function choosePool(){
  let pool=[...DATA]; const r=$('#rangeSelect').value; if(r!=='all'){const [a,b]=r.split('-').map(Number); pool=DATA.slice(a,b)}
  const c=$('#countSelect').value; if(c==='fav') pool=pool.filter(q=>favorites().includes(q.id)); else if(c==='mistakes') pool=pool.filter(q=>mistakes().includes(q.id));
  if($('#orderSelect').value==='random') pool=shuffle(pool);
  if(!['all','fav','mistakes'].includes(c)) pool=pool.slice(0,Number(c));
  return pool;
}
function start(m){mode=m||mode; if(!canStart()) return; if(mode==='real') return startReal(); const pool=choosePool(); if(!pool.length){alert('Вопросов нет в этом режиме.'); return} registerStart(); quiz=pool; qi=0; answers=Array(quiz.length).fill(null); confirmed=Array(quiz.length).fill(false); left=mode==='notime'?0:Number($('#timeInput').value||1200); saveResume(); show('quiz'); renderQuiz(); startTimer();}
function saveResume(){save('resume',{mode,ids:quiz.map(q=>q.id),qi,answers,confirmed,left,time:Date.now()})}
function restoreResume(){const r=load('resume',null); if(!r) return; mode=r.mode; quiz=r.ids.map(id=>DATA.find(q=>q.id===id)).filter(Boolean); qi=r.qi||0; answers=r.answers||Array(quiz.length).fill(null); confirmed=r.confirmed||Array(quiz.length).fill(false); left=r.left||0; show('quiz'); renderQuiz(); startTimer();}
function startTimer(){clearInterval(timer); $('#timer').textContent=mode==='notime'?'∞':fmtTime(left); if(mode==='notime') return; timer=setInterval(()=>{left--; $('#timer').textContent=fmtTime(left); saveResume(); if(left<=0) finish(false)},1000)}
function renderQuiz(){const q=quiz[qi]; if(!q) return; $('#quizTitle').textContent=mode==='notime'?'Без времени':'Обычный тест'; $('#quizMeta').textContent=`${qi+1}/${quiz.length}`; $('#qNum').textContent=`Вопрос ${qi+1}`; $('#qText').textContent=q.question; $('#favBtn').textContent=favorites().includes(q.id)?'★':'☆'; const box=$('#options'); box.innerHTML=''; q.options.forEach((op,i)=>{const b=document.createElement('button'); b.className='option'; b.innerHTML=`<b>${letters[i]}</b><span></span>`; b.querySelector('span').textContent=op; if(answers[qi]===i) b.classList.add('selected'); if(confirmed[qi]){ if(i===q.answer)b.classList.add('correct'); if(answers[qi]===i && i!==q.answer)b.classList.add('wrong'); } b.onclick=()=>{if(confirmed[qi])return; answers[qi]=i; renderQuiz(); saveResume()}; box.appendChild(b)}); $('#prevBtn').disabled=qi===0; $('#nextBtn').textContent=qi===quiz.length-1?'К результату':'Дальше →'; saveResume();}
function confirm(){if(answers[qi]===null){alert('Выбери ответ.');return} confirmed[qi]=true; const q=quiz[qi]; const st=studied(); st.push(q.id); setArr('studied',st); const ms=mistakes(); if(answers[qi]!==q.answer) ms.push(q.id); else {const idx=ms.indexOf(q.id); if(idx>-1) ms.splice(idx,1)} setArr('mistakes',ms); renderQuiz(); updateHome();}
function next(){if(qi<quiz.length-1){qi++; renderQuiz()} else finish(false)}
function finish(auto){clearInterval(timer); const total=quiz.length; let correct=0; quiz.forEach((q,i)=>{if(answers[i]===q.answer)correct++}); lastResult={type:mode,total,correct,percent:Math.round(correct/total*100),date:Date.now(),items:quiz.map((q,i)=>({id:q.id,question:q.question,options:q.options,answer:q.answer,user:answers[i]}))}; const h=history(); h.unshift(lastResult); save('history',h.slice(0,50)); del('resume'); renderResult(); sendReport(lastResult); show('result'); updateHome();}
async function sendReport(res){try{await fetch('/api/report',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':tg()?.initData||''},body:JSON.stringify({user_id:userId(),device_id:deviceId(),result:res})})}catch(e){}}
function renderResult(){const r=lastResult||history()[0]||{correct:0,total:0,percent:0,items:[]}; $('#scoreBox').textContent=`${r.correct} / ${r.total}`; $('#scorePercent').textContent=r.percent+'%'; $('#reviewList').innerHTML=''}
function renderReview(){const r=lastResult||history()[0]; if(!r) return; const box=$('#reviewList'); box.innerHTML=''; r.items.forEach((it,idx)=>{const d=document.createElement('div'); d.className='study-item'; d.innerHTML=`<h3>${idx+1}. ${escapeHtml(it.question)}</h3><ol>${it.options.map((o,i)=>`<li class="${i===it.answer?'answer':''}">${escapeHtml(o)} ${i===it.user?'← ваш ответ':''}</li>`).join('')}</ol>`; box.appendChild(d)})}
function startReal(){const pool=shuffle(DATA).slice(0,25); if(!pool.length)return; if(!canStart())return; registerStart(); quiz=pool; realAnswers=Array(quiz.length).fill(null); realFinished=false; realLeft=1800; show('real'); renderReal(); clearInterval(realTimer); realTimer=setInterval(()=>{realLeft--; $('#realTimer').textContent=fmtTime(realLeft); if(realLeft<=0)finishReal(true)},1000)}
function renderReal(){const box=$('#realList'); box.innerHTML=''; $('#realTimer').textContent=fmtTime(realLeft); quiz.forEach((q,idx)=>{const d=document.createElement('div'); d.className='real-item'; d.innerHTML=`<h3>${idx+1}. ${escapeHtml(q.question)}</h3><div class="real-options"></div>`; const opt=d.querySelector('.real-options'); q.options.forEach((o,i)=>{const b=document.createElement('button'); b.textContent=letters[i]+'. '+o; if(realAnswers[idx]===i)b.classList.add('chosen'); if(realFinished){if(i===q.answer)b.classList.add('good'); if(realAnswers[idx]===i&&i!==q.answer)b.classList.add('bad')} b.onclick=()=>{if(realFinished)return; realAnswers[idx]=i; renderReal()}; opt.appendChild(b)}); box.appendChild(d)})}
function finishReal(auto){if(realFinished)return; clearInterval(realTimer); realFinished=true; let correct=0; quiz.forEach((q,i)=>{if(realAnswers[i]===q.answer)correct++}); lastResult={type:'real',total:quiz.length,correct,percent:Math.round(correct/quiz.length*100),date:Date.now(),items:quiz.map((q,i)=>({id:q.id,question:q.question,options:q.options,answer:q.answer,user:realAnswers[i]}))}; const h=history(); h.unshift(lastResult); save('history',h.slice(0,50)); renderReal(); renderResult(); sendReport(lastResult); setTimeout(()=>show('result'),300); updateHome();}
function renderStudy(filterIds=null){const query=($('#searchInput')?.value||'').toLowerCase(); const showAns=$('#showAnswers')?.checked; const ids=filterIds||DATA.map(q=>q.id); const box=$('#studyList'); box.innerHTML=''; DATA.filter(q=>ids.includes(q.id)&&q.question.toLowerCase().includes(query)).forEach((q,idx)=>{const d=document.createElement('div'); d.className='study-item'; d.innerHTML=`<h3>${q.id}. ${escapeHtml(q.question)}</h3>${showAns?`<ol>${q.options.map((o,i)=>`<li class="${i===q.answer?'answer':''}">${escapeHtml(o)}</li>`).join('')}</ol>`:''}<button data-fav="${q.id}">${favorites().includes(q.id)?'★ Убрать':'☆ В избранное'}</button>`; box.appendChild(d)}); $$('[data-fav]').forEach(b=>b.onclick=()=>toggleFav(b.dataset.fav));}
function renderHistory(){const box=$('#historyList'); const h=history(); box.innerHTML=h.length?'':'<p class="note">Истории пока нет.</p>'; h.forEach(r=>{const d=document.createElement('div'); d.className='hist'; d.innerHTML=`<div><b>${r.type==='real'?'Реальный':'Тест'} — ${r.correct}/${r.total}</b><small>${new Date(r.date).toLocaleString('ru-RU')}</small></div><b>${r.percent}%</b>`; box.appendChild(d)})}
function renderStats(){const h=history(); const total=h.length; const avg=total?Math.round(h.reduce((s,x)=>s+x.percent,0)/total):0; const best=total?Math.max(...h.map(x=>x.percent)):0; const box=$('#statsBox'); if(box)box.innerHTML=`<div class="mini-stats"><div><b>${total}</b><span>попыток</span></div><div><b>${avg}%</b><span>средний</span></div><div><b>${best}%</b><span>лучший</span></div></div>`}
function toggleFav(id){const f=favorites(); const i=f.indexOf(id); if(i>-1)f.splice(i,1); else f.push(id); setArr('favorites',f); updateHome(); renderStudy()}
function show(id){$$('.screen').forEach(s=>s.classList.remove('active')); $('#'+id)?.classList.add('active'); closeDrawer(); if(id==='study')renderStudy(); if(id==='history')renderHistory(); if(id==='stats')renderStats(); scrollTo({top:0,behavior:'smooth'})}
function openDrawer(){ $('#drawer').classList.add('open'); $('#shade').classList.add('show')} function closeDrawer(){ $('#drawer').classList.remove('open'); $('#shade').classList.remove('show')}
function showPay(msg=''){ $('#payUser').textContent=userId()||'Открой через Telegram Mini App'; $('#payDevice').textContent=deviceId(); $('#payMsg').textContent=msg||'После оплаты отправь чек администратору.'; $('#paywall').classList.remove('hidden')}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function bind(){
  $('#drawerBtn').onclick=openDrawer; $('#closeDrawer').onclick=closeDrawer; $('#shade').onclick=closeDrawer; $('#themeBtn').onclick=()=>{document.body.classList.toggle('dark'); save('dark',document.body.classList.contains('dark'))}; if(load('dark',false))document.body.classList.add('dark');
  $$('[data-go]').forEach(b=>b.onclick=()=>{const g=b.dataset.go; if(g==='pay')showPay(); else if(g==='favorites'){show('study'); renderStudy(favorites())} else if(g==='mistakes'){show('study'); renderStudy(mistakes())} else show(g)});
  $$('[data-start]').forEach(b=>b.onclick=()=>start(b.dataset.start)); $$('.mode-tabs button').forEach(b=>b.onclick=()=>{$$('.mode-tabs button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); mode=b.dataset.mode; $('#timeWrap').classList.toggle('hidden',mode==='notime'||mode==='real')});
  $('#startBtn').onclick=()=>start(mode); $('#prevBtn').onclick=()=>{if(qi>0){qi--;renderQuiz()}}; $('#nextBtn').onclick=next; $('#confirmBtn').onclick=confirm; $('#finishBtn').onclick=()=>finish(false); $('#favBtn').onclick=()=>{const q=quiz[qi]; if(q)toggleFav(q.id); renderQuiz()};
  $('#resumeBtn').onclick=restoreResume; $('#clearResumeBtn').onclick=()=>{del('resume');checkResume()}; $('#realFinishBtn').onclick=()=>finishReal(false); $('#realFinishTop').onclick=()=>finishReal(false); $('#reviewBtn').onclick=renderReview; $('#searchInput').oninput=()=>renderStudy(); $('#showAnswers').onchange=()=>renderStudy();
  $('#clearHistory').onclick=()=>{if(confirm('Очистить историю?')){save('history',[]);renderHistory();renderStats()}}; $('#closePay').onclick=()=>$('#paywall').classList.add('hidden');
  $('#copyCard').onclick=()=>navigator.clipboard?.writeText('5614 6805 7717 0398'); $('#copyPayData').onclick=()=>{const text=`Здравствуйте! Хочу активировать премиум-доступ.\nTelegram ID: ${userId()||'-'}\nID устройства: ${deviceId()}\nСумма: 30 000 сум\nКарта: 5614 6805 7717 0398`; navigator.clipboard?.writeText(text); $('#payMsg').textContent='Данные скопированы. Отправь их вместе с чеком @'+ADMIN};
  $$('[data-action="resetLocal"]').forEach(b=>b.onclick=()=>{if(confirm('Сбросить локальные настройки, избранное, ошибки и историю?')){Object.keys(localStorage).filter(k=>k.startsWith(LS)).forEach(k=>localStorage.removeItem(k)); location.reload()}})
}
window.addEventListener('DOMContentLoaded',()=>{bind(); loadData(); refreshAccess();});
})();
