'use strict';

/**
 * RFWeb2APK Scraper — Website → APK/AAB via rfweb2apk.rfdevv.com
 * Base API : https://rfweb2apk.rfdevv.com
 * Endpoint : POST /api/apk/build  (multipart/form-data)
 * Credit   : @bilzxdev2k26
 *
 * Install  : tidak perlu (pakai fetch/FormData bawaan Node 18+)
 * CLI      : node rfweb2apk.js build --name "My App" --pkg com.nama.app --url https://example.com [opsi]
 *            node rfweb2apk.js status
 *            node rfweb2apk.js me
 * Sumber   : --url <https://...>  |  --html <file.html>  |  --zip <web.zip>   (pilih salah satu)
 * Opsi     : --icon <png>              ikon aplikasi
 *            --version <1.0>           version name (default 1.0)
 *            --version-code <1-99>     default 1
 *            --format <apk|aab>        default apk (aab butuh Pro)
 *            --orientation <auto|portrait|landscape>
 *            --perm <izin>             ulangi/koma, mis. --perm CAMERA,VIBRATE
 *            --splash-image <png>  |  --splash-html <html>  |  --splash-video <mp4 maks 10MB>
 *            --out <folder>            download hasil ke folder ini
 *            --token <jwt>             token akun (atau env RF_TOKEN)
 * Contoh   : node rfweb2apk.js build --name "Goggle" --pkg com.bilzx.goggle.app --url https://example.com --icon ./logo.png --out ./dist
 * Module   : const { build, status, me } = require('./rfweb2apk');
 * Env      : RF_TOKEN=<token akun>  RF_BASE=<base lain>
 */

const fs = require('fs');
const path = require('path');

const CREDIT = '@bilzxdev2k26';
const BASE_URL = (process.env.RF_BASE || 'https://rfweb2apk.rfdevv.com').replace(/\/+$/, '');
const ENV_TOKEN = process.env.RF_TOKEN || '';
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const BUILD_TIMEOUT = 5 * 60 * 1000;

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.html': 'text/html', '.htm': 'text/html', '.mp4': 'video/mp4', '.webm': 'video/webm', '.zip': 'application/zip',
};

const wrap = (result) => ({ creator: CREDIT, status: true, result });
const fail = (err, extra = {}) => ({ creator: CREDIT, status: false, error: String(err?.message || err), ...extra });

/* ===================== HELPERS ===================== */

const abs = (p) => {
  if (!p) return null;
  const s = String(p);
  return /^https?:\/\//i.test(s) ? s : BASE_URL + (s.startsWith('/') ? s : '/' + s);
};

/** Baca file lokal → { blob, name } */
function fileBlob(p, label, maxMb) {
  const file = path.resolve(String(p));
  if (!fs.existsSync(file)) throw new Error(`File ${label} tidak ditemukan: ${p}`);
  const buf = fs.readFileSync(file);
  if (maxMb && buf.length > maxMb * 1024 * 1024) throw new Error(`File ${label} terlalu besar (maks ${maxMb} MB)`);
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  return { blob: new Blob([buf], { type }), name: path.basename(file) };
}

function headers(token) {
  const h = { 'User-Agent': UA, Accept: 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}

/** Parse respons JSON; kalau bukan JSON tampilkan potongan teksnya */
async function readJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text.slice(0, 200) }; }
}

function normPerm(list) {
  const out = [];
  for (const item of [].concat(list || [])) {
    for (const p of String(item).split(',')) {
      const s = p.trim();
      if (!s) continue;
      out.push(s.includes('.') ? s : 'android.permission.' + s.toUpperCase());
    }
  }
  return [...new Set(out)];
}

function explain(res, data) {
  const msg = data?.error || data?.message || data?._raw || `HTTP ${res.status}`;
  if (data?.ipBanned) return `IP diblokir oleh situs: ${msg}`;
  if (data?.code === 'LIMIT_REACHED' || (res.status === 429 && /limit/i.test(String(msg)))) {
    return `Limit build tercapai: ${msg} (guest 1x/hari, member 3x, pro 20x — login lewat RF_TOKEN untuk limit akun)`;
  }
  if (data?.code === 'PRO_ONLY') return `Fitur khusus ${data.requiredPlan || 'Pro'}: ${msg}`;
  return String(msg);
}

