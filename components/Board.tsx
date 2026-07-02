"use client";

import { useEffect, useRef, useState } from "react";
import {
  Color,
  GameState,
  RING,
  ENTRY_INDEX,
  SAFE_RING_INDICES,
  HOME_COLUMN,
  Token,
  TokenState,
  PowerUp,
  POWERUP_META,
  ringCell,
  tokenCell,
  COLORS,
} from "@/lib/ludo";

// How long the token pauses on each cell as it walks (ms). The CSS transition
// smooths the slide between adjacent cells.
const STEP_MS = 150;

type CellInfo = { path?: boolean; colorClass?: string; safe?: boolean };

function buildCellMap(): Record<string, CellInfo> {
  const map: Record<string, CellInfo> = {};
  const key = (r: number, c: number) => `${r},${c}`;
  RING.forEach(([r, c], idx) => {
    map[key(r, c)] = { ...(map[key(r, c)] || {}), path: true };
    if (SAFE_RING_INDICES.includes(idx)) map[key(r, c)].safe = true;
  });
  (Object.keys(ENTRY_INDEX) as Color[]).forEach((color) => {
    const [r, c] = RING[ENTRY_INDEX[color]];
    map[key(r, c)] = { ...(map[key(r, c)] || {}), path: true, colorClass: `${color}-path`, safe: true };
  });
  (Object.keys(HOME_COLUMN) as Color[]).forEach((color) => {
    HOME_COLUMN[color].forEach(([r, c]) => {
      map[key(r, c)] = { ...(map[key(r, c)] || {}), path: true, colorClass: `${color}-path` };
    });
  });
  return map;
}

const CELL_MAP = buildCellMap();

function stateForProgress(prog: number): TokenState {
  if (prog < 0) return "yard";
  if (prog >= 57) return "done";
  if (prog >= 51) return "home";
  return "track";
}

function cellForProgress(color: Color, prog: number, slot: number): [number, number] {
  const synthetic: Token = { id: "", color, state: stateForProgress(prog), progress: prog };
  return tokenCell(synthetic, slot);
}

const targetOf = (t: Token): number => (t.state === "yard" ? -1 : t.progress);

// Small in-cell offsets so tokens sharing one square sit NEXT TO each other.
function spreadOffset(i: number, n: number): [number, number] {
  if (n <= 1) return [0, 0];
  const grids: Record<number, [number, number][]> = {
    2: [[-0.2, 0], [0.2, 0]],
    3: [[0, -0.22], [-0.2, 0.16], [0.2, 0.16]],
    4: [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]],
  };
  if (n <= 4) return grids[n][i] ?? [0, 0];
  const angle = (2 * Math.PI * i) / n; // 5+ → small ring so none overlap
  return [Math.cos(angle) * 0.27, Math.sin(angle) * 0.27];
}
function sizeForGroup(n: number): number {
  if (n <= 1) return 0.78;
  if (n === 2) return 0.56;
  if (n <= 4) return 0.48;
  return 0.4;
}

