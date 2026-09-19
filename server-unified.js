// ============================================================
// MA SÓI ONLINE — UNIFIED SERVER
// FINAL RULESET 2026-09-13
// Final rules embedded in this same file. No V14/V15 duplicate.
// ============================================================

function __frontendOwnsMusic() {}
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

/* =========================================================
   CONFIG
========================================================= */

const PORT = process.env.PORT || 3000;

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD || "YeuVee";

const FRONTEND_URL =
    process.env.FRONTEND_URL || "*";

const MIN_PLAYERS = 6;
const MAX_PLAYERS = 15;

const ALLOWED_SIZES = Array.from(
    { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
    (_, i) => i + MIN_PLAYERS
);

const TIME = {
    night: 60,
    mainNightAction: 40,
    cupidPair: 15,
    witchPoison: 40,
    witchSave: 10,
    hunterShoot: 10,
    daySpeech: 180,
    dayVote: 30
};


/* =========================================================
   AUDIO - STATIC FILES ONLY
   Hệ scan audio cũ đã bỏ. Server chỉ serve file trong /audio
   và dùng SERVER_AUDIO_LIBRARY ở phần MUSIC bên dưới.
========================================================= */

const AUDIO_DIR = path.join(__dirname, "audio");

function ensureAudioDir() {
    if (!fs.existsSync(AUDIO_DIR)) {
        fs.mkdirSync(AUDIO_DIR, { recursive: true });
    }
}

/* =========================================================
   HTTP SERVER
========================================================= */

const server = http.createServer((req, res) => {
    const rawUrl = String(req.url || "/");

    if (rawUrl.startsWith("/audio/")) {
        try {
            ensureAudioDir();
            const encodedName = rawUrl.slice("/audio/".length).split("?")[0];
            const fileName = path.basename(decodeURIComponent(encodedName));
            const filePath = path.join(AUDIO_DIR, fileName);
            if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
                res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" });
                return res.end("Audio not found");
            }
            const ext = path.extname(fileName).toLowerCase();
            const mime = {
                ".mp3": "audio/mpeg",
                ".wav": "audio/wav",
                ".ogg": "audio/ogg",
                ".m4a": "audio/mp4",
                ".aac": "audio/aac"
            }[ext] || "application/octet-stream";
            const stat = fs.statSync(filePath);
            const range = req.headers.range;
            const commonHeaders = {
                "Content-Type": mime,
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*",
                "Accept-Ranges": "bytes"
            };

            if (range) {
                const match = /bytes=(\d*)-(\d*)/.exec(range);
                const start = match && match[1] ? Number(match[1]) : 0;
                const end = match && match[2] ? Number(match[2]) : stat.size - 1;
                if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= stat.size || start > end) {
                    res.writeHead(416, { ...commonHeaders, "Content-Range": `bytes */${stat.size}` });
                    return res.end();
                }
                res.writeHead(206, {
                    ...commonHeaders,
                    "Content-Range": `bytes ${start}-${end}/${stat.size}`,
                    "Content-Length": end - start + 1
                });
                if (req.method === "HEAD") return res.end();
                return fs.createReadStream(filePath, { start, end }).pipe(res);
            }

            res.writeHead(200, { ...commonHeaders, "Content-Length": stat.size });
            if (req.method === "HEAD") return res.end();
            return fs.createReadStream(filePath).pipe(res);
        } catch (err) {
            res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" });
            return res.end("Audio server error");
        }
    }

    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" });
    res.end("🐺 Ma Sói Online Unified Server OK");
});


/* =========================================================
   SOCKET.IO
========================================================= */

const io = new Server(
    server,
    {
        cors: {
            origin:
                FRONTEND_URL === "*"
                    ? true
                    : FRONTEND_URL,

            methods: [
                "GET",
                "POST"
            ]
        }
    }
);


/* =========================================================
   ROOM
========================================================= */

const room = {

    id: "MAIN",

    players: [],

    hostId: null,

    started: false,

    phase: "lobby",

    targetPlayerCount: 6,

    nightNumber: 0,

    roleComposition: [],

    timerEndsAt: null,

    timerToken: 0,

    timerInterval: null,

    witchPoisonTimeout: null,

    nightLockTimeout: null,

    introTimeout: null,

    introCompleted: false,

    testConfig: null,

    night: null,

    dayVotes: new Map(),

    pendingHunter: null,

    pendingNightDeaths: [],

    logs: [],

    adminLogs: [],

    chatHistory: [],
    eventHistory: [],
    historySeq: 0,

    gameInitialPlayerCount: 0,
    exitedDeviceIds: new Set(),

    totalPlayedMs: 0,
    gameStartedAt: null,
    totalNightsPlayed: 0

};


/* =========================================================
   ROLE COMPOSITION
========================================================= */

function getRoleComposition(count) {

    if (count === 6) {

        return [
            "Sói",
            "Sói",
            "Tiên tri",
            "Bảo vệ",
            "Dân",
            "Dân"
        ];

    }

    if (count === 7) {

        return [
            "Sói",
            "Sói",
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Dân",
            "Dân"
        ];

    }

    if (count === 8) {

        return [
            "Sói",
            "Sói",
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn",
            "Dân",
            "Dân"
        ];

    }

    if (count === 9) {

        return [
            "Sói",
            "Sói",
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn",
            "Dân",
            "Dân",
            "Dân"
        ];

    }

    if (count >= 10 && count <= 12) {

        const roles = [
            "Sói",
            "Sói",
            "Sói",
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn",
            "Cupid"
        ];

        while (
            roles.length < count
        ) {

            roles.push("Dân");

        }

        return roles;
    }

    if (count >= 13 && count <= 15) {

        const roles = [
            "Sói",
            "Sói",
            "Sói",
            "Sói",
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn",
            "Cupid"
        ];

        while (
            roles.length < count
        ) {

            roles.push("Dân");

        }

        return roles;
    }

    return [];
}


/* =========================================================
   PLAYER HELPERS
========================================================= */

function findPlayer(id) {

    return room.players.find(
        p => p.id === id
    );

}


function findPlayerByDeviceId(deviceId) {

    if (!deviceId) {
        return null;
    }

    return room.players.find(
        p =>
            p.deviceId === deviceId
    ) || null;

}


function alivePlayers() {

    return room.players.filter(
        p => p.alive
    );

}


function aliveWolves() {

    return room.players.filter(
        p =>
            p.alive &&
            p.role === "Sói"
    );

}


function connectedPlayers() {

    return room.players.filter(
        p => p.connected
    );

}

function daySpeechSecondsForAlive(count = alivePlayers().length) {
    if (count <= 6) return 90;
    if (count <= 8) return 120;
    if (count <= 10) return 150;
    return 180;
}

function historyRecipientDeviceIds(recipients) {
    return [...new Set((recipients || []).map(p => p?.deviceId).filter(Boolean))];
}

function nextHistoryId(prefix) {
    room.historySeq = (room.historySeq || 0) + 1;
    return `${prefix}-${Date.now()}-${room.historySeq}`;
}

function storeChatHistory(payload, recipients) {
    const item = {
        ...payload,
        historyId: nextHistoryId("chat"),
        time: Date.now(),
        visibleToDeviceIds: historyRecipientDeviceIds(recipients)
    };
    room.chatHistory.push(item);
    if (room.chatHistory.length > 1000) room.chatHistory.shift();
    return item;
}

function storeEventHistory(text, recipients = room.players, kind = "event") {
    if (!text) return null;
    const item = {
        historyId: nextHistoryId("event"),
        kind,
        text,
        time: Date.now(),
        visibleToDeviceIds: historyRecipientDeviceIds(recipients)
    };
    room.eventHistory.push(item);
    if (room.eventHistory.length > 1000) room.eventHistory.shift();
    return item;
}

function sendHistoryToPlayer(socket, player) {
    const deviceId = player?.deviceId;
    if (!deviceId) return;
    const clean = item => {
        const { visibleToDeviceIds, ...rest } = item;
        return rest;
    };
    socket.emit("historySync", {
        chats: room.chatHistory
            .filter(item => item.visibleToDeviceIds?.includes(deviceId))
            .map(clean),
        events: room.eventHistory
            .filter(item => item.visibleToDeviceIds?.includes(deviceId))
            .map(clean)
    });
}


/* =========================================================
   LOG
========================================================= */

function addLog(text) {

    room.logs.push({
        text,
        time: Date.now()
    });

    if (
        room.logs.length > 300
    ) {

        room.logs.shift();

    }

}


function addAdminLog(text) {

    room.adminLogs.push({
        text,
        time: Date.now()
    });

    if (
        room.adminLogs.length > 500
    ) {

        room.adminLogs.shift();

    }

}

function getTotalPlayedMs() {
    return room.totalPlayedMs +
        (room.gameStartedAt ? Math.max(0, Date.now() - room.gameStartedAt) : 0);
}

function stopGamePlayClock() {
    if (!room.gameStartedAt) return;
    room.totalPlayedMs = getTotalPlayedMs();
    room.gameStartedAt = null;
}



/* =========================================================
   MUSIC
========================================================= */


/* =========================================================
   AUDIO CATALOG
   ---------------------------------------------------------
   Audio nằm trực tiếp trên backend/server.
   Muốn thêm bài mới:
   1) chép file vào thư mục audio/ cạnh server.js
   2) thêm 1 dòng vào SERVER_AUDIO_LIBRARY bên dưới
   Admin chỉ chọn bài cho từng nhân vật / giai đoạn.
========================================================= */

const NETLIFY_AUDIO_BASE =
    "https://masoi15.netlify.app/audio/";

const SERVER_AUDIO_LIBRARY = [
    { file: "lobby.mp3", name: "Lobby" },
    { file: "day.mp3", name: "Day" },
    { file: "night.mp3", name: "Night" },
    { file: "dayVote.mp3", name: "dayVote" },
    { file: "bow.mp3", name: "bow" },
    { file: "wedding.mp3", name: "wedding" }
];

const AUDIO_CONFIG = {
    phase: {
        lobby: "file:lobby.mp3",

        night: "file:night.mp3",
        witchPoison: "file:night.mp3",
        witchSave: "file:night.mp3",

        daySpeech: "file:day.mp3",
        dayVote: "file:dayVote.mp3"
    },

    sfx: {},

    musicVolume: 0.6,
    sfxVolume: 1
};

   
function currentAudioLibrary() {

    return SERVER_AUDIO_LIBRARY.map(item => ({

        id: `file:${item.file}`,

        name:
            item.name ||
            item.file,

        src:
            NETLIFY_AUDIO_BASE +
            encodeURIComponent(item.file)

    }));
}


function findAudioItem(list, id) {
    return (list || []).find(item => item.id === id) || null;
}

function publicAudioConfig() {
    const library = currentAudioLibrary();
    const valid = new Set(library.map(x => x.id));
    for (const key of Object.keys(AUDIO_CONFIG.phase)) {
        if (AUDIO_CONFIG.phase[key] && !valid.has(AUDIO_CONFIG.phase[key])) AUDIO_CONFIG.phase[key] = "";
    }
    for (const key of Object.keys(AUDIO_CONFIG.sfx)) {
        if (AUDIO_CONFIG.sfx[key] && !valid.has(AUDIO_CONFIG.sfx[key])) AUDIO_CONFIG.sfx[key] = "";
    }
    return {
        library,
        musicLibrary: library,
        sfxLibrary: library,
        phase: { ...AUDIO_CONFIG.phase },
        sfx: { ...AUDIO_CONFIG.sfx },
        musicVolume: AUDIO_CONFIG.musicVolume,
        sfxVolume: AUDIO_CONFIG.sfxVolume
    };
}

function emitAudioConfig(target = null) {
    const payload = publicAudioConfig();
    if (target) io.to(target).emit("audioConfigChanged", payload);
    else io.emit("audioConfigChanged", payload);
}



function emitMusic(key, target = null) {

    const library =
        currentAudioLibrary();

    const trackId =
        AUDIO_CONFIG.phase[key];

    const track =
        findAudioItem(
            library,
            trackId
        );

    if (!track || !track.src) {
        return;
    }

    const payload = {

        key,

        trackId,

        name:
            track.name,

        src:
            track.src,

        loop:
            !(
                key === "daySpeech" ||
                key === "dayVote"
            ),

        volume:
            AUDIO_CONFIG.musicVolume
    };

    if (target) {

        io.to(target).emit(
            "musicChange",
            payload
        );

    } else {

        io.emit(
            "musicChange",
            payload
        );
    }
}

/* =========================================================
   PUBLIC PLAYERS
========================================================= */

function publicPlayers(
    includeRoles = false
) {

    return room.players.map(
        p => {

            const result = {

                id: p.id,

                name: p.name,

                connected:
                    p.connected,

                ready:
                    p.ready,

                alive:
                    p.alive,

                role:
                    includeRoles
                        ? p.role
                        : undefined,

                loverId:
                    p.alive
                        ? p.loverId
                        : null,

                deathReasons:
                    p.alive
                        ? []
                        : p.deathReasons,

                dayVoteTargetId:
                    p.dayVoteTargetId,

                isBot:
                    !!p.isBot

            };

            return result;

        }
    );

}


/* =========================================================
   ROOM STATE
========================================================= */

function emitRoom() {

    io.emit(
        "roomState",
        {

            room: {

                id:
                    room.id,

                started:
                    room.started,

                phase:
                    room.phase,

                nightNumber:
                    room.nightNumber,

                targetPlayerCount:
                    room.targetPlayerCount,

                minPlayers:
                    MIN_PLAYERS,

                maxPlayers:
                    MAX_PLAYERS,

                hostId:
                    room.hostId,

                roleComposition:
                    room.started
                        ? [...room.roleComposition]
                        : getRoleComposition(room.players.length),

                testMode:
                    room.testMode === true

            },

            players:
                publicPlayers(false)

        }
    );

}


