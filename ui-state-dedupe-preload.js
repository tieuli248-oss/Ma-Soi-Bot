// Suppress duplicate realtime state broadcasts that cause unnecessary frontend redraws.
// Applied to server-unified.js source before compilation.

function patchUiStateDedupe(source) {
    if (typeof source !== "string") return source;

    const observerMarker = `function sendTestObserverState() {\n    if (!room.testMode || !room.hostId) return;\n    const host = findPlayer(room.hostId);\n    if (!host?.connected) return;`;

    if (source.includes(observerMarker) && !source.includes("__lastTestObserverSignature")) {
        source = source.replace(
            observerMarker,
            `${observerMarker}\n\n    const __observerSignature = JSON.stringify({\n        phase: room.phase,\n        nightNumber: room.nightNumber,\n        players: room.players.map(p => [\n            p.id, p.name, p.role, p.alive, p.connected, p.ready,\n            p.loverId || null, p.dayVoteTargetId || null\n        ]),\n        wolfVotes: room.night?.wolfVotes ? [...room.night.wolfVotes] : [],\n        wolfTargetId: room.night?.wolfTargetId || null,\n        guardTargetId: room.night?.guardTargetId || null,\n        seerInspections: room.night?.seerInspections || [],\n        witchPoisonDraftTargetId: room.night?.witchPoisonDraftTargetId || null,\n        witchPoisonTargetId: room.night?.witchPoisonTargetId || null,\n        witchSave: room.night?.witchSave === true,\n        cupidDraftIds: room.night?.cupidDraftIds || [],\n        pendingHunter: room.pendingHunter || null,\n        dayVotes: [...(room.dayVotes || new Map())]\n    });\n\n    if (room.__lastTestObserverSignature === __observerSignature) return;\n    room.__lastTestObserverSignature = __observerSignature;`
        );
    }

    const playersMarker = `function broadcastPlayers() {`;
    if (source.includes(playersMarker) && !source.includes("__lastPlayersBroadcastSignature")) {
        source = source.replace(
            playersMarker,
            `${playersMarker}\n\n    const __playersSignature = JSON.stringify(publicPlayers());\n    if (room.__lastPlayersBroadcastSignature === __playersSignature) return;\n    room.__lastPlayersBroadcastSignature = __playersSignature;`
        );
    }

    const dayVoteMarker = `function sendDayVoteState(targetSocketId = null) {\n    if (room.phase !== "dayVote") return;`;
    if (source.includes(dayVoteMarker) && !source.includes("__lastDayVoteBroadcastSignature")) {
        source = source.replace(
            dayVoteMarker,
            `${dayVoteMarker}\n\n    if (!targetSocketId) {\n        const __dayVoteSignature = JSON.stringify([...room.dayVotes]);\n        if (room.__lastDayVoteBroadcastSignature === __dayVoteSignature) return;\n        room.__lastDayVoteBroadcastSignature = __dayVoteSignature;\n    }`
        );
    }

    console.log("[UI STATE DEDUPE] duplicate observer/player/vote broadcasts suppressed");
    return source;
}

module.exports = { patchUiStateDedupe };
