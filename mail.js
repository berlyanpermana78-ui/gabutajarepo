/* Temp Mail Scraper 
 Base : https://api.mail.tm
 Type : Scraper Api 
 Creator : @bilzxdev2k26 (bilal)
*/

// import 
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// config
const BASE_URL = "https://api.mail.tm";
const ACCOUNT_FILE = "account.json";
const TIMEOUT = 15; 
const CREATOR = "@bilzxdev2k26";

// color
const C = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  RED: "\x1b[31m",
  GREEN: "\x1b[32m",
  YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m",
  MAGENTA: "\x1b[35m",
  CYAN: "\x1b[36m",
  WHITE: "\x1b[97m"
};

// banner
function banner() {
  console.log(`${C.CYAN}${C.BOLD}
╔══════════════════════════════════════════╗
║           T E M P M A I L  •  X           ║
║        disposable inbox generator         ║
╚══════════════════════════════════════════╝${C.RESET}
${C.DIM}creator: ${CREATOR}  |  api: mail.tm${C.RESET}
`);
}

function info(msg) {
  console.log(`${C.BLUE}[i]${C.RESET} ${msg}`);
}

function ok(msg) {
  console.log(`${C.GREEN}[✓]${C.RESET} ${msg}`);
}

function warn(msg) {
  console.log(`${C.YELLOW}[! failure]${C.RESET} ${msg}`);
}

function err(msg) {
  console.log(`${C.RED}[x]${C.RESET} ${msg}`);
}

