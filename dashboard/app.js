/* Token Launch Radar: the board, a detail view for every protocol, and the live-token comparison.
   Everything renders from window.RADAR_DATA (../data.js, written by main.ts from the sealed
   snapshot). No network, no framework. The farm plans below are the model's playbooks, the same
   ones main.ts writes into board.json, filled with each protocol's own figures. */
(function () {
  'use strict';
  var DATA = window.RADAR_DATA;
  var app = document.getElementById('app');

  /* ---------- formatting ---------- */
  function fmtUsd(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) { return n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unreported';
    if (days < 60) return days + 'd';
    if (days < 730) return Math.round(days / 30.4) + ' mo';
    return (days / 365.25).toFixed(1) + ' yrs';
  }
  function el(tag, attrs, children) {
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

  /* ---------- the farm playbooks, mirroring lib/model.ts ---------- */
  function mainChain(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasWording(chain) {
    if (chain === 'Ethereum') return 'about $8-$30 a transaction at typical gas';
    if (chain === 'Solana') return 'about $0.01-$0.05 a transaction';
    if (chain === 'Bitcoin') return 'about $1-$5 a transaction';
    if (chain === 'BSC') return 'about $0.10-$0.60 a transaction';
    if (['Arbitrum', 'Optimism', 'Base', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Blast', 'Mode'].indexOf(chain) >= 0) return 'about $0.05-$0.50 a transaction';
    return 'about $0.10-$2.00 a transaction';
  }
  function capitalFor(tvl) {
    if (tvl >= 250000000) return '$2,000-$5,000';
    if (tvl >= 50000000) return '$1,000-$2,500';
    if (tvl >= 10000000) return '$500-$1,500';
    if (tvl >= 5000000) return '$250-$750';
    return '$100-$400';
  }
  function seasonFor(age) {
    if (age !== null && age >= 730) return '10-14 weeks';
    if (age !== null && age >= 365) return '8-12 weeks';
    if (age !== null && age >= 90) return '6-10 weeks';
    return '4-8 weeks';
  }
  function playbookFor(category) {
    switch (category) {
      case 'Dexs': return 'dex';
      case 'Lending': case 'CDP': return 'lending';
      case 'Yield': case 'Yield Aggregator': case 'Basis Trading': case 'Leveraged Farming': return 'yield';
      case 'Liquid Staking': case 'Liquid Restaking': case 'Restaked BTC': case 'Staking Pool': return 'staking';
      case 'Bridge': case 'Canonical Bridge': return 'bridge';
      case 'Derivatives': return 'perps';
      case 'Risk Curators': case 'Onchain Capital Allocator': return 'curator';
      case 'RWA': return 'rwa';
      default: return 'generic';
    }
  }
  function farmSteps(p) {
    var chain = mainChain(p), gas = gasWording(chain), capital = capitalFor(p.tvl_usd), season = seasonFor(p.age_days);
    var book = playbookFor(p.category), steps = [];
    steps.push("Open " + p.name + "'s official app (reach it from its DefiLlama page, never a search ad) and connect a fresh wallet on " + chain + ". Setup takes about 15 minutes and one or two transactions; gas on " + chain + " runs " + gas + ". Work with " + capital + " for the season.");
    if (book === 'dex') {
      steps.push("Swap through " + p.name + " two or three times a week on " + chain + ": $100-$300 a swap in the deepest pair, about $0.30-$3.00 a swap in fees and gas. Real flow, spread over the week, is what a volume snapshot sees; one large wash day is not.");
      steps.push("Add $500-$1,500 of two-sided liquidity to " + p.name + "'s busiest " + chain + " pool and leave it in place for the season (" + season + "). Check the position weekly for range drift; LP fees on a live pair partly offset the gas.");
    } else if (book === 'lending') {
      steps.push("Supply " + capital + " of the deepest asset (usually USDC or ETH) into " + p.name + " on " + chain + ": one approval plus one deposit, " + gas + ". Supplied balances are the figure lending snapshots reward, so size matters more than transaction count.");
      steps.push("Borrow at most 30-40% against the supply and redeposit it once, keeping the health factor above 1.6 at all times. Spend 5 minutes a week checking collateral prices; a liquidation erases a season of farming in one block.");
    } else if (book === 'yield') {
      steps.push("Deposit " + capital + " into " + p.name + "'s main " + chain + " vault and hold the vault shares in the same wallet all season (" + season + "). One deposit transaction, " + gas + "; yields compound inside the vault, so no weekly claiming is needed.");
      steps.push("Split a second, smaller deposit across one more of " + p.name + "'s vaults or chains if it offers them, and rebalance only when a vault's yield lead over the first passes 2 points. Every extra deposit is " + gas + ", so let fees set the pace.");
    } else if (book === 'staking') {
      steps.push("Stake " + capital + " of the base asset through " + p.name + " on " + chain + " and hold the receipt token in the farming wallet: one transaction, " + gas + ". Unbonding can take days to weeks, so stake only funds that can stay locked for the season (" + season + ").");
      steps.push("Use the receipt token once in a mainstream lending or liquidity market that " + p.name + " itself lists, at half the position's size or less. That second use is what separates an active staker from a parked one in most points systems.");
    } else if (book === 'bridge') {
      steps.push("Bridge $250-$1,000 through " + p.name + " from " + chain + " to one chain it serves, twice a month, and keep the funds working at the far end for at least a week. Each crossing costs " + gas + " plus any bridge fee shown before you sign; round trips in one day read as farming, not use.");
      steps.push("Rotate the destination chain monthly across " + p.name + "'s routes so the wallet shows real use of the network, not one corridor. Keep every crossing's transaction hash in your log; bridge points are often credited per route and per month.");
    } else if (book === 'perps') {
      steps.push("Deposit " + capital + " as margin on " + p.name + " (" + chain + ") and trade the most liquid market in small clips: $200-$500 a position, two or three sessions a week. Volume with a sane win rate is the metric; keep leverage at 3x or under so one bad hour cannot end the season.");
      steps.push("Post the margin and leave part of it idle on " + p.name + " between sessions rather than withdrawing after every trade. Open interest and margin balances are the figures a perps snapshot can see; pure churn with instant withdrawals is discounted.");
    } else if (book === 'curator') {
      steps.push("Deposit " + capital + " into the largest vault " + p.name + " curates on " + chain + " and hold for the season (" + season + "): one deposit, " + gas + ". Curator vaults pay their underlying yield while you farm, so the position is rarely a pure cost.");
      steps.push("Read " + p.name + "'s vault allocation page once a month and move only if the vault's strategy changes materially. Churn between a curator's vaults costs " + gas + " a move and resets nothing in your favour.");
    } else if (book === 'rwa') {
      steps.push("Complete " + p.name + "'s onboarding or KYC if its " + chain + " product requires it (about 20 minutes, no fee), then deposit " + capital + " into its main offering. Many real-world-asset products whitelist wallets, so finishing onboarding early is itself the farm.");
      steps.push("Hold the position untouched for the season (" + season + ") and take any yield in the product's own payout asset. RWA positions settle slowly by design; check the position monthly, not daily, and keep the deposit receipts.");
    } else {
      steps.push("Use " + p.name + "'s core product on " + chain + " with " + capital + ": whatever its main action is (deposit, trade or stake), do it at full size once, then in small repeats weekly. Each action costs " + gas + "; a season of real use runs " + season + ".");
      steps.push("Grow the position only when " + p.name + " adds a market, chain or points page: new surfaces are where early-user snapshots are taken. One new action a week at " + gas + " is a sustainable pace for the whole season.");
    }
    steps.push("Do one small transaction on " + p.name + " every week of the season, on different days, and screenshot your balance monthly with the date visible. Consistency across " + season + " is what most points and snapshot systems weight highest, ahead of size.");
    steps.push("Watch " + p.name + "'s official channels for a token or points announcement and claim only from a link the project itself posts. Keep total costs (gas plus fees) under 2% of your position; if no announcement comes by the season's end, withdraw on " + chain + " rather than rolling into a second season blind.");
    return steps;
  }

  /* ---------- state, carried in the hash so every view has an address ---------- */
  var state = { tab: 'pre', q: '', category: 'all', chain: 'all', wl: false, sort: 'rank', dir: 1, detail: null };
  function readHash() {
    var h = window.location.hash.replace(/^#\/?/, '');
    var parts = h.split('?');
    var path = parts[0] || '';
    var params = new URLSearchParams(parts[1] || '');
    state.detail = path.indexOf('p/') === 0 ? decodeURIComponent(path.slice(2)) : null;
    state.tab = params.get('tab') === 'live' ? 'live' : 'pre';
    state.q = params.get('q') || '';
    state.category = params.get('cat') || 'all';
    state.chain = params.get('chain') || 'all';
    state.wl = params.get('wl') === '1';
    state.sort = params.get('sort') || 'rank';
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('cat', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.wl) params.set('wl', '1');
    if (state.sort !== 'rank') params.set('sort', state.sort);
    var base = state.detail ? '#/p/' + encodeURIComponent(state.detail) : '#/';
    var qs = params.toString();
    history.replaceState(null, '', qs ? base + '?' + qs : base);
  }

  /* ---------- shared pieces ---------- */
  function header(compact) {
    var totalTvl = DATA.rows.reduce(function (s, r) { return s + r.tvl_usd; }, 0);
    var head = [
      el('p', { class: 'kicker', text: 'Token Launch Radar · model ' + DATA.model_version }),
      el('h1', {}, [document.createTextNode('Every protocol still waiting on its token, '), el('span', { class: 'thin', text: 'ranked by what the launch would be worth.' })]),
    ];
    if (compact) return el('header', { class: 'scope' }, head);
    return el('header', { class: 'scope' }, head.concat([
      el('p', { class: 'lede' }, [
        document.createTextNode('One sealed DefiLlama snapshot, read whole. The board ranks every protocol that records no token yet — the full watchlist and every smaller one beneath it — by an implied value computed from its own TVL, growth and age. '),
        el('strong', { text: 'Click any row for its model arithmetic and its farm plan.' }),
      ]),
      el('div', { class: 'stats' }, [
        el('div', { class: 'stat' }, [el('span', { class: 'num', text: String(DATA.board_size) }), el('span', { class: 'lbl', text: 'pre-token protocols ranked' })]),
        el('div', { class: 'stat' }, [el('span', { class: 'num', text: String(DATA.watchlist_size) + '/' + String(DATA.watchlist_size) }), el('span', { class: 'lbl', text: 'watchlist covered' })]),
        el('div', { class: 'stat' }, [el('span', { class: 'num', text: fmtUsd(totalTvl) }), el('span', { class: 'lbl', text: 'TVL under watch' })]),
        el('div', { class: 'stat' }, [el('span', { class: 'num', text: String(DATA.live_size) }), el('span', { class: 'lbl', text: 'live tokens set aside' })]),
      ]),
    ]));
  }
  function modelPanel() {
    var mults = Object.keys(DATA.category_multiple).sort().map(function (k) {
      return el('span', {}, [el('b', { text: k }), document.createTextNode(' ×' + DATA.category_multiple[k].toFixed(2))]);
    });
    mults.push(el('span', {}, [el('b', { text: 'anything else' }), document.createTextNode(' ×' + DATA.default_multiple.toFixed(2))]));
    return el('section', { class: 'model' }, [
      el('h2', { text: 'How a launch gets its price' }),
      el('p', { text: 'An implied value is a claim about one number: the fully diluted value a token would carry if the protocol issued one at its snapshot size. One function prices every row, from the snapshot figures alone — no name is special-cased and no row is hand-picked.' }),
      el('div', { class: 'formula', text: 'implied value  =  TVL  ×  category multiple  ×  growth multiple  ×  maturity multiple' }),
      el('p', { text: 'Growth: the 7-day TVL change, clamped to [-50%, +60%], at weight 0.6. Maturity: ×0.70 at listing rising to ×1.20 over four tokenless years (an unreported listing date counts as 300 days). Category multiples — the share of each TVL dollar a launch has historically captured, by business model:' }),
      el('div', { class: 'mults' }, mults),
    ]);
  }
  function footer() {
    return el('footer', { class: 'colophon' }, [
      el('p', { text: 'Snapshot: ' + DATA.source + ' · as of ' + DATA.as_of + ' · watchlist floor ' + fmtUsd(DATA.floor_usd) + ' TVL. A protocol here records no token on DefiLlama; that is a statement about the record, not proof none exists. Implied values are this board\u2019s own model, not a prediction that any token will be issued.' }),
    ]);
  }

  /* ---------- the board ---------- */
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wl && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function sorted(list) {
    var key = state.sort, dir = state.dir;
    var val = {
      rank: function (r) { return r.rank; },
      tvl: function (r) { return r.tvl_usd; },
      implied: function (r) { return r.implied_value_usd; },
      change: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; },
      age: function (r) { return r.age_days === null ? -1 : r.age_days; },
    }[key] || function (r) { return r.rank; };
    return list.slice().sort(function (a, b) { return (val(a) - val(b)) * dir || a.rank - b.rank; });
  }
  function sortTh(key, label, num) {
    var mark = state.sort === key ? (state.dir === 1 ? ' ↑' : ' ↓') : '';
    return el('th', num ? { class: 'num' } : null, [
      el('button', { type: 'button', text: label + mark, onclick: function () {
        if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'rank' ? 1 : -1; }
        writeHash(); render();
      } }),
    ]);
  }
  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains); }, []))).sort();
    var search = el('input', { type: 'search', placeholder: 'Search name or slug…', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); renderTableOnly(); });
    var catSel = el('select', { 'aria-label': 'Filter by category' },
      [el('option', { value: 'all', text: 'All categories' })].concat(cats.map(function (c) {
        return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null });
      })));
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { 'aria-label': 'Filter by chain' },
      [el('option', { value: 'all', text: 'All chains' })].concat(chains.map(function (c) {
        return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null });
      })));
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var wlBox = el('input', { type: 'checkbox', checked: state.wl ? 'checked' : null });
    wlBox.addEventListener('change', function () { state.wl = wlBox.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live tokens', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' }, [
      el('span', { class: 'tabs' }, [pre, live]), search, catSel, chainSel,
      el('label', { class: 'check' }, [wlBox, document.createTextNode('Watchlist only')]),
      el('span', { class: 'count', id: 'rowcount' }),
    ]);
  }
  function boardTable() {
    var list = sorted(visibleRows());
    var maxImplied = DATA.rows.length > 0 ? DATA.rows[0].implied_value_usd : 1;
    var tbody = el('tbody', {}, list.map(function (r) {
      var chg = el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) });
      return el('tr', { tabindex: '0', onclick: function () { openDetail(r.slug); }, onkeydown: function (e) { if (e.key === 'Enter') openDetail(r.slug); } }, [
        el('td', { class: 'rank', text: '#' + r.rank }),
        el('td', {}, [
          el('span', { class: 'pname', text: r.name }),
          r.watchlist ? el('span', { class: 'badge', text: 'WATCHLIST' }) : null,
          el('div', { class: 'pslug', text: r.slug }),
        ]),
        el('td', {}, [el('span', { class: 'chip', text: r.category || 'Other' })]),
        el('td', { text: r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        chg,
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', {}, [el('div', { class: 'bar' }, [el('i', { style: 'width:' + Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100)) + '%' })])]),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
      ]);
    }));
    var table = el('table', { class: 'board', id: 'boardtable' }, [
      el('thead', {}, [el('tr', {}, [
        sortTh('rank', 'Rank'), el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { text: 'Chains' }),
        sortTh('tvl', 'TVL', true), sortTh('change', '7d', true), sortTh('age', 'Tokenless age', true),
        el('th', { text: 'Implied' }), sortTh('implied', 'Value', true),
      ])]),
      tbody,
    ]);
    if (list.length === 0) return el('div', {}, [table, el('p', { class: 'empty', text: 'No protocol matches these filters. Loosen one and the scope fills again.' })]);
    return table;
  }
  function liveTable() {
    var tbody = el('tbody', {}, DATA.live.map(function (r) {
      return el('tr', {}, [
        el('td', {}, [el('span', { class: 'pname', text: r.name }), el('div', { class: 'pslug', text: (r.symbol || '') + ' · ' + r.slug })]),
        el('td', {}, [el('span', { class: 'chip', text: r.category || 'Other' })]),
        el('td', { text: r.chains.slice(0, 2).join(', ') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
      ]);
    }));
    return el('div', {}, [
      el('p', { class: 'lede', text: 'These already trade, so they are never ranked: the market has priced them. They are the comparison set — what a launched protocol of a given size is actually worth today.' }),
      el('table', { class: 'board' }, [
        el('thead', {}, [el('tr', {}, [el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { text: 'Chains' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: '7d' }), el('th', { class: 'num', text: 'Market cap' })])]),
        tbody,
      ]),
    ]);
  }

  /* ---------- detail view ---------- */
  function openDetail(slug) { state.detail = slug; writeHash(); render(); window.scrollTo(0, 0); }
  function closeDetail() { state.detail = null; writeHash(); render(); }
  function multRow(label, value, widthPct, note) {
    return el('div', { class: 'mult-row' }, [
      el('div', { class: 'top' }, [el('span', { text: label }), el('b', { text: value })]),
      el('div', { class: 'bar' }, [el('i', { style: 'width:' + widthPct + '%' })]),
      note ? el('div', { class: 'note', text: note }) : null,
    ]);
  }
  function detailView(row) {
    var steps = farmSteps(row);
    var kv = function (k, v) { return el('div', { class: 'kv' }, [el('span', { class: 'k', text: k }), el('span', { class: 'v', text: v })]); };
    return el('div', {}, [
      el('button', { class: 'back', type: 'button', text: '← Back to the board', onclick: closeDetail }),
      el('div', { class: 'detail-head' }, [
        el('h2', { text: row.name }),
        row.watchlist ? el('span', { class: 'badge', text: 'WATCHLIST' }) : null,
        el('span', { class: 'chip', text: row.category || 'Other' }),
        el('span', { class: 'pslug', text: row.slug + ' · rank #' + row.rank + ' of ' + DATA.board_size }),
      ]),
      el('div', { class: 'detail-grid' }, [
        el('section', { class: 'card' }, [
          el('h3', { text: 'The protocol' }),
          kv('TVL', fmtUsd(row.tvl_usd)),
          kv('7-day TVL change', fmtPct(row.change_7d)),
          kv('Chains', row.chains.join(', ') || '—'),
          kv('Tracked since', row.listed_at || 'unreported'),
          kv('Tokenless age', fmtAge(row.age_days)),
          kv('Token', 'none recorded on DefiLlama'),
          el('h3', { text: 'Its implied value', style: 'margin-top:18px' }),
          el('div', { class: 'implied-big', text: fmtUsd(row.implied_value_usd) }),
          multRow('TVL base', fmtUsd(row.tvl_usd), 100, null),
          multRow('Category multiple (' + (row.category || 'Other') + ')', '×' + row.category_multiple.toFixed(2), Math.round(row.category_multiple / 0.6 * 100), null),
          multRow('Growth multiple', '×' + row.growth_multiple.toFixed(2), Math.round(row.growth_multiple / 1.36 * 100), '7-day change ' + fmtPct(row.change_7d) + ', clamped and weighted 0.6'),
          multRow('Maturity multiple', '×' + row.maturity_multiple.toFixed(2), Math.round((row.maturity_multiple - 0.7) / 0.5 * 100), fmtAge(row.age_days) + ' with no token, on the 0.70 → 1.20 curve'),
        ]),
        el('section', { class: 'card' }, [
          el('h3', { text: 'Farm plan · ' + (row.category || 'general') + ' playbook' }),
          el('ol', { class: 'steps' }, steps.map(function (s) { return el('li', { text: s }); })),
          el('p', { class: 'note', text: 'Costs and times are the plan\u2019s own estimates at snapshot prices. An implied value is this board\u2019s model claim, not a promise that a token will be issued.' }),
        ]),
      ]),
    ]);
  }

  /* ---------- render ---------- */
  var tableHost = null;
  function renderTableOnly() {
    if (!tableHost) { render(); return; }
    var fresh = state.tab === 'live' ? liveTable() : boardTable();
    tableHost.replaceChildren(fresh);
    var c = document.getElementById('rowcount');
    if (c && state.tab === 'pre') c.textContent = visibleRows().length + ' of ' + DATA.board_size + ' protocols';
  }
  function render() {
    readHashSoft();
    app.setAttribute('aria-busy', 'false');
    var wrap = el('div', { class: 'wrap' });
    wrap.appendChild(header(!!state.detail));
    if (state.detail) {
      var row = DATA.rows.find(function (r) { return r.slug === state.detail; });
      if (row) { wrap.appendChild(detailView(row)); wrap.appendChild(footer()); app.replaceChildren(wrap); return; }
      state.detail = null;
    }
    wrap.appendChild(modelPanel());
    wrap.appendChild(controls());
    tableHost = el('div', {});
    tableHost.appendChild(state.tab === 'live' ? liveTable() : boardTable());
    wrap.appendChild(tableHost);
    wrap.appendChild(footer());
    app.replaceChildren(wrap);
    var c = document.getElementById('rowcount');
    if (c && state.tab === 'pre') c.textContent = visibleRows().length + ' of ' + DATA.board_size + ' protocols';
    if (c && state.tab === 'live') c.textContent = DATA.live_size + ' live tokens';
  }
  function readHashSoft() { /* state is mutated by controls; readHash runs on hashchange and first load */ }
  window.addEventListener('hashchange', function () { readHash(); render(); });
  readHash();
  render();
})();
