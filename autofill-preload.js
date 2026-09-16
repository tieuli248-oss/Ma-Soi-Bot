// Auto-fill Bot patch for normal (non-Test Bot) games.
// Load BEFORE event-realtime-preload.js via NODE_OPTIONS.
// It patches fs.readFileSync so the existing event preload still applies its own
// source patch after this one.

if (!global.__MASOI_AUTOFILL_PRELOAD__) {
    global.__MASOI_AUTOFILL_PRELOAD__ = true;

    const fs = require("fs");
    const path = require("path");
    const originalReadFileSync = fs.readFileSync.bind(fs);

    function patchServerSource(source) {
        if (typeof source !== "string") return source;

        // 1) Keep the Host-selected target size in lobby instead of collapsing
        // back to the number of real humans whenever someone joins/leaves.
        source = source.replace(
            /room\.targetPlayerCount\s*=\s*room\.players\.length;/g,
            `room.targetPlayerCount =
            Math.min(
                MAX_PLAYERS,
                Math.max(
                    MIN_PLAYERS,
                    Number(room.targetPlayerCount || MIN_PLAYERS),
                    room.players.filter(p => !p.isBot).length
                )
            );`
        );

        // 2) Helpers for normal-game auto-fill bots.
        if (!source.includes("function hasLiveAutoFillBots()")) {
            const marker = "function startGame() {";
            const helper = `
function hasLiveAutoFillBots() {
    return room.players.some(
        p => p.isBot === true && p.autoFillBot === true && p.alive !== false
    );
}

function addLiveAutoFillBots(targetCount) {
    if (room.testMode) return 0;

    // Remove stale auto-fill bots left from a previous lobby state.
    room.players = room.players.filter(p => p.autoFillBot !== true);

    const humanCount = room.players.filter(p => !p.isBot).length;
    const target = Math.min(
        MAX_PLAYERS,
        Math.max(MIN_PLAYERS, humanCount, Number(targetCount || MIN_PLAYERS))
    );

    let added = 0;
    const botsNeeded = Math.max(0, target - room.players.length);

    for (let i = 1; i <= botsNeeded; i++) {
        const bot = testBotPlayer(i);
        bot.autoFillBot = true;
        bot.testBot = false;
        bot.ready = true;
        bot.connected = true;
        bot.name = "🤖 Bot " + String(i).padStart(2, "0");
        room.players.push(bot);
        added++;
    }

    room.targetPlayerCount = target;
    return added;
}

`;
            if (source.includes(marker)) {
                source = source.replace(marker, helper + marker);
            }
        }

        // 3) Before normal startGame validates count, auto-fill up to Host target.
        const countBlock = `    const count =
        room.players.length;`;

        if (source.includes(countBlock) && !source.includes("addLiveAutoFillBots(room.targetPlayerCount);")) {
            source = source.replace(
                countBlock,
                `    if (!room.testMode) {
        addLiveAutoFillBots(room.targetPlayerCount);
    }

${countBlock}`
            );
        }

        // 4) Host can select normal-game target size without enabling Test Bot.
        if (!source.includes('"setTargetPlayerCount"')) {
            const startMarker = `        /* =====================================================
           START GAME
        ===================================================== */`;

            const handler = `        /* =====================================================
           NORMAL GAME TARGET PLAYER COUNT
           Missing slots will be filled by live Bots on start.
        ===================================================== */

        socket.on(
            "setTargetPlayerCount",
            data => {
                if (room.started || room.testMode) return;

                const host = findPlayer(socket.data.playerId);
                if (!host || host.id !== room.hostId) return;

                const humanCount =
                    room.players.filter(p => !p.isBot).length;

                const requested =
                    Number(data?.count || MIN_PLAYERS);

                room.targetPlayerCount =
                    Math.min(
                        MAX_PLAYERS,
                        Math.max(
                            MIN_PLAYERS,
                            humanCount,
                            Number.isFinite(requested)
                                ? Math.floor(requested)
                                : MIN_PLAYERS
                        )
                    );

                addAdminLog(
                    \`Host chọn tổng số người game thật: \${room.targetPlayerCount}.\`
                );

                emitRoom();
                sendAdminState();
            }
        );


`;

            if (source.includes(startMarker)) {
                source = source.replace(startMarker, handler + startMarker);
            }
        }

        // 5) Existing Test Bot ticker also drives auto-fill bots in real games.
        source = source.replace(
            'if (!room.testMode || !room.started || room.phase !== "night" || !room.night) return;',
            'if (!(room.testMode || hasLiveAutoFillBots()) || !room.started || room.phase !== "night" || !room.night) return;'
        );

        source = source.replace(
            'if (!room.testMode || !room.started || room.phase !== "dayVote") return;',
            'if (!(room.testMode || hasLiveAutoFillBots()) || !room.started || room.phase !== "dayVote") return;'
        );

        // Do not reveal live-bot private night actions to Host.
        source = source.replace(
            `function testEmitHostEvent(text){
    if (!text) return;`,
            `function testEmitHostEvent(text){
    if (!text) return;
    if (!room.testMode) return;`
        );

        // In normal games, villagers must not magically know who the wolves are.
        source = source.replace(
            `        } else {
            const wolves = candidates.filter(p => p.role === "Sói");
            if (wolves.length && Math.random() < 0.62) preferred = wolves[Math.floor(Math.random() * wolves.length)];
        }`,
            `        } else if (room.testMode) {
            const wolves = candidates.filter(p => p.role === "Sói");
            if (wolves.length && Math.random() < 0.62) preferred = wolves[Math.floor(Math.random() * wolves.length)];
        }`
        );

        // Avoid Test-mode-only preference for attacking/protecting Host in live games.
        source = source.replace(
            `const preferred = host?.alive && host.role !== "Sói" ? host : null;`,
            `const preferred = room.testMode && host?.alive && host.role !== "Sói" ? host : null;`
        );

        source = source.replace(
            `const target = chooseTestBotTarget(candidates, host?.alive ? host : null, 0.25);`,
            `const target = chooseTestBotTarget(candidates, room.testMode && host?.alive ? host : null, 0.25);`
        );

        return source;
    }

    fs.readFileSync = function patchedReadFileSync(filename, ...args) {
        const result = originalReadFileSync(filename, ...args);

        try {
            if (path.basename(String(filename)) !== "server-unified.js") {
                return result;
            }

            if (typeof result === "string") {
                const patched = patchServerSource(result);
                console.log("[AUTOFILL PATCH] normal game missing slots = live bots");
                return patched;
            }

            if (Buffer.isBuffer(result)) {
                const patched = patchServerSource(result.toString("utf8"));
                console.log("[AUTOFILL PATCH] normal game missing slots = live bots");
                return Buffer.from(patched, "utf8");
            }
        } catch (err) {
            console.error("[AUTOFILL PATCH] failed", err);
        }

        return result;
    };
}
