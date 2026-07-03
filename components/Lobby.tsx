"use client";

import { useState } from "react";
import { Color, COLORS, COLOR_HEX, COLOR_LABEL, DIAGONAL_PARTNER, GameMode, TEAM_OF, TEAM_NAME } from "@/lib/ludo";
import type { RoomView } from "@/shared/protocol";

export default function Lobby({
  room,
  clientId,
  onPickColor,
  onSetMode,
  onReady,
  onStart,
  onLeave,
}: {
  room: RoomView;
  clientId: string;
  onPickColor: (color: Color) => void;
  onSetMode: (mode: GameMode) => void;
  onReady: (ready: boolean) => void;
  onStart: () => Promise<string | null>;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [startErr, setStartErr] = useState<string | null>(null);
  const me = room.players.find((p) => p.id === clientId);
  const isHost = !!me?.isHost;
  const takenByOthers = new Set(
    room.players.filter((p) => p.id !== clientId && p.color).map((p) => p.color as Color)
  );
  // In a 2-player game the two seats must sit in diagonally opposite corners, so
  // once the other player has a colour this seat is locked to its diagonal partner.
  const otherPlayer = room.players.find((p) => p.id !== clientId);
  const forcedColor: Color | null =
    room.mode !== "teams" && room.players.length === 2 && otherPlayer?.color
      ? DIAGONAL_PARTNER[otherPlayer.color]
      : null;

  const teamsOk = room.mode !== "teams" || room.players.length === 4;
  const enoughPlayers =
    room.players.length >= room.minPlayers && room.players.length <= room.maxPlayers;
  const allReady = room.players.every((p) => p.ready && p.color);
  const canStart = isHost && enoughPlayers && allReady && teamsOk;

  function copyCode() {
    navigator.clipboard?.writeText(room.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }

  async function handleStart() {
    setStartErr(null);
    const err = await onStart();
    if (err) setStartErr(err);
  }

  return (
    <div className="screen lobby-screen">
      <div className="card lobby-card">
        <div className="lobby-head">
          <div>
            <p className="muted-label">Room code</p>
            <button className="room-code" onClick={copyCode} title="Click to copy">
              {room.code} <span className="copy-hint">{copied ? "copied!" : "copy"}</span>
            </button>
          </div>
          <button className="btn ghost sm" onClick={onLeave}>
            Leave
          </button>
        </div>

        <p className="lobby-hint">
          Share this code. Everyone picks a color, marks ready, then the host starts.
        </p>

        <div className="mode-select">
          <p className="muted-label">Game mode</p>
          <div className="mode-tabs">
            <button
              className={`mode-tab ${room.mode === "ffa" ? "on" : ""}`}
              disabled={!isHost}
              onClick={() => onSetMode("ffa")}
            >
              Free-for-all
            </button>
            <button
              className={`mode-tab ${room.mode === "teams" ? "on" : ""}`}
              disabled={!isHost}
              onClick={() => onSetMode("teams")}
            >
              2v2 Teams
            </button>
          </div>
          {room.mode === "teams" && (
            <p className="mode-hint">
              Teams are diagonal — <strong>Red + Yellow</strong> vs <strong>Green + Blue</strong>. Needs
              4 players; both partners must finish to win.
            </p>
          )}
        </div>

        <div className="players-list">
          {room.players.map((p) => (
            <div key={p.id} className={`player-row ${p.id === clientId ? "me" : ""}`}>
              <span
                className="swatch"
                style={{ background: p.color ? COLOR_HEX[p.color] : "#555" }}
              />
              <span className="player-name">
                {p.name}
                {p.id === clientId && <em> (you)</em>}
                {p.isHost && <span className="crown" title="Host">👑</span>}
                {room.mode === "teams" && p.color && (
                  <span className={`team-tag t${TEAM_OF[p.color]}`}>{TEAM_NAME[TEAM_OF[p.color]]}</span>
                )}
                {!p.connected && <span className="offline">offline</span>}
              </span>
              <span className={`ready-tag ${p.ready ? "yes" : "no"}`}>
                {p.ready ? "Ready" : "Not ready"}
              </span>
            </div>
          ))}
          {Array.from({ length: Math.max(0, room.maxPlayers - room.players.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="player-row empty">
              <span className="swatch empty" />
              <span className="player-name muted">Waiting for player…</span>
            </div>
          ))}
        </div>

        <div className="color-picker">
          <p className="muted-label">Pick your color</p>
          <div className="color-swatches">
            {COLORS.map((c) => {
              const taken = takenByOthers.has(c);
              const mine = me?.color === c;
              const blockedByDiagonal = forcedColor !== null && c !== forcedColor && !mine;
              const disabled = taken || blockedByDiagonal;
              return (
                <button
                  key={c}
                  className={`color-swatch ${mine ? "mine" : ""} ${disabled ? "taken" : ""}`}
                  style={{ background: COLOR_HEX[c] }}
                  disabled={disabled}
                  onClick={() => onPickColor(c)}
                  title={
                    taken
                      ? `${COLOR_LABEL[c]} taken`
                      : blockedByDiagonal
                      ? `2-player games sit in opposite corners — pick ${COLOR_LABEL[forcedColor!]}`
                      : COLOR_LABEL[c]
                  }
                >
                  {mine && <span className="check">✓</span>}
                </button>
              );
            })}
          </div>
          {forcedColor && (
            <p className="mode-hint">
              2-player game — you take the opposite corner (<strong>{COLOR_LABEL[forcedColor]}</strong>).
            </p>
          )}
        </div>

        <div className="lobby-actions">
          <button
            className={`btn ${me?.ready ? "" : "primary"}`}
            disabled={!me?.color}
            onClick={() => onReady(!me?.ready)}
          >
            {me?.ready ? "Not ready" : "I'm ready"}
          </button>

          {isHost && (
            <button className="btn primary start-btn" disabled={!canStart} onClick={handleStart}>
              Start Game
            </button>
          )}
        </div>

        {!isHost && (
          <p className="lobby-foot muted">Waiting for the host to start the game…</p>
        )}
        {startErr && <p className="inline-err">{startErr}</p>}
      </div>
    </div>
  );
}
