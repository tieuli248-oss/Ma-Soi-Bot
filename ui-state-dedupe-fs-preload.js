// Active fs preload for duplicate realtime-state suppression.
// Load after ai-chat-preload.js and before event-realtime-preload.js.

if (!global.__MASOI_UI_STATE_DEDUPE_FS_PRELOAD__) {
    global.__MASOI_UI_STATE_DEDUPE_FS_PRELOAD__ = true;

    const fs = require("fs");
    const path = require("path");
    const previousReadFileSync = fs.readFileSync.bind(fs);
    const { patchUiStateDedupe } = require("./ui-state-dedupe-preload.js");

    fs.readFileSync = function uiStateDedupeReadFileSync(filename, ...args) {
        const result = previousReadFileSync(filename, ...args);

        try {
            if (path.basename(String(filename)) !== "server-unified.js") {
                return result;
            }

            if (typeof result === "string") {
                const patched = patchUiStateDedupe(result);
                console.log("[UI STATE DEDUPE PATCH] active fs preload applied");
                return patched;
            }

            if (Buffer.isBuffer(result)) {
                const text = result.toString("utf8");
                const patched = patchUiStateDedupe(text);
                console.log("[UI STATE DEDUPE PATCH] active fs preload applied");
                return Buffer.from(patched, "utf8");
            }
        } catch (err) {
            console.error("[UI STATE DEDUPE PATCH] failed", err);
        }

        return result;
    };
}
