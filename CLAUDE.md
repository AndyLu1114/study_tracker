# Study Tracker: notes for Claude

Context for new sessions: what this project is, how the owner likes to work,
decisions already made, and what is still open. Keep it current when decisions change.

## Working with the owner

- **Discuss first, build after confirmation.** The owner often says "we are in discussion phase, don't modify anything yet". Propose a plan with suggested defaults and wait for a go-ahead before changing code.
- The owner is not a professional developer: explain GitHub, licensing and tooling in plain words, step by step.
- The app UI is English and Traditional Chinese (Taiwan). Every user-facing string goes in both languages in `src/shared/i18n.ts` (the `zh-TW` dictionary is typed so a missing key fails typecheck).
- Git: work on a `claude/...` branch, never push to `main`. The owner merges pull requests. If the previous PR was merged, fast-forward the branch to `origin/main` before new work (`git merge --ff-only origin/main`).
- Before pushing: `npm run typecheck`, `npm test`, `npm run build`. CI must stay green.

## What the app is

A desktop study app (Electron + React + TypeScript), Windows and macOS. All data is local (one JSON file in the user data folder); no accounts, no cloud, and **no AI inside the app** (deliberate: the app must stay focused on study tracking).

Tabs: **Goals** (default page) · **Study Plans** · **Study Clock** · **Calendar** (next 3 days) · **Statistics** · **Settings**. Plus a mini always-on-top clock window and `?` help cards on every page.

Key behaviours already agreed with the owner:
- Plans: title, date, start time (defaults to now), duration, one tag, description, optional goal + checkpoint link. Typing a title suggests goals, then their checkpoints.
- Clock: stopwatch / countdown / pomodoro (runs until stopped; only focus time counts). Sessions under 1 minute are not saved. Timer runs in the main process and survives restarts.
- Right-click a plan (calendar or Study Plans) or press its play button: "Start timer" counts down the plan's time left and opens the clock; does nothing if there is no time left or the clock is busy. Left-click edits.
- Goals: checkpoints, tags, start/end date, optional target hours. Current / Upcoming / Completed. Completed = marked done by the user, or target hours reached. Goal progress stats live on the goal's detail page, not in Statistics.
- Statistics: 14-day check-in grid (levels: none / <30 min / 30-60 min / 1-3 h / 3 h+), bar chart by day/week/month split by tag, and a per-tag table under it (like the Studyplus app the owner showed as reference).

## Claude connector (MCP)

The owner chose to integrate with AI only through the **Claude desktop app**, via a local MCP server bundled with the app (`src/mcp/`, built to `out/mcp/index.cjs`, run under the app's own executable with `ELECTRON_RUN_AS_NODE=1`).
- Settings > Claude connector writes Study Tracker into Claude desktop's config (standard and Microsoft Store locations on Windows; `~/Library/Application Support/Claude` on Mac). The user then restarts Claude desktop; the server shows under Claude's **Settings > Developer**, not on the Connectors page.
- Rules agreed with the owner: Claude may read everything and create/edit goals, checkpoints and plans, and delete plans. A goal may be deleted **only when it is an exact duplicate** (same title + checkpoints); its links move to the kept goal. Recorded study time, settings and the timer are not reachable.
- While the app is open, changes go through it over a token-protected named pipe / Unix socket (`src/node/bridge.ts`) so they show live; otherwise the data file is edited directly. Daily backup before the first change (last 10 kept).
- ChatGPT/Gemini only support remote MCP servers; supporting them (and mobile) would need online sync. Not started.

## Builds and releases

- `.github/workflows/build.yml`: on every push, tests, builds Windows (NSIS installer + portable) and a universal macOS `.dmg`, and smoke-tests each packaged app (`scripts/smoke-packaged.mjs`).
- macOS is signed **ad-hoc** (`identity: '-'`; owner declined the $99/year Apple Developer fee), so users click "Open Anyway" once. The app offers to move itself to /Applications; the connector refuses to connect from a translocated path.
- `.github/workflows/release.yml`: Actions > Release > Run workflow on `main` with a version (e.g. `0.1.0`) builds, tests and publishes a GitHub Release with the installers. The repo has **release immutability** on, so the workflow attaches files to a draft and then publishes. Public download link: `https://github.com/AndyLu1114/study_tracker/releases/latest`.

## Open items

- **License: undecided.** Currently MIT. The owner objects to others modifying/republishing the app; options discussed: PolyForm Strict (verified text: no distribution, no changes, noncommercial use), a custom "free to use and share unmodified copies" notice, or a private repo with a separate public downloads repo. Whatever is chosen, add a third-party notices file (React, react-dom, scheduler, lucide-react, MCP SDK, zod) shipped with the app, because the build strips their license headers.
- **README rewrite** (agreed in principle, not done): split into `README.md` (English) and `README.zh-TW.md` with a language switch, make it concise, add a Download button to the latest release, move developer notes to `docs/DEVELOPMENT.md`.
- **Connector status wording**: "Connected" only means "added to Claude's config". Proposed: rename to "Added to Claude desktop" and/or record a "last used by Claude" timestamp so the app can show whether Claude really started it.
- A Mac user should try the `.dmg` once (Open Anyway, Move to Applications, look and feel); CI cannot check visuals.
- Possible later: mobile (web app or Capacitor), online sync.
