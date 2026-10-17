'use strict';

/**
 * AMFIN Scraper — AM Preset Finder (TikTok → preset links) + Search
 * Base API : https://www.amfin.my.id
 * Credit   : @bilzxdev2k26
 *
 * Install  : npm i axios
 * CLI      : node amfin.js find <url tiktok>
 *            node amfin.js search <nama musik>
 * Module   : const { find, search } = require('./amfin');
 */

const axios = require('axios');

const CREDIT = '@bilzxdev2k26';
const BASE_URL = 'https://www.amfin.my.id';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/* ===================== HELPERS ===================== */

const abs = (p) => {
  if (!p) return null;
  const s = String(p);
  return /^https?:\/\//i.test(s) ? s : BASE_URL + (s.startsWith('/') ? s : '/' + s);
};

/** Parse SSE ("event: x\ndata: {json}") → array object */
function parseSse(raw) {
  const out = [];
  for (const line of String(raw || '').split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const body = line.slice(6).trim();
    if (!body) continue;
    try { out.push(JSON.parse(body)); } catch { /* skip */ }
  }
  return out;
}

async function apiGet(path, timeout = 60000) {
  const res = await axios.get(BASE_URL + path, {
    timeout,
    headers: { 'User-Agent': UA, Accept: 'text/event-stream, application/json' },
    responseType: 'text',
    transformResponse: [(d) => d],
    validateStatus: () => true,
  });
  if (res.status >= 400) throw new Error(`API amfin HTTP ${res.status}`);
  return res.data;
}

/** presetLinks bisa string (search) atau object (find) → normalisasi */
function normPreset(p) {
  if (typeof p === 'string') return { url: p, type: null, title: null, detail: null, byAuthor: null };
  if (p && typeof p === 'object') {
    return {
      url: String(p.url || p.link || p.href || '').trim() || null,
      type: p.type || null,
      title: p.title || null,
      detail: p.detail || null,
      byAuthor: p.byAuthor ?? null,
    };
  }
  return { url: String(p), type: null, title: null, detail: null, byAuthor: null };
}

const wrap = (result) => ({ creator: CREDIT, status: true, result });
const fail = (err) => ({ creator: CREDIT, status: false, error: String(err?.message || err) });

/* ===================== SCRAPER ===================== */

/** Find preset dari URL video TikTok */
async function find(url) {
  try {
    if (!/^https?:\/\/\S+$/i.test(String(url || '').trim())) throw new Error('URL tidak valid');
    if (!/tiktok\.com|vt\.tiktok|douyin/i.test(url)) throw new Error('Hanya mendukung URL TikTok');

    const raw = await apiGet(`/api/find?url=${encodeURIComponent(url.trim())}`);
    const d = parseSse(raw).find((e) => e && typeof e === 'object' && 'ok' in e);
    if (!d) throw new Error('API amfin tidak mengembalikan data yang valid');
    if (!d.ok) throw new Error(d.error || 'Video tidak ditemukan / link tidak valid');

    const v = d.video || {};
    return wrap({
      platform: d.platform || 'tiktok',
      videoId: d.videoId || v.id || null,
      sourceUrl: d.sourceUrl || url,
      author: d.author || v.author || null,
      authorAvatar: d.authorDetail?.avatar || null,
      video: {
        id: v.id || null,
        description: v.description || null,
        cover: v.cover || null,
        embedUrl: v.embedUrl || null,
        width: v.width || null,
        height: v.height || null,
        playUrl: abs(v.playUrl),
        playUrlNoWm: abs(v.playUrlNoWm),
        stats: {
          views: v.stats?.views ?? null,
          likes: v.stats?.likes ?? null,
          comments: v.stats?.comments ?? null,
        },
      },
      presetLinks: (Array.isArray(d.presetLinks) ? d.presetLinks : []).filter(Boolean).map(normPreset),
    });
  } catch (err) {
    return fail(err);
  }
}

/** Search video preset berdasarkan nama musik */
async function search(query) {
  try {
    const q = String(query || '').trim();
    if (q.length < 2) throw new Error('Kata kunci minimal 2 karakter');

    const raw = await apiGet(`/api/search?q=${encodeURIComponent(q)}`);
    let d;
    try { d = JSON.parse(raw); } catch { throw new Error('Format respons search tidak dikenal'); }
    if (!d?.ok) throw new Error(d?.error || d?.message || 'Pencarian gagal');

    const list = Array.isArray(d.results) ? d.results : [];
    return wrap({
      query: q,
      count: d.count ?? list.length,
      results: list.map((r) => ({
        id: r.id || null,
        videoUrl: r.videoUrl || null,
        author: r.author || null,
        description: r.description || null,
        cover: r.cover || null,
        playUrl: abs(r.playUrl),
        stats: r.stats || {},
        presetLinks: (Array.isArray(r.presetLinks) ? r.presetLinks : []).filter(Boolean).map(normPreset),
      })),
    });
  } catch (err) {
    return fail(err);
  }
}

module.exports = { find, search, CREDIT, BASE_URL };

/* ===================== CLI ===================== */

if (require.main === module) {
  (async () => {
    const [cmd, ...rest] = process.argv.slice(2);
    const arg = rest.join(' ').trim();
    let out;

    if (cmd === 'find') out = await find(arg);
    else if (cmd === 'search') out = await search(arg);
    else out = fail('Usage: node amfin.js find <url tiktok> | node amfin.js search <nama musik>');

    console.log(JSON.stringify(out, null, 2));
    process.exit(out.status ? 0 : 1);
  })();
}