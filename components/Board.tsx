"use client";

import {
  Color,
  GameState,
  RING,
  ENTRY_INDEX,
  SAFE_RING_INDICES,
  HOME_COLUMN,
  YARD_SLOTS,
  Token,
  tokenCell,
  COLORS,
} from "@/lib/ludo";

// Build a lookup of which cells belong to the path, colored paths, and safe cells.
type CellInfo = {
  path?: boolean;
  colorClass?: string;
  safe?: boolean;
};

function buildCellMap(): Record<string, CellInfo> {
  const map: Record<string, CellInfo> = {};
  const key = (r: number, c: number) => `${r},${c}`;

  RING.forEach(([r, c], idx) => {
    map[key(r, c)] = { ...(map[key(r, c)] || {}), path: true };
    if (SAFE_RING_INDICES.includes(idx)) map[key(r, c)].safe = true;
  });

  // colored entry (start) cells get their color
  (Object.keys(ENTRY_INDEX) as Color[]).forEach((color) => {
    const [r, c] = RING[ENTRY_INDEX[color]];
    map[key(r, c)] = {
      ...(map[key(r, c)] || {}),
      path: true,
      colorClass: `${color}-path`,
      safe: true,
    };
  });

  // colored home columns (first 5 cells; the 6th is adjacent to center)
  (Object.keys(HOME_COLUMN) as Color[]).forEach((color) => {
    HOME_COLUMN[color].forEach(([r, c]) => {
      map[key(r, c)] = {
        ...(map[key(r, c)] || {}),
        path: true,
        colorClass: `${color}-path`,
      };
    });
  });

  return map;
}

const CELL_MAP = buildCellMap();

export default function Board({
  state,
  movableIds,
  onTokenClick,
}: {
  state: GameState;
  movableIds: Set<string>;
  onTokenClick: (tokenId: string) => void;
}) {
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

  // Group tokens by exact cell so we can offset overlapping ones and show counts.
  type Placed = { token: Token; row: number; col: number; slot: number };
  const placed: Placed[] = [];
  state.players.forEach((p) => {
    p.tokens.forEach((t, slot) => {
      const [row, col] = tokenCell(t, slot);
      placed.push({ token: t, row, col, slot });
    });
  });

  // Count tokens sharing the same rendered cell (for track/home overlaps).
  const cellCount: Record<string, number> = {};
  placed.forEach((pl) => {
    if (pl.token.state === "yard") return;
    const k = `${pl.row.toFixed(2)},${pl.col.toFixed(2)}`;
    cellCount[k] = (cellCount[k] || 0) + 1;
  });
  const cellSeen: Record<string, number> = {};

  return (
    <div className="board-wrap">
      <div className="board">{cells}</div>

      {/* Yard boxes */}
      {COLORS.map((color) => (
        <div key={color} className={`yard ${color}`}>
          <div className="yard-inner">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="yard-slot" />
            ))}
          </div>
        </div>
      ))}

      {/* Center triangles */}
      <div className="center">
        <div className="tri top" />
        <div className="tri right" />
        <div className="tri bottom" />
        <div className="tri left" />
      </div>

      {/* Tokens */}
      <div className="tokens">
        {placed.map((pl) => {
          const { token, row, col } = pl;
          const k = `${row.toFixed(2)},${col.toFixed(2)}`;
          const total = cellCount[k] || 1;
          const seen = cellSeen[k] || 0;
          cellSeen[k] = seen + 1;

          // spread overlapping tokens slightly
          let offX = 0;
          let offY = 0;
          if (token.state !== "yard" && total > 1) {
            const angle = (2 * Math.PI * seen) / total;
            offX = Math.cos(angle) * 0.9;
            offY = Math.sin(angle) * 0.9;
          }

          // convert grid cell (center) to percentage. cell center = (idx+0.5)/15
          const leftPct = ((col + 0.5 + offX) / 15) * 100;
          const topPct = ((row + 0.5 + offY) / 15) * 100;

          const movable = movableIds.has(token.id);
          const classes = ["token", token.color];
          if (movable) classes.push("movable");

          return (
            <div
              key={token.id}
              className={classes.join(" ")}
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
              onClick={() => movable && onTokenClick(token.id)}
              title={`${token.color} token`}
            >
              {seen === 0 && total > 1 && (
                <span className="count">{total}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