function kv(key, value, color = C.WHITE) {
  console.log(`  ${C.DIM}${key.padEnd(12)}${C.RESET} ${color}${value}${C.RESET}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function spinner(msg, seconds = 0.6) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const end = Date.now() + seconds * 1000;
  let i = 0;
  while (Date.now() < end) {
    process.stdout.write(`\r${C.CYAN}${frames[i % frames.length]}${C.RESET} ${msg}`);
    await sleep(80);
    i++;
  }
  process.stdout.write(`\r${' '.repeat(msg.length + 4)}\r`);
}

class Account {
  constructor({ id, address, password, token, context, at_id, created_at }) {
    this.id = id;
    this.address = address;
    this.password = password;
    this.token = token;
    this.context = context;
    this.at_id = at_id;
    this.created_at = created_at;
  }

  toDict() {
    return {
      status: true,
      creator: CREATOR,
      api: BASE_URL,
      results: {
        idaccount: this.id,
        token: this.token,
        address: this.address,
        password: this.password,
        "@context": this.context,
        "@id": this.at_id,
      },
      timestamp: this.created_at,
    };
  }
}

class TempMailError extends Error {
  constructor(message) {
    super(message);
    this.name = "TempMailError";
  }
}

class MailTM {
  constructor(baseUrl = BASE_URL, timeout = TIMEOUT) {
    this.baseUrl = baseUrl;
    this.timeout = timeout * 1000;
  }

  async _request(method, path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers = { ...options.headers };
      let body = undefined;

      if (options.json) {
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
        body = JSON.stringify(options.json);
      }

      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.status === 204) {
        return null;
      }

      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new TempMailError(`Invalid JSON response from ${path}`);
      }

      if (res.status >= 400) {
        const detail = data?.detail || data?.message || text.slice(0, 200);
        throw new TempMailError(`HTTP ${res.status} on ${path}: ${detail}`);
      }

      return data;
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") {
        throw new TempMailError(`Request timed out: ${url}`);
      }
      if (e instanceof TempMailError) throw e;
      throw new TempMailError(`Connection failed — check your network or mail.tm status: ${e.message}`);
    }
  }

  async getDomains() {
    const data = await this._request("GET", "/domains");
    return data["hydra:member"] || (Array.isArray(data) ? data : []);
  }

  async createAccount(address, password) {
    return await this._request("POST", "/accounts", {
      json: { address, password },
    });
  }

  async getToken(address, password) {
    return await this._request("POST", "/token", {
      json: { address, password },
    });
  }

  async listMessages(token, page = 1) {
    const data = await this._request("GET", `/messages?page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (Array.isArray(data)) {
      return { "hydra:member": data, "hydra:totalItems": data.length };
    }
    return data;
  }

  async getMessage(token, messageId) {
    return await this._request("GET", `/messages/${messageId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async markAsRead(token, messageId) {
    return await this._request("PATCH", `/messages/${messageId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/merge-patch+json",
      },
      json: { seen: true },
    });
  }

  async deleteMessage(token, messageId) {
    await this._request("DELETE", `/messages/${messageId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

function getRandomString(length = 10, chars = "abcdefghijklmnopqrstuvwxyz0123456789") {
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

function genUsername(prefix = "bilzx", length = 10) {
  return `${prefix}_${getRandomString(length, "abcdefghijklmnopqrstuvwxyz0123456789")}`;
}

function genPassword(prefix = "bilzx", length = 16) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return `${prefix}_${getRandomString(length, chars)}`;
}

function loadSavedAccount() {
  if (!fs.existsSync(ACCOUNT_FILE)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(ACCOUNT_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    warn(`${ACCOUNT_FILE} is corrupted, ignoring saved account`);
    return null;
  }
}

function saveAccount(data) {
  try {
    fs.writeFileSync(ACCOUNT_FILE, JSON.stringify(data, null, 4), "utf-8");
  } catch (e) {
    warn(`Could not save ${ACCOUNT_FILE}: ${e.message}`);
  }
}

async function pickDomain(client) {
  await spinner("fetching available domains");
  const domains = await client.getDomains();
  if (!domains.length) {
    throw new TempMailError("No domains returned by mail.tm");
  }
  const active = domains.filter((d) => d.isActive ?? true);
  const chosen = (active.length ? active : domains)[0].domain;
  ok(`Domain selected: ${C.CYAN}${chosen}${C.RESET}`);
  return chosen;
}

async function createOrLoadAccount(client, forceNew = false) {
  const saved = forceNew ? null : loadSavedAccount();
  let address = "";
  let password = "";

  if (saved && saved.username && saved.password) {
    password = saved.password;
    if (saved.address) {
      address = saved.address;
      info("Existing account found in account.json — reusing it");
    } else {
      warn("account.json is from an older version (no saved domain) — resolving domain");
      const domain = await pickDomain(client);
      address = `${saved.username}@${domain}`;
      saveAccount({ username: saved.username, password, address });
      info(`Migrated account.json — reusing ${C.CYAN}${address}${C.RESET}`);
    }
  } else {
    if (saved) {
      warn("account.json is missing required fields — creating a fresh account instead");
    }
    const domain = await pickDomain(client);
    const username = genUsername();
    password = genPassword();
    address = `${username}@${domain}`;
    saveAccount({ username, password, address });
  }

  await spinner("creating/verifying account");
  let accId = "";
  let atId = "";
  let context = "";

  try {
    const accData = await client.createAccount(address, password);
    accId = accData.id;
    atId = accData["@id"] || "";
    context = accData["@context"] || "";
  } catch (e) {
    if (e.message.toLowerCase().includes("already used") || e.message.includes("422")) {
      info("Account already exists on mail.tm — logging in instead");
    } else {
      throw e;
    }
  }

  await spinner("requesting auth token");
  const tokenData = await client.getToken(address, password);
  const token = tokenData.token;

  if (!accId) {
    accId = tokenData.id || "unknown";
  }

  return new Account({
    id: accId,
    address,
    password,
    token,
    context,
    at_id: atId,
    created_at: new Date().toISOString(),
  });
}

function printAccount(acc) {
  console.log();
  console.log(`${C.GREEN}${C.BOLD}  ── Account Ready ──${C.RESET}`);
  kv("Address", acc.address, C.CYAN);
  kv("Password", acc.password, C.YELLOW);
  kv("Token", acc.token.slice(0, 24) + "...", C.DIM);
  kv("Created", acc.created_at, C.DIM);
  console.log();
}

async function watchInbox(client, acc, interval = 5) {
  info(`Watching inbox for ${C.CYAN}${acc.address}${C.RESET} — Ctrl+C to stop`);
  const seenIds = new Set();

  const handleInterrupt = () => {
    console.log();
    info("Stopped watching inbox");
    process.exit(0);
  };

  process.on("SIGINT", handleInterrupt);

  while (true) {
    try {
      const res = await client.listMessages(acc.token);
      const messages = res["hydra:member"] || [];
      const newMsgs = messages.filter((m) => !seenIds.has(m.id));

      for (const m of newMsgs) {
        seenIds.add(m.id);
        const sender = m.from?.address || "unknown";
        const subject = m.subject || "(no subject)";
        console.log(`\n${C.MAGENTA}✉ New message${C.RESET}`);
        kv("From", sender, C.CYAN);
        kv("Subject", subject, C.WHITE);
        kv("Intro", (m.intro || "").slice(0, 80), C.DIM);
        kv("ID", m.id, C.DIM);
      }

      if (!newMsgs.length) {
        const nowStr = new Date().toLocaleTimeString();
        process.stdout.write(`\r${C.DIM}  no new mail — last checked ${nowStr}${C.RESET}`);
      }
    } catch (e) {
      err(e.message);
    }

    await sleep(interval * 1000);
  }
}

async function cmdListMessages(client, acc, page = 1) {
  await spinner("fetching inbox");
  try {
    const data = await client.listMessages(acc.token, page);
    const msgs = data["hydra:member"] || [];
    const total = data["hydra:totalItems"] ?? msgs.length;

    console.log();
    console.log(`${C.BOLD}  Inbox — ${acc.address}${C.RESET}  ${C.DIM}(${total} total, page ${page})${C.RESET}`);
    console.log();

    if (!msgs.length) {
      console.log(`  ${C.DIM}(empty — no messages yet)${C.RESET}\n`);
      return;
    }

    for (const m of msgs) {
      const seenMark = m.seen ? `${C.DIM}·${C.RESET}` : `${C.GREEN}●${C.RESET}`;
      const sender = m.from?.address || "unknown";
      const subject = m.subject || "(no subject)";
      const created = (m.createdAt || "").slice(0, 19).replace("T", " ");
      console.log(`  ${seenMark} ${C.CYAN}${m.id}${C.RESET}  ${C.WHITE}${subject}${C.RESET}`);
      kv("From", sender);
      kv("Received", created, C.DIM);
      console.log();
    }
  } catch (e) {
    err(e.message);
  }
}

async function cmdReadMessage(client, acc, messageId) {
  await spinner("fetching message");
  try {
    const m = await client.getMessage(acc.token, messageId);
    const sender = m.from?.address || "unknown";
    const to = (m.to || []).map((t) => t.address || "").join(", ");
    const subject = m.subject || "(no subject)";

    console.log();
    console.log(`${C.GREEN}${C.BOLD}  ── Message ──${C.RESET}`);
    kv("From", sender, C.CYAN);
    kv("To", to, C.WHITE);
    kv("Subject", subject, C.WHITE);
    kv("Date", m.createdAt || "", C.DIM);
    console.log();

    if (m.text) {
      console.log(`${C.DIM}── body (text) ──${C.RESET}`);
      console.log(m.text.trim());
    } else if (m.html) {
      const htmlBody = Array.isArray(m.html) ? m.html[0] : m.html;
      console.log(`${C.DIM}── body (html, raw) ──${C.RESET}`);
      console.log(htmlBody.trim());
    } else {
      console.log(`${C.DIM}(no body content)${C.RESET}`);
    }

    if (m.attachments && m.attachments.length > 0) {
      console.log();
      console.log(`${C.DIM}── attachments ──${C.RESET}`);
      for (const a of m.attachments) {
        kv(a.filename || "file", `${a.size ?? "?"} bytes`, C.YELLOW);
      }
    }

    console.log();

    try {
      await client.markAsRead(acc.token, messageId);
    } catch {
      // Non-fatal, ignore if mark as read fails
    }
  } catch (e) {
    err(e.message);
  }
}

async function cmdDeleteMessage(client, acc, messageId) {
  await spinner("deleting message");
  try {
    await client.deleteMessage(acc.token, messageId);
    ok(`Message ${messageId} deleted`);
  } catch (e) {
    err(e.message);
  }
}

async function requireAccount(client) {
  const saved = loadSavedAccount();
  if (!saved || !saved.password || !(saved.address || saved.username)) {
    err("No usable saved account found — run without arguments first to create one");
    process.exit(1);
  }

  let address = "";
  if (saved.address) {
    address = saved.address;
  } else {
    warn("account.json is from an older version (no saved domain) — resolving domain");
    const domain = await pickDomain(client);
    address = `${saved.username}@${domain}`;
    saveAccount({ username: saved.username, password: saved.password, address });
  }

  await spinner("authenticating");
  const tokenData = await client.getToken(address, saved.password);

  return new Account({
    id: tokenData.id || "unknown",
    address,
    password: saved.password,
    token: tokenData.token,
    context: "",
    at_id: "",
    created_at: new Date().toISOString(),
  });
}

function printUsage() {
  console.log(`${C.DIM}Usage:
  node tempmail.js                 create/load account
  node tempmail.js --new           force a fresh account
  node tempmail.js --watch         create/load account, then watch inbox live

  node tempmail.js messages [page] list inbox messages (default page 1)
  node tempmail.js read <id>        read a message by id, marks it as read
  node tempmail.js delete <id>      delete a message by id${C.RESET}
`);
}

async function main() {
  console.clear();
  banner();

  const client = new MailTM();
  const args = process.argv.slice(2);

  if (args.length > 0 && ["messages", "read", "delete"].includes(args[0])) {
    const subcommand = args[0];

    if (subcommand === "read" && args.length < 2) {
      err("Usage: node tempmail.js read <message_id>");
      process.exit(1);
    }
    if (subcommand === "delete" && args.length < 2) {
      err("Usage: node tempmail.js delete <message_id>");
      process.exit(1);
    }

    try {
      const acc = await requireAccount(client);
      if (subcommand === "messages") {
        const page = args[1] && !isNaN(args[1]) ? parseInt(args[1], 10) : 1;
        await cmdListMessages(client, acc, page);
      } else if (subcommand === "read") {
        await cmdReadMessage(client, acc, args[1]);
      } else if (subcommand === "delete") {
        await cmdDeleteMessage(client, acc, args[1]);
      }
    } catch (e) {
      err(e.message);
      process.exit(1);
    }
    return;
  }

  if (args.includes("-h") || args.includes("--help")) {
    printUsage();
    return;
  }

  const forceNew = args.includes("--new");
  const watch = args.includes("--watch");

  try {
    const acc = await createOrLoadAccount(client, forceNew);
    printAccount(acc);

    const result = acc.toDict();
    console.log(`${C.DIM}── raw json ──${C.RESET}`);
    console.log(JSON.stringify(result, null, 4));

    if (watch) {
      console.log();
      await watchInbox(client, acc);
    } else {
      console.log();
      info(`Tip: ${C.CYAN}--watch${C.RESET} live inbox · ${C.CYAN}--new${C.RESET} fresh account · ${C.CYAN}messages / read <id> / delete <id>${C.RESET} manage mail`);
    }
  } catch (e) {
    err(e.message);
    process.exit(1);
  }
}

main();
