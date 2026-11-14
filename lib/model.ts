// Token Launch Radar — the scoring model, rebuilt as radar-3.
//
// One sealed DefiLlama snapshot goes in; one ranked board comes out. The board covers every
// protocol the snapshot records without a token: the full watchlist first (a floor the model
// never goes under) and then every other pre-token protocol the snapshot carries, however
// small. Protocols whose token already trades are kept out of the ranking entirely; the
// dashboard lists them separately, at the market's own figures, so a reader can weigh a launch
// that has not happened yet against a peer that already has.
//
// Every row's price comes from one formula, applied the same way to every protocol:
//
//   implied value = TVL x category multiple x growth multiple x maturity multiple
//
// - The category multiple prices how much of each TVL dollar a launch's fully diluted value
//   has historically captured for that line of business. A lending market collects fees on
//   every dollar it holds; a bridge mostly passes dollars along. The table is stated below,
//   in the open, so a reader can argue with it.
// - The growth multiple reads the seven-day TVL change, in per cent and clamped to
//   [-50, +60], at a weight of 0.6. TVL flowing in ahead of a launch prices higher; TVL
//   bleeding out prices lower.
// - The maturity multiple runs from 0.70 at first listing to 1.20 after four years tracked
//   with no token: the longer a product has held real TVL without issuing, the more demand
//   has had time to build behind a launch. A missing listing date is read as 300 days.
//
// Names are never special-cased anywhere in this file. The farm plans come from the
// playbook table at the bottom: one template per kind of protocol, filled in with that
// protocol's own name, chain, size and age.

/** One protocol record: exactly the ten fields the sealed snapshot carries per protocol. */
export interface ProtocolRecord {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The sealed snapshot document as a whole. */
export interface SealedSnapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: ProtocolRecord[];
  watchlist: string[];
}

/** This build's model label: the board and the dashboard both carry it. */
export const MODEL_TAG = 'radar-3';

/** Category pricing as a pair table, in descending multiple order; turned into a record below. */
const CATEGORY_PRICING: ReadonlyArray<readonly [string, number]> = [
  ['Chain', 0.6],
  ['Lending', 0.55],
  ['CDP', 0.5],
  ['Derivatives', 0.45],
  ['Dexs', 0.4],
  ['Risk Curators', 0.38],
  ['Onchain Capital Allocator', 0.38],
  ['RWA', 0.35],
  ['Payments', 0.35],
  ['Yield Aggregator', 0.32],
  ['Yield', 0.3],
  ['Basis Trading', 0.3],
  ['Liquid Restaking', 0.3],
  ['Leveraged Farming', 0.28],
  ['Liquid Staking', 0.28],
  ['Staking Pool', 0.25],
  ['Bridge', 0.22],
  ['Canonical Bridge', 0.2],
];

/** The category table as a record, for the board's model block and the dashboard's panel. */
export const CATEGORY_MULTIPLE: Record<string, number> = Object.fromEntries(CATEGORY_PRICING);

/** What a category the table never names still gets. */
export const FALLBACK_MULTIPLE = 0.3;

/** The growth reading: clamp the 7-day change to this band (per cent), then weight it this much. */
export const GROWTH_LOW_PCT = -50;
export const GROWTH_HIGH_PCT = 60;
export const GROWTH_SLOPE = 0.6;

/** The maturity curve: this at listing, full after MATURITY_SPAN_DAYS, unknown age reads as this. */
export const MATURITY_BASE = 0.7;
export const MATURITY_SPAN = 0.5;
export const MATURITY_SPAN_DAYS = 1460;
export const ASSUMED_AGE_DAYS = 300;

/** How many traded protocols the dashboard's comparison table carries, by market cap. */
export const LIVE_TABLE_SIZE = 60;

const MS_PER_DAY = 86_400_000;

/** One ranked board row, exactly as board.json carries it. */
export interface RankedRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiple: number;
    maturity_multiple: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact form of one board row; the page rebuilds the farm plan from the playbook. */
export interface DashboardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  category_multiple: number;
  growth_multiple: number;
  maturity_multiple: number;
}

/** A protocol whose token already trades: shown at the market's value, never ranked. */
export interface TradedRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the traded set, and the model that scored both. */
export interface DashboardData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  live_size: number;
  category_multiple: Record<string, number>;
  default_multiple: number;
  rows: DashboardRow[];
  live: TradedRow[];
}

