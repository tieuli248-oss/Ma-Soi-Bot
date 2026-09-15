import { chromium } from 'playwright';

const URL = 'https://masoi15.tieuli248.workers.dev/';
const N = 7;
const names = Array.from({length:N},(_,i)=>`QA-GHA-${i+1}`);
const offsets = [0, 8000, -7000, 3500, -4500, 12000, -11000];
const sleep = ms => new Promise(r=>setTimeout(r,ms));

const result = {
  mode:'NORMAL_GAME_NO_TEST_BOT',
  names,
  roles:{},
  timer:{nightSamples:[],daySamples:[],maxNightSpread:null,maxDaySpread:null},
  witch:{found:false,selfPoisonBlocked:null,selectPoison:null,deselectPoison:null,changePoison:null,rescuePopup:null,declineCloses:null,declineStaysClosed:null},
  wolves:{count:0,target:null,votesSubmitted:0},
  errors:[]
};

function log(...a){ console.log('[QA]',...a); }
async function readText(page,sel){ return (await page.locator(sel).textContent().catch(()=>''))?.trim()||''; }
async function timer(page){ const t=Number(await readText(page,'#gameTimerNumber')); return Number.isFinite(t)?t:null; }
async function phase(page){ return await readText(page,'#gamePhaseName'); }
async function role(page){ return (await readText(page,'#gameMyRoleName')).toUpperCase(); }
async function cardByName(page,name){ return page.locator('.game-player-card').filter({has:page.locator('.game-player-name',{hasText:name})}).first(); }

async function sampleTimers(pages,bucket,label,count=12,interval=450){
  let maxSpread=0;
  for(let i=0;i<count;i++){
    const vals=await Promise.all(pages.map(async (p,idx)=>({idx,name:names[idx],phase:await phase(p),timer:await timer(p)})));
    const nums=vals.map(v=>v.timer).filter(v=>Number.isFinite(v));
    const spread=nums.length?Math.max(...nums)-Math.min(...nums):null;
    if(spread!==null) maxSpread=Math.max(maxSpread,spread);
    bucket.push({i,spread,vals});
    log(label,i,'spread=',spread,vals.map(v=>`${v.name}:${v.timer}/${v.phase}`).join(' | '));
    await sleep(interval);
  }
  return maxSpread;
}

