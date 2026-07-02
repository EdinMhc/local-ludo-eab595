"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { Color, GameMode, PowerUpType } from "@/lib/ludo";
import type {
  Ack,
  AdminData,
  ClientToServerEvents,
  RoomView,
  ServerToClientEvents,
} from "@/shared/protocol";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const CID_KEY = "ludo_client_id";
const NAME_KEY = "ludo_name";
const ROOM_KEY = "ludo_room";

function getClientId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(CID_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(CID_KEY, id);
  }
  return id;
}

export function getSavedName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NAME_KEY) || "";
}

export interface UseRoom {
  connected: boolean;
  clientId: string;
  room: RoomView | null;
  error: string | null;
  clearError: () => void;
  createRoom: (name: string) => Promise<string | null>;
  joinRoom: (code: string, name: string) => Promise<boolean>;
  leaveRoom: () => void;
  pickColor: (color: Color) => void;
  setMode: (mode: GameMode) => void;
  setReady: (ready: boolean) => void;
  startGame: () => Promise<string | null>; // returns error string, or null on success
  roll: () => void;
  move: (tokenId: string) => void;
  usePowerup: (type: PowerUpType, dice?: number) => void;
  playAgain: () => void;
  admin: {
    data: AdminData | null;
    auth: (password: string) => Promise<AdminData | null>;
    setTimer: (password: string, seconds: number) => Promise<AdminData | null>;
    refresh: (password: string) => Promise<AdminData | null>;
    kick: (password: string, code: string, playerId: string) => Promise<boolean>;
    resetRound: (password: string, code: string) => Promise<boolean>;
  };
}

export function useRoom(): UseRoom {
  const socketRef = useRef<ClientSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [clientId, setClientId] = useState("");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminData, setAdminData] = useState<AdminData | null>(null);

  useEffect(() => {
    const cid = getClientId();
    setClientId(cid);
    const socket = io({ auth: { clientId: cid } }) as unknown as ClientSocket;
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      // Auto-rejoin after a refresh / reconnect.
      const saved = sessionStorage.getItem(ROOM_KEY);
      if (saved) {
        const name = getSavedName();
        socket.emit("room:join", { code: saved, name }, (res: Ack<{ code: string }>) => {
          if (!res.ok) {
            sessionStorage.removeItem(ROOM_KEY);
            setRoom(null);
          }
        });
      }
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("room:update", (view) => setRoom(view));

    socket.on("room:closed", ({ reason }) => {
      sessionStorage.removeItem(ROOM_KEY);
      setRoom(null);
      if (reason) setError(reason);
    });

    socket.on("errorMsg", ({ message }) => setError(message));

    socket.on("admin:update", (data) => setAdminData(data));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const createRoom = useCallback((name: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket) return resolve(null);
      localStorage.setItem(NAME_KEY, name);
      socket.emit("room:create", { name }, (res: Ack<{ code: string }>) => {
        if (res.ok && res.data) {
          sessionStorage.setItem(ROOM_KEY, res.data.code);
          resolve(res.data.code);
        } else {
          setError(res.ok ? "Could not create room." : res.error);
          resolve(null);
        }
      });
    });
  }, []);

  const joinRoom = useCallback((code: string, name: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket) return resolve(false);
      localStorage.setItem(NAME_KEY, name);
      const upper = code.trim().toUpperCase();
      socket.emit("room:join", { code: upper, name }, (res: Ack<{ code: string }>) => {
        if (res.ok) {
          sessionStorage.setItem(ROOM_KEY, upper);
          resolve(true);
        } else {
          setError(res.error);
          resolve(false);
        }
      });
    });
  }, []);

  const leaveRoom = useCallback(() => {
    sessionStorage.removeItem(ROOM_KEY);
    socketRef.current?.emit("room:leave");
    setRoom(null);
  }, []);

  const pickColor = useCallback((color: Color) => {
    socketRef.current?.emit("lobby:pickColor", { color }, (res: Ack) => {
      if (!res.ok) setError(res.error);
    });
  }, []);

  const setMode = useCallback((mode: GameMode) => {
    socketRef.current?.emit("lobby:setMode", { mode }, (res: Ack) => {
      if (!res.ok) setError(res.error);
    });
  }, []);

  const setReady = useCallback((ready: boolean) => {
    socketRef.current?.emit("lobby:ready", { ready });
  }, []);

  const startGame = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket) return resolve("Not connected.");
      socket.emit("lobby:start", (res: Ack) => {
        if (res.ok) resolve(null);
        else {
          setError(res.error);
          resolve(res.error);
        }
      });
    });
  }, []);

  const roll = useCallback(() => socketRef.current?.emit("game:roll"), []);
  const move = useCallback((tokenId: string) => socketRef.current?.emit("game:move", { tokenId }), []);
  const usePowerupCb = useCallback(
    (type: PowerUpType, dice?: number) => socketRef.current?.emit("game:usePowerup", { type, dice }),
    []
  );
  const playAgain = useCallback(() => socketRef.current?.emit("game:playAgain"), []);

  const adminCall = useCallback(
    (event: any, payload: any): Promise<Ack<any>> => {
      return new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket) return resolve({ ok: false, error: "Not connected." });
        socket.emit(event, payload, (res: Ack<any>) => {
          if (!res.ok) setError(res.error);
          resolve(res);
        });
      });
    },
    []
  );

  const admin = {
    data: adminData,
    auth: async (password: string) => {
      const r = await adminCall("admin:auth", { password });
      return r.ok ? ((r.data ?? null) as AdminData | null) : null;
    },
    setTimer: async (password: string, seconds: number) => {
      const r = await adminCall("admin:setTimer", { password, seconds });
      return r.ok ? ((r.data ?? null) as AdminData | null) : null;
    },
    refresh: async (password: string) => {
      const r = await adminCall("admin:refresh", { password });
      return r.ok ? ((r.data ?? null) as AdminData | null) : null;
    },
    kick: async (password: string, code: string, playerId: string) => {
      const r = await adminCall("admin:kick", { password, code, playerId });
      return r.ok;
    },
    resetRound: async (password: string, code: string) => {
      const r = await adminCall("admin:resetRound", { password, code });
      return r.ok;
    },
  };

  return {
    connected,
    clientId,
    room,
    error,
    clearError,
    createRoom,
    joinRoom,
    leaveRoom,
    pickColor,
    setMode,
    setReady,
    startGame,
    roll,
    move,
    usePowerup: usePowerupCb,
    playAgain,
    admin,
  };
}
