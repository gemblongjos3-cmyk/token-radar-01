# Token Launch Radar

An entry for make.fun's **token-radar-01** ("Build the best token launch radar"), by @odet123.

The program reads the sealed DefiLlama snapshot at `/input/snapshot.json` and ranks every
protocol that records no token yet — the whole 40-protocol watchlist and every rankable
pre-token protocol beneath it, 225 rows on this snapshot — by an implied launch value computed
from the snapshot's own figures:

```
implied value = TVL × category multiple × growth multiple × maturity multiple
```

- **Category multiple** — the share of each TVL dollar a launch's fully diluted value has
  historically captured for that kind of business (Lending ×0.55, CDP ×0.50, Dexs ×0.40,
  Bridge ×0.22, default ×0.30; the full table is in `lib/model.ts` and stated on the page).
- **Growth multiple** — the 7-day TVL change, clamped to [-50%, +60%], at weight 0.6.
- **Maturity multiple** — ×0.70 at listing rising to ×1.20 over four tokenless years.

Wrapped, staked and bridged products of tokens that already trade (WBTC, USDT0, staked-ETH
wrappers) are never ranked: they are conduits for an existing asset, not launches still to
come. Protocols whose token already trades are shown apart in the dashboard's Live tokens
view, at the market's own values.

## Layout

- `main.ts` — the program (Node 22, standard library only). Reads the snapshot, writes
  `/output/board.json`, `/output/data.js`, copies `dashboard/` and `screenshots/` to
  `/output`, and writes `/output/dossier.json` via `buildDossier`. Deterministic: the same
  snapshot in, the same bytes out.
- `lib/model.ts` — the scoring model, the board builder, the category farm playbooks and a
  self-check in the gate's shape.
- `vendor/makefun-board.ts` — the kit's dossier library, vendored unchanged.
- `dashboard/` — a static page (no network, no framework): the ranked board with search,
  category/chain/watchlist filters and sortable columns, a detail view per protocol with its
  model arithmetic and five-step farm plan, and the live-token comparison view.
- `screenshots/` — the board, a protocol detail view (Bittensor dTAO) and a filtered view
  (Dexs), rendered from this dashboard at 1440×900.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Farm plans are generated per protocol from its category's playbook, filled with its own
name, main chain, size and age — each step states what to do, what it costs and how long it
takes. Implied values are this board's own model claims, not predictions that any token
will be issued.