/** The snapshot is not a document this model can score. */
export class SnapshotParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotParseError';
  }
}

/** A finite number, or `fallback` when the value is missing or not a number. */
function numOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Round to four decimals, the precision the model's stated multipliers are shown at. */
function roundTo4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** Whole days from `listedAt` to `asOf`, never below zero; null when either date is missing. */
export function tokenlessAge(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / MS_PER_DAY));
}

/** The category multiple one protocol gets: its named row, or the fallback when unnamed. */
export function multipleForCategory(category: string | null): number {
  if (category === null) return FALLBACK_MULTIPLE;
  return CATEGORY_MULTIPLE[category] ?? FALLBACK_MULTIPLE;
}

export interface PricedProtocol {
  value: number;
  cat: number;
  growthPct: number;
  growth: number;
  maturity: number;
  age: number | null;
}

/** The three multipliers and the implied value one protocol gets under this model. */
export function priceOne(protocol: ProtocolRecord, asOf: string): PricedProtocol {
  const age = tokenlessAge(asOf, protocol.listed_at);
  const cat = multipleForCategory(protocol.category);
  const growthPct = Math.min(GROWTH_HIGH_PCT, Math.max(GROWTH_LOW_PCT, numOr(protocol.change_7d, 0)));
  const growth = 1 + (growthPct / 100) * GROWTH_SLOPE;
  const aged = age ?? ASSUMED_AGE_DAYS;
  const maturity = MATURITY_BASE + (Math.min(Math.max(aged, 0), MATURITY_SPAN_DAYS) / MATURITY_SPAN_DAYS) * MATURITY_SPAN;
  const value = Math.max(1, Math.round(protocol.tvl_usd * cat * growth * maturity));
  return { value, cat, growthPct, growth, maturity, age };
}

/** Whether a protocol's record carries no token at all. */
export function hasNoToken(p: ProtocolRecord): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** A name ending in a release marker is a pool of another protocol, not a launch of its own. */
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked or staking in the name marks a wrapped or staked product. */
const WRAPPED_TERM = /\b(wrapped|staked|staking)\b/i;

/** Exchange names a product may start with when it is that exchange's own wrapped or staked asset. */
const EXCHANGE_LEAD = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Categories that move other protocols' assets along, rather than launching one of their own. */
const CONDUIT_CATEGORIES = ['CEX', 'Bridge', 'Canonical Bridge', 'Restaked BTC'];

/**
 * Whether a protocol may join the board beyond the watchlist. It must record no token, sit
 * outside the conduit categories (a bridge entry like WBTC or USDT0 is a traded asset in
 * transit, not a launch still to come), not be a versioned pool of another protocol, and not
 * be a wrapped or staked product of a token that already trades (a name like "Binance Staked
 * ETH" is ETH in a wrapper). Watchlist slugs are always carried whatever this says: covering
 * the watchlist is the gate's row, never a model's choice.
 */
export function boardEligible(p: ProtocolRecord): boolean {
  if (!hasNoToken(p)) return false;
  if (p.category !== null && CONDUIT_CATEGORIES.includes(p.category)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_TERM.test(p.name)) return false;
  if (EXCHANGE_LEAD.test(p.name)) return false;
  return true;
}

/** Parse and lightly validate the sealed snapshot document. */
export function readSnapshot(text: string): SealedSnapshot {
  const raw = JSON.parse(text) as SealedSnapshot;
  if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new SnapshotParseError('the snapshot is not the document this model reads: protocols and watchlist must be arrays');
  }
  return raw;
}

/* ------------------------------------------------------------------ */
/* Farm plans                                                          */
/* ------------------------------------------------------------------ */

/** The filled-in figures one farm plan is written from. */
interface PlanContext {
  name: string;
  chain: string;
  gas: string;
  capital: string;
  season: string;
}

/** The protocol's first named chain, or a plain fallback for the plan's wording. */
function homeChain(p: ProtocolRecord): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain, in the farm plan's plain wording. */
const GAS_BY_CHAIN: Record<string, string> = {
  'Ethereum': 'about $8-$30 a transaction at typical gas',
  'Solana': 'about $0.01-$0.05 a transaction',
  'Bitcoin': 'about $1-$5 a transaction',
  'BSC': 'about $0.10-$0.60 a transaction',
};

