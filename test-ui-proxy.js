const http = require('http');

const PORT = process.env.PORT || 3000;
const PROD_UI = process.env.PROD_UI || 'https://masoi15.netlify.app/';
const TEST_SERVER = process.env.TEST_SERVER || 'https://masoi-bot-test.onrender.com';

const TEST_CARD = `
<style id="test-final-style">
  #testModeCard{border:1px solid rgba(156,39,176,.65);box-shadow:0 0 24px rgba(156,39,176,.12)}
  #testToggleWrap{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid rgba(255,202,102,.30);border-radius:12px;background:rgba(255,202,102,.06);cursor:pointer;user-select:none}
  #testBotToggle{width:21px;height:21px;accent-color:#9c27b0}
  #testConfigBody.hidden{display:none!important}
  #testHumanRoleList .testHumanRoleRow{display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,.9fr);gap:10px;align-items:center;margin:8px 0;padding:10px;border:1px solid rgba(255,255,255,.09);border-radius:12px}
  #testHumanRoleList .testHumanRoleSelect{min-height:48px;font-size:16px;touch-action:manipulation;position:relative;z-index:2}
  .testRoleInline{margin-left:6px;font-weight:900;color:#ffca66;font-size:12px;white-space:nowrap}
  #testObserverPanel{display:none;margin:12px 0;padding:12px;border:1px solid rgba(255,202,102,.32);border-radius:14px;background:rgba(11,8,25,.94);font-size:12px;line-height:1.55}
  #testObserverPanel.show{display:block}
  #testObserverPanel .obsTitle{font-weight:950;color:#ffd47a;margin-bottom:7px;font-size:14px}
  #testObserverPanel .obsRow{padding:4px 0;border-bottom:1px solid rgba(255,255,255,.06)}
  #testObserverPanel .obsRow:last-child{border-bottom:0}
  #coupleHeartsOverlay{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:99980}
  #coupleHeartsOverlay .heart{position:absolute;bottom:-12vh;font-size:clamp(18px,4vw,36px);opacity:.88;animation:coupleHeartFly linear infinite;filter:drop-shadow(0 0 8px rgba(255,66,130,.45))}
  @keyframes coupleHeartFly{0%{transform:translate3d(0,0,0) rotate(0deg) scale(.75);opacity:0}10%{opacity:.9}80%{opacity:.78}100%{transform:translate3d(var(--drift),-120vh,0) rotate(35deg) scale(1.25);opacity:0}}
  @media(max-width:560px){#testHumanRoleList .testHumanRoleRow{grid-template-columns:1fr}.testHumanRoleSelect{width:100%}.testRoleInline{font-size:11px}}
</style>
<div id="testModeCard" class="card">
  <div class="title">🧪 TEST BOT</div>
  <label id="testToggleWrap">
    <input id="testBotToggle" type="checkbox">
    <span><b>Bật TEST BOT</b><br><span class="muted" style="font-size:12px">Khi bật: Host chọn cấu hình test, Bot lấp ghế còn thiếu và Host thấy vai + chức năng của tất cả người chơi/Bot.</span></span>
  </label>

  <div id="testConfigBody" class="hidden" style="margin-top:12px">
    <div class="grid2">
      <div><div class="muted" style="margin-bottom:5px">Tổng số người trong ván</div><select id="testPlayerCount" class="input"></select></div>
      <div><div class="muted" style="margin-bottom:5px">Số Bot sẽ thêm</div><div id="testBotCount" class="input" style="display:flex;align-items:center;min-height:44px">—</div></div>
    </div>
    <div style="margin-top:12px">
      <div class="muted" style="margin-bottom:6px">🎭 Chọn vai cho máy thật</div>
      <div id="testHumanRoleList"></div>
    </div>
    <button id="testStartBtn" class="btn green full" style="margin-top:10px">🤖 Thêm Bot & Bắt đầu test</button>
    <div id="testRoleHint" class="muted" style="font-size:12px;margin-top:8px"></div>
  </div>
</div>
`;

