# Robo Words: notes for coding agents

A children's spelling game. React 19 + TypeScript + Vite front end, a small Node server (`server.mjs`) that serves `dist/` and keeps progress in SQLite. Read `README.md` for what the game does; this file is how to work on it.

## Commands

```sh
npm ci
npm run lint        # Biome (linter only; the formatter is off, do not reformat files)
npm run typecheck   # tsc, covers src, tools, tests
npm test            # tsx --test tests/*.test.ts
npm run build       # tsc && vite build -> dist/
npm start           # node server.mjs --port 8000 (data/robo2.sqlite3)
npm run profiles -- list|create|rename|delete   # tools/profiles.ts, talks to a running server
npm run events      # read the event log (read-only)
npm run audio       # optional: record Robo's voice with Kokoro/mlx-audio into public/audio/
```

CI (`.github/workflows/ci.yml`, job `ci`) runs `npm ci`, lint, typecheck, test, build on Node 24. All five must pass before you finish.

To try the app, build and run it on a spare port with a temporary database, never the default data folder:

```sh
npm run build && node server.mjs --port 8031 --db "$(mktemp -d)/test.sqlite3"
```

## Do not

- Read, copy, commit or print anything in `data/` (real children's progress) or any `*.sqlite3` file.
- Commit `public/audio/` (recordings) or `tools/manifest.json` (generated). Both are in `.gitignore`.
- Put real names, hostnames, home-directory paths or tailnet addresses in code, docs, tests or screenshots. Use `Sam`, `Alex`, `example.ts.net`, `/path/to/...`.
- Add Playwright or other screenshot tooling to the dependencies.
- Stop, restart or reuse a port that a person's running game may be using. Pick a spare port.

## Structure

| Path | What |
| --- | --- |
| `src/main.tsx`, `src/App.tsx` | App shell and screens: create-profile page, who-is-playing, home/level map, grown-ups page. |
| `src/Play.tsx` | The play screen for warm-up, mission, boss and together sessions. |
| `src/engine.ts` | Pure rules (no browser code): profiles, placement, mission planning, tray, scoring, moving up and down. Unit tested. |
| `src/content/defs.ts` | The ladder (`RUNG_DEFS`, `ZONES`), Robo's lines (`LINES`), word-file parser. |
| `src/content/words-*.txt` | Words per level. |
| `src/content/reactions.ts` | Robo's word reactions (`Act`), colours, jokes. |
| `src/store.ts` | Profile load/save/delete (server first, localStorage copy), "where was this device" resume state. |
| `src/audio.ts` | Clip playback with device-voice fallback; letter sounds; synthesized sound effects. |
| `src/robots/` | Robot plug-in (see below). |
| `src/telemetry.ts` | Event log client; events go to `POST /api/events`. |
| `server.mjs` | Static server for `dist/` plus the JSON API (profiles, events). |
| `tools/` | `manifest.ts` (clip list, also `loadLadder()` for tests), `make_audio.py`, `profiles.ts`, `events.mjs`, `fake-tiny.mjs`. |
| `tests/` | `node:test` files run through tsx. |
| `deploy/spell-server.plist.example` | launchd template with placeholder paths. |

## Profiles

There are no built-in profiles. When the server has none, the app opens the create-profile page (`CreateProfile` in `App.tsx`). A `Profile` (see `engine.ts`) has `id`, `name`, `placed`, `rung`, `keyboard`, `letterCheck` (check each letter as placed on new levels; default on), `warmupStart` (0, 5 or 12: where the warm-up begins), plus stars, words, per-level state and a log. `newProfile(id, name, options)` makes one; `newProfileId(name, taken)` makes a URL-safe id.

Stored in the `profiles` table (`id`, JSON `data`). API:

- `GET /api/profiles` returns `{profiles: [...]}`.
- `PUT /api/profiles/:id` with the full profile JSON creates or replaces it. `body.id` must equal the URL id; `name` must be a string of at most 40 characters. Ids match `[a-z0-9_-]{1,40}`.
- `DELETE /api/profiles/:id` removes it (404 if absent).
- Writes from another origin get 403.

Create, rename and delete from a terminal with `npm run profiles -- ...` (the server must be running; `--url` picks another one). Or use the grown-ups page: **+ Add a child**, edit the name field, **Delete profile**. Placement (`applyPlacement`) switches a child to the full keyboard at "ai / ay" or above, whatever the create page said.

Together mode takes any two profiles: `Session = {kind: 'together', partner: <id>}`, the first player is the profile in `who`.

## Level ladder and content

`RUNG_DEFS` in `defs.ts` lists the 32 levels in order (`id`, zone, kid-facing name, grown-up title, lesson text, examples, decoy letters). Word files hold `## level-id` sections of `word | emoji | sentence` lines; `buildLadder` joins them, and a word used in two levels keeps its first sentence. Every fourth word of a level is a boss word (`bossWords`), the rest are practice words. Tests require 20+ words per level and a sentence containing each word. After editing words run `npm test`, and `npm run audio` if you use recorded voice.

## Audio

No audio is shipped. `say(clips)` in `audio.ts` tries `/audio/<path>.m4a` for each clip, and if it is missing speaks `clip.text` with `speechSynthesis`. Every clip the game builds carries text (`wordClip`, `sentenceClip`, `lessonClip`, `line()`, jokes); keep it that way. Letter sounds (`letterSound`) are silent when `public/audio/letters/<a-z>.mp3` is missing, on purpose. Robo lines must not contain names: "your turn" is `LINES.turn`, and the player's name is shown on screen. Letter files are Phonicademy's and must never be added to the repo.

### Where the sounds come from, and regenerating them

- Spoken clips (words `w/`, sentences `s/`, lessons `l/`, Robo lines `r/`, jokes `j/`) are generated, not recorded: Kokoro (`mlx-community/Kokoro-82M-bf16`, voice `af_heart`) through mlx-audio, by `tools/make_audio.py`. `tools/manifest.ts` first writes `tools/manifest.json`, the list of every clip and its text, from the content files; `npm run audio` runs both.
- The generator needs an Apple silicon Mac and a Python environment at `~/.cache/kokoro-tts/.venv` (set-up commands are in the README under "Recorded voice"). The path must stay short or espeak fails with a "phontab" error. If the environment is missing, tell the person and offer to set it up; do not install it unasked (it downloads a model).
- It only makes clips that are missing. After adding or changing words: `npm test`, `npm run audio`, `npm run build`. To redo one clip, delete its `.m4a` first, or pass clip paths: `~/.cache/kokoro-tts/.venv/bin/python tools/make_audio.py w/cat s/cat`.
- Letter sounds are Phonicademy recordings (https://phonicademy.com/phonemes). Their license forbids redistributing the files, so never download them into the repo for someone or commit them; point the person to the README.
- Sound effects are synthesised in `src/audio.ts`; there are no effect files.

## Robot plug-in

`src/robots/types.ts` defines `Robot`: `react(word, act, stars)`, `puzzled()`, `faceTurn(side)`, `celebrate(kind, center)`, `status()`. `src/robots/index.ts` has `ROBOT_TYPES` (none, mtiny, fake-tiny) and the `robot` object the game calls; it forwards to the type chosen in `localStorage` (`robot.type`, `robot.address`, `robot.mode`, `robot.sounds`, in `settings.ts`). Defaults: type `none`, empty address. `mtiny.ts` implements the Makeblock mTiny over the HTTP API of https://github.com/mb-dev/robot-mtiny-control (`GET /api/moves?steps=<json>`, `GET /api/status`); `fake-tiny` is the same code pointed at `tools/fake-tiny.mjs` (default `http://localhost:8766`). Rules for any robot: never block the game, swallow every failure, end every routine where it started. To add a robot, write a `Robot`, add an entry to `ROBOT_TYPES`, extend `tests/robots.test.ts`. mTiny routines are tested in `tests/mtiny.test.ts` (distance, rotation, duration limits).

## Testing rules

- Add or update tests with every behaviour change. Pure rules go in `tests/engine.test.ts`; server API tests start `server.mjs` on a free port with a temp `--db` (see `tests/profiles.test.ts`).
- Tests must not touch `data/`, port 8000, real addresses or the network (stub `fetch`).
- Do not add Playwright to the repo. For screenshots, install it in a throwaway directory outside the repo and run the built app on a spare port with a temp database and demo profiles.
- Code style: terse, one-line helpers, short comments saying why. Biome lint must pass; do not enable the formatter or mass-reformat.
