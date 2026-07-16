// ---------------------------------------------------------------------------
// Authoritative room + game manager. Holds all live room state in memory and
// drives the shared `lib/ludo` engine on the server. Emits RoomView snapshots
// through an injected emitter so the transport layer (server.ts) stays thin.
// ---------------------------------------------------------------------------
import {
  Color,
  COLORS,
  COLOR_LABEL,
  DIAGONAL_PARTNER,
  GameMode,
  GameState,
  PowerUpType,
  SEAT_COLOR_PRIORITY,
  TEAM_NAME,
  TEAM_OF,
  createGame,
  rollDice,
  applyMove,
  movableTokens,
  usePowerup as enginePowerup,
} from "../lib/ludo";
import {
  AdminRoomSummary,
  MAX_PLAYERS,
  MIN_PLAYERS,
  Placement,
  PlayerView,
  RoomPhase,
  RoomView,
  RoundResult,
  ScoreRow,
} from "../shared/protocol";
import { getMoveTimerSeconds, saveRound } from "./db";

interface Seat {
  id: string; // clientId
  name: string;
  color: Color | null;
  ready: boolean;
  connected: boolean;
  socketId: string | null;
  joinOrder: number;
}

interface Room {
  code: string;
  phase: RoomPhase;
  mode: GameMode;
  hostId: string;
  seats: Map<string, Seat>;
  game: GameState | null;
  colorToPlayerId: Map<Color, string>;
  moveTimerSeconds: number;
  turnDeadline: number | null;
  turnTimer: NodeJS.Timeout | null;
  scores: Map<string, { name: string; wins: number; games: number }>;
  lastRound: RoundResult | null;
  joinCounter: number;
}

export interface RoomEmitter {
  update: (code: string, view: RoomView) => void;
  closed: (code: string, reason: string) => void;
  kicked: (socketId: string, reason: string) => void;
  adminChanged: () => void;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars

// Roll-suspense window. When a roll passes the turn (three-sixes forfeit or no
// legal move), the client plays the full dice spin then holds the settled face a
// beat before revealing the next player (GameView: ROLL_ANIM_MS + ROLL_HOLD_MS).
// The server still broadcasts the snapshot immediately (never buffer state — that
// desyncs this timer), but it grants the incoming player this much extra time on
// their move-timer so they aren't docked the seconds spent watching the animation.
// Keep in sync with the client constants in components/GameView.tsx.
const TURN_REVEAL_GRACE_MS = 2200;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private socketIndex = new Map<string, string>(); // socketId → room code
  private emitter: RoomEmitter;

  constructor(emitter: RoomEmitter) {
    this.emitter = emitter;
  }

