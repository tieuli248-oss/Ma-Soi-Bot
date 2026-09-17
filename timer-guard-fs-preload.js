// Server-only runtime compatibility patch. Does not touch frontend/HTML.
// 1) authoritative timers: night 60, discussion by alive count, vote 30
// 2) suppress duplicate UI state broadcasts
// 3) include exact winner players in gameEnded
const fs = require('fs');
const originalReadFileSync = fs.readFileSync.bind(fs);
const { patchUiStateDedupe } = require('./ui-state-dedupe-preload.js');
let patched = false;

function patchWinnerPayload(src) {
  if (src.includes('__buildWinnerPlayers')) return src;

  const endGameMarker = `function endGame(\n    winner,\n    message\n) {`;
  if (!src.includes(endGameMarker)) return src;

  const winnerHelper = `function __buildWinnerPlayers(winner) {\n    let winners = [];\n\n    if (winner === "Sói") {\n        winners = room.players.filter(p => p.role === "Sói");\n    } else if (winner === "Dân") {\n        winners = room.players.filter(p => p.role !== "Sói");\n    } else if (winner === "Couple") {\n        const alive = alivePlayers();\n        const first = alive.find(p => p.loverId && alive.some(x => x.id === p.loverId));\n        if (first) {\n            const second = room.players.find(p => p.id === first.loverId);\n            winners = [first, second].filter(Boolean);\n        }\n    }\n\n    return winners.map(p => ({\n        id: p.id,\n        name: p.name,\n        role: p.role\n    }));\n}\n\n`;

  src = src.replace(endGameMarker, winnerHelper + endGameMarker);

  const payloadMarker = `            winner,\n\n            message,`;
  if (src.includes(payloadMarker)) {
    src = src.replace(
      payloadMarker,
      `            winner,\n\n            message,\n\n            winners: __buildWinnerPlayers(winner),`
    );
  }

  return src;
}

fs.readFileSync = function(file, ...args) {
  const out = originalReadFileSync(file, ...args);
  try {
    const name = String(file || '');
    if (!patched && /server-unified\\.js$/.test(name)) {
      const isBuffer = Buffer.isBuffer(out);
      let src = isBuffer ? out.toString('utf8') : String(out);

      const timerNeedle = `function startTimer(\n    seconds,\n    callback\n) {\n\n    stopTimer();`;
      if (src.includes(timerNeedle)) {
        const timerReplacement = `function startTimer(\n    seconds,\n    callback\n) {\n\n    // Server authoritative timers.\n    // Discussion follows ALIVE player count: <=6 90s, <=8 120s, <=10 150s, >10 180s.\n    if (room.phase === "night") seconds = 60;\n    else if (room.phase === "daySpeech") seconds = daySpeechSecondsForAlive();\n    else if (room.phase === "dayVote") seconds = 30;\n\n    stopTimer();`;
        src = src.replace(timerNeedle, timerReplacement);
      }

      src = patchWinnerPayload(src);
      src = patchUiStateDedupe(src);

      patched = true;
      console.log('[SERVER RULE PATCH] timer dynamic + UI state dedupe + exact winners active');
      return isBuffer ? Buffer.from(src, 'utf8') : src;
    }
  } catch (err) {
    console.error('[SERVER RULE PATCH] preload error:', err?.message || err);
  }
  return out;
};
