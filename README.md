# CAYO LUMEN

[![make.fun bounty gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/airdropjepe45-svg/cayo-lumen/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/airdropjepe45-svg/cayo-lumen/reward.svg)](https://make.fun/bounty/gta6-01)

**Cayo Lumen** is an original open-world crime game in the browser, built for the make.fun bounty ["Make GTA 6" (gta6-01)](https://make.fun/bounty/gta6-01). A sun-soaked coastal city at sunset, yours to explore on foot and by car — steal cars, outrun the police, fight, and work off a debt one job at a time.

You are **Mara Voss**, ex-courier. You owe the fixer **Delia Rook**, and she collects. Across eight story missions — from a first package run in Old Port to a five-star finale on Pier 9 — you will tail, race and outdrive your rival **Kito Fenn**, fight his goons, rob the Bank of Lumen, and deliver the ledger that settles everything. Finish all eight and you are a **Cayo Lumen Legend**.

Everything is original: the city, the characters, the story, the art and the procedural music. Nothing is borrowed from any commercial game.

## The city

- **A full open world**: a 900×900 m grid city with downtown towers, the Old Port, Coral Row, the Docks, Palm Heights, a park, and Miramar Beach with a pier stretching into the ocean — all at sunset, warm light, long shadows, neon signs.
- **Traffic and pedestrians**: cars cruise the avenues, walkers stroll the sidewalks and flee when trouble starts.
- **Cars to steal and drive**: sedans, trucks and sports cars with arcade handling, drifting and handbrake turns. Steal one off the street and the driver runs — and the police notice.
- **Wanted level and police**: 0–5 stars driven by a heat system. Cop cars chase and ram, roadblocks appear at 3 stars, a helicopter with a spotlight circles at 4+. Get caught and you are Busted; get beaten and you are Wasted.
- **Combat**: fists up close, a pistol with a crosshair, tracers and muzzle flash, and goons who shoot back.
- **Progression**: earn cash from jobs and street drops, buy cars, ammo and health at the safehouse garage, and save your run — on mission complete, from the pause menu, and automatically every 60 seconds.
- **Feel and polish**: third-person camera with mouse orbit, procedural radio (three stations, WebAudio only), engine and siren sounds, damage vignette, minimap with live blips, mission objective beam and HUD arrow, typewriter dialog, and start / pause / game-over / ending screens.

## How to run

```sh
node serve.ts
```

Then open <http://localhost:8080> in desktop Chrome. No build step, no network at runtime — every file the game loads lives under `game/`.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Shift | Run |
| Mouse drag / click canvas | Orbit camera / pointer lock |
| E | Enter / exit car |
| F | Punch |
| Mouse click | Shoot (when armed) |
| Space | Brake / handbrake in a car, hop on foot |
| G | Garage menu (near the safehouse garage) |
| T | Mission phone — call Delia, pick a job |
| R | Change radio station |
| M | Mute |
| P / Esc | Pause |

## Missions — "The Lumen Job"

1. **First Run** — Delia Rook — drive a package from Old Port to Coral Row — **$300**
2. **The Pickup** — Delia Rook — collect a briefcase on Miramar Beach, bring it home — **$400**
3. **Hot Wheels** — Delia Rook — steal a sports car in Palm Heights, deliver it to the garage — **$600**
4. **Harbor Lights** — Delia Rook — tail Kito Fenn through the Docks without being seen — **$700**
5. **Street Kings** — Kito Fenn — race 5 checkpoints in 150 seconds — **$900**
6. **The Informant** — Delia Rook — meet the contact at Pier 9, fight off 4 goons — **$1,000**
7. **Bank of Lumen** — Delia Rook — grab the cash downtown, escape a 4-star heat — **$1,500**
8. **The Last Job** — Delia Rook — deliver the ledger to the pier under 5 stars — **$2,500**

Complete all eight for the **Cayo Lumen Legend** ending and a **$500** bonus.

## Project layout

- `game/index.html` — the page, HUD DOM and overlays
- `game/src/main.js` — boot, game loop, state machine
- `game/src/world.js` — the city: roads, buildings, beach, pier, sky
- `game/src/render.js` — renderer, lights, camera rig
- `game/src/player.js`, `vehicles.js`, `pedestrians.js`, `police.js`, `combat.js` — gameplay
- `game/src/missions.js`, `economy.js`, `hud.js`, `save.js` — story, money, HUD, saves
- `game/src/config.js`, `random.js`, `input.js`, `audio.js`, `shots.js` — tuning, RNG, input, sound, screenshot poses
- `game/vendor/three.module.min.js` — vendored three.js
- `main.ts` — the entrypoint: copies `game/` + `screenshots/` to the output directory and writes `dossier.json` (Node 22 standard library only, run with `MAKEFUN_OUTPUT_DIR=out node main.ts`)
- `screenshots/` — four real renders of the game (see `shots.json`)

## Screenshots

| File | Shot |
| --- | --- |
| `1-chase.jpg` (cover) | `?shot=chase&seed=1` — a three-star chase |
| `2-mission.jpg` | `?shot=mission&seed=1` — the Pier 9 fight |
| `3-city.jpg` | `?shot=night&seed=1` — the city at night |
| `4-start.jpg` | `?shot=start&seed=1` — the start screen over downtown |

## License

MIT — see [LICENSE](LICENSE).

---

Built for [make.fun — Make GTA 6 (gta6-01)](https://make.fun/bounty/gta6-01) · Play it yourself: <https://make.fun/?ref=89fdt4kt&utm_source=github&utm_medium=readme&utm_campaign=gta6-01>