  // ---- lookup helpers -----------------------------------------------------
  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  private genCode(): string {
    let code = "";
    do {
      code = "";
      for (let i = 0; i < 4; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  private freeColor(room: Room): Color | null {
    const taken = new Set<Color>();
    room.seats.forEach((s) => s.color && taken.add(s.color));
    // Teams: canonical order keeps the original alternating default partners.
    if (room.mode === "teams") {
      return COLORS.find((c) => !taken.has(c)) ?? null;
    }
    // FFA: when exactly one seat has a colour, prefer its diagonal partner so a
    // 2-player room defaults to opposite corners and never forms an adjacent pair.
    const colored = [...room.seats.values()].filter((s) => s.color);
    if (colored.length === 1) {
      const partner = DIAGONAL_PARTNER[colored[0].color!];
      if (!taken.has(partner)) return partner;
    }
    return SEAT_COLOR_PRIORITY.find((c) => !taken.has(c)) ?? null;
  }

  private currentColor(room: Room): Color | null {
    const g = room.game;
    if (!g || g.winner) return null;
    return g.players[g.currentPlayerIndex]?.color ?? null;
  }

  private currentPlayerId(room: Room): string | null {
    const color = this.currentColor(room);
    return color ? room.colorToPlayerId.get(color) ?? null : null;
  }

  // ---- create / join / leave ---------------------------------------------
  createRoom(clientId: string, socketId: string, name: string): Room {
    const code = this.genCode();
    const room: Room = {
      code,
      phase: "lobby",
      mode: "ffa",
      hostId: clientId,
      seats: new Map(),
      game: null,
      colorToPlayerId: new Map(),
      moveTimerSeconds: getMoveTimerSeconds(),
      turnDeadline: null,
      turnTimer: null,
      scores: new Map(),
      lastRound: null,
      joinCounter: 0,
    };
    const seat: Seat = {
      id: clientId,
      name: sanitizeName(name),
      color: null,
      ready: false,
      connected: true,
      socketId,
      joinOrder: room.joinCounter++,
    };
    seat.color = this.freeColor(room);
    room.seats.set(clientId, seat);
    this.rooms.set(code, room);
    this.socketIndex.set(socketId, code);
    this.broadcast(room);
    this.emitter.adminChanged();
    return room;
  }

  joinRoom(
    clientId: string,
    socketId: string,
    code: string,
    name: string
  ): { room: Room } | { error: string } {
    const room = this.getRoom(code);
    if (!room) return { error: "Room not found." };

    const existing = room.seats.get(clientId);
    if (existing) {
      // reconnect / rejoin
      existing.socketId = socketId;
      existing.connected = true;
      if (name) existing.name = sanitizeName(name);
      this.socketIndex.set(socketId, room.code);
      this.broadcast(room);
      this.emitter.adminChanged();
      return { room };
    }

    if (room.phase !== "lobby") return { error: "Game already in progress." };
    if (room.seats.size >= MAX_PLAYERS) return { error: "Room is full." };

    const seat: Seat = {
      id: clientId,
      name: sanitizeName(name),
      color: this.freeColor(room),
      ready: false,
      connected: true,
      socketId,
      joinOrder: room.joinCounter++,
    };
    room.seats.set(clientId, seat);
    this.socketIndex.set(socketId, room.code);
    this.broadcast(room);
    this.emitter.adminChanged();
    return { room };
  }

  leaveRoom(clientId: string): void {
    const room = this.roomOfClient(clientId);
    if (!room) return;
    const seat = room.seats.get(clientId);
    if (!seat) return;

    if (room.phase === "lobby") {
      room.seats.delete(clientId);
    } else {
      // keep the seat so the running game's turn order stays intact; the move
      // timer will auto-play for the absent player.
      seat.connected = false;
      seat.socketId = null;
    }
    if (seat.socketId) this.socketIndex.delete(seat.socketId);
    this.afterSeatChange(room, clientId);
  }

  handleDisconnect(socketId: string): void {
    const code = this.socketIndex.get(socketId);
    this.socketIndex.delete(socketId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;
    const seat = [...room.seats.values()].find((s) => s.socketId === socketId);
    if (!seat) return;

    if (room.phase === "lobby") {
      room.seats.delete(seat.id);
    } else {
      seat.connected = false;
      seat.socketId = null;
    }
    this.afterSeatChange(room, seat.id);
  }

  private afterSeatChange(room: Room, changedClientId: string): void {
    // Reassign host if the host left/disconnected.
    if (changedClientId === room.hostId) {
      const next = [...room.seats.values()]
        .filter((s) => s.connected)
        .sort((a, b) => a.joinOrder - b.joinOrder)[0];
      if (next) room.hostId = next.id;
    }
    // Drop empty rooms entirely.
    const anyConnected = [...room.seats.values()].some((s) => s.connected);
    if (room.seats.size === 0 || !anyConnected) {
      this.destroyRoom(room, "Everyone left the room.");
      return;
    }
    this.broadcast(room);
    this.emitter.adminChanged();
  }

  private destroyRoom(room: Room, reason: string): void {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    room.seats.forEach((s) => s.socketId && this.socketIndex.delete(s.socketId));
    this.rooms.delete(room.code);
    this.emitter.closed(room.code, reason);
    this.emitter.adminChanged();
  }

  private roomOfClient(clientId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.seats.has(clientId)) return room;
    }
    return undefined;
  }

  // ---- lobby actions ------------------------------------------------------
  pickColor(clientId: string, color: Color): { error?: string } {
    const room = this.roomOfClient(clientId);
    if (!room) return { error: "You are not in a room." };
    if (room.phase !== "lobby") return { error: "Cannot change color mid-game." };
    const seat = room.seats.get(clientId);
    if (!seat) return { error: "Seat not found." };
    const clash = [...room.seats.values()].some(
      (s) => s.id !== clientId && s.color === color
    );
    if (clash) return { error: "That color is taken." };
    // 2-player FFA games must be diagonally opposite. When exactly two players are
    // seated and the other already has a colour, this seat may only take that
    // colour's diagonal partner (Red↔Yellow, Green↔Blue). Skipped in teams mode,
    // which fills 4 seats and has its own diagonal pairing.
    if (room.mode !== "teams" && room.seats.size === 2) {
      const other = [...room.seats.values()].find((s) => s.id !== clientId);
      if (other?.color && color !== DIAGONAL_PARTNER[other.color]) {
        return {
          error: `Two-player games sit in opposite corners — you can only pick ${COLOR_LABEL[DIAGONAL_PARTNER[other.color]]}.`,
        };
      }
    }
    seat.color = color;
    this.broadcast(room);
    return {};
  }

  setMode(clientId: string, mode: GameMode): { error?: string } {
    const room = this.roomOfClient(clientId);
    if (!room) return { error: "You are not in a room." };
    if (room.hostId !== clientId) return { error: "Only the host can change the mode." };
    if (room.phase !== "lobby") return { error: "Cannot change mode mid-game." };
    room.mode = mode;
    this.broadcast(room);
    return {};
  }

  setReady(clientId: string, ready: boolean): void {
    const room = this.roomOfClient(clientId);
    if (!room || room.phase !== "lobby") return;
    const seat = room.seats.get(clientId);
    if (!seat) return;
    // Safeguard: never leave a player unable to ready for lack of a color.
    if (!seat.color) seat.color = this.freeColor(room);
    if (!seat.color) return;
    seat.ready = ready;
    this.broadcast(room);
  }

  startGame(clientId: string): { error?: string } {
    const room = this.roomOfClient(clientId);
    if (!room) return { error: "You are not in a room." };
    if (room.hostId !== clientId) return { error: "Only the host can start." };
    if (room.phase !== "lobby") return { error: "Game already started." };

    const active = [...room.seats.values()].filter((s) => s.connected);
    if (active.length < MIN_PLAYERS) return { error: `Need at least ${MIN_PLAYERS} players.` };
    if (active.length > MAX_PLAYERS) return { error: `Max ${MAX_PLAYERS} players.` };
    if (active.some((s) => !s.color)) return { error: "Everyone must pick a color." };
    if (active.some((s) => !s.ready)) return { error: "All players must be ready." };
    if (room.mode === "teams" && active.length !== 4) {
      return { error: "2v2 teams needs exactly 4 players." };
    }

    // Canonical board order (red, green, yellow, blue) among chosen colors.
    const colorSeats = active
      .filter((s): s is Seat & { color: Color } => s.color !== null)
      .sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color));

    // Safety net: a 2-player game must be diagonally opposite. If the two chosen
    // colours are adjacent, snap the second seat onto the first's diagonal partner.
    if (
      colorSeats.length === 2 &&
      TEAM_OF[colorSeats[0].color] !== TEAM_OF[colorSeats[1].color]
    ) {
      colorSeats[1].color = DIAGONAL_PARTNER[colorSeats[0].color];
    }

    const colors = colorSeats.map((s) => s.color);

    room.game = createGame(colors, room.mode);
    room.colorToPlayerId = new Map(colorSeats.map((s) => [s.color, s.id]));
    room.moveTimerSeconds = getMoveTimerSeconds();
    room.phase = "playing";
    room.lastRound = null;
    // Ensure everyone counted in this round exists in the score table.
    colorSeats.forEach((s) => {
      if (!room.scores.has(s.id)) {
        room.scores.set(s.id, { name: s.name, wins: 0, games: 0 });
      } else {
        room.scores.get(s.id)!.name = s.name;
      }
    });

    this.postAction(room);
    this.emitter.adminChanged();
    return {};
  }

