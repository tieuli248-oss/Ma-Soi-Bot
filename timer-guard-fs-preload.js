// Server-only timer guard. Does not touch frontend/HTML.
// Forces canonical phase durations at the authoritative startTimer boundary.
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
        const replacement = `function startTimer(\n    seconds,\n    callback\n) {\n\n    // Authoritative server timer guard: never allow stale/incorrect durations.\n    const canonicalSeconds = { night: 60, daySpeech: 180, dayVote: 30 };\n    if (Object.prototype.hasOwnProperty.call(canonicalSeconds, room.phase)) {\n        seconds = canonicalSeconds[room.phase];\n    }\n\n    stopTimer();`;
        src = src.replace(needle, replacement);
        patched = true;
        console.log('[TIMER GUARD] server authoritative timers: night=60, discussion=180, vote=30');
        return isBuffer ? Buffer.from(src, 'utf8') : src;
      }
    }
  } catch (err) {
    console.error('[TIMER GUARD] preload error:', err?.message || err);
  }
  return out;
};
