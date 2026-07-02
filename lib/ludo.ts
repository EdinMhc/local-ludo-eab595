// ---------------------------------------------------------------------------
// Ludo game engine — pure logic, no React.
// The board is a 15x15 grid. We model the shared track as a ring of 52 cells,
// plus a 6-cell colored home column per player, plus the yard (locked) and the
// center goal.
// ---------------------------------------------------------------------------

export type Color = "red" | "green" | "yellow" | "blue";

export const COLORS: Color[] = ["red", "green", "yellow", "blue"];

export const COLOR_HEX: Record<Color, string> = {
  red: "#e53935",
  green: "#43a047",
  yellow: "#fdd835",
  blue: "#1e88e5",
};

// A token position:
//  - state "yard": locked in the home yard (index 0..3 slot in yard)
//  - state "track": on the shared ring; `steps` = 0..50 progress from this
//        player's entry point.
//  - state "home": on the colored home column; `steps` 0..4 (5 cells), 5 = goal
//  - state "done": reached the center goal
export type TokenState = "yard" | "track" | "home" | "done";

export interface Token {
  id: string;
  color: Color;
  state: TokenState;
  // progress: 0..50 on the ring (relative to player entry), then 51..56 for home column,
  // 57 for the center goal. We store a single "progress" number 0..57 where:
  //   progress 0..50  -> on shared ring (51 cells traveled starting at entry)
  //   progress 51..56 -> home column (6 cells)
  //   progress 57     -> center goal (done)
  // A token in the yard has progress = -1.
  progress: number;
}

export interface Player {
  color: Color;
  tokens: Token[];
  active: boolean; // is this seat in the game?
}

export interface GameState {
  players: Player[]; // only active players present
  currentPlayerIndex: number; // index into players
  dice: number | null;
  consecutiveSixes: number;
  // moves that must be made after a roll before rolling again
  awaitingMove: boolean;
  bonusRoll: boolean; // player gets to roll again (6 or capture)
  winner: Color | null;
  message: string;
  rolling: boolean;
}

// ---------------------------------------------------------------------------
// Board geometry
// ---------------------------------------------------------------------------
// The 52-cell shared ring, expressed as [row, col] on a 15x15 grid, in
// clockwise order. Index 0 is the top of the ring near red's start.
// This is the standard Ludo path layout.

// We build the ring for the classic board. Coordinates use row 0 = top.
export const RING: [number, number][] = [
  // starting near red (top-left quadrant) going clockwise
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0],
];

// Entry index into RING for each color's first track cell.
export const ENTRY_INDEX: Record<Color, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

// Safe cells (star squares + colored start squares) as RING indices.
// Start squares are the entry indices; stars are 8 cells further from each.
export const SAFE_RING_INDICES: number[] = [0, 8, 13, 21, 26, 34, 39, 47];

// Colored home column cells [row,col], 5 cells leading toward center, ordered
// from ring toward center. The 6th step (progress 56) is the last home cell,
// progress 57 is the center goal.
export const HOME_COLUMN: Record<Color, [number, number][]> = {
  red: [
    [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6],
  ],
  green: [
    [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7],
  ],
  yellow: [
    [7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8],
  ],
  blue: [
    [13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7],
  ],
};

// Center goal cell
export const CENTER: [number, number] = [7, 7];

// Yard token slot positions [row,col] for each color (the 4 circles in the home yard box).
export const YARD_SLOTS: Record<Color, [number, number][]> = {
  red: [[1.7, 1.7], [1.7, 3.3], [3.3, 1.7], [3.3, 3.3]],
  green: [[1.7, 10.7], [1.7, 12.3], [3.3, 10.7], [3.3, 12.3]],
  yellow: [[10.7, 10.7], [10.7, 12.3], [12.3, 10.7], [12.3, 12.3]],
  blue: [[10.7, 1.7], [10.7, 3.3], [12.3, 1.7], [12.3, 3.3]],
};

// ---------------------------------------------------------------------------
// Position resolution: given a token, return [row, col] for rendering.
// ---------------------------------------------------------------------------
export function tokenCell(token: Token, slotIndex: number): [number, number] {
  if (token.state === "yard") {
    return YARD_SLOTS[token.color][slotIndex];
  }
  if (token.state === "done") {
    return CENTER;
  }
  if (token.progress <= 50) {
    const ringIdx = (ENTRY_INDEX[token.color] + token.progress) % 52;
    return RING[ringIdx];
  }
  // home column: progress 51..56 -> index 0..5
  const homeIdx = token.progress - 51;
  return HOME_COLUMN[token.color][homeIdx];
}

// Ring index a track token currently occupies (for capture / safe checks).
export function ringIndexOf(token: Token): number | null {
  if (token.state === "track" && token.progress <= 50) {
    return (ENTRY_INDEX[token.color] + token.progress) % 52;
  }
  return null;
}

export function isSafeRingIndex(idx: number): boolean {
  return SAFE_RING_INDICES.includes(idx);
}

