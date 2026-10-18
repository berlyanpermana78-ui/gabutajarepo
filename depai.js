/**
 * DepAI — chat DeepSeek lewat https://deep-seek.ai/chat (tanpa API key)
 * Credit : @bilzxdev2k26
 * CLI    : node depai.js <pertanyaan> [--model=deepseek/deepseek-v4-flash] [--raw] [--debug]
 * Module : const { chat } = require('./depai');
 *
 * Model  : deepseek/deepseek-v4-flash (default) | deepseek/deepseek-v3.2 | deepseek/deepseek-r1
 */

const axios = require('axios');
const https = require('https');

require('net').setDefaultAutoSelectFamily?.(false);
require('dns').setDefaultResultOrder?.('ipv4first');
axios.defaults.httpsAgent = new https.Agent({ family: 4, keepAlive: true });

const CREATOR = '@bilzxdev2k26';
const BASE_URL = 'https://deep-seek.ai';
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';
const MODELS = ['deepseek/deepseek-v4-flash', 'deepseek/deepseek-v3.2', 'deepseek/deepseek-r1'];

const baseHeaders = {
  Accept: '*/*',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  Origin: BASE_URL,
  Referer: `${BASE_URL}/chat`,
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  'sec-ch-ua': '"Chromium";v="139", "Not;A=Brand";v="99"',
  'sec-ch-ua-mobile': '?1',
  'sec-ch-ua-platform': '"Android"'
};

const parseCookies = (list = []) => {
  const jar = {};
  for (const item of list) {
    const kv = item.split(';')[0];
    const i = kv.indexOf('=');
    if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  return jar;
};

const short = (v, n = 400) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return (s || '').slice(0, n);
};

async function getSession(log) {
  const res = await axios.get(`${BASE_URL}/chat`, {
    headers: { ...baseHeaders, Accept: 'text/html,application/xhtml+xml,*/*' },
    responseType: 'text',
    transformResponse: [d => d],
    maxRedirects: 5,
    timeout: 30000
  });

  const cookies = parseCookies(res.headers['set-cookie']);
  const html = typeof res.data === 'string' ? res.data : '';

  const meta =
    html.match(/<meta[^>]+name=["'](?:csrf-token|_token)["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["'](?:csrf-token|_token)["']/i);

  const csrf = meta?.[1] || null;
  const xsrf = cookies['XSRF-TOKEN'] ? decodeURIComponent(cookies['XSRF-TOKEN']) : null;

  log('session', res.status, 'cookies:', Object.keys(cookies).join(',') || '-', '| csrf:', !!csrf, '| xsrf:', !!xsrf);
  return { cookies, csrf, xsrf };
}

function parseSSE(raw) {
  let text = '';
  let reasoning = '';
  let usage = null;

  for (const line of String(raw).split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const v = line.slice(5).trim();
    if (!v || v === '[DONE]') continue;
    try {
      const j = JSON.parse(v);
      const d = j.choices?.[0]?.delta;
      if (d?.content) text += d.content;
      const r = d?.reasoning_content ?? d?.reasoning;
      if (r) reasoning += r;
      if (j.usage) usage = j.usage;
    } catch {}
  }

  // fallback kalau responnya JSON biasa (bukan SSE)
  if (!text) {
    try {
      const j = JSON.parse(raw);
      text = j.choices?.[0]?.message?.content || j.content || j.answer || j.text || '';
      usage = usage || j.usage || null;
    } catch {}
  }

  // deep-seek.ai (provider StreamLake) kadang ngirim jawaban di field "reasoning" dan "content" kosong
  if (!text.trim() && reasoning.trim()) {
    text = reasoning;
    reasoning = '';
  }

  return { text, reasoning, usage };
}

async function chat(prompt, opt = {}) {
  const { messages = [], model = DEFAULT_MODEL, raw = false, debug = false } = opt;
  const log = (...a) => debug && console.error('[debug]', ...a);

  try {
    if (!prompt || !String(prompt).trim()) {
      return { creator: CREATOR, status: false, error: 'Prompt kosong' };
    }

    const s = await getSession(log);
    const cookie = Object.entries(s.cookies).map(([k, v]) => `${k}=${v}`).join('; ');

    const res = await axios.post(
      `${BASE_URL}/api/chat`,
      { model, messages: [...messages, { role: 'user', content: String(prompt) }] },
      {
        headers: {
          ...baseHeaders,
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
          ...((s.csrf || s.xsrf) ? { 'X-CSRF-TOKEN': s.csrf || s.xsrf } : {}),
          ...((s.xsrf || s.csrf) ? { 'X-XSRF-TOKEN': s.xsrf || s.csrf } : {})
        },
        responseType: 'text',
        transformResponse: [d => d],
        timeout: 120000
      }
    );

    const body = res.data;
    log('chat', res.status, res.headers['content-type'], short(body, 300).replace(/\s+/g, ' '));

    const { text, reasoning, usage } = parseSSE(body);

    if (!text.trim()) {
      return {
        creator: CREATOR,
        status: false,
        code: res.status,
        error: 'Respon kosong / format tidak dikenali',
        raw: short(body, 1500)
      };
    }

    return {
      creator: CREATOR,
      status: true,
      result: {
        model,
        answer: text.trim(),
        ...(reasoning ? { reasoning: reasoning.trim() } : {}),
        usage,
        ...(raw ? { raw: short(body, 4000) } : {})
      }
    };
  } catch (e) {
    return {
      creator: CREATOR,
      status: false,
      code: e.response?.status || null,
      error: short(e.response?.data || e.message, 800)
    };
  }
}

module.exports = { chat, MODELS };

// ===== CLI =====
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const flags = args.filter(a => a.startsWith('--'));
    const prompt = args.filter(a => !a.startsWith('--')).join(' ').trim();
    const model = (flags.find(f => f.startsWith('--model=')) || '').split('=')[1] || DEFAULT_MODEL;

    if (!prompt) {
      console.log('Pakai: node depai.js "pertanyaan" [--raw] [--debug] [--model=...]');
      console.log('Model: ' + MODELS.join(' | '));
      process.exit(1);
    }

    const out = await chat(prompt, {
      model,
      raw: flags.includes('--raw'),
      debug: flags.includes('--debug')
    });

    console.log(JSON.stringify(out, null, 2));
    process.exit(out.status ? 0 : 1);
  })();
}