  // ---- gameplay -----------------------------------------------------------
  roll(clientId: string): void {
    const room = this.roomOfClient(clientId);
    if (!room || room.phase !== "playing" || !room.game) return;
    if (room.game.winner) return;
    if (room.game.awaitingMove) return;
    if (this.currentPlayerId(room) !== clientId) return;
    const result = rollDice(room.game);
    room.game = result.state;
    // On an auto-pass the turn changes on this same roll — give the incoming
    // player the roll-suspense grace so their move-timer effectively starts when
    // the animation + hold finishes on their screen, not while it's still playing.
    this.postAction(room, result.autoPassed ? TURN_REVEAL_GRACE_MS : 0);
  }

  move(clientId: string, tokenId: string): void {
    const room = this.roomOfClient(clientId);
    if (!room || room.phase !== "playing" || !room.game) return;
    if (room.game.winner || !room.game.awaitingMove) return;
    if (this.currentPlayerId(room) !== clientId) return;
    const player = room.game.players[room.game.currentPlayerIndex];
    const legal = movableTokens(player, room.game.dice!).some((t) => t.id === tokenId);
    if (!legal) return;
    this.applyMoveInternal(room, tokenId);
    this.postAction(room);
  }

  usePowerup(clientId: string, type: PowerUpType, dice?: number): void {
    const room = this.roomOfClient(clientId);
    if (!room || room.phase !== "playing" || !room.game) return;
    if (room.game.winner || room.game.awaitingMove) return; // before rolling only
    if (this.currentPlayerId(room) !== clientId) return;
    const updated = enginePowerup(room.game, type, dice);
    if (updated === room.game) return; // no-op (didn't own the item)
    room.game = updated;
    this.broadcast(room); // keep the existing move-timer deadline running
  }

