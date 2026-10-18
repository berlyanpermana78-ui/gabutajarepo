'use strict';

/**
 * SFile Search Scraper — https://sfile.co/search?q=
 * Hasil : JSON berisi link file (default 3, bisa diatur)
 * Credit: @bilzxdev2k26
 *
 * Install : tidak perlu (Node 18+)
 * CLI     : node sfile.js <kata kunci> [--limit 5] [--raw]
 *           node sfile.js search <kata kunci> [--limit 5]
 * Module  : const { search } = require('./sfile'); await search('minecraft', { limit: 5 });
 * Env     : SFILE_BASE  ganti domain kalau berubah (default https://sfile.co)
 */

const CREDIT = '@bilzxdev2k26';
const BASE = (process.env.SFILE_BASE || 'https://sfile.co').replace(/\/+$/, '');
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 50;
const MAX_PAGES = 6;

const wrap = (result) => ({ creator: CREDIT, status: true, result });
const fail = (err) => ({ creator: CREDIT, status: false, error: String(err?.message || err) + (err?.cause?.code ? ` [${err.cause.code}]` : '') });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ===================== HELPERS ===================== */

const decode = (s) =>
  String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const strip = (s) => decode(String(s || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Segmen path yang BUKAN halaman file */
const RESERVED = new Set([
  'latest', 'trends', 'search', 'signin', 'signup', 'privacy', 'terms', 'contact', 'memberpayment',
  'img', 'icon', 'css', 'js', 'login', 'register', 'about', 'dmca', 'api', 'user', 'upload', 'static', 'assets',
]);

const META_RE = /([\d.,]+\s*(?:B|KB|MB|GB|TB))\s*[•·|\-–]\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i;

async function getPage(url, log) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
        redirect: 'follow',
        signal: AbortSignal.timeout(25000),
      });
      const html = await res.text();
      log('GET', res.status, url, `(${html.length} char)`);
      return { status: res.status, html };
    } catch (e) {
      last = e;
      await sleep(700);
    }
  }
  throw last;
}

/** Ambil kartu file dari HTML: ikon + <a href="/<id>">nama</a> + "ukuran • tanggal" */
function parseCards(html) {
  const out = [];
  const re = /<a\b[^>]*href=["'](?:https?:\/\/(?:www\.)?sfile\.co)?\/([A-Za-z0-9]{8,14})["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    if (RESERVED.has(id.toLowerCase())) continue;

    let title = strip(m[2]);
    let size = null;
    let date = null;

    // kalau seluruh kartu dibungkus <a>, ukuran & tanggal ada di dalam teks anchor
    const inside = title.match(META_RE);
    if (inside) {
      title = title.slice(0, inside.index).trim();
      size = inside[1].replace(/\s+/g, ' ');
      date = inside[2];
    } else {
      const after = strip(html.slice(re.lastIndex, re.lastIndex + 500));
      const near = after.match(META_RE);
      if (near && near.index < 120) {
        size = near[1].replace(/\s+/g, ' ');
        date = near[2];
      }
    }
    if (!title || title.length < 2) continue;

    const before = html.slice(Math.max(0, m.index - 500), m.index);
    const icon = [...before.matchAll(/icon\/smallicon\/([a-z0-9_-]+)\.svg/gi)].pop()?.[1] || null;
    const ext = (title.match(/\.([A-Za-z0-9]{1,8})$/) || [])[1]?.toLowerCase() || null;

    out.push({
      id,
      title,
      url: `${BASE}/${id}`,
      size,
      date,
      type: ext || (icon && icon !== 'file' ? icon : null),
    });
  }
  return out;
}

/* ===================== SEARCH ===================== */

async function search(query, opts = {}) {
  const log = (...a) => opts.raw && console.error('[debug]', ...a);
  try {
    const q = String(query || '').trim();
    if (q.length < 2) throw new Error('Kata kunci minimal 2 karakter');
    const limit = Math.min(Math.max(parseInt(opts.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    const seen = new Map();
    let firstPage = null;
    let pagesRead = 0;

    for (let page = 1; page <= MAX_PAGES && seen.size < limit; page++) {
      const url = `${BASE}/search?q=${encodeURIComponent(q)}${page > 1 ? `&page=${page}` : ''}`;
      const { status, html } = await getPage(url, log);
      if (!firstPage) firstPage = { status, html };
      if (status >= 400) {
        if (page === 1) throw new Error(`Situs membalas HTTP ${status}${status === 403 ? ' (kemungkinan diblokir / proteksi bot)' : ''}`);
        break;
      }
      pagesRead++;

      const before = seen.size;
      for (const it of parseCards(html)) if (!seen.has(it.id)) seen.set(it.id, it);
      if (seen.size === before) break; // halaman ini tidak menambah hasil → berhenti
      if (page < MAX_PAGES && seen.size < limit) await sleep(400);
    }

    if (!seen.size) {
      const title = strip((firstPage?.html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]);
      log('halaman:', title, '|', strip(firstPage?.html || '').slice(0, 300));
      if (/no (results|files)|not found|tidak ada|0 results/i.test(strip(firstPage?.html || ''))) {
        throw new Error(`Tidak ada hasil untuk "${q}"`);
      }
      throw new Error(`Tidak ada hasil terbaca untuk "${q}" (judul halaman: "${title}"). Jalankan dengan --raw dan kirim outputnya kalau seharusnya ada hasil`);
    }

    const results = [...seen.values()].slice(0, limit);
    return wrap({
      query: q,
      limit,
      count: results.length,
      ...(results.length < limit ? { note: `Hanya ${results.length} hasil ditemukan (diminta ${limit})` } : {}),
      results,
    });
  } catch (e) {
    return fail(e);
  }
}

module.exports = { search, parseCards, CREDIT, BASE };

/* ===================== CLI ===================== */

if (require.main === module) {
  (async () => {
    const argv = process.argv.slice(2);
    if (argv[0] === 'search') argv.shift();
    const opts = {};
    const pos = [];
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--raw') opts.raw = true;
      else if (argv[i] === '--limit' || argv[i] === '-n') opts.limit = argv[++i];
      else pos.push(argv[i]);
    }
    const q = pos.join(' ').trim();
    const out = q ? await search(q, opts) : fail('Usage: node sfile.js <kata kunci> [--limit 5] [--raw]');
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.status ? 0 : 1);
  })();
}
