// Vercel Serverless Function — meneruskan request dari frontend ke Google Apps Script.
// Set environment variable GAS_URL di Vercel = URL Web App Apps Script (berakhiran /exec).
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method tidak diizinkan' });
  const url = process.env.GAS_URL;
  if (!url) return res.status(500).json({ ok: false, error: 'GAS_URL belum diatur di Vercel' });
  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow'
    });
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(await r.text());
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Gagal menghubungi Apps Script' });
  }
};