/** The chains whose transactions run about five to fifty cents. */
const CHEAP_L2_CHAINS = ['Arbitrum', 'Optimism', 'Base', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Blast', 'Mode'];

function gasText(chain: string): string {
  if (GAS_BY_CHAIN[chain] !== undefined) return GAS_BY_CHAIN[chain]!;
  if (CHEAP_L2_CHAINS.includes(chain)) return 'about $0.05-$0.50 a transaction';
  return 'about $0.10-$2.00 a transaction';
}

/** Working-capital bands, sized to the protocol's own TVL: [minimum TVL, suggested range]. */
const CAPITAL_BANDS: ReadonlyArray<readonly [number, string]> = [
  [250_000_000, '$2,000-$5,000'],
  [50_000_000, '$1,000-$2,500'],
  [10_000_000, '$500-$1,500'],
  [5_000_000, '$250-$750'],
];

function capitalBand(tvl: number): string {
  for (const [floor, band] of CAPITAL_BANDS) {
    if (tvl >= floor) return band;
  }
  return '$100-$400';
}

/** Season lengths by how long the protocol has already run with no token. */
const SEASON_BANDS: ReadonlyArray<readonly [number, string]> = [
  [730, '10-14 weeks'],
  [365, '8-12 weeks'],
  [90, '6-10 weeks'],
];

function seasonBand(age: number | null): string {
  if (age === null) return '4-8 weeks';
  for (const [floor, season] of SEASON_BANDS) {
    if (age >= floor) return season;
  }
  return '4-8 weeks';
}

/** Which playbook a category farms by. */
const PLAYBOOK_BY_CATEGORY: Record<string, string> = {
  'Dexs': 'dex',
  'Lending': 'lending',
  'CDP': 'lending',
  'Yield': 'yield',
  'Yield Aggregator': 'yield',
  'Basis Trading': 'yield',
  'Leveraged Farming': 'yield',
  'Liquid Staking': 'staking',
  'Liquid Restaking': 'staking',
  'Restaked BTC': 'staking',
  'Staking Pool': 'staking',
  'Bridge': 'bridge',
  'Canonical Bridge': 'bridge',
  'Derivatives': 'perps',
  'Risk Curators': 'curator',
  'Onchain Capital Allocator': 'curator',
  'RWA': 'rwa',
};

function playbookFor(category: string | null): string {
  if (category === null) return 'generic';
  return PLAYBOOK_BY_CATEGORY[category] ?? 'generic';
}

/** The two middle steps of a plan, per playbook. Each returns exactly two steps. */
function playbookSteps(book: string, c: PlanContext): [string, string] {
  switch (book) {
    case 'dex':
      return [
        `Swap through ${c.name} two or three times a week on ${c.chain}: $100-$300 a swap in the deepest pair, about $0.30-$3.00 a swap in fees and gas. Real flow, spread over the week, is what a volume snapshot sees; one large wash day is not.`,
        `Add $500-$1,500 of two-sided liquidity to ${c.name}'s busiest ${c.chain} pool and leave it in place for the season (${c.season}). Check the position weekly for range drift; LP fees on a live pair partly offset the gas.`,
      ];
    case 'lending':
      return [
        `Supply ${c.capital} of the deepest asset (usually USDC or ETH) into ${c.name} on ${c.chain}: one approval plus one deposit, ${c.gas}. Supplied balances are the figure lending snapshots reward, so size matters more than transaction count.`,
        `Borrow at most 30-40% against the supply and redeposit it once, keeping the health factor above 1.6 at all times. Spend 5 minutes a week checking collateral prices; a liquidation erases a season of farming in one block.`,
      ];
    case 'yield':
      return [
        `Deposit ${c.capital} into ${c.name}'s main ${c.chain} vault and hold the vault shares in the same wallet all season (${c.season}). One deposit transaction, ${c.gas}; yields compound inside the vault, so no weekly claiming is needed.`,
        `Split a second, smaller deposit across one more of ${c.name}'s vaults or chains if it offers them, and rebalance only when a vault's yield lead over the first passes 2 points. Every extra deposit is ${c.gas}, so let fees set the pace.`,
      ];
    case 'staking':
      return [
        `Stake ${c.capital} of the base asset through ${c.name} on ${c.chain} and hold the receipt token in the farming wallet: one transaction, ${c.gas}. Unbonding can take days to weeks, so stake only funds that can stay locked for the season (${c.season}).`,
        `Use the receipt token once in a mainstream lending or liquidity market that ${c.name} itself lists, at half the position's size or less. That second use is what separates an active staker from a parked one in most points systems.`,
      ];
    case 'bridge':
      return [
        `Bridge $250-$1,000 through ${c.name} from ${c.chain} to one chain it serves, twice a month, and keep the funds working at the far end for at least a week. Each crossing costs ${c.gas} plus any bridge fee shown before you sign; round trips in one day read as farming, not use.`,
        `Rotate the destination chain monthly across ${c.name}'s routes so the wallet shows real use of the network, not one corridor. Keep every crossing's transaction hash in your log; bridge points are often credited per route and per month.`,
      ];
    case 'perps':
      return [
        `Deposit ${c.capital} as margin on ${c.name} (${c.chain}) and trade the most liquid market in small clips: $200-$500 a position, two or three sessions a week. Volume with a sane win rate is the metric; keep leverage at 3x or under so one bad hour cannot end the season.`,
        `Post the margin and leave part of it idle on ${c.name} between sessions rather than withdrawing after every trade. Open interest and margin balances are the figures a perps snapshot can see; pure churn with instant withdrawals is discounted.`,
      ];
    case 'curator':
      return [
        `Deposit ${c.capital} into the largest vault ${c.name} curates on ${c.chain} and hold for the season (${c.season}): one deposit, ${c.gas}. Curator vaults pay their underlying yield while you farm, so the position is rarely a pure cost.`,
        `Read ${c.name}'s vault allocation page once a month and move only if the vault's strategy changes materially. Churn between a curator's vaults costs ${c.gas} a move and resets nothing in your favour.`,
      ];
    case 'rwa':
      return [
        `Complete ${c.name}'s onboarding or KYC if its ${c.chain} product requires it (about 20 minutes, no fee), then deposit ${c.capital} into its main offering. Many real-world-asset products whitelist wallets, so finishing onboarding early is itself the farm.`,
        `Hold the position untouched for the season (${c.season}) and take any yield in the product's own payout asset. RWA positions settle slowly by design; check the position monthly, not daily, and keep the deposit receipts.`,
      ];
    default:
      return [
        `Use ${c.name}'s core product on ${c.chain} with ${c.capital}: whatever its main action is (deposit, trade or stake), do it at full size once, then in small repeats weekly. Each action costs ${c.gas}; a season of real use runs ${c.season}.`,
        `Grow the position only when ${c.name} adds a market, chain or points page: new surfaces are where early-user snapshots are taken. One new action a week at ${c.gas} is a sustainable pace for the whole season.`,
      ];
  }
}

/**
 * The farm plan for one protocol: five concrete steps — an opening setup step, two steps from
 * its category's playbook, then a consistency step and a watch-and-claim step. Each step states
 * what to do, what it costs and how long it takes.
 */
export function planFor(p: ProtocolRecord, age: number | null): string[] {
  const ctx: PlanContext = {
    name: p.name,
    chain: homeChain(p),
    gas: gasText(homeChain(p)),
    capital: capitalBand(p.tvl_usd),
    season: seasonBand(age),
  };
  const [middleA, middleB] = playbookSteps(playbookFor(p.category), ctx);
  return [
    `Open ${ctx.name}'s official app (reach it from its DefiLlama page, never a search ad) and connect a fresh wallet on ${ctx.chain}. Setup takes about 15 minutes and one or two transactions; gas on ${ctx.chain} runs ${ctx.gas}. Work with ${ctx.capital} for the season.`,
    middleA,
    middleB,
    `Do one small transaction on ${ctx.name} every week of the season, on different days, and screenshot your balance monthly with the date visible. Consistency across ${ctx.season} is what most points and snapshot systems weight highest, ahead of size.`,
    `Watch ${ctx.name}'s official channels for a token or points announcement and claim only from a link the project itself posts. Keep total costs (gas plus fees) under 2% of your position; if no announcement comes by the season's end, withdraw on ${ctx.chain} rather than rolling into a second season blind.`,
  ];
}

/* ------------------------------------------------------------------ */
/* Board building                                                      */
/* ------------------------------------------------------------------ */

/** Order two scored protocols: implied value first, then TVL, then slug for a stable tiebreak. */
function compareScored(
  a: { priced: PricedProtocol; p: ProtocolRecord },
  b: { priced: PricedProtocol; p: ProtocolRecord },
): number {
  if (b.priced.value !== a.priced.value) return b.priced.value - a.priced.value;
  if (b.p.tvl_usd !== a.p.tvl_usd) return b.p.tvl_usd - a.p.tvl_usd;
  return a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0;
}

/**
 * The board: every watchlist slug, plus every board-eligible pre-token protocol in the
 * snapshot, priced by priceOne and ranked strongest first. Ranks run 1..n and implied value
 * never rises as the rank ascends, as the gate's sorted_by_value row requires.
 */
export function rankBoard(snapshot: SealedSnapshot): RankedRow[] {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watch = new Set(snapshot.watchlist);
  const chosen = new Map<string, ProtocolRecord>();
  for (const slug of snapshot.watchlist) {
    const found = bySlug.get(slug);
    if (found !== undefined) chosen.set(slug, found);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && boardEligible(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => ({ p, priced: priceOne(p, snapshot.as_of) }));
  scored.sort(compareScored);
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.priced.age,
    watchlist: watch.has(s.p.slug),
    implied_value_usd: s.priced.value,
    model: {
      category_multiple: s.priced.cat,
      growth_pct: roundTo4(s.priced.growthPct),
      growth_multiple: roundTo4(s.priced.growth),
      maturity_multiple: roundTo4(s.priced.maturity),
    },
    farm_steps: planFor(s.p, s.priced.age),
  }));
}

