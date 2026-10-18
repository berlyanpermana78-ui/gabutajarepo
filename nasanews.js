'use strict';

/**
 * NASA News Scraper — berita terbaru dari https://www.nasa.gov/news/
 * Situs  : WordPress → sumber dicoba berurutan: REST API → RSS → HTML (fallback)
 * Credit : @bilzxdev2k26
 *
 * Install : tidak perlu (Node 18+)
 * CLI     : node nasanews.js latest [--limit 10] [--page 2] [--source rest|rss|html] [--type <slug>]
 *           node nasanews.js search <kata> [--limit 10]
 *           node nasanews.js detail <url artikel>
 *           node nasanews.js types          (daftar post type REST, buat debug)
 * Opsi    : --raw  tampilkan log debug ke stderr
 * Env     : NASA_BASE  ganti situs, mis. https://science.nasa.gov
 * Module  : const { latest, search, detail, types } = require('./nasanews');
 */

const CREDIT = '@bilzxdev2k26';
const BASE = (process.env.NASA_BASE || 'https://www.nasa.gov').replace(/\/+$/, '');
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

const wrap = (result) => ({ creator: CREDIT, status: true, result });
const fail = (err) => ({ creator: CREDIT, status: false, error: String(err?.message || err) + (err?.cause?.code ? ` [${err.cause.code}]` : '') });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ===================== HELPERS ===================== */

const decode = (s) =>
  String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const strip = (s) =>
  decode(String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

async function get(url, accept = '*/*', log = () => {}) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(25000),
      });
      const text = await res.text();
      log(res.status, url);
      return { status: res.status, ok: res.ok, text };
    } catch (e) {
      last = e;
      await sleep(600);
    }
  }
  throw last;
}

const toIso = (d) => {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
};

function dedupeSort(items) {
  const map = new Map();
  for (const it of items) if (it.url && !map.has(it.url)) map.set(it.url, it);
  const arr = [...map.values()];
  const dated = arr.filter((x) => x.date).sort((a, b) => new Date(b.date) - new Date(a.date));
  return [...dated, ...arr.filter((x) => !x.date)];
}

/* ===================== SUMBER 1: REST API ===================== */

async function viaRest(o, log) {
  const types = o.type ? [o.type] : ['news-release', 'posts'];
  const out = [];
  const tried = [];
  for (const t of types) {
    const qs = new URLSearchParams({
      per_page: String(Math.min(o.limit, 100)),
      page: String(o.page || 1),
      orderby: 'date',
      order: 'desc',
      _embed: 'wp:featuredmedia',
    });
    if (o.q) qs.set('search', o.q);
    try {
      const r = await get(`${BASE}/wp-json/wp/v2/${t}?${qs}`, 'application/json', log);
      tried.push(`${r.status} ${t}`);
      let j;
      try { j = JSON.parse(r.text); } catch { continue; }
      if (!r.ok || !Array.isArray(j)) continue;
      for (const p of j) {
        out.push({
          id: p.id,
          title: strip(p.title?.rendered),
          date: p.date_gmt ? toIso(p.date_gmt + 'Z') : toIso(p.date),
          url: p.link,
          summary: strip(p.excerpt?.rendered).slice(0, 400) || null,
          image: p._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
          type: p.type || t,
        });
      }
    } catch (e) {
      tried.push(`ERR ${t}`);
    }
  }
  if (!out.length) throw new Error(`REST kosong/ditolak (${tried.join(' | ')})`);
  return out;
}

/* ===================== SUMBER 2: RSS ===================== */

