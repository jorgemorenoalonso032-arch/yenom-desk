// Deterministic health checks. Uses synthetic timestamps only — does not fetch or decrypt payloads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const els = new Map();
function el() { return { innerHTML: '', textContent: '', className: '', value: '', classList: { toggle() {} } }; }
globalThis.localStorage = { getItem() { return null; }, setItem() {}, clear() {} };
globalThis.location = { search: '', hash: '', pathname: '/', origin: 'https://example.test', replace() {} };
globalThis.history = { replaceState() {} };
globalThis.scrollY = 0;
globalThis.scrollTo = () => {};
globalThis.addEventListener = () => {};
globalThis.alert = () => {};
globalThis.window = globalThis;
globalThis.document = {
  querySelector(sel) {
    if (sel === '#cv') return null;
    if (!els.has(sel)) els.set(sel, el());
    return els.get(sel);
  },
  addEventListener() {},
};
eval(src);
const { assess, agentCardHtml, parseTimeMs, render } = globalThis.DESK_HEALTH;

const NOW = 1_800_000_000_000;

function at(feedAgeS, agentAgeS, extra) {
  const snap = NOW - feedAgeS * 1000;
  const agent = snap - agentAgeS * 1000;
  return assess(Object.assign({ nowMs: NOW, snapshotTs: snap, agentTs: agent }, extra));
}

test('does not use wall-clock heartbeat and keeps the 15s poll', () => {
  assert.equal(src.includes('health(a.last)'), false);
  assert.match(src, /setInterval\(poll, 15000\)/);
  assert.match(src, /crypto\.subtle\.decrypt/);
  assert.equal(assess.toString().includes('Date.now'), false);
});

test('5min-old snapshot with a fresh-at-snapshot agent stays en marcha', () => {
  // Old rule painted this orange: wall age 300s is >=120 and <600 ("late").
  const wall = 300;
  assert.ok(wall >= 120 && wall < 600);
  const iso = '2026-01-15T00:00:00.123456+00:00';
  const snapMs = Date.parse('2026-01-15T00:00:00.123Z');
  assert.equal(parseTimeMs(iso), snapMs);
  const now = snapMs + 300000;
  const sec = snapMs / 1000;
  for (const snapshotTs of [sec, String(sec), snapMs, String(snapMs)]) {
    for (const agentTs of [iso, sec, String(sec), snapMs]) {
      const r = assess({ nowMs: now, snapshotTs, agentTs });
      assert.equal(r.observed, 'ok', JSON.stringify({ snapshotTs: typeof snapshotTs, agentTs: typeof agentTs }));
      assert.equal(r.feed, 'fresh');
      assert.equal(r.dot, 'ok');
      assert.equal(r.line, 'en marcha · corte hace 5 min');
      assert.equal(r.banner, 'Corte hace 5 min. El color es el estado en ese corte.');
      assert.ok(r.agentAgeSec < 1);
      assert.ok(Math.abs(r.feedAgeSec - 300) < 0.001);
    }
  }
});

test('fresh snapshot still flags an old or dead heartbeat', () => {
  const late = at(20, 180);
  assert.equal(late.feed, 'fresh');
  assert.equal(late.observed, 'late');
  assert.equal(late.dot, 'late');
  assert.equal(late.line, 'retrasado · corte hace 20 s');

  const dead = at(20, 700);
  assert.equal(dead.feed, 'fresh');
  assert.equal(dead.observed, 'dead');
  assert.equal(dead.dot, 'dead');
  assert.equal(dead.line, 'sin señal · corte hace 20 s');
  assert.match(dead.banner, /Corte hace 20 s/);
});