/** The traded set: protocols whose token already trades, largest market cap first, for comparison. */
export function tradedTable(snapshot: SealedSnapshot): TradedRow[] {
  const traded = snapshot.protocols.filter((p) => !hasNoToken(p));
  traded.sort((a, b) => {
    const capDiff = numOr(b.mcap_usd, 0) - numOr(a.mcap_usd, 0);
    if (capDiff !== 0) return capDiff;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  return traded.slice(0, LIVE_TABLE_SIZE).map((p) => ({
    slug: p.slug,
    name: p.name,
    symbol: p.symbol,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd,
    change_7d: p.change_7d,
  }));
}

/** The whole radar: board rows plus the dashboard's data, from one snapshot. */
export function scoreSnapshot(snapshot: SealedSnapshot): { board: RankedRow[]; radar: DashboardData } {
  const board = rankBoard(snapshot);
  const live = tradedTable(snapshot);
  const radar: DashboardData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_TAG,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    category_multiple: CATEGORY_MULTIPLE,
    default_multiple: FALLBACK_MULTIPLE,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      watchlist: r.watchlist,
      implied_value_usd: r.implied_value_usd,
      category_multiple: r.model.category_multiple,
      growth_multiple: r.model.growth_multiple,
      maturity_multiple: r.model.maturity_multiple,
    })),
    live,
  };
  return { board, radar };
}