async function viaRss(o, log) {
  const out = [];
  const tried = [];
  for (const f of ['/news-release/feed/', '/feed/']) {
    try {
      const r = await get(BASE + f, 'application/rss+xml, application/xml, text/xml', log);
      tried.push(`${r.status} ${f}`);
      if (!r.ok || !/<item[\s>]/i.test(r.text)) continue;
      for (const m of r.text.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
        const b = m[1];
        const tag = (n) => {
          const x = b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`, 'i'));
          return x ? strip(x[1]) : null;
        };
        const img = (b.match(/<(?:media:content|media:thumbnail|enclosure)[^>]+url="([^"]+)"/i) || [])[1] || null;
        out.push({
          id: null,
          title: tag('title'),
          date: tag('pubDate') ? toIso(tag('pubDate')) : null,
          url: tag('link') || (b.match(/<guid[^>]*>([^<]+)</i) || [])[1] || null,
          summary: (tag('description') || '').slice(0, 400) || null,
          image: img,
          type: 'rss',
        });
      }
    } catch (e) {
      tried.push(`ERR ${f}`);
    }
  }
  if (!out.length) throw new Error(`RSS kosong/ditolak (${tried.join(' | ')})`);
  return out;
}

/* ===================== SUMBER 3: HTML (cadangan) ===================== */

const KIND = /^(News Release|Blog|Article|Feature|Image Article|Press Release|Video|Podcast|Release)$/i;

async function viaHtml(o, log) {
  const map = new Map();
  for (const p of ['/news/', '/news/recently-published/']) {
    try {
      const r = await get(BASE + p, 'text/html', log);
      if (!r.ok) continue;
      for (const m of r.text.matchAll(/<a\b[^>]*href="(https?:\/\/[a-z.]*nasa\.gov\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const t = strip(m[2]);
        if (!/min\s*read/i.test(t)) continue; // hanya kartu artikel, bukan menu
        let title;
        const mm = t.match(/^(.*?)\s*\d+\s*min\s*read\s*(.*)$/i);
        if (mm && KIND.test(mm[1].trim())) title = mm[2];
        else if (mm && mm[1].length > 10) title = mm[1];
        else title = t;
        title = title.replace(/\s*(article|news release|blog)?\s*\d+\s+\w+\s+ago\s*$/i, '').trim();
        if (title.length < 10 || map.has(m[1])) continue;
        const ago = (t.match(/(\d+\s+\w+\s+ago)\s*$/i) || [])[1] || null;
        map.set(m[1], { id: null, title, date: null, ago, url: m[1], summary: null, image: null, type: 'html' });
      }
    } catch {}
  }
  if (!map.size) throw new Error('HTML: tidak ada kartu artikel ditemukan');
  return [...map.values()];
}

/* ===================== API ===================== */

async function latest(opts = {}) {
  const log = (...a) => opts.raw && console.error('[debug]', ...a);
  try {
    const o = {
      limit: Math.max(1, Math.min(parseInt(opts.limit, 10) || 10, 50)),
      page: opts.page,
      type: opts.type,
      q: opts.q,
    };
    const order = opts.source ? [opts.source] : ['rest', 'rss', 'html'];
    const impl = { rest: viaRest, rss: viaRss, html: viaHtml };
    const errs = [];
    for (const s of order) {
      if (!impl[s]) { errs.push(`${s}: sumber tidak dikenal`); continue; }
      try {
        const items = dedupeSort(await impl[s](o, log)).slice(0, o.limit);
        return wrap({ source: s, base: BASE, count: items.length, news: items });
      } catch (e) {
        errs.push(`${s}: ${e.message}`);
        log('gagal', s, e.message);
      }
    }
    throw new Error('Semua sumber gagal:\n- ' + errs.join('\n- '));
  } catch (e) {
    return fail(e);
  }
}

async function search(q, opts = {}) {
  const query = String(q || '').trim();
  if (query.length < 2) return fail('Kata kunci minimal 2 karakter');
  return latest({ ...opts, q: query, source: opts.source || 'rest' });
}

async function detail(url, opts = {}) {
  const log = (...a) => opts.raw && console.error('[debug]', ...a);
  try {
    if (!/^https?:\/\/([a-z0-9-]+\.)*nasa\.gov\//i.test(String(url || ''))) throw new Error('URL harus dari *.nasa.gov');
    const r = await get(url, 'text/html', log);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const meta = (k) => {
      const kk = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = r.text.match(new RegExp(`<meta\\s+(?:property|name)="${kk}"\\s+content="([^"]*)"`, 'i'))
        || r.text.match(new RegExp(`<meta\\s+content="([^"]*)"\\s+(?:property|name)="${kk}"`, 'i'));
      return m ? decode(m[1]) : null;
    };
    const main = (r.text.match(/<main[\s\S]*?<\/main>/i) || [r.text])[0];
    const paragraphs = [...main.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => strip(m[1])).filter((t) => t.length > 40).slice(0, 80);
    return wrap({
      url,
      title: meta('og:title') || strip((r.text.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]),
      description: meta('og:description') || meta('description'),
      image: meta('og:image'),
      published: meta('article:published_time') || meta('parsely-pub-date'),
      modified: meta('article:modified_time'),
      author: meta('parsely-author') || meta('author'),
      paragraphs: paragraphs.length,
      content: paragraphs,
    });
  } catch (e) {
    return fail(e);
  }
}

async function types(opts = {}) {
  const log = (...a) => opts.raw && console.error('[debug]', ...a);
  try {
    const r = await get(`${BASE}/wp-json/wp/v2/types`, 'application/json', log);
    const j = JSON.parse(r.text);
    return wrap(Object.values(j).map((t) => ({ slug: t.slug, name: t.name, rest_base: t.rest_base })));
  } catch (e) {
    return fail(e);
  }
}

module.exports = { latest, search, detail, types, CREDIT, BASE };

/* ===================== CLI ===================== */

if (require.main === module) {
  (async () => {
    const argv = process.argv.slice(2);
    const cmd = argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'latest';
    const opts = {};
    const pos = [];
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--raw') opts.raw = true;
      else if (argv[i] === '--limit') opts.limit = argv[++i];
      else if (argv[i] === '--page') opts.page = argv[++i];
      else if (argv[i] === '--source') opts.source = argv[++i];
      else if (argv[i] === '--type') opts.type = argv[++i];
      else pos.push(argv[i]);
    }
    const arg = pos.join(' ').trim();
    const fns = {
      latest: () => latest(opts),
      search: () => search(arg, opts),
      detail: () => detail(arg, opts),
      types: () => types(opts),
    };
    const out = fns[cmd] ? await fns[cmd]() : fail('Usage: node nasanews.js latest|search <kata>|detail <url>|types [--limit n] [--page n] [--source rest|rss|html] [--type slug] [--raw]');
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.status ? 0 : 1);
  })();
}
