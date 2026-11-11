---
name: robo-words
description: Set up, run and customise the Robo Words children's spelling game. Use when asked to install or start the game, create or edit child profiles, add or change spelling words, generate Robo's recorded voice, launch it for an iPad, or connect a robot (Makeblock mTiny).
---

# Robo Words

Read `CLAUDE.md` in the repo root first; it has the structure and rules. Never read, copy or commit `data/`, `public/audio/` or `*.sqlite3` files.

## Set up and run

Needs Node 24+.

```sh
npm ci
npm run build
npm start                      # http://localhost:8000, progress in data/robo2.sqlite3
```

To try changes without touching real progress, use a spare port and a temporary database:

```sh
node server.mjs --port 8031 --db "$(mktemp -d)/test.sqlite3"
```

Check it answers: `curl -s localhost:8031/api/profiles` returns `{"profiles":[]}` on a fresh database. Stop only servers you started.

Reaching it from other devices: same Wi-Fi at `http://<computer-ip>:8000`; or install Tailscale and run `tailscale serve --bg 8000` (an HTTPS `ts.net` address). For a Mac login service, copy `deploy/spell-server.plist.example` to `~/Library/LaunchAgents/`, replace the `/path/to/...` placeholders, and `launchctl bootstrap gui/$(id -u) <file>`.

## Create and edit profiles

There are no default profiles; the first visit opens a create-profile page. From a terminal, with the server running:

```sh
npm run profiles -- list
npm run profiles -- create "Sam" --start 0        # --start 0 | 5 | 12 (warm-up starting point); --no-letter-check; --keyboard
npm run profiles -- rename sam "Samantha"
npm run profiles -- delete sam                    # permanent: confirm with the person first
npm run profiles -- list --url http://localhost:8031
```

Or use the grown-ups page (press and hold the button on the first screen, or open `/#grownups`). The API is `GET /api/profiles`, `PUT /api/profiles/:id`, `DELETE /api/profiles/:id`.

## Add words

Edit a `src/content/words-*.txt` file: under the `## level-id` heading (ids are in `RUNG_DEFS` in `src/content/defs.ts`) add `word | emoji | sentence` lines. Lowercase letters only; the sentence must contain the word. Every fourth word of a level is a boss word. Then:

```sh
npm test && npm run build
```

If recorded voice is installed, run `npm run audio` before the build to record the new clips.

## Recorded voice (optional)

Without recordings the browser's speech reads everything, so skip this unless asked. On an Apple silicon Mac with the Kokoro environment at `~/.cache/kokoro-tts` (short path required) and mlx-audio:

```sh
npm run audio       # writes missing clips to public/audio/ (w, s, l, r, j folders); re-run is safe
npm run build
```

Delete a clip's `.m4a` to re-record it. Letter sounds (`public/audio/letters/a.mp3` ... `z.mp3`) are not generated and not included: the person must obtain them themselves (see README). Never add audio to git.

## Connect a robot

On the grown-ups page, **Robot**: choose "Makeblock mTiny" and enter the address of a running https://github.com/mb-dev/robot-mtiny-control server. The page shows whether the robot answers. Try first with "Fake mTiny" and `node tools/fake-tiny.mjs`, which prints each step. Settings are per device (localStorage). If the game is served over HTTPS the robot address must be HTTPS, and the robot server must allow the game's origin (CORS). To add a different robot type see "Robot plug-in" in `CLAUDE.md`.

## Before you finish

`npm run lint && npm run typecheck && npm test && npm run build` must all pass.
