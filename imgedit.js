'use strict';

/**
 * Image Edit Scraper — HuggingFace Space (Qwen Image Edit, image to image)
 * Space    : prithivMLmods/Qwen-Image-Edit-Object-Manipulator
 * Endpoint : /edit_image  (images_b64_json, prompt, lora_adapter, seed,
 *                          randomize_seed, guidance_scale, steps)
 * Credit   : @bilzxdev2k26
 *
 * Install  : npm i @gradio/client      (Node 18+)
 * CLI      : node imgedit.js info
 *            node imgedit.js loras
 *            node imgedit.js edit <gambar> <prompt> [opsi]
 * Opsi     : --out hasil.png   simpan hasil
 *            --lora <nama>     adapter LoRA (default: otomatis dari daftar Space)
 *            --seed <n>        seed (default 0)
 *            --no-random       matikan randomize seed
 *            --guidance <n>    guidance scale (default 1)
 *            --steps <n>       jumlah steps (default 4)
 *            --api /nama       endpoint lain (default /edit_image)
 * Contoh   : node imgedit.js loras
 *            node imgedit.js edit images.png "remove the person" --out hasil.png
 * Module   : const { edit, info, loras } = require('./imgedit');
 * Env      : SPACE_URL=<url/owner-nama space lain>
 *            HF_TOKEN=hf_xxx (opsional, kalau kena limit GPU)
 */

const fs = require('fs');
const path = require('path');

const CREDIT = '@bilzxdev2k26';
const SPACE = process.env.SPACE_URL || 'https://prithivmlmods-qwen-image-edit-object-manipulator.hf.space';
const HF_TOKEN = process.env.HF_TOKEN || undefined;

const DEFAULTS = { api: '/edit_image', lora: 'Qwen-Image-Edit-2511-Object-Remover', seed: 0, randomize: true, guidance: 1.0, steps: 4 };
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const wrap = (result) => ({ creator: CREDIT, status: true, result });
const fail = (err) => ({ creator: CREDIT, status: false, error: String(err?.message || err) });

/* ===================== HELPERS ===================== */

let _lib;
async function lib() {
  if (!_lib) _lib = await import('@gradio/client'); // package ESM → dynamic import
  return _lib;
}

async function connect() {
  const { Client } = await lib();
  return Client.connect(SPACE, HF_TOKEN ? { hf_token: HF_TOKEN } : {});
}

