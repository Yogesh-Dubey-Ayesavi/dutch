# Clutch: Devvit (Reddit) app

A 1v1 Dutch duel for Reddit, using the shared rules engine in `../packages/engine` with the Ace power turned on (`acePower: true`).

- `npm run build` builds `dist/client` (launch + game entrypoints) and `dist/server/index.cjs`
- `npm run dev` runs `devvit playtest` (set `dev.subreddit` in devvit.json or `DEVVIT_SUBREDDIT`)
- `npm run deploy` uploads the app
- `npm run local` runs the whole app locally: the real server code on an in-memory Redis (`:5181`) and the real client (`:5180`). Open http://localhost:5180/game.html (add `?as=name` per tab to play as different users)
- `npm test` runs the bot-vs-bot server simulation; `npm run typecheck` checks client and server

Card art: faces are Adrian Kennard's CC0 SVGs, backs are Vectorized Playing Cards (LGPL), the table uses the original Dutch card artwork.
All credits and licences are in `THIRD_PARTY.md` (licence texts also ship in `dist/client/licenses/`).