const TEST_SCRIPT = `
<script id="test-final-script">
(function(){
  const ROLE_TABLE={
    6:['Sói','Tiên tri','Bảo vệ','Dân'],
    7:['Sói','Tiên tri','Bảo vệ','Phù thủy','Dân'],
    8:['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Dân'],
    9:['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Dân'],
    10:['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Cupid','Dân'],
    11:['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Cupid','Dân'],
    12:['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Cupid','Dân'],
    13:['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Cupid','Dân'],
    14:['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Cupid','Dân'],
    15:['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Cupid','Dân']
  };

  const rolePickById={};
  const roleMap={};
  let observerState=null;
  let testEnabled=false;
  let lastHumanSignature='';
  let heartsUntil=0;
  let heartsStopTimer=0;

  try{testEnabled=sessionStorage.getItem('masoi_test_enabled')==='1'}catch(e){}

  function escHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function notify(s){try{if(typeof toast==='function')toast(s)}catch(e){}}
  function host(){try{return !!isHost}catch(e){return false}}
  function started(){try{return !!room?.started}catch(e){return false}}
  function currentPlayers(){try{return Array.isArray(players)?players:[]}catch(e){return []}}
  function humans(){return currentPlayers().filter(p=>!p.isBot&&p.connected!==false&&p.leftGame!==true)}
  function playerName(id){const p=(observerState?.players||[]).find(x=>x.id===id)||currentPlayers().find(x=>x.id===id);return p?.name||'—'}

  function countRoleSlots(n){
    if(n===6)return {'Sói':2,'Tiên tri':1,'Bảo vệ':1,'Dân':2};
    if(n===7)return {'Sói':2,'Tiên tri':1,'Bảo vệ':1,'Phù thủy':1,'Dân':2};
    if(n===8)return {'Sói':2,'Tiên tri':1,'Bảo vệ':1,'Phù thủy':1,'Thợ săn':1,'Dân':2};
    if(n===9)return {'Sói':2,'Tiên tri':1,'Bảo vệ':1,'Phù thủy':1,'Thợ săn':1,'Dân':3};
    const wolves=n>=13?4:3;const base=wolves+5;
    return {'Sói':wolves,'Tiên tri':1,'Bảo vệ':1,'Phù thủy':1,'Thợ săn':1,'Cupid':1,'Dân':n-base};
  }

  function roleOptions(n,selected){
    const slots=countRoleSlots(n),allowed=ROLE_TABLE[n]||[];
    let html='<option value="Random">🎲 Random</option>';
    for(const r of allowed){const qty=slots[r]||1;html+='<option value="'+escHtml(r)+'"'+(selected===r?' selected':'')+'>'+escHtml(r)+(qty>1?' ×'+qty:'')+'</option>'}
    return html;
  }

  function initCount(){
    const el=document.getElementById('testPlayerCount');if(!el)return;
    if(!el.options.length){for(let n=6;n<=15;n++){const o=document.createElement('option');o.value=String(n);o.textContent=n+' người';el.appendChild(o)}el.value='10'}
  }

  function renderHumanRoles(force=false){
    const list=document.getElementById('testHumanRoleList'),count=document.getElementById('testPlayerCount'),botCount=document.getElementById('testBotCount');
    if(!list||!count)return;
    const n=Number(count.value||10),hs=humans(),bots=n-hs.length;
    if(botCount){botCount.textContent=bots>=0?'🤖 '+bots+' Bot':'⚠️ Dư '+Math.abs(bots)+' máy thật'}
    const sig=n+'|'+hs.map(p=>p.id+':'+p.name).join('|');
    if(!force&&sig===lastHumanSignature)return;lastHumanSignature=sig;
    if(!hs.length){list.innerHTML='<div class="muted">Chưa có máy thật.</div>';return}
    list.innerHTML=hs.map(p=>'<div class="testHumanRoleRow"><div><b>'+escHtml(p.name)+'</b>'+(p.id===meId?' • Bạn':'')+'<div class="muted" style="font-size:11px">📱 Máy thật</div></div><select class="input testHumanRoleSelect" data-player-id="'+escHtml(p.id)+'">'+roleOptions(n,rolePickById[p.id]||'Random')+'</select></div>').join('');
    list.querySelectorAll('.testHumanRoleSelect').forEach(sel=>sel.addEventListener('change',()=>{rolePickById[sel.dataset.playerId]=sel.value;renderHint()}));
  }

  function renderHint(){
    const c=document.getElementById('testPlayerCount'),h=document.getElementById('testRoleHint');if(!c||!h)return;
    const n=Number(c.value),hs=humans(),bots=Math.max(0,n-hs.length);
    const locks=hs.map(p=>({name:p.name,role:rolePickById[p.id]||'Random'})).filter(x=>x.role!=='Random');
    h.textContent=hs.length+' máy thật + '+bots+' Bot.'+(locks.length?' Vai đã khóa: '+locks.map(x=>x.name+' = '+x.role).join(', ')+'.':'');
  }

  function setTestEnabled(v,emit=true){
    testEnabled=!!v;
    try{sessionStorage.setItem('masoi_test_enabled',testEnabled?'1':'0')}catch(e){}
    const cb=document.getElementById('testBotToggle');if(cb&&cb.checked!==testEnabled)cb.checked=testEnabled;
    const body=document.getElementById('testConfigBody');if(body)body.classList.toggle('hidden',!testEnabled);
    const normalStart=document.getElementById('startBtn');if(normalStart&&host())normalStart.classList.toggle('hidden',testEnabled);
    if(!testEnabled){for(const k of Object.keys(rolePickById))delete rolePickById[k]}
    if(emit){try{socket.emit('setTestBotEnabled',{enabled:testEnabled})}catch(e){}}
  }

  function startTest(){
    if(!host()){notify('Chỉ Host mới bắt đầu Test Bot.');return}
    const count=document.getElementById('testPlayerCount'),btn=document.getElementById('testStartBtn');
    const n=Number(count?.value||10),hs=humans();
    if(hs.length>n){notify('Số máy thật đang nhiều hơn số người của bàn.');return}
    const roleAssignments={};
    for(const p of hs){const r=rolePickById[p.id]||'Random';if(r!=='Random')roleAssignments[p.id]=r}
    if(btn){btn.disabled=true;btn.textContent='⏳ Đang tạo bàn test...'}
    socket.emit('startTestGame',{count:n,roleAssignments});
    setTimeout(()=>{if(btn&&!started()){btn.disabled=false;btn.textContent='🤖 Thêm Bot & Bắt đầu test'}},3500);
  }

  function stopTestRound(){
    if(!host()){notify('Chỉ Host mới dừng ván Test Bot.');return}
    if(!confirm('Dừng ván test hiện tại, xóa Bot cũ và quay về Lobby? TEST BOT vẫn bật.'))return;
    socket.emit('stopTestGame');
  }

  function clearRoleBadges(){document.querySelectorAll('.testRoleInline').forEach(e=>e.remove())}
  function decorateRoles(){
    clearRoleBadges();
    if(!(host()&&started()&&testEnabled))return;
    const root=document.getElementById('gameScreen')||document.body;
    const ps=observerState?.players||Object.entries(roleMap).map(([id,role])=>({id,role,name:playerName(id)}));
    for(const p of ps){
      if(!p?.role||!p?.name)continue;
      const candidates=[...root.querySelectorAll('*')].filter(el=>{
        if(el.classList?.contains('testRoleInline'))return false;
        const text=(el.textContent||'').trim();
        const direct=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent||'').join('').trim();
        return text===p.name||direct===p.name;
      });
      const nameEl=candidates.sort((a,b)=>a.children.length-b.children.length)[0];if(!nameEl)continue;
      const badge=document.createElement('span');badge.className='testRoleInline';badge.textContent=' — '+p.role+(p.alive===false?' 💀':'');nameEl.appendChild(badge);
    }
  }

  function ensureObserver(){
    let panel=document.getElementById('testObserverPanel');
    if(panel)return panel;
    panel=document.createElement('div');panel.id='testObserverPanel';
    const game=document.getElementById('gameScreen');
    const hostPanel=document.querySelector('#hostPanel,.host-panel,.hostCard,#hostCard');
    (hostPanel||game||document.body).appendChild(panel);
    return panel;
  }

  function renderObserver(){
    const panel=ensureObserver();
    if(!(host()&&started()&&testEnabled&&observerState)){panel.classList.remove('show');panel.innerHTML='';return}
    const a=observerState.actions||{};
    const rows=[];
    rows.push('<div class="obsTitle">👁 TEST OBSERVER — thấy toàn bộ chức năng</div>');
    rows.push('<div class="obsRow">Phase: <b>'+escHtml(observerState.phase||'—')+'</b> · Đêm '+escHtml(observerState.nightNumber||0)+'</div>');
    if(a.wolfVotes?.length)rows.push('<div class="obsRow">🐺 '+a.wolfVotes.map(v=>escHtml(v.voterName)+' → '+escHtml(v.targetName)).join(' · ')+'</div>');
    if(a.guardTargetId)rows.push('<div class="obsRow">🛡️ Bảo vệ → '+escHtml(playerName(a.guardTargetId))+'</div>');
    if(a.seerInspections?.length)rows.push('<div class="obsRow">🔮 '+a.seerInspections.map(x=>escHtml(x.seerName)+' soi '+escHtml(x.targetName)+' = '+escHtml(x.result)).join(' · ')+'</div>');
    if(a.witchPoisonDraftTargetId)rows.push('<div class="obsRow">☠️ Độc đang chọn → '+escHtml(playerName(a.witchPoisonDraftTargetId))+'</div>');
    if(a.witchPoisonTargetId)rows.push('<div class="obsRow">☠️ Độc đã khóa → '+escHtml(playerName(a.witchPoisonTargetId))+'</div>');
    if(a.witchSave)rows.push('<div class="obsRow">❤️ Phù thủy đã dùng Cứu</div>');
    if(a.cupidDraftIds?.length)rows.push('<div class="obsRow">💘 Cupid đang chọn → '+a.cupidDraftIds.map(id=>escHtml(playerName(id))).join(' ❤️ ')+'</div>');
    if(a.cupidPairs?.length)rows.push('<div class="obsRow">💞 Couple → '+a.cupidPairs.map(x=>escHtml(x.firstName)+' ❤️ '+escHtml(x.secondName)).join(' · ')+'</div>');
    if(a.pendingHunter)rows.push('<div class="obsRow">🏹 Hunter đang trả thù: '+escHtml(a.pendingHunter.name||playerName(a.pendingHunter.id))+'</div>');
    if(a.dayVotes?.length)rows.push('<div class="obsRow">🗳️ '+a.dayVotes.map(v=>escHtml(v.voterName)+' → '+escHtml(v.targetName)).join(' · ')+'</div>');
    panel.innerHTML=rows.join('');panel.classList.add('show');
  }

  function stopHearts(){
    heartsUntil=0;if(heartsStopTimer){clearTimeout(heartsStopTimer);heartsStopTimer=0}
    document.getElementById('coupleHeartsOverlay')?.remove();
  }

  function startHearts(until){
    stopHearts();heartsUntil=Number(until)||0;
    const overlay=document.createElement('div');overlay.id='coupleHeartsOverlay';
    const total=28;
    for(let i=0;i<total;i++){
      const h=document.createElement('span');h.className='heart';h.textContent=i%4===0?'💗':'❤️';
      h.style.left=(Math.random()*100)+'vw';h.style.setProperty('--drift',((Math.random()-.5)*26)+'vw');
      h.style.animationDuration=(4+Math.random()*5)+'s';h.style.animationDelay=(-Math.random()*7)+'s';
      overlay.appendChild(h);
    }
    document.body.appendChild(overlay);
    if(heartsUntil>Date.now())heartsStopTimer=setTimeout(stopHearts,Math.max(100,heartsUntil-Date.now()));
  }

  function syncUI(){
    initCount();
    const card=document.getElementById('testModeCard');if(card)card.classList.toggle('hidden',started()||!host());
    const toggle=document.getElementById('testBotToggle');
    if(toggle&&!toggle.dataset.bound){toggle.dataset.bound='1';toggle.checked=testEnabled;toggle.addEventListener('change',()=>setTestEnabled(toggle.checked,true))}
    const count=document.getElementById('testPlayerCount');if(count&&!count.dataset.bound){count.dataset.bound='1';count.addEventListener('change',()=>{lastHumanSignature='';renderHumanRoles(true);renderHint()})}
    const btn=document.getElementById('testStartBtn');if(btn&&!btn.dataset.bound){btn.dataset.bound='1';btn.addEventListener('click',startTest)}
    const body=document.getElementById('testConfigBody');if(body)body.classList.toggle('hidden',!testEnabled);
    const normalStart=document.getElementById('startBtn');if(normalStart&&host())normalStart.classList.toggle('hidden',testEnabled);
    renderHumanRoles(false);renderHint();

    const old=document.getElementById('gameLeaveBtn');
    if(old&&host()&&started()&&testEnabled&&!document.getElementById('stopTestGameBtn')){
      const b=document.createElement('button');b.id='stopTestGameBtn';b.className='btn red full';b.textContent='⛔ Dừng ván Test';b.style.marginBottom='8px';b.onclick=stopTestRound;old.parentNode.insertBefore(b,old)
    }
    if(!(host()&&started()&&testEnabled))document.getElementById('stopTestGameBtn')?.remove();
    decorateRoles();renderObserver();
  }

  function bind(){
    if(typeof socket==='undefined'||!socket||socket.__testFinalBound)return;socket.__testFinalBound=true;

    socket.on('roomState',d=>{
      if(d?.room&&typeof d.room.testMode==='boolean')setTestEnabled(d.room.testMode,false);
      setTimeout(syncUI,0);
    });
    socket.on('testModeState',d=>setTestEnabled(!!d?.enabled,false));
    socket.on('testBotEnabled',()=>setTestEnabled(true,false));
    socket.on('testBotDisabled',()=>setTestEnabled(false,false));

    socket.on('testRoleMap',d=>{
      for(const k of Object.keys(roleMap))delete roleMap[k];
      for(const p of d?.players||[])if(p?.id&&p?.role)roleMap[p.id]=p.role;
      testEnabled=true;try{sessionStorage.setItem('masoi_test_enabled','1')}catch(e){}
      setTimeout(syncUI,0);
    });

    socket.on('testObserverState',d=>{observerState=d||null;if(d?.testMode)testEnabled=true;setTimeout(syncUI,0)});
    socket.on('playersUpdated',()=>setTimeout(syncUI,0));
    socket.on('phaseChanged',d=>{if(d?.phase!=='night'||Number(d?.nightNumber)!==1)stopHearts();setTimeout(syncUI,0)});
    socket.on('gameEnded',()=>{stopHearts();setTimeout(syncUI,0)});

    socket.on('testStopped',d=>{
      observerState=null;for(const k of Object.keys(roleMap))delete roleMap[k];clearRoleBadges();stopHearts();
      setTestEnabled(true,false);notify('✅ '+(d?.message||'Đã dừng ván test. TEST BOT vẫn bật.'));setTimeout(syncUI,100)
    });

    socket.on('coupleHearts',d=>{if(d?.active)startHearts(d?.until);else stopHearts()});
    socket.on('loverLinked',d=>{if(d?.hearts)startHearts(d?.heartsUntil)});

    socket.on('actionError',()=>{const b=document.getElementById('testStartBtn');if(b){b.disabled=false;b.textContent='🤖 Thêm Bot & Bắt đầu test'}});
  }

  if(typeof renderAll==='function'){
    const base=renderAll;renderAll=function(){const r=base.apply(this,arguments);setTimeout(syncUI,0);return r}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{bind();syncUI()},{once:true});else{bind();syncUI()}
  setInterval(()=>{bind();syncUI()},900);
})();
</script>
`;

