// Finalize the CURRENT server-unified.js in place.
// No V14/V15/new server copy is created. This script is intentionally idempotent.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "server-unified.js");
const FINAL_MARKER = "// FINAL RULESET 2026-09-13";

let source = fs.readFileSync(OUT_PATH, "utf8");

function req(oldText, newText, label) {
    if (!source.includes(oldText)) throw new Error(`Finalize unified: thiếu đoạn ${label}`);
    source = source.replace(oldText, newText);
}

function rx(regex, replacement, label) {
    if (!regex.test(source)) throw new Error(`Finalize unified: thiếu regex ${label}`);
    source = source.replace(regex, replacement);
}

function validateFinal(text) {
    const markers = [
        FINAL_MARKER,
        "night: 60",
        "mainNightAction: 50",
        "cupidPair: 15",
        "witchPoison: 50",
        "witchSave: 10",
        "hunterShoot: 15",
        "dayVote: 30",
        "if (count <= 6) return 90;",
        "if (count <= 8) return 120;",
        "if (count <= 10) return 150;",
        "function startGameIntro()",
        "function lockNightMainActions(",
        "function lockCupidPairIfNeeded(",
        "coupleHearts",
        "testObserverState",
        'socket.on("setTestBotEnabled"',
        'socket.on("startTestGame"',
        'socket.on("stopTestGame"',
        'socket.on(\n            "seerInspect"',
        "wedding.mp3",
        "bow.mp3"
    ];
    for (const marker of markers) {
        if (!text.includes(marker)) throw new Error(`Finalize unified: thiếu marker ${marker}`);
    }
    if (text.includes("night: 50,")) throw new Error("Finalize unified: còn night=50 cũ");
    if (text.includes("return TIME.daySpeech;")) throw new Error("Finalize unified: thảo luận vẫn cố định");
}

if (source.includes(FINAL_MARKER)) {
    validateFinal(source);
    console.log("[FINALIZE] server-unified.js already finalized");
    process.exit(0);
}

// Remove the old generated banner; the replacement banner is added at the end.
source = source.replace(
    /^\/\/ ============================================================\n\/\/ MA SÓI ONLINE — UNIFIED SERVER[\s\S]*?\/\/ ============================================================\n\n/,
    ""
);

// ------------------------------------------------------------------
// FINAL TIMERS
// One visible night timer: 60 -> 0. Main actions: first 50s.
// Discussion: alive 1-6=90, 7-8=120, 9-10=150, 11-15=180.
// ------------------------------------------------------------------
rx(
    /const TIME = \{[\s\S]*?\n\};/,
    `const TIME = {
    night: 60,
    mainNightAction: 50,
    cupidPair: 15,
    witchPoison: 50,
    witchSave: 10,
    hunterShoot: 15,
    daySpeech: 180,
    dayVote: 30
};`,
    "TIME"
);

