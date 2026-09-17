// Prevent bot players from ever becoming room host.
// Loaded through NODE_OPTIONS before server-unified.js.

if (!global.__MASOI_HUMAN_HOST_PRELOAD__) {
    global.__MASOI_HUMAN_HOST_PRELOAD__ = true;

    const fs = require("fs");
    const path = require("path");
    const Module = require("module");

    const previousLoader = Module._extensions[".js"];

    Module._extensions[".js"] = function (module, filename) {
        if (path.basename(filename) !== "server-unified.js") {
            return previousLoader(module, filename);
        }

        let source = fs.readFileSync(filename, "utf8");

        // Apply the isolated AI patch here, after the existing fs preloads
        // (autofill + AI chat) have already transformed server-unified.js.
        // This deliberately leaves timers, roles, audio, reconnect and admin logic untouched.
        try {
            const { patchSmartAI } = require("./smart-ai-runtime-preload.js");
            source = patchSmartAI(source);
            console.log("[SMART AI PATCH] chat leak filter + fair bot vote enabled");
        } catch (err) {
            console.error("[SMART AI PATCH] failed", err);
        }

        const originalChooseHost = `function chooseHost() {\n\n    room.hostId =\n        room.players.find(\n            p =>\n                p.connected\n        )?.id ||\n        null;\n\n}`;

        const humanOnlyChooseHost = `function chooseHost() {\n\n    // Bot tuyệt đối không được làm Host.\n    // Chỉ chuyển Host cho người thật còn kết nối.\n    const nextHost =\n        room.players.find(\n            p =>\n                p.connected &&\n                p.isBot !== true\n        ) ||\n        null;\n\n    room.hostId =\n        nextHost?.id ||\n        null;\n\n    return room.hostId;\n\n}`;

        if (source.includes(originalChooseHost)) {
            source = source.replace(originalChooseHost, humanOnlyChooseHost);
        } else {
            // Fallback for formatting differences.
            source = source.replace(
                /function chooseHost\(\) \{[\s\S]*?room\.hostId\s*=\s*room\.players\.find\(\s*p\s*=>\s*p\.connected\s*\)\?\.id\s*\|\|\s*null;[\s\S]*?\n\}/m,
                humanOnlyChooseHost
            );
        }

        console.log("[HOST PATCH] bots can never become host; human-only host transfer");
        return module._compile(source, filename);
    };
}