"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Board from "@/components/Board";
import Dice from "@/components/Dice";
import { Color, COLOR_HEX, COLOR_LABEL, movableTokens } from "@/lib/ludo";
import type { RoomView } from "@/shared/protocol";

function TurnTimer({ deadline, total }: { deadline: number | null; total: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline || total <= 0) return null;
  const remainingMs = Math.max(0, deadline - now);
  const remaining = Math.ceil(remainingMs / 1000);
  const pct = Math.max(0, Math.min(100, (remainingMs / (total * 1000)) * 100));
  const low = remaining <= 5;

  return (
    <div className={`turn-timer ${low ? "low" : ""}`}>
      <div className="timer-bar">
        <div className="timer-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="timer-num">{remaining}s</span>
    </div>
  );
}

export default function GameView({
  room,
  clientId,
  onRoll,
  onMove,
  onLeave,
}: {
  room: RoomView;
  clientId: string;
  onRoll: () => void;
  onMove: (tokenId: string) => void;
  onLeave: () => void;
}) {
  const game = room.game;
  const [rolling, setRolling] = useState(false);
  const prevDice = useRef<number | null>(null);

  const isMyTurn = room.currentPlayerId === clientId;
  const playing = room.phase === "playing";
  const currentPlayer = room.players.find((p) => p.id === room.currentPlayerId) || null;
  const currentColor: Color | null =
    game && !game.winner ? game.players[game.currentPlayerIndex]?.color ?? null : null;

  const movableIds = useMemo(() => {
    const set = new Set<string>();
    if (game && isMyTurn && playing && game.awaitingMove && game.dice != null && !game.winner) {
      const player = game.players[game.currentPlayerIndex];
      movableTokens(player, game.dice).forEach((t) => set.add(t.id));
    }
    return set;
  }, [game, isMyTurn, playing]);

  // Brief dice-roll animation when the value changes.
  useEffect(() => {
    if (!game) return;
    if (game.dice !== prevDice.current && game.dice != null) {
      setRolling(true);
      const id = setTimeout(() => setRolling(false), 420);
      prevDice.current = game.dice;
      return () => clearTimeout(id);
    }
    prevDice.current = game.dice;
  }, [game?.dice]);

  if (!game) return null;

  const canRoll = playing && isMyTurn && !game.awaitingMove && !game.winner && !rolling;

  function handleRoll() {
    if (!canRoll) return;
    setRolling(true);
    onRoll();
  }

  return (
    <div className="screen game-screen">
      <div className="game-layout">
        <Board
          state={game}
          movableIds={movableIds}
          currentColor={currentColor}
          onTokenClick={onMove}
        />

        <div className="card game-panel">
          <div
            className={`turn-badge ${isMyTurn ? "mine" : ""}`}
            style={{ background: currentColor ? COLOR_HEX[currentColor] : "#444" }}
          >
            <span className="swatch small" style={{ background: "#fff" }} />
            {isMyTurn ? "Your turn" : `${currentPlayer?.name ?? "—"}'s turn`}
          </div>

          <TurnTimer deadline={room.turnDeadline} total={room.moveTimerSeconds} />

          <div className="game-message">{game.message}</div>

          <Dice value={game.dice} rolling={rolling} />

          {playing && (
            <button className="btn primary roll-btn" onClick={handleRoll} disabled={!canRoll}>
              {isMyTurn
                ? game.awaitingMove
                  ? "Tap a token"
                  : "Roll dice"
                : "Waiting…"}
            </button>
          )}

          <div className="scoreboard">
            <h3>Standings</h3>
            {game.players.map((p) => {
              const owner = room.players.find((pl) => pl.color === p.color);
              const wins = room.scores.find((s) => s.playerId === owner?.id)?.wins ?? 0;
              const done = p.tokens.filter((t) => t.state === "done").length;
              const onBoard = p.tokens.filter(
                (t) => t.state === "track" || t.state === "home"
              ).length;
              const yard = p.tokens.filter((t) => t.state === "yard").length;
              return (
                <div
                  key={p.color}
                  className={`score-row ${p.color === currentColor ? "current" : ""}`}
                >
                  <span className="swatch small" style={{ background: COLOR_HEX[p.color] }} />
                  <span className="score-name">{owner?.name ?? COLOR_LABEL[p.color]}</span>
                  <span className="score-wins" title="Round wins">🏆 {wins}</span>
                  <span className="score-prog" title="Home · Board · Yard">
                    🏠{done} 🎯{onBoard} 🔒{yard}
                  </span>
                </div>
              );
            })}
          </div>

          <button className="btn ghost sm leave-game" onClick={onLeave}>
            Leave game
          </button>
        </div>
      </div>
    </div>
  );
}