  playAgain(clientId: string): void {
    const room = this.roomOfClient(clientId);
    if (!room || room.hostId !== clientId || room.phase !== "finished") return;
    this.resetToLobby(room);
  }

  private applyMoveInternal(room: Room, tokenId: string): void {
    const { state } = applyMove(room.game!, tokenId);
    room.game = state;
    if (state.winner) this.finishGame(room, state.winner);
  }

  private finishGame(room: Room, winnerColor: Color): void {
    const g = room.game!;
    const placements = this.computePlacements(room, g, winnerColor);
    const teamMode = g.mode === "teams" && g.teams && g.winnerTeam != null;

    // Ids that count as winners (both partners in teams mode).
    const winnerIds = new Set<string>();
    if (teamMode) {
      for (const p of g.players) {
        if (g.teams![p.color] === g.winnerTeam) {
          const id = room.colorToPlayerId.get(p.color);
          if (id) winnerIds.add(id);
        }
      }
    } else {
      const id = room.colorToPlayerId.get(winnerColor);
      if (id) winnerIds.add(id);
    }

    const winnerName = teamMode
      ? TEAM_NAME[g.winnerTeam!]
      : room.seats.get([...winnerIds][0] ?? "")?.name ?? placements.find((p) => p.place === 1)?.name ?? "Winner";

    // Cumulative room scores.
    placements.forEach((p) => {
      const entry = room.scores.get(p.playerId) ?? { name: p.name, wins: 0, games: 0 };
      entry.name = p.name;
      entry.games += 1;
      if (winnerIds.has(p.playerId)) entry.wins += 1;
      room.scores.set(p.playerId, entry);
    });

    room.lastRound = {
      winnerName,
      winnerColor,
      winnerTeam: teamMode ? g.winnerTeam : null,
      placements,
      endedAt: Date.now(),
    };
    room.phase = "finished";

    try {
      saveRound({
        roomCode: room.code,
        winnerName,
        winnerColor,
        placements,
        createdAt: room.lastRound.endedAt,
      });
    } catch (err) {
      console.error("[rooms] failed to persist round:", err);
    }
    this.emitter.adminChanged();
  }

  private computePlacements(room: Room, g: GameState, winnerColor: Color): Placement[] {
    const toPlacement = (color: Color, place: number): Placement => {
      const playerId = room.colorToPlayerId.get(color)!;
      const seat = room.seats.get(playerId);
      return {
        playerId,
        name: seat?.name ?? color,
        color,
        place,
        team: g.teams ? g.teams[color] : undefined,
      };
    };

    // Teams: rank the two TEAMS, winning team's members share place 1.
    if (g.mode === "teams" && g.teams) {
      const teamStat: Record<number, { done: number; progress: number }> = {};
      g.players.forEach((p) => {
        const tid = g.teams![p.color];
        teamStat[tid] ??= { done: 0, progress: 0 };
        teamStat[tid].done += p.tokens.filter((t) => t.state === "done").length;
        teamStat[tid].progress += p.tokens.reduce((s, t) => s + Math.max(0, t.progress), 0);
      });
      const teams = [...new Set(g.players.map((p) => g.teams![p.color]))].sort((a, b) => {
        if (a === g.winnerTeam) return -1;
        if (b === g.winnerTeam) return 1;
        return teamStat[b].done - teamStat[a].done || teamStat[b].progress - teamStat[a].progress;
      });
      const teamPlace: Record<number, number> = {};
      teams.forEach((t, i) => (teamPlace[t] = i + 1));
      return g.players
        .map((p) => toPlacement(p.color, teamPlace[g.teams![p.color]]))
        .sort((a, b) => a.place - b.place);
    }

    // FFA: rank by winner, then done / progress.
    const ranked = g.players
      .map((p) => ({
        color: p.color,
        done: p.tokens.filter((t) => t.state === "done").length,
        progress: p.tokens.reduce((sum, t) => sum + Math.max(0, t.progress), 0),
      }))
      .sort((a, b) => {
        if (a.color === winnerColor) return -1;
        if (b.color === winnerColor) return 1;
        return b.done - a.done || b.progress - a.progress;
      });
    return ranked.map((r, i) => toPlacement(r.color, i + 1));
  }

  private resetToLobby(room: Room): void {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    room.turnTimer = null;
    room.turnDeadline = null;
    room.game = null;
    room.colorToPlayerId = new Map();
    room.phase = "lobby";
    room.seats.forEach((s) => (s.ready = false));
    this.broadcast(room);
    this.emitter.adminChanged();
  }

