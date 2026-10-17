'use strict';

/**
 * YouTube Search Scraper
 * Library  : yt-search
 * Credit   : @bilzxdev2k26
 *
 * Install  : npm i yt-search
 * CLI      : node ytsearch.js <kata kunci> [limit]
 * Contoh   : node ytsearch.js lagu phonk 5
 * Module   : const { ytsearch } = require('./ytsearch');
 *            const res = await ytsearch('lagu phonk', 5);
 */

const yts = require('yt-search');

const CREDIT = '@bilzxdev2k26';

const wrap = (result) => ({ creator: CREDIT, status: true, result });
const fail = (err) => ({ creator: CREDIT, status: false, error: String(err?.message || err) });

const fmtNum = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return v.toLocaleString('id-ID');
};

/** Normalisasi satu video hasil yt-search */
function mapVideo(v) {
  return {
    id: v.videoId || null,
    url: v.url || (v.videoId ? `https://www.youtube.com/watch?v=${v.videoId}` : null),
    title: v.title || null,
    description: v.description || null,
    thumbnail: v.thumbnail || v.image || null,
    info: {
      duration: v.timestamp || null,
      durationSeconds: v.seconds ?? v.duration?.seconds ?? null,
      views: v.views ?? null,
      viewsText: fmtNum(v.views),
      uploaded: v.ago || null,
    },
    creator: {
      name: v.author?.name || null,
      channelUrl: v.author?.url || null,
    },
  };
}

/**
 * Cari video YouTube
 * @param {string} query  kata kunci
 * @param {number} limit  jumlah hasil (default 10, maks 50)
 */
async function ytsearch(query, limit = 10) {
  try {
    const q = String(query || '').trim();
    if (q.length < 2) throw new Error('Kata kunci minimal 2 karakter');

    const max = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const data = await yts(q);
    const videos = (data?.videos || []).slice(0, max).map(mapVideo);

    if (!videos.length) throw new Error('Video tidak ditemukan');

    return wrap({
      query: q,
      count: videos.length,
      videos,
    });
  } catch (err) {
    return fail(err);
  }
}

module.exports = { ytsearch, CREDIT };

/* ===================== CLI ===================== */

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    let limit = 10;
    if (args.length > 1 && /^\d+$/.test(args[args.length - 1])) {
      limit = parseInt(args.pop(), 10);
    }
    const query = args.join(' ').trim();

    const out = query
      ? await ytsearch(query, limit)
      : fail('Usage: node ytsearch.js <kata kunci> [limit]');

    console.log(JSON.stringify(out, null, 2));
    process.exit(out.status ? 0 : 1);
  })();
}