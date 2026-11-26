// Vercel Serverless Function: GET /api/yt-new?day=YYYY-MM-DD
// ดึงวิดีโอ YouTube ที่ติดแฮชแท็กของเว็บ (ค่าเริ่มต้น #VocaloidQuiz) ซึ่งเผยแพร่ในวันนั้น (เวลาไทย UTC+7)
// ตั้ง Environment Variables ใน Vercel:  YT_API_KEY (จำเป็น)   YT_TAG (ไม่บังคับ เช่น #VocaloidQuiz)
const TAG = process.env.YT_TAG || '#VocaloidQuiz';

module.exports = async (req, res) => {
  const key = process.env.YT_API_KEY;
  if (!key) return res.status(503).json({ error: 'not_configured', tag: TAG, items: [] });
  const day = String((req.query && req.query.day) || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ error: 'bad_day' });
  const start = Date.parse(day + 'T00:00:00+07:00');
  if (isNaN(start)) return res.status(400).json({ error: 'bad_day' });
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  if (day > today) return res.status(400).json({ error: 'future' });
  const end = start + 864e5;
  const u = new URL('https://www.googleapis.com/youtube/v3/search');
  u.search = new URLSearchParams({
    part: 'snippet', type: 'video', order: 'date', maxResults: '50', videoEmbeddable: 'true',
    q: TAG, publishedAfter: new Date(start).toISOString(), publishedBefore: new Date(end).toISOString(), key,
  }).toString();
  try {
    const r = await fetch(u);
    if (!r.ok) return res.status(502).json({ error: 'upstream_' + r.status, tag: TAG, items: [] });
    const j = await r.json();
    const items = (j.items || []).filter(x => x.id && x.id.videoId).map(x => ({
      id: x.id.videoId, title: x.snippet.title, channel: x.snippet.channelTitle, at: x.snippet.publishedAt,
    }));
    res.setHeader('Cache-Control', day === today ? 'public, s-maxage=900, stale-while-revalidate=1800' : 'public, s-maxage=86400');
    return res.status(200).json({ tag: TAG, day, items });
  } catch (e) {
    return res.status(502).json({ error: 'fetch_failed', tag: TAG, items: [] });
  }
};