  // ---- move timer ---------------------------------------------------------
  private postAction(room: Room, graceMs = 0): void {
    this.armTimer(room, graceMs);
    this.broadcast(room);
  }

  // `graceMs` extends the deadline for a turn that only becomes interactive after a
  // client-side reveal delay (the roll-suspense window). It also doubles as the
  // soft-lock fallback: even if a client's animation never signals completion, the
  // server still auto-resolves once this (grace + full move-timer) window elapses.
  private armTimer(room: Room, graceMs = 0): void {
    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
    }
    const g = room.game;
    if (room.phase !== "playing" || !g || g.winner || room.moveTimerSeconds <= 0) {
      room.turnDeadline = null;
      return;
    }
    const ms = room.moveTimerSeconds * 1000 + Math.max(0, graceMs);
    room.turnDeadline = Date.now() + ms;
    room.turnTimer = setTimeout(() => this.autoResolve(room.code), ms);
  }

  private autoResolve(code: string): void {
    const room = this.rooms.get(code);
    if (!room || room.phase !== "playing" || !room.game || room.game.winner) return;
    try {
      const g = room.game;
      if (g.awaitingMove) {
        const player = g.players[g.currentPlayerIndex];
        const movable = movableTokens(player, g.dice!);
        if (movable.length) this.applyMoveInternal(room, movable[0].id);
      } else {
        room.game = rollDice(room.game).state;
        const g2 = room.game;
        if (!g2.winner && g2.awaitingMove) {
          const player = g2.players[g2.currentPlayerIndex];
          const movable = movableTokens(player, g2.dice!);
          if (movable.length) this.applyMoveInternal(room, movable[0].id);
        }
      }
    } catch (err) {
      console.error("[rooms] auto-resolve error:", err);
    }
    this.postAction(room);
  }

  // ---- admin --------------------------------------------------------------
  applyTimerToLiveRooms(seconds: number): void {
    this.rooms.forEach((room) => {
      room.moveTimerSeconds = seconds;
      if (room.phase === "playing") this.armTimer(room);
      this.broadcast(room);
    });
  }

  kick(code: string, playerId: string): { error?: string } {
    const room = this.getRoom(code);
    if (!room) return { error: "Room not found." };
    const seat = room.seats.get(playerId);
    if (!seat) return { error: "Player not found." };
    const kickedSocketId = seat.socketId;
    if (seat.socketId) this.socketIndex.delete(seat.socketId);
    if (room.phase === "lobby") {
      room.seats.delete(playerId);
    } else {
      seat.connected = false;
      seat.socketId = null;
    }
    if (kickedSocketId) this.emitter.kicked(kickedSocketId, "You were removed by the admin.");
    this.afterSeatChange(room, playerId);
    return {};
  }

  adminResetRound(code: string): { error?: string } {
    const room = this.getRoom(code);
    if (!room) return { error: "Room not found." };
    this.resetToLobby(room);
    return {};
  }

  adminRoomSummaries(): AdminRoomSummary[] {
    return [...this.rooms.values()].map((room) => ({
      code: room.code,
      phase: room.phase,
      playerCount: room.seats.size,
      players: [...room.seats.values()]
        .sort((a, b) => a.joinOrder - b.joinOrder)
        .map((s) => ({ id: s.id, name: s.name, color: s.color })),
    }));
  }

  // ---- serialization ------------------------------------------------------
  private broadcast(room: Room): void {
    this.emitter.update(room.code, this.serialize(room));
  }

  serialize(room: Room): RoomView {
    const players: PlayerView[] = [...room.seats.values()]
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        ready: s.ready,
        connected: s.connected,
        isHost: s.id === room.hostId,
      }));

    const scores: ScoreRow[] = [...room.scores.entries()]
      .map(([playerId, v]) => ({ playerId, name: v.name, wins: v.wins, games: v.games }))
      .sort((a, b) => b.wins - a.wins || b.games - a.games);

    return {
      code: room.code,
      phase: room.phase,
      mode: room.mode,
      players,
      hostId: room.hostId,
      game: room.game,
      currentPlayerId: this.currentPlayerId(room),
      moveTimerSeconds: room.moveTimerSeconds,
      turnDeadline: room.turnDeadline,
      lastRound: room.lastRound,
      scores,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
    };
  }

  viewOf(code: string): RoomView | null {
    const room = this.getRoom(code);
    return room ? this.serialize(room) : null;
  }
}

function sanitizeName(name: string): string {
  const clean = (name || "").trim().slice(0, 16);
  return clean.length ? clean : "Player";
}
