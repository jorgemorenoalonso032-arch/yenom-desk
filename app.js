/* Desk iPhone web app — plan B: polls encrypted JSON at d/<DATA_PATH>/ every 15s.
   FOMO links: ONLY the coin_url / profile_url / signup_url fields that the server builds with links.py. Never built here. */
(() => {
  const $ = s => document.querySelector(s), V = $('#view');
  // iOS Home Screen drops #hash and often uses a separate store — prefer ?t=&d= and keep them in the URL.
  const qp = new URLSearchParams(location.search);
  const hp = new URLSearchParams(location.hash.replace(/^#/, ''));
  const tIn = qp.get('t') || hp.get('t');
  const dIn = qp.get('d') || hp.get('d');
  if (tIn) localStorage.setItem('desk_t', tIn);
  if (dIn) localStorage.setItem('desk_d', dIn);
  let T = localStorage.getItem('desk_t'), D = localStorage.getItem('desk_d');
  // Keep credentials in the query so Add to Home Screen reopens already paired.
  if (T && D) {
    const want = '?t=' + encodeURIComponent(T) + '&d=' + encodeURIComponent(D);
    if (location.search !== want || location.hash) history.replaceState(null, '', location.pathname + want);
  }
  const BASE = (window.DESK_DATA_BASE || 'd/') + D + '/';
  let S = null, CH = null, ACT = null, tab = 'home', coin = null, err = null, key = null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const usd = v => v == null ? '—' : (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const pct = v => v == null ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
  const ago = ts => { if (!ts) return 'never'; const s = (Date.now() - new Date(ts).getTime()) / 1000; return s < 60 ? Math.round(s) + 's' : s < 3600 ? Math.round(s / 60) + 'm' : Math.round(s / 3600) + 'h'; };
  const health = ts => { if (!ts) return 'dead'; const s = (Date.now() - new Date(ts).getTime()) / 1000; return s < 120 ? 'ok' : s < 600 ? 'late' : 'dead'; };
  const safeUrl = u => (typeof u === 'string' && u.startsWith('https://fomo.family/')) ? u : null;   // only server-built FOMO links
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function getKey() { if (!key) key = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(T)), 'AES-GCM', false, ['decrypt']); return key; }
  async function get(name) {
    const r = await fetch(BASE + name + '?_=' + Date.now(), {cache: 'no-store'}); if (r.status === 404) return null; if (!r.ok) throw new Error('HTTP ' + r.status);
    const e = await r.json(); const pt = await crypto.subtle.decrypt({name: 'AES-GCM', iv: b64(e.iv)}, await getKey(), b64(e.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function poll() {
    try { [S, CH, ACT] = await Promise.all([get('state.json'), get('chart.json'), get('activity.json')]); err = null; if (coin) coin.data = await get('coin/' + coin.mint + '.json'); }
    catch (e) { err = e.name === 'OperationError' ? 'Wrong token (cannot decrypt)' : 'Offline · ' + e.message; }
    render();
  }

  function odometer(v) {
    const s = usd(v); return '<span class="bal">' + [...s].map(ch => /\d/.test(ch) ? `<span class="odo"><span style="transform:translateY(-${ch}em)">${[...'0123456789'].map(d => `<div style="height:1em">${d}</div>`).join('')}</span></span>` : esc(ch)).join('') + '</span>';
  }
  const actRow = a => `<div class="row" ${a.mint ? `data-coin="${esc(a.mint)}"` : ''}><div class="ico ${a.kind === 'reject' ? 'dn' : a.kind === 'exit' ? 'or' : a.kind === 'signal' ? 'up' : 'cy'}">${esc((a.agent || '?')[0].toUpperCase())}</div>
    <div class="main"><div class="t">${esc(a.title)}</div><div class="st">${esc(a.subtitle)}</div></div><div class="v"><div>${esc(a.value)}</div><div class="dim" style="font-size:12px">${ago(a.ts)}</div></div></div>`;
  const agentCard = a => `<div class="agent"><div class="n"><span class="dot ${health(a.last)}"></span>${esc(a.name)}</div><div class="s">${esc(a.stat)}</div><div class="s">${ago(a.last)} ago</div></div>`;

  function home() {
    const up = S.pnl >= 0, list = (ACT && ACT.items || []).slice(0, 8);
    return `<div class="card" style="background:none;padding:4px 0">${odometer(S.balance)}
      <div class="chg ${up ? 'up' : 'dn'}">${usd(S.pnl)} (${pct(S.start ? S.pnl / S.start : 0)}) <span class="dim">since start</span></div>
      <canvas class="chart" id="cv"></canvas></div>
      <div class="h">Agents</div><div class="carousel">${S.agents.map(agentCard).join('')}</div>
      ${S.open.length ? `<div class="h">Open positions</div><div class="card">${S.open.map(p => `<div class="row" data-coin="${esc(p.mint)}"><div class="ico">${esc((p.symbol || '?')[0])}</div><div class="main"><div class="t">$${esc(p.symbol || p.mint.slice(0, 6))}</div><div class="st">${usd(p.size_usd)} · stop ${(+p.stop_price).toPrecision(4)}</div></div><div class="v ${p.price >= p.entry_price ? 'up' : 'dn'}">${pct(p.price / p.entry_price - 1)}</div></div>`).join('')}</div>` : ''}
      <div class="h">Activity</div><div class="card">${list.length ? list.map(actRow).join('') : '<div class="state" style="padding:24px">No activity yet tonight</div>'}</div>`;
  }
  function agents() {
    return S.agents.map(a => `<div class="card"><div class="row"><div class="main"><div class="t"><span class="dot ${health(a.last)}"></span>${esc(a.name)}</div><div class="st">${esc(a.stat)} · heartbeat ${ago(a.last)} ago</div></div></div>
      ${(ACT.items || []).filter(x => x.agent === a.id).slice(0, 4).map(actRow).join('') || '<div class="note">Nothing yet</div>'}</div>`).join('');
  }
  function activity() { const it = ACT && ACT.items || []; return it.length ? `<div class="card">${it.map(actRow).join('')}</div>` : '<div class="state">No activity yet</div>'; }
  function account() {
    const st = S.settings || {}, show = ['desk.mode', 'desk.analyst_mode', 'desk.paper_start_stack', 'executor.stack_pct', 'executor.min_ticket_usd', 'risk.stop_pct', 'risk.trail_start_pct', 'risk.trail_pct', 'risk.timeout_h', 'scanner.min_liquidity_usd', 'desk.fees_ref_discount'];
    const pu = safeUrl(S.profile_url), su = safeUrl(S.signup_url);
    return `<div class="card"><div class="kv"><span>Mode</span><span class="${S.mode === 'LIVE' ? 'up' : 'or'}">${esc(S.mode)}</span></div>
      <div class="kv"><span>Trades</span><span>${S.trades}</span></div><div class="kv"><span>Win rate</span><span>${S.win_rate == null ? '—' : Math.round(S.win_rate * 100) + '%'}</span></div>
      <div class="kv"><span>FOMO</span><span>@${esc(S.fomo_handle)}</span></div></div>
      <div class="note">Mode PAPER/LIVE and settings are read-only here (hosting plan B, static). Change them from Telegram.</div>
      <div class="h">Settings</div><div class="card">${show.map(k => `<div class="kv"><span>${esc(k)}</span><span>${esc(JSON.stringify(st[k]))}</span></div>`).join('')}</div>
      ${pu ? `<a class="btn sec" href="${esc(pu)}" target="_blank" rel="noopener">My FOMO profile</a>` : ''}${su ? `<a class="btn" href="${esc(su)}" target="_blank" rel="noopener">Join FOMO</a>` : ''}
      <button class="btn sec" id="logout">Forget this device</button>`;
  }
  function coinView() {
    const d = coin.data; if (!d) return '<button class="back">‹ Back</button><div class="state">Loading coin…</div>';
    const c = d.coin || {}, pos = (d.positions || []).find(p => !p.closed_at), u = safeUrl(d.coin_url), v = d.verdict;
    return `<button class="back">‹ Back</button><div class="bal" style="font-size:30px">$${esc(c.symbol || c.mint.slice(0, 6))}</div><div class="dim">${esc(c.name || '')}</div>
      <canvas class="chart" id="cv"></canvas>
      ${pos ? `<div class="card"><div class="kv"><span>Entry</span><span>${(+pos.entry_price).toPrecision(5)}</span></div><div class="kv"><span>Size</span><span>${usd(pos.size_usd)}</span></div><div class="kv"><span>Exit line</span><span class="or">${(+pos.stop_price).toPrecision(5)}${pos.trail_active ? ' · trailing' : ''}</span></div></div>` : ''}
      ${u ? `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener">Buy on FOMO</a>` : ''}
      <div class="h">Auditor</div><div class="card">${(d.audit || []).length ? d.audit.map(L => `<div class="layer"><span class="dim" style="width:18px">${L.layer}</span><div class="main" style="flex:1"><div class="t">${esc(L.name)}</div><div class="st">${esc(L.value_text)} · ${esc(L.source)}</div></div><span class="pill ${L.pass ? 'g' : 'r'}">${L.pass ? 'PASS' : 'FAIL'}</span></div>`).join('') : '<div class="note">Not audited</div>'}</div>
      ${v ? `<div class="h">Analyst</div><div class="card">${['alive_6h', 'organic', 'flush', 'chase'].map(k => `<div class="kv"><span>${k}</span><span>${v[k] == null ? '—' : (+v[k]).toFixed(2)}</span></div>`).join('')}<div class="kv"><span>Score</span><span class="${v.pass ? 'up' : 'dn'}">${v.score}</span></div></div>` : ''}`;
  }
  function render() {
    if (!T || !D) {
      V.innerHTML = `<div class="state" style="text-align:left;padding:24px">
        <div style="font-size:17px;font-weight:600;margin-bottom:8px">Pair this device</div>
        <div class="dim" style="margin-bottom:12px">iPhone home-screen icons drop the # part of the link. Paste the full private URL below (or open the ?t=…&d=… link in Safari, then Add to Home Screen again).</div>
        <input id="pair" type="url" placeholder="https://…github.io/yenom-desk/?t=…&d=…" style="width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:0;background:#2c2c2e;color:#fff;margin-bottom:12px"/>
        <button class="btn" id="pairGo">Pair</button></div>`;
      return;
    }
    if (!S) { V.innerHTML = err ? `<div class="state err">${esc(err)}</div><button class="btn sec" id="retry">Retry</button>` : '<div class="state">Loading…</div>'; return; }
    const b = $('#badge'); b.textContent = S.mode; b.className = 'badge' + (S.mode === 'LIVE' ? ' live' : '');
    $('#title').textContent = coin ? 'Coin' : tab[0].toUpperCase() + tab.slice(1);
    const y = scrollY; V.innerHTML = (err ? `<div class="note dn">${esc(err)} · showing last data</div>` : '') + (coin ? coinView() : {home, agents, activity, account}[tab]()); scrollTo(0, y);
    const cv = $('#cv');
    if (cv && coin && coin.data) { const p = (coin.data.positions || []).find(p => !p.closed_at); drawChart(cv, coin.data.prices, {base: p && p.entry_price, exitLine: p && p.stop_price}); }
    else if (cv) drawChart(cv, CH && CH.points, {base: S.start});
  }
  function doPair(raw) {
    raw = (raw || '').trim();
    try {
      const u = new URL(raw, location.origin);
      const q = new URLSearchParams(u.search); const h = new URLSearchParams(u.hash.replace(/^#/, ''));
      let tt = q.get('t') || h.get('t'); let dd = q.get('d') || h.get('d');
      // also accept bare token&path pasted as t=...&d=...
      if ((!tt || !dd) && raw.includes('t=') && raw.includes('d=')) {
        const fake = new URLSearchParams(raw.replace(/^.*\?/, '').replace(/^#/, ''));
        tt = tt || fake.get('t'); dd = dd || fake.get('d');
      }
      if (!tt || !dd) { alert('Falta t= o d= en el enlace'); return; }
      localStorage.setItem('desk_t', tt); localStorage.setItem('desk_d', dd);
      location.replace(location.pathname + '?t=' + encodeURIComponent(tt) + '&d=' + encodeURIComponent(dd));
    } catch (e) { alert('Pega la URL completa del desk'); }
  }
  document.addEventListener('click', e => {
    if (e.target && (e.target.id === 'pairGo' || (e.target.closest && e.target.closest('#pairGo')))) {
      e.preventDefault();
      doPair($('#pair') && $('#pair').value);
      return;
    }
    const t = e.target.closest('[data-tab],[data-coin],.back,#retry,#logout'); if (!t) return;
    if (t.dataset.tab) { tab = t.dataset.tab; coin = null; document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === t)); scrollTo(0, 0); render(); }
    else if (t.dataset.coin) { coin = {mint: t.dataset.coin, data: null}; scrollTo(0, 0); render(); get('coin/' + coin.mint + '.json').then(d => { if (coin) { coin.data = d || {coin: {mint: coin.mint}}; render(); } }).catch(() => {}); }
    else if (t.classList.contains('back')) { coin = null; render(); }
    else if (t.id === 'retry') poll();
    else if (t.id === 'logout') { localStorage.clear(); location.replace(location.pathname); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target && e.target.id === 'pair') { e.preventDefault(); doPair(e.target.value); }
  });
  addEventListener('resize', render); render(); if (T && D) { poll(); setInterval(poll, 15000); }
})();