test('stale feed does not claim the agent is currently healthy', () => {
  const r = at(18 * 60, 0);
  assert.equal(r.observed, 'ok');
  assert.equal(r.feed, 'stale');
  assert.equal(r.dot, 'stale');
  assert.notEqual(r.dot, 'ok');
  assert.equal(r.line, 'último: en marcha · feed hace 18 min');
  assert.equal(r.banner, 'Feed atrasado (hace 18 min). No indica que los agentes sigan en marcha.');

  const stillDead = at(18 * 60, 700);
  assert.equal(stillDead.observed, 'dead');
  assert.equal(stillDead.dot, 'dead');
  assert.match(stillDead.line, /último: sin señal/);
});

test('missing and malformed timestamps are not healthy', () => {
  const now = NOW;
  const freshSnap = now - 10000;
  const missingAgent = assess({ nowMs: now, snapshotTs: freshSnap, agentTs: null });
  assert.equal(missingAgent.observed, 'unknown');
  assert.equal(missingAgent.feed, 'fresh');
  assert.equal(missingAgent.dot, 'dead');
  assert.equal(missingAgent.line, 'sin dato · corte hace 10 s');

  const missingSnap = assess({ nowMs: now, snapshotTs: undefined, agentTs: freshSnap });
  assert.equal(missingSnap.feed, 'unknown');
  assert.equal(missingSnap.dot, 'stale');
  assert.equal(missingSnap.line, 'último: sin dato · feed sin fecha');
  assert.match(missingSnap.banner, /Corte sin fecha válida/);

  for (const bad of [null, undefined, '', '   ', 'nope', '2026-13-99', NaN, Infinity, -5, 0, 1e8, {}, [], true, false]) {
    const r = assess({ nowMs: now, snapshotTs: bad, agentTs: bad });
    assert.notEqual(r.dot, 'ok');
    assert.equal(r.feed, 'unknown');
    assert.equal(r.observed, 'unknown');
  }
});

test('small clock skew counts as fresh and large future timestamps do not', () => {
  const now = NOW;
  const slight = assess({ nowMs: now, snapshotTs: now + 30000, agentTs: now + 60000 });
  assert.equal(slight.feed, 'fresh');
  assert.equal(slight.observed, 'ok');
  assert.equal(slight.dot, 'ok');
  assert.equal(slight.feedAgeSec, 0);
  assert.equal(slight.agentAgeSec, 0);
  assert.equal(slight.line, 'en marcha · corte ahora');

  const agentAhead = assess({ nowMs: now, snapshotTs: now - 10000, agentTs: now - 10000 + 3600000 });
  assert.equal(agentAhead.feed, 'fresh');
  assert.equal(agentAhead.observed, 'unknown');
  assert.equal(agentAhead.dot, 'dead');
  assert.match(agentAhead.line, /sin dato/);
  assert.doesNotMatch(agentAhead.line, /en marcha/);

  const snapAhead = assess({ nowMs: now, snapshotTs: now + 3600000, agentTs: now + 3600000 });
  assert.equal(snapAhead.feed, 'unknown');
  assert.equal(snapAhead.observed, 'ok');
  assert.equal(snapAhead.dot, 'stale');
  assert.notEqual(snapAhead.dot, 'ok');
  assert.match(snapAhead.banner, /sin fecha válida/);
});

test('offline and decrypt failures do not confirm a healthy agent', () => {
  const off = at(300, 0, { offline: true });
  assert.equal(off.observed, 'ok');
  assert.equal(off.feed, 'offline');
  assert.equal(off.dot, 'stale');
  assert.equal(off.line, 'último: en marcha · sin conexión · corte hace 5 min');
  assert.match(off.banner, /Sin conexión/);
  assert.match(off.banner, /No se confirma el estado actual/);

  const deadOff = at(20, 700, { offline: true });
  assert.equal(deadOff.dot, 'dead');
  assert.match(deadOff.line, /sin señal/);
  assert.match(deadOff.line, /sin conexión/);

  const decrypt = at(30, 0, { offline: true, offlineReason: 'decrypt' });
  assert.equal(decrypt.dot, 'stale');
  assert.match(decrypt.line, /no se pudo leer/);
  assert.doesNotMatch(decrypt.line, /sin conexión/);
  assert.match(decrypt.banner, /No se pudo leer/);
});

