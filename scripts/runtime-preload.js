/*
 * Runtime patch for the existing Ma-Soi-Bot service.
 * It preserves the current build-unified-server.js finalizer, then adds
 * server-authoritative TEST BOT consent + role-config sync.
 * No new server is created.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'server-unified.js');
const MARKER = '// SERVER CONSENT PATCH 2026-09-15';

function mustReplace(source, oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`[CONSENT PATCH] missing anchor: ${label}`);
  return source.replace(oldText, newText);
}

function patchSegment(source, startNeedle, endNeedle, transform, label) {
  const a = source.indexOf(startNeedle);
  if (a < 0) throw new Error(`[CONSENT PATCH] missing segment start: ${label}`);
  const b = source.indexOf(endNeedle, a + startNeedle.length);
  if (b < 0) throw new Error(`[CONSENT PATCH] missing segment end: ${label}`);
  const before = source.slice(0, a);
  const segment = source.slice(a, b);
  const after = source.slice(b);
  const next = transform(segment);
  if (next === segment) throw new Error(`[CONSENT PATCH] segment unchanged: ${label}`);
  return before + next + after;
}

function applyConsentPatch(source) {
  if (source.includes(MARKER)) return source;

  const helpers = `\n${MARKER}\n/* =========================================================\n   TEST BOT CONSENT - SERVER AUTHORITATIVE\n========================================================= */\nfunction __emptyTestConsent() {\n    return { active:false, cycleId:0, round:0, requestSeq:0, requestTargets:[], responses:{}, askedAt:0 };\n}\nfunction __resetTestConsent() { room.testConsent = __emptyTestConsent(); }\nfunction __realTestHumans() {\n    return room.players.filter(p => !p.isBot && p.connected !== false && p.leftGame !== true);\n}\nfunction __testConsentMembers() { return __realTestHumans().filter(p => p.id !== room.hostId); }\nfunction __testConsentState() {\n    const c = room.testConsent || __emptyTestConsent();\n    const members = __testConsentMembers().map(p => ({ id:p.id, name:p.name, state:c.responses?.[p.id] || 'pending' }));\n    return {\n        active: !!c.active,\n        cycleId: Number(c.cycleId || 0),\n        round: Number(c.round || 0),\n        requestSeq: Number(c.requestSeq || 0),\n        requestTargets: [...(c.requestTargets || [])],\n        responses: { ...(c.responses || {}) },\n        members,\n        allApproved: members.every(x => x.state === 'ok'),\n        hasPending: members.some(x => x.state === 'pending'),\n        hasRejected: members.some(x => x.state === 'no')\n    };\n}\nfunction __emitTestConsentState(targetId = null) {\n    const state = __testConsentState();\n    if (targetId) io.to(targetId).emit('testConsentState', state);\n    else io.emit('testConsentState', state);\n    if (!state.active) return state;\n    for (const playerId of state.requestTargets) {\n        if (state.responses[playerId] !== 'pending') continue;\n        const target = findPlayer(playerId);\n        if (!target?.connected) continue;\n        io.to(target.id).emit('testConsentRequest', {\n            cycleId: state.cycleId, round: state.round, requestSeq: state.requestSeq,\n            hostId: room.hostId, hostName: findPlayer(room.hostId)?.name || 'Host',\n            selectedRole: room.testRoleAssignments?.[target.id] || 'Random'\n        });\n    }\n    return state;\n}\nfunction __beginTestConsentCycle() {\n    const members = __testConsentMembers();\n    if (!members.length) { __resetTestConsent(); return __testConsentState(); }\n    room.testConsent = {\n        active:true, cycleId:Date.now(), round:1, requestSeq:1,\n        requestTargets:members.map(p=>p.id),\n        responses:Object.fromEntries(members.map(p=>[p.id,'pending'])),\n        askedAt:Date.now()\n    };\n    return __emitTestConsentState();\n}\nfunction __addTestConsentMember(player) {\n    if (!room.testMode || !player || player.id === room.hostId) return;\n    const c = room.testConsent || __emptyTestConsent();\n    if (!c.active) {\n        c.active = true; c.cycleId = Date.now(); c.round = 1; c.requestSeq = 1; c.responses = {}; c.requestTargets = [];\n    }\n    c.responses[player.id] = 'pending';\n    if (!c.requestTargets.includes(player.id)) c.requestTargets.push(player.id);\n    c.askedAt = Date.now();\n    room.testConsent = c;\n    __emitTestConsentState();\n}\nfunction __retryRejectedTestConsent() {\n    const c = room.testConsent || __emptyTestConsent();\n    const rejected = __testConsentMembers().filter(p => c.responses?.[p.id] === 'no');\n    if (!rejected.length) return __testConsentState();\n    c.active = true;\n    c.round = Math.min(3, Math.max(1, Number(c.round || 1)) + 1);\n    c.requestSeq = Number(c.requestSeq || 0) + 1;\n    c.requestTargets = rejected.map(p => p.id);\n    for (const p of rejected) c.responses[p.id] = 'pending';\n    c.askedAt = Date.now();\n    room.testConsent = c;\n    return __emitTestConsentState();\n}\nfunction __disableTestModeToLobby() {\n    room.testMode = false;\n    room.players = room.players.filter(p => !p.isBot);\n    room.testConfig = null; room.testHumanId = null; room.testRoleAssignments = {};\n    room.testBotWolfNight = null; room.testBotWolfTargetId = null;\n    room.targetPlayerCount = room.players.length;\n    __resetTestConsent();\n}\nfunction __rotateHostAfterConsentFailure() {\n    const candidates = __testConsentMembers().filter(p => p.connected !== false);\n    if (!candidates.length) return false;\n    const oldHost = findPlayer(room.hostId);\n    const newHost = candidates[Math.floor(Math.random() * candidates.length)];\n    room.hostId = newHost.id;\n    __disableTestModeToLobby();\n    io.emit('hostChanged', {\n        reason:'testBotRefusal', oldHostId:oldHost?.id || null, oldHostName:oldHost?.name || null,\n        newHostId:newHost.id, newHostName:newHost.name,\n        message:'👑 ' + newHost.name + ' là Host mới vì TEST BOT đã bị từ chối đủ 3 lần.'\n    });\n    io.emit('testBotDisabled', { enabled:false, message:'TEST BOT đã tắt; Lobby trở lại chế độ người thật.' });\n    __emitTestConsentState();\n    emitRoom(); sendAdminState();\n    return true;\n}\nfunction __validateTestRoleConfig(count, requested) {\n    if (!ALLOWED_SIZES.includes(count)) return { ok:false, message:'Số người phải từ 6 đến 15.' };\n    const humans = __realTestHumans();\n    if (humans.length > count) return { ok:false, message:'Đang có ' + humans.length + ' máy thật, nhiều hơn bàn ' + count + ' người.' };\n    const remaining = {};\n    for (const role of getRoleComposition(count)) remaining[role] = (remaining[role] || 0) + 1;\n    const clean = {};\n    for (const human of humans) {\n        const role = String(requested?.[human.id] || '').trim();\n        if (!role || role === 'Random') continue;\n        if (!testAllowedRoles(count).includes(role)) return { ok:false, message:role + ' không có trong bàn ' + count + ' người.' };\n        if (!remaining[role]) return { ok:false, message:'Không đủ slot vai ' + role + ' cho các máy thật đã chọn.' };\n        remaining[role]--; clean[human.id] = role;\n    }\n    return { ok:true, clean };\n}\nfunction __emitTestRoleConfig(targetId = null) {\n    const count = Number(room.testConfig?.count || room.targetPlayerCount || Math.max(MIN_PLAYERS, room.players.length));\n    const assignments = { ...(room.testRoleAssignments || {}) };\n    const host = findPlayer(room.hostId);\n    if (host?.connected && (!targetId || targetId === host.id)) {\n        io.to(host.id).emit('testRoleConfigState', { count, roleAssignments:assignments, allowedRoles:testAllowedRoles(count), roleComposition:getRoleComposition(count) });\n    }\n    for (const p of __realTestHumans()) {\n        if (!p.connected || p.id === room.hostId || (targetId && targetId !== p.id)) continue;\n        io.to(p.id).emit('testRoleSelection', { count, role:assignments[p.id] || 'Random' });\n    }\n}\n`;

  const testMarker = '/* =========================================================\n   TEST MODE / SERVER-SIDE BOTS\n========================================================= */';
  if (!source.includes(testMarker)) throw new Error('[CONSENT PATCH] missing TEST MODE marker');
  source = source.replace(testMarker, helpers + '\n' + testMarker);

  source = patchSegment(source, 'socket.on("startTestGame"', 'socket.on("stopTestGame"', seg => {
    const anchor = 'const count = Number(data?.count || 10);';
    if (!seg.includes(anchor)) throw new Error('[CONSENT PATCH] startTestGame count anchor changed');
    const gate = `if (!room.testMode) {\n                socket.emit('actionError', { message:'Hãy bật TEST BOT trước.' });\n                return;\n            }\n\n            const __consent = __testConsentState();\n            if (__consent.active && __consent.hasPending) {\n                socket.emit('actionError', { message:'Đang chờ người chơi phản hồi TEST BOT.' });\n                __emitTestConsentState();\n                return;\n            }\n            if (__consent.active && __consent.hasRejected) {\n                if (__consent.round < 3) {\n                    __retryRejectedTestConsent();\n                    socket.emit('actionError', { message:'Đã hỏi lại TEST BOT lần ' + (__consent.round + 1) + '/3.' });\n                } else {\n                    __rotateHostAfterConsentFailure();\n                }\n                return;\n            }\n\n            `;
    seg = seg.replace(anchor, gate + "const count = Number(data?.count || room.testConfig?.count || 10);");
    const reqOld = 'const requested = data?.roleAssignments && typeof data.roleAssignments === "object" ? data.roleAssignments : {};';
    if (seg.includes(reqOld)) {
      seg = seg.replace(reqOld, 'const requested = data?.roleAssignments && typeof data.roleAssignments === "object" ? data.roleAssignments : { ...(room.testRoleAssignments || {}) };');
    }
    const botAnchor = 'room.testBotWolfTargetId = null;';
    if (!seg.includes(botAnchor)) throw new Error('[CONSENT PATCH] startTestGame bot anchor changed');
    seg = seg.replace(botAnchor, botAnchor + '\n            __resetTestConsent();');
    return seg;
  }, 'startTestGame');

  source = patchSegment(source, 'socket.on("setTestBotEnabled"', '/* =====================================================\n           ADMIN LOGIN', seg => {
    const anchor = 'room.testMode = enabled;';
    if (!seg.includes(anchor)) throw new Error('[CONSENT PATCH] setTestBotEnabled mode anchor changed');
    seg = seg.replace(anchor, anchor + "\n\n            if (enabled) __beginTestConsentCycle();\n            else __resetTestConsent();");
    const tail = 'sendAdminState();';
    const pos = seg.lastIndexOf(tail);
    if (pos < 0) throw new Error('[CONSENT PATCH] setTestBotEnabled tail changed');
    seg = seg.slice(0,pos) + "__emitTestConsentState();\n            __emitTestRoleConfig();\n            " + seg.slice(pos);
    return seg;
  }, 'setTestBotEnabled');

  const joinAnchor = 'room.players.push(\n                    player\n                );';
  if (!source.includes(joinAnchor)) throw new Error('[CONSENT PATCH] lobby join anchor changed');
  source = source.replace(joinAnchor, joinAnchor + '\n\n                if (room.testMode) __addTestConsentMember(player);');

  const extraConnection = `\n\n/* =========================================================\n   TEST BOT CONSENT/ROLE SYNC SOCKETS - 2026-09-15\n========================================================= */\nio.on('connection', socket => {\n    socket.on('requestTestSync', () => {\n        const player = findPlayer(socket.data.playerId);\n        if (!player) return;\n        __emitTestConsentState(player.id);\n        __emitTestRoleConfig(player.id);\n        socket.emit('testModeState', { enabled: room.testMode === true });\n    });\n\n    socket.on('respondTestBotConsent', data => {\n        if (room.started || !room.testMode) return;\n        const player = findPlayer(socket.data.playerId);\n        if (!player || player.id === room.hostId) return;\n        const c = room.testConsent || __emptyTestConsent();\n        if (!c.active || !c.requestTargets.includes(player.id) || c.responses?.[player.id] !== 'pending') return;\n        c.responses[player.id] = data?.ok === true ? 'ok' : 'no';\n        c.lastResponseAt = Date.now();\n        room.testConsent = c;\n        __emitTestConsentState();\n        addAdminLog('TEST BOT consent: ' + player.name + ' = ' + c.responses[player.id] + ' (lần ' + c.round + '/3).');\n    });\n\n    socket.on('setTestRoleConfig', data => {\n        if (room.started || !room.testMode) return;\n        const player = findPlayer(socket.data.playerId);\n        if (!player || player.id !== room.hostId) {\n            socket.emit('actionError', { message:'Chỉ Host mới được cấu hình vai TEST BOT.' });\n            return;\n        }\n        const count = Number(data?.count || room.testConfig?.count || 10);\n        const requested = data?.roleAssignments && typeof data.roleAssignments === 'object' ? data.roleAssignments : { ...(room.testRoleAssignments || {}) };\n        const checked = __validateTestRoleConfig(count, requested);\n        if (!checked.ok) { socket.emit('actionError', { message:checked.message }); return; }\n        room.targetPlayerCount = count;\n        room.testRoleAssignments = { ...checked.clean };\n        room.testConfig = { count, roleAssignments:{ ...checked.clean } };\n        __emitTestRoleConfig();\n        emitRoom(); sendAdminState();\n    });\n});\n`;

  const listenIndex = source.lastIndexOf('server.listen(');
  if (listenIndex < 0) throw new Error('[CONSENT PATCH] server.listen anchor missing');
  source = source.slice(0, listenIndex) + extraConnection + '\n' + source.slice(listenIndex);

  return source;
}

let source = fs.readFileSync(SERVER, 'utf8');
if (!source.includes(MARKER)) {
  if (process.env.MASOI_SKIP_BASE_FINALIZER !== '1') {
    require(path.join(__dirname, 'build-unified-server.js'));
    source = fs.readFileSync(SERVER, 'utf8');
  }
  const patched = applyConsentPatch(source);
  fs.writeFileSync(SERVER, patched, 'utf8');
  console.log('[CONSENT PATCH] server-unified.js patched');
} else {
  console.log('[CONSENT PATCH] server-unified.js already patched');
}
