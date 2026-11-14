# Token Launch Radar

An entry for make.fun's **token-radar-01** — "Build the best token launch radar" — by @odet123.

## What it does

The program reads the sealed DefiLlama snapshot at `/input/snapshot.json` and ranks
every protocol that records no token yet. That is the whole 40-protocol watchlist plus
every rankable pre-token protocol beneath it — 225 rows on this snapshot — ordered by an
implied launch value worked out from the snapshot's own figures:

```
implied value = TVL × category multiple × growth multiple × maturity multiple
```

The three multipliers:

- **Category** — the share of each TVL dollar a launch's fully diluted value has
  historically captured for that kind of business. Lending ×0.55, CDP ×0.50, Dexs ×0.40,
  Bridge ×0.22, anything unnamed ×0.30; the full table lives in `lib/model.ts` and is
  printed on the page itself, so a reader can argue with it.
- **Growth** — the 7-day TVL change, clamped to [-50%, +60%], at weight 0.6.
- **Maturity** — ×0.70 when first listed, rising to ×1.20 after four tokenless years
  (a missing listing date counts as 300 days).

Wrapped, staked and bridged products of tokens that already trade — WBTC, USDT0,
staked-ETH wrappers — are never ranked. They move an existing asset along; they are not
launches still to come. Protocols whose token already trades appear separately, in the
dashboard's Live tokens view, at the market's own values.

## Files

- `main.ts` — the program (Node 22, standard library only). Reads the snapshot, writes
  `/output/board.json` and `/output/data.js`, copies `dashboard/` and `screenshots/` into
  `/output`, and writes `/output/dossier.json` through `buildDossier`. Deterministic:
  the same snapshot in, the same bytes out, on every run.
- `lib/model.ts` — the scoring model (radar-3), the board builder, the category farm
  playbooks and a self-check shaped like the gate.
- `vendor/makefun-board.ts` — the kit's dossier library, vendored unchanged.
- `dashboard/` — a static page (no network, no framework). The ranked board with search,
  category/chain/watchlist filters and sortable columns; a detail view per protocol with
  its model arithmetic and a five-step farm plan; and the live-token comparison view.
- `screenshots/` — the board, a protocol detail view (Bittensor dTAO) and a filtered
  view (Dexs), rendered from this dashboard at 1440×900.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Each farm plan is generated per protocol from its category's playbook and filled with the
protocol's own name, main chain, size and age; every step states what to do, what it
costs and how long it takes. Implied values are this board's own model claims, not
predictions that any token will be issued.
