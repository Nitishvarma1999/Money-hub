// Vercel serverless function: GET /api/market
// Fetches live prices server-side (browsers can't call Yahoo directly) and lets Vercel's CDN cache the result:
//  - normal load : cached 6 h, then served instantly while refreshing in the background (so data is at most ~a day old)
//  - Refresh btn : the page adds ?v=<5-minute bucket>, so at most one real refresh per 5 minutes no matter how many people click
const { buildMarket } = require('../market-lib');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

module.exports = async (req, res) => {
  try {
    const fetchJson = async (url) => {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    };
    const data = await buildMarket(fetchJson);
    if (data.count < 10) throw new Error('Only ' + data.count + ' instruments loaded');
    const manual = /[?&](refresh|v)=/.test(req.url || '');
    res.setHeader('Cache-Control', manual ? 'public, s-maxage=300, stale-while-revalidate=60' : 'public, s-maxage=21600, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(JSON.stringify(data));
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: String(e && e.message || e) });
  }
};
