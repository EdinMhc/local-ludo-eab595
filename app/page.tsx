"use client";

import { useMemo, useState } from "react";
import Board from "@/components/Board";
import Dice from "@/components/Dice";
import {
  Color,
  COLORS,
  COLOR_HEX,
  createGame,
  GameState,
  rollDice,
  applyMove,
  movableTokens,
  GOAL_PROGRESS,
} from "@/lib/ludo";

const COLOR_LABEL: Record<Color, string> = {
  red: "Red",
  green: "Green",
  yellow: "Yellow",
  blue: "Blue",
};

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Page() {
  const [selected, setSelected] = useState<Color[]>(["red", "green", "yellow", "blue"]);
  const [game, setGame] = useState<GameState | null>(null);
  const [rolling, setRolling] = useState(false);

  function toggleColor(c: Color) {
    setSelected((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  function startGame() {
    // keep board order consistent (red, green, yellow, blue)
    const ordered = COLORS.filter((c) => selected.includes(c));
    setGame(createGame(ordered));
  }

  function handleRoll() {
    if (!game || game.winner || game.awaitingMove || rolling) return;
    setRolling(true);
    // brief shake animation, then resolve
    setTimeout(() => {
      setGame((g) => {
        if (!g) return g;
        const { state } = rollDice(g);
        return state;
      });
      setRolling(false);
    }, 350);
  }

  function handleTokenClick(tokenId: string) {
    if (!game || game.winner || !game.awaitingMove) return;
    setGame((g) => {
      if (!g) return g;
      const { state } = applyMove(g, tokenId);
      return state;
    });
  }

  const movableIds = useMemo(() => {
    const set = new Set<string>();
    if (game && game.awaitingMove && game.dice != null && !game.winner) {
      const player = game.players[game.currentPlayerIndex];
      movableTokens(player, game.dice).forEach((t) => set.add(t.id));
    }
    return set;
  }, [game]);

  // ---------------- Setup screen ----------------
  if (!game) {
    return (
      <main className="page">
        <div className="header">
          <h1>Ludo</h1>
          <p>The classic race-to-home board game — hot-seat for 2 to 4 players.</p>
        </div>
        <div className="setup">
          <h2>Choose your players</h2>
          <p className="sub">
            Tap the colors that are in play. Every player takes turns on this
            same device.
          </p>
          <div className="color-grid">
            {COLORS.map((c) => (
              <div
                key={c}
                className={`color-opt ${selected.includes(c) ? "on" : ""}`}
                onClick={() => toggleColor(c)}
              >
                <span className="dot" style={{ background: COLOR_HEX[c] }} />
                {COLOR_LABEL[c]}
              </div>
            ))}
          </div>
          <p className="hint">Select between 2 and 4 colors to begin.</p>
          <button
            className="btn"
            disabled={selected.length < 2}
            onClick={startGame}
          >
            Start Game
          </button>
        </div>

        <RulesCard />
      </main>
    );
  }

  const current = game.players[game.currentPlayerIndex];

  return (
    <main className="page">
      <div className="header">
        <h1>Ludo</h1>
        <p>Roll a 6 to release a token. Race all four home to win!</p>
      </div>

      <div className="layout">
        <Board
          state={game}
          movableIds={movableIds}
          onTokenClick={handleTokenClick}
        />

        <div className="panel">
          {game.winner ? (
            <div
              className="winner-banner"
              style={{ background: COLOR_HEX[game.winner] }}
            >
              🏆 {COLOR_LABEL[game.winner]} wins!
            </div>
          ) : (
            <div
              className="turn-badge"
              style={{ background: COLOR_HEX[current.color] }}
            >
              <span className="dot" style={{ background: "#fff" }} />
              {COLOR_LABEL[current.color]}&rsquo;s turn
            </div>
          )}

          <div className="message">{game.message}</div>

          <Dice value={game.dice} rolling={rolling} />

          {!game.winner && (
            <button
              className="btn"
              onClick={handleRoll}
              disabled={game.awaitingMove || rolling}
            >
              {game.awaitingMove ? "Move a token" : "Roll Dice"}
            </button>
          )}

          <button className="btn secondary" onClick={() => setGame(null)}>
            {game.winner ? "New Game" : "Quit to Menu"}
          </button>

          <div className="scoreboard">
            <h3>Progress</h3>
            {game.players.map((p, i) => {
              const done = p.tokens.filter((t) => t.state === "done").length;
              const active = p.tokens.filter(
                (t) => t.state === "track" || t.state === "home"
              ).length;
              const yard = p.tokens.filter((t) => t.state === "yard").length;
              return (
                <div
                  key={p.color}
                  className={`score-row ${
                    i === game.currentPlayerIndex && !game.winner
                      ? "current"
                      : ""
                  }`}
                >
                  <span
                    className="dot"
                    style={{ background: COLOR_HEX[p.color] }}
                  />
                  {COLOR_LABEL[p.color]}
                  <span className="prog">
                    🏠 {done} · 🎯 {active} · 🔒 {yard}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <RulesCard />
    </main>
  );
}

function RulesCard() {
  return (
    <div className="rules">
      <h3>How to play</h3>
      <ul>
        <li>Each player starts with 4 tokens locked in their home yard.</li>
        <li>Roll a <strong>6</strong> to release a token onto the track. A 6 also earns a bonus roll.</li>
        <li>Tokens move clockwise by the exact dice value. Movable tokens pulse — click one to move it.</li>
        <li>Land on an opponent (outside a ★ safe square or colored start square) to capture it and send it home — plus a bonus roll.</li>
        <li>Safe squares (stars &amp; colored starts) can be shared by any tokens without capture.</li>
        <li>Roll three 6s in a row and your whole turn is forfeited.</li>
        <li>Enter the center only with an <strong>exact</strong> roll. First to bring all 4 tokens home wins!</li>
      </ul>
    </div>
  );
}
