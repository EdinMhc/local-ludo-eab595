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
  const [boardWalking, setBoardWalking] = useState(false);
  const [overlayReady, setOverlayReady] = useState(false);

  // Auto-dismiss the error toast.
  useEffect(() => {
    if (!r.error) return;
    const id = setTimeout(() => r.clearError(), 4000);
    return () => clearTimeout(id);
  }, [r.error, r.clearError]);

  // Delay the round-over overlay until the winning token has finished animating
  // into the home triangle (#1), with a hard fallback so it can never get stuck.
  const phase = r.room?.phase;
  useEffect(() => {
    if (phase !== "finished") {
      setOverlayReady(false);
      return;
    }
    const hard = setTimeout(() => setOverlayReady(true), 3500);
    if (boardWalking) return () => clearTimeout(hard);
    const soft = setTimeout(() => setOverlayReady(true), 850);
    return () => {
      clearTimeout(hard);
      clearTimeout(soft);
    };
  }, [phase, boardWalking]);

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
        <GameView
          room={r.room}
          clientId={r.clientId}
          onRoll={r.roll}
          onMove={r.move}
          onUsePowerup={r.usePowerup}
          onLeave={r.leaveRoom}
          onWalkingChange={setBoardWalking}
        />
        {r.room.phase === "finished" && overlayReady && (
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
        onSetMode={r.setMode}
        onReady={r.setReady}
        onStart={r.startGame}
        onLeave={r.leaveRoom}
      />
      {toast}
    </main>
  );
}
