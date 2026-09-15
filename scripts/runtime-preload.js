/* Ma Sói Online: preserve current finalizer, then add server-authoritative TEST BOT consent. */
const fs=require('fs');
const path=require('path');
const SERVER=path.join(path.resolve(__dirname,'..'),'server-unified.js');
const MARK='// SERVER CONSENT PATCH 2026-09-15';

function segment(src,start,end,fn,label){
  const a=src.indexOf(start), b=a<0?-1:src.indexOf(end,a+start.length);
  if(a<0||b<0) throw new Error(`[CONSENT PATCH] missing segment: ${label}`);
  const old=src.slice(a,b), next=fn(old);
  if(next===old) throw new Error(`[CONSENT PATCH] segment unchanged: ${label}`);
  return src.slice(0,a)+next+src.slice(b);
}
function replaceRx(src,rx,repl,label){
  if(!rx.test(src)) throw new Error(`[CONSENT PATCH] missing anchor: ${label}`);
  rx.lastIndex=0; return src.replace(rx,repl);
}
function patch(src){
  if(src.includes(MARK)) return src;
  const helpers=`\n${MARK}\n/* TEST BOT CONSENT - SERVER AUTHORITATIVE */\nfunction __emptyTestConsent(){return{active:false,cycleId:0,round:0,requestSeq:0,requestTargets:[],responses:{},askedAt:0};}\nfunction __resetTestConsent(){room.testConsent=__emptyTestConsent();}\nfunction __realTestHumans(){return room.players.filter(p=>!p.isBot&&p.connected!==false&&p.leftGame!==true);}\nfunction __testConsentMembers(){return __realTestHumans().filter(p=>p.id!==room.hostId);}\nfunction __testConsentState(){const c=room.testConsent||__emptyTestConsent();const members=__testConsentMembers().map(p=>({id:p.id,name:p.name,state:c.responses?.[p.id]||'pending'}));return{active:!!c.active,cycleId:Number(c.cycleId||0),round:Number(c.round||0),requestSeq:Number(c.requestSeq||0),requestTargets:[...(c.requestTargets||[])],responses:{...(c.responses||{})},members,allApproved:members.every(x=>x.state==='ok'),hasPending:members.some(x=>x.state==='pending'),hasRejected:members.some(x=>x.state==='no')};}\nfunction __emitTestConsentState(targetId=null){const state=__testConsentState();if(targetId)io.to(targetId).emit('testConsentState',state);else io.emit('testConsentState',state);if(!state.active)return state;for(const playerId of state.requestTargets){if(state.responses[playerId]!=='pending')continue;const target=findPlayer(playerId);if(!target?.connected)continue;io.to(target.id).emit('testConsentRequest',{cycleId:state.cycleId,round:state.round,requestSeq:state.requestSeq,hostId:room.hostId,hostName:findPlayer(room.hostId)?.name||'Host',selectedRole:room.testRoleAssignments?.[target.id]||'Random'});}return state;}\nfunction __beginTestConsentCycle(){const members=__testConsentMembers();if(!members.length){__resetTestConsent();return __testConsentState();}room.testConsent={active:true,cycleId:Date.now(),round:1,requestSeq:1,requestTargets:members.map(p=>p.id),responses:Object.fromEntries(members.map(p=>[p.id,'pending'])),askedAt:Date.now()};return __emitTestConsentState();}\nfunction __addTestConsentMember(player){if(!room.testMode||!player||player.id===room.hostId)return;const c=room.testConsent||__emptyTestConsent();if(!c.active){c.active=true;c.cycleId=Date.now();c.round=1;c.requestSeq=1;c.responses={};c.requestTargets=[];}c.responses[player.id]='pending';if(!c.requestTargets.includes(player.id))c.requestTargets.push(player.id);c.askedAt=Date.now();room.testConsent=c;__emitTestConsentState();}\nfunction __retryRejectedTestConsent(){const c=room.testConsent||__emptyTestConsent();const rejected=__testConsentMembers().filter(p=>c.responses?.[p.id]==='no');if(!rejected.length)return __testConsentState();c.active=true;c.round=Math.min(3,Math.max(1,Number(c.round||1))+1);c.requestSeq=Number(c.requestSeq||0)+1;c.requestTargets=rejected.map(p=>p.id);for(const p of rejected)c.responses[p.id]='pending';c.askedAt=Date.now();room.testConsent=c;return __emitTestConsentState();}\nfunction __disableTestModeToLobby(){room.testMode=false;room.players=room.players.filter(p=>!p.isBot);room.testConfig=null;room.testHumanId=null;room.testRoleAssignments={};room.testBotWolfNight=null;room.testBotWolfTargetId=null;room.targetPlayerCount=room.players.length;__resetTestConsent();}\nfunction __rotateHostAfterConsentFailure(){const candidates=__testConsentMembers().filter(p=>p.connected!==false);if(!candidates.length)return false;const oldHost=findPlayer(room.hostId),newHost=candidates[Math.floor(Math.random()*candidates.length)];room.hostId=newHost.id;__disableTestModeToLobby();io.emit('hostChanged',{reason:'testBotRefusal',oldHostId:oldHost?.id||null,oldHostName:oldHost?.name||null,newHostId:newHost.id,newHostName:newHost.name,message:'👑 '+newHost.name+' là Host mới vì TEST BOT đã bị từ chối đủ 3 lần.'});io.emit('testBotDisabled',{enabled:false,message:'TEST BOT đã tắt; Lobby trở lại chế độ người thật.'});__emitTestConsentState();emitRoom();sendAdminState();return true;}\nfunction __validateTestRoleConfig(count,requested){if(!ALLOWED_SIZES.includes(count))return{ok:false,message:'Số người phải từ 6 đến 15.'};const humans=__realTestHumans();if(humans.length>count)return{ok:false,message:'Đang có '+humans.length+' máy thật, nhiều hơn bàn '+count+' người.'};const remaining={};for(const role of getRoleComposition(count))remaining[role]=(remaining[role]||0)+1;const clean={};for(const human of humans){const role=String(requested?.[human.id]||'').trim();if(!role||role==='Random')continue;if(!testAllowedRoles(count).includes(role))return{ok:false,message:role+' không có trong bàn '+count+' người.'};if(!remaining[role])return{ok:false,message:'Không đủ slot vai '+role+' cho các máy thật đã chọn.'};remaining[role]--;clean[human.id]=role;}return{ok:true,clean};}\nfunction __emitTestRoleConfig(targetId=null){const count=Number(room.testConfig?.count||room.targetPlayerCount||Math.max(MIN_PLAYERS,room.players.length));const assignments={...(room.testRoleAssignments||{})};const host=findPlayer(room.hostId);if(host?.connected&&(!targetId||targetId===host.id))io.to(host.id).emit('testRoleConfigState',{count,roleAssignments:assignments,allowedRoles:testAllowedRoles(count),roleComposition:getRoleComposition(count)});for(const p of __realTestHumans()){if(!p.connected||p.id===room.hostId||(targetId&&targetId!==p.id))continue;io.to(p.id).emit('testRoleSelection',{count,role:assignments[p.id]||'Random'});}}\n`;

  const testMarker='/* =========================================================\n   TEST MODE / SERVER-SIDE BOTS\n========================================================= */';
  if(!src.includes(testMarker))throw new Error('[CONSENT PATCH] missing TEST MODE marker');
  src=src.replace(testMarker,helpers+'\n'+testMarker);

  src=segment(src,'socket.on("startTestGame"','socket.on("stopTestGame"',seg=>{
    const countRx=/const\s+count\s*=\s*Number\([\s\S]*?\);/;
    const m=seg.match(countRx);if(!m)throw new Error('[CONSENT PATCH] startTestGame count anchor changed');
    const gate=`if(!room.testMode){socket.emit('actionError',{message:'Hãy bật TEST BOT trước.'});return;}\n            const __consent=__testConsentState();\n            if(__consent.active&&__consent.hasPending){socket.emit('actionError',{message:'Đang chờ người chơi phản hồi TEST BOT.'});__emitTestConsentState();return;}\n            if(__consent.active&&__consent.hasRejected){if(__consent.round<3){__retryRejectedTestConsent();socket.emit('actionError',{message:'Đã hỏi lại TEST BOT lần '+(__consent.round+1)+'/3.'});}else{__rotateHostAfterConsentFailure();}return;}\n            `;
    seg=seg.replace(countRx,gate+`const count=Number(data?.count||room.testConfig?.count||10);`);
    seg=seg.replace(/const\s+requested\s*=\s*data\?\.roleAssignments[\s\S]*?;(?=\s*const\s+cleanAssignments)/,`const requested=data?.roleAssignments&&typeof data.roleAssignments==='object'?data.roleAssignments:{...(room.testRoleAssignments||{})};`);
    seg=replaceRx(seg,/room\.testBotWolfTargetId\s*=\s*null\s*;/,x=>x+'\n            __resetTestConsent();','startTestGame bot state');
    return seg;
  },'startTestGame');

  src=segment(src,'socket.on("setTestBotEnabled"','/* =====================================================\n           ADMIN LOGIN',seg=>{
    seg=replaceRx(seg,/room\.testMode\s*=\s*enabled\s*;/,x=>x+"\n            if(enabled)__beginTestConsentCycle();else __resetTestConsent();",'setTestBotEnabled mode');
    const i=seg.lastIndexOf('sendAdminState();');if(i<0)throw new Error('[CONSENT PATCH] setTestBotEnabled tail changed');
    return seg.slice(0,i)+"__emitTestConsentState();\n            __emitTestRoleConfig();\n            "+seg.slice(i);
  },'setTestBotEnabled');

  src=replaceRx(src,/room\.players\.push\(\s*player\s*\);/,x=>x+'\n                if(room.testMode)__addTestConsentMember(player);','lobby join');

  const sockets=`\n/* TEST BOT CONSENT/ROLE SYNC SOCKETS 2026-09-15 */\nio.on('connection',socket=>{\n socket.on('requestTestSync',()=>{const p=findPlayer(socket.data.playerId);if(!p)return;__emitTestConsentState(p.id);__emitTestRoleConfig(p.id);socket.emit('testModeState',{enabled:room.testMode===true});});\n socket.on('respondTestBotConsent',data=>{if(room.started||!room.testMode)return;const p=findPlayer(socket.data.playerId);if(!p||p.id===room.hostId)return;const c=room.testConsent||__emptyTestConsent();if(!c.active||!c.requestTargets.includes(p.id)||c.responses?.[p.id]!=='pending')return;c.responses[p.id]=data?.ok===true?'ok':'no';c.lastResponseAt=Date.now();room.testConsent=c;__emitTestConsentState();addAdminLog('TEST BOT consent: '+p.name+' = '+c.responses[p.id]+' (lần '+c.round+'/3).');});\n socket.on('setTestRoleConfig',data=>{if(room.started||!room.testMode)return;const p=findPlayer(socket.data.playerId);if(!p||p.id!==room.hostId){socket.emit('actionError',{message:'Chỉ Host mới được cấu hình vai TEST BOT.'});return;}const count=Number(data?.count||room.testConfig?.count||10),requested=data?.roleAssignments&&typeof data.roleAssignments==='object'?data.roleAssignments:{...(room.testRoleAssignments||{})},checked=__validateTestRoleConfig(count,requested);if(!checked.ok){socket.emit('actionError',{message:checked.message});return;}room.targetPlayerCount=count;room.testRoleAssignments={...checked.clean};room.testConfig={count,roleAssignments:{...checked.clean}};__emitTestRoleConfig();emitRoom();sendAdminState();});\n});\n`;
  const li=src.lastIndexOf('server.listen(');if(li<0)throw new Error('[CONSENT PATCH] server.listen anchor missing');
  return src.slice(0,li)+sockets+'\n'+src.slice(li);
}

let src=fs.readFileSync(SERVER,'utf8');
if(!src.includes(MARK)){
  if(process.env.MASOI_SKIP_BASE_FINALIZER!=='1')require(path.join(__dirname,'build-unified-server.js'));
  src=fs.readFileSync(SERVER,'utf8');
  fs.writeFileSync(SERVER,patch(src),'utf8');
  console.log('[CONSENT PATCH] server-unified.js patched');
}else console.log('[CONSENT PATCH] server-unified.js already patched');