const browser=await chromium.launch({headless:true});
const contexts=[]; const pages=[];
try{
  for(let i=0;i<N;i++){
    const mobile=i===1 || i===4;
    const ctx=await browser.newContext(mobile ? {
      viewport:{width:390,height:844},
      userAgent:'Mozilla/5.0 (Linux; Android 14; QA-Mobile) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',
      isMobile:true,
      hasTouch:true
    } : {viewport:{width:1365,height:768}});
    await ctx.addInitScript(({offset})=>{
      const realNow=Date.now.bind(Date);
      Date.now=()=>realNow()+offset;
      window.__QA_DATE_OFFSET__=offset;
    },{offset:offsets[i]});
    const p=await ctx.newPage();
    p.on('pageerror',e=>console.log(`[PAGEERROR ${names[i]}]`,e.message));
    contexts.push(ctx); pages.push(p);
  }

  await Promise.all(pages.map(p=>p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000})));
  log('all pages loaded');

  await pages[0].fill('#playerName',names[0]);
  await pages[0].click('#enterBtn');
  await pages[0].waitForFunction(()=>document.querySelector('#lobbyScreen')?.classList.contains('active'),null,{timeout:30000});
  const testBotChecked=await pages[0].locator('#hostChooseRole').isChecked().catch(()=>false);
  if(testBotChecked) throw new Error('TEST BOT unexpectedly enabled before QA start');

  await Promise.all(pages.slice(1).map(async(p,j)=>{
    const name=names[j+1];
    await p.fill('#playerName',name);
    await p.click('#enterBtn');
    await p.waitForFunction(()=>document.querySelector('#lobbyScreen')?.classList.contains('active'),null,{timeout:30000});
  }));
  log('all 7 real browser clients entered');

  // playerCount displays MEMBERS only (Host is shown separately), so 7 total => 6 members.
  await pages[0].waitForFunction(expected=>Number(document.querySelector('#playerCount')?.textContent||0)===expected,N-1,{timeout:30000});
  log('host sees 6 members + host = 7 real players');

  await Promise.all(pages.slice(1).map(async p=>{
    await p.locator('#readyBtn').waitFor({state:'visible',timeout:30000});
    await p.click('#readyBtn');
  }));
  await sleep(1200);

  if(await pages[0].locator('#hostChooseRole').isChecked().catch(()=>false)) throw new Error('TEST BOT became enabled unexpectedly');
  await pages[0].locator('#startBtn').waitFor({state:'visible',timeout:30000});
  await pages[0].click('#startBtn');
  log('host clicked normal Start');

  await Promise.all(pages.map(p=>p.waitForFunction(()=>document.querySelector('#gameScreen')?.classList.contains('active'),null,{timeout:90000})));
  await sleep(800);

  for(let i=0;i<N;i++) result.roles[names[i]]=await role(pages[i]);
  log('roles',JSON.stringify(result.roles));

  const witchIndex=names.findIndex(n=>result.roles[n].includes('PHÙ THỦY'));
  const wolfIndexes=names.map((_,i)=>i).filter(i=>result.roles[names[i]].includes('SÓI'));
  result.witch.found=witchIndex>=0;
  result.wolves.count=wolfIndexes.length;
  if(witchIndex<0) result.errors.push('No Witch found in 7-player normal composition');

  await pages[0].waitForFunction(()=>{
    const ph=(document.querySelector('#gamePhaseName')?.textContent||'').trim();
    const t=Number(document.querySelector('#gameTimerNumber')?.textContent||0);
    return ph.includes('BAN ĐÊM') && t>15;
  },null,{timeout:90000});

  result.timer.maxNightSpread=await sampleTimers(pages,result.timer.nightSamples,'NIGHT',12,400);

  if(witchIndex>=0){
    const wp=pages[witchIndex];
    const self=wp.locator('.game-player-card.me');
    const beforeSelf=await self.evaluate(el=>el.classList.contains('selected-target'));
    await self.click(); await sleep(600);
    const afterSelf=await self.evaluate(el=>el.classList.contains('selected-target'));
    result.witch.selfPoisonBlocked=beforeSelf===false && afterSelf===false;

    const otherNames=names.filter((_,i)=>i!==witchIndex);
    const t1=otherNames[0], t2=otherNames[1];
    const c1=await cardByName(wp,t1), c2=await cardByName(wp,t2);
    await c1.click(); await sleep(700);
    result.witch.selectPoison=await c1.locator('img[alt="Bình độc"]').count()>0 || await c1.evaluate(el=>el.classList.contains('selected-target'));
    await c1.click(); await sleep(700);
    result.witch.deselectPoison=(await c1.locator('img[alt="Bình độc"]').count())===0;
    await c1.click(); await sleep(500); await c2.click(); await sleep(800);
    const c1Has=(await c1.locator('img[alt="Bình độc"]').count())>0;
    const c2Has=(await c2.locator('img[alt="Bình độc"]').count())>0;
    result.witch.changePoison=!c1Has && c2Has;
    log('witch poison cases',JSON.stringify(result.witch));
  }

  if(wolfIndexes.length){
    const avoid=new Set(wolfIndexes);
    if(witchIndex>=0) avoid.add(witchIndex);
    let targetIndex=names.findIndex((_,i)=>!avoid.has(i));
    if(targetIndex<0) targetIndex=names.findIndex((_,i)=>!wolfIndexes.includes(i));
    const targetName=names[targetIndex];
    result.wolves.target=targetName;
    for(const wi of wolfIndexes){
      const card=await cardByName(pages[wi],targetName);
      await card.click();
      result.wolves.votesSubmitted++;
      await sleep(350);
    }
    log('wolves voted target',targetName);
  }

  await pages[0].waitForFunction(()=>Number(document.querySelector('#gameTimerNumber')?.textContent||99)<=12,null,{timeout:70000});
  const boundarySpread=await sampleTimers(pages,result.timer.nightSamples,'NIGHT-BOUNDARY',8,350);
  result.timer.maxNightSpread=Math.max(result.timer.maxNightSpread||0,boundarySpread||0);

  if(witchIndex>=0){
    const wp=pages[witchIndex];
    try{
      await wp.waitForFunction(()=>document.querySelector('#witchRescueLayer')?.classList.contains('show'),null,{timeout:12000});
      result.witch.rescuePopup=true;
      await wp.click('#witchRescueNo');
      await sleep(700);
      result.witch.declineCloses=!(await wp.locator('#witchRescueLayer').evaluate(el=>el.classList.contains('show')));
      await sleep(2500);
      result.witch.declineStaysClosed=!(await wp.locator('#witchRescueLayer').evaluate(el=>el.classList.contains('show')));
    }catch(e){
      result.witch.rescuePopup=false;
      result.errors.push('Witch rescue popup did not appear: '+e.message);
    }
  }

  try{
    await pages[0].waitForFunction(()=>((document.querySelector('#gamePhaseName')?.textContent||'').includes('THẢO LUẬN')),null,{timeout:50000});
    result.timer.maxDaySpread=await sampleTimers(pages,result.timer.daySamples,'DAY',8,400);
  }catch(e){ result.errors.push('Day discussion not reached: '+e.message); }

  const critical={
    timerNightSync:(result.timer.maxNightSpread??99)<=1,
    timerDaySync:result.timer.maxDaySpread===null?null:result.timer.maxDaySpread<=1,
    witchFound:result.witch.found,
    witchPoisonSelect:result.witch.selectPoison,
    witchPoisonDeselect:result.witch.deselectPoison,
    witchPoisonChange:result.witch.changePoison,
    witchSelfBlock:result.witch.selfPoisonBlocked,
    witchRescuePopup:result.witch.rescuePopup,
    witchDeclineCloses:result.witch.declineCloses,
    witchDeclineStaysClosed:result.witch.declineStaysClosed
  };
  result.critical=critical;
  const hardFail=Object.entries(critical).filter(([k,v])=>v===false);
  if(hardFail.length) result.errors.push('Critical failures: '+hardFail.map(x=>x[0]).join(', '));

  console.log('QA_RESULT_JSON='+JSON.stringify(result));
  if(hardFail.length) process.exitCode=2;
}catch(e){
  result.errors.push(e?.stack||String(e));
  console.error('[QA_FATAL]',e);
  console.log('QA_RESULT_JSON='+JSON.stringify(result));
  process.exitCode=1;
}finally{
  await browser.close();
}
