"use client";

import { useEffect, useState } from "react";
import { useRoom } from "@/lib/useRoom";
import Menu from "@/components/Menu";
import Lobby from "@/components/Lobby";
import GameView from "@/components/GameView";
import RoundOver from "@/components/RoundOver";
import AdminPanel from "@/components/AdminPanel";

export default function Page() {
  const r = useRoom();
  const [showAdmin, setShowAdmin] = useState(false);

  // Auto-dismiss the error toast.
  useEffect(() => {
    if (!r.error) return;
    const id = setTimeout(() => r.clearError(), 4000);
    return () => clearTimeout(id);
  }, [r.error, r.clearError]);

  const toast = r.error ? (
    <div className="toast" onClick={r.clearError}>
      {r.error}
    </div>
  ) : null;

  if (showAdmin) {
    return (
      <main className="app">
        <AdminPanel admin={r.admin} onBack={() => setShowAdmin(false)} />
        {toast}
      </main>
    );
  }

  if (!r.room) {
    return (
      <main className="app">
        <Menu
          connected={r.connected}
          onCreate={async (name) => {
            await r.createRoom(name);
          }}
          onJoin={async (code, name) => {
            await r.joinRoom(code, name);
          }}
          onAdmin={() => setShowAdmin(true)}
        />
        {toast}
      </main>
    );
  }

  // In a room and a game exists → playing or finished.
  if (r.room.game) {
    return (
      <main className="app">
        <GameView room={r.room} clientId={r.clientId} onRoll={r.roll} onMove={r.move} onLeave={r.leaveRoom} />
        {r.room.phase === "finished" && (
          <RoundOver
            room={r.room}
            clientId={r.clientId}
            onPlayAgain={r.playAgain}
            onLeave={r.leaveRoom}
          />
        )}
        {toast}
      </main>
    );
  }

  // Lobby.
  return (
    <main className="app">
      <Lobby
        room={r.room}
        clientId={r.clientId}
        onPickColor={r.pickColor}
        onReady={r.setReady}
        onStart={r.startGame}
        onLeave={r.leaveRoom}
      />
      {toast}
    </main>
  );
}
