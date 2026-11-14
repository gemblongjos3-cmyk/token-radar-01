/* Token Launch Radar: the ranked board, a detail view for every protocol, and the
   live-token comparison. Everything renders from window.TOKEN_RADAR (../data.js, written
   by main.ts from the sealed snapshot). No network, no framework. The farm plans below
   are the model's playbooks, the same ones main.ts writes into board.json, filled with
   each protocol's own figures. */
(function () {
  'use strict';
  var RADAR = window.TOKEN_RADAR;
  var root = document.getElementById('app');

  /* ---------- view state, carried in the hash so every view has an address ---------- */
  var view = { tab: 'pre', q: '', category: 'all', chain: 'all', wl: false, sort: 'rank', dir: 1, detail: null };
  function readHash() {
    var h = window.location.hash.replace(/^#\/?/, '');
    var bits = h.split('?');
    var path = bits[0] || '';
    var params = new URLSearchParams(bits[1] || '');
    view.detail = path.indexOf('p/') === 0 ? decodeURIComponent(path.slice(2)) : null;
    view.tab = params.get('tab') === 'live' ? 'live' : 'pre';
    view.q = params.get('q') || '';
    view.category = params.get('cat') || 'all';
    view.chain = params.get('chain') || 'all';
    view.wl = params.get('wl') === '1';
    view.sort = params.get('sort') || 'rank';
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (view.tab === 'live') params.set('tab', 'live');
    if (view.q) params.set('q', view.q);
    if (view.category !== 'all') params.set('cat', view.category);
    if (view.chain !== 'all') params.set('chain', view.chain);
    if (view.wl) params.set('wl', '1');
    if (view.sort !== 'rank') params.set('sort', view.sort);
    var base = view.detail ? '#/p/' + encodeURIComponent(view.detail) : '#/';
    var qs = params.toString();
    history.replaceState(null, '', qs ? base + '?' + qs : base);
  }

  /* ---------- the farm playbooks, mirroring lib/model.ts ---------- */
  function homeChain(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  var GAS_BY_CHAIN = {
    'Ethereum': 'about $8-$30 a transaction at typical gas',
    'Solana': 'about $0.01-$0.05 a transaction',
    'Bitcoin': 'about $1-$5 a transaction',
    'BSC': 'about $0.10-$0.60 a transaction',
  };
  var CHEAP_L2 = ['Arbitrum', 'Optimism', 'Base', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Blast', 'Mode'];
  function gasText(chain) {
    if (GAS_BY_CHAIN[chain] !== undefined) return GAS_BY_CHAIN[chain];
    if (CHEAP_L2.indexOf(chain) >= 0) return 'about $0.05-$0.50 a transaction';
    return 'about $0.10-$2.00 a transaction';
  }
  function capitalBand(tvl) {
    if (tvl >= 250000000) return '$2,000-$5,000';
    if (tvl >= 50000000) return '$1,000-$2,500';
    if (tvl >= 10000000) return '$500-$1,500';
    if (tvl >= 5000000) return '$250-$750';
    return '$100-$400';
  }
  function seasonBand(age) {
    if (age !== null && age >= 730) return '10-14 weeks';
    if (age !== null && age >= 365) return '8-12 weeks';
    if (age !== null && age >= 90) return '6-10 weeks';
    return '4-8 weeks';
  }
  var PLAYBOOK_BY_CATEGORY = {
    'Dexs': 'dex', 'Lending': 'lending', 'CDP': 'lending',
    'Yield': 'yield', 'Yield Aggregator': 'yield', 'Basis Trading': 'yield', 'Leveraged Farming': 'yield',
    'Liquid Staking': 'staking', 'Liquid Restaking': 'staking', 'Restaked BTC': 'staking', 'Staking Pool': 'staking',
    'Bridge': 'bridge', 'Canonical Bridge': 'bridge', 'Derivatives': 'perps',
    'Risk Curators': 'curator', 'Onchain Capital Allocator': 'curator', 'RWA': 'rwa',
  };
  function playbookFor(category) {
    if (category === null || category === undefined) return 'generic';
    return PLAYBOOK_BY_CATEGORY[category] || 'generic';
  }
  function planSteps(p) {
    var chain = homeChain(p);
    var c = { name: p.name, chain: chain, gas: gasText(chain), capital: capitalBand(p.tvl_usd), season: seasonBand(p.age_days) };
    var book = playbookFor(p.category);
    var middle = {
      dex: [
        `Swap through ${c.name} two or three times a week on ${c.chain}: $100-$300 a swap in the deepest pair, about $0.30-$3.00 a swap in fees and gas. Real flow, spread over the week, is what a volume snapshot sees; one large wash day is not.`,
        `Add $500-$1,500 of two-sided liquidity to ${c.name}'s busiest ${c.chain} pool and leave it in place for the season (${c.season}). Check the position weekly for range drift; LP fees on a live pair partly offset the gas.`,
      ],
      lending: [
        `Supply ${c.capital} of the deepest asset (usually USDC or ETH) into ${c.name} on ${c.chain}: one approval plus one deposit, ${c.gas}. Supplied balances are the figure lending snapshots reward, so size matters more than transaction count.`,
        `Borrow at most 30-40% against the supply and redeposit it once, keeping the health factor above 1.6 at all times. Spend 5 minutes a week checking collateral prices; a liquidation erases a season of farming in one block.`,
      ],
      yield: [
        `Deposit ${c.capital} into ${c.name}'s main ${c.chain} vault and hold the vault shares in the same wallet all season (${c.season}). One deposit transaction, ${c.gas}; yields compound inside the vault, so no weekly claiming is needed.`,
        `Split a second, smaller deposit across one more of ${c.name}'s vaults or chains if it offers them, and rebalance only when a vault's yield lead over the first passes 2 points. Every extra deposit is ${c.gas}, so let fees set the pace.`,
      ],
      staking: [
        `Stake ${c.capital} of the base asset through ${c.name} on ${c.chain} and hold the receipt token in the farming wallet: one transaction, ${c.gas}. Unbonding can take days to weeks, so stake only funds that can stay locked for the season (${c.season}).`,
        `Use the receipt token once in a mainstream lending or liquidity market that ${c.name} itself lists, at half the position's size or less. That second use is what separates an active staker from a parked one in most points systems.`,
      ],
      bridge: [
        `Bridge $250-$1,000 through ${c.name} from ${c.chain} to one chain it serves, twice a month, and keep the funds working at the far end for at least a week. Each crossing costs ${c.gas} plus any bridge fee shown before you sign; round trips in one day read as farming, not use.`,
        `Rotate the destination chain monthly across ${c.name}'s routes so the wallet shows real use of the network, not one corridor. Keep every crossing's transaction hash in your log; bridge points are often credited per route and per month.`,
      ],
      perps: [
        `Deposit ${c.capital} as margin on ${c.name} (${c.chain}) and trade the most liquid market in small clips: $200-$500 a position, two or three sessions a week. Volume with a sane win rate is the metric; keep leverage at 3x or under so one bad hour cannot end the season.`,
        `Post the margin and leave part of it idle on ${c.name} between sessions rather than withdrawing after every trade. Open interest and margin balances are the figures a perps snapshot can see; pure churn with instant withdrawals is discounted.`,
      ],
      curator: [
        `Deposit ${c.capital} into the largest vault ${c.name} curates on ${c.chain} and hold for the season (${c.season}): one deposit, ${c.gas}. Curator vaults pay their underlying yield while you farm, so the position is rarely a pure cost.`,
        `Read ${c.name}'s vault allocation page once a month and move only if the vault's strategy changes materially. Churn between a curator's vaults costs ${c.gas} a move and resets nothing in your favour.`,
      ],
      rwa: [
        `Complete ${c.name}'s onboarding or KYC if its ${c.chain} product requires it (about 20 minutes, no fee), then deposit ${c.capital} into its main offering. Many real-world-asset products whitelist wallets, so finishing onboarding early is itself the farm.`,
        `Hold the position untouched for the season (${c.season}) and take any yield in the product's own payout asset. RWA positions settle slowly by design; check the position monthly, not daily, and keep the deposit receipts.`,
      ],
      generic: [
        `Use ${c.name}'s core product on ${c.chain} with ${c.capital}: whatever its main action is (deposit, trade or stake), do it at full size once, then in small repeats weekly. Each action costs ${c.gas}; a season of real use runs ${c.season}.`,
        `Grow the position only when ${c.name} adds a market, chain or points page: new surfaces are where early-user snapshots are taken. One new action a week at ${c.gas} is a sustainable pace for the whole season.`,
      ],
    }[book] || [];
    return [
      `Open ${c.name}'s official app (reach it from its DefiLlama page, never a search ad) and connect a fresh wallet on ${c.chain}. Setup takes about 15 minutes and one or two transactions; gas on ${c.chain} runs ${c.gas}. Work with ${c.capital} for the season.`,
      middle[0],
      middle[1],
      `Do one small transaction on ${c.name} every week of the season, on different days, and screenshot your balance monthly with the date visible. Consistency across ${c.season} is what most points and snapshot systems weight highest, ahead of size.`,
      `Watch ${c.name}'s official channels for a token or points announcement and claim only from a link the project itself posts. Keep total costs (gas plus fees) under 2% of your position; if no announcement comes by the season's end, withdraw on ${c.chain} rather than rolling into a second season blind.`,
    ];
  }

  /* ---------- formatting ---------- */
  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) { return n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function ageText(days) {
    if (days === null || days === undefined) return 'unreported';
    if (days < 60) return days + 'd';
    if (days < 730) return Math.round(days / 30.4) + ' mo';
    return (days / 365.25).toFixed(1) + ' yrs';
  }
  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined) return;
      if (k === 'text') node.textContent = v;
      else if (k === 'onclick') node.addEventListener('click', v);
      else if (k === 'onkeydown') node.addEventListener('keydown', v);
      else node.setAttribute(k, v);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else node.appendChild(c);
    });
    return node;
  }
  function txt(s) { return document.createTextNode(s); }

  /* ---------- shared pieces ---------- */
  function pageHeader(compact) {
    var totalTvl = RADAR.rows.reduce(function (s, r) { return s + r.tvl_usd; }, 0);
    var head = [
      h('p', { class: 'kicker', text: 'Token Launch Radar · model ' + RADAR.model_version }),
      h('h1', {}, [txt('Every protocol still waiting on its token, '), h('span', { class: 'thin', text: 'ranked by what the launch would be worth.' })]),
    ];
    if (compact) return h('header', { class: 'scope' }, head);
    return h('header', { class: 'scope' }, head.concat([
      h('p', { class: 'lede' }, [
        txt('One sealed DefiLlama snapshot, read whole. The board ranks every protocol that records no token yet — the full watchlist and every smaller one beneath it — by an implied value computed from its own TVL, growth and age. '),
        h('strong', { text: 'Click any row for its model arithmetic and its farm plan.' }),
      ]),
      h('div', { class: 'stats' }, [
        h('div', { class: 'stat' }, [h('span', { class: 'num', text: String(RADAR.board_size) }), h('span', { class: 'lbl', text: 'pre-token protocols ranked' })]),
        h('div', { class: 'stat' }, [h('span', { class: 'num', text: String(RADAR.watchlist_size) + '/' + String(RADAR.watchlist_size) }), h('span', { class: 'lbl', text: 'watchlist covered' })]),
        h('div', { class: 'stat' }, [h('span', { class: 'num', text: money(totalTvl) }), h('span', { class: 'lbl', text: 'TVL under watch' })]),
        h('div', { class: 'stat' }, [h('span', { class: 'num', text: String(RADAR.live_size) }), h('span', { class: 'lbl', text: 'live tokens set aside' })]),
      ]),
    ]));
  }
  function modelPanel() {
    var mults = Object.keys(RADAR.category_multiple).sort().map(function (k) {
      return h('span', {}, [h('b', { text: k }), txt(' ×' + RADAR.category_multiple[k].toFixed(2))]);
    });
    mults.push(h('span', {}, [h('b', { text: 'anything else' }), txt(' ×' + RADAR.default_multiple.toFixed(2))]));
    return h('section', { class: 'model' }, [
      h('h2', { text: 'How a launch gets its price' }),
      h('p', { text: 'An implied value is a claim about one number: the fully diluted value a token would carry if the protocol issued one at its snapshot size. One function prices every row, from the snapshot figures alone — no name is special-cased and no row is hand-picked.' }),
      h('div', { class: 'formula', text: 'implied value  =  TVL  ×  category multiple  ×  growth multiple  ×  maturity multiple' }),
      h('p', { text: 'Growth: the 7-day TVL change, clamped to [-50%, +60%], at weight 0.6. Maturity: ×0.70 at listing rising to ×1.20 over four tokenless years (an unreported listing date counts as 300 days). Category multiples — the share of each TVL dollar a launch has historically captured, by business model:' }),
      h('div', { class: 'mults' }, mults),
    ]);
  }
  function pageFooter() {
    return h('footer', { class: 'colophon' }, [
      h('p', { text: 'Snapshot: ' + RADAR.source + ' · as of ' + RADAR.as_of + ' · watchlist floor ' + money(RADAR.floor_usd) + ' TVL. A protocol here records no token on DefiLlama; that is a statement about the record, not proof none exists. Implied values are this board\u2019s own model, not a prediction that any token will be issued.' }),
    ]);
  }

  /* ---------- the board ---------- */
  function visibleRows() {
    var q = view.q.trim().toLowerCase();
    return RADAR.rows.filter(function (r) {
      if (view.wl && !r.watchlist) return false;
      if (view.category !== 'all' && (r.category || 'Other') !== view.category) return false;
      if (view.chain !== 'all' && r.chains.indexOf(view.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  var SORT_VALUE = {
    rank: function (r) { return r.rank; },
    tvl: function (r) { return r.tvl_usd; },
    implied: function (r) { return r.implied_value_usd; },
    change: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; },
    age: function (r) { return r.age_days === null ? -1 : r.age_days; },
  };
  function sortedRows(list) {
    var val = SORT_VALUE[view.sort] || SORT_VALUE.rank;
    var dir = view.dir;
    return list.slice().sort(function (a, b) { return (val(a) - val(b)) * dir || a.rank - b.rank; });
  }
  function sortHeader(key, label, numeric) {
    var mark = view.sort === key ? (view.dir === 1 ? ' ↑' : ' ↓') : '';
    return h('th', numeric ? { class: 'num' } : null, [
      h('button', { type: 'button', text: label + mark, onclick: function () {
        if (view.sort === key) view.dir = -view.dir; else { view.sort = key; view.dir = key === 'rank' ? 1 : -1; }
        writeHash(); render();
      } }),
    ]);
  }
  function filterControls() {
    var cats = Array.from(new Set(RADAR.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(RADAR.rows.reduce(function (a, r) { return a.concat(r.chains); }, []))).sort();
    var search = h('input', { type: 'search', placeholder: 'Search name or slug…', value: view.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { view.q = search.value; writeHash(); renderTableOnly(); });
    var catSel = h('select', { 'aria-label': 'Filter by category' },
      [h('option', { value: 'all', text: 'All categories' })].concat(cats.map(function (c) {
        return h('option', { value: c, text: c, selected: c === view.category ? 'selected' : null });
      })));
    catSel.addEventListener('change', function () { view.category = catSel.value; writeHash(); render(); });
    var chainSel = h('select', { 'aria-label': 'Filter by chain' },
      [h('option', { value: 'all', text: 'All chains' })].concat(chains.map(function (c) {
        return h('option', { value: c, text: c, selected: c === view.chain ? 'selected' : null });
      })));
    chainSel.addEventListener('change', function () { view.chain = chainSel.value; writeHash(); render(); });
    var wlBox = h('input', { type: 'checkbox', checked: view.wl ? 'checked' : null });
    wlBox.addEventListener('change', function () { view.wl = wlBox.checked; writeHash(); render(); });
    var preTab = h('button', { type: 'button', 'aria-pressed': view.tab === 'pre' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { view.tab = 'pre'; writeHash(); render(); } });
    var liveTab = h('button', { type: 'button', 'aria-pressed': view.tab === 'live' ? 'true' : 'false', text: 'Live tokens', onclick: function () { view.tab = 'live'; writeHash(); render(); } });
    return h('div', { class: 'controls' }, [
      h('span', { class: 'tabs' }, [preTab, liveTab]), search, catSel, chainSel,
      h('label', { class: 'check' }, [wlBox, txt('Watchlist only')]),
      h('span', { class: 'count', id: 'rowcount' }),
    ]);
  }
  function boardTable() {
    var list = sortedRows(visibleRows());
    var topValue = RADAR.rows.length > 0 ? RADAR.rows[0].implied_value_usd : 1;
    var tbody = h('tbody', {}, list.map(function (r) {
      var chg = h('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: pct(r.change_7d) });
      return h('tr', { tabindex: '0', onclick: function () { openDetail(r.slug); }, onkeydown: function (e) { if (e.key === 'Enter') openDetail(r.slug); } }, [
        h('td', { class: 'rank', text: '#' + r.rank }),
        h('td', {}, [
          h('span', { class: 'pname', text: r.name }),
          r.watchlist ? h('span', { class: 'badge', text: 'WATCHLIST' }) : null,
          h('div', { class: 'pslug', text: r.slug }),
        ]),
        h('td', {}, [h('span', { class: 'chip', text: r.category || 'Other' })]),
        h('td', { text: r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') }),
        h('td', { class: 'num', text: money(r.tvl_usd) }),
        chg,
        h('td', { class: 'num', text: ageText(r.age_days) }),
        h('td', {}, [h('div', { class: 'bar' }, [h('i', { style: 'width:' + Math.max(2, Math.round((r.implied_value_usd / topValue) * 100)) + '%' })])]),
        h('td', { class: 'num', text: money(r.implied_value_usd) }),
      ]);
    }));
    var table = h('table', { class: 'board', id: 'boardtable' }, [
      h('thead', {}, [h('tr', {}, [
        sortHeader('rank', 'Rank'), h('th', { text: 'Protocol' }), h('th', { text: 'Category' }), h('th', { text: 'Chains' }),
        sortHeader('tvl', 'TVL', true), sortHeader('change', '7d', true), sortHeader('age', 'Tokenless age', true),
        h('th', { text: 'Implied' }), sortHeader('implied', 'Value', true),
      ])]),
      tbody,
    ]);
    if (list.length === 0) return h('div', {}, [table, h('p', { class: 'empty', text: 'No protocol matches these filters. Loosen one and the scope fills again.' })]);
    return table;
  }
  function liveTable() {
    var tbody = h('tbody', {}, RADAR.live.map(function (r) {
      return h('tr', {}, [
        h('td', {}, [h('span', { class: 'pname', text: r.name }), h('div', { class: 'pslug', text: (r.symbol || '') + ' · ' + r.slug })]),
        h('td', {}, [h('span', { class: 'chip', text: r.category || 'Other' })]),
        h('td', { text: r.chains.slice(0, 2).join(', ') }),
        h('td', { class: 'num', text: money(r.tvl_usd) }),
        h('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: pct(r.change_7d) }),
        h('td', { class: 'num', text: money(r.mcap_usd) }),
      ]);
    }));
    return h('div', {}, [
      h('p', { class: 'lede', text: 'These already trade, so they are never ranked: the market has priced them. They are the comparison set — what a launched protocol of a given size is actually worth today.' }),
      h('table', { class: 'board' }, [
        h('thead', {}, [h('tr', {}, [h('th', { text: 'Protocol' }), h('th', { text: 'Category' }), h('th', { text: 'Chains' }), h('th', { class: 'num', text: 'TVL' }), h('th', { class: 'num', text: '7d' }), h('th', { class: 'num', text: 'Market cap' })])]),
        tbody,
      ]),
    ]);
  }

  /* ---------- detail view ---------- */
  function openDetail(slug) { view.detail = slug; writeHash(); render(); window.scrollTo(0, 0); }
  function closeDetail() { view.detail = null; writeHash(); render(); }
  function multRow(label, value, widthPct, note) {
    return h('div', { class: 'mult-row' }, [
      h('div', { class: 'top' }, [h('span', { text: label }), h('b', { text: value })]),
      h('div', { class: 'bar' }, [h('i', { style: 'width:' + widthPct + '%' })]),
      note ? h('div', { class: 'note', text: note }) : null,
    ]);
  }
  function detailView(row) {
    var steps = planSteps(row);
    var kv = function (k, v) { return h('div', { class: 'kv' }, [h('span', { class: 'k', text: k }), h('span', { class: 'v', text: v })]); };
    return h('div', {}, [
      h('button', { class: 'back', type: 'button', text: '← Back to the board', onclick: closeDetail }),
      h('div', { class: 'detail-head' }, [
        h('h2', { text: row.name }),
        row.watchlist ? h('span', { class: 'badge', text: 'WATCHLIST' }) : null,
        h('span', { class: 'chip', text: row.category || 'Other' }),
        h('span', { class: 'pslug', text: row.slug + ' · rank #' + row.rank + ' of ' + RADAR.board_size }),
      ]),
      h('div', { class: 'detail-grid' }, [
        h('section', { class: 'card' }, [
          h('h3', { text: 'The protocol' }),
          kv('TVL', money(row.tvl_usd)),
          kv('7-day TVL change', pct(row.change_7d)),
          kv('Chains', row.chains.join(', ') || '—'),
          kv('Tracked since', row.listed_at || 'unreported'),
          kv('Tokenless age', ageText(row.age_days)),
          kv('Token', 'none recorded on DefiLlama'),
          h('h3', { text: 'Its implied value', style: 'margin-top:18px' }),
          h('div', { class: 'implied-big', text: money(row.implied_value_usd) }),
          multRow('TVL base', money(row.tvl_usd), 100, null),
          multRow('Category multiple (' + (row.category || 'Other') + ')', '×' + row.category_multiple.toFixed(2), Math.round(row.category_multiple / 0.6 * 100), null),
          multRow('Growth multiple', '×' + row.growth_multiple.toFixed(2), Math.round(row.growth_multiple / 1.36 * 100), '7-day change ' + pct(row.change_7d) + ', clamped and weighted 0.6'),
          multRow('Maturity multiple', '×' + row.maturity_multiple.toFixed(2), Math.round((row.maturity_multiple - 0.7) / 0.5 * 100), ageText(row.age_days) + ' with no token, on the 0.70 → 1.20 curve'),
        ]),
        h('section', { class: 'card' }, [
          h('h3', { text: 'Farm plan · ' + (row.category || 'general') + ' playbook' }),
          h('ol', { class: 'steps' }, steps.map(function (s) { return h('li', { text: s }); })),
          h('p', { class: 'note', text: 'Costs and times are the plan\u2019s own estimates at snapshot prices. An implied value is this board\u2019s model claim, not a promise that a token will be issued.' }),
        ]),
      ]),
    ]);
  }

  /* ---------- render ---------- */
  var tableHost = null;
  function renderTableOnly() {
    if (!tableHost) { render(); return; }
    var fresh = view.tab === 'live' ? liveTable() : boardTable();
    tableHost.replaceChildren(fresh);
    var c = document.getElementById('rowcount');
    if (c && view.tab === 'pre') c.textContent = visibleRows().length + ' of ' + RADAR.board_size + ' protocols';
  }
  function setRowCount() {
    var c = document.getElementById('rowcount');
    if (!c) return;
    if (view.tab === 'pre') c.textContent = visibleRows().length + ' of ' + RADAR.board_size + ' protocols';
    else c.textContent = RADAR.live_size + ' live tokens';
  }
  function render() {
    root.setAttribute('aria-busy', 'false');
    var wrap = h('div', { class: 'wrap' });
    wrap.appendChild(pageHeader(!!view.detail));
    if (view.detail) {
      var row = RADAR.rows.find(function (r) { return r.slug === view.detail; });
      if (row) { wrap.appendChild(detailView(row)); wrap.appendChild(pageFooter()); root.replaceChildren(wrap); return; }
      view.detail = null;
    }
    wrap.appendChild(modelPanel());
    wrap.appendChild(filterControls());
    tableHost = h('div', {});
    tableHost.appendChild(view.tab === 'live' ? liveTable() : boardTable());
    wrap.appendChild(tableHost);
    wrap.appendChild(pageFooter());
    root.replaceChildren(wrap);
    setRowCount();
  }
  window.addEventListener('hashchange', function () { readHash(); render(); });
  readHash();
  render();
})();
