// Server runtime fixes loaded through an already-active preload.
// Keeps frontend untouched.
const fs = require('fs');
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function patchRuntime(src) {
  // 1) Server-authoritative phase durations.
  // Hunter keeps its own 15s timer; only the three main phases are normalized.
  const timerNeedle = `function startTimer(\n    seconds,\n    callback\n) {\n\n    stopTimer();`;
  if (src.includes(timerNeedle) && !src.includes('SERVER_AUTHORITATIVE_MAIN_TIMERS')) {
    src = src.replace(timerNeedle, `function startTimer(\n    seconds,\n    callback\n) {\n\n    /* SERVER_AUTHORITATIVE_MAIN_TIMERS */\n    if (room.phase === "night") seconds = 60;\n    else if (room.phase === "daySpeech") seconds = daySpeechSecondsForAlive();\n    else if (room.phase === "dayVote") seconds = 30;\n\n    stopTimer();`);
  }

  // 2) Normal auto-fill bots must use the same server-side action ticker as Test bots.
  // Autofill already defines hasLiveAutoFillBots(); these replacements are repeated
  // here deliberately so source formatting/order cannot leave normal bots inert.
  src = src.replace(
    'if (!room.testMode || !room.started || room.phase !== "night" || !room.night) return;',
    'if (!(room.testMode || (typeof hasLiveAutoFillBots === "function" && hasLiveAutoFillBots())) || !room.started || room.phase !== "night" || !room.night) return;'
  );
  src = src.replace(
    'if (!room.testMode || !room.started || room.phase !== "dayVote") return;',
    'if (!(room.testMode || (typeof hasLiveAutoFillBots === "function" && hasLiveAutoFillBots())) || !room.started || room.phase !== "dayVote") return;'
  );

  // 3) Bots may start a short, contextual conversation when humans have not typed yet.
  // Once a human message exists, the existing router still anchors on the latest human.
  const anchorNeedle = `function aiBotLatestHumanAnchor(bot,channel){\n  const hist=aiBotChannelHistory(bot,channel,30);\n  for(let i=hist.length-1;i>=0;i--){\n    const x=hist[i];\n    if(!x.playerId || !x.text || x.aiBot===true)continue;\n    return x;\n  }\n  return null;\n}`;
  if (src.includes(anchorNeedle)) {
    src = src.replace(anchorNeedle, `function aiBotLatestHumanAnchor(bot,channel){\n  const hist=aiBotChannelHistory(bot,channel,30);\n  for(let i=hist.length-1;i>=0;i--){\n    const x=hist[i];\n    if(!x.playerId || !x.text || x.aiBot===true)continue;\n    return x;\n  }\n  // No human message yet: one phase-scoped seed lets bots open the discussion.\n  if(room.started && (room.phase === "daySpeech" || channel === "wolf" || channel === "couple")) {\n    return {\n      historyId: "auto-seed:" + room.phase + ":" + room.nightNumber + ":" + channel,\n      playerId: "system-seed",\n      playerName: "Bàn chơi",\n      text: room.phase === "daySpeech"\n        ? "Bắt đầu thảo luận dựa trên những gì vừa xảy ra, nói ngắn gọn và có lý do."\n        : "Trao đổi ngắn gọn với đồng đội về lượt hiện tại.",\n      aiBot: false,\n      time: Date.now()\n    };\n  }\n  return null;\n}`);
  }

  // 4) Add useful runtime proof in Render logs when live bots actually act.
  if (!src.includes('LIVE_BOT_RUNTIME_TRACE')) {
    src = src.replace(
      `const testBotTicker = setInterval(() => {\n    try { runTestBotNight(); runTestBotDayVote(); }`,
      `const LIVE_BOT_RUNTIME_TRACE = true;\nconst testBotTicker = setInterval(() => {\n    try { runTestBotNight(); runTestBotDayVote(); }`
    );
  }

  // 5) Witch poison only: accept selection throughout the authoritative first 50s.
  // Do not let a stale witchActionOpen flag block poison before the save window.
  const witchPoisonGate = `                if (\n                    room.phase !== "night" ||\n                    !room.night?.witchPoisonWindowOpen ||\n                    room.night?.witchActionOpen\n                ) {\n                    return;\n                }`;
  if (src.includes(witchPoisonGate) && !src.includes('WITCH_POISON_FIRST_50S_GATE')) {
    src = src.replace(witchPoisonGate, `                /* WITCH_POISON_FIRST_50S_GATE */\n                if (\n                    room.phase !== "night" ||\n                    !room.night ||\n                    room.night.mainActionsOpen !== true ||\n                    !room.night.mainActionEndsAt ||\n                    Date.now() >= room.night.mainActionEndsAt\n                ) {\n                    return;\n                }`);
  }

  return src;
}

function patchWinnerPayload(src) {
  if (src.includes('const winners = (() => {')) return src;

  const endGameNeedle = `function endGame(\n    winner,\n    message\n) {`;
  const endGameReplacement = `function endGame(\n    winner,\n    message\n) {\n\n    // Winner identities are decided by the server, never guessed by the frontend.\n    const winners = (() => {\n        if (winner === "Couple") {\n            const pair = room.players.filter(p => p.alive && p.loverId);\n            return pair.filter(p => pair.some(other => other.id === p.loverId));\n        }\n        if (winner === "Sói") return room.players.filter(p => p.role === "Sói");\n        if (winner === "Dân") return room.players.filter(p => p.role !== "Sói");\n        return [];\n    })().map(p => ({ id: p.id, name: p.name, role: p.role }));`;

  if (!src.includes(endGameNeedle)) return src;
  src = src.replace(endGameNeedle, endGameReplacement);

  const payloadNeedle = `            winner,\n\n            message,`;
  const payloadReplacement = `            winner,\n\n            message,\n\n            winners,`;
  if (src.includes(payloadNeedle)) src = src.replace(payloadNeedle, payloadReplacement);
  return src;
}

fs.readFileSync = function(file, ...args) {
  const out = originalReadFileSync(file, ...args);
  try {
    const name = String(file || '');
    if (!patched && /server-unified\\.js$/.test(name)) {
      const isBuffer = Buffer.isBuffer(out);
      let src = isBuffer ? out.toString('utf8') : String(out);
      src = patchRuntime(src);
      src = patchWinnerPayload(src);
      patched = true;
      console.log('[LIVE FIX] main timers + live bot actions/chat + winners enabled');
      return isBuffer ? Buffer.from(src, 'utf8') : src;
    }
  } catch (err) {
    console.error('[LIVE FIX] preload error:', err?.message || err);
  }
  return out;
};
