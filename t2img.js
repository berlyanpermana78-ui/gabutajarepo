
'use strict';

/**
 * Text to Image - Notegpt
 * Credit : @bilzxdev2k26
 * CLI    : node t2img.js <prompt>
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  'Accept-Language': 'id-ID,id;q=0.9,en-AU;q=0.8,en;q=0.7,en-US;q=0.6'
};

const APP_ID = 'notegpt_8c92b6';
const WASM_URL = 'https://cdn.notegpt.io/notegpt/pages/public/_nuxt/crypto_util_bg.Bd4ztPln.wasm';
const BASE_URL = 'https://notegpt.io';
const PAGE_URL = `${BASE_URL}/text-to-image`;
const prompt = process.argv.slice(2).join(' ').trim() || 'a cute orange cat, anime style';

let wasmExports = null;
let wasmMemory = null;
let wasmReady = null;
let wasmAllocLen = 0;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {
  ignoreBOM: true,
  fatal: true
});

function mem() {
  return new Uint8Array(wasmMemory.buffer);
}

function decodeStr(ptr, len) {
  return decoder.decode(
    mem().subarray(ptr >>> 0, (ptr >>> 0) + (len >>> 0))
  );
}

function encodeStr(str) {
  const data = encoder.encode(str);
  const ptr = wasmExports.__wbindgen_malloc(data.length, 1) >>> 0;

  mem().subarray(ptr, ptr + data.length).set(data);
  wasmAllocLen = data.length;

  return ptr;
}

function handleException(fn, args) {
  try {
    return fn.apply(null, args);
  } catch (err) {
    const table = wasmExports.__wbindgen_externrefs;
    const alloc = wasmExports.__externref_table_alloc;
    const store = wasmExports.__wbindgen_exn_store;

    if (table && alloc && store) {
      const ptr = alloc();
      table.set(ptr, err);
      store(ptr);
    }

    return undefined;
  }
}

function catchException(ptr) {
  const table = wasmExports.__wbindgen_externrefs;
  const dealloc = wasmExports.__wbindgen_externref_table_dealloc ||
    wasmExports.__externref_table_dealloc;

  const err = table.get(ptr);

  if (dealloc) dealloc(ptr);

  return err;
}

function makeImports() {
  const i = {};

  i.__wbg___wbindgen_is_falsy_f8005c4864e74c90 = e => !e;
  i.__wbg___wbindgen_is_function_d4c2480b46f29e33 = e => typeof e === 'function';
  i.__wbg___wbindgen_is_object_e04e3a51a90cde43 = e => typeof e === 'object' && e !== null;
  i.__wbg___wbindgen_is_string_3db04af369717583 = e => typeof e === 'string';
  i.__wbg___wbindgen_is_undefined_5957b329897cc39c = e => e === undefined;

  i.__wbg___wbindgen_throw_bd5a70920abf0236 = (ptr, len) => {
    return decodeStr(ptr, len);
  };

  i.__wbg_crypto_38df2bab126b63dc = () => crypto.webcrypto;
  i.__wbg_getHours_defd69626029ce3f = () => new Date().getHours();

  i.__wbg_getRandomValues_c44a50d8cfdaebeb = function () {
    return handleException((e, t) => e.getRandomValues(t), arguments);
  };

  i.__wbg_randomFillSync_6c25eac9869eb53c = function () {
    return handleException((e, t) => e.randomFillSync(t), arguments);
  };

  i.__wbg_random_d9645defc0204485 = () => Math.random();
  i.__wbg_now_cd850b0a28a6e656 = () => Date.now();
  i.__wbg_new_0_1211b165db93342c = () => new Date();
  i.__wbg_new_ebde992a0bf6bdf6 = (e, t) => new Error(decodeStr(e, t));
  i.__wbg_require_b4edbdcf3e2a1ef0 = () => require;
  i.__wbg_versions_276b2795b1c6a219 = () => process.versions;
  i.__wbg_node_84ea875411254db1 = () => process;
  i.__wbg_process_44c7a14e11e9f69e = () => process;

  i.__wbg_static_accessor_GLOBAL_44bef9fa6011e260 = () => global;
  i.__wbg_static_accessor_GLOBAL_THIS_13002645baf43d84 = () => globalThis;
  i.__wbg_static_accessor_SELF_91d0abd4d035416c = () => globalThis;
  i.__wbg_static_accessor_WINDOW_513f857c65724fc7 = () => globalThis;

  i.__wbg_new_with_length_a90559ebda3954f8 = e => new Uint8Array(e >>> 0);
  i.__wbg_subarray_fb60755cb1b4a498 = (e, t, n) => e.subarray(t >>> 0, n >>> 0);
  i.__wbg_length_090b6aa6235450ba = e => e.length;

  i.__wbg_prototypesetcall_7dca54d31cb9d2dc = (e, t, n) => {
    Uint8Array.prototype.set.call(
      mem().subarray(e >>> 0, (e >>> 0) + (t >>> 0)),
      n
    );
  };

  i.__wbindgen_cast_0000000000000001 = (e, t) =>
    mem().subarray(e >>> 0, (e >>> 0) + (t >>> 0));

  i.__wbindgen_cast_0000000000000002 = (e, t) => decodeStr(e, t);

  i.__wbindgen_init_externref_table = () => {
    const table = wasmExports.__wbindgen_externrefs;

    if (!table) return;

    const base = table.grow(4);

    table.set(0, undefined);
    table.set(base, undefined);
    table.set(base + 1, null);
    table.set(base + 2, true);
    table.set(base + 3, false);
  };

  i.__wbg_call_1aea13500fe8ff6c = function () {
    return handleException((e, t, n) => e.call(t, n), arguments);
  };

  i.__wbg_call_2c4d4c5c3c2c1d6e = function () {
    return handleException((e, t) => e.call(t), arguments);
  };

  i.__wbg_apply = function () {
    return handleException((e, t, n) => e.apply(t, n), arguments);
  };

  i.__wbg_bind = function () {
    return handleException((e, t, ...args) => e.bind(t, ...args), arguments);
  };

  i.__wbg_get = function () {
    return handleException((e, t) => e[t], arguments);
  };

  i.__wbg_set = function (e, t, n) {
    return handleException(() => {
      e[t] = n;
    }, []);
  };

  i.__wbg_newnoargs = (ptr, len) => new Function(decodeStr(ptr, len));
  i.__wbg_instanceof_Uint8Array = e => e instanceof Uint8Array;
  i.__wbg_buffer = e => e.buffer;
  i.__wbg_byteLength = e => e.byteLength;
  i.__wbg_byteOffset = e => e.byteOffset;
  i.__wbg_subarray = (e, t, n) => e.subarray(t >>> 0, n >>> 0);
  i.__wbg_length = e => e.length;
  i.__wbg_now = () => Date.now();
  i.__wbg_error = e => process.stderr.write(String(e) + '\n');
  i.__wbg_log = e => process.stdout.write(String(e) + '\n');
  i.__wbg_warn = e => process.stderr.write(String(e) + '\n');
  i.__wbg_new = () => new Error();

  return {
    './crypto_util_bg.js': new Proxy(i, {
      get(target, prop) {
        if (prop in target) return target[prop];

        if (
          typeof prop === 'string' &&
          (
            prop.startsWith('__wbg_') ||
            prop.startsWith('__wbindgen_')
          )
        ) {
          return function () {
            return undefined;
          };
        }

        return undefined;
      }
    })
  };
}

async function initWasm() {
  if (wasmExports) return true;
  if (wasmReady) return wasmReady;

  wasmReady = (async () => {
    const wasmPath = path.join(
      process.cwd(),
      'System',
      'crypto_util.wasm'
    );

    let wasmBuf;

    if (fs.existsSync(wasmPath)) {
      wasmBuf = fs.readFileSync(wasmPath);
    } else {
      const res = await axios.get(WASM_URL, {
        responseType: 'arraybuffer',
        headers
      });

      wasmBuf = Buffer.from(res.data);

      const pat = Buffer.from([
        0x41,
        0xda,
        0xa0,
        0xc0,
        0x00
      ]);

      const idx = wasmBuf.indexOf(pat);

      if (idx !== -1 && idx >= 16) {
        Buffer.from([
          0x1a,
          0x41,
          0x01,
          0x01,
          0x01,
          0x01,
          0x01
        ]).copy(wasmBuf, idx - 16);
      }

      fs.mkdirSync(path.dirname(wasmPath), {
        recursive: true
      });

      fs.writeFileSync(wasmPath, wasmBuf);
    }

    const module = await WebAssembly.compile(wasmBuf);
    const instance = await WebAssembly.instantiate(
      module,
      makeImports()
    );

    wasmExports = instance.exports;
    wasmMemory = wasmExports.memory;

    if (wasmExports.__wbindgen_start) {
      wasmExports.__wbindgen_start();
    }

    return true;
  })();

  try {
    return await wasmReady;
  } catch {
    wasmReady = null;
    wasmExports = null;
    wasmMemory = null;
    return false;
  }
}

function signPayload(body, appId = APP_ID) {
  function format(v) {
    if (v === null) return String(v);
    if (Array.isArray(v)) return JSON.stringify(v);

    if (typeof v === 'object') {
      const obj = {};

      Object.keys(v).sort().forEach(k => {
        obj[k] = v[k];
      });

      return JSON.stringify(obj);
    }

    return String(v);
  }

  const query = Object.keys(body)
    .filter(k => body[k] !== undefined)
    .sort()
    .map(k => `${k}=${format(body[k])}`)
    .join('&');

  let p = 0;
  let l = 0;

  try {
    const appPtr = encodeStr(appId);
    const appLen = wasmAllocLen;

    const queryPtr = encodeStr(query);
    const queryLen = wasmAllocLen;

    const result = wasmExports.sign(
      appPtr,
      appLen,
      queryPtr,
      queryLen
    );

    p = result[0];
    l = result[1];

    if (result[3]) {
      catchException(result[2]);
      return null;
    }

    return decodeStr(p, l);
  } catch {
    return null;
  } finally {
    if (p && l && wasmExports?.__wbindgen_free) {
      wasmExports.__wbindgen_free(p, l, 1);
    }
  }
}

function parseCookies(arr) {
  return Object.fromEntries(
    (arr || []).map(c => {
      const pair = c.split(';')[0];
      const i = pair.indexOf('=');

      if (i < 0) return [];

      return [
        pair.slice(0, i).trim(),
        pair.slice(i + 1).trim()
      ];
    }).filter(e => e.length)
  );
}

async function getSession() {
  const page = await axios.get(PAGE_URL, {
    headers: {
      ...headers,
      Accept: 'text/html'
    }
  }).catch(() => ({
    headers: {}
  }));

  const jar = parseCookies(page.headers?.['set-cookie']);
  const anonId = jar.anonymous_user_id || crypto.randomUUID();
  const gaRand = Math.floor(Math.random() * 1e9);
  const nowSec = Math.floor(Date.now() / 1000);
  const crispId = crypto.randomUUID();

  jar.anonymous_user_id = anonId;

  if (!jar._ga) jar._ga = `GA1.2.${gaRand}.${nowSec}`;
  if (!jar._gid) jar._gid = `GA1.2.${gaRand}.${nowSec}`;

  jar[`crisp-client%2Fsession%2F${crispId}`] = `session_${crispId}`;

  return {
    Cookie: Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  };
}

async function createJob(prompt) {
  if (!await initWasm()) {
    return {
      error: 'WASM initialization failed'
    };
  }

  const session = await getSession();

  const payload = {
    user_prompt: prompt,
    type: 60,
    aspect_ratio: '1:1',
    num: 1,
    model: '',
    sub_type: 3,
    upscale: 2,
    resolution: '1k',
    t: Math.floor(Date.now() / 1000),
    app_id: APP_ID
  };

  payload.sign = signPayload(payload, APP_ID);

  if (!payload.sign) {
    return {
      error: 'Signing failed'
    };
  }

  const res = await axios.post(
    `${BASE_URL}/api/v2/images/start`,
    payload,
    {
      headers: {
        ...headers,
        ...session,
        'Content-Type': 'application/json; charset=UTF-8',
        Origin: BASE_URL,
        Referer: PAGE_URL
      }
    }
  ).catch(e => ({
    error: e.response?.data || e.message
  }));

  if (res.error) {
    return {
      error: res.error
    };
  }

  const jobId = res.data?.data?.session_id;

  if (!jobId) {
    return {
      error: res.data
    };
  }

  return {
    session,
    jobId
  };
}

async function checkJob(jobId, session) {
  const res = await axios.get(
    `${BASE_URL}/api/v2/images/status`,
    {
      params: {
        session_id: jobId
      },
      headers: {
        ...headers,
        ...session,
        Origin: BASE_URL,
        Referer: PAGE_URL
      }
    }
  ).catch(e => ({
    error: e.response?.data || e.message
  }));

  if (res.error) {
    return {
      error: res.error
    };
  }

  return res.data?.data || {
    error: res.data
  };
}

async function textToImage(prompt) {
  const job = await createJob(prompt);

  if (job.error) {
    return {
      creator: '@bilzxdev2k26',
      success: false,
      error: job.error
    };
  }

  for (let attempt = 0; attempt < 120; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2500));

    const result = await checkJob(job.jobId, job.session);

    if (result.error) {
      return {
        creator: '@bilzxdev2k26',
        success: false,
        error: result.error
      };
    }

    if (result.status === 'failed') {
      return {
        creator: '@bilzxdev2k26',
        success: false,
        error: result.message || 'Generation failed'
      };
    }

    if (result.status === 'succeeded') {
      const imageUrl = Array.isArray(result.results?.[0]?.url)
        ? result.results[0].url[0]
        : result.results?.[0]?.url;

      if (!imageUrl) {
        return {
          creator: '@bilzxdev2k26',
          success: false,
          error: 'Image URL not found'
        };
      }

      return {
        creator: '@bilzxdev2k26',
        success: true,
        job_id: job.jobId,
        image: imageUrl
      };
    }
  }

  return {
    creator: '@bilzxdev2k26',
    success: false,
    error: 'Generation timeout'
  };
}

async function main() {
  try {
    const result = await textToImage(prompt);

    console.log(JSON.stringify(result, null, 2));

    if (!result.success) {
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(JSON.stringify({
      creator: '@bilzxdev2k26',
      success: false,
      error: e.message
    }, null, 2));

    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  textToImage,
  initWasm,
  signPayload,
  createJob,
  checkJob
};
