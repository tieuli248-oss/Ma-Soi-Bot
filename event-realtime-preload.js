// Realtime bridge for room.eventHistory -> frontend "gameEvent".
// Loaded with NODE_OPTIONS=--require ./event-realtime-preload.js
// Keeps server-unified.js logic untouched.

if (!global.__MASOI_EVENT_REALTIME_PRELOAD__) {
    global.__MASOI_EVENT_REALTIME_PRELOAD__ = true;

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
