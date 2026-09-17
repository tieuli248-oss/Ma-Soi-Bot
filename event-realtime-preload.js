// Realtime bridge for room.eventHistory -> frontend "gameEvent".
// Loaded with NODE_OPTIONS=--require ./event-realtime-preload.js
// Also patches voluntary-leave behavior in server-unified.js at load time.

if (!global.__MASOI_EVENT_REALTIME_PRELOAD__) {
    global.__MASOI_EVENT_REALTIME_PRELOAD__ = true;

    const fs = require("fs");
    const path = require("path");
    const Module = require("module");

    // ---------------------------------------------------------
    // SERVER SOURCE PATCH
    // ---------------------------------------------------------
    // We keep server-unified.js itself untouched and patch only the in-memory
    // source before Node compiles it. This lets a deliberate "Thoát Game"
    // kill the player without changing the current phase/timer, while an
    // ordinary disconnect (F5, lost network, closing tab/screen) remains only
    // an offline state that can reconnect by deviceId.
    const originalJsLoader = Module._extensions[".js"];

    Module._extensions[".js"] = function (module, filename) {
        if (path.basename(filename) !== "server-unified.js") {
            return originalJsLoader(module, filename);
        }

        let source = fs.readFileSync(filename, "utf8");

        // F5 / network loss must NOT count as an intentional exit for auto reset.
        source = source.replace(
            /if \(\s*p\.alive === true &&\s*\(\s*p\.connected === false \|\|\s*p\.leftGame === true\s*\)\s*\) \{/m,
            "if (p.leftGame === true) {"
        );

        // Reset the non-disruptive leave-hunter state whenever a new game starts.
        source = source.replace(
            "    room.exitedDeviceIds =\n        new Set();",
            "    room.exitedDeviceIds =\n        new Set();\n\n    room.leaveHunterRevenge =\n        new Map();"
        );

        const handleDisconnectMarker = `/* =========================================================\n   HANDLE DISCONNECT\n========================================================= */`;

        if (!source.includes("function scheduleLeaveHunterRevenge(")) {
            const helperCode = `/* =========================================================\n   VOLUNTARY LEAVE - NON-DISRUPTIVE HUNTER REVENGE\n   Does not stop or replace the current phase timer.\n========================================================= */\n\nfunction resolveLeaveHunterRevenge(hunterId, targetId = null, auto = false) {\n    if (!room.leaveHunterRevenge) return false;\n\n    const pending = room.leaveHunterRevenge.get(hunterId);\n    if (!pending) return false;\n\n    if (!room.started) {\n        room.leaveHunterRevenge.delete(hunterId);\n        return false;\n    }\n\n    const hunter = findPlayer(hunterId);\n    if (!hunter) {\n        room.leaveHunterRevenge.delete(hunterId);\n        return false;\n    }\n\n    const candidates = alivePlayers().filter(\n        p => p.id !== hunter.id && p.id !== hunter.loverId\n    );\n\n    if (!candidates.length) {\n        room.leaveHunterRevenge.delete(hunterId);\n        if (!checkWinner()) sendAdminState();\n        return false;\n    }\n\n    let target = targetId ? findPlayer(targetId) : null;\n    if (\n        !target ||\n        !target.alive ||\n        target.id === hunter.id ||\n        (hunter.loverId && target.id === hunter.loverId)\n    ) {\n        if (!auto) return false;\n        target = candidates[Math.floor(Math.random() * candidates.length)];\n    }\n\n    room.leaveHunterRevenge.delete(hunterId);\n\n    const deaths = killPlayer(target, \"Bị Thợ săn bắn\");\n    const message = auto\n        ? \`🏹 Hết 15 giây — hệ thống random: \${hunter.name} bắn \${target.name}.\`\n        : \`🏹 \${hunter.name} đã bắn \${target.name}.\`;\n\n    addAdminLog(message);\n    storeEventHistory(message, room.players);\n\n    io.emit(\"hunterShotResolved\", {\n        hunterId: hunter.id,\n        hunterName: hunter.name,\n        targetId: target.id,\n        targetName: target.name,\n        auto,\n        message,\n        sfx: NETLIFY_AUDIO_BASE + \"bow.mp3\"\n    });\n\n    sendDeaths(deaths, \"dead\");\n    broadcastPlayers();\n\n    let chainedHunter = false;\n    for (const dead of deaths) {\n        if (dead.role === \"Thợ săn\") {\n            chainedHunter = scheduleLeaveHunterRevenge(dead) || chainedHunter;\n        }\n    }\n\n    if (!chainedHunter) checkWinner();\n    sendAdminState();\n    return true;\n}\n\nfunction scheduleLeaveHunterRevenge(hunter) {\n    if (!room.started || !hunter || hunter.role !== \"Thợ săn\") return false;\n\n    if (!room.leaveHunterRevenge) room.leaveHunterRevenge = new Map();\n    if (room.leaveHunterRevenge.has(hunter.id)) return true;\n\n    const targets = alivePlayers().filter(\n        p => p.id !== hunter.id && p.id !== hunter.loverId\n    );\n\n    if (!targets.length) return false;\n\n    const token = \`leave-hunter-\${hunter.id}-\${Date.now()}-\${Math.random()}\`;\n    room.leaveHunterRevenge.set(hunter.id, {\n        id: hunter.id,\n        name: hunter.name,\n        loverId: hunter.loverId || null,\n        token\n    });\n\n    const publicTargets = targets.map(p => ({ id: p.id, name: p.name }));\n\n    io.emit(\"hunterRevengeStarted\", {\n        hunterId: hunter.id,\n        hunterName: hunter.name,\n        seconds: TIME.hunterShoot,\n        message: \"🏹 THỢ SĂN ĐANG TRẢ THÙ — đang chọn một người để bắn...\"\n    });\n\n    // If Hunter died because their lover left, Hunter may still be online and\n    // can choose. If Hunter themself pressed Thoát Game, they are offline and\n    // the system will random after 15 seconds.\n    if (hunter.connected) {\n        io.to(hunter.id).emit(\"hunterActionRequired\", {\n            seconds: TIME.hunterShoot,\n            players: publicTargets,\n            mandatory: true\n        });\n    }\n\n    addAdminLog(\`Thợ săn \${hunter.name} có \${TIME.hunterShoot} giây để trả thù sau khi có người rời game.\`);\n\n    setTimeout(() => {\n        const current = room.leaveHunterRevenge?.get(hunter.id);\n        if (!current || current.token !== token) return;\n        resolveLeaveHunterRevenge(hunter.id, null, true);\n    }, TIME.hunterShoot * 1000);\n\n    return true;\n}\n\n`;

            source = source.replace(handleDisconnectMarker, helperCode + handleDisconnectMarker);
        }

        // Let hunterShoot also resolve the special non-disruptive revenge that
        // can be created by a voluntary leave / lover death.
        const hunterStart = source.indexOf(`        /* =====================================================\n           🏹 HUNTER SHOOT`);
        const voteStart = source.indexOf(`        /* =====================================================\n           🗳️ DAY VOTE`, hunterStart);

        if (hunterStart >= 0 && voteStart > hunterStart) {
            const hunterBlock = `        /* =====================================================\n           🏹 HUNTER SHOOT\n        ===================================================== */\n\n        socket.on(\n            \"hunterShoot\",\n            data => {\n                const hunter = findPlayer(socket.data.playerId);\n                const target = findPlayer(data?.targetId);\n\n                const leavePending =\n                    room.leaveHunterRevenge?.get(socket.data.playerId);\n\n                if (leavePending) {\n                    if (!hunter || !target || !target.alive || target.id === hunter.id) {\n                        socket.emit(\"actionError\", { message: \"Mục tiêu không hợp lệ.\" });\n                        return;\n                    }\n\n                    if (hunter.loverId && target.id === hunter.loverId) {\n                        socket.emit(\"actionError\", { message: \"❤️ Thợ Săn không được bắn người yêu.\" });\n                        return;\n                    }\n\n                    resolveLeaveHunterRevenge(hunter.id, target.id, false);\n                    return;\n                }\n\n                if (\n                    !room.pendingHunter ||\n                    room.pendingHunter.id !== socket.data.playerId\n                ) return;\n\n                if (!hunter || !target || !target.alive || target.id === hunter.id) {\n                    socket.emit(\"actionError\", { message: \"Mục tiêu không hợp lệ.\" });\n                    return;\n                }\n\n                if (hunter.loverId && target.id === hunter.loverId) {\n                    socket.emit(\"actionError\", { message: \"❤️ Thợ Săn không được bắn người yêu.\" });\n                    return;\n                }\n\n                resolveHunterShot(target, false);\n            }\n        );\n\n\n`;
            source = source.slice(0, hunterStart) + hunterBlock + source.slice(voteStart);
        }

        // Replace the whole GAME RUNNING - VOLUNTARY branch. The key rule is:
        // death + state cleanup + winner check, but NO startNight/startDaySpeech
        // and NO stopTimer. Current phase and timer keep running.
        const voluntaryStart = source.indexOf(`    /* =====================================================\n       GAME RUNNING - VOLUNTARY`);
        const disconnectStart = source.indexOf(`    /* =====================================================\n       MẤT KẾT NỐI`, voluntaryStart);

        if (voluntaryStart >= 0 && disconnectStart > voluntaryStart) {
            const voluntaryBlock = `    /* =====================================================\n       GAME RUNNING - VOLUNTARY\n       Deliberate Thoát Game = death. Current phase/timer stays.\n    ===================================================== */\n\n    if (\n        voluntary\n    ) {\n\n        player.leftGame =\n            true;\n\n        if (player.alive) {\n            room.exitedDeviceIds.add(\n                player.deviceId || \`id:\${player.id}\`\n            );\n        }\n\n        player.connected =\n            false;\n\n        // Host is transferred immediately to another connected player.\n        if (room.hostId === player.id) {\n            chooseHost();\n        }\n\n        // Remove stale actions/votes by or against the leaving player without\n        // advancing the phase.\n        if (room.dayVotes) {\n            room.dayVotes.delete(player.id);\n            for (const [voterId, targetId] of [...room.dayVotes]) {\n                if (targetId === player.id) room.dayVotes.delete(voterId);\n            }\n            for (const p of room.players) {\n                if (p.dayVoteTargetId === player.id || p.id === player.id) {\n                    p.dayVoteTargetId = null;\n                }\n            }\n        }\n\n        if (room.night) {\n            if (room.night.wolfVotes) {\n                room.night.wolfVotes.delete(player.id);\n                for (const [wolfId, targetId] of [...room.night.wolfVotes]) {\n                    if (targetId === player.id) room.night.wolfVotes.delete(wolfId);\n                }\n                room.night.wolfTargetId = calculateWolfTarget()?.id || null;\n            }\n            if (room.night.guardTargetId === player.id) room.night.guardTargetId = null;\n            if (room.night.witchPoisonDraftTargetId === player.id) room.night.witchPoisonDraftTargetId = null;\n            if (Array.isArray(room.night.cupidDraftIds)) {\n                room.night.cupidDraftIds = room.night.cupidDraftIds.filter(id => id !== player.id);\n            }\n        }\n\n        let deaths = [];\n\n        if (player.alive) {\n            deaths = killPlayer(\n                player,\n                \"Rời game\"\n            );\n        }\n\n        const message = \`🚪 \${player.name} đã Thoát Game và chết.\`;\n        addLog(message);\n        addAdminLog(\`\${player.name} rời game chủ động.\`);\n        storeEventHistory(message, room.players);\n\n        if (deaths.length) {\n            sendDeaths(deaths, \"dead\");\n        }\n\n        broadcastPlayers();\n\n        let hunterRevengeStarted = false;\n        for (const dead of deaths) {\n            if (dead.role === \"Thợ săn\") {\n                hunterRevengeStarted =\n                    scheduleLeaveHunterRevenge(dead) || hunterRevengeStarted;\n            }\n        }\n\n        // Give Hunter revenge priority before final winner resolution.\n        if (!hunterRevengeStarted) {\n            checkWinner();\n        }\n\n        emitRoom();\n        sendAdminState();\n\n        return;\n\n    }\n\n\n`;
            source = source.slice(0, voluntaryStart) + voluntaryBlock + source.slice(disconnectStart);
        }

        // If the last connected real human deliberately leaves, a bot-only room
        // must never keep playing by itself. Stop timers, clear every bot and
        // return to a clean lobby immediately.
        source = source.replace(
            `        player.connected =
            false;

        // Host is transferred immediately to another connected player.`,
            `        player.connected =
            false;

        const connectedRealHumans = room.players.filter(
            p =>
                p.isBot !== true &&
                p.connected === true &&
                p.leftGame !== true
        );

        if (connectedRealHumans.length === 0) {
            stopTimer();
            stopGamePlayClock();

            if (room.leaveHunterRevenge?.clear) {
                room.leaveHunterRevenge.clear();
            }

            const noHumanMessage =
                "♻️ Không còn người chơi thật trong phòng. Ván đã dừng và Bot đã được xóa.";

            addLog(noHumanMessage);
            addAdminLog("AUTO RESET: người chơi thật cuối cùng đã rời phòng.");

            io.emit("gameAutoReset", {
                reason: "noRealHuman",
                message: noHumanMessage
            });

            room.players = [];
            room.hostId = null;
            room.testMode = false;
            room.testConfig = null;
            room.testHumanId = null;
            room.testRoleAssignments = {};
            room.testBotWolfNight = null;
            room.testBotWolfTargetId = null;

            if (typeof serverTestConsentEmpty === "function") {
                room.testConsent = serverTestConsentEmpty();
            }

            resetRoom("AUTO RESET TO LOBBY: không còn người chơi thật.");
            room.targetPlayerCount = MIN_PLAYERS;
            emitRoom();
            sendAdminState();
            return;
        }

        // Host is transferred immediately to another connected player.`
        );

        console.log("[LEAVE PATCH] voluntary leave = death; last human leaves = reset; disconnect = reconnectable");
        return module._compile(source, filename);
    };

    const socketio = require("socket.io");
    const OriginalServer = socketio.Server;

    // Capture the Socket.IO server instance created by server-unified.js.
    class CapturingServer extends OriginalServer {
        constructor(...args) {
            super(...args);
            global.__MASOI_SOCKET_IO__ = this;
        }
    }

    socketio.Server = CapturingServer;

    const originalPush = Array.prototype.push;

    function emitStoredEvent(item) {
        try {
            const io = global.__MASOI_SOCKET_IO__;
            if (!io || !item || typeof item !== "object") return;
            if (!String(item.historyId || "").startsWith("event-")) return;
            if (!Array.isArray(item.visibleToDeviceIds)) return;
            if (!item.text) return;

            const allowed = new Set(item.visibleToDeviceIds.filter(Boolean));
            if (!allowed.size) return;

            const payload = {
                historyId: item.historyId,
                kind: item.kind || "event",
                text: String(item.text),
                time: Number(item.time || Date.now())
            };

            for (const socket of io.sockets.sockets.values()) {
                const deviceId = socket?.data?.__masoiDeviceId;
                if (!deviceId || !allowed.has(deviceId)) continue;
                socket.emit("gameEvent", payload);
            }
        } catch (err) {
            console.error("[EVENT REALTIME] emit failed", err);
        }
    }

    // eventHistory is a normal array. Detect only history objects created by
    // storeEventHistory; all unrelated Array#push calls pass straight through.
    Array.prototype.push = function (...items) {
        const result = Reflect.apply(originalPush, this, items);

        for (const item of items) {
            if (
                item &&
                typeof item === "object" &&
                typeof item.historyId === "string" &&
                item.historyId.startsWith("event-") &&
                Array.isArray(item.visibleToDeviceIds) &&
                typeof item.text === "string"
            ) {
                queueMicrotask(() => emitStoredEvent(item));
            }
        }

        return result;
    };

    // server-unified.js registers its own connection handler during require().
    // setImmediate runs after the main module finishes loading, before normal
    // gameplay traffic, and adds only the deviceId mapping needed above.
    setImmediate(() => {
        const io = global.__MASOI_SOCKET_IO__;
        if (!io) {
            console.error("[EVENT REALTIME] Socket.IO instance not captured");
            return;
        }

        io.on("connection", socket => {
            socket.on("joinRoom", data => {
                const deviceId = String(data?.deviceId || "").trim();
                if (deviceId) socket.data.__masoiDeviceId = deviceId;
            });
        });

        console.log("[EVENT REALTIME] gameEvent bridge enabled");
    });
}
