# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**靈魂防線 / Soul Defender** — 3D top-down action roguelite defense game. Pure browser, Three.js + vanilla JS ES modules. **Zero external assets** — every visual and sound is procedurally generated (no images, no models, no audio files).

## Running

There is no build step, no `package.json` at the project root, no test framework. Three.js is loaded from a CDN via importmap (`index.html:960`).

- **Local dev**: double-click `start.bat` — tries Python (`python -m http.server 8080`), then `py`, then Node (`npx http-server`). Opens `http://localhost:8080/` automatically.
- **Deploy**: any static host. Cloudflare Pages is the production target (see `reference_cloudflare_deploy.md` in user memory for the GitHub → CF Pages pipeline).
- Since modules are loaded via fetch, opening `index.html` directly with `file://` will fail — always go through the local server.

### Balance simulation (separate from the game)

`tools/` is the **only** part of the repo with a `package.json` and Node deps (Puppeteer). It runs the game headlessly with bot mode for balance telemetry and is **not** shipped to production.

- `cd tools && npm install` once, then `npm run sim` (or `node balance-sim.mjs [runs] [speed] [maxSec] [parallel] [easy] [bonusPerks]`).
- Output JSON + summary goes to `tools/sim-output/`. Findings are written up in `tools/BALANCE-FINDINGS.md` / `BALANCE-FIX-RESULTS.md`.
- Driven by URL params on the actual game: `?bot=1` enables the bot AI, `?headless=1` swaps RAF for `setTimeout`, `?speed=N` (cap 4) fast-forwards. All bot params are **localhost-gated** (`bot.js:38-47`) — cloud visitors hitting `?bot=1` get a console warning and nothing else.

## Debug shortcuts (in-game)

Wired up in `input.js` and consumed in `game.js`. The spawn/level-up keys are **localhost-gated** (`game.js:31-32`, `game.js:666`) — cloud-deployed builds silently drop them so players can't break their own run:

- `B` spawn 100 leech · `V` spawn slinger · `C` spawn splitter · `J` spawn boss · `N` force level-up — **localhost only**
- `R` restart · `M` mute · `1`/`2`/`3` choose perk on level-up overlay — always available

The HUD `#help` block in `index.html` lists these for the user.

## Architecture

### Entry flow

`index.html` (single file: HUD markup + all CSS + importmap) → `src/main.js` → `Game` class in `src/game.js`.

`main.js` does three things: (1) on every load, wipes `soulDefender_v3` / `_v4` / `_v4_bak` / `_mute` from localStorage but **preserves** `soulDefender_slot_1..3` (manual saves) — this is intentional, not a bug; (2) builds the `WebGLRenderer`; (3) if any slot save exists, shows the boot menu, otherwise starts a fresh run.

### The Game orchestrator

`src/game.js` owns the RAF loop and every subsystem. The constructor wires up: input, audio, meta (save state), hero, crystal, four enemy pools (`Swarm`/`Slingers`/`Splitters`/`Mites`), four boss controllers (`Boss` = Ohm / `Nexus` / `Chronos` / `Mu`), `Tether`, `Effects`, `SpatialHash`, `PerkUI`, `Tutorial`. Per-frame logic lives in `_tickInner`; the outer `_tick` wraps it in try/catch so a single thrown frame can't freeze the RAF loop (intentional — see `game.js:205`).

`this._allSwarmsArr` and `this._allHashesArr` are hoisted once at construction to avoid per-frame allocation. Add new enemy types to **both** arrays.

When `?bot=1` is on the URL, the constructor wraps the real `Input` in `BotInput` (`bot.js`) and `installBotHooks` rewires perk picks + tick scaling for autoplay. Bot mode forces `runs >= 1` (`game.js:70`) so the first-run protection doesn't suppress slingers/splitters/bosses during sim runs.

### Single source of truth: `config.js`

Every tunable number (HP, speed, ranges, spawn intervals, perk values, boss timings, endless ramp, etc.) lives in `src/config.js` as a flat `CONFIG` object. **Always edit numbers here, not inline.** Comments in the file document why specific values are what they are (often "玩家反饋" — playtester feedback that drove the change).

