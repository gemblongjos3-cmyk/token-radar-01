// The token radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every protocol that records no token yet: the whole watchlist (the floor, never a
// ceiling) plus every other pre-token protocol the snapshot carries, however small. Protocols whose
// token already trades are never ranked here; the dashboard shows them apart, at the market's own
// values, so a reader can see what a launched peer is worth next to a launch that has not happened.
//
// Implied value is one function of the snapshot's own figures, the same for every row:
//
//   implied = tvl_usd x category_multiple x growth_multiple x maturity_multiple
//
// - category_multiple prices how much of each TVL dollar a token's fully diluted value has
//   historically captured for that kind of business: a lending market keeps fees on every dollar it
//   holds, a bridge mostly passes dollars through, so the multiples differ and are stated per
//   category in CATEGORY_MULTIPLE below.
// - growth_multiple reads the seven-day TVL change (per cent, clamped to [-50, +60]) at weight 0.6:
//   a protocol gaining TVL into its launch prices higher, one bleeding TVL prices lower.
// - maturity_multiple runs 0.70 to 1.20 across the first four years a protocol has been tracked
//   with no token: the longer a product has held real TVL without issuing, the more demand a launch
//   has had time to build behind it. An unreported listing date counts as 300 days.
//
// No protocol name is ever special-cased. Farm plans come from the category playbooks in farmSteps:
// one template per kind of protocol, filled with that protocol's own name, chains and size.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it and the board carries it. */
export const MODEL_VERSION = 'radar-2';

/** How much of each TVL dollar a launch's fully diluted value captures, by category. */
export const CATEGORY_MULTIPLE: Record<string, number> = {
  'Chain': 0.6,
  'Lending': 0.55,
  'CDP': 0.5,
  'Derivatives': 0.45,
  'Dexs': 0.4,
  'Risk Curators': 0.38,
  'Onchain Capital Allocator': 0.38,
  'RWA': 0.35,
  'Payments': 0.35,
  'Yield Aggregator': 0.32,
  'Yield': 0.3,
  'Basis Trading': 0.3,
  'Liquid Restaking': 0.3,
  'Leveraged Farming': 0.28,
  'Liquid Staking': 0.28,
  'Staking Pool': 0.25,
  'Bridge': 0.22,
  'Canonical Bridge': 0.2,
};

/** The multiple a category the table does not name still gets. */
export const DEFAULT_MULTIPLE = 0.3;

/** The growth reading's shape: clamp in per cent, then this weight on it. */
export const GROWTH_FLOOR_PCT = -50;
export const GROWTH_CAP_PCT = 60;
export const GROWTH_WEIGHT = 0.6;

/** The maturity curve: floor at listing, full after this many days, unknown age counts as this. */
export const MATURITY_FLOOR = 0.7;
export const MATURITY_RANGE = 0.5;
export const MATURITY_DAYS = 1460;
export const UNKNOWN_AGE_DAYS = 300;

/** How many live-token protocols the dashboard's comparison view carries, by market cap. */
export const LIVE_ROWS = 60;

