# DUTCH · The Card Club

A responsive, private multiplayer Dutch/Cabo game for 2–8 humans. React, TypeScript, Vite, Tailwind, GSAP, Zustand, and Howler audio. Production runs entirely on Cloudflare Workers, Static Assets, and one authoritative, SQLite-backed Durable Object per room. No Node server, signaling service, WebRTC requirement, D1, or R2.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm install
npm run build
npm run dev
```

Open **http://localhost:5050**. Create a table, copy its invite, and open that invite in another tab. Each tab gets an independent seat; no incognito window is required. Each player enters a name, marks ready, and the table owner deals. Wrangler runs the actual Worker/Durable Object runtime on port 8787; Vite proxies `/api`, including WebSockets. `npm run dev` serves the frontend on all interfaces. Local SQLite lives in `.wrangler/state`.

For a single production-like server, run `npm run build` followed by `npx wrangler dev --port 8787`, then visit http://localhost:8787. Production and local sessions use the same protocol and engine.

To test on a second device, expose the development server through a **HTTPS tunnel**, or deploy to Cloudflare. The browser's secure-context APIs (including random UUIDs and clipboard) need localhost or HTTPS. If using a tunnel, set `ALLOWED_ORIGIN` in `.dev.vars` to its exact HTTPS origin. Never expose Vite as a production server.

## Play

1. Two complete 52-card decks (104 cards) are shuffled together. There are 52 red-backed and 52 black-backed cards, with unique identities even when rank and suit match. Four cards are dealt face down. Each player can privately inspect any two, then locks in. A countdown ends the peek automatically.
2. Draw from the deck, then keep it by exchanging one or several same-rank hand cards, or discard the draw. A taken discard must be exchanged. To keep the draw and drop a group, select matching hand cards and drag the group to discard, drag your drawn card onto a selected slot, or press **K** / **Keep draw · drop N**. The draw enters one selected slot and the other selected slots disappear. For example, keep a drawn 5 and discard three hand 9s together, leaving two hand cards. If the drawn rank equals the outgoing hand rank, the draw and every selected hand card are automatically discarded instead of keeping the draw. This also applies to a taken discard. Normal play passes to the next player; earned hand Jack/Queen powers resolve first. All outgoing hand Queens/Jacks grant their corresponding powers.
3. **Jack and Queen powers come from your hand.** Each Queen discarded from your hand automatically grants one blind swap, whether you replace it with a draw or discard it in a free throw. Each Jack discarded from your hand grants one private peek at your own cards. Two hand Jacks grant two peeks; three grant three. A Jack or Queen discarded directly from the draw pile grants no power. Three hand Queens grant three separate swaps. Each swap exchanges any two different cards at the table, including your own; identities stay hidden. The owner of the earned power makes each choice, even if they earned it during another player’s turn. Choose all earned swap pairs; the complete plan is sent as one action and applied in one state version. You can also apply a partial plan or skip uses. Matching free throws remain available while hand powers are pending. Each thrower’s powers are retained in a visible server-ordered queue, and the original turn resumes after every queued owner finishes. Other optional peek powers remain explicit: discard a deck-drawn 7/8 to peek at your own card, or 9/10 to peek at an opponent’s.
4. **Free throws** match rank by default. Drag a hand card directly onto the top discard to match it on anyone’s turn. Drag it onto your own deck draw to match that draw and discard both. To throw several matching cards at once, select them with taps (use **Select multiple** / **F** when holding a draw), then drag any selected card onto the target. Or press **T** / **Throw N cards** to submit against your own deck draw if held, otherwise the discard. Drawing a Queen with three hand Queens lets you discard all four, leaving one hand card and earning three blind swaps. Every selected card is validated against the same target in one authoritative action. If any selected card mismatches, none are removed and one hidden penalty card is added. Invalid/duplicate indices are rejected. A taken discard must still be swapped. Free throws remain available during queued hand powers; optional deck peek powers finish before play continues. If your hand becomes empty, earned hand-card powers resolve before scoring. Out-of-turn powers pause and then restore the interrupted turn and any held draw. House rules may disable powers/free throws, change matching to point value, while free throws always remain available on anyone’s turn when matching is enabled.
5. Declare Dutch **before drawing**, ending your turn, or immediately after completing your turn until the next player draws from either pile. A post-turn call keeps that next player’s turn in place; they still receive their final turn. Each opponent gets exactly one final turn. If any card in the caller’s hand is swapped, Dutch is cancelled and normal play resumes; Dutch can be called again at the beginning of a later turn. Lowest card total wins; a failed call adds the configured penalty. By default the caller must be strictly lower than everyone else.
6. The round’s joker rank scores **0** for every suit and both decks. The schedule is **K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2, A**. The seventh played round has 7 as its joker. For other ranks, A = 1, 2–10 = face value, J = 11, Q = 12, red K = 0, black K = 13. Lowest cumulative score wins a match; ties are shared.

The Rules screen explains all house rules. Before starting, the owner can configure 10–120-second turns, 10–60-second peeking, powers, rank/value burning, 0–50-point calling penalties, tie treatment, and a 10–500-turn safety cap. Every match has 13 rounds labelled 13 down to 1, with a minimum of two players. Changing rules resets readiness. The starter rotates each round. On deck exhaustion, discards below the top card are reversed and recycled deterministically; the visible top stays in place. An expired turn discards any held card without powers and passes. The safety cap scores the round automatically.

## Mouse, touch, and keyboard controls

Drag the deck or top discard straight onto a hand slot to draw and replace it. The draw is acknowledged by the server before the swap is sent. Alternatively, swipe a pile downward to draw, then drag the held card onto a hand slot to replace it. If that slot is part of a selected matching group, the draw replaces the entire group, unless its rank matches the group—in that case all selected cards and the draw are discarded automatically. While holding a draw, dragging a hand card/group onto discard keeps the draw and exchanges that group; dropping the hand group onto the drawn card instead attempts a free throw that discards both. Swipe the held deck-drawn card upward or onto the discard pile to discard it without activating powers. A taken discard must be swapped. A hand card cannot be freely discarded without a replacement except through a matching free throw. Free throws are enabled by default.

Keyboard: **E** draw deck, **R** take discard, **1–4** peek/select own card (or swap a held draw when not in F selection mode), **X** discard held card, **P** discard and activate its power, **D** Dutch confirmation, **L** lock initial peeks, **F** (or **B**) toggle multi-card selection, **T** free throw selected cards, **K** keep the draw and exchange selected matching cards, **S** skip power, **Escape** clear selection. **Left/Right** focus eligible cards; **Tab/Enter** operate every card and button, including opponent choices for Queen swaps. Shortcuts pause in forms and dialogs. The table includes a visible, expandable keyboard reference.

The interface uses a neutral slate palette and traditional white card faces, with red hearts/diamonds and black spades/clubs. Two full 52-card decks are shuffled together (104 total): one has a red crosshatch back, the other a black dotted back. Back designs are public and move with the physical cards; they identify the source deck, never the suit or rank. Each deck contains all four suits. Reduced motion and effects settings are respected.

## Built-in sound

Ten locally hosted, original synthesized WAV assets, with no third-party audio dependency: layered card snaps, slides, flips, rhythmic dealing, successful burns, failed-burn penalties, a sparkling Queen power flourish, Dutch sting, victory notes, and optional warm lounge ambience. Effects are on by default and start following a browser gesture. Ambience is opt-in. Volume, mute, motion effects, name, and avatar persist locally. Reduced motion is respected. Settings include playable previews. Sound events come from accepted authoritative actions and carry unique IDs, so replays do not double-play sounds. A failed burn has a different cue from a legal burn; a blind swap has a special cue; emptying your hand plays the Dutch/victory cue.

## Architecture

```text
apps/client          React UI, pointer/keyboard controls, cards, GSAP transitions, audio
apps/worker          HTTP router + GameRoom Durable Object + SQLite
packages/engine      Pure deterministic rules, scoring, private state projection
packages/protocol    Versioned client/server messages and sound event types
```

`POST /api/rooms` creates a random six-character room, `POST /api/rooms/:code/join` reserves a seat. The normalized code maps to exactly one `ROOMS.getByName(code)` instance. Room creation retries collisions. The Durable Object generates the full deck and uses rejection-sampled cryptographic Fisher–Yates shuffling. No client card identities or scores are accepted.

Seats receive high-entropy bearer capabilities, stored only in that tab's `sessionStorage` (not preferences or URLs). Only SHA-256 token hashes are persisted on the server. WebSockets pass the capability through a `seat.<token>` subprotocol and negotiate `dutch-v1`; HTTP seat operations use `Authorization: Bearer`. Keep tokens out of logs. All production transport uses HTTPS/WSS. Independent tab sessions allow testing many players in one browser. Reload reconnects the same seat; opening the same seat in a second tab supersedes its earlier connection.

Every accepted action includes protocol version, action UUID, and expected state version. The server validates membership, turn, phase, indices, and rules; atomically persists a snapshot and deduplication receipt before broadcasting player-specific projections. Stale actions receive a current snapshot and actionable error. Receipts retain the latest 1,000 versions; older replays are rejected by version checks. The room WebSocket can also relay bounded WebRTC offer, answer, and ICE candidate messages between authenticated seats. Gameplay continues over the authoritative Durable Object WebSocket.

The server uses `acceptWebSocket`, attachment serialization, and `webSocketMessage`/`webSocketClose`, allowing hibernation. Heartbeat ping/pong is handled by `setWebSocketAutoResponse` without waking the object. A single Durable Object alarm schedules the next turn expiry, disconnected-seat deadline, or room TTL. There are no server intervals. Constructors load the SQLite snapshot and session metadata after eviction/restart. Client heartbeats detect silent connections; capped exponential backoff reconnects and recovers snapshots. A lost table owner never loses authoritative state because authority resides on Cloudflare.

A player has a two-minute reconnection grace period. After that, a live round is explicitly interrupted **without scoring**; once the group reconnects, the owner can rematch. Lobby seats missing beyond the grace period are removed and ownership transfers if needed. Room state expires after 24 hours of inactivity and SQL storage is deleted. Room-scoped history survives reloads and Worker restarts until expiry. Cross-room account/history persistence is intentionally outside this account-free version.

Security: Cloudflare API rate limiting (120 requests/minute/IP; TURN credential requests also have a 12/minute/IP limit), per-WebSocket persisted message windows (40/10 seconds), 4 KB action payloads and bounded signaling payloads, validated names/rules, same-origin checks, capacity limits, safe React text rendering, deduplication, and private state projection. TURN credentials require an authenticated room seat and expire after six hours. API rate limits are per Cloudflare location, not a global abuse system. Cloudflare and the operator remain trusted; the architecture does not promise cheat-proof play, prevent players sharing privately observed cards, or eliminate memory aids. The browser never gets the authoritative deck or long-lived TURN key.

## Tests and checks

```sh
npm test                   # Engine, hidden-information, and gesture intent tests
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e            # Starts Vite + Wrangler if not already running
```

Playwright uses real local Durable Objects and real WebSocket connections, including independent browser contexts, same-browser multi-tab seats, private peeks, duplicate action receipts, reconnect/reload, a full round and rematch, room capacity/auth/input validation, and eight concurrent WebSocket clients. Desktop/mobile screenshots are written to `test-results`. True Cloudflare hibernation and host-level restarts are platform behavior and should also be exercised in a staging deployment; local Wrangler does not fully simulate eviction. No tests mock a multiplayer server.

## Deploy to Cloudflare

```sh
npx wrangler login
npm run deploy
```

`wrangler.jsonc` defines the Worker, SPA static assets, `GameRoom` namespace, initial SQLite class migration, observability, rate limiters, TURN key ID, and environment defaults. The optional TURN key API token is stored as a Worker secret, never in source or browser storage. Set `TURN_KEY_API_TOKEN` locally in the gitignored `.dev.vars` file. For production, use `npx wrangler secret put TURN_KEY_API_TOKEN`. An authenticated room seat can request six-hour ICE credentials with `POST /api/rooms/:code/turn-credentials`; the long-lived key stays in the Worker. Set a custom domain in Cloudflare if desired. The engine and all generated audio are bundled/hosted with the app. Google Fonts are optional; local serif/sans-serif fallbacks keep the UI functional offline from that service.

Configuration in Wrangler `vars` (or local `.dev.vars`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `ROOM_TTL_HOURS` | `24` | Inactive room lifetime |
| `RECONNECT_GRACE_SECONDS` | `120` | Reserved-seat/reconnect window |
| `ALLOWED_ORIGIN` | unset | Optional exact secondary origin; same-origin is always accepted |
| `TURN_KEY_ID` | Set in `wrangler.jsonc` | Cloudflare Realtime TURN key identifier (not secret) |
| `TURN_KEY_API_TOKEN` | Secret | Server-side token used to issue temporary TURN credentials |

Never rename/delete an existing Durable Object class migration on a deployed game. Apply additive, versioned migrations for future storage schema changes. Schema 7 stores a versioned JSON engine snapshot in SQLite `room` and bounded action receipts in `actions`. Any future engine-state shape changes need explicit snapshot migration before rollout.

Schema 1/2/3/4/5/6 room snapshots migrate to schema 7 without changing the order or identities of active cards. Legacy cards receive red-back metadata. An already-running 52-card round finishes with its existing cards; its next round uses the full 104-card shoe. Create a new room to use two decks immediately.

Schema 4 persists the hand power kind (Queen swap or Jack peek), owner, remaining uses, continuation mode, and paused turn time. Schema 3 Queen queues migrate without losing uses. Recovery retains earned swaps/peeks, private reveals, and the interrupted player’s held draw.

Concurrent free throws carry a public hand revision and the matching target ID. The Worker accepts a recently stale room version only for these validated throws: the selected hand must still have the same revision and the current discard must still match the observed number. Duplicate action IDs remain deduplicated. A changed hand or matching number requires a fresh selection. Swaps validate every planned pair and selected-hand revision before applying the plan atomically.

Schema 5 preserves the FIFO hand-power queue, each owner’s remaining uses, hand revisions, and the latest public swap animation event. All clients animate exchanged card positions using card backs only; reduced-motion/effects-disabled players receive a position highlight and swap confirmation. Animation events contain player IDs, slot indices, and public back designs, never hidden ranks or suits. Reloading does not replay old animations.

Batch exchanges validate every selected index, uniqueness, hand revision, and equal ranks before changing cards. They apply in one authoritative state version. The drawn card need not match the outgoing hand group. A later matching free throw is still allowed on another player’s turn, so completing a single exchange does not block dropping a remembered match afterward.

Automatic matching replacements are checked on the authoritative server, comparing ranks independently of suit, back design, point value, or the optional free-throw setting. Removing the final hand card scores the round, after any earned hand powers. The drawn card never counts toward the number of Jack/Queen powers.

Free throws have no own-turn-only restriction. Older saved `burnAnytime: false` settings are normalized on restore, and the engine never applies a turn-owner check to matching throws. Tabs check for a newer static client build when focused and offer a reload button; reloading preserves the tab’s seat.

Schema 6 adds the previous player’s Dutch call window. It opens after their turn fully completes, survives reconnect, and closes atomically when the next draw is accepted. Existing snapshots without this field begin with no retroactive call window.

Schema 7 records the joker rank alongside each round result. The engine retains ascending internal round ordinals for turn rotation and recovery, and projects descending round labels 13 → 1 for the UI. Zero-point joker values apply to scoring, Dutch success/penalties, results, and optional point-value matching. Default free throws still compare ranks. Joker status does not change hand Jack/Queen powers. Existing recorded scores remain unchanged and receive `jokerRank: null`; active and future rounds use the confirmed schedule.
