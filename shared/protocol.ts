// ---------------------------------------------------------------------------
// Socket.io contract shared between the browser client and the Node server.
// Keep this framework-agnostic — it is imported by both `app/` (Next client)
// and `server/` (tsx runtime).
// ---------------------------------------------------------------------------
import type { Color, GameState } from "../lib/ludo";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const DEFAULT_MOVE_TIMER = 30; // seconds; 0 = disabled
export const ROOM_CODE_LENGTH = 4;

export type RoomPhase = "lobby" | "playing" | "finished";

// ---- Acknowledgement wrapper for request/response style events ----
export type Ack<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ---- Serializable views pushed to clients ----
export interface PlayerView {
  id: string; // stable clientId (survives refresh/reconnect)
  name: string;
  color: Color | null;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface Placement {
  playerId: string;
  name: string;
  color: Color;
  place: number; // 1 = winner
}

export interface RoundResult {
  winnerName: string;
  winnerColor: Color;
  placements: Placement[];
  endedAt: number;
}

export interface ScoreRow {
  playerId: string;
  name: string;
  wins: number;
  games: number;
}

export interface RoomView {
  code: string;
  phase: RoomPhase;
  players: PlayerView[];
  hostId: string;
  game: GameState | null;
  currentPlayerId: string | null; // whose turn it is (maps game index → player)
  moveTimerSeconds: number; // 0 = disabled
  turnDeadline: number | null; // epoch ms when the current turn auto-resolves
  lastRound: RoundResult | null;
  scores: ScoreRow[]; // cumulative wins for this room session
  minPlayers: number;
  maxPlayers: number;
}

// ---- Admin ----
export interface RoundRecord {
  id: number;
  roomCode: string;
  winnerName: string;
  winnerColor: Color;
  placements: Placement[];
  createdAt: number;
}

export interface AdminRoomSummary {
  code: string;
  phase: RoomPhase;
  playerCount: number;
  players: { id: string; name: string; color: Color | null }[];
}

export interface AdminData {
  moveTimerSeconds: number;
  leaderboard: { name: string; wins: number; games: number }[];
  recentRounds: RoundRecord[];
  rooms: AdminRoomSummary[];
}

// ---- Event maps for Socket.io typing ----
export interface ClientToServerEvents {
  "room:create": (p: { name: string }, ack: (r: Ack<{ code: string }>) => void) => void;
  "room:join": (p: { code: string; name: string }, ack: (r: Ack<{ code: string }>) => void) => void;
  "room:leave": () => void;
  "lobby:pickColor": (p: { color: Color }, ack: (r: Ack) => void) => void;
  "lobby:ready": (p: { ready: boolean }) => void;
  "lobby:start": (ack: (r: Ack) => void) => void;
  "game:roll": () => void;
  "game:move": (p: { tokenId: string }) => void;
  "game:playAgain": () => void;
  "admin:auth": (p: { password: string }, ack: (r: Ack<AdminData>) => void) => void;
  "admin:setTimer": (p: { password: string; seconds: number }, ack: (r: Ack<AdminData>) => void) => void;
  "admin:refresh": (p: { password: string }, ack: (r: Ack<AdminData>) => void) => void;
  "admin:kick": (p: { password: string; code: string; playerId: string }, ack: (r: Ack) => void) => void;
  "admin:resetRound": (p: { password: string; code: string }, ack: (r: Ack) => void) => void;
}

export interface ServerToClientEvents {
  "room:update": (room: RoomView) => void;
  "room:closed": (p: { reason: string }) => void;
  "errorMsg": (p: { message: string }) => void;
  "admin:update": (data: AdminData) => void;
}

export interface SocketHandshakeAuth {
  clientId: string;
}
