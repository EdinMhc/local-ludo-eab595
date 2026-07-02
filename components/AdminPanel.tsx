"use client";

import { useEffect, useState } from "react";
import { COLOR_HEX } from "@/lib/ludo";
import type { AdminData } from "@/shared/protocol";
import type { UseRoom } from "@/lib/useRoom";

export default function AdminPanel({
  admin,
  onBack,
}: {
  admin: UseRoom["admin"];
  onBack: () => void;
}) {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<AdminData | null>(null);
  const [timerInput, setTimerInput] = useState("30");
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Live pushes from the server keep rooms/leaderboard fresh once authed.
  useEffect(() => {
    if (authed && admin.data) setData(admin.data);
  }, [admin.data, authed]);

  async function handleAuth() {
    setAuthErr(null);
    const d = await admin.auth(password);
    if (d) {
      setAuthed(true);
      setData(d);
      setTimerInput(String(d.moveTimerSeconds));
    } else {
      setAuthErr("Wrong password.");
    }
  }

  async function handleSaveTimer() {
    const seconds = Math.max(0, Math.min(600, parseInt(timerInput, 10) || 0));
    const d = await admin.setTimer(password, seconds);
    if (d) {
      setData(d);
      setTimerInput(String(d.moveTimerSeconds));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }

  if (!authed) {
    return (
      <div className="screen admin-screen">
        <div className="card admin-auth-card">
          <h2>Admin Settings</h2>
          <p className="muted">Enter the admin password to continue.</p>
          <input
            className="input"
            type="password"
            value={password}
            placeholder="Password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAuth()}
          />
          {authErr && <p className="inline-err">{authErr}</p>}
          <div className="admin-auth-actions">
            <button className="btn primary" onClick={handleAuth} disabled={!password}>
              Unlock
            </button>
            <button className="btn ghost" onClick={onBack}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen admin-screen">
      <div className="admin-head">
        <h2>Admin Panel</h2>
        <button className="btn ghost sm" onClick={onBack}>
          ← Back to menu
        </button>
      </div>

      <div className="admin-grid">
        <section className="card admin-section">
          <h3>Move timer</h3>
          <p className="muted">
            Seconds each player gets per turn. Set to <strong>0</strong> to disable. Applies live to
            running games.
          </p>
          <div className="timer-set">
            <input
              className="input timer-input"
              type="number"
              min={0}
              max={600}
              value={timerInput}
              onChange={(e) => setTimerInput(e.target.value)}
            />
            <button className="btn primary sm" onClick={handleSaveTimer}>
              Save
            </button>
            {saved && <span className="saved-tag">Saved ✓</span>}
          </div>
          <p className="muted current-timer">
            Current: {data?.moveTimerSeconds ? `${data.moveTimerSeconds}s` : "disabled"}
          </p>
        </section>

        <section className="card admin-section">
          <h3>Leaderboard</h3>
          {data && data.leaderboard.length > 0 ? (
            <div className="leaderboard">
              {data.leaderboard.slice(0, 10).map((row, i) => (
                <div key={row.name + i} className="lb-row">
                  <span className="lb-rank">{i + 1}</span>
                  <span className="lb-name">{row.name}</span>
                  <span className="lb-wins">🏆 {row.wins}</span>
                  <span className="lb-games muted">{row.games} played</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No games recorded yet.</p>
          )}
        </section>

        <section className="card admin-section">
          <h3>Live rooms</h3>
          {data && data.rooms.length > 0 ? (
            data.rooms.map((r) => (
              <div key={r.code} className="admin-room">
                <div className="admin-room-head">
                  <span className="admin-room-code">{r.code}</span>
                  <span className={`phase-tag ${r.phase}`}>{r.phase}</span>
                  <button
                    className="btn ghost xs"
                    onClick={() => admin.resetRound(password, r.code)}
                  >
                    Reset round
                  </button>
                </div>
                <div className="admin-room-players">
                  {r.players.map((p) => (
                    <div key={p.id} className="admin-player">
                      <span
                        className="swatch small"
                        style={{ background: p.color ? COLOR_HEX[p.color] : "#555" }}
                      />
                      <span>{p.name}</span>
                      <button
                        className="btn danger xs"
                        onClick={() => admin.kick(password, r.code, p.id)}
                      >
                        Kick
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="muted">No active rooms.</p>
          )}
        </section>

        <section className="card admin-section">
          <h3>Recent rounds</h3>
          {data && data.recentRounds.length > 0 ? (
            <div className="rounds-list">
              {data.recentRounds.slice(0, 12).map((r) => (
                <div key={r.id} className="round-item">
                  <span className="swatch small" style={{ background: COLOR_HEX[r.winnerColor] }} />
                  <span className="round-winner">{r.winnerName}</span>
                  <span className="muted round-code">room {r.roomCode}</span>
                  <span className="muted round-date">
                    {new Date(r.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No rounds played yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
