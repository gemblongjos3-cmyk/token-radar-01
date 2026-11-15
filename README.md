# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/gemblongjos3-cmyk/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/gemblongjos3-cmyk/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An entry for make.fun's **token-radar-01** — "Build the best token launch radar" — by @odet123. Bounty: https://make.fun/bounty/token-radar-01

## What it does

The program reads the sealed DefiLlama snapshot at `/input/snapshot.json` and ranks
every protocol that records no token yet. That is the whole 40-protocol watchlist plus
every rankable pre-token protocol beneath it — 225 rows on this snapshot — ordered by an
implied launch value worked out from the snapshot's own figures:

```
implied value = TVL × category multiple × growth multiple × maturity multiple
```

The three multipliers:

- **Category** — measured on the snapshot itself (the radar-4 change). For each category,
  the model reads the protocols in the same snapshot whose token already trades, takes
  the median of market cap ÷ TVL — the share of each TVL dollar a launched token in that
  line of business actually captured — and blends it toward the snapshot-wide median
  (×0.20 across 129 traded protocols) by peer count, so a category with two traded peers
  borrows most of its multiple from the whole market and one with fifteen mostly speaks
  for itself. A category with no traded peer prices at the snapshot-wide median. Each
  peer's ratio is read inside [0.02, 2.5] first, so one entry whose token prices a whole
  ecosystem on a sliver of recorded TVL cannot price a category. No multiple is a
  constant anyone asserted: recompute it from the snapshot and you get the same table,
  which the dashboard prints in full, peer counts included.
- **Growth** — the 7-day TVL change, clamped to [-50%, +60%], at weight 0.6.
- **Maturity** — ×0.70 when first listed, rising to ×1.20 after four tokenless years
  (a missing listing date counts as 300 days).

Wrapped, staked and bridged products of tokens that already trade — WBTC, USDT0,
staked-ETH wrappers — are never ranked. They move an existing asset along; they are not
launches still to come. Protocols whose token already trades appear separately, in the
dashboard's Live tokens view, at the market's own values: 416 of them on this snapshot,
and they double as the evidence the category multiples are measured from.

## Files

- `main.ts` — the program (Node 22, standard library only). Reads the snapshot, writes
  `/output/board.json` and `/output/data.js`, copies `dashboard/` and `screenshots/` into
  `/output`, and writes `/output/dossier.json` through `buildDossier`. Deterministic:
  the same snapshot in, the same bytes out, on every run.
- `lib/model.ts` — the scoring model (radar-4), the board builder, the category farm
  playbooks and a self-check shaped like the gate.
- `vendor/makefun-board.ts` — the kit's dossier library, vendored unchanged.
- `dashboard/` — a static page (no network, no framework). The ranked board with search,
  category/chain/watchlist filters and sortable columns; a detail view per protocol with
  its model arithmetic and a five-step farm plan; and the live-token comparison view.
- `screenshots/` — the board, a protocol detail view and a filtered view (Dexs),
  rendered from this dashboard at 1440×900.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Each farm plan is generated per protocol from its category's playbook and filled with the
protocol's own name, main chain, size and age; every step states what to do, what it
costs and how long it takes, and the closing step states the season's whole gas budget
up front. Implied values are this board's own model claims, not predictions that any
token will be issued.
