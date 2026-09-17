// SMART AI RUNTIME PATCH 2026-09-17
// Isolated patch: only bot chat sanitizing, bot Seer memory and bot day-vote fairness.
// Loaded through NODE_OPTIONS before server-unified.js.

if (!global.__MASOI_SMART_AI_RUNTIME__) {
  global.__MASOI_SMART_AI_RUNTIME__ = true;
  const fs = require("fs");
  const path = require("path");
  const prevReadFileSync = fs.readFileSync.bind(fs);

  function patchSmartAI(source) {
    if (typeof source !== "string" || path.basename("server-unified.js") !== "server-unified.js") return source;
    if (source.includes("SMART_AI_RUNTIME_20260917_ACTIVE")) return source;

    // 1) Stop model-internal English / safety / reasoning text from reaching game chat.
    source = source.replace(
      /function aiBotClean\(raw\)\{[\s\S]*?\n\}/,
`function aiBotLooksLikeInternalLeak(text){
  const t=String(text||"").trim();
  if(!t)return true;
  const low=t.toLowerCase();
  const blocked=[
    "user safety","thinking process","analyze user","chain of thought","reasoning process",
    "system prompt","developer message","safety policy","policy check","here's a thinking",
    "here is a thinking","internal analysis","internal reasoning","assistant:","system:"
  ];
  if(blocked.some(x=>low.includes(x)))return true;
  if(/<\\/?(?:think|analysis|reasoning)>/i.test(t))return true;
  if(/^\\s*[\\[{].*[\\]}]\\s*$/s.test(t))return true;
  const letters=(t.match(/[a-z]/gi)||[]).length;
  const vi=(t.match(/[ăâđêôơưàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]/gi)||[]).length;
  if(letters>55 && vi===0 && /\\b(the|user|assistant|safety|process|response|should|because|analysis)\\b/i.test(t))return true;
  return false;
}

function aiBotClean(raw){
  let t=String(raw||"").trim();
  t=t.replace(/<think>[\\s\\S]*?<\\/think>/gi,"")
     .replace(/<analysis>[\\s\\S]*?<\\/analysis>/gi,"")
     .replace(/<reasoning>[\\s\\S]*?<\\/reasoning>/gi,"")
     .replace(/^\\x60\\x60\\x60[a-z]*\\s*/i,"")
     .replace(/\\x60\\x60\\x60$/i,"").trim();
  t=t.replace(/^([\"“”'\\x60]+)|([\"“”'\\x60]+)$/g,"").replace(/\\s+/g," ").trim();
  if(aiBotLooksLikeInternalLeak(t))return "";
  if(t.length>AI_BOT_CONFIG.maxReplyChars)t=t.slice(0,AI_BOT_CONFIG.maxReplyChars).trim();
  if(!t||/^(assistant|system|bot)\\s*:/i.test(t))return "";
  if(/^(chết rồi mà|tui vẫn ở đây|khoan chốt vội|tui chưa chốt nghi ai)[.! ]*$/i.test(t))return "";
  return t;
}`
    );

    // 2) Make prompt explicitly role-play only; no internal explanation or filler.
    source = source.replace(
      'const AI_BOT_SYSTEM = "Bạn là người chơi Ma Sói trong một phòng chat thật. Phải bám sát chủ đề hội thoại vừa diễn ra, trả lời trực tiếp và có lập luận cụ thể. Không tự chuyển chủ đề, không nói câu xã giao chung chung, không bịa dữ kiện, không dùng thông tin vai ẩn ngoài context.";',
      'const AI_BOT_SYSTEM = "Bạn chỉ nhập vai một người chơi Ma Sói trong phòng chat thật. Chỉ xuất đúng lời chat tiếng Việt của nhân vật, không giải thích cách suy nghĩ. Bám sát hội thoại, trả lời trực tiếp và có lý do cụ thể từ dữ kiện được phép biết. Không tự chuyển chủ đề, không nói câu xã giao vô nghĩa, không bịa dữ kiện, không dùng vai ẩn ngoài context. Tuyệt đối không xuất analysis, reasoning, thinking process, safety, policy, system prompt, JSON hay markdown.";'
    );

    // 3) Persist bot Seer inspection in the same legal inspection store used by the game.
    source = source.replace(
      'const result = target.role === "Dân" ? "THIỆN" : "KHÔNG RÕ";\n            testEmitHostEvent("🤖 " + seer.name + " (Tiên tri) soi " + target.name + " → " + result + ".");',
      'const result = target.role === "Dân" ? "THIỆN" : "KHÔNG RÕ";\n            if (room.night && Array.isArray(room.night.seerInspections)) {\n                room.night.seerInspections.push({ seerId: seer.id, seerName: seer.name, targetId: target.id, targetName: target.name, result, time: Date.now() });\n            }\n            testEmitHostEvent("🤖 " + seer.name + " (Tiên tri) soi " + target.name + " → " + result + ".");'
    );

    // 4) Fair bot vote: no host targeting, no village role-cheating, no instant bot dogpile.
    source = source.replace(
      /function runTestBotDayVote\(\) \{[\s\S]*?\n\}\n\nconst testBotTicker/,
`function runTestBotDayVote() {
    if (!(room.testMode || (typeof hasLiveAutoFillBots === "function" && hasLiveAutoFillBots())) || !room.started || room.phase !== "dayVote") return;
    const bots = room.players.filter(p => p.isBot && p.alive);
    const phaseKey = "dayVote:" + room.nightNumber;
    const now = Date.now();

    for (const bot of bots) {
        if (room.dayVotes.has(bot.id) || bot._smartVotePending) continue;
        if (bot._smartVotePhaseKey !== phaseKey) {
            bot._smartVotePhaseKey = phaseKey;
            bot._smartVoteReadyAt = now + 3500 + (aiBotHash(bot.deviceId || bot.id) % 6500);
        }
        if (now < bot._smartVoteReadyAt) continue;

        let candidates = alivePlayers().filter(p => p.id !== bot.id && p.id !== bot.loverId);
        if (bot.role === "Sói") candidates = candidates.filter(p => p.role !== "Sói");
        if (!candidates.length) continue;

        let target = (typeof botStrategyDayTarget === "function")
            ? botStrategyDayTarget(bot, candidates)
            : candidates[aiBotHash((bot.id || "") + phaseKey) % candidates.length];

        // Do not let bots manufacture a majority by copying only other bots.
        if (target) {
            const voters = Array.from(room.dayVotes.entries())
                .filter(([, targetId]) => targetId === target.id)
                .map(([voterId]) => findPlayer(voterId))
                .filter(Boolean);
            const botPile = voters.filter(p => p.isBot).length;
            const humanSupport = voters.filter(p => !p.isBot).length;
            const remainMs = Math.max(0, Number(room.timerEndsAt || 0) - now);
            if (botPile >= 2 && humanSupport === 0 && remainMs > 8000) {
                const alternatives = candidates.filter(p => p.id !== target.id);
                if (alternatives.length) {
                    target = (typeof botStrategyPickHighest === "function" && typeof botStrategySuspicionScore === "function")
                        ? botStrategyPickHighest(alternatives, p => botStrategySuspicionScore(bot, p))
                        : alternatives[aiBotHash((bot.id || "") + "alt" + phaseKey) % alternatives.length];
                }
            }
        }

        if (!target) continue;
        room.dayVotes.set(bot.id, target.id);
        bot.dayVoteTargetId = target.id;
        testEmitHostEvent("🤖 " + bot.name + " (" + bot.role + ") bỏ phiếu cho " + target.name + ".");
    }
    if (typeof sendDayVoteState === "function") sendDayVoteState();
    if (typeof broadcastPlayers === "function") broadcastPlayers();
    sendTestObserverState();
}

const SMART_AI_RUNTIME_20260917_ACTIVE = true;

const testBotTicker`
    );

    return source;
  }

  fs.readFileSync = function smartAIRead(filename, ...args) {
    const result = prevReadFileSync(filename, ...args);
    try {
      if (path.basename(String(filename)) !== "server-unified.js") return result;
      if (typeof result === "string") return patchSmartAI(result);
      if (Buffer.isBuffer(result)) return Buffer.from(patchSmartAI(result.toString("utf8")), "utf8");
    } catch (err) {
      console.error("[SMART AI PATCH] failed", err);
    }
    return result;
  };
}