/* =========================================================
   TEST OBSERVER STATE - HOST ONLY
========================================================= */
function sendTestObserverState() {
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

/* =========================================================
   ADMIN STATE
========================================================= */

function getWolfVoteStateForAdmin() {

    const votes = [];

    if (!room.night) {
        return votes;
    }

    const counts =
        new Map();

    for (
        const [
            wolfId,
            targetId
        ]
        of room.night.wolfVotes
    ) {

        const wolf =
            findPlayer(wolfId);

        const target =
            findPlayer(targetId);

        if (
            !wolf ||
            !wolf.alive ||
            wolf.role !== "Sói"
        ) {
            continue;
        }

        if (
            !target ||
            !target.alive ||
            target.role === "Sói"
        ) {
            continue;
        }

        counts.set(
            targetId,
            (counts.get(targetId) || 0) + 1
        );

    }

    for (
        const [
            targetId,
            count
        ]
        of counts
    ) {

        const target =
            findPlayer(targetId);

        if (!target) {
            continue;
        }

        votes.push({

            targetId,

            targetName:
                target.name,

            count

        });

    }

    return votes;
}


function sendAdminState() {

    for (
        const [
            socketId,
            socket
        ]
        of io.sockets.sockets
    ) {

        if (
            !socket.data.isAdmin
        ) {
            continue;
        }

        socket.emit(
            "adminState",
            {

                room: {

                    id:
                        room.id,

                    started:
                        room.started,

                    phase:
                        room.phase,

                    nightNumber:
                        room.nightNumber,

                    targetPlayerCount:
                        room.targetPlayerCount,

                    hostId:
                        room.hostId,

                    timerEndsAt:
                        room.timerEndsAt

                },

                stats: {
                    totalPlayedMs: getTotalPlayedMs(),
                    totalNightsPlayed: room.totalNightsPlayed,
                    playerCount: room.players.length
                },

                players:
                    publicPlayers(true),

                wolfVotes:
                    getWolfVoteStateForAdmin(),

                dayVotes:
                    Array.from(
                        room.dayVotes.entries()
                    ).map(
                        ([voterId, targetId]) => ({

                            voterId,

                            targetId

                        })
                    ),

                pendingHunter:
                    room.pendingHunter,

                logs:
                    room.logs.slice(-100),

                adminLogs:
                    room.adminLogs.slice(-200),

                audioConfig:
                    publicAudioConfig()

            }
        );

    }

    sendTestObserverState();

}


/* =========================================================
   TIMER
========================================================= */

function stopTimer() {

    room.timerToken++;

    if (
        room.timerInterval
    ) {

        clearInterval(
            room.timerInterval
        );

        room.timerInterval =
            null;

    }

    room.timerEndsAt =
        null;

    if (
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

}


function startTimer(
    seconds,
    callback
) {

    stopTimer();

    const token =
        room.timerToken;

    room.timerEndsAt =
        Date.now() +
        seconds * 1000;

    io.emit(
        "phaseTimer",
        {

            remaining:
                seconds,

            phase:
                room.phase,

            endsAt:
                room.timerEndsAt

        }
    );

    room.timerInterval =
        setInterval(
            () => {

                if (
                    token !==
                    room.timerToken
                ) {

                    clearInterval(
                        room.timerInterval
                    );

                    return;

                }

                const remaining =
                    Math.max(
                        0,
                        Math.ceil(
                            (
                                room.timerEndsAt -
                                Date.now()
                            ) / 1000
                        )
                    );

                io.emit(
                    "phaseTimer",
                    {

                        remaining,

                        phase:
                            room.phase,

                        endsAt:
                            room.timerEndsAt

                    }
                );

                if (
                    remaining <= 0
                ) {

                    clearInterval(
                        room.timerInterval
                    );

                    room.timerInterval =
                        null;

                    callback();

                }

            },
            1000
        );

}


/* =========================================================
   CHOOSE HOST
========================================================= */

function chooseHost() {

    room.hostId =
        room.players.find(
            p =>
                p.connected
        )?.id ||
        null;

}


/* =========================================================
   RESET NIGHT
========================================================= */

function resetNight(
    previousGuardTargetId = null
) {

    room.night = {

        mainActionsOpen: true,

        mainActionEndsAt: null,

        cupidPairEndsAt: null,

        cupidDraftIds: [],

        wolfVotes:
            new Map(),

        wolfTargetId:
            null,

        guardTargetId:
            null,

        previousGuardTargetId,

        witchSave:
            false,

        witchPoisonTargetId:
            null,

        witchPoisonDraftTargetId:
            null,

        witchPoisonWindowOpen:
            false,

        witchPoisonEndsAt:
            null,

        witchActionOpen:
            false,

        witchActionMode:
            null,

        witchActionResolved:
            false,

        seerInspections:
            [],

        cupidPairs:
            [],

        hunterShotTargetId:
            null

    };

}


/* =========================================================
   🐺 CALCULATE WOLF TARGET
========================================================= */

function calculateWolfTarget() {

    if (!room.night) {
        return null;
    }

    const counts =
        new Map();

    for (
        const [
            wolfId,
            targetId
        ]
        of room.night.wolfVotes
    ) {

        const wolf =
            findPlayer(wolfId);

        const target =
            findPlayer(targetId);

        if (
            !wolf ||
            !wolf.alive ||
            wolf.role !== "Sói"
        ) {
            continue;
        }

        if (
            !target ||
            !target.alive
        ) {
            continue;
        }

        if (
            target.role === "Sói"
        ) {
            continue;
        }

        counts.set(
            targetId,
            (counts.get(targetId) || 0) + 1
        );

    }

    if (
        counts.size === 0
    ) {

        return null;

    }

    let highest = 0;

    let leaders = [];

    for (
        const [
            targetId,
            count
        ]
        of counts
    ) {

        if (
            count > highest
        ) {

            highest =
                count;

            leaders = [
                targetId
            ];

        } else if (
            count === highest
        ) {

            leaders.push(
                targetId
            );

        }

    }

    /*
     * Hòa vote -> không cắn.
     */

    if (
        leaders.length !== 1
    ) {

        return null;

    }

    /*
     * Cắn chỉ thành công khi một mục tiêu nhận QUÁ 50% phiếu
     * của số Sói còn sống. 2 Sói cần 2 phiếu, 3 cần 2, 4 cần 3.
     */
    if (
        highest <= aliveWolves().length / 2
    ) {
        return null;
    }

    const target =
        findPlayer(
            leaders[0]
        );

    if (
        !target ||
        !target.alive ||
        target.role === "Sói"
    ) {

        return null;

    }

    return target;

}


/* =========================================================
   🐺 REALTIME WOLF VOTE STATE
========================================================= */

function sendWolfVoteState() {

    if (
        !room.night ||
        room.phase !== "night" ||
        !room.night.mainActionsOpen
    ) {

        return;

    }

    const counts =
        new Map();

    for (
        const [
            wolfId,
            targetId
        ]
        of room.night.wolfVotes
    ) {

        const wolf =
            findPlayer(wolfId);

        const target =
            findPlayer(targetId);

        if (
            !wolf ||
            !wolf.alive ||
            wolf.role !== "Sói"
        ) {

            continue;

        }

        if (
            !target ||
            !target.alive ||
            target.role === "Sói"
        ) {

            continue;

        }

        counts.set(
            targetId,
            (counts.get(targetId) || 0) + 1
        );

    }

    const votes = [];

    for (
        const [
            targetId,
            count
        ]
        of counts
    ) {

        const target =
            findPlayer(targetId);

        if (!target) {
            continue;
        }

        votes.push({

            targetId,

            targetName:
                target.name,

            count,

            icon:
                "🎯"

        });

    }

    const currentTarget =
        calculateWolfTarget();

    const payload = {

        votes,

        currentTargetId:
            currentTarget?.id ||
            null,

        currentTargetName:
            currentTarget?.name ||
            null

    };

    aliveWolves().forEach(
        wolf => {

            if (
                wolf.connected
            ) {

                io.to(
                    wolf.id
                ).emit(
                    "wolfVoteState",
                    payload
                );

            }

        }
    );

}


/* =========================================================
   🐺 WOLF TARGETS
========================================================= */

function sendWolfTargets() {

    const targets =
        alivePlayers()
            .filter(
                p =>
                    p.role !== "Sói"
            )
            .map(
                p => ({

                    id:
                        p.id,

                    name:
                        p.name,

                    alive:
                        p.alive

                })
            );

    aliveWolves().forEach(
        wolf => {

            if (
                !wolf.connected
            ) {

                return;
            }

            io.to(
                wolf.id
            ).emit(
                "wolfVoteTargets",
                {
                    players:
                        targets
                }
            );

        }
    );

}


/* =========================================================
   BROADCAST PLAYERS
========================================================= */

function broadcastPlayers() {

    io.emit(
        "playersUpdated",
        {
            players:
                publicPlayers(false)
        }
    );

}


/* =========================================================
   KILL PLAYER
========================================================= */

function killPlayer(
    player,
    reason
) {

    if (
        !player ||
        !player.alive
    ) {

        return [];

    }

    const deaths = [];

    function killOne(
        target,
        deathReason
    ) {

        if (
            !target ||
            !target.alive
        ) {

            return;

        }

        target.alive =
            false;

        target.ready =
            false;

        target.deathReasons.push(
            deathReason
        );

        deaths.push(
            target
        );

    }

    killOne(
        player,
        reason
    );

    /*
     * Lover chết theo.
     */

    if (
        player.loverId
    ) {

        const lover =
            findPlayer(
                player.loverId
            );

        if (
            lover &&
            lover.alive
        ) {

            killOne(
                lover,
                `${lover.name} đã chết Vì yêu ${player.name} quá nhiều`
            );

        }

    }

    return deaths;

}


/* =========================================================
   SEND DEAD EVENTS
========================================================= */

function sendDeaths(
    deaths,
    eventName = "dead"
) {

    for (
        const player
        of deaths
    ) {

        if (
            player.connected
        ) {

            io.to(
                player.id
            ).emit(
                eventName,
                {

                    reason:
                        player.deathReasons[
                            player.deathReasons.length - 1
                        ]

                }
            );

        }

    }

}


/* =========================================================
   HUNTER REVENGE - MANDATORY 15s
========================================================= */

function finishAfterHunter(context) {
    if (checkWinner()) return;

    if (context === "night") {
        const nightEndsAt = Number(room.night?.nightEndsAt || Date.now());
        const waitMs = Math.max(0, nightEndsAt - Date.now());
        setTimeout(() => {
            if (room.phase !== "night" || !room.night || room.pendingHunter) return;
            startDaySpeech(
                room.night?.witchSave === true,
                !!room.night?.witchPoisonTargetId
            );
        }, waitMs);
        return;
    }

    startNight();
}

function resolveHunterShot(target, auto = false) {
    const pending = room.pendingHunter;
    if (!pending) return false;

    const hunter = findPlayer(pending.id);
    if (
        !hunter ||
        !target ||
        !target.alive ||
        target.id === hunter.id ||
        (hunter.loverId && target.id === hunter.loverId)
    ) {
        return false;
    }

    stopTimer();

    const deaths = killPlayer(target, "Bị Thợ săn bắn");
    const context = pending.context || (room.phase === "night" ? "night" : "day");
    room.pendingHunter = null;

    if (room.night) room.night.hunterShotTargetId = target.id;
    if (context === "night") room.pendingNightDeaths.push(...deaths);

    const message = auto
        ? `🏹 Hết ${TIME.hunterShoot} giây — hệ thống random: ${hunter.name} bắn ${target.name}.`
        : `🏹 ${hunter.name} đã bắn ${target.name}.`;

    addAdminLog(message);
    storeEventHistory(message, room.players);

    io.emit("hunterShotResolved", {
        hunterId: hunter.id,
        hunterName: hunter.name,
        targetId: target.id,
        targetName: target.name,
        auto,
        message,
        sfx: NETLIFY_AUDIO_BASE + "bow.mp3"
    });

    sendDeaths(deaths, "dead");
    broadcastPlayers();
    sendAdminState();

    finishAfterHunter(context);
    return true;
}

function startHunterRevenge(hunter, context) {
    if (!hunter) return false;

    const targets = alivePlayers().filter(
        p => p.id !== hunter.id && p.id !== hunter.loverId
    );
    if (!targets.length) {
        finishAfterHunter(context);
        return false;
    }

    room.pendingHunter = {
        id: hunter.id,
        name: hunter.name,
        context
    };

    const publicTargets = targets.map(p => ({ id: p.id, name: p.name }));

    io.emit("hunterRevengeStarted", {
        hunterId: hunter.id,
        hunterName: hunter.name,
        seconds: TIME.hunterShoot,
        message: "🏹 THỢ SĂN ĐANG TRẢ THÙ — đang chọn một người để bắn..."
    });

    if (hunter.connected) {
        io.to(hunter.id).emit("hunterActionRequired", {
            seconds: TIME.hunterShoot,
            players: publicTargets,
            mandatory: true
        });
    }

    addAdminLog(`Thợ săn ${hunter.name} có ${TIME.hunterShoot} giây để trả thù.`);

    startTimer(TIME.hunterShoot, () => {
        if (!room.pendingHunter || room.pendingHunter.id !== hunter.id) return;
        const candidates = alivePlayers().filter(
            p => p.id !== hunter.id && p.id !== hunter.loverId
        );
        if (!candidates.length) {
            room.pendingHunter = null;
            finishAfterHunter(context);
            return;
        }
        const randomTarget = candidates[Math.floor(Math.random() * candidates.length)];
        resolveHunterShot(randomTarget, true);
    });

    return true;
}

/* =========================================================
   FINAL DEATHS
========================================================= */

function finalDeaths(
    deaths,
    eventName,
    extra = {},
    callback = null
) {

    if (
        deaths.length
    ) {

        sendDeaths(
            deaths,
            "dead"
        );

    }

    broadcastPlayers();

    io.emit(
        eventName,
        {

            deaths:
                deaths.map(
                    p => ({

                        id:
                            p.id,

                        name:
                            p.name,

                        reason:
                            p.deathReasons[
                                p.deathReasons.length - 1
                            ]

                    })
                ),

            ...extra

        }
    );

    sendAdminState();

    if (callback) {
        callback();
    }

}


/* =========================================================
   AUTO RESET - LIVE OFFLINE / LEFT >= 50%
========================================================= */

function inactivePlayerCountForCurrentGame() {

    const inactiveKeys =
        new Set();

    for (
        const p
        of room.players
    ) {

        if (
            p.alive === true &&
            (
                p.connected === false ||
                p.leftGame === true
            )
        ) {

            inactiveKeys.add(
                p.deviceId || `id:${p.id}`
            );

        }

    }

    for (
        const key
        of room.exitedDeviceIds || []
    ) {

        inactiveKeys.add(key);

    }

    return inactiveKeys.size;
}

function shouldAutoResetForInactivePlayers() {

    if (!room.started) return false;

    const total =
        room.gameInitialPlayerCount ||
        room.targetPlayerCount ||
        room.players.length;

    if (total <= 0) return false;

    const inactive =
        inactivePlayerCountForCurrentGame();

    return inactive / total >= 0.5;
}

function autoResetForInactivePlayers() {

    if (!shouldAutoResetForInactivePlayers()) return false;

    const total =
        room.gameInitialPlayerCount ||
        room.targetPlayerCount ||
        room.players.length;

    const inactive =
        inactivePlayerCountForCurrentGame();

    const message =
        `♻️ Ván đã reset vì ${inactive}/${total} người còn sống bị mất kết nối, kick hoặc rời phòng.`;

    addLog(message);
    addAdminLog(`AUTO RESET: ${inactive}/${total} inactive (>= 50%).`);

    /*
     * Chỉ giữ người vẫn đang kết nối.
     * Người mất mạng / đã out sẽ không bị kéo trở lại lobby.
     */
    room.players =
        room.players.filter(
            p => p.connected === true && p.leftGame !== true
        );

    io.emit(
        "gameAutoReset",
        { message }
    );

    resetRoom(
        `AUTO RESET TO LOBBY: ${inactive}/${total} inactive.`
    );

    return true;
}

/* =========================================================
   WIN CHECK
========================================================= */

function checkWinner() {

    if (autoResetForInactivePlayers()) {
        return true;
    }

    const alive = alivePlayers();

    // Không còn ai sống => Hòa.
    if (alive.length === 0) {
        endGame("Hòa", "⚖️ Tất cả người chơi đã chết.");
        return true;
    }

    // Tìm Couple còn nguyên cả hai người sống.
    let livingCouple = null;
    for (const first of alive) {
        if (!first.loverId) continue;
        const second = alive.find(p => p.id === first.loverId);
        if (!second || second.loverId !== first.id) continue;
        livingCouple = [first, second];
        break;
    }

    // Chỉ còn đúng hai người và chính là Couple => Couple thắng.
    if (
        livingCouple &&
        alive.length === 2 &&
        livingCouple.every(p => alive.some(a => a.id === p.id))
    ) {
        const cupid = room.players.find(p => p.role === "Cupid");
        endGame(
            "Couple",
            cupid
                ? "💘 " + livingCouple[0].name + " và " + livingCouple[1].name + " chiến thắng cùng nhau - Cupid (" + cupid.name + ") đã se duyên."
                : "💘 " + livingCouple[0].name + " và " + livingCouple[1].name + " chiến thắng cùng nhau."
        );
        return true;
    }

    // Couple còn nguyên và vẫn còn người thứ ba trở lên:
    // KHÔNG xét Sói >= phe còn lại, KHÔNG xét Sói = 0.
    // Game phải tiếp tục cho tới khi Couple thắng hoặc Couple bị phá.
    if (livingCouple) {
        return false;
    }

    // Couple đã chết/bị phá => trở lại luật bình thường.
    const wolves = alive.filter(p => p.role === "Sói").length;
    const nonWolves = alive.length - wolves;

    if (wolves === 0) {
        endGame("Dân", "👨‍🌾 Phe Dân thắng!");
        return true;
    }

    if (wolves >= nonWolves) {
        endGame("Sói", "🐺 Phe Sói thắng!");
        return true;
    }

    return false;
}


/* =========================================================
   START GAME
========================================================= */

function startGame() {

    if (
        room.started
    ) {

        return {
            ok: false,
            message:
                "Game đang chạy."
        };

    }

    const count =
        room.players.length;

    if (
        !ALLOWED_SIZES.includes(
            count
        )
    ) {

        return {
            ok: false,
            message:
                `Số người phải từ ${MIN_PLAYERS} đến ${MAX_PLAYERS}.`
        };

    }

    const disconnected =
        room.players.filter(
            p =>
                !p.connected
        );

    if (
        disconnected.length
    ) {

        return {
            ok: false,
            message:
                "Có người đang mất kết nối."
        };

    }

    const notReady =
        room.players.filter(
            p =>
                p.id !== room.hostId &&
                !p.ready
        );

    if (
        notReady.length
    ) {

        return {
            ok: false,
            message:
                "Tất cả người chơi phải sẵn sàng."
        };

    }

    room.started =
        true;

    room.gameStartedAt =
        Date.now();

    room.phase =
        "intro";

    room.nightNumber =
        0;

    room.introCompleted =
        false;

    room.targetPlayerCount =
        count;

    room.gameInitialPlayerCount = count;

    room.gameInitialPlayerCount =
        count;

    room.exitedDeviceIds =
        new Set();

    room.roleComposition =
        getRoleComposition(
            count
        );

    const shuffledPlayers =
        [...room.players]
            .sort(
                () =>
                    Math.random() -
                    0.5
            );

    const shuffledRoles =
        [...room.roleComposition]
            .sort(
                () =>
                    Math.random() -
                    0.5
            );

    if (room.testMode && room.testRoleAssignments) {
        const assignments = Object.entries(room.testRoleAssignments)
            .filter(([playerId, role]) => !!findPlayer(playerId) && !!role);
        let fixedPos = 0;
        for (const [playerId, role] of assignments) {
            const playerIndex = shuffledPlayers.findIndex((p, i) => i >= fixedPos && p.id === playerId);
            const roleIndex = shuffledRoles.findIndex((r, i) => i >= fixedPos && r === role);
            if (playerIndex < 0 || roleIndex < 0) continue;
            [shuffledPlayers[fixedPos], shuffledPlayers[playerIndex]] = [shuffledPlayers[playerIndex], shuffledPlayers[fixedPos]];
            [shuffledRoles[fixedPos], shuffledRoles[roleIndex]] = [shuffledRoles[roleIndex], shuffledRoles[fixedPos]];
            fixedPos++;
        }
    }

    shuffledPlayers.forEach(
        (player, index) => {

            player.role =
                shuffledRoles[index];

            player.alive =
                true;

            player.leftGame =
                false;

            player.deathReasons =
                [];

            player.loverId =
                null;

            player.used = {

                witchSave:
                    false,

                witchPoison:
                    false

            };

            player.seerUsedNight =
                false;

            player.dayVoteTargetId =
                null;

        }
    );

    room.dayVotes =
        new Map();

    room.pendingHunter =
        null;

    room.pendingNightDeaths =
        [];

    room.logs =
        [];

    room.chatHistory =
        [];

    room.eventHistory =
        [];

    room.historySeq =
        0;

    addLog(
        "Game bắt đầu."
    );

    addAdminLog(
        `Game bắt đầu với ${count} người.`
    );

    /*
     * Gửi role riêng.
     */

    for (
        const player
        of room.players
    ) {

        if (
            !player.connected
        ) {

            continue;
        }

        io.to(
            player.id
        ).emit(
            "roleAssigned",
            {

                role:
                    player.role,

                isWolf:
                    player.role === "Sói"

            }
        );

    }

    emitRoom();

    sendAdminState();

    startNight();

    return {
        ok: true
    };

}


/* =========================================================
   CUPID AUTO PAIR - NIGHT 1, AFTER FIRST 15s
========================================================= */

function notifyCoupleLinked(first, second, auto = false) {
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

    storeEventHistory(`💘 Couple của bạn: ${second.name} (${second.role})`, [first]);
    storeEventHistory(`💘 Couple của bạn: ${first.name} (${first.role})`, [second]);
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
        ? `💘 Hết 15 giây — hệ thống tự ghép ${first.name} ❤️ ${second.name}.`
        : `💘 Hết 15 giây — chốt Couple: ${first.name} ❤️ ${second.name}.`;

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


/* =========================================================
   START NIGHT
========================================================= */

function startGameIntro() {
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
    room.night.nightEndsAt = now + TIME.night * 1000;
    room.night.mainActionEndsAt = now + TIME.mainNightAction * 1000;
    room.night.cupidPairEndsAt = room.nightNumber === 1
        ? now + TIME.cupidPair * 1000
        : null;

    addLog(`🌙 Đêm ${room.nightNumber} bắt đầu.`);
    addAdminLog(`Đêm ${room.nightNumber} bắt đầu — timer cố định 60 giây.`);
    storeEventHistory(`🌙 ĐÊM ${room.nightNumber}`, room.players, "section");

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

    // Đồng hồ đêm vẫn chạy đủ 60 giây.
    startTimer(TIME.night, () => {});
    startWitchPoisonAction();

    // Giây 50: chốt cứu/độc/Sói và xử lý người chết.
    // 10 giây cuối dành cho Hunter nếu Hunter chết; nếu không thì vẫn chờ đủ giây 60.
    const nightRefForResolve = room.night;
    setTimeout(() => {
        if (room.phase === "night" && room.night === nightRefForResolve) {
            finishWitchAction();
        }
    }, (TIME.mainNightAction + TIME.witchSave) * 1000);

    const nightRef = room.night;
    room.nightLockTimeout = setTimeout(
        () => lockNightMainActions(nightRef),
        TIME.mainNightAction * 1000
    );

    if (room.nightNumber === 1) {
        setTimeout(() => lockCupidPairIfNeeded(nightRef), TIME.cupidPair * 1000);
    }
}


/* =========================================================
   RESOLVE NIGHT
========================================================= */

function lockNightMainActions(nightRef = room.night) {
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
        else if (protectedByGuard) message = `🐺 Sói đã cắn ${target.name}. 🛡️ Người này đã được Bảo Vệ bảo vệ nên không thể dùng bình cứu.`;
        else if (witch.used.witchSave) message = `🐺 Sói đã cắn ${target.name}. ❤️ Bình cứu của bạn đã dùng hết.`;
        else message = `🐺 Sói đã cắn ${target.name}. Bạn có 10 giây cuối đêm để quyết định cứu.`;

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


function socketForPlayer(player) {
    if (!player?.id) return null;
    return io.sockets.sockets.get(player.id) || null;
}


/* =========================================================
   WITCH - POISON: FIRST 40s OF NIGHT
========================================================= */

function startWitchPoisonAction() {

    if (room.phase !== "night" || !room.night) return;

    // Keep the poison phase explicit for clients and reconnect logic.
    // Poison still runs in parallel with all other main night actions.
    room.night.witchActionOpen = true;
    room.night.witchActionMode = "poison";
    room.night.witchActionResolved = false;

    room.night.witchPoisonWindowOpen = true;
    room.night.witchPoisonEndsAt =
        Date.now() + TIME.witchPoison * 1000;

    const witch = room.players.find(
        p => p.alive && p.role === "Phù thủy"
    );

    if (witch?.connected) {
        io.to(witch.id).emit(
            "witchActionRequired",
            {
                mode: "poison",
                message: "☠️ Trong 40 giây đầu của đêm, chọn người để đầu độc. Bạn có thể đổi mục tiêu cho tới khi hết 40 giây.",
                seconds: TIME.witchPoison,
                endsAt: room.night.witchPoisonEndsAt,
                targetId:
                    room.night.witchPoisonDraftTargetId || null,
                targetName:
                    findPlayer(room.night.witchPoisonDraftTargetId)?.name || null,
                canSave: false,
                canPoison: !witch.used.witchPoison
            }
        );
    }

    room.witchPoisonTimeout =
        setTimeout(
            lockWitchPoisonSelection,
            TIME.witchPoison * 1000
        );
}


function lockWitchPoisonSelection() {

    if (
        !room.night ||
        !room.night.witchPoisonWindowOpen
    ) {
        return;
    }

    room.night.witchPoisonWindowOpen = false;
    room.night.witchPoisonEndsAt = null;

    if (room.witchPoisonTimeout) {
        clearTimeout(room.witchPoisonTimeout);
        room.witchPoisonTimeout = null;
    }

    const witch = room.players.find(
        p => p.alive && p.role === "Phù thủy"
    );

    const target =
        findPlayer(
            room.night.witchPoisonDraftTargetId
        );

    let lockedTarget = null;

    if (
        witch &&
        !witch.used.witchPoison &&
        target &&
        target.alive
    ) {
        witch.used.witchPoison = true;
        room.night.witchPoisonTargetId = target.id;
        lockedTarget = target;

        addAdminLog(
            `Phù thủy ${witch.name} chốt độc ${target.name}.`
        );
    }

    if (witch?.connected) {
        io.to(witch.id).emit(
            "witchPoisonLocked",
            {
                targetId: lockedTarget?.id || null,
                targetName: lockedTarget?.name || null,
                used: !!lockedTarget,
                message: lockedTarget
                    ? `☠️ Hết 50 giây. Mục tiêu độc cuối cùng: ${lockedTarget.name}.`
                    : (witch.used.witchPoison
                        ? "☠️ Bình độc đã được dùng trước đó."
                        : "☠️ Hết 50 giây. Bạn không chọn ai nên bình độc vẫn còn.")
            }
        );
    }
}


/* =========================================================
   WITCH - SAVE: FINAL 10s OF SAME 60s NIGHT
========================================================= */

function startWitchSaveAction() {
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
            message: `❤️ ${target.name} đã bị Sói cắn. Bạn có 10 giây cuối đêm để quyết định cứu.`,
            seconds: TIME.witchSave,
            endsAt: Date.now() + TIME.witchSave * 1000,
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
        endsAt: Date.now() + TIME.witchSave * 1000
    });

    sendAdminState();
}


/* =========================================================
   FINISH WITCH ACTION
========================================================= */

function finishWitchAction() {

    if (
        room.phase !== "night" ||
        !room.night ||
        room.night.nightResolved === true
    ) {

        return;

    }

    room.night.nightResolved = true;

    room.night.witchActionOpen =
        false;

    room.night.witchActionMode =
        null;

    room.night.witchActionResolved =
        true;

    io.emit("witchSaveWindow", { active: false });

    const deaths = [];

    const wolfTarget =
        findPlayer(
            room.night.wolfTargetId
        );

    /*
     * Sói cắn.
     */

    if (
        wolfTarget &&
        wolfTarget.alive
    ) {

        const protectedByGuard =
            room.night.guardTargetId ===
            wolfTarget.id;

        const savedByWitch =
            room.night.witchSave ===
            true;

        if (
            !protectedByGuard &&
            !savedByWitch
        ) {

            deaths.push(
                ...killPlayer(
                    wolfTarget,
                    "Bị Sói cắn"
                )
            );

        }

    }

    /*
     * Phù thủy độc.
     */

    const poisonTarget =
        findPlayer(
            room.night.witchPoisonTargetId
        );

    if (
        poisonTarget &&
        poisonTarget.alive
    ) {

        deaths.push(
            ...killPlayer(
                poisonTarget,
                "Bị Phù thủy đầu độc"
            )
        );

    }

    /*
     * Loại duplicate.
     */

    const uniqueDeaths =
        [];

    const deathIds =
        new Set();

    for (
        const death
        of deaths
    ) {

        if (
            deathIds.has(
                death.id
            )
        ) {

            continue;

        }

        deathIds.add(
            death.id
        );

        uniqueDeaths.push(
            death
        );

    }

    room.pendingNightDeaths =
        uniqueDeaths;

    broadcastPlayers();

    sendAdminState();

    /*
     * Kiểm tra Hunter: bắt buộc trả thù trong 10 giây.
     */

    const hunter =
        uniqueDeaths.find(
            p => p.role === "Thợ săn"
        );

    if (hunter) {
        startHunterRevenge(hunter, "night");
        return;
    }

    if (
        checkWinner()
    ) {

        return;

    }

    const nightEndsAt = Number(room.night?.nightEndsAt || Date.now());
    const waitMs = Math.max(0, nightEndsAt - Date.now());
    setTimeout(() => {
        if (room.phase !== "night" || !room.night || room.pendingHunter) return;
        startDaySpeech(
            room.night?.witchSave === true,
            !!room.night?.witchPoisonTargetId
        );
    }, waitMs);

}


/* =========================================================
   START DAY SPEECH
========================================================= */

function startDaySpeech(
    witchSaved = false,
    witchPoisoned = false
) {

    if (
        !room.started
    ) {

        return;

    }

    stopTimer();

    room.phase =
        "daySpeech";

    io.emit("coupleHearts", { active: false });

    addLog(
        `☀️ Ngày ${room.nightNumber} bắt đầu.`
    );

    addAdminLog(
        `Ban ngày ${room.nightNumber}.`
    );

    const dayRecipients =
        room.players;

    storeChatHistory(
        {
            kind: "section",
            chatType: "public",
            text: `☀️ THẢO LUẬN NGÀY ${room.nightNumber}`
        },
        dayRecipients
    );

    storeEventHistory(
        `☀️ NGÀY ${room.nightNumber} — THẢO LUẬN`,
        dayRecipients,
        "section"
    );

    const actualNightDeaths =
        Array.isArray(room.pendingNightDeaths)
            ? room.pendingNightDeaths
            : [];

    const nightDeathMessage =
        actualNightDeaths.length === 0
            ? "Đêm qua không có người nào chết."
            : actualNightDeaths.length === 1
                ? `${actualNightDeaths[0].name} đã chết trong đêm qua.`
                : `${actualNightDeaths.map(p => p.name).join(", ")} đã chết trong đêm qua.`;

    storeEventHistory(
        nightDeathMessage,
        dayRecipients
    );

    __frontendOwnsMusic(
        "daySpeech"
    );

    io.emit(
        "phaseChanged",
        {

            phase:
                "daySpeech",

            nightNumber:
                room.nightNumber,

            players:
                publicPlayers(false),

            nightResult: {

                deathMessage:
                    nightDeathMessage,

                /* Backward-compatible field used by the current frontend. */
                wolfBiteMessage:
                    nightDeathMessage

            }

        }
    );

    sendDeaths(
        room.pendingNightDeaths,
        "dead"
    );

    broadcastPlayers();

    sendAdminState();

    startTimer(
        daySpeechSecondsForAlive(),
        startDayVote
    );

}


/* =========================================================
   REALTIME DAY VOTE STATE
========================================================= */

function sendDayVoteState(targetSocketId = null) {
    if (room.phase !== "dayVote") return;

    const grouped = new Map();

    for (const [voterId, targetId] of room.dayVotes) {
        const voter = findPlayer(voterId);
        const target = findPlayer(targetId);
        if (!voter?.alive || !target?.alive) continue;

        if (!grouped.has(target.id)) {
            grouped.set(target.id, {
                targetId: target.id,
                targetName: target.name,
                voters: []
            });
        }

        grouped.get(target.id).voters.push({
            id: voter.id,
            name: voter.name
        });
    }

    const groups = alivePlayers()
        .map(p => grouped.get(p.id))
        .filter(Boolean);

    const payload = { groups };

    if (targetSocketId) {
        io.to(targetSocketId).emit("dayVoteState", payload);
    } else {
        io.emit("dayVoteState", payload);
    }
}


/* =========================================================
   START DAY VOTE
========================================================= */

function startDayVote() {

    if (
        !room.started
    ) {

        return;

    }

    stopTimer();

    room.phase =
        "dayVote";

    room.dayVotes =
        new Map();

    for (
        const player
        of room.players
    ) {

        player.dayVoteTargetId =
            null;

    }

    addLog(
        "🗳️ Bắt đầu bỏ phiếu ban ngày."
    );

    addAdminLog(
        "Bắt đầu vote ban ngày."
    );

    __frontendOwnsMusic(
        "dayVote"
    );

    io.emit(
        "phaseChanged",
        {

            phase:
                "dayVote",

            nightNumber:
                room.nightNumber,

            players:
                publicPlayers(false)

        }
    );

    sendDayVoteState();

    broadcastPlayers();

    sendAdminState();

    startTimer(
        TIME.dayVote,
        resolveDayVote
    );

}


/* =========================================================
   RESOLVE DAY VOTE
========================================================= */

function resolveDayVote() {

    if (
        room.phase !== "dayVote"
    ) {

        return;

    }

    const counts =
        new Map();

    for (
        const [
            voterId,
            targetId
        ]
        of room.dayVotes
    ) {

        const voter =
            findPlayer(voterId);

        const target =
            findPlayer(targetId);

        if (
            !voter ||
            !voter.alive
        ) {

            continue;

        }

        if (
            !target ||
            !target.alive
        ) {

            continue;

        }

        counts.set(
            targetId,
            (counts.get(targetId) || 0) + 1
        );

    }

    let highest = 0;

    let leaders = [];

    for (
        const [
            targetId,
            count
        ]
        of counts
    ) {

        if (
            count > highest
        ) {

            highest =
                count;

            leaders = [
                targetId
            ];

        } else if (
            count === highest
        ) {

            leaders.push(
                targetId
            );

        }

    }

    const aliveCount =
        alivePlayers().length;

    // Mỗi mục tiêu không được tự vote cho chính mình, vì vậy mẫu số
    // khi xét xử tử = tổng người còn sống - chính mục tiêu đó.
    // Phải QUÁ 50%; đúng 50% thì mục tiêu sống.
    const eligibleVotersForTarget = Math.max(0, aliveCount - 1);

    if (
        leaders.length !== 1 ||
        highest <= eligibleVotersForTarget / 2
    ) {

        io.emit(
            "voteResult",
            {

                executed:
                    null,

                message:
                    "⚖️ Không có người nào nhận quá 50% phiếu của số người sống còn lại (không tính chính mục tiêu)."

            }
        );

        addAdminLog(
            "Vote ban ngày không đủ đa số."
        );

        storeEventHistory(
            "⚖️ Không có người nào nhận quá 50% phiếu của số người sống còn lại (không tính chính mục tiêu).",
            room.players
        );

        room.dayVotes =
            new Map();

        broadcastPlayers();

        if (
            checkWinner()
        ) {

            return;

        }

        startNight();

        return;

    }

    const target =
        findPlayer(
            leaders[0]
        );

    if (
        !target ||
        !target.alive
    ) {

        startNight();

        return;

    }

    const deaths =
        killPlayer(
            target,
            "Bị dân làng treo cổ"
        );

    addAdminLog(
        `Vote xử tử ${target.name}.`
    );

    storeEventHistory(
        `🗳️ ${target.name} bị xử tử.`,
        room.players
    );

    const executedHunter = deaths.find(p => p.role === "Thợ săn");

    if (executedHunter) {
        finalDeaths(
            deaths,
            "voteResult",
        {

            executed: {

                id:
                    target.id,

                name:
                    target.name

            }

        },
        () => {
            startHunterRevenge(executedHunter, "day");
        }
        );
        return;
    }

    finalDeaths(
        deaths,
        "voteResult",
        {
            executed: {
                id: target.id,
                name: target.name
            }
        },
        () => {
            if (checkWinner()) return;
            startNight();
        }
    );

}


/* =========================================================
   END GAME
========================================================= */

function endGame(
    winner,
    message
) {

    if (
        !room.started
    ) {

        return;

    }

    stopTimer();
    stopGamePlayClock();

    room.phase =
        "ended";

    addLog(
        message
    );

    addAdminLog(
        `Game kết thúc: ${winner}.`
    );

    const winMusicKey =
        winner === "Couple" ? "coupleWin" :
        winner === "Sói" ? "wolfWin" :
        winner === "Dân" ? "villageWin" :
        "draw";

    __frontendOwnsMusic(winMusicKey);

    storeEventHistory(
        `🏆 ${message}`,
        room.players
    );

    io.emit(
        "gameEnded",
        {

            winner,

            message,

            celebration:
                winner === "Couple"
                    ? {
                        type: "couple",
                        hearts: true,
                        sfx: NETLIFY_AUDIO_BASE + "wedding.mp3",
                        loop: false
                    }
                    : null,

            players:
                publicPlayers(true)

        }
    );

    sendAdminState();

    /*
     * Reset lobby sau một khoảng ngắn
     * để frontend kịp nhận gameEnded.
     */

    setTimeout(
        () => {

            resetRoom();

        },
        5000
    );

}


/* =========================================================
   RESET ROOM
========================================================= */

function resetRoom(adminLogMessage = "Admin reset phòng.") {

    stopTimer();
    stopGamePlayClock();

    const keepTestMode = room.testMode === true;
    const savedTestConfig = room.testConfig
        ? {
            count: room.testConfig.count,
            roleAssignments: { ...(room.testConfig.roleAssignments || {}) }
        }
        : null;

    if (keepTestMode) {
        room.players = room.players.filter(p => !p.isBot);
    }

    room.started =
        false;

    room.phase =
        "lobby";

    room.nightNumber =
        0;

    room.roleComposition =
        [];

    room.night =
        null;

    room.dayVotes =
        new Map();

    room.pendingHunter =
        null;

    room.pendingNightDeaths =
        [];

    room.chatHistory =
        [];

    room.eventHistory =
        [];

    room.historySeq =
        0;

    room.gameInitialPlayerCount =
        0;

    room.exitedDeviceIds =
        new Set();

    for (
        const p
        of room.players
    ) {

        p.ready =
            false;

        p.alive =
            true;

        p.role =
            null;

        p.deathReasons =
            [];

        p.loverId =
            null;

        p.used = {

            witchSave:
                false,

            witchPoison:
                false

        };

        p.seerUsedNight =
            false;

        p.dayVoteTargetId =
            null;

    }

    chooseHost();

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
            : room.players.length;

    __frontendOwnsMusic(
        "lobby"
    );

    addAdminLog(
        adminLogMessage
    );

    emitRoom();

    sendAdminState();

}


/* =========================================================
   DAILY RESET - ASIA/HO_CHI_MINH
   Không ghi dữ liệu lâu dài. Khi sang ngày mới, xoá toàn bộ
   room/player/log/stat của ngày trước.
========================================================= */

function vietnamDayKey() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
}

let activeDayKey = vietnamDayKey();

function resetDailyData() {
    stopTimer();
    stopGamePlayClock();

    io.emit("dailyReset", {
        message: "🌅 Sang ngày mới, phòng đã tự reset dữ liệu."
    });

    for (const p of room.players) {
        const s = io.sockets.sockets.get(p.id);
        if (s) s.data.playerId = null;
    }

    room.players = [];
    room.hostId = null;
    room.started = false;
    room.phase = "lobby";
    room.targetPlayerCount = MIN_PLAYERS;
    room.nightNumber = 0;
    room.roleComposition = [];
    room.timerEndsAt = null;
    room.night = null;
    room.dayVotes = new Map();
    room.pendingHunter = null;
    room.pendingNightDeaths = [];
    room.logs = [];
    room.adminLogs = [];
    room.chatHistory = [];
    room.eventHistory = [];
    room.historySeq = 0;
    room.gameInitialPlayerCount = 0;
    room.exitedDeviceIds = new Set();
    room.totalPlayedMs = 0;
    room.gameStartedAt = null;
    room.totalNightsPlayed = 0;
    room.introCompleted = false;
    room.testConfig = null;
    room.testMode = false;
    room.testHumanId = null;
    room.testRoleAssignments = {};
    room.testBotWolfNight = null;
    room.testBotWolfTargetId = null;

    emitRoom();
    sendAdminState();
}

const dailyResetWatcher = setInterval(() => {
    const nowKey = vietnamDayKey();
    if (nowKey === activeDayKey) return;

    activeDayKey = nowKey;
    resetDailyData();
}, 30_000);

if (typeof dailyResetWatcher.unref === "function") {
    dailyResetWatcher.unref();
}


/* =========================================================
   RECONNECT STATE
========================================================= */

function reconnectState(
    socket,
    player
) {

    socket.data.playerId =
        player.id;

    socket.emit(
        "enteredGame",
        {

            room: {

                id:
                    room.id,

                started:
                    true,

                phase:
                    room.phase,

                nightNumber:
                    room.nightNumber,

                targetPlayerCount:
                    room.targetPlayerCount,

                minPlayers:
                    MIN_PLAYERS,

                maxPlayers:
                    MAX_PLAYERS,

                hostId:
                    room.hostId,

                roleComposition:
                    [...room.roleComposition]

            },

            yourPlayerId:
                player.id,

            yourName:
                player.name,

            isHost:
                player.id ===
                room.hostId,

            reconnect:
                true

        }
    );

    socket.emit(
        "roleAssigned",
        {

            role:
                player.role,

            isWolf:
                player.role === "Sói"

        }
    );

    socket.emit(
        "phaseChanged",
        {

            phase:
                room.phase,

            nightNumber:
                room.nightNumber,

            players:
                publicPlayers(false)

        }
    );

    if (
        room.timerEndsAt
    ) {

        socket.emit(
            "phaseTimer",
            {

                remaining:
                    Math.max(
                        0,
                        Math.ceil(
                            (
                                room.timerEndsAt -
                                Date.now()
                            ) / 1000
                        )
                    ),

                phase:
                    room.phase,

                endsAt:
                    room.timerEndsAt

            }
        );

    }

    /*
     * Sói reconnect trong đêm.
     */

    if (
        room.phase === "night" &&
        player.role === "Sói" &&
        player.alive &&
        room.night?.mainActionsOpen === true
    ) {

        sendWolfTargets();

        sendWolfVoteState();

    }

    /*
     * Tiên Tri reconnect trong đêm.
     * Khôi phục trạng thái đã soi/chưa soi và danh sách mục tiêu hợp lệ.
     */
    if (
        room.phase === "night" &&
        player.role === "Tiên tri" &&
        player.alive
    ) {

        const lastInspection =
            [...(room.night?.seerInspections || [])]
                .reverse()
                .find(
                    item =>
                        item.seerId === player.id
                ) || null;

        const canInspect =
            player.seerUsedNight !== true &&
            room.night?.mainActionsOpen === true;

        socket.emit(
            "seerState",
            {
                used:
                    player.seerUsedNight === true,

                canInspect,

                targetId:
                    lastInspection?.targetId || null,

                targetName:
                    lastInspection?.targetName || null,

                result:
                    lastInspection?.result || null,

                players:
                    canInspect
                        ? alivePlayers()
                            .filter(
                                p => p.id !== player.id
                            )
                            .map(
                                p => ({
                                    id: p.id,
                                    name: p.name,
                                    alive: p.alive
                                })
                            )
                        : []
            }
        );

    }


    /*
     * Phù thủy reconnect.
     * - 0-50s: khôi phục mục tiêu độc đang tạm chọn.
     * - Sau 50s nếu đang mở cứu: khôi phục người bị Sói cắn và thời gian còn lại.
     */
    if (
        room.phase === "night" &&
        player.role === "Phù thủy" &&
        player.alive
    ) {

        if (
            room.night?.witchPoisonWindowOpen
        ) {
            const remainingPoison =
                room.night.witchPoisonEndsAt
                    ? Math.max(
                        0,
                        Math.ceil(
                            (room.night.witchPoisonEndsAt - Date.now()) / 1000
                        )
                    )
                    : 0;

            socket.emit(
                "witchActionRequired",
                {
                    mode: "poison",
                    message: `☠️ Còn ${remainingPoison} giây để chọn/đổi mục tiêu độc.`,
                    seconds: remainingPoison,
                    endsAt: room.night.witchPoisonEndsAt,
                    targetId:
                        room.night.witchPoisonDraftTargetId || null,
                    targetName:
                        findPlayer(room.night.witchPoisonDraftTargetId)?.name || null,
                    canSave: false,
                    canPoison: !player.used.witchPoison
                }
            );
        } else if (
            room.night?.witchActionOpen &&
            room.night?.witchActionMode === "save"
        ) {
            const target =
                findPlayer(
                    room.night.wolfTargetId
                );

            const remaining =
                room.timerEndsAt
                    ? Math.max(
                        0,
                        Math.ceil(
                            (room.timerEndsAt - Date.now()) / 1000
                        )
                    )
                    : 0;

            socket.emit(
                "witchActionRequired",
                {
                    mode: "save",
                    message: target
                        ? `❤️ ${target.name} đã bị Sói cắn. Bạn còn ${remaining} giây để quyết định cứu.`
                        : "❤️ Không có người bị Sói cắn để cứu.",
                    seconds: remaining,
                    targetId: target?.id || null,
                    targetName: target?.name || null,
                    canSave: !!target && !player.used.witchSave,
                    canPoison: false
                }
            );
        } else if (
            room.night?.witchPoisonTargetId
        ) {
            const locked =
                findPlayer(
                    room.night.witchPoisonTargetId
                );

            socket.emit(
                "witchPoisonLocked",
                {
                    targetId: locked?.id || null,
                    targetName: locked?.name || null,
                    used: true,
                    message: locked
                        ? `☠️ Mục tiêu độc đã khóa: ${locked.name}.`
                        : "☠️ Mục tiêu độc đã được khóa."
                }
            );
        }
    }

    let musicKey =
        "lobby";

  if (room.night?.witchActionOpen) {

    musicKey =
        room.night.witchActionMode === "save"
            ? "witchSave"
            : "witchPoison";

} else if (
    room.phase === "intro"
) {

    musicKey = "night";

} else if (
    room.phase === "night"
) {

    musicKey = "night";

} else if (
    room.phase === "dayVote"
) {

    musicKey = "dayVote";

} else if (
    room.phase === "daySpeech"
) {

    musicKey = "";
}
    __frontendOwnsMusic(
        musicKey,
        socket.id
    );

    if (room.phase === "dayVote") {
        sendDayVoteState(socket.id);
    }

    sendHistoryToPlayer(
        socket,
        player
    );

}


/* =========================================================
   SOCKET CONNECTION
========================================================= */


/* =========================================================
   TEST MODE / SERVER-SIDE BOTS
========================================================= */
function testAllowedRoles(count) {
    return [...new Set(getRoleComposition(count))];
}

function testBotPlayer(index) {
    const stamp = Date.now() + "-" + index + "-" + Math.random().toString(36).slice(2, 8);
    return {
        id: "BOT-" + stamp,
        name: "🤖 Bot " + String(index).padStart(2, "0"),
        deviceId: "test-bot-" + stamp,
        connected: true,
        leftGame: false,
        ready: true,
        alive: true,
        role: null,
        deathReasons: [],
        loverId: null,
        used: { witchSave: false, witchPoison: false },
        seerUsedNight: false,
        dayVoteTargetId: null,
        isBot: true,
        _testGuardNight: null,
        _testSeerNight: null,
        _testWitchPoisonNight: null,
        _testWitchSaveNight: null
    };
}

function testHostPlayer(){
    return findPlayer(room.hostId) || null;
}

function testEmitHostEvent(text){
    if (!text) return;
    const host = testHostPlayer();
    if (!host) return;
    try { storeEventHistory(text, [host], "event"); } catch (_) {}
    try { io.to(host.id).emit("testBotEvent", { text, time: Date.now() }); } catch (_) {}
}

function chooseTestBotTarget(candidates, preferred = null, chance = 0.55) {
    if (!candidates.length) return null;
    if (preferred && candidates.some(p => p.id === preferred.id) && Math.random() < chance) return preferred;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

function runTestBotNight() {
    if (!room.testMode || !room.started || room.phase !== "night" || !room.night) return;
    const host = testHostPlayer();

    if (!room.night.witchActionOpen) {
        const botWolves = room.players.filter(p => p.isBot && p.alive && p.role === "Sói");
        const wolfCandidates = alivePlayers().filter(p => p.role !== "Sói");
        if (botWolves.length && wolfCandidates.length) {
            if (room.testBotWolfNight !== room.nightNumber || !findPlayer(room.testBotWolfTargetId)?.alive) {
                const preferred = host?.alive && host.role !== "Sói" ? host : null;
                const target = chooseTestBotTarget(wolfCandidates, preferred, 0.35);
                room.testBotWolfNight = room.nightNumber;
                room.testBotWolfTargetId = target?.id || null;
            }
            const target = findPlayer(room.testBotWolfTargetId);
            if (target?.alive) {
                for (const wolf of botWolves) {
                    if (room.night.wolfVotes.get(wolf.id) !== target.id) {
                        room.night.wolfVotes.set(wolf.id, target.id);
                        testEmitHostEvent("🤖 " + wolf.name + " (Sói) chọn cắn " + target.name + ".");
                    }
                }
                if (typeof sendWolfVoteState === "function") sendWolfVoteState();
            }
        }

        const botGuards = room.players.filter(p => p.isBot && p.alive && p.role === "Bảo vệ");
        for (const guard of botGuards) {
            if (guard._testGuardNight === room.nightNumber) continue;
            const candidates = alivePlayers().filter(p => p.id !== room.night.previousGuardTargetId);
            const target = chooseTestBotTarget(candidates, host?.alive ? host : null, 0.25);
            if (!target) continue;
            room.night.guardTargetId = target.id;
            guard._testGuardNight = room.nightNumber;
            testEmitHostEvent("🤖 " + guard.name + " (Bảo vệ) bảo vệ " + target.name + ".");
        }

        const botSeers = room.players.filter(p => p.isBot && p.alive && p.role === "Tiên tri");
        for (const seer of botSeers) {
            if (seer._testSeerNight === room.nightNumber) continue;
            const candidates = alivePlayers().filter(p => p.id !== seer.id);
            const target = chooseTestBotTarget(candidates, null);
            if (!target) continue;
            seer.seerUsedNight = true;
            seer._testSeerNight = room.nightNumber;
            const result = target.role === "Dân" ? "THIỆN" : "KHÔNG RÕ";
            testEmitHostEvent("🤖 " + seer.name + " (Tiên tri) soi " + target.name + " → " + result + ".");
        }
    }

    const botWitches = room.players.filter(p => p.isBot && p.alive && p.role === "Phù thủy");
    for (const witch of botWitches) {
        if (
            room.night.witchPoisonWindowOpen &&
            !witch.used.witchPoison &&
            witch._testWitchPoisonNight !== room.nightNumber
        ) {
            witch._testWitchPoisonNight = room.nightNumber;

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
        }

        if (
            room.night.witchActionOpen &&
            room.night.witchActionMode === "save" &&
            !witch.used.witchSave &&
            witch._testWitchSaveNight !== room.nightNumber
        ) {
            witch._testWitchSaveNight = room.nightNumber;
            const bitten = findPlayer(room.night.wolfTargetId);

            if (bitten?.alive && Math.random() < 0.50) {
                witch.used.witchSave = true;
                room.night.witchSave = true;
                testEmitHostEvent("🤖 " + witch.name + " (Phù thủy) CỨU " + bitten.name + ".");
            } else {
                testEmitHostEvent("🤖 " + witch.name + " (Phù thủy) không cứu đêm " + room.nightNumber + ".");
            }
        }
    }

    sendTestObserverState();
}

function runTestBotDayVote() {
    if (!room.testMode || !room.started || room.phase !== "dayVote") return;
    const host = testHostPlayer();
    const bots = room.players.filter(p => p.isBot && p.alive);
    for (const bot of bots) {
        if (room.dayVotes.has(bot.id)) continue;
        const candidates = alivePlayers().filter(p => p.id !== bot.id);
        if (!candidates.length) continue;
        let preferred = null;
        if (bot.role === "Sói") {
            const nonWolves = candidates.filter(p => p.role !== "Sói");
            if (host?.alive && host.role !== "Sói" && nonWolves.some(p => p.id === host.id) && Math.random() < 0.30) preferred = host;
            if (!preferred && nonWolves.length) preferred = nonWolves[Math.floor(Math.random() * nonWolves.length)];
        } else {
            const wolves = candidates.filter(p => p.role === "Sói");
            if (wolves.length && Math.random() < 0.62) preferred = wolves[Math.floor(Math.random() * wolves.length)];
        }
        const target = chooseTestBotTarget(candidates, preferred);
        if (!target) continue;
        room.dayVotes.set(bot.id, target.id);
        bot.dayVoteTargetId = target.id;
        testEmitHostEvent("🤖 " + bot.name + " (" + bot.role + ") bỏ phiếu cho " + target.name + ".");
    }
    if (typeof sendDayVoteState === "function") sendDayVoteState();
    if (typeof broadcastPlayers === "function") broadcastPlayers();
    sendTestObserverState();
}

const testBotTicker = setInterval(() => {
    try { runTestBotNight(); runTestBotDayVote(); }
    catch (err) { console.error("[TEST BOT]", err); }
}, 1100);
if (typeof testBotTicker.unref === "function") testBotTicker.unref();

io.on(
    "connection",
    socket => {

        socket.data.isAdmin =
            false;

        socket.data.playerId =
            null;

        socket.emit("audioConfigChanged", publicAudioConfig());

        socket.on("startTestGame", data => {
            if (room.started) {
                socket.emit("actionError", { message: "Ván đang chạy. Hãy dừng test trước." });
                return;
            }
            const starter = findPlayer(socket.data.playerId);
            if (!starter) {
                socket.emit("actionError", { message: "Bạn chưa vào phòng test." });
                return;
            }
            if (starter.id !== room.hostId) {
                socket.emit("actionError", { message: "Chỉ Host mới được cấu hình và bắt đầu Test Mode." });
                return;
            }

            const count = Number(data?.count || 10);
            if (!ALLOWED_SIZES.includes(count)) {
                socket.emit("actionError", { message: "Số người phải từ 6 đến 15." });
                return;
            }

            const humans = room.players.filter(p => !p.isBot && p.connected !== false && p.leftGame !== true);
            if (humans.length > count) {
                socket.emit("actionError", { message: "Đang có " + humans.length + " máy thật, nhiều hơn bàn " + count + " người." });
                return;
            }

            const composition = getRoleComposition(count);
            const remainingCounts = {};
            for (const role of composition) remainingCounts[role] = (remainingCounts[role] || 0) + 1;

            const requested = data?.roleAssignments && typeof data.roleAssignments === "object" ? data.roleAssignments : {};
            const cleanAssignments = {};
            for (const human of humans) {
                const role = String(requested[human.id] || "").trim();
                if (!role || role === "Random") continue;
                if (!testAllowedRoles(count).includes(role)) {
                    socket.emit("actionError", { message: role + " không có trong bàn " + count + " người." });
                    return;
                }
                if (!remainingCounts[role]) {
                    socket.emit("actionError", { message: "Không đủ slot vai " + role + " cho các máy thật đã chọn." });
                    return;
                }
                remainingCounts[role]--;
                cleanAssignments[human.id] = role;
            }

            room.players = humans;
            for (const human of humans) {
                human.connected = true;
                human.leftGame = false;
                human.ready = true;
                human.alive = true;
                human.role = null;
                human.loverId = null;
                human.deathReasons = [];
                human.used = { witchSave: false, witchPoison: false };
                human.seerUsedNight = false;
                human.dayVoteTargetId = null;
                human.isBot = false;
            }

            room.hostId = starter.id;
            room.testMode = true;
            room.testHumanId = starter.id;
            room.testRoleAssignments = cleanAssignments;
            room.testConfig = {
                count,
                roleAssignments: { ...cleanAssignments }
            };
            room.testBotWolfNight = null;
            room.testBotWolfTargetId = null;

            const botsNeeded = count - humans.length;
            for (let i = 1; i <= botsNeeded; i++) room.players.push(testBotPlayer(i));
            room.targetPlayerCount = count;

            const result = startGame();
            if (!result?.ok) {
                socket.emit("actionError", { message: result?.message || "Không thể bắt đầu Test Mode." });
                return;
            }

            socket.emit("testRoleMap", {
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
            sendTestObserverState();
            testEmitHostEvent("🧪 Host " + starter.name + " bắt đầu bàn test " + count + " người: " + humans.length + " máy thật + " + botsNeeded + " Bot.");
            addAdminLog("TEST MODE MULTI: " + humans.length + " humans, " + botsNeeded + " bots, table " + count + ".");
        });

        socket.on("stopTestGame", () => {
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
        });


        /* =====================================================
           ADMIN LOGIN
        ===================================================== */

        socket.on(
            "adminLogin",
            data => {

                const password =
                    String(
                        data?.password || ""
                    );

                if (
                    password ===
                    ADMIN_PASSWORD
                ) {

                    socket.data.isAdmin =
                        true;

                    socket.emit(
                        "adminLoginResult",
                        {

                            ok:
                                true,

                            message:
                                "Đăng nhập Admin thành công."

                        }
                    );

                    addAdminLog(
                        "Admin đăng nhập."
                    );

                    sendAdminState();

                } else {

                    socket.emit(
                        "adminLoginResult",
                        {

                            ok:
                                false,

                            message:
                                "Sai mật khẩu."

                        }
                    );

                }

            }
        );


        /* =====================================================
           ADMIN REFRESH
        ===================================================== */

        socket.on(
            "adminRefresh",
            () => {

                if (
                    !socket.data.isAdmin
                ) {

                    return;

                }

                sendAdminState();

            }
        );


        /* =====================================================
           ADMIN RESET
        ===================================================== */

        socket.on(
            "adminResetRoom",
            () => {

                if (
                    !socket.data.isAdmin
                ) {

                    return;

                }

                resetRoom();

            }
        );


        /* =====================================================
           ADMIN END GAME
        ===================================================== */

        socket.on(
            "adminEndGame",
            data => {

                if (
                    !socket.data.isAdmin
                ) {

                    return;

                }

                if (
                    room.started
                ) {

                    endGame(

                        data?.winner ||
                            "Admin",

                        data?.message ||
                            "Admin đã kết thúc game."

                    );

                }

            }
        );


        /* =====================================================
           ADMIN KICK PLAYER
        ===================================================== */

        socket.on(
            "adminKickPlayer",
            data => {

                if (
                    !socket.data.isAdmin
                ) {

                    return;

                }

                const player =
                    findPlayer(
                        data?.playerId
                    );

                if (
                    !player
                ) {

                    return;

                }

                if (
                    room.started &&
                    player.alive
                ) {

                    room.exitedDeviceIds.add(
                        player.deviceId || `id:${player.id}`
                    );

                    player.leftGame =
                        true;

                    const deaths =
                        killPlayer(
                            player,
                            "Bị Admin loại"
                        );

                    /*
                     * Nếu Hunter bị kick.
                     */

                    if (
                        room.pendingHunter?.id ===
                        player.id
                    ) {

                        room.pendingHunter =
                            null;

                    }

                    if (
                        room.phase === "night"
                    ) {

                        room.pendingNightDeaths.push(
                            ...deaths
                        );

                    } else {

                        sendDeaths(
                            deaths
                        );

                    }

                    broadcastPlayers();

                    if (
                        checkWinner()
                    ) {

                        return;

                    }

                }

                if (
                    room.started &&
                    !player.alive
                ) {
                    player.leftGame = true;
                }

                const targetSocket =
                    io.sockets.sockets.get(
                        player.id
                    );

                if (
                    targetSocket
                ) {

                    targetSocket.emit(
                        "leftRoom",
                        { reason: "adminKick", message: "Admin đã kích bạn" }
                    );

                    targetSocket.data.playerId =
                        null;

                    targetSocket.disconnect(
                        true
                    );

                }

                room.players =
                    room.players.filter(
                        p =>
                            p.id !==
                            player.id
                    );

                if (
                    room.hostId ===
                    player.id
                ) {

                    chooseHost();

                }

                if (!room.started) {
                    room.targetPlayerCount =
                        room.players.length;
                }

                addAdminLog(
                    `Admin kick ${player.name}.`
                );

                emitRoom();

                sendAdminState();

            }
        );


        /* =====================================================
           ADMIN KICK ALL
        ===================================================== */

        socket.on(
            "adminKickAll",
            () => {

                if (!socket.data.isAdmin) return;

                stopTimer();
                stopGamePlayClock();
                const kickedPlayers = [...room.players];

                room.players = [];
                room.hostId = null;
                room.started = false;
                room.phase = "lobby";
                room.targetPlayerCount = 6;
                room.nightNumber = 0;
                room.roleComposition = [];
                room.night = null;
                room.dayVotes = new Map();
                room.pendingHunter = null;
                room.pendingNightDeaths = [];
                room.chatHistory = [];
                room.eventHistory = [];
                room.historySeq = 0;

                for (const p of kickedPlayers) {
                    const s = io.sockets.sockets.get(p.id);
                    if (!s) continue;
                    s.data.playerId = null;
                    s.emit("leftRoom", { reason: "adminKickAll", message: "Admin đã kích tất cả người chơi" });
                }

                __frontendOwnsMusic("lobby");
                addAdminLog(`Admin kick tất cả (${kickedPlayers.length} người).`);
                emitRoom();
                sendAdminState();
            }
        );


        /* =====================================================
           ADMIN AUDIO CONFIG - LIBRARY COMES FROM /audio
        ===================================================== */


        socket.on("adminPreviewAudio", data => {
            if (!socket.data.isAdmin) return;
            const type = data?.type === "sfx" ? "sfx" : "music";
            const library = currentAudioLibrary();
            const item = findAudioItem(library, String(data?.id || ""));
            if (!item?.src) return;
            socket.emit("audioPreview", {
                type,
                src: item.src,
                name: item.name,
                volume: type === "sfx" ? AUDIO_CONFIG.sfxVolume : AUDIO_CONFIG.musicVolume
            });
        });

        /* =====================================================
           JOIN / RECONNECT
        ===================================================== */

        socket.on(
            "joinRoom",
            data => {

                const name =
                    String(
                        data?.name || ""
                    ).trim();

                const deviceId =
                    String(
                        data?.deviceId || ""
                    ).trim();

                if (
                    !name
                ) {

                    socket.emit(
                        "enterError",
                        {

                            message:
                                "Vui lòng nhập tên."

                        }
                    );

                    return;

                }

                if (
                    name.length > 20
                ) {

                    socket.emit(
                        "enterError",
                        {

                            message:
                                "Tên tối đa 20 ký tự."

                        }
                    );

                    return;

                }


                /* =================================================
                   RECONNECT GAME
                ================================================= */

                if (
                    room.started
                ) {

                    const reconnectPlayer =
                        findPlayerByDeviceId(
                            deviceId
                        );

                    if (
                        reconnectPlayer &&
                        !reconnectPlayer.connected &&
                        reconnectPlayer.leftGame !== true
                    ) {

                        const oldId =
                            reconnectPlayer.id;

                        const newId =
                            socket.id;

                        reconnectPlayer.id =
                            newId;

                        reconnectPlayer.connected =
                            true;

                        /*
                         * Host.
                         */

                        if (
                            room.hostId ===
                            oldId
                        ) {

                            room.hostId =
                                newId;

                        }

                        /*
                         * Lover.
                         */

                        for (
                            const p
                            of room.players
                        ) {

                            if (
                                p.loverId ===
                                oldId
                            ) {

                                p.loverId =
                                    newId;

                            }

                        }

                        /*
                         * Day votes.
                         */

                        if (
                            room.dayVotes.has(
                                oldId
                            )
                        ) {

                            const targetId =
                                room.dayVotes.get(
                                    oldId
                                );

                            room.dayVotes.delete(
                                oldId
                            );

                            room.dayVotes.set(
                                newId,
                                targetId
                            );

                        }

                        for (
                            const [
                                voterId,
                                targetId
                            ]
                            of room.dayVotes
                        ) {

                            if (
                                targetId ===
                                oldId
                            ) {

                                room.dayVotes.set(
                                    voterId,
                                    newId
                                );

                            }

                        }

                        /*
                         * Night.
                         */

                        if (
                            room.night
                        ) {

                            if (
                                room.night.wolfVotes.has(
                                    oldId
                                )
                            ) {

                                const targetId =
                                    room.night.wolfVotes.get(
                                        oldId
                                    );

                                room.night.wolfVotes.delete(
                                    oldId
                                );

                                room.night.wolfVotes.set(
                                    newId,
                                    targetId
                                );

                            }

                            for (
                                const [
                                    wolfId,
                                    targetId
                                ]
                                of room.night.wolfVotes
                            ) {

                                if (
                                    targetId ===
                                    oldId
                                ) {

                                    room.night.wolfVotes.set(
                                        wolfId,
                                        newId
                                    );

                                }

                            }

                            if (
                                room.night.wolfTargetId ===
                                oldId
                            ) {

                                room.night.wolfTargetId =
                                    newId;

                            }

                            if (
                                room.night.guardTargetId ===
                                oldId
                            ) {

                                room.night.guardTargetId =
                                    newId;

                            }

                            if (
                                room.night.previousGuardTargetId ===
                                oldId
                            ) {

                                room.night.previousGuardTargetId =
                                    newId;

                            }

                            if (
                                room.night.witchPoisonTargetId ===
                                oldId
                            ) {

                                room.night.witchPoisonTargetId =
                                    newId;

                            }

                            if (
                                room.night.hunterShotTargetId ===
                                oldId
                            ) {

                                room.night.hunterShotTargetId =
                                    newId;

                            }

                            for (
                                const inspection
                                of room.night.seerInspections
                            ) {

                                if (
                                    inspection.seerId ===
                                    oldId
                                ) {

                                    inspection.seerId =
                                        newId;

                                }

                                if (
                                    inspection.targetId ===
                                    oldId
                                ) {

                                    inspection.targetId =
                                        newId;

                                }

                            }

                        }

                        /*
                         * Pending Hunter.
                         */

                        if (
                            room.pendingHunter &&
                            room.pendingHunter.id ===
                            oldId
                        ) {

                            room.pendingHunter.id =
                                newId;

                        }

                        socket.data.playerId =
                            newId;

                        reconnectState(
                            socket,
                            reconnectPlayer
                        );

                        if (reconnectPlayer.loverId) {
                            const reconnectLover = findPlayer(reconnectPlayer.loverId);
                            if (reconnectLover) {
                                socket.emit("loverLinked", {
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
                                }
                            }
                        }

                        addLog(
                            `${reconnectPlayer.name} đã vào lại game.`
                        );

                        addAdminLog(
                            `${reconnectPlayer.name} đã kết nối lại.`
                        );

                        broadcastPlayers();

                        sendAdminState();

                        return;

                    }

                    socket.emit(
                        "enterError",
                        {

                            message:
                                "Game đang chạy. Chỉ người chơi cũ mới được vào lại."

                        }
                    );

                    return;

                }


                /* =================================================
                   LOBBY JOIN
                ================================================= */

                if (
                    room.players.length >=
                    MAX_PLAYERS
                ) {

                    socket.emit(
                        "enterError",
                        {

                            message:
                                "Phòng đã đủ 15 người."

                        }
                    );

                    return;

                }

                const sameDevice =
                    room.players.find(
                        p =>
                            p.connected &&
                            deviceId &&
                            p.deviceId ===
                                deviceId
                    );

                if (
                    sameDevice
                ) {

                    socket.emit(
                        "enterError",
                        {

                            message:
                                "Thiết bị này đã vào phòng."

                        }
                    );

                    return;

                }

                const sameName =
                    room.players.find(
                        p =>
                            p.connected &&
                            p.name.toLowerCase() ===
                                name.toLowerCase()
                    );

                if (
                    sameName
                ) {

                    socket.emit(
                        "enterError",
                        {

                            message:
                                "Tên này đã có người sử dụng."

                        }
                    );

                    return;

                }

                const player = {

                    id:
                        socket.id,

                    name,

                    deviceId,

                    connected:
                        true,

                    leftGame:
                        false,

                    ready:
                        false,

                    alive:
                        true,

                    role:
                        null,

                    deathReasons:
                        [],

                    loverId:
                        null,

                    used: {

                        witchSave:
                            false,

                        witchPoison:
                            false

                    },

                    seerUsedNight:
                        false,

                    dayVoteTargetId:
                        null

                };

                room.players.push(
                    player
                );

                if (
                    !room.hostId
                ) {

                    room.hostId =
                        player.id;

                }

                room.targetPlayerCount =
                    room.players.length;

                socket.data.playerId =
                    player.id;

                socket.emit(
                    "enteredGame",
                    {

                        room: {

                            id:
                                room.id,

                            started:
                                false,

                            phase:
                                "lobby",

                            nightNumber:
                                0,

                            targetPlayerCount:
                                room.players.length,

                            minPlayers:
                                MIN_PLAYERS,

                            maxPlayers:
                                MAX_PLAYERS,

                            hostId:
                                room.hostId,

                            roleComposition:
                                getRoleComposition(room.players.length)

                        },

                        yourPlayerId:
                            player.id,

                        yourName:
                            player.name,

                        isHost:
                            player.id ===
                            room.hostId

                    }
                );

                __frontendOwnsMusic(
                    "lobby",
                    socket.id
                );

                addLog(
                    `${player.name} vào phòng.`
                );

                addAdminLog(
                    `${player.name} vào phòng.`
                );

                emitRoom();

                sendAdminState();

            }
        );


        /* =====================================================
           READY
        ===================================================== */

        socket.on(
            "setReady",
            data => {

                if (
                    room.started
                ) {

                    return;

                }

                const player =
                    findPlayer(
                        socket.data.playerId
                    );

                if (
                    !player
                ) {

                    return;

                }

                if (
                    !player.connected
                ) {

                    return;

                }

                if (
                    player.id ===
                    room.hostId
                ) {

                    return;

                }

                player.ready =
                    data?.ready === true;

                addLog(
                    `${player.name} ${
                        player.ready
                            ? "đã sẵn sàng"
                            : "đã hủy sẵn sàng"
                    }.`
                );

                emitRoom();

                sendAdminState();

            }
        );


        /* =====================================================
           START GAME
        ===================================================== */

        socket.on(
            "startGame",
            () => {

                const player =
                    findPlayer(
                        socket.data.playerId
                    );

                if (
                    !player
                ) {

                    return;

                }

                if (
                    player.id !==
                    room.hostId
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Chỉ Host mới được bắt đầu."

                        }
                    );

                    return;

                }

                const result =
                    startGame();

                if (
                    !result.ok
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                result.message

                        }
                    );

                }

            }
        );


        /* =====================================================
           INTRO FINISHED
        ===================================================== */


        /* =====================================================
           🐺 WOLF VOTE
        ===================================================== */

        socket.on(
            "wolfVote",
            data => {

                if (
                    room.phase !== "night" ||
                    !room.night?.mainActionsOpen
                ) {

                    return;

                }

                const wolf =
                    findPlayer(
                        socket.data.playerId
                    );

                const target =
                    findPlayer(
                        data?.targetId
                    );

                if (
                    !wolf ||
                    !wolf.alive ||
                    wolf.role !== "Sói"
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Chỉ Sói còn sống mới được vote."

                        }
                    );

                    return;

                }

                if (
                    !target ||
                    !target.alive
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Mục tiêu không hợp lệ."

                        }
                    );

                    return;

                }

                if (
                    target.id ===
                    wolf.id
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Không thể vote chính mình."

                        }
                    );

                    return;

                }

                if (
                    target.role ===
                    "Sói"
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "🐺 Không thể vote người cùng phe Sói."

                        }
                    );

                    return;

                }

                /*
                 * Map theo wolf.id.
                 * Vote mới sẽ tự động thay vote cũ.
                 */

                const wolfCleared = room.night.wolfVotes.get(wolf.id) === target.id;

                if (wolfCleared) room.night.wolfVotes.delete(wolf.id);
                else room.night.wolfVotes.set(wolf.id, target.id);

                room.night.wolfTargetId = calculateWolfTarget()?.id || null;

                socket.emit("actionAccepted", {
                    type: wolfCleared ? "wolfVoteCleared" : "wolfVote",
                    targetId: wolfCleared ? null : target.id
                });

                /*
                 * ⭐ QUAN TRỌNG:
                 * Gửi lại toàn bộ trạng thái vote
                 * cho tất cả Sói còn sống.
                 */

                sendWolfVoteState();

                addAdminLog(
                    `Sói ${wolf.name} chọn ${target.name}.`
                );

                sendAdminState();

            }
        );


        /* =====================================================
           🛡️ GUARD
        ===================================================== */

        socket.on(
            "guardProtect",
            data => {

                const guard =
                    findPlayer(
                        socket.data.playerId
                    );

                const target =
                    findPlayer(
                        data?.targetId
                    );

                if (
                    room.phase !== "night" ||
                    !room.night?.mainActionsOpen
                ) {

                    return;

                }

                if (
                    !guard ||
                    !guard.alive ||
                    guard.role !== "Bảo vệ"
                ) {

                    return;

                }

                if (
                    !target ||
                    !target.alive
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Mục tiêu không hợp lệ."

                        }
                    );

                    return;

                }

                if (
                    room.night.previousGuardTargetId &&
                    target.id ===
                        room.night.previousGuardTargetId
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "🛡️ Không thể bảo vệ người này 2 đêm liên tiếp."

                        }
                    );

                    return;

                }

                const guardCleared = room.night.guardTargetId === target.id;
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
                        : `🛡️ Bạn đã chọn bảo vệ ${target.name} đêm này.`
                });

                addAdminLog(
                    `Bảo vệ ${guard.name} bảo vệ ${target.name}.`
                );

                sendAdminState();

            }
        );


        /* =====================================================
           🔮 SEER
        ===================================================== */

        socket.on(
            "seerInspect",
            data => {

                const seer =
                    findPlayer(
                        socket.data.playerId
                    );

                const target =
                    findPlayer(
                        data?.targetId
                    );

                if (
                    room.phase !== "night" ||
                    !room.night?.mainActionsOpen ||
                    !seer ||
                    !seer.alive ||
                    seer.role !== "Tiên tri"
                ) {

                    return;

                }

                if (
                    seer.seerUsedNight
                ) {

                    socket.emit(
                        "seerError",
                        {

                            message:
                                "Bạn đã soi trong đêm nay."

                        }
                    );

                    return;

                }

                if (
                    !target ||
                    !target.alive ||
                    target.id ===
                        seer.id
                ) {

                    socket.emit(
                        "seerError",
                        {

                            message:
                                "Mục tiêu không hợp lệ."

                        }
                    );

                    return;

                }

                const result = target.role === "Dân" ? "🟢 THIỆN" : "❓ KHÔNG RÕ";

                seer.seerUsedNight =
                    true;

                room.night.seerInspections.push(
                    {

                        seerId:
                            seer.id,

                        seerName:
                            seer.name,

                        targetId:
                            target.id,

                        targetName:
                            target.name,

                        result,

                        time:
                            Date.now()

                    }
                );

                socket.emit("seerResult", {
                    targetId: target.id,
                    targetName: target.name,
                    result,
                    locked: true
                });
                socket.emit("roleActionState", {
                    role: "Tiên tri",
                    active: false,
                    reason: "used"
                });

                storeEventHistory(
                    `🔮 Kết quả soi ${target.name}: ${result}`,
                    [seer]
                );

                addAdminLog(
                    `Tiên tri ${seer.name} soi ${target.name}: ${result}`
                );

                sendAdminState();

            }
        );


        /* =====================================================
           🧙 WITCH SAVE
        ===================================================== */

        socket.on(
            "witchSave",
            () => {

                // WITCH SAVE: accept during the authoritative final 10s of night.
                // Do not depend on a transient UI/action-mode flag.
                if (
                    room.phase !== "night" ||
                    !room.night ||
                    room.night.mainActionsOpen !== false ||
                    !room.timerEndsAt ||
                    Date.now() >= room.timerEndsAt
                ) {
                    socket.emit("actionError", {
                        message: "Bình cứu chỉ dùng được trong 10 giây cuối của đêm."
                    });
                    return;
                }

                const witch =
                    findPlayer(
                        socket.data.playerId
                    );

                if (
                    !witch ||
                    !witch.alive ||
                    witch.role !== "Phù thủy"
                ) {

                    return;

                }

                if (
                    witch.used.witchSave
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Đã dùng bình cứu."

                        }
                    );

                    return;

                }

                if (
                    !room.night.wolfTargetId
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Đêm nay không có người bị Sói cắn."

                        }
                    );

                    return;

                }

                witch.used.witchSave =
                    true;

                room.night.witchSave =
                    true;

                socket.emit(
                    "actionAccepted",
                    {

                        type:
                            "witchSave"

                    }
                );

                socket.emit(
                    "witchSaveAccepted",
                    {

                        message:
                            "🧪 Đã sử dụng bình cứu."

                    }
                );

                addAdminLog(
                    `Phù thủy ${witch.name} dùng bình cứu.`
                );

                sendAdminState();

            }
        );


        /* =====================================================
           ☠️ WITCH POISON - SELECT / UNSELECT / CHANGE UNTIL 10s REMAIN
        ===================================================== */

        socket.on(
            "witchPoison",
            data => {

                // WITCH POISON: accept throughout the authoritative first 50s.
                // Use the night action deadline directly instead of transient flags.
                if (
                    room.phase !== "night" ||
                    !room.night ||
                    room.night.mainActionsOpen !== true ||
                    !room.night.mainActionEndsAt ||
                    Date.now() >= room.night.mainActionEndsAt
                ) {
                    socket.emit("actionError", {
                        message: "Bình độc chỉ chọn được trong 50 giây đầu của đêm."
                    });
                    return;
                }

                const witch =
                    findPlayer(
                        socket.data.playerId
                    );

                const target =
                    findPlayer(
                        data?.targetId
                    );

                if (
                    !witch ||
                    !witch.alive ||
                    witch.role !== "Phù thủy"
                ) {
                    return;
                }

                if (
                    witch.used.witchPoison
                ) {
                    socket.emit(
                        "actionError",
                        {
                            message:
                                "Đã dùng bình độc."
                        }
                    );
                    return;
                }

                if (
                    data?.clear === true ||
                    data?.targetId == null
                ) {
                    room.night.witchPoisonDraftTargetId = null;

                    socket.emit(
                        "actionAccepted",
                        {
                            type:
                                "witchPoisonCleared",
                            targetId:
                                null
                        }
                    );

                    addAdminLog(
                        `Phù thủy ${witch.name} bỏ chọn mục tiêu độc.`
                    );

                    sendAdminState();
                    return;
                }

                if (
                    !target ||
                    !target.alive
                ) {
                    socket.emit(
                        "actionError",
                        {
                            message:
                                "Mục tiêu không hợp lệ."
                        }
                    );
                    return;
                }

                if (target.id === witch.id) {
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
                    addAdminLog(`Phù thủy ${witch.name} bỏ chọn mục tiêu độc.`);
                    sendAdminState();
                    return;
                }

                room.night.witchPoisonDraftTargetId = target.id;

                socket.emit("actionAccepted", {
                    type: "witchPoisonDraft",
                    targetId: target.id,
                    targetName: target.name
                });

                sendAdminState();
            }
        );


        /* =====================================================
           💘 CUPID
        ===================================================== */

        socket.on(
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
                        ? `Cupid ${cupid.name} đang chọn: ${draft.map(id => findPlayer(id)?.name).filter(Boolean).join(" ❤️ ")}`
                        : `Cupid ${cupid.name} đã bỏ chọn Couple.`
                );
                sendAdminState();
            }
        );


        /* =====================================================
           🏹 HUNTER SHOOT
        ===================================================== */

        socket.on(
            "hunterShoot",
            data => {
                if (
                    !room.pendingHunter ||
                    room.pendingHunter.id !== socket.data.playerId
                ) return;

                const hunter = findPlayer(socket.data.playerId);
                const target = findPlayer(data?.targetId);

                if (!hunter || !target || !target.alive || target.id === hunter.id) {
                    socket.emit("actionError", { message: "Mục tiêu không hợp lệ." });
                    return;
                }

                if (hunter.loverId && target.id === hunter.loverId) {
                    socket.emit("actionError", { message: "❤️ Thợ Săn không được bắn người yêu." });
                    return;
                }

                resolveHunterShot(target, false);
            }
        );


        /* =====================================================
           🗳️ DAY VOTE
        ===================================================== */

        socket.on(
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
                    addAdminLog(`${voter.name} hủy vote.`);
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
                    ? `${voter.name} hủy vote ${target.name}.`
                    : `${voter.name} vote ${target.name}.`);
                sendAdminState();
            }
        );


        /* =====================================================
           💬 CHAT
        ===================================================== */

        socket.on(
            "chatMessage",
            data => {

                const player =
                    findPlayer(
                        socket.data.playerId
                    );

                if (
                    !player
                ) {

                    return;

                }

                const text =
                    String(
                        data?.text || ""
                    ).trim();

                if (
                    !text ||
                    text.length > 300
                ) {

                    return;

                }

                /*
                 * CHAT COUPLE RIÊNG - chỉ 2 người trong Couple thấy.
                 * Client gửi { channel: "couple" }.
                 */
                if (
                    data?.channel === "couple"
                ) {

                    if (
                        !player.alive ||
                        !player.loverId
                    ) {

                        socket.emit(
                            "chatError",
                            {
                                message:
                                    "Bạn không có Couple đang sống để nhắn."
                            }
                        );

                        return;

                    }

                    const lover =
                        findPlayer(
                            player.loverId
                        );

                    if (
                        !lover ||
                        !lover.alive
                    ) {

                        socket.emit(
                            "chatError",
                            {
                                message:
                                    "Couple không còn đủ 2 người sống."
                            }
                        );

                        return;

                    }

                    const recipients =
                        [player, lover].filter(
                            p => p.connected
                        );

                    storeChatHistory(
                        {
                            playerId: player.id,
                            playerName: player.name,
                            text,
                            dead: false,
                            wolfChat: false,
                            coupleChat: true,
                            chatType: "couple"
                        },
                        [player, lover]
                    );

                    for (
                        const recipient
                        of recipients
                    ) {

                        io.to(
                            recipient.id
                        ).emit(
                            "chatMessage",
                            {
                                playerId:
                                    player.id,

                                playerName:
                                    player.name,

                                text,

                                dead:
                                    false,

                                wolfChat:
                                    false,

                                coupleChat:
                                    true,

                                chatType:
                                    "couple"
                            }
                        );

                    }

                    return;

                }


                /*
                 * CHAT PHÒNG CHỜ
                 */

                if (
                    !room.started &&
                    room.phase === "lobby"
                ) {

                    const recipients =
                        room.players.filter(
                            p =>
                                p.connected
                        );

                    storeChatHistory(
                        {
                            playerId: player.id,
                            playerName: player.name,
                            text,
                            dead: false,
                            wolfChat: false,
                            coupleChat: false,
                            chatType: "lobby"
                        },
                        recipients
                    );

                    for (
                        const recipient
                        of recipients
                    ) {

                        io.to(
                            recipient.id
                        ).emit(
                            "chatMessage",
                            {

                                playerId:
                                    player.id,

                                playerName:
                                    player.name,

                                text,

                                dead:
                                    false,

                                wolfChat:
                                    false,

                                coupleChat:
                                    false,

                                chatType:
                                    "lobby"

                            }
                        );

                    }

                    addLog(
                        `${player.name} nhắn trong phòng chờ.`
                    );

                    return;

                }

                /*
                 * NGƯỜI CHẾT
                 */

                if (
                    !player.alive
                ) {

                    const recipients =
                        room.players.filter(
                            p =>
                                !p.alive &&
                                p.connected
                        );

                    storeChatHistory(
                        {
                            playerId: player.id,
                            playerName: player.name,
                            text,
                            dead: true,
                            wolfChat: false,
                            coupleChat: false,
                            chatType: "dead"
                        },
                        recipients
                    );

                    for (
                        const recipient
                        of recipients
                    ) {

                        io.to(
                            recipient.id
                        ).emit(
                            "chatMessage",
                            {

                                playerId:
                                    player.id,

                                playerName:
                                    player.name,

                                text,

                                dead:
                                    true,

                                wolfChat:
                                    false,

                                coupleChat:
                                    false,

                                chatType:
                                    "dead"

                            }
                        );

                    }

                    return;

                }

                /*
                 * BAN NGÀY
                 */

                if (
                    room.phase === "daySpeech"
                ) {

                    const recipients =
                        room.players.filter(
                            p =>
                                p.connected
                        );

                    storeChatHistory(
                        {
                            playerId: player.id,
                            playerName: player.name,
                            text,
                            dead: false,
                            wolfChat: false,
                            coupleChat: false,
                            chatType: "public"
                        },
                        room.players
                    );

                    for (
                        const recipient
                        of recipients
                    ) {

                        io.to(
                            recipient.id
                        ).emit(
                            "chatMessage",
                            {

                                playerId:
                                    player.id,

                                playerName:
                                    player.name,

                                text,

                                dead:
                                    false,

                                wolfChat:
                                    false,

                                coupleChat:
                                    false,

                                chatType:
                                    "public"

                            }
                        );

                    }

                    return;

                }

                /*
                 * BAN ĐÊM - SÓI
                 */

                if (
                    room.phase === "night" &&
                    player.role === "Sói"
                ) {

                    const recipients =
                        room.players.filter(
                            p => {

                                if (
                                    !p.connected
                                ) {

                                    return false;

                                }

                                if (
                                    !p.alive
                                ) {

                                    return true;

                                }

                                if (
                                    p.role ===
                                    "Sói"
                                ) {

                                    return true;

                                }

                                return (
                                    player.loverId ===
                                    p.id
                                );

                            }
                        );

                    const lover =
                        player.loverId
                            ? findPlayer(
                                player.loverId
                            )
                            : null;

                    for (
                        const recipient
                        of recipients
                    ) {

                        const isCoupleRecipient =
                            player.loverId ===
                                recipient.id &&
                            recipient.alive;

                        const isWolfRecipient =
                            recipient.role ===
                                "Sói" ||
                            !recipient.alive;

                        storeChatHistory(
                            {
                                playerId: player.id,
                                playerName: player.name,
                                text,
                                dead: false,
                                wolfChat: isWolfRecipient,
                                coupleChat: isCoupleRecipient,
                                chatType: isCoupleRecipient ? "couple" : "wolf"
                            },
                            [recipient]
                        );

                        io.to(
                            recipient.id
                        ).emit(
                            "chatMessage",
                            {

                                playerId:
                                    player.id,

                                playerName:
                                    player.name,

                                text,

                                dead:
                                    false,

                                wolfChat:
                                    isWolfRecipient,

                                coupleChat:
                                    isCoupleRecipient,

                                chatType:
                                    isCoupleRecipient
                                        ? "couple"
                                        : "wolf"

                            }
                        );

                    }

                    addAdminLog(
                        `${player.name} nhắn ban đêm${
                            lover?.alive
                                ? " (Couple)"
                                : ""
                        }.`
                    );

                    return;

                }



                socket.emit(
                    "chatError",
                    {

                        message:
                            "Không thể chat lúc này."

                    }
                );

            }
        );


        /* =====================================================
           LEAVE
        ===================================================== */

        socket.on(
            "leaveRoom",
            () => {

                socket.emit(
                    "leftRoom"
                );

                handleDisconnect(
                    socket,
                    true
                );

                socket.data.playerId =
                    null;

            }
        );


        /* =====================================================
           DISCONNECT
        ===================================================== */

        socket.on(
            "disconnect",
            () => {

                handleDisconnect(
                    socket,
                    false
                );

            }
        );

    }
);