rx(
    /function daySpeechSecondsForAlive[^{]*\{[\s\S]*?\n\}/,
    `function daySpeechSecondsForAlive(count = alivePlayers().length) {
    if (count <= 6) return 90;
    if (count <= 8) return 120;
    if (count <= 10) return 150;
    return 180;
}`,
    "dynamic day discussion"
);

// ------------------------------------------------------------------
// Room state / timers.
// ------------------------------------------------------------------
req(
    `    witchPoisonTimeout: null,`,
    `    witchPoisonTimeout: null,

    nightLockTimeout: null,

    introTimeout: null,

    introCompleted: false,

    testConfig: null,`,
    "room extra state"
);

req(
    `    if (
        room.witchPoisonTimeout
    ) {
        clearTimeout(
            room.witchPoisonTimeout
        );
        room.witchPoisonTimeout =
            null;
    }

}`,
    `    if (
        room.witchPoisonTimeout
    ) {
        clearTimeout(
            room.witchPoisonTimeout
        );
        room.witchPoisonTimeout =
            null;
    }

    if (room.nightLockTimeout) {
        clearTimeout(room.nightLockTimeout);
        room.nightLockTimeout = null;
    }

    if (room.introTimeout) {
        clearTimeout(room.introTimeout);
        room.introTimeout = null;
    }

}`,
    "stopTimer extra timers"
);

req(
    `    room.night = {

        wolfVotes:`,
    `    room.night = {

        mainActionsOpen: true,

        mainActionEndsAt: null,

        cupidPairEndsAt: null,

        cupidDraftIds: [],

        wolfVotes:`,
    "resetNight final state"
);

// ------------------------------------------------------------------
// Host Test Observer: Host sees all roles and all current test actions.
// ------------------------------------------------------------------
req(
    `                dayVoteTargetId:
                    p.dayVoteTargetId

            };`,
    `                dayVoteTargetId:
                    p.dayVoteTargetId,

                isBot:
                    !!p.isBot

            };`,
    "publicPlayers isBot"
);

req(
    `                roleComposition:
                    room.started
                        ? [...room.roleComposition]
                        : getRoleComposition(room.players.length)

            },`,
    `                roleComposition:
                    room.started
                        ? [...room.roleComposition]
                        : getRoleComposition(room.players.length),

                testMode:
                    room.testMode === true

            },`,
    "roomState testMode"
);

const observer = `function sendTestObserverState() {
    if (!room.testMode || !room.hostId) return;
    const host = findPlayer(room.hostId);
    if (!host?.connected) return;

    const wolfVotes = room.night
        ? Array.from(room.night.wolfVotes.entries()).map(([voterId, targetId]) => ({
            voterId,
            voterName: findPlayer(voterId)?.name || null,
            targetId,
            targetName: findPlayer(targetId)?.name || null
        }))
        : [];

    const dayVotes = Array.from(room.dayVotes.entries()).map(([voterId, targetId]) => ({
        voterId,
        voterName: findPlayer(voterId)?.name || null,
        targetId,
        targetName: findPlayer(targetId)?.name || null
    }));

    io.to(host.id).emit("testObserverState", {
        testMode: true,
        phase: room.phase,
        nightNumber: room.nightNumber,
        timerEndsAt: room.timerEndsAt,
        players: publicPlayers(true),
        actions: {
            mainActionsOpen: !!room.night?.mainActionsOpen,
            wolfVotes,
            wolfTargetId: room.night?.wolfTargetId || null,
            guardTargetId: room.night?.guardTargetId || null,
            seerInspections: [...(room.night?.seerInspections || [])],
            witchPoisonDraftTargetId: room.night?.witchPoisonDraftTargetId || null,
            witchPoisonTargetId: room.night?.witchPoisonTargetId || null,
            witchSave: room.night?.witchSave === true,
            cupidDraftIds: [...(room.night?.cupidDraftIds || [])],
            cupidPairs: [...(room.night?.cupidPairs || [])],
            pendingHunter: room.pendingHunter ? { ...room.pendingHunter } : null,
            dayVotes
        }
    });
}

`;

req(
    `/* =========================================================
   ADMIN STATE
========================================================= */`,
    `/* =========================================================
   TEST OBSERVER STATE - HOST ONLY
========================================================= */
${observer}/* =========================================================
   ADMIN STATE
========================================================= */`,
    "observer insertion"
);

req(
    `                audioConfig:
                    publicAudioConfig()

            }
        );

    }

}`,
    `                audioConfig:
                    publicAudioConfig()

            }
        );

    }

    sendTestObserverState();

}`,
    "observer dispatch"
);

// ------------------------------------------------------------------
// Cupid draft, timeout lock and Couple hearts for remainder of Night 1.
// ------------------------------------------------------------------
const cupidFns = `function notifyCoupleLinked(first, second, auto = false) {
    if (!first || !second) return;

    first.loverId = second.id;
    second.loverId = first.id;

    room.night.cupidPairs.push({
        firstId: first.id,
        firstName: first.name,
        secondId: second.id,
        secondName: second.name,
        auto
    });

    const heartsUntil = room.nightNumber === 1 && room.phase === "night"
        ? room.timerEndsAt
        : null;

    io.to(first.id).emit("loverLinked", {
        loverId: second.id,
        loverName: second.name,
        loverRole: second.role,
        hearts: true,
        heartsUntil
    });
    io.to(second.id).emit("loverLinked", {
        loverId: first.id,
        loverName: first.name,
        loverRole: first.role,
        hearts: true,
        heartsUntil
    });

    io.to(first.id).emit("coupleHearts", { active: true, nightNumber: 1, until: heartsUntil });
    io.to(second.id).emit("coupleHearts", { active: true, nightNumber: 1, until: heartsUntil });

    storeEventHistory(\`💘 Couple của bạn: \${second.name} (\${second.role})\`, [first]);
    storeEventHistory(\`💘 Couple của bạn: \${first.name} (\${first.role})\`, [second]);
}

function lockCupidPairIfNeeded(nightRef) {
    if (
        !room.started ||
        room.phase !== "night" ||
        room.nightNumber !== 1 ||
        !room.night ||
        room.night !== nightRef ||
        room.night.cupidPairs.length
    ) return;

    const cupid = room.players.find(p => p.alive && p.role === "Cupid");
    if (!cupid) return;

    const validDraft = (room.night.cupidDraftIds || [])
        .map(findPlayer)
        .filter(p => p?.alive)
        .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);

    let first = validDraft[0] || null;
    let second = validDraft[1] || null;
    let auto = false;

    if (!first || !second || first.id === second.id) {
        const candidates = alivePlayers();
        if (candidates.length < 2) return;
        const shuffled = [...candidates].sort(() => Math.random() - 0.5);
        first = shuffled[0];
        second = shuffled[1];
        auto = true;
    }

    room.night.cupidDraftIds = [first.id, second.id];
    notifyCoupleLinked(first, second, auto);

    const message = auto
        ? \`💘 Hết 15 giây — hệ thống tự ghép \${first.name} ❤️ \${second.name}.\`
        : \`💘 Hết 15 giây — chốt Couple: \${first.name} ❤️ \${second.name}.\`;

    if (cupid.connected) {
        io.to(cupid.id).emit(auto ? "cupidAutoPaired" : "cupidPairLocked", {
            firstId: first.id,
            firstName: first.name,
            secondId: second.id,
            secondName: second.name,
            message
        });
    }

    storeEventHistory(message, [cupid]);
    addAdminLog(message);
    sendAdminState();
}
`;

rx(
    /function autoPairCupidIfNeeded\(nightRef\) \{[\s\S]*?\n\}\n\n\n\/\* =========================================================\n   START NIGHT/,
    `${cupidFns}\n\n/* =========================================================\n   START NIGHT`,
    "old Cupid auto-pair"
);

// ------------------------------------------------------------------
// Intro 8s + 2s, then Night 1 starts. Night 2+ has no intro.
// Night timer is exactly one 60s timer; at 50s elapsed main actions lock.
// ------------------------------------------------------------------
const startNight = `function startGameIntro() {
    if (!room.started) return;

    room.phase = "intro";
    room.introCompleted = true;

    addLog("🌙 Mở đầu ván — màn đêm buông xuống.");
    addAdminLog("Intro đầu ván: 8 giây hiệu ứng + 2 giây nghỉ; timer đêm chưa chạy.");

    __frontendOwnsMusic("night");

    io.emit("phaseChanged", {
        phase: "intro",
        nightNumber: 1,
        players: publicPlayers(false),
        intro: {
            textMs: 8000,
            pauseMs: 2000,
            totalMs: 10000,
            musicKey: "night",
            musicContinuesIntoNight: true
        }
    });

    emitRoom();
    sendAdminState();

    room.introTimeout = setTimeout(() => {
        room.introTimeout = null;
        if (!room.started || room.phase !== "intro") return;
        startNight();
    }, 10000);
}

function startNight() {
    if (!room.started) return;

    if (room.nightNumber === 0 && room.phase === "intro" && room.introCompleted !== true) {
        startGameIntro();
        return;
    }

    stopTimer();
    room.phase = "night";
    room.nightNumber++;
    room.totalNightsPlayed++;
    room.dayVotes = new Map();
    room.pendingNightDeaths = [];
    room.pendingHunter = null;

    for (const player of room.players) {
        player.seerUsedNight = false;
        player.dayVoteTargetId = null;
    }

    const previousGuardTarget = room.night?.guardTargetId || null;
    resetNight(previousGuardTarget);

    const now = Date.now();
    room.night.mainActionEndsAt = now + TIME.mainNightAction * 1000;
    room.night.cupidPairEndsAt = room.nightNumber === 1
        ? now + TIME.cupidPair * 1000
        : null;

    addLog(\`🌙 Đêm \${room.nightNumber} bắt đầu.\`);
    addAdminLog(\`Đêm \${room.nightNumber} bắt đầu — timer cố định 60 giây.\`);
    storeEventHistory(\`🌙 ĐÊM \${room.nightNumber}\`, room.players, "section");

    __frontendOwnsMusic("night");

    io.emit("phaseChanged", {
        phase: "night",
        nightNumber: room.nightNumber,
        players: publicPlayers(false),
        nightTimerSeconds: TIME.night,
        mainActionSeconds: TIME.mainNightAction,
        witchSaveSeconds: TIME.witchSave,
        musicKey: "night"
    });

    sendWolfTargets();
    sendWolfVoteState();
    emitRoom();
    sendAdminState();

    startTimer(TIME.night, finishWitchAction);
    startWitchPoisonAction();

    const nightRef = room.night;
    room.nightLockTimeout = setTimeout(
        () => lockNightMainActions(nightRef),
        TIME.mainNightAction * 1000
    );

    if (room.nightNumber === 1) {
        setTimeout(() => lockCupidPairIfNeeded(nightRef), TIME.cupidPair * 1000);
    }
}
`;

rx(
    /function startNight\(\) \{[\s\S]*?\n\}\n\n\n\/\* =========================================================\n   RESOLVE NIGHT/,
    `${startNight}\n\n/* =========================================================\n   RESOLVE NIGHT`,
    "old startNight"
);

req(
    `    room.nightNumber =
        0;`,
    `    room.nightNumber =
        0;

    room.introCompleted =
        false;`,
    "startGame intro flag"
);

// ------------------------------------------------------------------
// At 10 seconds remaining, lock main actions and optionally show Witch Save.
// DO NOT resolve deaths and DO NOT restart the visible timer.
// ------------------------------------------------------------------
const lockNight = `function lockNightMainActions(nightRef = room.night) {
    if (
        room.phase !== "night" ||
        !room.night ||
        room.night !== nightRef ||
        room.night.mainActionsOpen === false
    ) return;

    room.night.mainActionsOpen = false;
    room.night.mainActionEndsAt = null;
    room.nightLockTimeout = null;

    lockWitchPoisonSelection();
    room.night.wolfTargetId = calculateWolfTarget()?.id || null;

    io.emit("nightMainActionsLocked", {
        nightNumber: room.nightNumber,
        remaining: TIME.witchSave,
        message: "🔒 Đã khóa hành động chính. Đêm vẫn chạy tiếp tới 0."
    });

    const witch = room.players.find(p => p.alive && p.role === "Phù thủy");
    const target = findPlayer(room.night.wolfTargetId);
    const protectedByGuard = !!target && room.night.guardTargetId === target.id;

    if (witch?.connected) {
        let message;
        if (!target) message = "🐺 Đêm nay Sói không cắn được ai.";
        else if (protectedByGuard) message = \`🐺 Sói đã cắn \${target.name}. 🛡️ Người này đã được Bảo Vệ bảo vệ nên không thể dùng bình cứu.\`;
        else if (witch.used.witchSave) message = \`🐺 Sói đã cắn \${target.name}. ❤️ Bình cứu của bạn đã dùng hết.\`;
        else message = \`🐺 Sói đã cắn \${target.name}. Bạn có 10 giây cuối đêm để quyết định cứu.\`;

        socketForPlayer(witch)?.emit("witchWolfResult", {
            targetId: target?.id || null,
            targetName: target?.name || null,
            protectedByGuard,
            canSave: !!target && !protectedByGuard && !witch.used.witchSave,
            message
        });
    }

    if (target && !protectedByGuard && witch?.alive && !witch.used.witchSave) {
        startWitchSaveAction();
    }

    sendAdminState();
}

function resolveNight() {
    lockNightMainActions(room.night);
}
`;

rx(
    /function resolveNight\(\) \{[\s\S]*?\n\}\n\n\nfunction socketForPlayer/,
    `${lockNight}\n\nfunction socketForPlayer`,
    "old resolveNight"
);

const witchSave = `function startWitchSaveAction() {
    if (room.phase !== "night" || !room.night) return;

    const witch = room.players.find(p => p.alive && p.role === "Phù thủy");
    const target = findPlayer(room.night.wolfTargetId);
    const protectedByGuard = !!target && room.night.guardTargetId === target.id;

    if (!witch || !witch.alive || !target || protectedByGuard || witch.used.witchSave) return;

    room.night.witchActionOpen = true;
    room.night.witchActionMode = "save";
    room.night.witchActionResolved = false;

    if (witch.connected) {
        io.to(witch.id).emit("witchActionRequired", {
            mode: "save",
            message: \`❤️ \${target.name} đã bị Sói cắn. Bạn có 10 giây cuối đêm để quyết định cứu.\`,
            seconds: TIME.witchSave,
            endsAt: room.timerEndsAt,
            targetId: target.id,
            targetName: target.name,
            protectedByGuard: false,
            canSave: !witch.used.witchSave,
            canPoison: false,
            separatePopup: true
        });
    }

    io.emit("witchSaveWindow", {
        active: true,
        seconds: TIME.witchSave,
        endsAt: room.timerEndsAt
    });

    sendAdminState();
}
`;

rx(
    /function startWitchSaveAction\(\) \{[\s\S]*?\n\}\n\n\n\/\* =========================================================\n   FINISH WITCH ACTION/,
    `${witchSave}\n\n/* =========================================================\n   FINISH WITCH ACTION`,
    "old Witch save"
);

req(
    `    room.night.witchActionResolved =
        true;

    const deaths = [];`,
    `    room.night.witchActionResolved =
        true;

    io.emit("witchSaveWindow", { active: false });

    const deaths = [];`,
    "close Witch popup at 0"
);

req(
    `    room.phase =
        "daySpeech";`,
    `    room.phase =
        "daySpeech";

    io.emit("coupleHearts", { active: false });`,
    "stop hearts at day"
);

// Main roles cannot act in the final 10 seconds.
source = source.replaceAll(
    `room.phase !== "night" ||\n                    room.night?.witchActionOpen`,
    `room.phase !== "night" ||\n                    !room.night?.mainActionsOpen`
);
source = source.replaceAll(
    `room.phase !== "night" ||\n                    room.night?.witchActionOpen ||`,
    `room.phase !== "night" ||\n                    !room.night?.mainActionsOpen ||`
);
source = source.replaceAll(
    `player.alive &&\n        !room.night?.witchActionOpen`,
    `player.alive &&\n        room.night?.mainActionsOpen === true`
);
source = source.replaceAll(
    `player.seerUsedNight !== true &&\n            !room.night?.witchActionOpen`,
    `player.seerUsedNight !== true &&\n            room.night?.mainActionsOpen === true`
);

// ------------------------------------------------------------------
// Select / unselect / change: Wolf, Guard, Witch Poison, Day Vote.
// Seer remains one tap = inspect immediately = locked for that night.
// ------------------------------------------------------------------
req(
    `                room.night.wolfVotes.set(
                    wolf.id,
                    target.id
                );

                room.night.wolfTargetId =
                    calculateWolfTarget()?.id ||
                    null;

                socket.emit(
                    "actionAccepted",
                    {

                        type:
                            "wolfVote",

                        targetId:
                            target.id

                    }
                );`,
    `                const wolfCleared = room.night.wolfVotes.get(wolf.id) === target.id;

                if (wolfCleared) room.night.wolfVotes.delete(wolf.id);
                else room.night.wolfVotes.set(wolf.id, target.id);

                room.night.wolfTargetId = calculateWolfTarget()?.id || null;

                socket.emit("actionAccepted", {
                    type: wolfCleared ? "wolfVoteCleared" : "wolfVote",
                    targetId: wolfCleared ? null : target.id
                });`,
    "Wolf toggle"
);

req(
    `                room.night.guardTargetId =
                    target.id;

                socket.emit(
                    "actionAccepted",
                    {

                        type:
                            "guard",

                        targetId:
                            target.id

                    }
                );

                socket.emit(
                    "guardProtectSuccess",
                    {

                        targetId:
                            target.id,

                        targetName:
                            target.name,

                        message:
                            \`🛡️ Bạn đã bảo vệ \${target.name} đêm này.\`

                    }
                );`,
    `                const guardCleared = room.night.guardTargetId === target.id;
                room.night.guardTargetId = guardCleared ? null : target.id;

                socket.emit("actionAccepted", {
                    type: guardCleared ? "guardCleared" : "guard",
                    targetId: guardCleared ? null : target.id
                });

                socket.emit("guardProtectSuccess", {
                    targetId: guardCleared ? null : target.id,
                    targetName: guardCleared ? null : target.name,
                    message: guardCleared
                        ? "🛡️ Đã bỏ chọn bảo vệ đêm này."
                        : \`🛡️ Bạn đã chọn bảo vệ \${target.name} đêm này.\`
                });`,
    "Guard toggle"
);

req(
    `                room.night.witchPoisonDraftTargetId =
                    target.id;

                socket.emit(
                    "actionAccepted",
                    {
                        type:
                            "witchPoisonDraft",

                        targetId:
                            target.id,

                        targetName:
                            target.name
                    }
                );`,
    `                if (target.id === witch.id) {
                    socket.emit("actionError", {
                        message: "☠️ Phù thủy không được tự đầu độc chính mình."
                    });
                    return;
                }

                if (room.night.witchPoisonDraftTargetId === target.id) {
                    room.night.witchPoisonDraftTargetId = null;
                    socket.emit("actionAccepted", {
                        type: "witchPoisonCleared",
                        targetId: null
                    });
                    addAdminLog(\`Phù thủy \${witch.name} bỏ chọn mục tiêu độc.\`);
                    sendAdminState();
                    return;
                }

                room.night.witchPoisonDraftTargetId = target.id;

                socket.emit("actionAccepted", {
                    type: "witchPoisonDraft",
                    targetId: target.id,
                    targetName: target.name
                });`,
    "Witch poison no-self + toggle"
);

const cupidHandler = `        socket.on(
            "cupidPair",
            data => {
                if (
                    room.phase !== "night" ||
                    room.nightNumber !== 1 ||
                    !room.night?.mainActionsOpen
                ) return;

                if (!room.night?.cupidPairEndsAt || Date.now() > room.night.cupidPairEndsAt) {
                    socket.emit("actionError", {
                        message: "Cupid chỉ được chọn Couple trong 15 giây đầu của Đêm 1."
                    });
                    return;
                }

                const cupid = findPlayer(socket.data.playerId);
                if (!cupid || !cupid.alive || cupid.role !== "Cupid") return;
                if (room.night.cupidPairs.length) return;

                let draft = [...(room.night.cupidDraftIds || [])];

                if (data?.clear === true) {
                    draft = [];
                } else if (data?.targetId) {
                    const target = findPlayer(data.targetId);
                    if (!target?.alive) return;
                    if (draft.includes(target.id)) draft = draft.filter(id => id !== target.id);
                    else if (draft.length < 2) draft.push(target.id);
                    else draft = [draft[0], target.id];
                } else if (data?.firstId || data?.secondId) {
                    const ids = [data?.firstId, data?.secondId]
                        .filter(Boolean)
                        .filter((id, i, arr) => arr.indexOf(id) === i)
                        .slice(0, 2);
                    draft = ids.map(findPlayer).filter(p => p?.alive).map(p => p.id);
                }

                room.night.cupidDraftIds = draft;

                socket.emit("cupidDraftState", {
                    ids: [...draft],
                    players: draft.map(id => ({ id, name: findPlayer(id)?.name || null })),
                    locked: false,
                    endsAt: room.night.cupidPairEndsAt
                });
                socket.emit("actionAccepted", { type: "cupidDraft", ids: [...draft] });

                addAdminLog(
                    draft.length
                        ? \`Cupid \${cupid.name} đang chọn: \${draft.map(id => findPlayer(id)?.name).filter(Boolean).join(" ❤️ ")}\`
                        : \`Cupid \${cupid.name} đã bỏ chọn Couple.\`
                );
                sendAdminState();
            }
        );`;

rx(
    /        socket\.on\(\n            "cupidPair",[\s\S]*?\n        \);\n\n\n        \/\* =====================================================\n           🏹 HUNTER SHOOT/,
    `${cupidHandler}\n\n\n        /* =====================================================\n           🏹 HUNTER SHOOT`,
    "Cupid handler"
);

const dayVoteHandler = `        socket.on(
            "dayVote",
            data => {
                if (room.phase !== "dayVote") return;

                const voter = findPlayer(socket.data.playerId);
                if (!voter || !voter.alive) return;

                if (data?.clear === true || data?.targetId == null) {
                    room.dayVotes.delete(voter.id);
                    voter.dayVoteTargetId = null;
                    socket.emit("dayVoteAccepted", { targetId: null, cleared: true });
                    sendDayVoteState();
                    addAdminLog(\`\${voter.name} hủy vote.\`);
                    sendAdminState();
                    return;
                }

                const target = findPlayer(data.targetId);
                if (!target || !target.alive || voter.id === target.id) {
                    socket.emit("actionError", { message: "Vote không hợp lệ." });
                    return;
                }

                const cleared = room.dayVotes.get(voter.id) === target.id;
                if (cleared) {
                    room.dayVotes.delete(voter.id);
                    voter.dayVoteTargetId = null;
                } else {
                    room.dayVotes.set(voter.id, target.id);
                    voter.dayVoteTargetId = target.id;
                }

                socket.emit("dayVoteAccepted", {
                    targetId: cleared ? null : target.id,
                    cleared
                });
                sendDayVoteState();
                addAdminLog(cleared
                    ? \`\${voter.name} hủy vote \${target.name}.\`
                    : \`\${voter.name} vote \${target.name}.\`);
                sendAdminState();
            }
        );`;

rx(
    /        socket\.on\(\n            "dayVote",[\s\S]*?\n        \);\n\n\n        \/\* =====================================================\n           💬 CHAT/,
    `${dayVoteHandler}\n\n\n        /* =====================================================\n           💬 CHAT`,
    "Day vote handler"
);

req(
    `                socket.emit(
                    "seerResult",
                    {

                        targetName:
                            target.name,

                        result

                    }
                );`,
    `                socket.emit("seerResult", {
                    targetId: target.id,
                    targetName: target.name,
                    result,
                    locked: true
                });
                socket.emit("roleActionState", {
                    role: "Tiên tri",
                    active: false,
                    reason: "used"
                });`,
    "Seer immediate lock"
);

// ------------------------------------------------------------------
// Test Bot observer refresh + keep Test Bot ON after a test round.
// ------------------------------------------------------------------
req(
    `    if (typeof sendDayVoteState === "function") sendDayVoteState();
    if (typeof broadcastPlayers === "function") broadcastPlayers();
}`,
    `    if (typeof sendDayVoteState === "function") sendDayVoteState();
    if (typeof broadcastPlayers === "function") broadcastPlayers();
    sendTestObserverState();
}`,
    "Bot day observer refresh"
);

// Bot night already uses the real rule fields. Refresh Host after each pass.
req(
    `        }
    }
}

function runTestBotDayVote() {`,
    `        }
    }

    sendTestObserverState();
}

function runTestBotDayVote() {`,
    "Bot night observer refresh"
);

// Replace the old reset block that disabled Test Mode.
req(
    `    if (room.testMode) {
        room.players = room.players.filter(p => !p.isBot);
        room.testMode = false;
        room.testHumanId = null;
        room.testRoleAssignments = {};
        room.testBotWolfNight = null;
        room.testBotWolfTargetId = null;
    }`,
    `    const keepTestMode = room.testMode === true;
    const savedTestConfig = room.testConfig
        ? {
            count: room.testConfig.count,
            roleAssignments: { ...(room.testConfig.roleAssignments || {}) }
        }
        : null;

    if (keepTestMode) {
        room.players = room.players.filter(p => !p.isBot);
    }`,
    "reset keep Test Bot"
);

req(
    `    chooseHost();

    room.targetPlayerCount =
        room.players.length;`,
    `    chooseHost();

    room.testMode = keepTestMode;
    room.testConfig = keepTestMode ? savedTestConfig : null;
    room.testHumanId = keepTestMode ? room.hostId : null;
    room.testRoleAssignments = keepTestMode
        ? { ...(savedTestConfig?.roleAssignments || {}) }
        : {};
    room.testBotWolfNight = null;
    room.testBotWolfTargetId = null;

    room.targetPlayerCount =
        keepTestMode && savedTestConfig?.count
            ? savedTestConfig.count
            : room.players.length;`,
    "reset restore Test Bot config"
);

req(
    `            room.testRoleAssignments = cleanAssignments;
            room.testBotWolfNight = null;`,
    `            room.testRoleAssignments = cleanAssignments;
            room.testConfig = {
                count,
                roleAssignments: { ...cleanAssignments }
            };
            room.testBotWolfNight = null;`,
    "save Test config"
);

req(
    `            socket.emit("testRoleMap", {
                count,
                humanCount: humans.length,
                botCount: botsNeeded,
                players: room.players.map(p => ({ id: p.id, name: p.name, role: p.role, isBot: !!p.isBot }))
            });`,
    `            socket.emit("testRoleMap", {
                count,
                humanCount: humans.length,
                botCount: botsNeeded,
                showAllRoles: true,
                players: room.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    role: p.role,
                    isBot: !!p.isBot,
                    alive: p.alive,
                    connected: p.connected
                }))
            });
            sendTestObserverState();`,
    "Host gets all test roles"
);

const stopTest = `        socket.on("stopTestGame", () => {
            const player = findPlayer(socket.data.playerId);
            if (!player || player.id !== room.hostId) {
                socket.emit("actionError", { message: "Chỉ Host mới được dừng ván Test Bot." });
                return;
            }

            io.emit("testStopped", {
                message: "Host đã dừng ván test. Bot cũ đã được xóa; TEST BOT vẫn bật."
            });
            room.testMode = true;
            resetRoom("HOST STOP CURRENT TEST ROUND");
            addAdminLog("TEST ROUND stopped by host " + player.name + "; Test Bot remains enabled.");
        });

        socket.on("setTestBotEnabled", data => {
            const player = findPlayer(socket.data.playerId);
            if (!player || player.id !== room.hostId || room.started) {
                socket.emit("actionError", {
                    message: room.started
                        ? "Chỉ có thể bật/tắt TEST BOT ở Lobby."
                        : "Chỉ Host mới được bật/tắt TEST BOT."
                });
                return;
            }

            const enabled = data?.enabled === true;
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
            sendAdminState();
        });`;

rx(
    /        socket\.on\("stopTestGame", \(\) => \{[\s\S]*?\n        \}\);\n\n\n\n        \/\* =====================================================\n           ADMIN LOGIN/,
    `${stopTest}\n\n\n        /* =====================================================\n           ADMIN LOGIN`,
    "stop Test handler"
);

// ------------------------------------------------------------------
// Couple hearts restore after reconnect during Night 1.
// ------------------------------------------------------------------
req(
    `                                socket.emit("loverLinked", {
                                    loverId: reconnectLover.id,
                                    loverName: reconnectLover.name,
                                    loverRole: reconnectLover.role
                                });`,
    `                                socket.emit("loverLinked", {
                                    loverId: reconnectLover.id,
                                    loverName: reconnectLover.name,
                                    loverRole: reconnectLover.role,
                                    hearts:
                                        room.phase === "night" &&
                                        room.nightNumber === 1 &&
                                        reconnectPlayer.alive &&
                                        reconnectLover.alive,
                                    heartsUntil:
                                        room.phase === "night" && room.nightNumber === 1
                                            ? room.timerEndsAt
                                            : null
                                });

                                if (
                                    room.phase === "night" &&
                                    room.nightNumber === 1 &&
                                    reconnectPlayer.alive &&
                                    reconnectLover.alive
                                ) {
                                    socket.emit("coupleHearts", {
                                        active: true,
                                        nightNumber: 1,
                                        until: room.timerEndsAt
                                    });
                                }`,
    "reconnect hearts"
);

// Intro uses night.mp3; reconnect during discussion must not replay day.mp3.
source = source.replace(
    `} else if (\n    room.phase === "intro"\n) {\n\n    musicKey = "intro";`,
    `} else if (\n    room.phase === "intro"\n) {\n\n    musicKey = "night";`
);
source = source.replace(
    `} else if (\n    room.phase === "daySpeech"\n) {\n\n    musicKey = "daySpeech";\n}`,
    `} else if (\n    room.phase === "daySpeech"\n) {\n\n    musicKey = "";\n}`
);

// Daily reset clears the Test toggle/config and intro state.
req(
    `    room.totalNightsPlayed = 0;
    room.testMode = false;`,
    `    room.totalNightsPlayed = 0;
    room.introCompleted = false;
    room.testConfig = null;
    room.testMode = false;`,
    "daily reset final state"
);

source = source.replaceAll("WITCH - POISON: FIRST 50s OF NIGHT", "WITCH - POISON: 60 -> 11 (FIRST 50s OF NIGHT)");
source = source.replaceAll("WITCH - SAVE 10s AFTER WOLF LOCKS AT 50s", "WITCH - SAVE: FINAL 10s OF SAME 60s NIGHT");
source = source.replaceAll("☠️ WITCH POISON - DRAFT, CAN CHANGE FOR 45s", "☠️ WITCH POISON - SELECT / UNSELECT / CHANGE UNTIL 10s REMAIN");

const banner = `// ============================================================
// MA SÓI ONLINE — UNIFIED SERVER
${FINAL_MARKER}
// Final rules embedded in this same file. No V14/V15 duplicate.
// ============================================================
\n`;

source = banner + source;
validateFinal(source);
fs.writeFileSync(OUT_PATH, source, "utf8");

console.log(`[FINALIZE] wrote ${path.basename(OUT_PATH)} (${Buffer.byteLength(source)} bytes)`);
console.log("[FINALIZE] night 60 total / main 50 / save last 10; day 90/120/150/180");
console.log("[FINALIZE] toggle selections; Seer one-tap; Couple hearts Night 1; Test Host observer enabled");