/** URL dasar Space (untuk fetch /config) */
function baseUrl() {
  if (/^https?:\/\//i.test(SPACE)) return SPACE.replace(/\/+$/, '');
  const [owner, name] = SPACE.split('/');
  return `https://${owner}-${name}`.toLowerCase().replace(/[._]/g, '-') + '.hf.space';
}

/** Baca gambar dari URL atau path lokal → { buf, mime, name } */
async function loadImage(src) {
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Gagal download gambar (HTTP ${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = String(res.headers.get('content-type') || '').split(';')[0];
    let name = 'image.jpg';
    try { name = path.basename(new URL(src).pathname) || name; } catch { /* abaikan */ }
    const mime = ct.startsWith('image/') ? ct : MIME[path.extname(name).toLowerCase()];
    if (!mime) throw new Error('URL bukan gambar (content-type: ' + (ct || '-') + ')');
    return { buf, mime, name };
  }
  if (!fs.existsSync(src)) throw new Error('File tidak ditemukan: ' + src);
  const mime = MIME[path.extname(src).toLowerCase()];
  if (!mime) throw new Error('File bukan gambar (harus .jpg / .png / .webp): ' + src);
  return { buf: fs.readFileSync(src), mime, name: path.basename(src) };
}

/** Format images_b64_json — "data-uri" terbukti diterima server, sisanya cadangan */
function payloadVariants(img) {
  const b64 = img.buf.toString('base64');
  const obj = [{ data: b64, mime_type: img.mime, orig_name: img.name }];
  return [
    { name: 'data-uri', value: JSON.stringify([`data:${img.mime};base64,${b64}`]) },
    { name: 'object-json', value: JSON.stringify(obj) },
    { name: 'object-array', value: obj },
  ];
}

/** Ambil daftar pilihan dropdown dari config Space */
function parseDropdowns(components) {
  const out = [];
  for (const c of components || []) {
    if (!/dropdown|radio/i.test(String(c.type))) continue;
    const choices = (c.props?.choices || [])
      .map((x) => (Array.isArray(x) ? (x[1] ?? x[0]) : x))
      .map(String);
    if (choices.length) out.push({ label: c.props?.label || null, choices });
  }
  return out;
}

/** Daftar adapter LoRA yang tersedia di Space */
async function getLoras(client) {
  let drops = parseDropdowns(client?.config?.components);
  if (!drops.length) {
    try {
      const res = await fetch(baseUrl() + '/config', {
        headers: HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {},
      });
      if (res.ok) drops = parseDropdowns((await res.json())?.components);
    } catch { /* abaikan */ }
  }
  const pick = drops.find((d) => /lora|adapter/i.test(String(d.label))) || drops[0];
  return pick ? pick.choices : [];
}

/** Ambil gambar dari output Space (url / data-uri / base64), rekursif */
function extractImages(x, out = []) {
  if (x == null) return out;
  if (typeof x === 'string') {
    const s = x.trim();
    if (/^https?:\/\//i.test(s)) out.push({ type: 'url', value: s });
    else if (/^data:image\/[a-z+]+;base64,/i.test(s)) out.push({ type: 'b64', value: s.split(',')[1] });
    else if (/^[A-Za-z0-9+/=\s]{500,}$/.test(s)) out.push({ type: 'b64', value: s.replace(/\s/g, '') });
    else if (s.startsWith('[') || s.startsWith('{')) {
      try { extractImages(JSON.parse(s), out); } catch { /* bukan JSON */ }
    }
    return out;
  }
  if (Array.isArray(x)) { x.forEach((i) => extractImages(i, out)); return out; }
  if (typeof x === 'object') {
    if (typeof x.url === 'string') out.push({ type: 'url', value: x.url });
    else Object.values(x).forEach((v) => extractImages(v, out));
  }
  return out;
}

async function saveImage(img, file) {
  if (img.type === 'b64') {
    fs.writeFileSync(file, Buffer.from(img.value, 'base64'));
  } else {
    const res = await fetch(img.value);
    if (!res.ok) throw new Error(`Gagal download hasil (HTTP ${res.status})`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return file;
}

/* ===================== SCRAPER ===================== */

/** Lihat daftar endpoint + parameter Space */
async function info() {
  try {
    const client = await connect();
    const api = await client.view_api();
    const endpoints = Object.entries(api?.named_endpoints || {}).map(([name, e]) => ({
      name,
      parameters: (e.parameters || []).map((p) => ({
        name: p.parameter_name || p.label,
        type: p.python_type?.type || null,
        hasDefault: !!p.parameter_has_default,
      })),
    }));
    return wrap({ space: SPACE, count: endpoints.length, endpoints });
  } catch (err) {
    return fail(err);
  }
}

/** Lihat nama adapter LoRA yang valid (untuk --lora) */
async function loras() {
  try {
    const client = await connect();
    const list = await getLoras(client);
    if (!list.length) throw new Error('Daftar adapter tidak ditemukan di config Space. Cek dropdown LoRA di browser.');
    return wrap({ space: SPACE, count: list.length, loras: list });
  } catch (err) {
    return fail(err);
  }
}

/**
 * Image-to-image edit
 * @param {string} image   URL atau path file gambar
 * @param {string} prompt  instruksi edit (bahasa Inggris lebih akurat)
 * @param {object} opts    { out, api, lora, seed, randomize, guidance, steps }
 */
async function edit(image, prompt, opts = {}) {
  let available = [];
  try {
    const text = String(prompt || '').trim();
    if (!image) throw new Error('Gambar kosong (URL atau path file)');
    if (!text) throw new Error('Prompt kosong');

    const img = await loadImage(image);
    const client = await connect();
    available = await getLoras(client);

    // adapter: manual (--lora) → otomatis (cari "remov", else pertama) → default
    const lora =
      opts.lora ||
      available.find((n) => /remov/i.test(n)) ||
      available[0] ||
      DEFAULTS.lora;

    const cfg = {
      api: opts.api ? (opts.api.startsWith('/') ? opts.api : '/' + opts.api) : DEFAULTS.api,
      lora,
      seed: Number.isFinite(Number(opts.seed)) ? parseInt(opts.seed, 10) : DEFAULTS.seed,
      randomize: opts.randomize ?? DEFAULTS.randomize,
      guidance: Number.isFinite(Number(opts.guidance)) ? Number(opts.guidance) : DEFAULTS.guidance,
      steps: Number.isFinite(Number(opts.steps)) ? parseInt(opts.steps, 10) : DEFAULTS.steps,
    };

    const errors = [];
    let res = null;
    let usedFormat = null;

    for (const v of payloadVariants(img)) {
      try {
        res = await client.predict(cfg.api, {
          images_b64_json: v.value,
          prompt: text,
          lora_adapter: cfg.lora,
          seed: cfg.seed,
          randomize_seed: !!cfg.randomize,
          guidance_scale: cfg.guidance,
          steps: cfg.steps,
        });
        usedFormat = v.name;
        break;
      } catch (err) {
        const msg = String(err?.message || err?.title || JSON.stringify(err) || err);
        errors.push(`${v.name}: ${msg.slice(0, 160)}`);
        // error bukan soal format → hentikan (hemat kuota GPU)
        if (/Configuration not found|quota|rate|limit|queue|lora|adapter|sleep|paused|build/i.test(msg)) break;
      }
    }
    if (!res) {
      const hint = available.length ? ` | Adapter tersedia: ${available.join(', ')}` : '';
      throw new Error('Request gagal → ' + errors.join(' | ') + hint);
    }

    const images = extractImages(res.data);
    if (!images.length) {
      throw new Error('Space tidak mengembalikan gambar. Output mentah: ' + JSON.stringify(res.data).slice(0, 200));
    }

    // base64 tidak muat di JSON → otomatis disimpan ke file
    let saved = null;
    const first = images[0];
    const outFile = opts.out || (first.type === 'b64' ? `hasil-${Date.now()}.png` : null);
    if (outFile) saved = await saveImage(first, outFile);

    return wrap({
      space: SPACE,
      endpoint: cfg.api,
      prompt: text,
      lora: cfg.lora,
      input: image,
      format: usedFormat,
      images: images.map((i) => (i.type === 'url' ? i.value : `[base64 ${i.value.length} chars]`)),
      saved,
    });
  } catch (err) {
    return fail(err);
  }
}

module.exports = { edit, info, loras, CREDIT, SPACE };

/* ===================== CLI ===================== */

if (require.main === module) {
  (async () => {
    const argv = process.argv.slice(2);
    const cmd = argv.shift();

    const opts = {};
    const pos = [];
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === '--out') opts.out = argv[++i];
      else if (a === '--api') opts.api = argv[++i];
      else if (a === '--lora') opts.lora = argv[++i];
      else if (a === '--seed') opts.seed = argv[++i];
      else if (a === '--guidance') opts.guidance = argv[++i];
      else if (a === '--steps') opts.steps = argv[++i];
      else if (a === '--no-random') opts.randomize = false;
      else pos.push(a);
    }

    let out;
    if (cmd === 'info') out = await info();
    else if (cmd === 'loras') out = await loras();
    else if (cmd === 'edit') out = await edit(pos[0], pos.slice(1).join(' '), opts);
    else out = fail('Usage: node imgedit.js info | loras | edit <gambar> <prompt> [--out file.png] [--lora nama] [--seed n] [--no-random] [--guidance n] [--steps n]');

    console.log(JSON.stringify(out, null, 2));
    process.exit(out.status ? 0 : 1);
  })();
}