/* =========================================================
   HANDLE DISCONNECT
========================================================= */

function handleDisconnect(
    socket,
    voluntary
) {

    const player =
        findPlayer(
            socket.data.playerId
        );

    if (
        !player
    ) {

        return;

    }

    if (
        !player.connected
    ) {

        return;

    }


    /* =====================================================
       LOBBY
    ===================================================== */

    if (
        !room.started
    ) {

        player.connected =
            false;

        const wasHost =
            room.hostId ===
            player.id;

        room.players =
            room.players.filter(
                p =>
                    p.id !==
                    player.id
            );

        if (
            wasHost
        ) {

            chooseHost();

        }

        room.targetPlayerCount =
            room.players.length;

        addLog(
            `${player.name} ${
                voluntary
                    ? "rời phòng"
                    : "mất kết nối"
            }.`
        );

        addAdminLog(
            `${player.name} ${
                voluntary
                    ? "rời phòng"
                    : "mất kết nối"
            }.`
        );

        socket.data.playerId =
            null;

        emitRoom();

        sendAdminState();

        return;

    }


    /* =====================================================
       GAME RUNNING - VOLUNTARY
    ===================================================== */

    if (
        voluntary
    ) {

        player.leftGame =
            true;

        player.connected =
            false;

        if (player.alive) {
            room.exitedDeviceIds.add(
                player.deviceId || `id:${player.id}`
            );
        }

        if (
            player.alive
        ) {

            const deaths =
                killPlayer(
                    player,
                    "Rời game"
                );

            if (
                room.phase === "night"
            ) {

                room.pendingNightDeaths.push(
                    ...deaths
                );

                if (
                    room.pendingHunter?.id ===
                    player.id
                ) {

                    room.pendingHunter =
                        null;

                    if (
                        checkWinner()
                    ) {

                        return;

                    }

                    startDaySpeech(
                        room.night?.witchSave === true,
                        !!room.night?.witchPoisonTargetId
                    );

                    return;

                }

                broadcastPlayers();

                if (
                    checkWinner()
                ) {

                    return;

                }

            } else {

                if (
                    deaths.length
                ) {

                    finalDeaths(
                        deaths,
                        "voteResult",
                        {},
                        () => {

                            if (
                                checkWinner()
                            ) {

                                return;

                            }

                            startNight();

                        }
                    );

                } else {

                    broadcastPlayers();

                    checkWinner();

                }

            }

        }

        addAdminLog(
            `${player.name} rời game.`
        );

        emitRoom();

        sendAdminState();

        return;

    }


    /* =====================================================
       MẤT KẾT NỐI
    ===================================================== */

    player.connected =
        false;

    addLog(
        `${player.name} mất kết nối. Có thể vào lại game.`
    );

    addAdminLog(
        `${player.name} mất kết nối. Chờ kết nối lại.`
    );

    if (autoResetForInactivePlayers()) {
        return;
    }


    /* =====================================================
       HUNTER
    ===================================================== */

    if (
        room.pendingHunter?.id ===
        player.id
    ) {
        addAdminLog(
            `Thợ săn ${player.name} mất kết nối; hết 15 giây hệ thống vẫn random mục tiêu trả thù.`
        );

        broadcastPlayers();
        sendAdminState();
        return;
    }


    /*
     * Mất mạng KHÔNG chết.
     * Có thể reconnect bằng deviceId.
     */

    broadcastPlayers();

    sendAdminState();

}


/* =========================================================
   START SERVER
========================================================= */

server.listen(
    PORT,
    () => {

        console.log(
            `🐺 Ma Sói Server chạy port ${PORT}`
        );

        console.log(
            `👥 Người chơi: ${MIN_PLAYERS}-${MAX_PLAYERS}`
        );

        console.log(
            `🌙 Sói + vai đêm: ${TIME.night} giây`
        );

        console.log(
            `🧙 Phù thủy: độc ${TIME.witchPoison}s / cứu ${TIME.witchSave}s`
        );

        console.log(
            `☀️ Ban ngày: ${TIME.daySpeech} giây`
        );

        console.log(
            `🗳️ Vote: ${TIME.dayVote} giây`
        );

        console.log(
            `🐺 Sói không thể vote Sói`
        );

        console.log(
            `🐺 Realtime Wolf Vote: ON`
        );

        console.log(
            `🛡️ Bảo vệ không được bảo vệ cùng người 2 đêm liên tiếp`
        );

        console.log(
            `🎵 Music: lobby / night / witch / daySpeech / dayVote / wolfWin / villageWin / coupleWin / draw`
        );

        console.log(
            `🌐 Frontend: ${FRONTEND_URL}`
        );

    }
);