export default function Board({
  state,
  movableIds,
  onTokenClick,
  currentColor = null,
  powerups = [],
}: {
  state: GameState;
  movableIds: Set<string>;
  onTokenClick: (tokenId: string) => void;
  currentColor?: Color | null;
  powerups?: PowerUp[];
}) {
  const [display, setDisplay] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    state.players.forEach((p) => p.tokens.forEach((t) => (init[t.id] = targetOf(t))));
    return init;
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  // Tokens already finished when this client mounted — render hidden, no replay
  // of the arrival celebration.
  const preDone = useRef<Set<string>>(
    new Set(state.players.flatMap((p) => p.tokens.filter((t) => t.state === "done").map((t) => t.id)))
  );

  // Reconcile new tokens + yard-leaving when a fresh state arrives. Captured
  // tokens (target -1, display >= 0) are intentionally left in place here; the
  // stepping loop snaps them home once the capturing token finishes walking.
  useEffect(() => {
    setDisplay((prev) => {
      const next = { ...prev };
      let changed = false;
      state.players.forEach((p) =>
        p.tokens.forEach((t) => {
          const tgt = targetOf(t);
          if (!(t.id in next)) {
            next[t.id] = tgt;
            changed = true;
          } else if (next[t.id] === -1 && tgt >= 0) {
            next[t.id] = 0; // step out onto the entry cell
            changed = true;
          }
        })
      );
      return changed ? next : prev;
    });
  }, [state]);

  // Stepping loop — advance forward walkers one cell; snap captured tokens home
  // only once nothing is walking. Pure updater (no external mutation).
  useEffect(() => {
    const id = setInterval(() => {
      setDisplay((prev) => {
        const cur = stateRef.current;
        let changed = false;
        const next = { ...prev };
        cur.players.forEach((p) =>
          p.tokens.forEach((t) => {
            const tgt = targetOf(t);
            const d = next[t.id];
            if (d == null) return;
            if (tgt >= 0 && d >= 0 && d < tgt) {
              next[t.id] = d + 1;
              changed = true;
            } else if (tgt >= 0 && d > tgt) {
              next[t.id] = tgt;
              changed = true;
            }
          })
        );
        const stillWalking = cur.players.some((p) =>
          p.tokens.some((t) => {
            const tgt = targetOf(t);
            const d = next[t.id];
            return tgt >= 0 && d != null && d >= 0 && d < tgt;
          })
        );
        if (!stillWalking) {
          cur.players.forEach((p) =>
            p.tokens.forEach((t) => {
              const tgt = targetOf(t);
              const d = next[t.id];
              if (tgt === -1 && d != null && d >= 0) {
                next[t.id] = -1;
                changed = true;
              }
            })
          );
        }
        return changed ? next : prev;
      });
    }, STEP_MS);
    return () => clearInterval(id);
  }, []);

  // Capture burst — a sad emoji floats up from a token the moment it snaps home.
  const fxId = useRef(0);
  const prevDisplayRef = useRef(display);
  const [captureFx, setCaptureFx] = useState<{ key: number; left: number; top: number }[]>([]);
  useEffect(() => {
    const prev = prevDisplayRef.current;
    const added: { key: number; left: number; top: number }[] = [];
    stateRef.current.players.forEach((p) =>
      p.tokens.forEach((t, slot) => {
        if ((prev[t.id] ?? -1) >= 0 && display[t.id] === -1) {
          const [row, col] = cellForProgress(t.color, prev[t.id], slot);
          added.push({
            key: fxId.current++,
            left: ((col + 0.5) / 15) * 100,
            top: ((row + 0.5) / 15) * 100,
          });
        }
      })
    );
    prevDisplayRef.current = display;
    if (added.length) {
      setCaptureFx((f) => [...f, ...added]);
      const ids = new Set(added.map((a) => a.key));
      setTimeout(() => setCaptureFx((f) => f.filter((x) => !ids.has(x.key))), 1300);
    }
  }, [display]);

  const cells = [];
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const info = CELL_MAP[`${r},${c}`];
      const classes = ["cell"];
      if (info?.path) classes.push("path");
      if (info?.colorClass) classes.push(info.colorClass);
      if (info?.safe) classes.push("safe");
      cells.push(<div key={`${r}-${c}`} className={classes.join(" ")} />);
    }
  }

  // Group tokens by their AUTHORITATIVE cell for stable side-by-side spreading.
  const groupKey = (t: Token, slot: number): string | null => {
    if (t.state === "yard" || t.state === "done") return null;
    const [row, col] = tokenCell(t, slot);
    return `${row.toFixed(2)},${col.toFixed(2)}`;
  };
  const groups: Record<string, { id: string; slot: number }[]> = {};
  state.players.forEach((p) =>
    p.tokens.forEach((t, slot) => {
      const k = groupKey(t, slot);
      if (!k) return;
      (groups[k] ||= []).push({ id: t.id, slot });
    })
  );
  const groupInfo: Record<string, { index: number; size: number }> = {};
  Object.values(groups).forEach((members) =>
    members.forEach((m, i) => (groupInfo[m.id] = { index: i, size: members.length }))
  );

  const shieldedColors = new Set(state.players.filter((p) => p.shielded).map((p) => p.color));

  return (
    <div className="board-wrap">
      <div className="board">{cells}</div>

      {COLORS.map((color) => (
        <div key={color} className={`yard ${color} ${currentColor === color ? "active" : ""}`}>
          <div className="yard-inner">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="yard-slot" />
            ))}
          </div>
        </div>
      ))}

      <div className="center">
        <span className="center-star">★</span>
      </div>

      <div className="powerups">
        {powerups.map((pu, i) => {
          const [row, col] = ringCell(pu.cell);
          const left = ((col + 0.5) / 15) * 100;
          const top = ((row + 0.5) / 15) * 100;
          return (
            <div
              key={`${pu.cell}-${pu.type}-${i}`}
              className={`powerup ${pu.type}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              title={POWERUP_META[pu.type].label}
            >
              {POWERUP_META[pu.type].icon}
            </div>
          );
        })}
      </div>

      <div className="tokens">
        {state.players.flatMap((p) =>
          p.tokens.map((token, slot) => {
            const prog = display[token.id] ?? targetOf(token);
            const [row, col] = cellForProgress(token.color, prog, slot);
            const gi = groupInfo[token.id];
            const [offX, offY] = gi ? spreadOffset(gi.index, gi.size) : [0, 0];
            const size = gi ? sizeForGroup(gi.size) : 0.78;

            const leftPct = ((col + 0.5 + offX) / 15) * 100;
            const topPct = ((row + 0.5 + offY) / 15) * 100;

            const isDone = token.state === "done";
            const goneAtMount = isDone && preDone.current.has(token.id);
            const arrived = isDone && prog >= 57 && !goneAtMount;
            const movable = movableIds.has(token.id);
            const walking = prog >= 0 && prog < targetOf(token);

            const classes = ["token", token.color];
            if (movable) classes.push("movable");
            if (walking) classes.push("walking");
            if (arrived) classes.push("arrived");
            if (goneAtMount) classes.push("done-gone");
            if (shieldedColors.has(token.color) && !isDone) classes.push("shielded");

            return (
              <div
                key={token.id}
                className={classes.join(" ")}
                style={{
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  width: `calc(100% / 15 * ${size})`,
                  height: `calc(100% / 15 * ${size})`,
                }}
                onClick={() => movable && onTokenClick(token.id)}
                title={`${token.color} token`}
              />
            );
          })
        )}
      </div>

      {/* Capture bursts */}
      <div className="capture-fx-layer">
        {captureFx.map((fx) => (
          <span
            key={fx.key}
            className="capture-fx"
            style={{ left: `${fx.left}%`, top: `${fx.top}%` }}
          >
            😢
          </span>
        ))}
      </div>
    </div>
  );
}