async function download(url, dir, fileName) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(BUILD_TIMEOUT) });
  if (!res.ok) throw new Error(`Gagal download hasil (HTTP ${res.status})`);
  const dest = path.join(path.resolve(dir), path.basename(fileName || 'app.apk'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

/* ===================== SCRAPER ===================== */

/** Cek status situs (normal / maintenance / error) */
async function status() {
  try {
    const res = await fetch(BASE_URL + '/api/web-status', { headers: headers(), signal: AbortSignal.timeout(20000) });
    const d = await readJson(res);
    if (!res.ok) throw new Error(explain(res, d));
    return wrap({ base: BASE_URL, ...d });
  } catch (err) {
    return fail(err);
  }
}

/** Info akun dari token (role, limit) */
async function me(token = ENV_TOKEN) {
  try {
    if (!token) throw new Error('Token kosong. Set RF_TOKEN atau pakai --token');
    const res = await fetch(BASE_URL + '/api/user/profile', { headers: headers(token), signal: AbortSignal.timeout(20000) });
    const d = await readJson(res);
    if (!res.ok || !d.success) throw new Error(explain(res, d));
    return wrap(d.user);
  } catch (err) {
    return fail(err);
  }
}

/**
 * Build APK/AAB dari website
 * @param {object} o {
 *   name, pkg, url | html | zip, icon, version, versionCode, format, orientation,
 *   permissions[], splashImage | splashHtml | splashVideo, out, token }
 */
async function build(o = {}) {
  try {
    const appName = String(o.name || '').trim();
    const pkg = String(o.pkg || '').trim();
    const token = o.token || ENV_TOKEN;
    const format = String(o.format || 'apk').toLowerCase();
    const orientation = String(o.orientation || 'auto').toLowerCase();

    if (!appName) throw new Error('Nama aplikasi wajib (--name)');
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(pkg)) throw new Error('Package name salah. Minimal 3 bagian huruf kecil, contoh: com.nama.app');
    if (!['apk', 'aab'].includes(format)) throw new Error('Format harus apk atau aab');
    if (!['auto', 'portrait', 'landscape'].includes(orientation)) throw new Error('Orientation: auto | portrait | landscape');

    const sources = [o.url, o.html, o.zip].filter(Boolean);
    if (sources.length !== 1) throw new Error('Pilih tepat satu sumber: --url, --html, atau --zip');
    if (o.url && !/^https?:\/\/\S+$/i.test(o.url)) throw new Error('URL tidak valid (harus diawali http/https)');

    let vc = parseInt(o.versionCode, 10);
    if (!Number.isFinite(vc) || vc < 1) vc = 1;
    if (vc > 99) vc = 99; // batas dari situsnya

    const fd = new FormData();
    fd.append('appName', appName);
    fd.append('packageName', pkg);
    fd.append('versionName', String(o.version || '1.0'));
    fd.append('versionCode', String(vc));
    fd.append('outputFormat', format);
    fd.append('orientation', orientation);

    if (o.url) fd.append('url', o.url);
    if (o.html) { const f = fileBlob(o.html, 'HTML', 5); fd.append('html', f.blob, f.name); }
    if (o.zip) { const f = fileBlob(o.zip, 'ZIP', 50); fd.append('zip', f.blob, f.name); }
    if (o.icon) { const f = fileBlob(o.icon, 'ikon', 5); fd.append('icon', f.blob, f.name); }

    const perms = normPerm(o.permissions);
    if (perms.length) fd.append('permissions', JSON.stringify(perms));

    // splash: image (default) | html | video
    if (o.splashHtml) {
      const f = fileBlob(o.splashHtml, 'splash HTML', 5);
      fd.append('splashType', 'html'); fd.append('splashHtml', f.blob, f.name);
    } else if (o.splashVideo) {
      const f = fileBlob(o.splashVideo, 'splash video', 10);
      fd.append('splashType', 'video'); fd.append('splashVideo', f.blob, f.name);
    } else {
      fd.append('splashType', 'image');
      if (o.splashImage) { const f = fileBlob(o.splashImage, 'splash image', 5); fd.append('splash', f.blob, f.name); }
    }

    const started = Date.now();
    const res = await fetch(BASE_URL + '/api/apk/build', {
      method: 'POST',
      body: fd,
      headers: headers(token),
      signal: AbortSignal.timeout(BUILD_TIMEOUT),
    });
    const d = await readJson(res);
    if (!res.ok || !d.success) throw new Error(explain(res, d));

    const downloadUrl = abs(d.downloadUrl);
    let saved = null;
    if (o.out && downloadUrl) saved = await download(downloadUrl, o.out, d.fileName);

    return wrap({
      app: { name: appName, packageName: pkg, versionName: String(o.version || '1.0'), versionCode: vc },
      format,
      source: o.url ? 'url' : o.html ? 'html' : 'zip',
      loggedIn: !!token,
      buildId: d.buildId || null,
      fileName: d.fileName || null,
      sizeBytes: d.size ?? null,
      sizeMB: d.size ? Number((d.size / 1048576).toFixed(2)) : null,
      downloadUrl,
      saved,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    const msg = String(err?.message || err);
    if (err?.name === 'TimeoutError' || /aborted|timeout/i.test(msg)) return fail('Build timeout (>5 menit)');
    if (/fetch failed/i.test(msg)) return fail('Koneksi ke server gagal / terputus. Build mungkin tetap selesai di server, coba cek lagi sebentar.');
    return fail(err);
  }
}

module.exports = { build, status, me, CREDIT, BASE_URL };

/* ===================== CLI ===================== */

if (require.main === module) {
  (async () => {
    const argv = process.argv.slice(2);
    const cmd = argv.shift();

    const o = { permissions: [] };
    const map = {
      '--name': 'name', '--pkg': 'pkg', '--url': 'url', '--html': 'html', '--zip': 'zip',
      '--icon': 'icon', '--version': 'version', '--version-code': 'versionCode',
      '--format': 'format', '--orientation': 'orientation', '--out': 'out', '--token': 'token',
      '--splash-image': 'splashImage', '--splash-html': 'splashHtml', '--splash-video': 'splashVideo',
    };
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === '--perm') o.permissions.push(argv[++i]);
      else if (map[a]) o[map[a]] = argv[++i];
    }

    let out;
    if (cmd === 'build') out = await build(o);
    else if (cmd === 'status') out = await status();
    else if (cmd === 'me') out = await me(o.token);
    else out = fail('Usage: node rfweb2apk.js build --name <nama> --pkg <com.x.y> (--url <url> | --html <file> | --zip <file>) [--icon png] [--format apk|aab] [--out ./dist] | status | me');

    console.log(JSON.stringify(out, null, 2));
    process.exit(out.status ? 0 : 1);
  })();
}