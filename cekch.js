'use strict';

/**
 * CekCH — Scraper info Saluran (Channel) WhatsApp
 * Sumber : halaman publik https://www.whatsapp.com/channel/<id> (meta tag og:*)
 * Credit : @bilzxdev2k26
 *
 * Install : tidak perlu (Node 18+)
 * CLI     : node cekch.js <url saluran | id saluran> [--save] [--raw]
 * Opsi    : --save  download foto profil ke ./cekch_<id>.jpg (link foto cepat kedaluwarsa)
 *           --raw   sertakan data mentah meta tag
 * Module  : const { cekch } = require('./cekch');
 */

const fs = require('fs');

const CREDIT = '@bilzxdev2k26';
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

const wrap = (result) => ({ creator: CREDIT, status: true, result });
const fail = (err) => ({ creator: CREDIT, status: false, error: String(err?.message || err) });

/* ===================== HELPERS ===================== */

const decode = (s) =>
  String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

/** Ambil isi <meta property|name="key" content="..."> */
function meta(html, key) {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const a = html.match(new RegExp(`<meta\\s+(?:property|name)="${k}"\\s+content="([^"]*)"`, 'i'));
  if (a) return decode(a[1]);
  const b = html.match(new RegExp(`<meta\\s+content="([^"]*)"\\s+(?:property|name)="${k}"`, 'i'));
  return b ? decode(b[1]) : null;
}

/** URL / ID → ID saluran */
function toId(input) {
  const s = String(input || '').trim();
  const m = s.match(/channel\/([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

/** "7" / "1,2 rb" / "3,4 jt" / "1.2K" / "5M" → angka */
function parseCount(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^([\d.,]+)\s*([a-zA-Z]*)/);
  if (!m) return null;
  const unit = m[2].toLowerCase();
  const mult = { rb: 1e3, k: 1e3, ribu: 1e3, jt: 1e6, m: 1e6, juta: 1e6, b: 1e9 }[unit] || 1;
  let n = m[1];
  if (mult > 1) n = n.replace(',', '.'); // "1,2 rb" → 1.2
  else n = n.replace(/[.,]/g, ''); // "1.234" → 1234
  const v = parseFloat(n);
  return Number.isNaN(v) ? null : Math.round(v * mult);
}

async function getHtml(url) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8', Accept: 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(25000),
      });
      return { status: res.status, html: await res.text() };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 700));
    }
  }
  throw lastErr;
}

/* ===================== SCRAPER ===================== */

async function cekch(input, opts = {}) {
  try {
    const id = toId(input);
    if (!id) throw new Error('URL / ID saluran tidak valid. Contoh: https://whatsapp.com/channel/0029Vb8i3CwDOQIOifF4rj3K');

    const url = `https://www.whatsapp.com/channel/${id}`;
    const { status, html } = await getHtml(url);
    if (status === 404) throw new Error('Saluran tidak ditemukan (404)');

    const name = meta(html, 'og:title');
    const ogDesc = meta(html, 'og:description') || '';
    const image = meta(html, 'og:image');

    // Halaman saluran yang tidak valid biasanya tidak punya og:title khusus
    if (!name || /^whatsapp(\.com)?$/i.test(name) || !/channel\//.test(meta(html, 'og:url') || url)) {
      throw new Error('Saluran tidak ditemukan / link tidak valid');
    }

    // og:description: "Saluran • 7 pengikut • INI SALURAN BILAL"
    const parts = ogDesc.split('•').map((s) => s.trim()).filter(Boolean);
    const folPart = parts.find((p) => /(pengikut|followers?|seguidores|abonnés)/i.test(p)) || null;
    const folRaw = folPart ? folPart.replace(/\s*(pengikut|followers?|seguidores|abonnés).*$/i, '').trim() : null;
    const description = parts.filter((p) => p !== folPart && !/^(saluran|channel)$/i.test(p)).join(' • ') || null;

    // Foto profil + masa berlaku link (param "oe" = hex unix timestamp)
    let imageExpires = null;
    if (image) {
      const oe = image.match(/[?&]oe=([0-9a-f]+)/i);
      if (oe) imageExpires = new Date(parseInt(oe[1], 16) * 1000).toISOString();
    }

    const result = {
      id,
      name,
      description,
      followers: parseCount(folRaw),
      followersText: folRaw,
      photo: image || null,
      photoExpires: imageExpires,
      url: meta(html, 'og:url') || url,
      deepLink: `whatsapp://channel/${id}`,
      lang: (html.match(/<html[^>]*\blang="([^"]+)"/i) || [])[1] || null,
    };

    if (opts.save && image) {
      const res = await fetch(image, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
      if (!res.ok) throw new Error(`Gagal download foto (${res.status})`);
      const file = `cekch_${id}.jpg`;
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      result.savedAs = file;
    }

    if (opts.raw) result.raw = { ogTitle: name, ogDescription: ogDesc, metaDescription: meta(html, 'description') };
    return wrap(result);
  } catch (e) {
    return fail(e);
  }
}

module.exports = { cekch, CREDIT };

/* ===================== CLI ===================== */

if (require.main === module) {
  (async () => {
    const argv = process.argv.slice(2);
    const opts = {};
    const pos = [];
    for (const a of argv) {
      if (a === '--save') opts.save = true;
      else if (a === '--raw') opts.raw = true;
      else pos.push(a);
    }
    const out = pos.length
      ? await cekch(pos.join(' '), opts)
      : fail('Usage: node cekch.js <url saluran | id> [--save] [--raw]');
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.status ? 0 : 1);
  })();
}
