'use strict';

/**
 * BGImg — hapus background lewat https://www.iloveimg.com/remove-background (tanpa API key)
 * Credit : @bilzxdev2k26
 * CLI    : node bgimg.js <file> [--out hasil.png] [--raw] [--v v1]
 * Module : const { bgimg } = require('./bgimg');
 */

const fs = require('fs');
const path = require('path');

const CREDIT = '@bilzxdev2k26';
const SITE = 'https://www.iloveimg.com';
const PAGE = SITE + '/remove-background';
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const wrap = (result) => ({ creator: CREDIT, status: true, result });
const fail = (err) => ({ creator: CREDIT, status: false, error: String(err?.message || err) + (err?.cause?.code ? ` [${err.cause.code}]` : '') });

/* ===================== HELPERS ===================== */

/** Ambil objek JSON yang mengikuti marker (tahan kutip/escape) */
function extractJson(text, marker) {
  const at = text.indexOf(marker);
  if (at === -1) return null;
  const start = text.indexOf('{', at);
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  return null;
}

const normServer = (s, site = 'iloveimg') => {
  let v = typeof s === 'string' ? s : s?.url || s?.host || s?.server || '';
  if (!v) return null;
  v = v.trim();
  // nama pendek ("api4g") → "api4g.iloveimg.com"
  if (!/^https?:\/\//i.test(v) && !v.includes('.')) v += `.${site}.com`;
  return (/^https?:\/\//i.test(v) ? v : 'https://' + v).replace(/\/+$/, '');
};

const brief = (t) => String(t).slice(0, 300).replace(/\s+/g, ' ');

/* ===================== FLOW ===================== */

async function bgimg(file, opts = {}) {
  const log = (...a) => opts.raw && console.error('[debug]', ...a);
  try {
    if (!file || !fs.existsSync(file)) throw new Error(`File tidak ditemukan: ${file}`);
    const ext = path.extname(file).toLowerCase();
    if (!MIME[ext]) throw new Error('Format harus jpg / png / webp');
    const filename = path.basename(file);
    const v = opts.v || 'v1';

    // 1) halaman → config + taskId
    const res = await fetch(PAGE, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(25000) });
    const html = await res.text();
    const cfg = extractJson(html, 'var ilovepdfConfig');
    if (!cfg?.token) throw new Error(`Config/token tidak ketemu di halaman (status ${res.status})`);
    const taskId = (html.match(/ilovepdfConfig\.taskId\s*=\s*['"]([^'"]+)['"]/) || [])[1] || cfg.taskId;
    if (!taskId) throw new Error('taskId tidak ketemu');
    const tool = cfg.tool || 'removebackgroundimage';

    let servers = [];
    for (const s of [cfg.workerServer, cfg.startServer, ...(Array.isArray(cfg.servers) ? cfg.servers : Object.values(cfg.servers || {}))]) {
      const n = normServer(s, cfg.site || 'iloveimg');
      if (n && !servers.includes(n)) servers.push(n);
    }
    log('config keys:', Object.keys(cfg).filter((k) => k !== 'fileLimits').join(','));
    log('tool:', tool, '| taskId len:', taskId.length, '| servers:', servers.join(' '));
    if (!servers.length) throw new Error('Daftar server tidak ada di config (lihat debug: config keys)');
    // jalur cadangan milik situs (changeDNSServer): api4g.iloveimg.com → api4g-cf.iloveimg.com
    const cf = servers.map((s) => s.replace('.', '-cf.'));
    servers = opts.cf ? cf : [...servers, ...cf];
    log('urutan server:', servers.join(' '));

    const auth = { Authorization: `Bearer ${cfg.token}`, 'User-Agent': UA, Origin: SITE, Referer: PAGE };
    const errors = [];

    for (const server of servers) {
      const base = `${server}/${v}`;
      try {
        // 2) upload
        const form = new FormData();
        form.append('name', filename);
        form.append('chunk', '0');
        form.append('chunks', '1');
        form.append('task', taskId);
        form.append('preview', '1');
        form.append('file', new Blob([fs.readFileSync(file)], { type: MIME[ext] }), filename);
        const up = await fetch(`${base}/upload`, { method: 'POST', headers: { ...auth, Accept: 'application/json' }, body: form, signal: AbortSignal.timeout(90000) });
        const upText = await up.text();
        log(`upload ${base} →`, up.status, brief(upText));
        let upJson = null;
        try { upJson = JSON.parse(upText); } catch {}
        if (!up.ok || !upJson?.server_filename) { errors.push(`${server} upload ${up.status}: ${brief(upText)}`); continue; }

        // 3) process
        const body = { task: taskId, tool, files: [{ server_filename: upJson.server_filename, filename }] };
        const pr = await fetch(`${base}/process`, {
          method: 'POST',
          headers: { ...auth, Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(120000),
        });
        const prText = await pr.text();
        log(`process →`, pr.status, brief(prText));
        if (!pr.ok) { errors.push(`${server} process ${pr.status}: ${brief(prText)}`); continue; }

        // 4) download
        const dl = await fetch(`${base}/download/${taskId}`, { headers: auth, signal: AbortSignal.timeout(120000) });
        const ct = dl.headers.get('content-type') || '';
        log(`download →`, dl.status, ct);
        if (!dl.ok) { errors.push(`${server} download ${dl.status}`); continue; }
        const buf = Buffer.from(await dl.arrayBuffer());
        const guess = /png/i.test(ct) ? '.png' : /zip/i.test(ct) ? '.zip' : /jpe?g/i.test(ct) ? '.jpg' : '.bin';
        const out = opts.out || `nobg_${Date.now()}${guess}`;
        fs.writeFileSync(out, buf);
        return wrap({ server, file: out, bytes: buf.length, contentType: ct });
      } catch (e) {
        errors.push(`${server} ${e.message}${e.cause?.code ? ` [${e.cause.code}]` : ''}`);
      }
    }
    throw new Error('Semua server gagal:\n- ' + errors.join('\n- '));
  } catch (e) {
    return fail(e);
  }
}

module.exports = { bgimg, CREDIT };

/* ===================== CLI ===================== */

if (require.main === module) {
  (async () => {
    const argv = process.argv.slice(2);
    const opts = {};
    const pos = [];
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--out') opts.out = argv[++i];
      else if (argv[i] === '--v') opts.v = argv[++i];
      else if (argv[i] === '--raw') opts.raw = true;
      else if (argv[i] === '--cf') opts.cf = true;
      else pos.push(argv[i]);
    }
    const out = pos.length ? await bgimg(pos.join(' '), opts) : fail('Usage: node bgimg.js <file> [--out hasil.png] [--raw] [--v v1]');
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.status ? 0 : 1);
  })();
}
