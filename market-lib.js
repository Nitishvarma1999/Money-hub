// Builds the market snapshot from Yahoo Finance chart data. Pure logic: the caller supplies fetchJson(url).
const INSTRUMENTS = require('./instruments');

const r2 = (x) => Math.round(x * 100) / 100;

function analyse(res) {
  const ts = res.timestamp || [];
  const q = (res.indicators.quote[0] || {}).close || [];
  const adj = res.indicators.adjclose && res.indicators.adjclose[0] ? res.indicators.adjclose[0].adjclose : null;
  const p = [], t = [];
  for (let i = 0; i < ts.length; i++) {
    const v = adj && adj[i] != null ? adj[i] : q[i];
    if (v != null && v > 0) { p.push(v); t.push(ts[i]); }
  }
  const n = p.length;
  if (n < 20) return null;
  const ret = (k) => (n > k ? r2((p[n - 1] / p[n - 1 - k] - 1) * 100) : null);
  const year = new Date().getUTCFullYear();
  let ytdIdx = 0;
  for (let i = 0; i < n; i++) { if (new Date(t[i] * 1000).getUTCFullYear() === year) { ytdIdx = Math.max(i - 1, 0); break; } }
  const lr = [];
  for (let i = 1; i < n; i++) lr.push(Math.log(p[i] / p[i - 1]));
  const mean = lr.reduce((a, b) => a + b, 0) / lr.length;
  const variance = lr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(lr.length - 1, 1);
  const vol = Math.round(Math.sqrt(variance) * Math.sqrt(252) * 1000) / 10;
  const spark = [];
  for (let i = Math.max(n - 90, 0); i < n; i += 3) spark.push(Math.round(p[i] * 1e4) / 1e4);
  spark.push(Math.round(p[n - 1] * 1e4) / 1e4);
  const days = Math.max((t[n - 1] - t[0]) / 86400, 1);
  return {
    ccy: res.meta.currency, px: res.meta.regularMarketPrice,
    d1: ret(1), w1: ret(5), m1: ret(21), m3: ret(63), m6: ret(126),
    y1: days > 300 ? r2((p[n - 1] / p[0] - 1) * 100) : null,
    ytd: r2((p[n - 1] / p[ytdIdx] - 1) * 100),
    vol, spark, last: new Date(t[n - 1] * 1000).toISOString().slice(0, 10),
  };
}

async function loadOne(inst, fetchJson) {
  const url = 'https://query2.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(inst.s) + '?range=1y&interval=1d';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const j = await fetchJson(url);
      const res = j && j.chart && j.chart.result && j.chart.result[0];
      const a = res && analyse(res);
      if (a) return Object.assign({}, inst, a);
    } catch (e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 300 * attempt));
  }
  return null;
}

async function buildMarket(fetchJson, opts) {
  const list = (opts && opts.instruments) || INSTRUMENTS;
  const limit = (opts && opts.concurrency) || 12;
  const out = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) { const i = next++; out[i] = await loadOne(list[i], fetchJson); }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  const items = out.filter(Boolean);
  const now = new Date();
  return { asOf: now.toISOString().slice(0, 10), fetchedAt: now.toISOString(), source: 'Yahoo Finance', count: items.length, items };
}

module.exports = { buildMarket, analyse, INSTRUMENTS };