function inject(html){
  let out=String(html);
  if(!out.includes('<base '))out=out.replace(/<head([^>]*)>/i,'<head$1>\n<base href="https://masoi15.netlify.app/">');
  out=out.replaceAll('https://masoi-jbjs.onrender.com',TEST_SERVER);
  out=out.replace(/<meta property="og:title"[^>]*>/i,'<meta property="og:title" content="🧪 Ma Sói Bot Test">');
  out=out.replace(/<title>[^<]*<\/title>/i,'<title>🧪 Ma Sói Bot Test</title>');

  const readyMarker=/(<div class="card">\s*<div id="readyHint"[\s\S]*?<button id="readyBtn")/i;
  if(readyMarker.test(out))out=out.replace(readyMarker,TEST_CARD+'$1');
  else{
    const lobbyStart=out.indexOf('id="lobbyScreen"');
    const lobbyEnd=lobbyStart>=0?out.indexOf('</section>',lobbyStart):-1;
    if(lobbyEnd>0)out=out.slice(0,lobbyEnd)+TEST_CARD+out.slice(lobbyEnd);
  }

  out=out.replace('</body>',TEST_SCRIPT+'\n</body>');
  return out;
}

const server=http.createServer(async(req,res)=>{
  try{
    if(req.url==='/health'){res.writeHead(200,{'content-type':'text/plain; charset=utf-8'});return res.end('OK')}
    if(req.url!=='/'&&req.url!=='/index.html'){
      res.writeHead(302,{Location:PROD_UI.replace(/\/$/,'')+req.url});return res.end()
    }
    const r=await fetch(PROD_UI,{headers:{'user-agent':'Mozilla/5.0 MaSoiTestProxy/3.0'}});
    if(!r.ok)throw new Error('Production UI HTTP '+r.status);
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate','access-control-allow-origin':'*'});
    res.end(inject(await r.text()));
  }catch(err){
    res.writeHead(500,{'content-type':'text/plain; charset=utf-8'});
    res.end('Không tải được giao diện test: '+err.message);
  }
});

server.listen(PORT,()=>console.log('Bot UI listening on',PORT));
