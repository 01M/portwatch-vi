# PortWatch VI

**Does GTA VI run on PC yet?** A static GitHub Pages site that tracks every serious community effort to recompile, emulate or port the leaked Xbox Series build of GTA VI to PC. All efforts are scored on one ladder, and a scout refreshes the data every day.

- One headline progress bar shows the closest effort, with the top projects pinned to it.
- A live countdown runs to the missing executable's expected drop.
- A leaderboard card per effort shows its own bar, milestone ladder, groundwork breakdown, what works and what's blocking.
- Further sections cover the watchlist of early projects, a toolkit of asset tools, the scout's inbox of new candidates, and fake-download warnings.

No game files, keys or executables are hosted or linked, ever.

## Deploy on GitHub Pages

1. Create a new GitHub repository and push this folder to its `main` branch.
2. In the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Open **Settings → Actions → General** and make sure workflows are allowed.
4. Open **Actions → Daily scout → Run workflow** to run the first scout. It commits fresh data and deploys the site.

From then on, `Daily scout` runs every day at 06:17 UTC. Any push to `main` redeploys the site through `Deploy site`. To scout more often around the executable drop, change the `cron` line in `.github/workflows/scout.yml`. For example, `17 */6 * * *` runs it every 6 hours.

## What the scout does (`scripts/scout.mjs`)

1. **Refreshes** every tracked repo: stars, forks, issues, last push, commits in the last 7 days, and whether it's gone (404, or 451 for a DMCA block). It also hashes each README to notice changes.
2. **Spots claims.** If a README newly says GTA VI boots, reaches the menu or runs at some FPS, the card shows an "unverified claim" banner and the change feed records it.
3. **Discovers** new repos from GitHub searches (`scout.queries` in `data/tracker.json`), Hacker News, Reddit and X, by pulling GitHub links out of posts.
4. **Filters out spam** such as clone networks, download lures and "PC installer" repos. Their names are counted under *There is no download*, never linked.
5. **Filters out copies.** Re-uploads of tracked projects are flagged when they reuse a tracked project's name or have a README that is 60% or more identical, renamed copies included. Original fan games and repos without a real README are skipped too. Candidates already waiting are re-checked every run.
6. **Scores substance** from code language, size, technical depth, status tables, tests and commit activity. Repos with real code go to **New candidates**, shown as plain text and not linked until reviewed. Thin or off-topic ones are remembered and skipped.
7. **Writes news** (needs `ANTHROPIC_API_KEY`). Claude searches the web for takedowns, bans, confirmed leaks, legal news, scams and official announcements, then writes up to two short original articles per run. A source is kept only if it came up in Claude's own search. Each article's image is the source's preview image, credited and linked back; it falls back to a generated cover.
8. **Records** a change feed, the day's leader score for the sparkline, and a run summary.

### Optional secrets (Settings → Secrets and variables → Actions)

| Secret | What it enables |
|---|---|
| `ANTHROPIC_API_KEY` | **Claude review.** When a tracked README changes, or a new candidate shows up, Claude (`claude-opus-5-5`) reads the README and recent commits and re-scores the effort. It also promotes or rejects candidates automatically. Guardrails clamp the output: a GTA VI milestone only counts if Claude quotes text that really appears in the repo, and groundwork can rise at most 0.3 per run. Reviews are capped at 12 per run. Each costs very roughly $0.05–0.20, depending on README size. |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | Reddit search through an app-only OAuth token, which is much more reliable than anonymous requests. Create a "script" app at reddit.com/prefs/apps. |
| `X_BEARER_TOKEN` | X recent search. This needs a paid X API tier. |

Without any secrets the scout still runs on GitHub search and Hacker News, and new finds wait in *New candidates* for you to review.

## Editing the data by hand

Everything lives in `data/tracker.json`:

- `efforts[]`: each effort has a `tier` (`tracked` puts it in the race, `watchlist` lists it below). Each also carries `groundwork` (four 0–1 values), `gta` (`loads`/`boots`/`menu`/`ingame` are 0, 0.5 or 1, plus `fps` and `stability`), and short `highlights` and `blockers`.
- `exe`: drives the countdown. If the release time is announced, set `expectedAt` (ISO time) and `timeAnnounced: true`. When it drops, set `status: "released"` and `releasedAt`, and the countdown turns into a "time since release" clock.
- `candidates[]`: move one into `efforts` to promote it, or into `ignored` to dismiss it.
- `site.heroImage` / `site.heroCredit`: hero artwork (see below).

Scoring is in `assets/js/scoring.js`, shared by the site and the scout. Groundwork fills 0–25%. After that, milestones sit at Exe runs 25, First frame 40, Main menu 55, In-game 70, 30 FPS 85 and Stable 100.

## Hero artwork

The hero shows an original sunset illustration until you add a photo. To use official GTA VI artwork, download a wallpaper or artwork image from Rockstar's official GTA VI site and save it as `assets/img/hero.jpg`, ideally about 2400px wide. The site finds it automatically and shows the credit line from `site.heroCredit`.

## Local preview

Any static server works. On Windows without Node or Python:

```powershell
powershell -ExecutionPolicy Bypass -File tools/serve.ps1 -Port 8080
```

Then open http://localhost:8080. To try the scout locally with Node 20+, run `node scripts/scout.mjs --dry-run`. Setting `GITHUB_TOKEN` avoids the 60-requests-per-hour anonymous limit.

## Disclaimer

Fan-made and unofficial. Not affiliated with Rockstar Games, Take-Two or Microsoft. Scores are editorial estimates from public READMEs, commits and issues, and self-reported claims are labelled. Maintainers who think their project is mis-scored can open an issue with evidence.