/** One ranked board row, as board.json carries it. */
export interface BoardRow {
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

/** The dashboard's compact view of one board row; the page rebuilds the farm plan from the playbook. */
export interface RadarRow {
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

/** A live-token protocol: it already trades, so it is shown at the market's value, never ranked. */
export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model both were scored by. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  live_size: number;
  category_multiple: Record<string, number>;
  default_multiple: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Round to four decimals, for the model's stated multipliers. */
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The category multiple one protocol gets: its named row, else the default. */
export function categoryMultiple(category: string | null): number {
  if (category === null) return DEFAULT_MULTIPLE;
  return CATEGORY_MULTIPLE[category] ?? DEFAULT_MULTIPLE;
}

/** The three multipliers and the implied value one protocol gets under this model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
): { implied: number; catMult: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const catMult = categoryMultiple(protocol.category);
  const growthPct = Math.min(GROWTH_CAP_PCT, Math.max(GROWTH_FLOOR_PCT, finite(protocol.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * GROWTH_WEIGHT;
  const ageForModel = age ?? UNKNOWN_AGE_DAYS;
  const maturityMult = MATURITY_FLOOR + (Math.min(Math.max(ageForModel, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * catMult * growthMult * maturityMult));
  return { implied, catMult, growthPct, growthMult, maturityMult, age };
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The house's wrapped-or-staked wording: a whole word wrapped, staked or staking in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Exchange names a product may begin with when it is that exchange's own wrapped or staked asset. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Categories that are conduits for other protocols' assets, not products with a launch of their own. */
const CONDUIT_CATEGORY = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Restaked BTC']);

/**
 * Whether a protocol may join the board beyond the watchlist: pre-token, not a conduit category
 * (a bridge entry like WBTC or USDT0 is a traded asset in transit, not a launch still to come),
 * not a versioned pool of another protocol, and not a wrapped or staked product of a token that
 * already trades (a name like "Binance Staked ETH" is ETH in a wrapper). Watchlist slugs are
 * always carried, whatever this says: coverage of the watchlist is the gate's row, never a
 * model's choice.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !(p.category !== null && CONDUIT_CATEGORY.has(p.category)) &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The first chain a protocol names, or a plain fallback for the farm plan's wording. */
function mainChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain, in the farm plan's plain wording. */
function gasWording(chain: string): string {
  if (chain === 'Ethereum') return 'about $8-$30 a transaction at typical gas';
  if (chain === 'Solana') return 'about $0.01-$0.05 a transaction';
  if (chain === 'Bitcoin') return 'about $1-$5 a transaction';
  if (chain === 'BSC') return 'about $0.10-$0.60 a transaction';
  if (['Arbitrum', 'Optimism', 'Base', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Blast', 'Mode'].includes(chain)) {
    return 'about $0.05-$0.50 a transaction';
  }
  return 'about $0.10-$2.00 a transaction';
}

/** The season's working capital a farm plan suggests, sized to the protocol's own TVL. */
function capitalFor(tvl: number): string {
  if (tvl >= 250_000_000) return '$2,000-$5,000';
  if (tvl >= 50_000_000) return '$1,000-$2,500';
  if (tvl >= 10_000_000) return '$500-$1,500';
  if (tvl >= 5_000_000) return '$250-$750';
  return '$100-$400';
}

/** How long a farm plan runs, by how long the protocol has already run with no token. */
function seasonFor(age: number | null): string {
  if (age !== null && age >= 730) return '10-14 weeks';
  if (age !== null && age >= 365) return '8-12 weeks';
  if (age !== null && age >= 90) return '6-10 weeks';
  return '4-8 weeks';
}

/** The playbook group one category farms by. */
function playbookFor(category: string | null): string {
  switch (category) {
    case 'Dexs':
      return 'dex';
    case 'Lending':
    case 'CDP':
      return 'lending';
    case 'Yield':
    case 'Yield Aggregator':
    case 'Basis Trading':
    case 'Leveraged Farming':
      return 'yield';
    case 'Liquid Staking':
    case 'Liquid Restaking':
    case 'Restaked BTC':
    case 'Staking Pool':
      return 'staking';
    case 'Bridge':
    case 'Canonical Bridge':
      return 'bridge';
    case 'Derivatives':
      return 'perps';
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return 'curator';
    case 'RWA':
      return 'rwa';
    default:
      return 'generic';
  }
}

/**
 * The farm plan for one protocol: five concrete steps from its category's playbook, filled with
 * its own name, main chain, size and age. Each step states what to do, what it costs and how long
 * it takes; the last one is always the risk and record-keeping step.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = mainChain(p);
  const gas = gasWording(chain);
  const capital = capitalFor(p.tvl_usd);
  const season = seasonFor(age);
  const book = playbookFor(p.category);
  const steps: string[] = [];

  steps.push(
    `Open ${p.name}'s official app (reach it from its DefiLlama page, never a search ad) and connect a fresh wallet on ${chain}. ` +
      `Setup takes about 15 minutes and one or two transactions; gas on ${chain} runs ${gas}. Work with ${capital} for the season.`,
  );

  if (book === 'dex') {
    steps.push(
      `Swap through ${p.name} two or three times a week on ${chain}: $100-$300 a swap in the deepest pair, about $0.30-$3.00 a swap in fees and gas. ` +
        `Real flow, spread over the week, is what a volume snapshot sees; one large wash day is not.`,
    );
    steps.push(
      `Add $500-$1,500 of two-sided liquidity to ${p.name}'s busiest ${chain} pool and leave it in place for the season (${season}). ` +
        `Check the position weekly for range drift; LP fees on a live pair partly offset the gas.`,
    );
  } else if (book === 'lending') {
    steps.push(
      `Supply ${capital} of the deepest asset (usually USDC or ETH) into ${p.name} on ${chain}: one approval plus one deposit, ${gas}. ` +
        `Supplied balances are the figure lending snapshots reward, so size matters more than transaction count.`,
    );
    steps.push(
      `Borrow at most 30-40% against the supply and redeposit it once, keeping the health factor above 1.6 at all times. ` +
        `Spend 5 minutes a week checking collateral prices; a liquidation erases a season of farming in one block.`,
    );
  } else if (book === 'yield') {
    steps.push(
      `Deposit ${capital} into ${p.name}'s main ${chain} vault and hold the vault shares in the same wallet all season (${season}). ` +
        `One deposit transaction, ${gas}; yields compound inside the vault, so no weekly claiming is needed.`,
    );
    steps.push(
      `Split a second, smaller deposit across one more of ${p.name}'s vaults or chains if it offers them, and rebalance only when a vault's yield lead over the first passes 2 points. ` +
        `Every extra deposit is ${gas}, so let fees set the pace.`,
    );
  } else if (book === 'staking') {
    steps.push(
      `Stake ${capital} of the base asset through ${p.name} on ${chain} and hold the receipt token in the farming wallet: one transaction, ${gas}. ` +
        `Unbonding can take days to weeks, so stake only funds that can stay locked for the season (${season}).`,
    );
    steps.push(
      `Use the receipt token once in a mainstream lending or liquidity market that ${p.name} itself lists, at half the position's size or less. ` +
        `That second use is what separates an active staker from a parked one in most points systems.`,
    );
  } else if (book === 'bridge') {
    steps.push(
      `Bridge $250-$1,000 through ${p.name} from ${chain} to one chain it serves, twice a month, and keep the funds working at the far end for at least a week. ` +
        `Each crossing costs ${gas} plus any bridge fee shown before you sign; round trips in one day read as farming, not use.`,
    );
    steps.push(
      `Rotate the destination chain monthly across ${p.name}'s routes so the wallet shows real use of the network, not one corridor. ` +
        `Keep every crossing's transaction hash in your log; bridge points are often credited per route and per month.`,
    );
  } else if (book === 'perps') {
    steps.push(
      `Deposit ${capital} as margin on ${p.name} (${chain}) and trade the most liquid market in small clips: $200-$500 a position, two or three sessions a week. ` +
        `Volume with a sane win rate is the metric; keep leverage at 3x or under so one bad hour cannot end the season.`,
    );
    steps.push(
      `Post the margin and leave part of it idle on ${p.name} between sessions rather than withdrawing after every trade. ` +
        `Open interest and margin balances are the figures a perps snapshot can see; pure churn with instant withdrawals is discounted.`,
    );
  } else if (book === 'curator') {
    steps.push(
      `Deposit ${capital} into the largest vault ${p.name} curates on ${chain} and hold for the season (${season}): one deposit, ${gas}. ` +
        `Curator vaults pay their underlying yield while you farm, so the position is rarely a pure cost.`,
    );
    steps.push(
      `Read ${p.name}'s vault allocation page once a month and move only if the vault's strategy changes materially. ` +
        `Churn between a curator's vaults costs ${gas} a move and resets nothing in your favour.`,
    );
  } else if (book === 'rwa') {
    steps.push(
      `Complete ${p.name}'s onboarding or KYC if its ${chain} product requires it (about 20 minutes, no fee), then deposit ${capital} into its main offering. ` +
        `Many real-world-asset products whitelist wallets, so finishing onboarding early is itself the farm.`,
    );
    steps.push(
      `Hold the position untouched for the season (${season}) and take any yield in the product's own payout asset. ` +
        `RWA positions settle slowly by design; check the position monthly, not daily, and keep the deposit receipts.`,
    );
  } else {
    steps.push(
      `Use ${p.name}'s core product on ${chain} with ${capital}: whatever its main action is (deposit, trade or stake), do it at full size once, then in small repeats weekly. ` +
        `Each action costs ${gas}; a season of real use runs ${season}.`,
    );
    steps.push(
      `Grow the position only when ${p.name} adds a market, chain or points page: new surfaces are where early-user snapshots are taken. ` +
        `One new action a week at ${gas} is a sustainable pace for the whole season.`,
    );
  }

  steps.push(
    `Do one small transaction on ${p.name} every week of the season, on different days, and screenshot your balance monthly with the date visible. ` +
      `Consistency across ${season} is what most points and snapshot systems weight highest, ahead of size.`,
  );
  steps.push(
    `Watch ${p.name}'s official channels for a token or points announcement and claim only from a link the project itself posts. ` +
      `Keep total costs (gas plus fees) under 2% of your position; if no announcement comes by the season's end, withdraw on ${chain} rather than rolling into a second season blind.`,
  );
  return steps;
}

/** Parse and lightly validate the sealed snapshot document. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new SnapshotError('the snapshot is not the document this model reads: protocols and watchlist must be arrays');
  }
  return raw;
}

/**
 * The board: every watchlist slug, plus every rankable pre-token protocol in the snapshot, scored
 * by impliedValue and ranked strongest first. Ranks are 1..n and implied value never rises as the
 * rank ascends, as the gate's sorted_by_value row requires.
 */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watch = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of) }));
  scored.sort(
    (a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.age,
    watchlist: watch.has(s.p.slug),
    implied_value_usd: s.implied,
    model: {
      category_multiple: s.catMult,
      growth_pct: round4(s.growthPct),
      growth_multiple: round4(s.growthMult),
      maturity_multiple: round4(s.maturityMult),
    },
    farm_steps: farmSteps(s.p, s.age),
  }));
}

/** The live set: protocols whose token already trades, largest market cap first, for comparison. */
export function buildLive(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => finite(b.mcap_usd, 0) - finite(a.mcap_usd, 0) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
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
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = buildLive(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    category_multiple: CATEGORY_MULTIPLE,
    default_multiple: DEFAULT_MULTIPLE,
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
export function dataScript(radar: RadarData): string {
  return `window.RADAR_DATA = ${JSON.stringify(radar)};\n`;
}

/**
 * A self-check in the gate's shape, run before anything is written: returns the first reason the
 * gate would refuse this board, or null when the board is clean.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
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
