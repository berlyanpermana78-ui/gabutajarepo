'use strict';

/**
 * Yorunime Scraper — Home (ongoing) / Completed / Search / Detail / Stream
 * Situs  : https://www.yorunime.sbs  (API: /ajax/yorunime?action=...)
 * Credit : @bilzxdev2k26
 *
 * CLI    : node yorunime.js home [--page 2]
 *          node yorunime.js completed [--page 2]
 *          node yorunime.js search <judul>
 *          node yorunime.js detail <slug | url anime>
 *          node yorunime.js stream <episodeId | url>
 *          node yorunime.js genres
 * Opsi   : --raw (JSON mentah)  --all (jangan filter donghua/komik)  --page n
 * Env    : YORU_STREAM_ACTION  paksa nama action stream, mis. "episode"
 * Module : const { home, completed, search, detail, stream, genres } = require('./yorunime');
 */

const CREDIT = '@bilzxdev2k26';
const BASE = (process.env.YORU_BASE || 'https://www.yorunime.sbs').replace(/\/+$/, '');
const AJAX = BASE + '/ajax/yorunime';
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

const wrap = (result) => ({ creator: CREDIT, status: true, result });
const fail = (err) => ({ creator: CREDIT, status: false, error: String(err?.message || err) });

/* ===================== HELPERS ===================== */

const pick = (o, keys) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return null;
};

const absUrl = (p) => {
  if (!p) return null;
  const s = String(p);
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return 'https:' + s;
  return BASE + (s.startsWith('/') ? s : '/' + s);
};

const toSlug = (v) => {
  const s = String(v || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  return s.includes('/') ? s.split('/').pop() : s;
};

/** Panggil API internal. Retry 2x kalau jaringan putus. */
async function ajax(action, params = {}, page) {
  const qs = new URLSearchParams({ action, ...params });
  if (page) qs.set('page', page);
  const url = `${AJAX}?${qs}`;
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json', Referer: BASE + '/' },
        signal: AbortSignal.timeout(25000),
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { ok: res.ok && json && json.status !== 'error', status: res.status, data: json, url };
    } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 600)); }
  }
  throw lastErr;
}

async function must(action, params, page) {
  const r = await ajax(action, params, page);
  if (!r.ok) throw new Error(`action "${action}" gagal (${r.status}): ${r.data?.message || 'bukan JSON'}`);
  return r;
}

function findList(x, depth = 0) {
  if (!x || depth > 4) return null;
  if (Array.isArray(x)) return x.length && typeof x[0] === 'object' ? x : null;
  if (typeof x !== 'object') return null;
  const pref = ['animeList', 'data', 'results', 'items', 'list', 'anime', 'ongoing', 'latest'];
  for (const k of pref) { if (k in x) { const r = findList(x[k], depth + 1); if (r) return r; } }
  for (const k of Object.keys(x)) { const r = findList(x[k], depth + 1); if (r) return r; }
  return null;
}

/* ===================== MAPPING ===================== */

const NON_ANIME = /donghua|komik|comic|manga|manhwa|manhua|novel/i;

function isNonAnime(o) {
  const t = [pick(o, ['type', 'tipe', 'kind', 'category', 'provider']), o?.url, o?.link]
    .filter(Boolean).map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(' ');
  return NON_ANIME.test(t);
}

function mapAnime(o) {
  const slug = toSlug(pick(o, ['slug', 'animeId', 'id']) || pick(o, ['url', 'link', 'href']) || '') || null;
  const genres = pick(o, ['genres', 'genreList', 'genre']);
  return {
    title: pick(o, ['title', 'name', 'judul']),
    slug,
    url: slug ? `${BASE}/anime/${slug}` : absUrl(pick(o, ['url', 'link', 'href'])),
    cover: absUrl(pick(o, ['poster_url', 'poster', 'cover', 'image', 'thumbnail', 'thumb'])),
    type: pick(o, ['type', 'tipe']),
    status: pick(o, ['status']),
    episode: pick(o, ['episodes', 'episode', 'latestEpisode', 'totalEpisodes']),
    rating: pick(o, ['score', 'rating']),
    genres: Array.isArray(genres)
      ? genres.map((g) => (typeof g === 'object' ? pick(g, ['title', 'name']) : g)).filter(Boolean)
      : genres ? String(genres).split(/[,/]/).map((s) => s.trim()).filter(Boolean) : [],
  };
}

function findEpisodes(x, depth = 0) {
  if (!x || typeof x !== 'object' || depth > 5) return null;
  for (const k of Object.keys(x)) {
    if (/^(episodes?|episodeList|listEpisode|eps|chapters)$/i.test(k) && Array.isArray(x[k]) && x[k].length) return x[k];
  }
  for (const k of Object.keys(x)) {
    const r = findEpisodes(x[k], depth + 1);
    if (r) return r;
  }
  return null;
}

function mapEpisode(e) {
  if (typeof e !== 'object') return { title: String(e), number: null, episodeId: null };
  const id = pick(e, ['episodeId', 'id', 'slug']) || pick(e, ['url', 'link', 'href']);
  return {
    title: pick(e, ['title', 'name', 'judul', 'episodeTitle']),
    number: pick(e, ['number', 'episode', 'ep', 'eps', 'no']),
    episodeId: id ? toSlug(id) : null,
    url: absUrl(pick(e, ['url', 'link', 'href'])),
    date: pick(e, ['date', 'releasedAt', 'createdAt', 'updatedAt']),
  };
}

