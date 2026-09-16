// Human-only host + TEST BOT consent patch.
// Must load before autofill-preload.js.
// Patches fs.readFileSync so later preload patches can chain normally.

if (!global.__MASOI_HUMAN_HOST_FS_PRELOAD__) {
    global.__MASOI_HUMAN_HOST_FS_PRELOAD__ = true;

    const fs = require("fs");
    const path = require("path");
    const previousReadFileSync = fs.readFileSync.bind(fs);

    function patchHostSelection(source) {
        if (typeof source !== "string") return source;

        const originalChooseHost = `function chooseHost() {

    room.hostId =
        room.players.find(
            p =>
                p.connected
        )?.id ||
        null;

}`;

        const humanOnlyChooseHost = `function chooseHost() {

    // Bot tuyệt đối không được làm Host.
    // Chỉ người thật còn kết nối mới có thể nhận Host.
    const nextHost =
        room.players.find(
            p =>
                p.connected &&
                p.isBot !== true
        ) ||
        null;

    room.hostId =
        nextHost?.id ||
        null;

    return room.hostId;

}`;

        if (source.includes(originalChooseHost)) {
            source = source.replace(originalChooseHost, humanOnlyChooseHost);
        } else {
            source = source.replace(
                /function chooseHost\(\) \{[\s\S]*?room\.hostId\s*=\s*room\.players\.find\(\s*p\s*=>\s*p\.connected\s*\)\?\.id\s*\|\|\s*null;[\s\S]*?\n\}/m,
                humanOnlyChooseHost
            );
        }

        // TEST BOT consent lives on the server so every real device receives
        // the same prompt/state. The old HTML already listens for these events.
        if (!source.includes("function serverTestConsentMembers()")) {
            const ioMarker = `io.on(\n    "connection",`;
            const helpers = `
function serverTestConsentMembers() {
    return room.players.filter(
        p =>
            p &&
            p.isBot !== true &&
            p.connected !== false &&
            p.leftGame !== true &&
            p.id !== room.hostId
    );
}

function serverTestConsentEmpty() {
    return {
        active: false,
        cycleId: 0,
        round: 0,
        requestSeq: 0,
        requestTargets: [],
        responses: {},
        askedAt: 0
    };
}

function ensureServerTestConsent() {
    if (!room.testConsent || typeof room.testConsent !== "object") {
        room.testConsent = serverTestConsentEmpty();
    }
    if (!Array.isArray(room.testConsent.requestTargets)) {
        room.testConsent.requestTargets = [];
    }
    if (!room.testConsent.responses || typeof room.testConsent.responses !== "object") {
        room.testConsent.responses = {};
    }
    return room.testConsent;
}

function serverTestConsentSnapshot() {
    const c = ensureServerTestConsent();
    const validIds = new Set(serverTestConsentMembers().map(p => p.id));

    for (const id of Object.keys(c.responses)) {
        if (!validIds.has(id)) delete c.responses[id];
    }
    c.requestTargets = c.requestTargets.filter(id => validIds.has(id));

    return {
        active: c.active === true,
        cycleId: Number(c.cycleId || 0),
        round: Number(c.round || 0),
        requestSeq: Number(c.requestSeq || 0),
        requestTargets: [...c.requestTargets],
        responses: { ...c.responses },
        askedAt: Number(c.askedAt || 0)
    };
}

function emitServerTestConsentState(targetId = null) {
    const payload = serverTestConsentSnapshot();
    if (targetId) io.to(targetId).emit("testConsentState", payload);
    else io.emit("testConsentState", payload);
}

function sendServerTestConsentRequests(ids) {
    const c = ensureServerTestConsent();
    const requested = new Set(ids || []);

    for (const p of serverTestConsentMembers()) {
        if (!requested.has(p.id)) continue;
        io.to(p.id).emit("testConsentRequest", {
            active: true,
            cycleId: Number(c.cycleId || 0),
            round: Math.max(1, Number(c.round || 1)),
            requestSeq: Math.max(1, Number(c.requestSeq || 1)),
            requestTargets: [...c.requestTargets],
            responses: { ...c.responses },
            message: "Host muốn bật TEST BOT. Bạn có đồng ý tham gia không?"
        });
    }
}

function beginServerTestConsentCycle() {
    const members = serverTestConsentMembers();
    const c = ensureServerTestConsent();

    c.active = members.length > 0;
    c.cycleId = Date.now();
    c.round = members.length ? 1 : 0;
    c.requestSeq = members.length ? 1 : 0;
    c.requestTargets = members.map(p => p.id);
    c.responses = {};
    c.askedAt = members.length ? Date.now() : 0;

    for (const p of members) c.responses[p.id] = "pending";

    emitServerTestConsentState();
    if (members.length) sendServerTestConsentRequests(c.requestTargets);
    return c;
}

function addServerTestConsentMember(player) {
    if (!room.testMode || !player || player.isBot === true || player.id === room.hostId) return;

    const c = ensureServerTestConsent();
    if (!c.cycleId) c.cycleId = Date.now();
    if (c.round <= 0) c.round = 1;
    if (c.requestSeq <= 0) c.requestSeq = 1;
    c.active = true;
    c.responses[player.id] = "pending";
    if (!c.requestTargets.includes(player.id)) c.requestTargets.push(player.id);
    c.askedAt = Date.now();

    io.to(player.id).emit("testBotEnabled", {
        enabled: true,
        message: "🧪 TEST BOT đang bật."
    });
    emitServerTestConsentState();
    sendServerTestConsentRequests([player.id]);
}

function askServerTestConsentAgain(ids) {
    const c = ensureServerTestConsent();
    const valid = new Set(serverTestConsentMembers().map(p => p.id));
    const targets = [...new Set(ids || [])].filter(id => valid.has(id));

    c.active = targets.length > 0;
    c.round = Math.min(3, Math.max(1, Number(c.round || 1)) + 1);
    c.requestSeq = Math.max(1, Number(c.requestSeq || 1)) + 1;
    c.requestTargets = targets;
    c.askedAt = Date.now();
    for (const id of targets) c.responses[id] = "pending";

    emitServerTestConsentState();
    sendServerTestConsentRequests(targets);
    return c;
}

function disableServerTestModeConsent(message = "TEST BOT đã tắt; Lobby trở lại chế độ người thật.") {
    room.testConsent = serverTestConsentEmpty();
    room.testMode = false;
    room.testConfig = null;
    room.testHumanId = null;
    room.testRoleAssignments = {};
    room.testBotWolfNight = null;
    room.testBotWolfTargetId = null;
    room.players = room.players.filter(p => !p.isBot);

    io.emit("testConsentState", serverTestConsentEmpty());
    io.emit("testBotDisabled", { enabled: false, message });
}

function rotateServerHostAfterConsentRefusal(oldHost) {
    const candidates = serverTestConsentMembers();
    if (!candidates.length) return false;

    const nextHost = candidates[Math.floor(Math.random() * candidates.length)];
    const oldHostId = room.hostId;
    const oldHostName = oldHost?.name || findPlayer(oldHostId)?.name || "Host";

    room.hostId = nextHost.id;
    disableServerTestModeConsent("TEST BOT đã tắt vì không đủ đồng thuận sau 3 lần hỏi.");

    io.emit("hostChanged", {
        reason: "testBotRefusal",
        oldHostId,
        oldHostName,
        newHostId: nextHost.id,
        newHostName: nextHost.name,
        message: "Đã hỏi TEST BOT đủ 3 lần nhưng vẫn có người không đồng ý. Hệ thống đã random Host mới."
    });

    emitRoom();
    sendAdminState();
    return true;
}

function serverTestConsentAllowsStart(socket, starter) {
    const members = serverTestConsentMembers();
    if (!members.length) return true;

    let c = ensureServerTestConsent();
    if (!c.active || !c.cycleId) {
        beginServerTestConsentCycle();
        socket.emit("actionError", {
            message: "Đã gửi yêu cầu TEST BOT lần 1/3 cho người chơi."
        });
        return false;
    }

    const valid = new Set(members.map(p => p.id));
    for (const id of Object.keys(c.responses)) {
        if (!valid.has(id)) delete c.responses[id];
    }

    const pending = members.filter(p => (c.responses[p.id] || "pending") === "pending");
    if (pending.length) {
        emitServerTestConsentState();
        sendServerTestConsentRequests(pending.map(p => p.id));
        socket.emit("actionError", {
            message: "Đang chờ phản hồi TEST BOT: " + pending.map(p => p.name).join(", ")
        });
        return false;
    }

    const rejected = members.filter(p => c.responses[p.id] !== "ok");
    if (!rejected.length) return true;

    const round = Math.max(1, Number(c.round || 1));
    if (round < 3) {
        c = askServerTestConsentAgain(rejected.map(p => p.id));
        socket.emit("actionError", {
            message: "Đã hỏi lại TEST BOT lần " + c.round + "/3: " + rejected.map(p => p.name).join(", ")
        });
        return false;
    }

    rotateServerHostAfterConsentRefusal(starter);
    socket.emit("actionError", {
        message: "Đã đủ 3 lần từ chối. TEST BOT đã tắt và Host mới đã được random."
    });
    return false;
}

`;

            if (source.includes(ioMarker)) {
                source = source.replace(ioMarker, helpers + ioMarker);
            }
        }

        // Enabling TEST BOT must immediately start the consent cycle and notify
        // every non-host human device.
        const oldEnableBlock = `            const enabled = data?.enabled === true;
            room.testMode = enabled;

            if (!enabled) {
                room.players = room.players.filter(p => !p.isBot);
                room.testConfig = null;
                room.testHumanId = null;
                room.testRoleAssignments = {};
                room.testBotWolfNight = null;
                room.testBotWolfTargetId = null;
            } else {
                room.testHumanId = room.hostId;
            }

            socket.emit("testModeState", { enabled });
            io.emit(enabled ? "testBotEnabled" : "testBotDisabled", {
                enabled,
                message: enabled
                    ? "🧪 TEST BOT đã bật."
                    : "TEST BOT đã tắt; Lobby trở lại chế độ người thật."
            });
            emitRoom();
            sendAdminState();`;

        const newEnableBlock = `            const enabled = data?.enabled === true;
            room.testMode = enabled;

            if (!enabled) {
                disableServerTestModeConsent();
            } else {
                room.testHumanId = room.hostId;
                beginServerTestConsentCycle();
            }

            socket.emit("testModeState", { enabled });
            if (enabled) {
                io.emit("testBotEnabled", {
                    enabled: true,
                    message: "🧪 TEST BOT đã bật."
                });
                emitServerTestConsentState();
                sendServerTestConsentRequests(
                    ensureServerTestConsent().requestTargets
                );
            }
            emitRoom();
            sendAdminState();`;

        if (source.includes(oldEnableBlock)) {
            source = source.replace(oldEnableBlock, newEnableBlock);
        }

        // Receive OK / KHÔNG OK from real member devices.
        if (!source.includes('"respondTestBotConsent"')) {
            const adminMarker = `        /* =====================================================
           ADMIN LOGIN
        ===================================================== */`;
            const respondHandler = `        /* =====================================================
           TEST BOT CONSENT RESPONSE
        ===================================================== */
        socket.on("respondTestBotConsent", data => {
            if (room.started || !room.testMode) return;

            const player = findPlayer(socket.data.playerId);
            if (!player || player.isBot === true || player.id === room.hostId) return;

            const c = ensureServerTestConsent();
            if (!c.requestTargets.includes(player.id)) return;
            if ((c.responses[player.id] || "pending") !== "pending") return;

            c.responses[player.id] = data?.ok === true ? "ok" : "no";
            c.askedAt = Date.now();

            emitServerTestConsentState();
            sendAdminState();
        });


`;
            if (source.includes(adminMarker)) {
                source = source.replace(adminMarker, respondHandler + adminMarker);
            }
        }

        // A player joining while TEST BOT is already enabled must receive the
        // same consent prompt immediately.
        const hostAssignBlock = `                if (
                    !room.hostId
                ) {

                    room.hostId =
                        player.id;

                }

                room.targetPlayerCount =`;

        if (source.includes(hostAssignBlock) && !source.includes("addServerTestConsentMember(player);")) {
            source = source.replace(
                hostAssignBlock,
                `                if (
                    !room.hostId
                ) {

                    room.hostId =
                        player.id;

                }

                if (room.testMode && player.id !== room.hostId) {
                    addServerTestConsentMember(player);
                }

                room.targetPlayerCount =`
            );
        }

        // Server, not the Host HTML, is authoritative for consent before a test
        // round can actually start.
        const countMarker = `            const count = Number(data?.count || 10);`;
        if (source.includes(countMarker) && !source.includes("serverTestConsentAllowsStart(socket, starter)")) {
            source = source.replace(
                countMarker,
                `            if (!serverTestConsentAllowsStart(socket, starter)) {
                return;
            }

${countMarker}`
            );
        }

        // Clear consent data during the daily room reset as well.
        source = source.replace(
            `    room.testRoleAssignments = {};
    room.testBotWolfNight = null;`,
            `    room.testRoleAssignments = {};
    room.testConsent = serverTestConsentEmpty();
    room.testBotWolfNight = null;`
        );

        return source;
    }

    fs.readFileSync = function humanHostReadFileSync(filename, ...args) {
        const result = previousReadFileSync(filename, ...args);

        try {
            if (path.basename(String(filename)) !== "server-unified.js") {
                return result;
            }

            if (typeof result === "string") {
                const patched = patchHostSelection(result);
                console.log("[HOST PATCH] bot cannot become host; human-only transfer");
                console.log("[TEST CONSENT PATCH] member popup + server consent enabled");
                return patched;
            }

            if (Buffer.isBuffer(result)) {
                const patched = patchHostSelection(result.toString("utf8"));
                console.log("[HOST PATCH] bot cannot become host; human-only transfer");
                console.log("[TEST CONSENT PATCH] member popup + server consent enabled");
                return Buffer.from(patched, "utf8");
            }
        } catch (err) {
            console.error("[HOST PATCH] failed", err);
        }

        return result;
    };
}