### Entity pattern: InstancedMesh + parallel arrays

Enemy modules (`enemies.js`, `slinger.js`, `splitter.js`, `mu.js`, etc.) follow the same shape: one `THREE.InstancedMesh` of size `maxCount`, plus `Float32Array`/typed-array fields (`posX`, `posZ`, `hp`, `vx`, `vz`, `state`, …) indexed by slot. There is **no `Object3D` per enemy** — `activeCount` is the high-water mark, deaths swap-pop with the last active slot. When adding a new enemy, mirror this pattern and register the pool in `Game._allSwarmsArr` / `_allHashesArr`.

Broad-phase collision uses `SpatialHash` (`src/spatialHash.js`, grid cell `CONFIG.hashCell`). Each enemy pool owns its own hash; the hero's pulse iterates the relevant hashes per frame.

### Shader fx — `injectFx()` in `glitch.js`

Custom visual layers (Fresnel rim glow, pseudo-AO, breathing squash, W7 vertex glitch, W10 procedural crawl/squash/charge stretch) are injected into stock `MeshStandardMaterial` via `material.onBeforeCompile`. The shared uniforms `glitchUniform` and `timeUniform` are exported from `glitch.js` and updated once per frame from `Game._tickInner`. PBR lighting is preserved — fx layer on top. When adding a new material that should react to game-wide glitch pulses or time, use `injectFx(mat, { ... })` rather than rolling a separate `ShaderMaterial`.

### Soul Tether (signature mechanic)

`src/tether.js` renders a tube from hero → crystal and is the conduit for two systems: (1) souls travel along it back to the crystal after kills; (2) the hero passively heals while it's intact (see `heroTetherHealRate`). When severed, healing stops. Bosses interact with it: **Ohm** can sever it, **Nexus** pushes it away, **Mu** disables perks when crossed. The earlier distance-based damage/vulnerability multiplier was removed — tether no longer affects damage at all.

### Persistence — `meta.js`

`Meta` class owns soul currency, run statistics, tech-tree unlocks, imprints, and forbidden codes.

- Main auto-save: `soulDefender_v4` + `_v4_bak` (double-write).
- Manual slots: `soulDefender_slot_{1,2,3}` + each one's `_bak`.
- Integrity: FNV-1a 32-bit checksum on the JSON; on load, falls back to the `_bak` copy if the primary is corrupt.
- Cross-device: Base64 (`utf8ToB64`) export/import wired into boot menu (`main.js:88`).
- Format version is `SAVE_VERSION = '1.0.0'`. Any schema change must bump this and handle migration in `Meta.load`.

### Audio — `audio.js`

Web Audio API only — every sound (hits, kick drum, ambient pads) is synthesized from `OscillatorNode` + envelopes. AudioContext is lazily created on first key press (browser autoplay policy). The procedural kick drum's BPM scales with enemy density (`kickMinBpm` → `kickMaxBpm` at `kickDensityCap` enemies). Do **not** add `<audio>` tags or asset files — the project's identity is asset-free.

### Game phases / endgame

Bosses spawn on a timeline driven by `bossSpawnTime` / `nexusSpawnTime` / `chronosSpawnTime` / `muSpawnTime` in `config.js`. Defeating Nexus unlocks **Endless Mode** (grayscale entropy ramp, `endlessEntropyRate`). The `entropy` value feeds the Terminal leaderboard ranking (`leaderboardMaxEntries`).

## Conventions to keep

- ES module imports go through the importmap — `import * as THREE from 'three'` and `from 'three/addons/...'`. Do not hardcode CDN URLs in `src/`.
- All Chinese identifiers, comments, and UI strings stay Chinese. Don't translate.
- New numbers go in `config.js`, not as inline literals.
- Don't introduce a build step, `package.json`, or transpilation. The zero-tooling property is intentional and matters for the Cloudflare Pages deploy flow.