// ---------------------------------------------------------------------------
// Game setup
// ---------------------------------------------------------------------------
export function createGame(activeColors: Color[]): GameState {
  const players: Player[] = activeColors.map((color) => ({
    color,
    active: true,
    tokens: Array.from({ length: 4 }, (_, i) => ({
      id: `${color}-${i}`,
      color,
      state: "yard" as TokenState,
      progress: -1,
    })),
  }));

  return {
    players,
    currentPlayerIndex: 0,
    dice: null,
    consecutiveSixes: 0,
    awaitingMove: false,
    bonusRoll: false,
    winner: null,
    message: `${cap(players[0].color)}'s turn — roll the dice!`,
    rolling: false,
  };
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Move validation
// ---------------------------------------------------------------------------
// The max progress is 57 (center goal). To reach goal you need EXACT roll.
export const GOAL_PROGRESS = 57;

export function canTokenMove(token: Token, dice: number): boolean {
  if (token.state === "done") return false;
  if (token.state === "yard") {
    return dice === 6; // must roll 6 to leave yard
  }
  // track or home column
  const target = token.progress + dice;
  return target <= GOAL_PROGRESS;
}

export function movableTokens(player: Player, dice: number): Token[] {
  return player.tokens.filter((t) => canTokenMove(t, dice));
}

// ---------------------------------------------------------------------------
// Apply a move to a token. Returns new state + whether a capture happened.
// ---------------------------------------------------------------------------
export interface MoveResult {
  state: GameState;
  captured: boolean;
  reachedGoal: boolean;
}

export function applyMove(state: GameState, tokenId: string): MoveResult {
  const dice = state.dice!;
  const next: GameState = structuredCloneGame(state);
  const player = next.players[next.currentPlayerIndex];
  const token = player.tokens.find((t) => t.id === tokenId)!;

  let captured = false;
  let reachedGoal = false;

  if (token.state === "yard") {
    // leave the yard onto entry cell
    token.state = "track";
    token.progress = 0;
  } else {
    token.progress += dice;
    if (token.progress >= GOAL_PROGRESS) {
      token.progress = GOAL_PROGRESS;
      token.state = "done";
      reachedGoal = true;
    } else if (token.progress >= 51) {
      token.state = "home";
    } else {
      token.state = "track";
    }
  }

  // Capture check — only for track cells that are not safe.
  const myRing = ringIndexOf(token);
  if (myRing !== null && !isSafeRingIndex(myRing)) {
    for (const p of next.players) {
      if (p.color === token.color) continue;
      for (const t of p.tokens) {
        const r = ringIndexOf(t);
        if (r === myRing) {
          // send home
          t.state = "yard";
          t.progress = -1;
          captured = true;
        }
      }
    }
  }

  // Win check
  if (player.tokens.every((t) => t.state === "done")) {
    next.winner = player.color;
    next.message = `${cap(player.color)} wins the game! 🎉`;
    next.awaitingMove = false;
    next.bonusRoll = false;
    next.dice = dice;
    return { state: next, captured, reachedGoal };
  }

  next.awaitingMove = false;

  // Decide bonus roll: rolling a 6, or making a capture, grants another roll.
  const grantsBonus = dice === 6 || captured;
  if (grantsBonus) {
    next.bonusRoll = true;
    next.dice = null;
    let reason = "";
    if (captured && dice === 6) reason = "Capture + a six! Roll again.";
    else if (captured) reason = "Capture! Bonus roll — go again.";
    else reason = "You rolled a six — roll again!";
    next.message = `${cap(player.color)}: ${reason}`;
  } else {
    // pass turn
    next.consecutiveSixes = 0;
    advanceTurn(next);
  }

  return { state: next, captured, reachedGoal };
}

// ---------------------------------------------------------------------------
// Rolling the dice
// ---------------------------------------------------------------------------
export interface RollResult {
  state: GameState;
  autoPassed: boolean;
}

export function rollDice(state: GameState, forced?: number): RollResult {
  const next: GameState = structuredCloneGame(state);
  const value = forced ?? 1 + Math.floor(Math.random() * 6);
  next.dice = value;
  next.bonusRoll = false;
  const player = next.players[next.currentPlayerIndex];

  if (value === 6) {
    next.consecutiveSixes += 1;
    if (next.consecutiveSixes >= 3) {
      // three sixes -> forfeit turn
      next.consecutiveSixes = 0;
      next.dice = null;
      next.awaitingMove = false;
      const forfeitColor = player.color;
      advanceTurn(next);
      next.message = `${cap(forfeitColor)} rolled three sixes — turn forfeited!`;
      return { state: next, autoPassed: true };
    }
  } else {
    next.consecutiveSixes = 0;
  }

  const moves = movableTokens(player, value);
  if (moves.length === 0) {
    // no legal moves -> pass (unless this was a bonus situation, still pass)
    next.awaitingMove = false;
    next.dice = null;
    next.consecutiveSixes = 0;
    const c = player.color;
    advanceTurn(next);
    next.message = `${cap(c)} rolled ${value} — no legal moves. Turn passes.`;
    return { state: next, autoPassed: true };
  }

  next.awaitingMove = true;
  next.message = `${cap(player.color)} rolled ${value} — pick a highlighted token.`;
  return { state: next, autoPassed: false };
}

function advanceTurn(state: GameState) {
  state.currentPlayerIndex =
    (state.currentPlayerIndex + 1) % state.players.length;
  state.dice = null;
  state.awaitingMove = false;
  state.bonusRoll = false;
  const p = state.players[state.currentPlayerIndex];
  state.message = `${cap(p.color)}'s turn — roll the dice!`;
}

// structuredClone may not be available everywhere; provide a safe deep clone.
function structuredCloneGame(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}
