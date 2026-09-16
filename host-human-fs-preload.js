// Human-only host patch. Must load before autofill-preload.js.
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
            return source.replace(originalChooseHost, humanOnlyChooseHost);
        }

        return source.replace(
            /function chooseHost\(\) \{[\s\S]*?room\.hostId\s*=\s*room\.players\.find\(\s*p\s*=>\s*p\.connected\s*\)\?\.id\s*\|\|\s*null;[\s\S]*?\n\}/m,
            humanOnlyChooseHost
        );
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
                return patched;
            }

            if (Buffer.isBuffer(result)) {
                const patched = patchHostSelection(result.toString("utf8"));
                console.log("[HOST PATCH] bot cannot become host; human-only transfer");
                return Buffer.from(patched, "utf8");
            }
        } catch (err) {
            console.error("[HOST PATCH] failed", err);
        }

        return result;
    };
}
