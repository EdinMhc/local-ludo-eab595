# Local-Ludo — Online Multiplayer

Real-time 2–4 player Ludo. Players join a room from their own devices, pick a
color, ready up, and the host starts the round. Server-authoritative game logic,
per-move timer, admin panel, and round scoring.

## Stack
- **Next.js 14** (App Router) + **custom Node server** (`server.ts`, run with `tsx`)
- **Socket.io** for real-time play (same origin, single service)
- **better-sqlite3** for settings + round history (`/data/local-ludo.db` in prod)
- Pure game engine in `lib/ludo.ts`, reused on client and server

## Scripts
```bash
npm run dev    # tsx watch server.ts — Next + Socket.io with HMR
npm run build  # next build (also type-checks server + client)
npm start      # tsx server.ts — production
```

## Environment variables
| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port (Railway sets this automatically) |
| `ADMIN_PASSWORD` | `admin123*5` | Password for the Admin Settings panel |
| `DB_PATH` | `/data/local-ludo.db` (prod) · `./data/local-ludo.db` (dev) | SQLite file location |

## Railway deploy
- Start command: `npm run start` (set in `railway.json`).
- Attach a **volume mounted at `/data`** so the SQLite DB survives redeploys.
- Optionally set `ADMIN_PASSWORD` to override the default.

## Architecture
```
Browser (React)  ──socket.io──▶  server.ts  ──▶  server/rooms.ts  ──▶  lib/ludo.ts
  app/page.tsx                   (Next + IO)      (authoritative)      (rules engine)
  lib/useRoom.ts                                  server/db.ts  ──▶  SQLite (/data)
```
The server owns all game state; clients render `RoomView` snapshots and send
intents (`roll`, `move`, …). Only the current player's intents are accepted.
