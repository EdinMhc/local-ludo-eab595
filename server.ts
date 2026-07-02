// ---------------------------------------------------------------------------
// Custom Next.js server + Socket.io on a single process (one Railway service).
// Run with tsx:  `tsx server.ts` (prod) / `tsx watch server.ts` (dev).
// ---------------------------------------------------------------------------
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketServer, Socket } from "socket.io";

import { RoomManager, RoomEmitter } from "./server/rooms";
import {
  getLeaderboard,
  getMoveTimerSeconds,
  getRecentRounds,
  setMoveTimerSeconds,
} from "./server/db";
import type {
  AdminData,
  ClientToServerEvents,
  ServerToClientEvents,
} from "./shared/protocol";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123*5";

interface SocketData {
  clientId: string;
  code?: string;
}

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url || "", true));
  });

  const io = new SocketServer<ClientToServerEvents, ServerToClientEvents, {}, SocketData>(
    httpServer,
    { cors: { origin: true } }
  );

  const adminSockets = new Set<string>();

  const buildAdminData = (): AdminData => ({
    moveTimerSeconds: getMoveTimerSeconds(),
    leaderboard: getLeaderboard(),
    recentRounds: getRecentRounds(),
    rooms: manager.adminRoomSummaries(),
  });

  const pushAdmins = () => {
    if (adminSockets.size === 0) return;
    const data = buildAdminData();
    adminSockets.forEach((id) => io.to(id).emit("admin:update", data));
  };

  const emitter: RoomEmitter = {
    update: (code, view) => io.to(code).emit("room:update", view),
    closed: (code, reason) => io.to(code).emit("room:closed", { reason }),
    kicked: (socketId, reason) => io.to(socketId).emit("room:closed", { reason }),
    adminChanged: () => pushAdmins(),
  };

  const manager = new RoomManager(emitter);

  const sendRoom = (socket: AppSocket, code: string) => {
    const view = manager.viewOf(code);
    if (view) socket.emit("room:update", view);
  };

  io.on("connection", (socket: AppSocket) => {
    const clientId = (socket.handshake.auth?.clientId as string) || socket.id;
    socket.data.clientId = clientId;

    // ---- room lifecycle ----
    socket.on("room:create", ({ name }, ack) => {
      const room = manager.createRoom(clientId, socket.id, name);
      socket.join(room.code);
      socket.data.code = room.code;
      sendRoom(socket, room.code);
      ack({ ok: true, data: { code: room.code } });
    });

    socket.on("room:join", ({ code, name }, ack) => {
      const result = manager.joinRoom(clientId, socket.id, code, name);
      if ("error" in result) {
        ack({ ok: false, error: result.error });
        return;
      }
      socket.join(result.room.code);
      socket.data.code = result.room.code;
      sendRoom(socket, result.room.code);
      ack({ ok: true, data: { code: result.room.code } });
    });

    socket.on("room:leave", () => {
      manager.leaveRoom(clientId);
      if (socket.data.code) socket.leave(socket.data.code);
      socket.data.code = undefined;
    });

    // ---- lobby ----
    socket.on("lobby:pickColor", ({ color }, ack) => {
      const res = manager.pickColor(clientId, color);
      ack(res.error ? { ok: false, error: res.error } : { ok: true });
    });

    socket.on("lobby:ready", ({ ready }) => manager.setReady(clientId, ready));

    socket.on("lobby:start", (ack) => {
      const res = manager.startGame(clientId);
      ack(res.error ? { ok: false, error: res.error } : { ok: true });
    });

    // ---- gameplay ----
    socket.on("game:roll", () => manager.roll(clientId));
    socket.on("game:move", ({ tokenId }) => manager.move(clientId, tokenId));
    socket.on("game:playAgain", () => manager.playAgain(clientId));

    // ---- admin ----
    const requireAdmin = (password: string, ack?: (r: any) => void): boolean => {
      if (password === ADMIN_PASSWORD) return true;
      ack?.({ ok: false, error: "Wrong admin password." });
      return false;
    };

    socket.on("admin:auth", ({ password }, ack) => {
      if (!requireAdmin(password, ack)) return;
      adminSockets.add(socket.id);
      ack({ ok: true, data: buildAdminData() });
    });

    socket.on("admin:refresh", ({ password }, ack) => {
      if (!requireAdmin(password, ack)) return;
      adminSockets.add(socket.id);
      ack({ ok: true, data: buildAdminData() });
    });

    socket.on("admin:setTimer", ({ password, seconds }, ack) => {
      if (!requireAdmin(password, ack)) return;
      setMoveTimerSeconds(seconds);
      const applied = getMoveTimerSeconds();
      manager.applyTimerToLiveRooms(applied);
      ack({ ok: true, data: buildAdminData() });
      pushAdmins();
    });

    socket.on("admin:kick", ({ password, code, playerId }, ack) => {
      if (!requireAdmin(password, ack)) return;
      const res = manager.kick(code, playerId);
      ack(res.error ? { ok: false, error: res.error } : { ok: true });
    });

    socket.on("admin:resetRound", ({ password, code }, ack) => {
      if (!requireAdmin(password, ack)) return;
      const res = manager.adminResetRound(code);
      ack(res.error ? { ok: false, error: res.error } : { ok: true });
    });

    socket.on("disconnect", () => {
      adminSockets.delete(socket.id);
      manager.handleDisconnect(socket.id);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Local-Ludo ready on http://localhost:${port} (dev=${dev})`);
  });
});