function collectStreams(x, out = [], ctx = {}, depth = 0) {
  if (!x || depth > 8) return out;
  if (Array.isArray(x)) { x.forEach((i) => collectStreams(i, out, ctx, depth + 1)); return out; }
  if (typeof x !== 'object') return out;
  const label = pick(x, ['server', 'name', 'label', 'quality', 'resolution', 'provider', 'title']);
  for (const [k, v] of Object.entries(x)) {
    if (typeof v === 'string' && /^(https?:)?\/\//i.test(v) && /(url|link|src|embed|iframe|stream|file|video|player|default)/i.test(k)) {
      const u = v.startsWith('//') ? 'https:' + v : v;
      out.push({ server: typeof label === 'string' ? label : ctx.label || null, type: /\.m3u8/i.test(u) ? 'hls' : /\.mp4/i.test(u) ? 'mp4' : 'embed', url: u });
    } else if (v && typeof v === 'object') {
      collectStreams(v, out, { label: typeof label === 'string' ? label : ctx.label }, depth + 1);
    }
  }
  const seen = new Set();
  return out.filter((s) => (seen.has(s.url) ? false : seen.add(s.url)));
}

/* ===================== SCRAPER ===================== */

function listResult(r, opts) {
  const list = findList(r.data?.data ?? r.data) || [];
  let items = list.map((o) => ({ o, a: mapAnime(o) })).filter(({ a }) => a.title || a.slug);
  if (!opts.all) items = items.filter(({ o }) => !isNonAnime(o));
  return { count: items.length, anime: items.map((i) => i.a), ...(opts.raw ? { raw: r.data } : {}) };
}

async function home(opts = {}) {
  try { return wrap(listResult(await must('ongoing', {}, opts.page), opts)); }
  catch (e) { return fail(e); }
}

async function completed(opts = {}) {
  try { return wrap(listResult(await must('completed', {}, opts.page), opts)); }
  catch (e) { return fail(e); }
}

async function search(q, opts = {}) {
  try {
    const query = String(q || '').trim();
    if (query.length < 2) throw new Error('Kata kunci minimal 2 karakter');
    const r = await must('search', { q: query }, opts.page);
    return wrap({ query, ...listResult(r, opts) });
  } catch (e) { return fail(e); }
}

async function genres(opts = {}) {
  try {
    const r = await must('genres');
    const list = findList(r.data?.data?.genreList) || r.data?.data?.genreList || [];
    return wrap({ count: list.length, genres: list, ...(opts.raw ? { raw: r.data } : {}) });
  } catch (e) { return fail(e); }
}

async function detail(slugOrUrl, opts = {}) {
  try {
    const slug = toSlug(slugOrUrl);
    if (!slug) throw new Error('Slug / URL anime kosong');
    const r = await must('detail', { slug });
    const root = r.data?.data && typeof r.data.data === 'object' ? r.data.data : r.data;
    const episodes = (findEpisodes(root) || []).map(mapEpisode);
    return wrap({
      ...mapAnime({ ...root, slug: root.slug || slug }),
      synopsis: pick(root, ['synopsis', 'sinopsis', 'description', 'overview']),
      studio: pick(root, ['studio', 'studios']),
      released: pick(root, ['released', 'year', 'releaseDate', 'aired']),
      totalEpisodes: episodes.length,
      episodes,
      ...(opts.raw ? { raw: r.data } : {}),
    });
  } catch (e) { return fail(e); }
}

/** Action stream belum pasti → coba beberapa kombinasi sampai ada link */
const STREAM_ACTIONS = ['episode', 'watch', 'stream', 'server', 'episode_detail', 'detail_episode'];
const STREAM_PARAMS = ['episodeId', 'slug', 'id'];
let streamCache = null;

async function stream(episodeIdOrUrl, opts = {}) {
  try {
    const id = toSlug(episodeIdOrUrl);
    if (!id) throw new Error('episodeId / URL episode kosong');
    const actions = process.env.YORU_STREAM_ACTION ? [process.env.YORU_STREAM_ACTION] : STREAM_ACTIONS;
    const combos = streamCache ? [streamCache] : actions.flatMap((a) => STREAM_PARAMS.map((p) => [a, p]));
    const tried = [];
    for (const [a, p] of combos) {
      const r = await ajax(a, { [p]: id });
      tried.push(`${r.status} ${a}&${p}`);
      if (!r.ok) continue;
      const streams = collectStreams(r.data);
      streamCache = [a, p];
      return wrap({
        action: `${a}&${p}`,
        episode: id,
        title: pick(r.data?.data || r.data, ['title', 'name', 'episodeTitle']),
        count: streams.length,
        streams,
        ...(opts.raw || !streams.length ? { raw: r.data } : {}),
      });
    }
    throw new Error(`Action stream tidak ketemu (dicoba: ${tried.join(' | ')}). Cek Network tab saat buka halaman /watch/<episodeId>.`);
  } catch (e) { return fail(e); }
}

module.exports = { home, completed, search, detail, stream, genres, CREDIT, BASE };

/* ===================== CLI ===================== */

if (require.main === module) {
  (async () => {
    const argv = process.argv.slice(2);
    const cmd = argv.shift();
    const opts = {};
    const pos = [];
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--raw') opts.raw = true;
      else if (argv[i] === '--all') opts.all = true;
      else if (argv[i] === '--page') opts.page = argv[++i];
      else pos.push(argv[i]);
    }
    const arg = pos.join(' ').trim();
    const cmds = { home, completed, genres, search: () => search(arg, opts), detail: () => detail(arg, opts), stream: () => stream(arg, opts) };
    const fn = cmds[cmd];
    const out = fn ? await fn(opts) : fail('Usage: node yorunime.js home | completed | genres | search <judul> | detail <slug|url> | stream <episodeId|url> [--raw] [--all] [--page n]');
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.status ? 0 : 1);
  })();
}
