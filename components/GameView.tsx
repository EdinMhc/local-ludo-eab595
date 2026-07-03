"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Board from "@/components/Board";
import Dice from "@/components/Dice";
import {
  Color,
  COLOR_HEX,
  COLOR_LABEL,
  movableTokens,
  POWERUP_META,
  POWERUP_TYPES,
  PowerUpType,
} from "@/lib/ludo";
import type { RoomView } from "@/shared/protocol";

// Dice roll suspense: play the full (slowed) spin, then hold the settled face a
// beat before the turn visibly transitions. Roll window is ~40% longer than the
// old 1000ms so the roll feels weighty.
const ROLL_ANIM_MS = 1400;
const ROLL_HOLD_MS = 800;

/* Avatar with a depleting countdown ring when it's this player's turn. */
function PlayerAvatar({
  name,
  color,
  active,
  connected = true,
  shielded = false,
  deadline,
  total,
}: {
  name: string;
  color: Color;
  active: boolean;
  connected?: boolean;
  shielded?: boolean;
  deadline: number | null;
  total: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || !deadline || total <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 150);
    return () => clearInterval(id);
  }, [active, deadline, total]);

  const initial = (name || "?").trim().charAt(0).toUpperCase();
  let ring = "rgba(255,255,255,0.12)";
  let low = false;
  if (active) {
    if (deadline && total > 0) {
      const remain = Math.max(0, deadline - now);
      const frac = Math.max(0, Math.min(1, remain / (total * 1000)));
      const deg = frac * 360;
      low = remain <= 5000;
      const arc = low ? "#ef4444" : "#ffffff";
      ring = `conic-gradient(${arc} ${deg}deg, rgba(255,255,255,0.15) ${deg}deg 360deg)`;
    } else {
      ring = "#ffffff";
    }
  }

  return (
    <div className={`avatar-wrap ${active ? "active" : ""} ${low ? "low" : ""} ${shielded ? "shielded" : ""}`}>
      <div className="avatar-ring" style={{ background: ring }}>
        <div className="avatar" style={{ background: COLOR_HEX[color] }}>
          {initial}
        </div>
        {shielded && <span className="avatar-shield" title="Shielded">🛡️</span>}
      </div>
      <span className="avatar-name">
        {name}
        {!connected && <span className="avatar-off" title="offline">•</span>}
      </span>
    </div>
  );
}

