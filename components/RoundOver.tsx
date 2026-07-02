"use client";

import { COLOR_HEX } from "@/lib/ludo";
import type { RoomView } from "@/shared/protocol";

const MEDALS = ["🥇", "🥈", "🥉", "4️⃣"];

export default function RoundOver({
  room,
  clientId,
  onPlayAgain,
  onLeave,
}: {
  room: RoomView;
  clientId: string;
  onPlayAgain: () => void;
  onLeave: () => void;
}) {
  const me = room.players.find((p) => p.id === clientId);
  const isHost = !!me?.isHost;
  const round = room.lastRound;
  if (!round) return null;

  const iWon = round.placements.find((p) => p.place === 1)?.playerId === clientId;

  return (
    <div className="overlay">
      <div className="card roundover-card">
        <div className="confetti-emoji">{iWon ? "🎉" : "🏁"}</div>
        <h2 className="roundover-title">
          {iWon ? "You win!" : `${round.winnerName} wins!`}
        </h2>

        <div className="placements">
          {round.placements.map((p, i) => (
            <div key={p.playerId} className={`placement ${p.playerId === clientId ? "me" : ""}`}>
              <span className="medal">{MEDALS[i] ?? `${p.place}.`}</span>
              <span className="swatch small" style={{ background: COLOR_HEX[p.color] }} />
              <span className="placement-name">
                {p.name}
                {p.playerId === clientId && <em> (you)</em>}
              </span>
            </div>
          ))}
        </div>

        <div className="round-scores">
          <h3>Wins this session</h3>
          {room.scores.map((s) => (
            <div key={s.playerId} className="score-row">
              <span className="score-name">{s.name}</span>
              <span className="score-wins">🏆 {s.wins}</span>
              <span className="score-prog muted">{s.games} played</span>
            </div>
          ))}
        </div>

        <div className="roundover-actions">
          {isHost ? (
            <button className="btn primary" onClick={onPlayAgain}>
              Play again
            </button>
          ) : (
            <p className="muted">Waiting for the host to start the next round…</p>
          )}
          <button className="btn ghost" onClick={onLeave}>
            Back to menu
          </button>
        </div>
      </div>
    </div>
  );
}
