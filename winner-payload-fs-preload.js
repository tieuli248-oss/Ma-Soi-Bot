// Adds an authoritative winners[] payload to gameEnded without changing win rules.
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

      const endGameNeedle = `function endGame(\n    winner,\n    message\n) {`;
      const endGameReplacement = `function endGame(\n    winner,\n    message\n) {\n\n    // Winner identities are decided by the server, never guessed by the frontend.\n    const winners = (() => {\n        if (winner === "Couple") {\n            const pair = room.players.filter(p => p.alive && p.loverId);\n            return pair.filter(p => pair.some(other => other.id === p.loverId));\n        }\n        if (winner === "Sói") return room.players.filter(p => p.role === "Sói");\n        if (winner === "Dân") return room.players.filter(p => p.role !== "Sói");\n        return [];\n    })().map(p => ({ id: p.id, name: p.name, role: p.role }));`;

      if (src.includes(endGameNeedle)) src = src.replace(endGameNeedle, endGameReplacement);
      else return out;

      const payloadNeedle = `            winner,\n\n            message,`;
      const payloadReplacement = `            winner,\n\n            message,\n\n            winners,`;
      if (!src.includes(payloadNeedle)) return out;
      src = src.replace(payloadNeedle, payloadReplacement);

      patched = true;
      console.log('[WINNER PAYLOAD] authoritative winners[] enabled');
      return isBuffer ? Buffer.from(src, 'utf8') : src;
    }
  } catch (err) {
    console.error('[WINNER PAYLOAD] preload error:', err?.message || err);
  }
  return out;
};
