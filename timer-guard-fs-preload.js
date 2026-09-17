// Server-only timer guard. Does not touch frontend/HTML.
// Keeps authoritative phase durations aligned with the game rules.
const fs = require('fs');
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

fs.readFileSync = function(file, ...args) {
  const out = originalReadFileSync(file, ...args);
  try {
    const name = String(file || '');
    if (!patched && /server-unified\.js$/.test(name)) {
      const isBuffer = Buffer.isBuffer(out);
      let src = isBuffer ? out.toString('utf8') : String(out);
      const needle = `function startTimer(\n    seconds,\n    callback\n) {\n\n    stopTimer();`;
      if (src.includes(needle)) {
        const replacement = `function startTimer(\n    seconds,\n    callback\n) {\n\n    // Server is authoritative. Discussion duration follows ALIVE player count:\n    // <=6: 90s, <=8: 120s, <=10: 150s, >10: 180s.\n    if (room.phase === "night") seconds = 60;\n    else if (room.phase === "daySpeech") seconds = daySpeechSecondsForAlive();\n    else if (room.phase === "dayVote") seconds = 30;\n\n    stopTimer();`;
        src = src.replace(needle, replacement);
        patched = true;
        console.log('[TIMER GUARD] night=60; discussion=90/120/150/180 by alive players; vote=30');
        return isBuffer ? Buffer.from(src, 'utf8') : src;
      }
    }
  } catch (err) {
    console.error('[TIMER GUARD] preload error:', err?.message || err);
  }
  return out;
};
