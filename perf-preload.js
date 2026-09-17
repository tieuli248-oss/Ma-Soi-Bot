// Lightweight performance patch for Ma Soi realtime traffic.
// Applied in-memory before server-unified.js is compiled.

function patchPerformance(source) {
    if (typeof source !== "string") return source;
    if (source.includes("io.volatile.emit(\n                    \"phaseTimer\"")) return source;

    const timerTick = `                io.emit(\n                    \"phaseTimer\",`;
    const volatileTimerTick = `                io.volatile.emit(\n                    \"phaseTimer\",`;

    if (source.includes(timerTick)) {
        source = source.replace(timerTick, volatileTimerTick);
    }

    return source;
}

module.exports = { patchPerformance };