export default function GameView({
  room,
  clientId,
  onRoll,
  onMove,
  onUsePowerup,
  onLeave,
  onWalkingChange,
}: {
  room: RoomView;
  clientId: string;
  onRoll: () => void;
  onMove: (tokenId: string) => void;
  onUsePowerup: (type: PowerUpType, dice?: number) => void;
  onLeave: () => void;
  onWalkingChange?: (walking: boolean) => void;
}) {
  const game = room.game;
  const [rolling, setRolling] = useState(false);
  // `resolving` stays true through the spin AND the post-roll hold, so the turn
  // indicator / controls don't flip to the next player until the die has settled.
  const [resolving, setResolving] = useState(false);
  const [dicePicker, setDicePicker] = useState(false);
  const prevRollId = useRef(game?.rollId ?? 0);
  const rollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  const isMyTurn = room.currentPlayerId === clientId;
  const playing = room.phase === "playing";
  const currentPlayer = room.players.find((p) => p.id === room.currentPlayerId) || null;
  const myColor = room.players.find((p) => p.id === clientId)?.color ?? null;
  const currentColor: Color | null =
    game && !game.winner ? game.players[game.currentPlayerIndex]?.color ?? null : null;
  const myEngine = game && myColor ? game.players.find((p) => p.color === myColor) ?? null : null;

  const movableIds = useMemo(() => {
    const set = new Set<string>();
    // Tappable as soon as the snapshot requires a move — do NOT gate on the roll
    // animation, or a short server move-timer could auto-resolve before the die
    // settles and steal the player's move.
    if (game && isMyTurn && playing && game.awaitingMove && game.dice != null && !game.winner) {
      const player = game.players[game.currentPlayerIndex];
      movableTokens(player, game.dice).forEach((t) => set.add(t.id));
    }
    return set;
  }, [game, isMyTurn, playing]);

  // Animate the dice whenever a new roll happens (any player), for everyone.
  function triggerRollAnim() {
    setRolling(true);
    setResolving(true);
    if (rollTimer.current) clearTimeout(rollTimer.current);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    rollTimer.current = setTimeout(() => {
      setRolling(false);
      // If the roll passed the turn (no legal move / three-sixes forfeit), hold the
      // settled face a beat before revealing the next player. If a move is required,
      // reveal immediately so the active player isn't kept waiting.
      const g = gameRef.current;
      const passedTurn = !!g && !g.awaitingMove && !g.winner;
      if (passedTurn) {
        holdTimer.current = setTimeout(() => setResolving(false), ROLL_HOLD_MS);
      } else {
        setResolving(false);
      }
    }, ROLL_ANIM_MS);
  }
  useEffect(() => {
    if (!game) return;
    if (game.rollId !== prevRollId.current) {
      prevRollId.current = game.rollId;
      triggerRollAnim();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.rollId]);
  useEffect(() => () => {
    if (rollTimer.current) clearTimeout(rollTimer.current);
    if (holdTimer.current) clearTimeout(holdTimer.current);
  }, []);

  if (!game) return null;

  // Roll is gated ONLY by server state — never by the local animation flag,
  // so the button can never get stuck between turns.
  const canRoll = playing && isMyTurn && !game.awaitingMove && !game.winner;
  const canUse = canRoll && !resolving; // power-ups are activated before rolling
  const displayedDice = game.dice ?? game.lastRoll;

  // Current player's armed effects (visible to everyone).
  const curEngine = game.players[game.currentPlayerIndex];
  const showDouble = !game.winner && !!curEngine?.doubleNext;
  const forcedDice = !game.winner ? curEngine?.forcedDice ?? null : null;

  function handleRoll() {
    if (!canRoll || resolving) return;
    triggerRollAnim();
    onRoll();
  }

  // Dice cluster — two dice when Double is armed, plus a Dice-Control cue.
  function diceCluster() {
    return (
      <div className={`dice-cluster ${showDouble ? "double" : ""}`}>
        <div className="dice-row">
          <Dice value={displayedDice} rolling={rolling} />
          {showDouble && <Dice value={displayedDice} rolling={rolling} />}
        </div>
        {showDouble && <span className="dice-badge dbl">⚡ Double distance</span>}
        {forcedDice != null && <span className="dice-badge ctrl">🎲 Locked to {forcedDice}</span>}
      </div>
    );
  }

  const invCounts: Record<PowerUpType, number> = { shield: 0, dice_control: 0, double: 0, plus_one: 0 };
  (myEngine?.inventory ?? []).forEach((t) => (invCounts[t] += 1));

  const turnLabel = resolving
    ? "🎲 Rolling…"
    : isMyTurn
    ? "Your turn"
    : `${currentPlayer?.name ?? "—"}'s turn`;

  const rollLabel = resolving
    ? "Rolling…"
    : !isMyTurn
    ? `Waiting for ${currentPlayer?.name ?? "…"}`
    : game.awaitingMove
    ? "Tap a token"
    : "Roll dice";

  function renderInventory() {
    const owned = POWERUP_TYPES.filter((t) => invCounts[t] > 0);
    const active: string[] = [];
    if (myEngine?.shielded) active.push(`${POWERUP_META.shield.icon} Shield`);
    if (myEngine?.doubleNext) active.push(`${POWERUP_META.double.icon} ×2`);
    if (myEngine?.forcedDice) active.push(`${POWERUP_META.dice_control.icon} ${myEngine.forcedDice}`);

    return (
      <div className="inventory">
        <div className="inv-header">
          <span>Power-ups</span>
          {active.length > 0 && <span className="inv-active">{active.join(" · ")}</span>}
        </div>
        {owned.length === 0 ? (
          <p className="inv-empty">Land exactly on a board icon to collect one.</p>
        ) : (
          <>
            <div className="inv-chips">
              {owned.map((t) => (
                <button
                  key={t}
                  className={`inv-chip ${t} ${t === "dice_control" && dicePicker ? "picking" : ""}`}
                  disabled={!canUse}
                  title={POWERUP_META[t].desc}
                  onClick={() => {
                    if (t === "dice_control") setDicePicker((v) => !v);
                    else onUsePowerup(t);
                  }}
                >
                  <span className="inv-icon">{POWERUP_META[t].icon}</span>
                  <span className="inv-label">{POWERUP_META[t].label}</span>
                  <span className="inv-count">{invCounts[t]}</span>
                </button>
              ))}
            </div>
            {dicePicker && canUse && invCounts.dice_control > 0 && (
              <div className="dice-picker">
                <span className="dp-label">Choose your next roll:</span>
                <div className="dp-nums">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      className="dp-num"
                      onClick={() => {
                        onUsePowerup("dice_control", n);
                        setDicePicker(false);
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="screen game-screen">
      <div className="game-topbar">
        <button className="btn ghost xs" onClick={onLeave}>
          ← Leave
        </button>
        <span className="game-room-code">Room {room.code}</span>
      </div>

      {/* Players with turn-timer rings */}
      <div className="players-strip">
        {room.players.map((p) => (
          <PlayerAvatar
            key={p.id}
            name={p.name}
            color={p.color ?? "red"}
            active={p.id === room.currentPlayerId && playing}
            connected={p.connected}
            shielded={!!game.players.find((gp) => gp.color === p.color)?.shielded}
            deadline={room.turnDeadline}
            total={room.moveTimerSeconds}
          />
        ))}
      </div>

      <div className="game-layout">
        <Board
          state={game}
          movableIds={movableIds}
          currentColor={currentColor}
          powerups={game.powerups}
          onTokenClick={onMove}
          onWalkingChange={onWalkingChange}
        />

        {/* Desktop side panel */}
        <div className="card game-panel">
          <div
            className={`turn-badge ${!resolving && isMyTurn ? "mine" : ""}`}
            style={{ background: !resolving && currentColor ? COLOR_HEX[currentColor] : "#444" }}
          >
            <span className="swatch small" style={{ background: "#fff" }} />
            {turnLabel}
          </div>

          <div className="game-message">{resolving ? "🎲 Rolling the dice…" : game.message}</div>

          {diceCluster()}

          {playing && (
            <button className="btn primary roll-btn" onClick={handleRoll} disabled={!canRoll || resolving}>
              {rollLabel}
            </button>
          )}

          {renderInventory()}

          <div className="scoreboard">
            <h3>Standings</h3>
            {game.players.map((p) => {
              const owner = room.players.find((pl) => pl.color === p.color);
              const wins = room.scores.find((s) => s.playerId === owner?.id)?.wins ?? 0;
              const done = p.tokens.filter((t) => t.state === "done").length;
              const onBoard = p.tokens.filter((t) => t.state === "track" || t.state === "home").length;
              const yard = p.tokens.filter((t) => t.state === "yard").length;
              return (
                <div key={p.color} className={`score-row ${p.color === currentColor ? "current" : ""}`}>
                  <span className="swatch small" style={{ background: COLOR_HEX[p.color] }} />
                  <span className="score-name">{owner?.name ?? COLOR_LABEL[p.color]}</span>
                  <span className="score-wins" title="Round wins">🏆 {wins}</span>
                  <span className="score-prog" title="Home · Board · Yard">🏠{done} 🎯{onBoard} 🔒{yard}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile fixed action bar — roll & power-ups without scrolling */}
      {playing && (
        <div className="action-bar">
          <div className="ab-inventory">{renderInventory()}</div>
          <div className="ab-main">
            <div className="ab-dice">{diceCluster()}</div>
            <div className="ab-controls">
              <div className="ab-status" style={{ color: !resolving && currentColor ? COLOR_HEX[currentColor] : "#fff" }}>
                {turnLabel}
              </div>
              <button className="btn primary ab-roll" onClick={handleRoll} disabled={!canRoll || resolving}>
                {rollLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
