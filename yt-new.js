// Vercel Serverless Function (ไฟล์เดียวทำ 2 หน้าที่)
//   GET /api/yt-new?day=YYYY-MM-DD   -> วิดีโอ YouTube ที่ติดแฮชแท็กของเว็บ ซึ่งเผยแพร่ในวันนั้น (เวลาไทย UTC+7)
//   GET /api/yt-new?ids=ID1,ID2,...  -> ยอดวิวของวิดีโอ (สูงสุด 50 ไอดี)
// Environment Variables ใน Vercel:  YT_API_KEY (จำเป็น)   YT_TAG (ไม่บังคับ เช่น #VocaloidQuiz)
const TAG = process.env.YT_TAG || '#VocaloidQuiz';
const API = 'https://www.googleapis.com/youtube/v3/';

async function views(req, res, key) {
  const ids = String(req.query.ids || '').split(',').filter(x => /^[\w-]{11}$/.test(x)).slice(0, 50);
  if (!ids.length) return res.status(400).json({ error: 'no_ids', views: {} });
  const u = new URL(API + 'videos');
  u.search = new URLSearchParams({ part: 'statistics', id: ids.join(','), maxResults: '50', key }).toString();
  const r = await fetch(u);
  if (!r.ok) return res.status(502).json({ error: 'upstream_' + r.status, views: {} });
  const j = await r.json();
  const out = {};
  (j.items || []).forEach(x => { if (x.statistics && x.statistics.viewCount != null) out[x.id] = Number(x.statistics.viewCount); });
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
  return res.status(200).json({ views: out });
}

async function byDay(req, res, key) {
  const day = String(req.query.day || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ error: 'bad_day' });
  const start = Date.parse(day + 'T00:00:00+07:00');
  if (isNaN(start)) return res.status(400).json({ error: 'bad_day' });
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  if (day > today) return res.status(400).json({ error: 'future' });
  const u = new URL(API + 'search');
  u.search = new URLSearchParams({
    part: 'snippet', type: 'video', order: 'date', maxResults: '50', videoEmbeddable: 'true',
    q: TAG, publishedAfter: new Date(start).toISOString(), publishedBefore: new Date(start + 864e5).toISOString(), key,
  }).toString();
  const r = await fetch(u);
  if (!r.ok) return res.status(502).json({ error: 'upstream_' + r.status, tag: TAG, items: [] });
  const j = await r.json();
  const items = (j.items || []).filter(x => x.id && x.id.videoId).map(x => ({
    id: x.id.videoId, title: x.snippet.title, channel: x.snippet.channelTitle, at: x.snippet.publishedAt,
  }));
  res.setHeader('Cache-Control', day === today ? 'public, s-maxage=900, stale-while-revalidate=1800' : 'public, s-maxage=86400');
  return res.status(200).json({ tag: TAG, day, items });
}

module.exports = async (req, res) => {
  const key = process.env.YT_API_KEY;
  if (!key) return res.status(503).json({ error: 'not_configured', tag: TAG, items: [], views: {} });
  try {
    if (req.query && req.query.ids) return await views(req, res, key);
    return await byDay(req, res, key);
  } catch (e) {
    return res.status(502).json({ error: 'fetch_failed', tag: TAG, items: [], views: {} });
  }
};