test('threshold edges stay on the old 120s and 600s cuts', () => {
  assert.equal(at(10, 119).dot, 'ok');
  assert.equal(at(10, 120).dot, 'late');
  assert.equal(at(10, 599).dot, 'late');
  assert.equal(at(10, 600).dot, 'dead');
  assert.equal(at(599, 0).feed, 'fresh');
  assert.equal(at(599, 0).dot, 'ok');
  assert.equal(at(600, 0).feed, 'stale');
  assert.equal(at(600, 0).dot, 'stale');
});

test('agent card escapes text and uses the assessed dot', () => {
  const html = agentCardHtml({ name: '<img>', stat: '"x"' }, { dot: 'ok', line: 'en marcha · corte hace 5 min' });
  assert.match(html, /class="dot ok"/);
  assert.match(html, /&lt;img&gt;/);
  assert.match(html, /&quot;x&quot;/);
  assert.equal(html.includes('<img>'), false);
  assert.match(html, /en marcha · corte hace 5 min/);
});

function paint(fx) {
  globalThis.DESK_FIXTURE = fx;
  render();
  return els.get('#view').innerHTML;
}

test('agents tab renders feed age and per-agent status from one snapshot', () => {
  const snapMs = Date.parse('2026-01-15T00:00:00.123Z');
  const html = paint({
    nowMs: snapMs + 300000,
    tab: 'agents',
    S: {
      mode: 'PAPER', ts: snapMs / 1000, agents: [
        { id: 'a', name: 'Fixture Alfa', stat: 'fixture', last: '2026-01-15T00:00:00.123456+00:00' },
        { id: 'b', name: 'Fixture Beta', stat: 'fixture', last: new Date(snapMs - 700000).toISOString() },
      ],
    },
  });
  assert.match(html, /id="feed-age"/);
  assert.match(html, /Corte hace 5 min/);
  assert.match(html, /dot ok[\s\S]*Fixture Alfa[\s\S]*en marcha · corte hace 5 min/);
  assert.match(html, /dot dead[\s\S]*Fixture Beta[\s\S]*sin señal · corte hace 5 min/);
  assert.equal(html.includes('dot late'), false);
  assert.equal(html.includes('heartbeat'), false);

  const stale = paint({
    nowMs: snapMs + 18 * 60 * 1000,
    tab: 'agents',
    S: { mode: 'PAPER', ts: snapMs / 1000, agents: [{ id: 'a', name: 'Fixture Alfa', stat: 'fixture', last: '2026-01-15T00:00:00.123456+00:00' }] },
  });
  assert.match(stale, /dot stale/);
  assert.match(stale, /último: en marcha · feed hace 18 min/);
  assert.match(stale, /Feed atrasado/);
  assert.equal(stale.includes('dot ok'), false);

  const offline = paint({
    nowMs: snapMs + 300000,
    tab: 'agents',
    err: 'Offline · HTTP 503',
    S: { mode: 'PAPER', ts: snapMs / 1000, agents: [{ id: 'a', name: 'Fixture Alfa', stat: 'fixture', last: '2026-01-15T00:00:00.123456+00:00' }] },
  });
  assert.match(offline, /Offline · HTTP 503/);
  assert.match(offline, /dot stale/);
  assert.match(offline, /sin conexión/);
  assert.equal(offline.includes('dot ok'), false);

  const missing = paint({
    nowMs: snapMs + 300000,
    tab: 'agents',
    S: { mode: 'PAPER', agents: [{ id: 'g', name: 'Fixture Gamma', stat: 'fixture' }] },
  });
  assert.match(missing, /Corte sin fecha válida/);
  assert.match(missing, /feed sin fecha/);
  assert.equal(missing.includes('dot ok'), false);
  globalThis.DESK_FIXTURE = null;
});
