"use client";

import { useEffect, useState } from "react";
import { getSavedName } from "@/lib/useRoom";

export default function Menu({
  connected,
  onCreate,
  onJoin,
  onAdmin,
}: {
  connected: boolean;
  onCreate: (name: string) => Promise<void>;
  onJoin: (code: string, name: string) => Promise<void>;
  onAdmin: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"home" | "join">("home");
  const [busy, setBusy] = useState(false);

  // Load any previously used name after mount (avoids SSR hydration mismatch).
  useEffect(() => setName(getSavedName()), []);

  const nameOk = name.trim().length > 0;

  async function handleCreate() {
    if (!nameOk || busy) return;
    setBusy(true);
    await onCreate(name.trim());
    setBusy(false);
  }

  async function handleJoin() {
    if (!nameOk || code.trim().length < 3 || busy) return;
    setBusy(true);
    await onJoin(code.trim(), name.trim());
    setBusy(false);
  }

  return (
    <div className="screen menu-screen">
      <div className="brand">
        <h1 className="brand-title">LUDO</h1>
        <p className="brand-sub">Online multiplayer · 2–4 players</p>
      </div>

      <div className="card menu-card">
        <label className="field">
          <span>Your name</span>
          <input
            className="input"
            value={name}
            maxLength={16}
            placeholder="Enter a name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {mode === "home" ? (
          <div className="menu-actions">
            <button className="btn primary" disabled={!nameOk || busy} onClick={handleCreate}>
              Create Room
            </button>
            <button className="btn" disabled={!nameOk} onClick={() => setMode("join")}>
              Join Room
            </button>
          </div>
        ) : (
          <div className="menu-actions">
            <label className="field">
              <span>Room code</span>
              <input
                className="input code-input"
                value={code}
                maxLength={4}
                placeholder="ABCD"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              />
            </label>
            <button
              className="btn primary"
              disabled={!nameOk || code.trim().length < 3 || busy}
              onClick={handleJoin}
            >
              Join
            </button>
            <button className="btn ghost" onClick={() => setMode("home")}>
              Back
            </button>
          </div>
        )}

        <button className="link-btn admin-link" onClick={onAdmin}>
          ⚙ Admin Settings
        </button>
      </div>

      <div className={`conn-pill ${connected ? "on" : "off"}`}>
        <span className="conn-dot" />
        {connected ? "Connected" : "Connecting…"}
      </div>
    </div>
  );
}
