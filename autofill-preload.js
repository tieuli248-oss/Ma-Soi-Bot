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

        // 6) Context-aware strategy helpers. These use only public chat/votes plus
        // role-private facts that the bot is legitimately allowed to know.
        if (!source.includes("function botStrategySuspicionScore(")) {
            const strategyMarker = "function runTestBotNight() {";
            const strategyHelpers = `
function botStrategyNorm(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "");
}

function botStrategyRecentPublicChat(limit = 48) {
    return (room.chatHistory || [])
        .filter(x => x && (x.chatType === "public" || x.chatType === "lobby"))
        .slice(-limit);
}

function botStrategySuspicionScore(bot, target) {
    if (!target || !target.alive || target.id === bot?.id) return -9999;

    let score = 0;
    const targetName = botStrategyNorm(target.name);
    const chat = botStrategyRecentPublicChat(56);
    const suspiciousWords = [
        "nghi", "soi", "soi ra", "soi thay", "soi thấy", "soi sói", "soi soi",
        "soi", "soi ra soi", "soi ra sói", "soi ra soi", "soi ra la soi",
        "soi ra la sói", "soi ra la soi", "soi ra la", "soi ra",
        "soi", "soi soi", "soi thay soi", "soi thấy sói",
        "soi", "sói", "wolf", "vote", "treo", "khả nghi", "kha nghi",
        "lạ", "la", "né", "ne", "đổi vote", "doi vote", "mâu thuẫn", "mau thuan",
        "nói dối", "noi doi", "giả", "gia", "không tin", "khong tin"
    ];

    for (let i = 0; i < chat.length; i++) {
        const item = chat[i];
        if (!item || item.playerId === bot?.id) continue;
        const text = botStrategyNorm(item.text);
        if (!text || !targetName || !text.includes(targetName)) continue;

        const recency = 0.45 + 0.55 * ((i + 1) / Math.max(1, chat.length));
        let local = 0.7;
        for (const w of suspiciousWords) {
            if (text.includes(botStrategyNorm(w))) local += 0.8;
        }
        score += local * recency;
    }

    // Being the current focus of multiple living voters matters a lot.
    for (const [voterId, targetId] of (room.dayVotes || new Map())) {
        const voter = findPlayer(voterId);
        if (targetId === target.id && voter?.alive && voterId !== bot?.id) score += 2.4;
    }

    // A player who repeatedly talks is strategically important, but that alone
    // is not proof they are evil, so it only adds a small amount here.
    const ownMessages = chat.filter(x => x.playerId === target.id).length;
    score += Math.min(1.5, ownMessages * 0.12);

    // Tiny deterministic tie breaker, not random noise.
    score += (aiBotHash ? (aiBotHash(String(target.deviceId || target.id)) % 31) / 1000 : 0);
    return score;
}

function botStrategyInfluenceScore(target) {
    if (!target?.alive) return -9999;
    const chat = botStrategyRecentPublicChat(56);
    let score = 0; // Human and bot targets start equally; behavior decides influence.
    score += Math.min(3.2, chat.filter(x => x.playerId === target.id).length * 0.22);

    const name = botStrategyNorm(target.name);
    score += Math.min(
        2.2,
        chat.filter(x => x.playerId !== target.id && botStrategyNorm(x.text).includes(name)).length * 0.18
    );
    return score;
}

function botStrategyPickHighest(candidates, scorer) {
    const valid = (candidates || []).filter(Boolean);
    if (!valid.length) return null;
    let best = valid[0];
    let bestScore = Number(scorer(best)) || 0;
    for (const p of valid.slice(1)) {
        const s = Number(scorer(p)) || 0;
        if (s > bestScore) {
            best = p;
            bestScore = s;
        }
    }
    return best;
}

function botStrategyDayTarget(bot, candidates) {
    const valid = (candidates || []).filter(p => p?.alive && p.id !== bot.id);
    if (!valid.length) return null;

    if (bot.role === "Sói") {
        // Wolves know their pack and never vote a wolf. Prefer influential
        // non-wolves who are already plausible public targets.
        const nonWolves = valid.filter(p => p.role !== "Sói");
        return botStrategyPickHighest(nonWolves, p =>
            botStrategyInfluenceScore(p) * 1.35 + botStrategySuspicionScore(bot, p) * 0.55
        );
    }

    // Village-side bot may NOT inspect hidden roles here. It reasons from public
    // discussion, votes and behavior only.
    return botStrategyPickHighest(valid, p => botStrategySuspicionScore(bot, p));
}

function botStrategyWolfTarget(bot, candidates) {
    const valid = (candidates || []).filter(p => p?.alive && p.role !== "Sói");
    if (!valid.length) return null;

    // In a live mixed wolf pack, human wolf leads the night kill.
    // Bot wolves mirror the human wolf's current valid vote; otherwise use strategy.
    if (!room.testMode && room.night?.wolfVotes) {
        const humanWolves = room.players.filter(p => !p.isBot && p.alive && p.role === "Sói");
        for (const humanWolf of humanWolves) {
            const humanTargetId = room.night.wolfVotes.get(humanWolf.id);
            const humanTarget = valid.find(p => p.id === humanTargetId);
            if (humanTarget) return humanTarget;
        }
    }

    // Kill people who are driving the village discussion or publicly pressuring
    // wolves. Lovers get a large strategic penalty/bonus depending on relation.
    return botStrategyPickHighest(valid, p => {
        let s = botStrategyInfluenceScore(p) * 1.7;
        s += botStrategySuspicionScore(bot, p) * 0.8;
        if (bot.loverId === p.id) s -= 50;
        return s;
    });
}

function botStrategyGuardTarget(bot, candidates) {
    const valid = (candidates || []).filter(p => p?.alive);
    if (!valid.length) return null;
    return botStrategyPickHighest(valid, p => {
        let s = botStrategyInfluenceScore(p) * 1.7;
        // Protect people likely to be attacked because they are vocal / central.
        s += botStrategySuspicionScore(bot, p) * 0.25;
        if (p.id === bot.id) s += 0.15;
        return s;
    });
}

function botStrategySeerTarget(bot, candidates) {
    const inspected = new Set(
        (room.night?.seerInspections || [])
            .filter(x => x.seerId === bot.id)
            .map(x => x.targetId)
    );
    const valid = (candidates || []).filter(p => p?.alive && !inspected.has(p.id));
    if (!valid.length) return null;
    return botStrategyPickHighest(valid, p =>
        botStrategySuspicionScore(bot, p) * 1.6 + botStrategyInfluenceScore(p) * 0.7
    );
}

function botStrategyPoisonTarget(bot, candidates) {
    const valid = (candidates || []).filter(p => p?.alive && p.id !== bot.id);
    if (!valid.length) return null;
    const target = botStrategyPickHighest(valid, p => botStrategySuspicionScore(bot, p));
    if (!target) return null;

    // Do not waste poison on a weak hunch. Lover is never deliberately poisoned.
    if (bot.loverId === target.id) return null;
    return botStrategySuspicionScore(bot, target) >= 2.25 ? target : null;
}

function botStrategyShouldSave(bot, target) {
    if (!target?.alive) return false;
    if (bot.loverId === target.id) return true;
    // Save a strategically useful player; avoid spending the potion on near-zero
    // information unless it is still early and the target is a real human.
    const value = botStrategyInfluenceScore(target) - botStrategySuspicionScore(bot, target) * 0.35;
    return value >= 0.85 || (!target.isBot && room.nightNumber <= 2);
}

function botStrategyHunterTarget(bot, candidates) {
    const valid = (candidates || []).filter(p => p?.alive && p.id !== bot.id && p.id !== bot.loverId);
    if (!valid.length) return null;
    return botStrategyDayTarget(bot, valid);
}

`;
            if (source.includes(strategyMarker)) {
                source = source.replace(strategyMarker, strategyHelpers + strategyMarker);
            }
        }

        // 7) Replace random tactical target choices with context-aware choices in
        // live games, while preserving original Test Mode behavior.
        source = source.replace(
            `const target = chooseTestBotTarget(wolfCandidates, preferred, 0.35);`,
            `const target = room.testMode
                    ? chooseTestBotTarget(wolfCandidates, preferred, 0.35)
                    : botStrategyWolfTarget(botWolves[0], wolfCandidates);`
        );

        source = source.replace(
            `const target = chooseTestBotTarget(candidates, room.testMode && host?.alive ? host : null, 0.25);`,
            `const target = room.testMode
                ? chooseTestBotTarget(candidates, host?.alive ? host : null, 0.25)
                : botStrategyGuardTarget(guard, candidates);`
        );

        source = source.replace(
            `const target = chooseTestBotTarget(candidates, null);`,
            `const target = room.testMode
                ? chooseTestBotTarget(candidates, null)
                : botStrategySeerTarget(seer, candidates);`
        );

        // Witch poison: in live games, only poison when there is meaningful
        // suspicion instead of a 35% random coin flip.
        source = source.replace(
            `            if (Math.random() < 0.35) {
                const candidates = alivePlayers().filter(p => p.id !== witch.id);
                const target = chooseTestBotTarget(candidates, null);
                if (target) {
                    room.night.witchPoisonDraftTargetId = target.id;
                    testEmitHostEvent("🤖 " + witch.name + " (Phù thủy) chọn ĐỘC " + target.name + ".");
                }
            } else {
                room.night.witchPoisonDraftTargetId = null;
                testEmitHostEvent("🤖 " + witch.name + " (Phù thủy) bỏ qua bình ĐỘC đêm " + room.nightNumber + ".");
            }`,
            `            if (room.testMode) {
                if (Math.random() < 0.35) {
                    const candidates = alivePlayers().filter(p => p.id !== witch.id);
                    const target = chooseTestBotTarget(candidates, null);
                    if (target) {
                        room.night.witchPoisonDraftTargetId = target.id;
                        testEmitHostEvent("🤖 " + witch.name + " (Phù thủy) chọn ĐỘC " + target.name + ".");
                    }
                } else {
                    room.night.witchPoisonDraftTargetId = null;
                    testEmitHostEvent("🤖 " + witch.name + " (Phù thủy) bỏ qua bình ĐỘC đêm " + room.nightNumber + ".");
                }
            } else {
                const candidates = alivePlayers().filter(p => p.id !== witch.id);
                const target = botStrategyPoisonTarget(witch, candidates);
                room.night.witchPoisonDraftTargetId = target?.id || null;
            }`
        );

        // Witch save: live bot evaluates the victim instead of using 50% random.
        source = source.replace(
            `            if (bitten?.alive && Math.random() < 0.50) {
                witch.used.witchSave = true;
                room.night.witchSave = true;
                testEmitHostEvent("🤖 " + witch.name + " (Phù thủy) CỨU " + bitten.name + ".");
            } else {
                testEmitHostEvent("🤖 " + witch.name + " (Phù thủy) không cứu đêm " + room.nightNumber + ".");
            }`,
            `            const shouldSave = room.testMode
                ? (bitten?.alive && Math.random() < 0.50)
                : (bitten?.alive && botStrategyShouldSave(witch, bitten));
            if (shouldSave) {
                witch.used.witchSave = true;
                room.night.witchSave = true;
                testEmitHostEvent("🤖 " + witch.name + " (Phù thủy) CỨU " + bitten.name + ".");
            } else {
                testEmitHostEvent("🤖 " + witch.name + " (Phù thủy) không cứu đêm " + room.nightNumber + ".");
            }`
        );

        // Day vote: live bots reason from public discussion/votes. Test mode keeps
        // its original role-aware behavior for debugging.
        source = source.replace(
            `        const target = chooseTestBotTarget(candidates, preferred);
        if (!target) continue;`,
            `        const target = room.testMode
            ? chooseTestBotTarget(candidates, preferred)
            : botStrategyDayTarget(bot, candidates);
        if (!target) continue;`
        );

        // Hunter bot: when its revenge window opens, choose a reasoned target
        // shortly after the phase starts rather than waiting for server random.
        if (!source.includes("BOT SMART HUNTER")) {
            source = source.replace(
                `    addAdminLog(\`Thợ săn \${hunter.name} có \${TIME.hunterShoot} giây để trả thù.\`);`,
                `    addAdminLog(\`Thợ săn \${hunter.name} có \${TIME.hunterShoot} giây để trả thù.\`);

    /* BOT SMART HUNTER */
    if (hunter.isBot && !room.testMode) {
        setTimeout(() => {
            if (!room.pendingHunter || room.pendingHunter.id !== hunter.id) return;
            const candidates = alivePlayers().filter(
                p => p.id !== hunter.id && p.id !== hunter.loverId
            );
            const target = botStrategyHunterTarget(hunter, candidates);
            if (target) resolveHunterShot(target, false);
        }, 1200);
    }`
            );
        }

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
                console.log("[AUTOFILL PATCH] normal game missing slots = live bots + smart strategy");
                return patched;
            }

            if (Buffer.isBuffer(result)) {
                const patched = patchServerSource(result.toString("utf8"));
                console.log("[AUTOFILL PATCH] normal game missing slots = live bots + smart strategy");
                return Buffer.from(patched, "utf8");
            }
        } catch (err) {
            console.error("[AUTOFILL PATCH] failed", err);
        }

        return result;
    };
}