/** The data.js the dashboard reads: the radar as one window assignment, no network needed. */
export function dataFileText(radar: DashboardData): string {
  return `window.TOKEN_RADAR = ${JSON.stringify(radar)};\n`;
}

/**
 * A self-check in the gate's shape, run before anything is written: the first reason the
 * gate would refuse this board, or null when the board is clean.
 */
export function validateBoard(board: RankedRow[], snapshot: SealedSnapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100-4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  let previous = Number.POSITIVE_INFINITY;
  let allSame = true;
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (!slugs.has(row.slug)) return `row ${row.rank} names a protocol the snapshot does not: ${row.slug}`;
    if (seen.has(row.slug)) return `slug appears twice: ${row.slug}`;
    seen.add(row.slug);
    if (row.rank !== i + 1) return `ranks are not exactly 1..n at row ${i + 1}`;
    if (row.name.trim().length === 0) return `${row.slug} carries an empty name`;
    if (row.implied_value_usd > 100_000_000_000_000) return `${row.slug} prices past the gate's implied value cap`;
    if (row.implied_value_usd > previous) return `implied value rises at rank ${row.rank}`;
    if (i > 0 && row.implied_value_usd !== board[0]!.implied_value_usd) allSame = false;
    previous = row.implied_value_usd;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} holds ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `${row.slug} holds a farm step of ${len} characters`;
    }
  }
  if (allSame) return 'every implied value is the same: a board that ranks nothing by value';
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist slug missing from the board: ${slug}`;
  }
  return null;
}
