// ---------------------------------------------------------------------------
// SQLite persistence (better-sqlite3). Stores admin settings and completed
// round results. Live room state is kept in memory (server/rooms.ts).
//
// Production DB lives on the Railway volume mounted at /data.
// Override with DB_PATH env var.
// ---------------------------------------------------------------------------
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { DEFAULT_MOVE_TIMER } from "../shared/protocol";
import type { Placement, RoundRecord } from "../shared/protocol";
import type { Color } from "../lib/ludo";

function resolveDbPath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  if (process.env.NODE_ENV === "production") return "/data/local-ludo.db";
  return path.join(process.cwd(), "data", "local-ludo.db");
}

const DB_PATH = resolveDbPath();
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rounds (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code    TEXT NOT NULL,
    winner_name  TEXT NOT NULL,
    winner_color TEXT NOT NULL,
    placements   TEXT NOT NULL,
    created_at   INTEGER NOT NULL
  );
`);

// ---- Settings -------------------------------------------------------------
const getSettingStmt = db.prepare<[string], { value: string }>(
  "SELECT value FROM settings WHERE key = ?"
);
const setSettingStmt = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
);

export function getSetting(key: string): string | null {
  const row = getSettingStmt.get(key);
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  setSettingStmt.run(key, value);
}

const MOVE_TIMER_KEY = "move_timer_seconds";

export function getMoveTimerSeconds(): number {
  const raw = getSetting(MOVE_TIMER_KEY);
  if (raw === null) return DEFAULT_MOVE_TIMER;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MOVE_TIMER;
}

export function setMoveTimerSeconds(seconds: number): void {
  const clamped = Math.max(0, Math.min(600, Math.round(seconds)));
  setSetting(MOVE_TIMER_KEY, String(clamped));
}

// ---- Rounds / scoring -----------------------------------------------------
const insertRoundStmt = db.prepare(
  `INSERT INTO rounds (room_code, winner_name, winner_color, placements, created_at)
   VALUES (?, ?, ?, ?, ?)`
);
const recentRoundsStmt = db.prepare(
  "SELECT * FROM rounds ORDER BY id DESC LIMIT ?"
);
const allRoundsStmt = db.prepare("SELECT * FROM rounds ORDER BY id DESC");

interface RoundRow {
  id: number;
  room_code: string;
  winner_name: string;
  winner_color: string;
  placements: string;
  created_at: number;
}

function rowToRecord(row: RoundRow): RoundRecord {
  return {
    id: row.id,
    roomCode: row.room_code,
    winnerName: row.winner_name,
    winnerColor: row.winner_color as Color,
    placements: JSON.parse(row.placements) as Placement[],
    createdAt: row.created_at,
  };
}

export function saveRound(record: {
  roomCode: string;
  winnerName: string;
  winnerColor: Color;
  placements: Placement[];
  createdAt: number;
}): void {
  insertRoundStmt.run(
    record.roomCode,
    record.winnerName,
    record.winnerColor,
    JSON.stringify(record.placements),
    record.createdAt
  );
}

export function getRecentRounds(limit = 25): RoundRecord[] {
  return (recentRoundsStmt.all(limit) as RoundRow[]).map(rowToRecord);
}

export function getLeaderboard(): { name: string; wins: number; games: number }[] {
  const rounds = (allRoundsStmt.all() as RoundRow[]).map(rowToRecord);
  const tally = new Map<string, { name: string; wins: number; games: number }>();
  for (const r of rounds) {
    const winner = tally.get(r.winnerName) ?? { name: r.winnerName, wins: 0, games: 0 };
    winner.wins += 1;
    tally.set(r.winnerName, winner);
    for (const p of r.placements) {
      const entry = tally.get(p.name) ?? { name: p.name, wins: 0, games: 0 };
      entry.games += 1;
      tally.set(p.name, entry);
    }
  }
  return [...tally.values()].sort((a, b) => b.wins - a.wins || b.games - a.games);
}

export default db;
