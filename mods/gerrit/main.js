// Gerrit beside your agents: a dashboard like Gerrit's own (輪到你 / 我送出的 / 等我 review / CC / 最近合併),
// a change's details on click, and a notification when a change turns to you or someone replies.
// Reads Gerrit's REST API with fetch. Settings (address, user, HTTP password) live in
// <home>/.config/herdr-app/gerrit.json, outside this folder, so updating the mod never touches them.
// Roles (props.role): the panel (default) and "toggle", the tab-bar button that shows or hides the layout's
// "gerrit-panel" (like the CI and git buttons). The toggle polls and shares the lists; the panel draws them.
// A panel with no toggle in the layout polls itself and offers to move into the tab bar.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea, InputState, Input } from "gpui-base";
import { theme, settings, notify, home, readTextFile, run, layout, shared, setShared, window, props as blockProps } from "herdr";
import process from "process";

const TOGGLE = "gerrit-toggle", PANEL = "gerrit-panel";
const SHIPPED = ["main", "terminals", "win98"]; // Herdr's own layouts: read-only, so moving clones one first
const DATA = "gerrit.data.v1", SAFE_CFG = "gerrit.cfg.v1", BUSY = "gerrit.busy", REFRESH = "gerrit.refresh";
function find(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = find(c, id); if (f) return f; }
  return null;
}
function parentOf(node, test) {
  for (const c of node?.children ?? []) {
    if (test(c)) return node;
    const p = parentOf(c, test);
    if (p) return p;
  }
  return null;
}
// The layout with this mod as a tab-bar button + a panel in the work area (like the git button), the stray dock removed.
function placed(root) {
  const strip = (n) => ({ ...n, children: n.children?.filter((c) => c.content?.mod !== "gerrit").map(strip) });
  const tree = strip(JSON.parse(JSON.stringify(root)));
  const bar = parentOf(tree, (c) => c.content?.mod === "tabs");
  const body = parentOf(tree, (c) => c.content?.tab != null);
  if (!bar || !body) return null;
  bar.children.push({ id: TOGGLE, type: "block", content: { mod: "gerrit", props: { role: "toggle" } }, size: { px: 96 } });
  body.children.push({ id: PANEL, type: "column", children: [{ id: "gerrit", type: "block", content: { mod: "gerrit" } }],
    size: { px: 460 }, min: 340 });
  return tree;
}

const CONFIG = () => `${home().replace(/\\/g, "/")}/.config/herdr-app/gerrit.json`;
const CONFIG_EXAMPLE = `{
  "url": "https://gerrit.example.com",
  "user": "your-gerrit-username",
  "http_password": "from Gerrit: Settings → HTTP Credentials → Generate",
  "poll_seconds": 60
}`;
// Gerrit's own dashboard ("Your Turn", "Work in progress", "Outgoing reviews", "Incoming reviews", "CCed on",
// "Recently submitted"). A config "sections": [{ "title", "query" }] replaces them.
const DEFAULT_SECTIONS = [
  { title: "輪到你", query: "attention:self is:open", turn: true },
  { title: "草稿（WIP）", query: "is:open owner:self is:wip" },
  // Each change shows once: what's your turn is only in 輪到你 (-attention:self below).
  { title: "我送出的（等對方）", query: "is:open owner:self -is:wip -attention:self" },
  { title: "我在 review（等對方）", query: "is:open -owner:self -is:wip reviewer:self -attention:self" },
  { title: "CC 我的", query: "is:open -is:wip cc:self -attention:self" },
  { title: "最近合併／放棄", query: "is:closed (owner:self OR reviewer:self) -age:4w", closed: true },
];
const OPTS = "o=LABELS&o=DETAILED_ACCOUNTS&o=SUBMITTABLE";
const SEARCH_LIMIT = 50;
// Jenkins: "a/b" -> "job/a/job/b"; a path that already says job/ (or view/…/job/…) is kept
const jobPath = (j) => (/(^|\/)job\//.test(j) ? String(j).replace(/^\/+|\/+$/g, "") : String(j).split("/").filter(Boolean).map((x) => `job/${encodeURIComponent(x)}`).join("/"));
const jobName = (j) => decodeURIComponent(String(j).replace(/\/+$/, "").split("/").pop());
const mins = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? "不到 1 分" : m < 90 ? `${m} 分` : `${Math.floor(m / 60)} 小時 ${m % 60} 分`; };
const param = (b, name) => (b.actions ?? []).flatMap((a) => a?.parameters ?? []).find((p) => p?.name === name)?.value;
// UTF-8 byte length (Jenkins counts log offsets in bytes) and a form body, without TextEncoder / URLSearchParams
const utf8len = (s) => { let n = 0; for (const ch of s) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; };
const formBody = (o) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
const JENKINS_BUILDS = 200; // newest builds of each job looked through for a change
// "123", "#123", or a Gerrit link (…/c/project/+/123, …/#/c/123/, …/123/2) -> 123; anything else -> null
function changeNumber(text) {
  const s = String(text).trim();
  let m = s.match(/^#?(\d+)$/);
  if (m) return Number(m[1]);
  if (!/^https?:\/\//i.test(s)) return null;
  m = s.match(/\/\+\/(\d+)/) ?? s.match(/\/c\/(\d+)(?:\/|$)/) ?? s.match(/\/(\d+)\/?(?:\d+\/?)?(?:[?#].*)?$/);
  return m ? Number(m[1]) : null;
}
const LIMIT = 25;

const fs = () => Number(settings().ui_font_size) || 13;
const mono = () => settings().font_family || (window()?.platform === "windows" ? "Consolas" : "Menlo");
const stop = (_e, cx) => cx.stop_propagation();

// Gerrit time: "2026-11-09 11:37:51.000000000", UTC.
const when = (s) => Date.parse(String(s ?? "").replace(" ", "T").replace(/\.\d+$/, "") + "Z");
const ago = (s) => {
  const m = Math.max(0, Math.floor((Date.now() - when(s)) / 60000));
  return m < 1 ? "剛剛" : m < 60 ? `${m} 分前` : m < 1440 ? `${Math.floor(m / 60)} 小時前` : `${Math.floor(m / 1440)} 天前`;
};
const who = (a) => a?.display_name || a?.name || a?.username || (a?._account_id ? `#${a._account_id}` : "?");
// Check systems (Jenkins or any other) report to Gerrit by messages and votes. From a message: its votes
// ("Patch Set 3: Build+2 Test-1"), its text without that line, and a state guessed from both.
const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/g;
const msgBody = (m) => String(m?.message ?? "").replace(/^Patch Set \d+:[^\n]*\n*/, "").trim();
const msgVotes = (m) => {
  const h = String(m?.message ?? "").split("\n")[0].match(/^Patch Set \d+:(.*)$/);
  return h ? [...h[1].matchAll(/(?:^|\s)([\w.-]+?)([+-]\d+)(?=\s|$)/g)].map((x) => ({ label: x[1], value: Number(x[2]) })) : [];
};
function msgState(m) {
  const v = msgVotes(m), body = msgBody(m);
  if (v.some((x) => x.value < 0) || /\b(fail(ed|ure|s)?|error|abort(ed)?|unstable|time ?out)\b/i.test(body)) return "fail";
  if (v.some((x) => x.value > 0) || /\b(pass(ed)?|success(ful)?|succeeded)\b/i.test(body)) return "pass";
  if (/\b(start(ed|s|ing)?|running|queued|trigger(ed)?|register(ed)?|in progress)\b/i.test(body)) return "run";
  return "info";
}
// Only web links are opened, with the system's own opener.
async function openLink(url) {
  if (!/^https?:\/\//i.test(url)) return;
  const p = window()?.platform;
  try {
    if (p === "windows") await process.run("rundll32", ["url.dll,FileProtocolHandler", url]);
    else await process.run(p === "macos" ? "/usr/bin/open" : "xdg-open", [url]);
  } catch (e) {
    if (p === "windows") await process.run("C:\\Windows\\System32\\rundll32.exe", ["url.dll,FileProtocolHandler", url]).catch(() => {});
  }
}
const shortLink = (url) => {
  try { const u = new URL(url); const last = u.pathname.split("/").filter(Boolean).pop() ?? ""; return `${u.hostname}${last ? `/…/${last}` : ""}${u.search.length > 1 ? u.search.slice(0, 40) : ""}`; }
  catch { return url.slice(0, 60); }
};
// Gerrit's size column: XS < 10 lines, S < 50, M < 250, L < 1000, XL.
const size = (c) => {
  const n = (c.insertions ?? 0) + (c.deletions ?? 0);
  return n < 10 ? "XS" : n < 50 ? "S" : n < 250 ? "M" : n < 1000 ? "L" : "XL";
};
// "Code-Review" -> "CR", "Verified" -> "V", "Build" -> "B"; any case ("code-review" -> "CR")
const abbr = (name) => String(name).split(/[-_ ]+/).filter(Boolean).map((w) => w[0].toUpperCase()).join("") || String(name);

function b64(text) {
  const bytes = [];
  for (const ch of unescape(encodeURIComponent(text))) bytes.push(ch.charCodeAt(0));
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = bytes.slice(i, i + 3);
    const n = (a << 16) | (b << 8) | c;
    out += A[(n >> 18) & 63] + A[(n >> 12) & 63] + (i + 1 < bytes.length ? A[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? A[n & 63] : "=");
  }
  return out;
}

// One label as Gerrit shows it: ✓ approved, ✗ rejected, +1 / -1, or nothing.
function vote(t, l) {
  if (!l) return null;
  if (l.rejected) return { text: "✗", color: t.ansi1, strong: true };
  if (l.approved) return { text: "✓", color: t.ansi2, strong: true };
  if (l.disliked) return { text: String(l.value ?? -1), color: t.ansi1 };
  if (l.recommended) return { text: `+${l.value ?? 1}`, color: t.ansi2 };
  return null;
}
// A faint wash of a theme color (#rrggbb → #rrggbbaa); anything else is used as is.
const tint = (c, a = "24") => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c + a : c);
// A change in a URL: its number when known (Gerrit's "id" is already escaped, project%2Fsub~123: escaping it
// again breaks every project with a "/" in its name); else the id as given, escaped once.
const cid = (c) => (c?._number != null ? String(c._number) : encodeURIComponent(decodeURIComponent(String(c?.id ?? ""))));
const vim_name = (p) => (p === "/COMMIT_MSG" ? "提交說明" : p);
// Leading spaces and tabs kept visible (text wraps, so they'd collapse).
const keepIndent = (l) => String(l ?? "").replace(/^[ \t]+/, (m) => m.replace(/\t/g, "    ").replace(/ /g, "\u00a0"));

function voteValue(t, v) {
  const n = Number(v) || 0;
  return { text: n > 0 ? `+${n}` : String(n), color: n > 0 ? t.ansi2 : t.ansi1 };
}

export default class Gerrit extends View {
  init(_p, cx) {
    this.role = blockProps()?.role ?? "panel";
    if (this.role !== "toggle") { this.replyState(); this.peopleState(); this.searchState(); this.topicState(); } // input state can't be made while drawing
    // props {open: "<change id or number>", diff: "<file path>"} or {search: "<Gerrit search>"}: start there, e.g. in a tab of its own
    const start = blockProps() ?? {};
    this.inTab = Boolean(start.open || start.search); // a copy started on a change or search (its own tab): the panel's width isn't its business
    if (this.role !== "toggle" && start.search && !start.open) cx.spawn(async (cx) => { this.searchState().set_value(String(start.search)); await this.runSearch(cx); });
    if (this.role !== "toggle" && start.open) cx.spawn(async (cx) => {
      await this.openChange({ id: String(start.open) }, cx);
      if (start.diff && this.detail && !this.detail.error) await this.openDiff(String(start.diff), cx);
    });
    this.collapsed = new Set(JSON.parse(this.load("collapsed") ?? '["最近合併／放棄"]'));
    this.seen = JSON.parse(this.load("seen") ?? "null"); // change id -> updated; null until the first poll
    this.nextAt = 0;
    this.refreshSeen = shared(REFRESH) ?? 0;
    cx.timer.every(1000, (cx) => {
      if (!this.polls()) {
        // Redraw when the polling copy shares something new.
        const k = `${shared(DATA)?.at}|${shared(DATA)?.err}|${this.busy}|${JSON.stringify(shared(SAFE_CFG))}`;
        if (k !== this.drawn) { this.drawn = k; cx.notify(); }
        return;
      }
      const r = shared(REFRESH) ?? 0;
      if (r !== this.refreshSeen) { this.refreshSeen = r; this.nextAt = 0; }
      if (Date.now() >= this.nextAt) this.poll(cx);
    });
    cx.timer.every(30000, (cx) => cx.notify()); // keep "幾分前" fresh
    // Jenkins builds of the open change: every 10 s while one runs or waits, else every minute
    if (this.role !== "toggle") cx.timer.every(1000, (cx) => {
      const c = this.detail?.change;
      if (!c?._number || !this.cfg?.jenkins || this.jk?.loading) return;
      if (this.jk?.change !== c._number || Date.now() >= (this.jk.nextAt ?? 0)) this.loadJenkins(c, cx);
      else if (this.jk.builds?.some((b) => b.building)) cx.notify(); // the progress bar moves
    });
  }

  // One copy asks Gerrit: the tab-bar button when the layout has one, else the panel itself.
  polls() { return this.role === "toggle" || !find(layout(), TOGGLE); }
  get sections() { return shared(DATA)?.sections; }
  get err() { return shared(DATA)?.err ?? null; }
  get at() { return shared(DATA)?.at ?? null; }
  get busy() { return Boolean(shared(BUSY)); }
  get self() { return shared(DATA)?.self ?? null; }

  async moveIntoBar(cx) {
    this.moveErr = null;
    let name = shared("layout");
    if (SHIPPED.includes(name)) {
      // Herdr's own layout can't change shape: work on a copy of it (once; later moves reuse the copy).
      const as = `${name}-jay`;
      try { await run("layout.clone", { name, as }); } catch { await run("layout.switch", { name: as }); }
      await cx.sleep(800);
      name = shared("layout");
    }
    const tree = placed(layout());
    if (!tree) { this.moveErr = "這個版面沒有上排分頁列，沒辦法自動放；請把 docs/gerrit.md 的版面說明給 agent。"; cx.notify(); return; }
    await run("layout.set", { layout: tree });
  }

  load(k) { try { return localStorage.getItem(`gerrit.${k}`); } catch { return null; } }
  save(k, v) { try { localStorage.setItem(`gerrit.${k}`, v); } catch {} }

  async readConfig() {
    const text = await readTextFile(CONFIG()).catch(() => null);
    if (text == null) return { missing: true };
    try {
      const c = JSON.parse(text);
      if (!c.url) return { error: "gerrit.json 沒有 url" };
      c.url = String(c.url).replace(/\/+$/, "");
      c.auth = Boolean(c.user && c.http_password);
      return c;
    } catch (e) { return { error: `gerrit.json 格式不對：${e.message ?? e}` }; }
  }

  // GET a REST path; with a user it goes through /a/ (authenticated). Strips Gerrit's )]}' prefix.
  get(path) { return this.req("GET", path); }
  // A write (POST/PUT/DELETE with a JSON body) needs the login: only /a/ takes Basic auth.
  async req(method, path, json) {
    const c = this.cfg;
    const headers = { Accept: "application/json" };
    if (c.auth) headers.Authorization = `Basic ${b64(`${c.user}:${c.http_password}`)}`;
    if (method !== "GET" && !c.auth) throw new Error("要先在 gerrit.json 填帳號和 HTTP 密碼才能回覆、給分");
    const init = { method, headers };
    if (json !== undefined) { headers["Content-Type"] = "application/json; charset=UTF-8"; init.body = JSON.stringify(json); }
    const r = await fetch(`${c.url}${c.auth ? "/a" : ""}${path}`, init);
    const body = await r.text();
    if (!r.ok) {
      const why = r.status === 401 ? "帳號或 HTTP 密碼不對（401）" : r.status === 403 ? "沒有權限（403）" : `HTTP ${r.status}`;
      throw new Error(`${why}${body && r.status !== 401 ? `：${body.trim().split("\n")[0].slice(0, 120)}` : ""}`);
    }
    const text = body.replace(/^\)\]\}'\n?/, "");
    return text.trim() ? JSON.parse(text) : null;
  }

  // Run a write, then reread the change and tell the polling copy to refresh the lists.
  async act(key, fn, cx) {
    if (this.sending) return;
    this.sending = key;
    this.actErr = null;
    cx.notify();
    try {
      this.cfg = await this.readConfig();
      await fn();
      this.armed = null;
      setShared(REFRESH, Date.now());
      if (this.detail) await this.openChange(this.detail.change, cx, true);
      return true;
    } catch (e) {
      this.actErr = String(e.message ?? e);
      return false;
    } finally {
      this.sending = null;
      cx.notify();
    }
  }

  // Made in init (never in render). The search box above the list.
  searchState() {
    if (!this.searchBox) {
      this.searchBox = InputState.new({ placeholder: "號碼、網址，或 owner:alice is:open …" });
      this.searchBox.on("submit", (_e, cx) => cx.spawn(async (cx) => this.runSearch(cx))); // Enter
    }
    return this.searchBox;
  }

  // A number or a pasted Gerrit link opens that change; anything else is a Gerrit search (same text as its search box).
  // ---- Where you've been: ← 返回 goes back one page, like a browser ----
  remember() {
    (this.history ??= []).push({ openId: this.openId, detail: this.detail, diff: this.diff, search: this.search, cmp: this.cmp, cmpFiles: this.cmpFiles, q: this.searchState().value() });
    if (this.history.length > 30) this.history.shift();
  }

  goBack(cx) {
    const h = this.history?.pop();
    // what was being typed or picked belongs to the page being left
    this.picked = {}; this.threadReply = null; this.armed = null; this.actErr = null; this.reply?.set_value("");
    this.addingPeople = false; this.found = []; this.editTopic = false; this.lineBox = null;
    if (!h) { // nothing remembered (e.g. started on a change): one level up
      if (this.diff) this.diff = null; else { this.openId = null; this.detail = null; }
      cx.notify();
      return;
    }
    Object.assign(this, { openId: h.openId, detail: h.detail, diff: h.diff, search: h.search, cmp: h.cmp, cmpFiles: h.cmpFiles });
    this.searchState().set_value(h.q ?? "");
    cx.notify();
    if (h.detail?.change && !h.detail.error && !h.diff) cx.spawn(async (cx) => this.openChange(h.detail.change, cx, true)); // may have changed meanwhile
  }

  async runSearch(cx) {
    const q = this.searchState().value().trim();
    if (!q) { this.search = null; cx.notify(); return; }
    if (this.search?.q !== q) this.remember();
    const n = changeNumber(q);
    if (n) { this.search = null; this.searchState().set_value(""); await this.openChange({ _number: n, id: String(n) }, cx); return; }
    this.search = { q, loading: true, items: [] };
    cx.notify();
    try {
      this.cfg = await this.readConfig();
      const items = await this.get(`/changes/?q=${encodeURIComponent(`${q} limit:${SEARCH_LIMIT}`)}&${OPTS}`);
      if (this.search?.q === q) this.search = { q, items: items ?? [] };
    } catch (e) {
      if (this.search?.q === q) this.search = { q, items: [], error: String(e.message ?? e) };
    }
    cx.notify();
  }

  // Abandon (press twice), restore, rebase, WIP / ready: only what Gerrit says this change allows you now.
  async changeAction(c, what, cx) {
    if (what === "abandon" && (this.armed !== `abandon-${c.id}` || Date.now() - this.armedAt > 4000)) {
      this.armed = `abandon-${c.id}`; this.armedAt = Date.now(); cx.notify();
      cx.spawn(async (cx) => { await cx.sleep(4100); cx.notify(); });
      return;
    }
    const path = what === "rebase" ? `/changes/${cid(c)}/revisions/current/rebase` : `/changes/${cid(c)}/${what}`;
    await this.act(what, () => this.req("POST", path, {}), cx);
  }

  changeButtons(t, z, c) {
    const on = (k) => c.actions?.[k]?.enabled === true;
    const revOn = (k) => c.revisions?.[c.current_revision]?.actions?.[k]?.enabled === true;
    const busy = Boolean(this.sending);
    const row = h_flex().gap(6).flex_wrap();
    const b = (what, label, kind) => row.child(this.big(t, z, `ca-${what}`, this.sending === what ? "處理中…" : label,
      { kind, off: busy, on: (cx) => cx.spawn(async (cx) => this.changeAction(c, what, cx)) }));
    if (revOn("rebase")) b("rebase", "⤴ Rebase");
    if (on("ready")) b("ready", "✓ 可以 review 了（Ready）");
    if (on("wip")) b("wip", "✎ 改回草稿（WIP）");
    if (on("restore")) b("restore", "↺ 恢復（Restore）");
    if (on("abandon")) {
      const armed = this.armed === `abandon-${c.id}` && Date.now() - this.armedAt <= 4000;
      b("abandon", armed ? "再按一次確認放棄" : "🗑 放棄（Abandon）", armed ? "danger" : undefined);
    }
    return row;
  }

  // ---- Jenkins: builds of this change (a job parameter holds the change number), start one, follow its log ----
  jenkinsCfg() {
    const j = this.cfg?.jenkins;
    if (!j?.url) return null;
    return { ...j, url: String(j.url).replace(/\/+$/, ""), jobs: [].concat(j.jobs ?? []), param: j.change_param ?? "GERRIT_CHANGE" };
  }

  // Only ever to the configured Jenkins address: the token goes nowhere else.
  async jreq(method, path, body) {
    const j = this.jenkinsCfg();
    const headers = {};
    if (j.user && j.token) headers.Authorization = `Basic ${b64(`${j.user}:${j.token}`)}`;
    const init = { method, headers };
    if (body != null) { headers["Content-Type"] = "application/x-www-form-urlencoded"; init.body = body; }
    const r = await fetch(`${j.url}/${path.replace(/^\/+/, "")}`, init);
    const text = await r.text();
    if (!r.ok) {
      const why = r.status === 401 ? "帳號或 API token 不對（401）" : r.status === 403 ? "沒有權限（403）" : r.status === 404 ? "找不到（404）：job 名稱或網址不對" : `HTTP ${r.status}`;
      throw new Error(why);
    }
    return text;
  }

  async loadJenkins(c, cx) {
    const j = this.jenkinsCfg();
    if (!j || !j.jobs.length) return;
    const n = String(c._number);
    const prev = this.jk?.change === c._number ? this.jk : null;
    this.jk = { ...(prev ?? { change: c._number }), loading: true };
    try {
      const has = (b) => String(param(b, j.param) ?? "").split(/[\s,]+/).includes(n);
      const tree = `builds[number,building,result,duration,estimatedDuration,timestamp,actions[parameters[name,value]]]{0,${JENKINS_BUILDS}}`;
      const lists = await Promise.all(j.jobs.map(async (job) => {
        const d = JSON.parse(await this.jreq("GET", `${jobPath(job)}/api/json?tree=${encodeURIComponent(tree)}`));
        return (d.builds ?? []).filter(has).map((b) => ({ ...b, job, path: `${jobPath(job)}/${b.number}` }));
      }));
      const builds = lists.flat().sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
      const names = new Set([...j.jobs, j.start_job].filter(Boolean).map(jobName));
      const q = JSON.parse(await this.jreq("GET", `queue/api/json?tree=${encodeURIComponent("items[id,why,inQueueSince,task[name],actions[parameters[name,value]]]")}`).catch(() => "{}"));
      const queue = (q.items ?? []).filter((it) => names.has(it.task?.name) && has(it));
      // tell when a build you were watching finishes
      for (const b of builds) {
        const was = prev?.builds?.find((x) => x.path === b.path);
        if (was?.building && !b.building) notify({ title: `${jobName(b.job)} ${b.result === "SUCCESS" ? "成功" : b.result === "FAILURE" ? "失敗" : b.result ?? "結束"}：#${c._number}`,
          body: c.subject ?? "", level: b.result === "SUCCESS" ? "info" : "warning", timeout: 10000 });
      }
      const busy = builds.some((b) => b.building) || queue.length > 0 || (this.jk.startedAt && Date.now() - this.jk.startedAt < 120000);
      this.jk = { ...this.jk, builds, queue, error: null, at: Date.now(), nextAt: Date.now() + (busy ? 10000 : 60000) };
      for (const b of builds) if (this.jk.logs?.[b.path]?.open && (b.building || this.jk.logs[b.path].building)) await this.tailLog(b, cx, true);
    } catch (e) {
      this.jk = { ...this.jk, error: String(e.message ?? e), nextAt: Date.now() + 60000 };
    } finally {
      this.jk = { ...this.jk, loading: false };
      cx.notify();
    }
  }

  // ▶ the start job with this change number (a parameterized job's buildWithParameters; 201 = queued)
  async startJenkins(c, cx) {
    const j = this.jenkinsCfg();
    if (!j?.start_job || this.jk?.starting) return;
    this.jk = { ...(this.jk?.change === c._number ? this.jk : { change: c._number }), starting: true, error: null };
    cx.notify();
    try {
      const form = formBody({ ...(j.start_params ?? {}), [j.param]: String(c._number) });
      await this.jreq("POST", `${jobPath(j.start_job)}/buildWithParameters`, form);
      this.jk = { ...this.jk, startedAt: Date.now(), nextAt: Date.now() + 3000 };
    } catch (e) {
      this.jk = { ...this.jk, error: `沒送出：${e.message ?? e}` };
    } finally {
      this.jk = { ...this.jk, starting: false };
      cx.notify();
    }
  }

  // The end of a build's log, kept up to date while it runs: the whole text once, then only what was added.
  async tailLog(b, cx, quiet) {
    const logs = (this.jk.logs ??= {});
    const L = logs[b.path] ?? { text: "", bytes: 0 };
    logs[b.path] = { ...L, open: true, loading: !quiet };
    if (!quiet) cx.notify();
    try {
      const add = L.bytes ? await this.jreq("GET", `${b.path}/logText/progressiveText?start=${L.bytes}`) : await this.jreq("GET", `${b.path}/consoleText`);
      const text = (L.text + add).split("\n").slice(-200).join("\n");
      logs[b.path] = { open: true, text, bytes: L.bytes + utf8len(add), building: b.building };
    } catch (e) {
      logs[b.path] = { ...L, open: true, error: String(e.message ?? e) };
    }
    cx.notify();
  }

  jenkinsCard(t, z, c) {
    const j = this.jenkinsCfg();
    if (!j || (!j.jobs.length && !j.start_job)) return null;
    if (!j.jobs.length && c.status !== "NEW") return null;
    const jk = this.jk?.change === c._number ? this.jk : null;
    const card = v_flex().id("jenkins").gap(6).p(10).rounded(8).bg(t.chrome).border_1().border_color(t.border);
    const head = h_flex().gap(8).items_center()
      .child(div().flex_1().min_w(0).truncate().text_size(z - 1).font_semibold().text_color(t.muted).child(j.jobs.length ? `Jenkins：${j.jobs.map(jobName).join("、")}` : "Jenkins"));
    if (j.start_job && c.status === "NEW") head.child(this.big(t, z, "jk-start",
      jk?.starting ? "送出中…" : jk?.startedAt && Date.now() - jk.startedAt < 20000 ? "✓ 已送出" : `▶ 跑 ${jobName(j.start_job)}`,
      { kind: "primary", off: Boolean(jk?.starting || (jk?.startedAt && Date.now() - jk.startedAt < 20000)), on: (cx) => cx.spawn(async (cx) => this.startJenkins(c, cx)) }));
    card.child(head);
    // only the start button (no "jobs" to watch): the systems' messages under 合併條件 tell how it goes
    if (!j.jobs.length) return card
      .when(Boolean(jk?.error), (el) => el.child(div().text_size(z - 1).text_color(t.ansi1).whitespace_normal().child(`Jenkins ${jk.error}`)))
      .when(Boolean(jk?.startedAt && !jk?.error), (el) => el.child(div().text_size(z - 1).text_color(t.muted).whitespace_normal()
        .child(`${ago(new Date(jk.startedAt).toISOString().replace("T", " ").replace("Z", ""))}送出；結果會出現在上面的合併條件`)));
    if (!jk || (jk.loading && !jk.at)) return card.child(div().text_size(z - 1).text_color(t.muted).child("讀取 Jenkins…"));
    if (jk.error) card.child(div().text_size(z - 1).text_color(t.ansi1).whitespace_normal().child(`Jenkins ${jk.error.startsWith("沒送出") ? "" : "讀不到："}${jk.error}`));
    for (const it of jk.queue ?? []) card.child(h_flex().id(`jq-${it.id}`).gap(8).items_center().text_size(z - 1)
      .child(div().w(18).flex_none().text_color(t.accent).child("⏳"))
      .child(div().flex_1().min_w(0).whitespace_normal().child(`${it.task?.name ?? ""} 排隊中 · 等了 ${mins(Date.now() - it.inQueueSince)}${it.why ? ` · ${String(it.why).slice(0, 120)}` : ""}`)));
    if (!jk.builds?.length && !jk.queue?.length && !jk.error) card.child(div().text_size(z - 1).text_color(t.dim)
      .child(jk.startedAt && Date.now() - jk.startedAt < 120000 ? "已送出，等 Jenkins 排上…" : `最近 ${JENKINS_BUILDS} 次 build 裡沒有這個 change`));
    for (const b of jk.builds ?? []) {
      const res = b.building ? { i: "●", color: t.accent, text: "跑中" } : b.result === "SUCCESS" ? { i: "✓", color: t.ansi2, text: "成功" }
        : b.result === "FAILURE" ? { i: "✗", color: t.ansi1, text: "失敗" } : b.result === "UNSTABLE" ? { i: "!", color: t.ansi3, text: "不穩定" }
        : b.result === "ABORTED" ? { i: "⊘", color: t.muted, text: "取消" } : { i: "?", color: t.muted, text: b.result ?? "" };
      const ran = b.building ? Date.now() - b.timestamp : b.duration;
      const est = b.estimatedDuration > 0 ? b.estimatedDuration : 0;
      const others = String(param(b, j.param) ?? "").split(/[\s,]+/).filter((x) => x && x !== String(c._number));
      const by = param(b, "TRIGGER_BY");
      const row = v_flex().id(`jb-${b.path}`).gap(3)
        .child(h_flex().gap(8).items_center().text_size(z - 1)
          .child(div().w(18).flex_none().font_semibold().text_color(res.color).child(res.i))
          .child(div().flex_none().font_family(mono()).child(`#${b.number}`))
          .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child([
            res.text,
            b.building ? `跑了 ${mins(ran)}${est ? `／平常 ${mins(est)}` : ""}${est && ran > est ? "（比平常久）" : ""}` : `${mins(ran)} · ${ago(new Date(b.timestamp + (b.duration ?? 0)).toISOString().replace("T", " ").replace("Z", ""))}`,
            j.jobs.length > 1 ? jobName(b.job) : "", by && by !== "NA" ? by : "", others.length ? `一起跑 ${others.length} 個` : "",
          ].filter(Boolean).join(" · ")))
          .child(div().id(`jlog-${b.path}`).flex_none().px(8).h(26).flex().items_center().rounded(5).bg(t.raised).cursor_pointer().hover((st) => st.bg(t.hover))
            .on_mouse_down("left", stop).on_click((_e, cx) => {
              const L = jk.logs?.[b.path];
              if (L?.open) { L.open = false; cx.notify(); } else cx.spawn(async (cx) => this.tailLog(b, cx));
            })
            .child(jk.logs?.[b.path]?.open ? "收起 log" : "📜 log")));
      if (b.building && est) {
        const pct = Math.min(0.99, ran / est);
        // a bar as wide as the panel: the filled part grows by the share done, the empty part by the rest
        row.child(h_flex().id(`jbar-${b.path}`).ml(26).h(6).rounded(3).bg(t.raised)
          .child(div().h(6).rounded(3).bg(ran > est ? t.ansi3 : t.accent).flex_grow(Math.max(0.01, pct)))
          .child(div().h(6).flex_grow(Math.max(0.0001, 1 - pct))));
      }
      const L = jk.logs?.[b.path];
      if (L?.open) row.child(div().id(`jlogtext-${b.path}`).ml(26).p(6).rounded(5).bg(t.background).font_family(mono()).text_size(z - 2).whitespace_normal()
        .text_color(L.error ? t.ansi1 : t.foreground)
        .child(L.loading ? "讀取 log…" : L.error ? `讀不到 log：${L.error}` : (L.text.split("\n").slice(-40).join("\n") || "（還沒有輸出）")));
      card.child(row);
    }
    return card;
  }

  // Made in init (never in render). The box to set a change's topic.
  topicState() {
    if (!this.topicBox) {
      this.topicBox = InputState.new({ placeholder: "topic 名稱（空白 = 拿掉）" });
      this.topicBox.on("submit", (_e, cx) => { const c = this.detail?.change; if (c) cx.spawn(async (cx) => this.setTopic(c, cx)); }); // Enter
    }
    return this.topicBox;
  }

  // PUT topic, or DELETE it when the box is empty.
  async setTopic(c, cx) {
    const topic = this.topicState().value().trim();
    const ok = await this.act("topic", () => (topic ? this.req("PUT", `/changes/${cid(c)}/topic`, { topic }) : this.req("DELETE", `/changes/${cid(c)}/topic`)), cx);
    if (ok) this.editTopic = false;
  }

  searchFor(q, cx) {
    this.remember();
    this.searchState().set_value(q);
    this.openId = null; this.detail = null; this.diff = null;
    this.search = { q, loading: true, items: [] }; // already remembered: runSearch won't again for the same text
    cx.spawn(async (cx) => this.runSearch(cx));
  }

  // Topic: the name (click = search it), ✎ to change; then the other changes of the topic, like Gerrit's "Same topic".
  topicRows(t, z, c) {
    const out = [];
    const canEdit = Boolean(shared(SAFE_CFG)?.auth) && c.actions?.topic?.enabled === true;
    const small = (id, label, on) => div().id(id).px(6).rounded(4).cursor_pointer().text_color(t.accent).hover((st) => st.bg(t.hover))
      .on_mouse_down("left", stop).on_click((_e, cx) => on(cx)).child(label);
    if (this.editTopic) {
      out.push(h_flex().id("topic-edit").gap(6).items_center()
        .child(div().w(72).flex_none().text_size(z - 1).text_color(t.muted).child("Topic"))
        .child(div().id("topic-box").flex_1().min_w(0).h(34).px(6).flex().items_center().rounded(6).bg(t.background).border_1().border_color(t.input)
          .cursor_text().on_mouse_down("left", stop)
          .child(Input.new(this.topicState()).w_full().text_size(z).text_color(t.foreground)))
        .child(this.big(t, z, "topic-save", this.sending === "topic" ? "存檔中…" : "存", { kind: "primary", off: Boolean(this.sending), on: (cx) => cx.spawn(async (cx) => this.setTopic(c, cx)) }))
        .child(this.big(t, z, "topic-cancel", "取消", { on: (cx) => { this.editTopic = false; cx.notify(); } })));
    } else if (c.topic || canEdit) {
      out.push(h_flex().id("topic").gap(6).items_center().text_size(z - 1)
        .child(div().w(72).flex_none().text_color(t.muted).child("Topic"))
        .when(Boolean(c.topic), (el) => el.child(div().id("topic-name").px(6).rounded(4).bg(t.raised).cursor_pointer().hover((st) => st.bg(t.hover))
          .on_mouse_down("left", stop).on_click((_e, cx) => this.searchFor(`topic:"${c.topic}"`, cx)).child(`🏷 ${c.topic}`)))
        .when(!c.topic, (el) => el.child(div().text_color(t.dim).child("沒有")))
        .when(canEdit, (el) => el.child(small("topic-change", c.topic ? "✎ 改" : "＋ 設定", (cx) => {
          this.topicState().set_value(c.topic ?? ""); this.editTopic = true; cx.notify();
          cx.spawn(async (cx) => { await cx.sleep(50); this.topicState().focus(); });
        }))));
    }
    const others = this.detail.topic;
    if (c.topic && others) {
      const tg = this.detail.together, whole = (tg?.changes?.length ?? 0) > 1;
      out.push(div().pt(4).text_size(z - 1).font_semibold().text_color(whole ? t.blocked : t.muted)
        .child(`同一個 topic（另外 ${others.length} 個${whole ? "，合併時會一起送出" : ""}${tg?.non_visible_changes ? `，還有 ${tg.non_visible_changes} 個你看不到` : ""}）`));
      if (!others.length) out.push(div().text_size(z - 1).text_color(t.dim).child("只有這一個"));
      for (const o of others) out.push(this.relatedRow(t, z, o));
    }
    return out;
  }

  // One line per related change: number, subject, project, status / scores; click opens it.
  relatedRow(t, z, o) {
    const labels = Object.entries(o.labels ?? {}).map(([name, l]) => [name, vote(t, l)]).filter(([, v]) => v);
    return h_flex().id(`rel-${o._number}`).gap(8).items_center().px(4).py(3).rounded(5).text_size(z - 1)
      .cursor_pointer().hover((st) => st.bg(t.hover)).on_mouse_down("left", stop)
      .on_click((_e, cx) => { this.remember(); cx.spawn(async (cx) => this.openChange(o, cx)); })
      .child(div().flex_none().font_family(mono()).text_color(t.muted).child(String(o._number)))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().child(o.subject))
        .child(div().truncate().text_size(z - 2).text_color(t.muted).child(`${o.project} · ${o.branch} · ${who(o.owner)}`)))
      .children(this.chips(t, z, o))
      .child(h_flex().flex_none().gap(5).font_family(mono()).children(labels.map(([name, v]) =>
        h_flex().id(`rl-${o._number}-${name}`).gap(1).child(div().text_color(t.dim).child(abbr(name))).child(div().text_color(v.color).child(v.text)))))
      .child(div().flex_none().text_color(t.muted).child("›"));
  }

  // Made in init (never in render). The box to find someone to add as reviewer or CC.
  peopleState() {
    if (!this.people) {
      this.people = InputState.new({ placeholder: "名字、帳號或 email" });
      this.people.on("submit", (_e, cx) => cx.spawn(async (cx) => this.findPeople(cx))); // Enter
    }
    return this.people;
  }

  // Gerrit's account suggestions (like the box in its REPLY dialog).
  async findPeople(cx) {
    const q = this.peopleState().value().trim();
    if (!q) { this.found = []; cx.notify(); return; }
    this.finding = true; this.actErr = null; cx.notify();
    try {
      this.cfg = await this.readConfig();
      this.found = (await this.get(`/accounts/?suggest&q=${encodeURIComponent(q)}&n=8&o=DETAILS`)) ?? [];
      if (!this.found.length) this.actErr = `找不到「${q}」`;
    } catch (e) { this.actErr = String(e.message ?? e); this.found = []; }
    finally { this.finding = false; cx.notify(); }
  }

  // state: "REVIEWER" or "CC". Moving someone between the two is the same call.
  async addPerson(c, account, state, cx) {
    const ok = await this.act(`person-${account._account_id}`, () => this.req("POST", `/changes/${cid(c)}/reviewers`, { reviewer: String(account._account_id), state }), cx);
    if (ok) { this.found = []; this.peopleState().set_value(""); }
  }

  async removePerson(c, account, cx) {
    await this.act(`person-${account._account_id}`, () => this.req("POST", `/changes/${cid(c)}/reviewers/${account._account_id}/delete`, { notify: "OWNER" }), cx);
  }

  // Reviewer and CC rows of a change's page, with + 加人 (search, then 加 Reviewer / 加 CC) and ✕ to remove.
  peopleRows(t, z, c) {
    const out = [];
    const can = Boolean(shared(SAFE_CFG)?.auth) && c.status === "NEW";
    const busy = Boolean(this.sending);
    const att = new Set(Object.keys(c.attention_set ?? {}).map(String));
    const row = (label, list, other) => h_flex().id(`people-${label}`).gap(6).flex_wrap().items_center().text_size(z - 1)
      .child(div().w(72).flex_none().text_color(t.muted).child(label))
      .children(list.length ? list.map((a) => h_flex().id(`p-${label}-${a._account_id}`).gap(4).items_center().px(6).py(1).rounded(4).bg(t.raised)
        .child(div().text_color(att.has(String(a._account_id)) ? t.blocked : t.foreground).child(who(a)))
        .when(can && a._account_id !== c.owner?._account_id, (el) => el
          .child(div().id(`p-move-${a._account_id}`).px(3).rounded(3).text_color(t.accent).cursor_pointer().hover((st) => st.bg(t.hover))
            .on_mouse_down("left", stop).on_click((_e, cx) => { if (!busy) cx.spawn(async (cx) => this.addPerson(c, a, other, cx)); })
            .child(other === "CC" ? "→CC" : "→Reviewer"))
          // Gerrit lets the owner remove anyone and you remove yourself (others need an admin's Remove Reviewer right)
          .when(c.owner?._account_id === this.self?._account_id || a._account_id === this.self?._account_id, (el) => el.child(div().id(`p-del-${a._account_id}`).px(3).rounded(3).text_color(t.muted).cursor_pointer().hover((st) => st.bg(t.hover))
            .on_mouse_down("left", stop).on_click((_e, cx) => { if (!busy) cx.spawn(async (cx) => this.removePerson(c, a, cx)); })
            .child("✕"))))) : [div().text_color(t.dim).child("沒有")]);
    const rv = c.reviewers ?? {};
    out.push(row("Reviewer", (rv.REVIEWER ?? []).filter((a) => a._account_id !== c.owner?._account_id), "CC"));
    out.push(row("CC", rv.CC ?? [], "REVIEWER"));
    if (!can) return out;
    if (!this.addingPeople) {
      out.push(h_flex().child(this.big(t, z, "people-open", "＋ 加 Reviewer／CC", { on: (cx) => { this.addingPeople = true; this.found = []; cx.notify(); } })));
      return out;
    }
    const box = v_flex().gap(6).p(8).rounded(8).bg(t.chrome).border_1().border_color(t.border)
      .child(h_flex().gap(6).items_center()
        .child(div().id("people-box").flex_1().h(34).px(6).flex().items_center().rounded(6).bg(t.background).border_1().border_color(t.input)
          .cursor_text().on_mouse_down("left", stop)
          .child(Input.new(this.peopleState()).w_full().text_size(z).text_color(t.foreground)))
        .child(this.big(t, z, "people-find", this.finding ? "找…" : "🔍 找人", { kind: "primary", off: this.finding, on: (cx) => cx.spawn(async (cx) => this.findPeople(cx)) }))
        .child(this.big(t, z, "people-close", "關閉", { on: (cx) => { this.addingPeople = false; this.found = []; cx.notify(); } })));
    for (const a of this.found ?? []) {
      box.child(h_flex().id(`found-${a._account_id}`).gap(6).items_center().flex_wrap()
        .child(v_flex().flex_1().min_w(120)
          .child(div().text_size(z).child(who(a)))
          .child(div().text_size(z - 2).text_color(t.muted).child([a.username, a.email].filter(Boolean).join(" · ") || `#${a._account_id}`)))
        .child(this.big(t, z, `add-r-${a._account_id}`, "加 Reviewer", { off: busy, on: (cx) => cx.spawn(async (cx) => this.addPerson(c, a, "REVIEWER", cx)) }))
        .child(this.big(t, z, `add-c-${a._account_id}`, "加 CC", { off: busy, on: (cx) => cx.spawn(async (cx) => this.addPerson(c, a, "CC", cx)) })));
    }
    if (this.actErr) box.child(div().text_size(z - 1).text_color(t.ansi1).whitespace_normal().child(this.actErr));
    out.push(box);
    return out;
  }

  // Made in init (never in render). The reply box and the votes picked for the open change (sent together, like Gerrit's REPLY dialog).
  replyState() {
    if (!this.reply) {
      this.reply = TextareaState.new({ placeholder: "寫回覆（可以空白，只送分數）", rows: 3 });
      this.reply.set_auto_grow(3, 10);
      this.reply.set_soft_wrap(true);
    }
    return this.reply;
  }

  async sendReply(c, cx) {
    const message = this.replyState().value().trim();
    const labels = { ...(this.picked ?? {}) };
    if (!message && !Object.keys(labels).length) { this.actErr = "沒有要送的：寫點回覆或選個分數"; cx.notify(); return; }
    const ok = await this.act("reply", () => this.req("POST", `/changes/${cid(c)}/revisions/current/review`,
      { ...(message ? { message } : {}), ...(Object.keys(labels).length ? { labels } : {}), drafts: "PUBLISH_ALL_REVISIONS" }), cx);
    if (ok) { this.reply.set_value(""); this.picked = {}; cx.notify(); }
  }

  // Reply in a comment thread: on the patch set and spot of its last comment, like Gerrit's quick replies.
  async replyThread(c, x, message, resolve, cx) {
    const last = x.msgs[x.msgs.length - 1];
    const cm = { in_reply_to: last.id, message, unresolved: !resolve };
    if (last.line) cm.line = last.line;
    if (last.range) cm.range = last.range;
    if (last.side) cm.side = last.side;
    const ok = await this.act(`th-${x.root.id}`, () => this.req("POST",
      `/changes/${cid(c)}/revisions/${last.patch_set}/review`, { comments: { [last.path]: [cm] } }), cx);
    if (ok && this.threadReply?.id === x.root.id) this.threadReply = null;
  }

  async submit(c, cx) {
    if (this.armed !== `submit-${c.id}` || Date.now() - this.armedAt > 4000) {
      this.armed = `submit-${c.id}`; this.armedAt = Date.now(); cx.notify();
      cx.spawn(async (cx) => { await cx.sleep(4100); cx.notify(); });
      return;
    }
    await this.act("submit", () => this.req("POST", `/changes/${cid(c)}/submit`, {}), cx);
  }

  sectionsFor(c) {
    const own = Array.isArray(c.sections) && c.sections.length ? c.sections : null;
    // Without a login "self" means nobody: show what the config asks for, or an open-changes list.
    return own ?? (c.auth ? DEFAULT_SECTIONS : [{ title: "公開的 change（沒有登入）", query: "is:open" }]);
  }

  async poll(cx) {
    if (this.polling) return;
    this.polling = true;
    setShared(BUSY, true);
    const data = { ...(shared(DATA) ?? {}) };
    try {
      this.cfg = await this.readConfig();
      const c = this.cfg;
      setShared(SAFE_CFG, { missing: Boolean(c.missing), error: c.error ?? null, url: c.url ?? null, auth: Boolean(c.auth) });
      if (c.missing || c.error) { this.nextAt = Date.now() + 10000; return; }
      if (c.auth && !this.me) {
        const a = await this.get("/accounts/self").catch(() => null);
        this.me = a && { _account_id: a._account_id, name: who(a) };
      }
      data.self = c.auth ? this.me ?? null : null;
      if (!this.version || this.versionOf !== c.url) { // once per address: shown under the title
        this.version = await this.get("/config/server/version").catch(() => null);
        this.versionOf = c.url;
      }
      data.version = this.version;
      const secs = this.sectionsFor(c);
      const q = secs.map((s) => `q=${encodeURIComponent(`${s.query} limit:${s.limit ?? LIMIT}`)}`).join("&");
      let lists;
      try {
        lists = await this.get(`/changes/?${q}&${OPTS}`);
        if (secs.length === 1) lists = [lists];
      } catch (e) {
        // One query this Gerrit doesn't know (attention: needs 3.3+) fails them all: ask one by one.
        lists = [];
        // A Gerrit older than 3.3 has no attention set: drop "-attention:self" there (the 輪到你 section itself says why).
        const one = (q) => this.get(`/changes/?q=${encodeURIComponent(`${q} limit:${LIMIT}`)}&${OPTS}`);
        for (const s of secs) lists.push(await this.get(`/changes/?q=${encodeURIComponent(`${s.query} limit:${s.limit ?? LIMIT}`)}&${OPTS}`)
          .catch((e2) => (/attention/i.test(String(e2.message)) && /-attention:self/.test(s.query) ? one(s.query.replace(/\s*-attention:self/g, "")) : Promise.reject(e2)))
          .catch((e2) => ({ error: String(e2.message ?? e2) })));
        if (lists.every((l) => l.error)) throw e;
      }
      data.sections = secs.map((s, i) => ({ ...s, items: Array.isArray(lists[i]) ? lists[i] : [], error: lists[i]?.error ?? null }));
      data.err = null;
      data.at = Date.now();
      await this.tell(data.sections, data.self);
    } catch (e) {
      data.err = String(e.message ?? e);
    } finally {
      setShared(DATA, data);
      setShared(BUSY, false);
      this.polling = false;
      if (!(this.cfg?.missing || this.cfg?.error)) this.nextAt = Date.now() + Math.max(15, Number(this.cfg?.poll_seconds) || 60) * 1000;
      cx.notify();
    }
  }

  // Notify like Gerrit's mail: a change turned to you, or someone else replied / voted. Nothing on the first poll.
  async tell(sections, self) {
    const now = {};
    const turn = new Set();
    for (const s of sections) for (const c of s.items) {
      now[c.id] = c.updated;
      if (s.turn) turn.add(c.id);
    }
    const before = this.seen;
    const turnBefore = new Set(JSON.parse(this.load("turn") ?? "[]"));
    this.seen = now;
    this.save("seen", JSON.stringify(now));
    this.save("turn", JSON.stringify([...turn]));
    if (!before || !self) return; // without a login there is no "you": nothing to tell
    let sent = 0;
    const all = new Map(sections.flatMap((s) => s.items.map((c) => [c.id, c])));
    for (const [id, c] of all) {
      if (sent >= 3) break;
      const newTurn = turn.has(id) && !turnBefore.has(id);
      if (!newTurn && (!before[id] || before[id] === c.updated)) continue;
      let line = "";
      try {
        const msgs = await this.get(`/changes/${cid(c)}/messages`);
        const last = msgs[msgs.length - 1];
        if (!newTurn && last && last.author?._account_id === self._account_id) continue; // my own reply
        if (last) line = `${who(last.author)}：${String(last.message ?? "").split("\n").filter(Boolean).slice(0, 2).join(" ")}`;
      } catch {}
      const reason = newTurn ? (c.attention_set?.[self._account_id]?.reason ?? "").replace(/<GERRIT_ACCOUNT_\d+>/g, "有人") : "";
      notify({ title: `${newTurn ? "輪到你" : "Gerrit 有新動態"}：#${c._number} ${c.subject}`, body: line || reason || c.project, level: newTurn ? "warning" : "info", timeout: 10000,
        action: { name: "layout.show", args: { id: PANEL } } });
      sent++;
    }
  }

  async openChange(c, cx, quiet) {
    if (!quiet || this.openId !== c.id) {
      if (this.openId !== c.id) { this.picked = {}; this.threadReply = null; this.armed = null; this.actErr = null; this.reply?.set_value(""); this.addingPeople = false; this.found = []; this.cmp = null; this.cmpFiles = null; this.editTopic = false; }
      this.openId = c.id;
      this.detail = { change: c, loading: true };
      cx.notify();
    }
    try {
      this.cfg = await this.readConfig(); // the panel's own copy (the button may be the one polling)
      const id = cid(c);
      const [d, comments] = await Promise.all([
        this.get(`/changes/${id}/detail?o=ALL_REVISIONS&o=CURRENT_FILES&o=CURRENT_COMMIT&o=DETAILED_LABELS&o=MESSAGES&o=SUBMITTABLE&o=CHANGE_ACTIONS&o=CURRENT_ACTIONS&o=SUBMIT_REQUIREMENTS`),
        this.get(`/changes/${id}/comments`).catch(() => ({})),
      ]);
      const [topic, together] = await Promise.all([
        // the other changes of its topic (any project), and what a submit would merge with it (whole-topic submit)
        d.topic ? this.get(`/changes/?q=${encodeURIComponent(`topic:"${d.topic}" limit:${SEARCH_LIMIT}`)}&${OPTS}`).catch(() => null) : null,
        d.status === "NEW" ? this.get(`/changes/${id}/submitted_together?o=NON_VISIBLE_CHANGES`).catch(() => null) : null,
      ]);
      if (this.openId === c.id) this.detail = { change: d, comments, topic: topic && topic.filter((x) => x._number !== d._number), together };
    } catch (e) {
      if (this.openId === c.id) this.detail = { change: c, error: String(e.message ?? e) };
    }
    cx.notify();
  }


  render(cx) {
    if (this.role === "toggle") return this.renderToggle();
    const t = theme(), z = fs(), cfg = shared(SAFE_CFG);
    const root = v_flex().id("gerrit").size_full().bg(t.surface).text_size(z).text_color(t.foreground);
    if (!find(layout(), TOGGLE)) root.child(this.moveBanner(t, z));
    if (!cfg) return root.child(div().p(14).text_color(t.muted).child("讀取 Gerrit 設定…"));
    if (cfg.missing || cfg.error) return root.child(this.setup(t, z, cfg));
    if (this.openId && this.detail && this.diff) return root.child(this.header(t, z, true)).child(this.renderDiff(t, z));
    if (this.openId && this.detail) return root.child(this.header(t, z, true)).child(this.renderDetail(t, z, cx));
    return root.child(this.header(t, z, Boolean(this.history?.length))).child(this.searchBar(t, z)).child(this.renderList(t, z));
  }

  // The tab-bar button: "Gerrit" plus how many changes wait for you; click shows / hides the panel.
  renderToggle() {
    const t = theme(), node = find(layout(), PANEL), on = node && !node.hidden;
    const turn = (this.sections ?? []).filter((s) => s.turn).reduce((n, s) => n + s.items.length, 0);
    const badge = this.err ? div().text_color(t.ansi1).child("!")
      : turn ? div().px(5).rounded(8).text_size(11).font_semibold().bg(t.blocked).text_color(t.background).child(String(turn)) : null;
    return h_flex().size_full().pr(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("toggle-gerrit").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover((st) => st.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => run("layout.toggle", { id: PANEL }))
        .child("Gerrit")
        .when(Boolean(badge), (el) => el.child(badge)));
  }

  moveBanner(t, z) {
    return v_flex().flex_none().px(12).py(10).gap(6).bg(t.raised).border_b(1).border_color(t.border)
      .child(div().text_size(z - 1).text_color(t.muted).child(this.moveErr ?? "這個面板還在版面最外面。按下面的按鈕，會跟其他面板一樣放進上排（上面一顆 Gerrit 按鈕，按了開關面板）。"))
      .child(div().id("move").h(32).px(14).flex_none().flex().items_center().justify_center().rounded(6).cursor_pointer()
        .font_semibold().bg(t.solid).text_color(t.solid_foreground).hover((st) => st.opacity(0.88))
        .on_mouse_down("left", stop).on_click((_e, cx) => cx.spawn(async (cx) => this.moveIntoBar(cx)))
        .child("移到上排"));
  }

  setup(t, z, cfg) {
    return v_flex().p(14).gap(8).overflow_y_scrollbar()
      .child(div().font_semibold().child("Gerrit 還沒設定"))
      .child(div().text_color(cfg.error ? t.ansi1 : t.muted).child(cfg.error ?? `建立這個檔（用文字編輯器），存檔後 10 秒內會自己讀到：`))
      .child(div().font_family(mono()).text_size(z - 1).child(CONFIG()))
      .child(div().font_family(mono()).text_size(z - 1.5).p(8).rounded(6).bg(t.raised).child(CONFIG_EXAMPLE))
      .child(div().text_size(z - 1).text_color(t.muted).child("HTTP 密碼不是登入密碼：在 Gerrit 網頁右上角 → Settings → HTTP Credentials 產生。這個檔只在你的電腦上，不會進 repo。"));
  }

  header(t, z, back) {
    const btn = (id, label, fn) => div().id(id).h(28).px(10).flex().items_center().rounded(6).cursor_pointer().bg(t.raised).text_color(t.foreground)
      .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop).on_click(fn).child(label);
    const inBar = Boolean(find(layout(), TOGGLE)) && !this.inTab;
    const status = this.err ? `讀不到：${this.err}` : this.busy && !this.at ? "讀取中…" : this.at ? `更新於 ${ago(new Date(this.at).toISOString().replace("T", " ").replace("Z", ""))}${shared(DATA)?.version ? ` · Gerrit ${shared(DATA).version}` : ""}` : "";
    return v_flex().flex_none().border_b(1).border_color(t.border)
      .child(h_flex().px(10).py(6).gap(6).items_center()
        .when(back, (el) => el.child(btn("back", "← 返回", (_e, cx) => this.goBack(cx))))
        .child(div().flex_1().min_w(0).truncate().font_semibold().child(
          this.detail && this.diff ? `#${this.detail.change._number ?? "…"} · ${vim_name(this.diff.path)}` : this.detail ? `#${this.detail.change._number ?? "…"}` : "Gerrit"))

        .when(!this.detail, (el) => el.child(btn("refresh", this.busy ? "更新中…" : "↻ 重新整理", (_e, cx) => { setShared(REFRESH, Date.now()); this.nextAt = 0; cx.notify(); })))
        .when(inBar, (el) => el.child(btn("hide", "✕", () => run("layout.hide", { id: PANEL })))))
      .when(!this.detail && Boolean(status), (el) => el.child(div().px(12).pb(5).text_size(z - 1.5).truncate().text_color(this.err ? t.ansi1 : t.muted).child(status)));
  }

  searchBar(t, z) {
    return h_flex().flex_none().px(10).py(6).gap(6).items_center().border_b(1).border_color(t.border)
      .child(div().id("search-box").flex_1().min_w(0).h(34).px(6).flex().items_center().rounded(6).bg(t.background).border_1().border_color(t.input)
        .cursor_text().on_mouse_down("left", stop)
        .child(Input.new(this.searchState()).w_full().text_size(z).text_color(t.foreground)))
      .child(this.big(t, z, "search", this.search?.loading ? "搜尋中…" : "🔍 搜尋", { kind: "primary", off: Boolean(this.search?.loading), on: (cx) => cx.spawn(async (cx) => this.runSearch(cx)) }))
      .when(Boolean(this.search), (el) => el.child(this.big(t, z, "search-clear", "清除", { on: (cx) => { this.search = null; this.searchState().set_value(""); cx.notify(); } })));
  }

  renderList(t, z) {
    const list = v_flex().id("list").flex_1().min_h(0).overflow_y_scrollbar();
    if (this.search) {
      const sr = this.search, sec = { title: "搜尋" };
      list.child(h_flex().px(10).py(6).gap(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_size(z - 0.5).child(`搜尋：${sr.q}`))
        .child(div().text_color(t.muted).text_size(z - 1).child(sr.loading ? "…" : sr.error ? "讀不到" : sr.items.length >= SEARCH_LIMIT ? `前 ${SEARCH_LIMIT} 個` : String(sr.items.length))));
      if (sr.error) list.child(div().px(14).py(6).text_size(z - 1).text_color(t.ansi1).whitespace_normal().child(sr.error));
      else if (!sr.loading && !sr.items.length) list.child(div().px(14).py(6).text_size(z - 1).text_color(t.dim).child("沒有符合的 change"));
      for (const c of sr.items) list.child(this.row(t, z, c, sec));
      return list;
    }
    for (const s of this.sections ?? []) {
      const open = !this.collapsed.has(s.title);
      list.child(h_flex().id(`sec-${s.title}`).px(10).py(6).gap(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
        .cursor_pointer().hover((st) => st.bg(t.hover))
        .on_click((_e, cx) => {
          if (open) this.collapsed.add(s.title); else this.collapsed.delete(s.title);
          this.save("collapsed", JSON.stringify([...this.collapsed]));
          cx.notify();
        })
        .child(div().w(10).text_color(t.muted).child(open ? "▾" : "▸"))
        .child(div().flex_1().font_semibold().text_size(z - 0.5).text_color(s.turn && s.items.length ? t.blocked : t.foreground).child(s.title))
        .child(div().text_color(t.muted).text_size(z - 1).child(s.error ? "讀不到" : String(s.items.length))));
      if (!open) continue;
      if (s.error) { list.child(div().px(14).py(6).text_size(z - 1).text_color(t.muted).child(s.error.includes("attention") ? "這個 Gerrit 太舊，沒有「輪到你」（要 3.3 以上）" : s.error)); continue; }
      if (!s.items.length) { list.child(div().px(14).py(6).text_size(z - 1).text_color(t.dim).child("沒有")); continue; }
      for (const c of s.items) list.child(this.row(t, z, c, s));
    }
    return list;
  }

  chips(t, z, c) {
    const out = [];
    if (c.work_in_progress) out.push({ text: "WIP", color: t.muted });
    if (c.is_private) out.push({ text: "私人", color: t.muted });
    if (c.status === "MERGED") out.push({ text: "已合併", color: t.ansi5 });
    else if (c.status === "ABANDONED") out.push({ text: "已放棄", color: t.muted });
    else if (c.mergeable === false) out.push({ text: "合併衝突", color: t.ansi1 });
    else if (c.submittable) out.push({ text: "可以送出", color: t.ansi2 });
    return out.map((x, i) => div().id(`chip-${c._number}-${i}`).flex_none().px(5).rounded(4).text_size(z - 2).bg(t.raised).text_color(x.color).child(x.text));
  }

  row(t, z, c, s) {
    const labels = Object.entries(c.labels ?? {}).map(([name, l]) => [name, vote(t, l)]).filter(([, v]) => v);
    const unresolved = c.unresolved_comment_count ?? 0;
    return v_flex().id(`c-${s.title}-${c._number}`).px(12).py(6).gap(2).border_b(1).border_color(t.border)
      .cursor_pointer().hover((st) => st.bg(t.hover))
      .on_click((_e, cx) => { this.remember(); cx.spawn(async (cx) => this.openChange(c, cx)); })
      .child(h_flex().gap(6).items_center()
        .child(div().flex_none().font_family(mono()).text_size(z - 1).text_color(t.muted).child(String(c._number)))
        .child(div().flex_1().min_w(0).truncate().child(c.subject))
        .children(this.chips(t, z, c)))
      .child(h_flex().gap(8).items_center().text_size(z - 1.5).text_color(t.muted)
        .child(div().flex_1().min_w(0).truncate().child(`${c.project} · ${c.branch} · ${who(c.owner)}${c.topic ? ` · 🏷 ${c.topic}` : ""}`))
        .when(unresolved > 0, (el) => el.child(div().flex_none().text_color(t.blocked).child(`留言 ${unresolved}`)))
        .child(h_flex().flex_none().gap(5).font_family(mono()).children(labels.map(([name, v]) =>
          h_flex().id(`l-${c._number}-${name}`).gap(1).child(div().text_color(t.dim).child(abbr(name))).child(div().text_color(v.color).when(Boolean(v.strong), (el) => el.font_semibold()).child(v.text)))))
        .child(div().flex_none().w(18).text_color(t.dim).child(size(c)))
        .child(div().flex_none().child(ago(c.updated))));
  }

  // ---- Diff of one file (latest patch set), comments inline, click a line to comment ----
  // Which patch sets are compared: base (null = the parent commit, Gerrit's "Base") → to. Default: Base → latest.
  psNow() { const c = this.detail?.change; return c?.revisions?.[c.current_revision]?._number ?? null; }
  compare() { return { base: this.cmp?.base ?? null, to: this.cmp?.to ?? this.psNow() }; }
  comparing() { const { base, to } = this.compare(); return base != null || to !== this.psNow(); }

  // Pick the two patch sets; the file list of that pair comes from Gerrit (files?base=…).
  async setCompare(base, to, cx) {
    const c = this.detail.change;
    if (base != null && base >= to) base = null; // "from" must be older than "to"
    this.cmp = { base, to };
    if (!this.comparing()) { this.cmpFiles = null; cx.notify(); return; }
    const key = `${base}-${to}`;
    this.cmpFiles = { key, loading: true };
    cx.notify();
    try {
      this.cfg = await this.readConfig();
      const files = await this.get(`/changes/${cid(c)}/revisions/${to}/files${base != null ? `?base=${base}` : ""}`);
      // the commit message counts only between two patch sets (against Base it is all new, as on the change page)
      if (base == null) delete files?.["/COMMIT_MSG"];
      if (this.cmpFiles?.key === key) this.cmpFiles = { key, files: files ?? {} };
    } catch (e) {
      if (this.cmpFiles?.key === key) this.cmpFiles = { key, error: String(e.message ?? e) };
    }
    cx.notify();
  }

  // Files of what is compared: the latest patch set's from the change page, or the picked pair's.
  shownFiles() {
    if (this.comparing()) return this.cmpFiles?.files ?? {};
    const c = this.detail.change;
    return c.revisions?.[c.current_revision]?.files ?? {};
  }

  async openDiff(path, cx) {
    const c = this.detail.change;
    const { base, to } = this.compare();
    this.diff = { path, loading: true, open: new Set(), base, to };
    this.lineBox = null;
    cx.notify();
    try {
      this.cfg = await this.readConfig();
      const d = await this.get(`/changes/${cid(c)}/revisions/${this.comparing() ? to : "current"}/files/${encodeURIComponent(path)}/diff${base != null ? `?base=${base}` : ""}`);
      if (this.diff?.path === path) this.diff = { ...this.diff, loading: false, data: d };
    } catch (e) {
      if (this.diff?.path === path) this.diff = { ...this.diff, loading: false, error: String(e.message ?? e) };
    }
    cx.notify();
  }

  // Gerrit's content chunks → rows; a run of more than 8 unchanged lines folds to 3 + "N 行相同" + 3.
  diffRows(d, open) {
    const rows = [];
    let a = 0, b = 0;
    (d.content ?? []).forEach((ch, k) => {
      if (ch.skip) { rows.push({ kind: "skip", n: ch.skip, id: `s${k}` }); a += ch.skip; b += ch.skip; return; }
      if (ch.ab) {
        const n = ch.ab.length, first = k === 0, last = k === d.content.length - 1;
        const keepTop = first ? 0 : 3, keepEnd = last ? 0 : 3;
        const fold = !open.has(k) && n > keepTop + keepEnd + 2;
        ch.ab.forEach((text, i) => {
          a++; b++;
          if (fold && i >= keepTop && i < n - keepEnd) {
            if (i === keepTop) rows.push({ kind: "fold", n: n - keepTop - keepEnd, chunk: k, id: `f${k}` });
            return;
          }
          rows.push({ kind: "ctx", a, b, text, id: `c${a}-${b}` });
        });
        return;
      }
      for (const text of ch.a ?? []) { a++; rows.push({ kind: "del", a, text, id: `d${a}` }); }
      for (const text of ch.b ?? []) { b++; rows.push({ kind: "add", b, text, id: `n${b}` }); }
    });
    return rows;
  }

  renderDiff(t, z) {
    const { path, data, loading, error, open } = this.diff;
    const c = this.detail.change, comments = this.detail.comments ?? {};
    const body = v_flex().id("diff").flex_1().min_h(0).overflow_y_scrollbar().pb(16);
    // file navigation: previous / next file of this patch set
    const shown = this.shownFiles();
    const files = Object.keys(shown);
    const i = files.indexOf(path);
    const f = shown[path] ?? {};
    const pair = this.diff.base != null || this.diff.to !== this.psNow()
      ? `${this.diff.base != null ? `第 ${this.diff.base} 版` : "Base"} → 第 ${this.diff.to} 版 · ` : "";
    const navBtn = (id, label, off, to) => div().id(id).h(28).px(10).flex().items_center().rounded(6).text_size(z - 1)
      .bg(t.raised).text_color(off ? t.dim : t.foreground)
      .when(!off, (el) => el.cursor_pointer().hover((st) => st.bg(t.hover)).on_mouse_down("left", stop).on_click((_e, cx) => cx.spawn(async (cx) => this.openDiff(to, cx))))
      .child(label);
    const nav = h_flex().gap(8).px(12).py(6).items_center().border_b(1).border_color(t.border).text_size(z - 1)
      .child(div().text_color(t.muted).child(`${pair}${files.length > 1 ? `第 ${i + 1}／${files.length} 個檔` : "只有這個檔"}`))
      .child(div().font_family(mono()).text_color(t.ansi2).child(f.lines_inserted ? `+${f.lines_inserted}` : ""))
      .child(div().font_family(mono()).text_color(t.ansi1).child(f.lines_deleted ? `−${f.lines_deleted}` : ""))
      .child(div().flex_1())
      .when(files.length > 1, (el) => el
        .child(navBtn("prev-file", "↑ 上一個檔", i <= 0, files[i - 1]))
        .child(navBtn("next-file", "↓ 下一個檔", i < 0 || i >= files.length - 1, files[i + 1])));
    body.child(nav);
    if (loading) return body.child(div().p(12).text_color(t.muted).child("讀取 diff…"));
    if (error) return body.child(div().p(12).text_color(t.ansi1).child(`讀不到：${error}`));
    if (data.binary) return body.child(div().p(12).text_color(t.muted).child("二進位檔，沒有 diff"));

    // comments of this file on the latest patch set, by side and line
    const { base: dBase, to: dTo } = this.diff;
    const all = (comments[path] ?? []).map((m) => ({ path, ...m }));
    const byId = new Map(all.map((m) => [m.id, m]));
    const rootOf = (m) => { let r = m, n = 0; while (r.in_reply_to && byId.has(r.in_reply_to) && n++ < 50) r = byId.get(r.in_reply_to); return r; };
    const threads = new Map();
    for (const m of all) { const r = rootOf(m); if (!threads.has(r.id)) threads.set(r.id, []); threads.get(r.id).push(m); }
    const at = new Map(); // "b:12" / "a:3" / "file" -> [thread]
    for (const ms of threads.values()) {
      ms.sort((x, y) => when(x.updated) - when(y.updated));
      const r = ms[0];
      // right side: comments on "to"; left side: on the parent of "to" (Base) or on the "from" patch set
      const right = r.patch_set === dTo && r.side !== "PARENT";
      const left = dBase == null ? r.patch_set === dTo && r.side === "PARENT" : r.patch_set === dBase && r.side !== "PARENT";
      if (!right && !left) continue; // other patch sets: on the change page
      const key = !r.line ? "file" : `${left ? "a" : "b"}:${r.line}`;
      if (!at.has(key)) at.set(key, []);
      at.get(key).push({ root: r, msgs: ms, unresolved: Boolean(ms[ms.length - 1].unresolved) });
    }
    const threadCard = (x, k) => v_flex().id(`dt-${k}`).mx(10).my(4).p(8).gap(4).rounded(6).bg(t.raised).text_size(z - 1)
      .border_l(3).border_color(x.unresolved ? t.blocked : t.ansi2)
      .children(x.msgs.map((m, j) => v_flex().id(`dt-${k}-${j}`).gap(1)
        .child(div().text_color(t.muted).child(`${who(m.author)} · ${ago(m.updated)}${j === x.msgs.length - 1 ? (x.unresolved ? " · 未解決" : " · 已解決") : ""}`))
        .child(div().whitespace_normal().child(String(m.message ?? "").trim()))))
      .when(Boolean(shared(SAFE_CFG)?.auth) && c.status === "NEW", (el) => el.child(this.threadButtons(t, z, c, x)));
    (at.get("file") ?? []).forEach((x, k) => body.child(threadCard(x, `file-${k}`)));

    const rows = this.diffRows(data, open);
    const LIMIT_ROWS = this.diff.limit ?? 3000;
    const can = Boolean(shared(SAFE_CFG)?.auth) && c.status === "NEW";
    for (const r of rows.slice(0, LIMIT_ROWS)) {
      if (r.kind === "fold" || r.kind === "skip") {
        body.child(div().id(`row-${r.id}`).px(12).py(3).text_size(z - 1.5).text_color(t.accent).bg(t.chrome)
          .when(r.kind === "fold", (el) => el.cursor_pointer().hover((st) => st.bg(t.hover)).on_click((_e, cx) => { open.add(r.chunk); cx.notify(); }))
          .child(r.kind === "fold" ? `⋯ ${r.n} 行沒改（點開）` : `⋯ ${r.n} 行沒改`));
        continue;
      }
      const side = r.kind === "del" ? "a" : "b", line = side === "a" ? r.a : r.b;
      const key = `${side}:${line}`;
      body.child(h_flex().id(`row-${r.id}`).items_start().font_family(mono()).text_size(z - 0.5).py(1)
        .when(r.kind === "add", (el) => el.bg(tint(t.ansi2))).when(r.kind === "del", (el) => el.bg(tint(t.ansi1)))
        .when(can, (el) => el.cursor_pointer().hover((st) => st.bg(t.hover)).on_click((_e, cx) => {
          const st = TextareaState.new({ placeholder: `在第 ${line} 行留言`, rows: 2 });
          st.set_auto_grow(2, 8); st.set_soft_wrap(true);
          this.lineBox = { key, side, line, state: st };
          cx.notify();
          cx.spawn(async (cx) => { await cx.sleep(50); st.focus(); });
        }))
        .child(div().w(38).flex_none().pr(4).text_right().text_color(t.dim).child(r.a ? String(r.a) : ""))
        .child(div().w(38).flex_none().pr(4).text_right().text_color(t.dim).child(r.b ? String(r.b) : ""))
        .child(div().w(14).flex_none().font_semibold().text_color(r.kind === "add" ? t.ansi2 : r.kind === "del" ? t.ansi1 : t.dim)
          .child(r.kind === "add" ? "+" : r.kind === "del" ? "−" : ""))
        .child(div().flex_1().min_w(0).whitespace_normal().text_color(t.foreground)
          .child(keepIndent(r.text) || "\u00a0")));
      (at.get(key) ?? []).forEach((x, k) => body.child(threadCard(x, `${key}-${k}`)));
      if (this.lineBox?.key === key) body.child(this.lineCommentBox(t, z, c, path));
    }
    if (rows.length > LIMIT_ROWS) body.child(h_flex().p(12).gap(10).items_center()
      .child(div().text_color(t.muted).child(`還有 ${rows.length - LIMIT_ROWS} 行`))
      .child(this.big(t, z, "more-rows", "再顯示 3000 行", { on: (cx) => { this.diff.limit = LIMIT_ROWS + 3000; cx.notify(); } })));
    if (this.actErr) body.child(div().px(12).text_size(z - 1).text_color(t.ansi1).child(`沒送出：${this.actErr}`));
    return body;
  }

  // New comment on a line: unresolved by default (a question), or resolved (a note), like Gerrit.
  // The left side is the "from" patch set when comparing two, else the parent of "to".
  async sendLineComment(c, path, unresolved, cx) {
    const { side, line, state } = this.lineBox;
    const message = state.value().trim();
    if (!message) return;
    const { base, to } = this.diff;
    const rev = side === "a" && base != null ? base : to ?? "current";
    const cm = { line, message, unresolved, ...(side === "a" && base == null ? { side: "PARENT" } : {}) };
    const ok = await this.act("line", () => this.req("POST", `/changes/${cid(c)}/revisions/${rev}/review`,
      { comments: { [path]: [cm] } }), cx);
    if (ok) this.lineBox = null;
  }

  lineCommentBox(t, z, c, path) {
    const { state } = this.lineBox, busy = Boolean(this.sending);
    const send = (unresolved) => (cx) => cx.spawn(async (cx) => this.sendLineComment(c, path, unresolved, cx));
    return v_flex().id("line-box").mx(10).my(4).p(8).gap(6).rounded(6).bg(t.chrome).border_1().border_color(t.accent)
      .child(div().id("line-box-in").w_full().min_h(52).p(6).rounded(6).bg(t.background).border_1().border_color(t.input)
        .cursor_text().on_mouse_down("left", stop).child(Textarea.new(state).w_full().text_size(z).text_color(t.foreground)))
      .child(h_flex().gap(6).flex_wrap()
        .child(this.big(t, z, "line-send", this.sending === "line" ? "送出中…" : "💬 送出留言（要對方處理）", { kind: "primary", off: busy, on: send(true) }))
        .child(this.big(t, z, "line-note", "送出（只是備註）", { off: busy, on: send(false) }))
        .child(this.big(t, z, "line-cancel", "取消", { on: (cx) => { this.lineBox = null; cx.notify(); } })));
  }

  // 比較：從 [Base] [1] [2] … 到 [1] [2] …, like Gerrit's patch set selectors above the files.
  comparePicker(t, z, nums, base, to) {
    const pick = (id, label, on, sel, off) => div().id(id).h(30).min_w(44).px(10).flex().items_center().justify_center().rounded(6)
      .text_size(z - 0.5).font_semibold().bg(sel ? t.selected : t.raised).text_color(off ? t.dim : t.foreground)
      .border_1().border_color(sel ? t.accent : t.raised)
      .when(!off && !sel, (el) => el.cursor_pointer().hover((st) => st.bg(t.hover)).on_mouse_down("left", stop)
        .on_click((_e, cx) => cx.spawn(async (cx) => on(cx))))
      .child(label);
    const label = (text) => div().w(28).flex_none().text_size(z - 1).text_color(t.muted).child(text);
    const from = h_flex().gap(4).flex_wrap().items_center().child(label("從"))
      .child(pick("cmp-from-base", "Base", (cx) => this.setCompare(null, to, cx), base == null))
      .children(nums.filter((n) => n < Math.max(...nums)).map((n) => pick(`cmp-from-${n}`, `第 ${n} 版`, (cx) => this.setCompare(n, to, cx), base === n, n >= to)));
    const into = h_flex().gap(4).flex_wrap().items_center().child(label("到"))
      .children(nums.map((n) => pick(`cmp-to-${n}`, n === Math.max(...nums) ? `第 ${n} 版（最新）` : `第 ${n} 版`, (cx) => this.setCompare(base, n, cx), to === n)));
    return v_flex().gap(4).p(8).rounded(8).bg(t.chrome).border_1().border_color(t.border)
      .child(h_flex().items_center()
        .child(div().flex_1().text_size(z - 1).font_semibold().text_color(t.muted).child("比較哪兩版"))
        .when(this.comparing(), (el) => el.child(pick("cmp-reset", "回到最新版", (cx) => this.setCompare(null, this.psNow(), cx), false))))
      .child(from).child(into);
  }

  // Submit requirements, like Gerrit's list: the ones still missing first, each with ✓ / ⊘ and the votes on its labels.
  // The systems that reported on the current patch set: one per bot account, with the state of its last message,
  // the labels it votes on (on any patch set), its links, and when it started. gerrit.json "bots" (a regex on
  // the account name) says which accounts are systems; without it: Gerrit service users, autogenerated messages,
  // or messages that start with "[" or carry a link (never the change owner).
  systemsOf(c) {
    let re = null;
    try { if (this.cfg?.bots) re = new RegExp(this.cfg.bots, "i"); } catch {}
    const isBot = (m) => {
      const a = m.author;
      if (!a || a._account_id === c.owner?._account_id) return false;
      if (re) return re.test(a.username ?? "") || re.test(who(a));
      const body = msgBody(m);
      return (a.tags ?? []).includes("SERVICE_USER") || String(m.tag ?? "").startsWith("autogenerated:") || body.startsWith("[") || /https?:\/\//.test(body);
    };
    const cur = c.revisions?.[c.current_revision]?._number;
    const by = new Map();
    for (const m of c.messages ?? []) {
      if (!isBot(m)) continue;
      const id = m.author._account_id ?? who(m.author);
      if (!by.has(id)) by.set(id, { id, author: m.author, labels: new Set(), msgs: [] });
      const s = by.get(id);
      for (const v of msgVotes(m)) s.labels.add(v.label);
      if (cur == null || m._revision_number === cur) s.msgs.push(m);
    }
    return [...by.values()].filter((s) => s.msgs.length).map((s) => {
      const last = s.msgs[s.msgs.length - 1];
      const decided = [...s.msgs].reverse().find((m) => msgState(m) !== "info") ?? last;
      const state = msgState(decided);
      const tag = s.msgs.map((m) => msgBody(m).match(/^\.?\s*\[([^\]:]{2,40})\]/)?.[1]).find(Boolean);
      const links = [...new Set(s.msgs.flatMap((m) => msgBody(m).match(URL_RE) ?? []))].slice(-3);
      const line = (msgBody(decided).replace(URL_RE, "").replace(/^[.\s]*(\[[^\]]*\]\s*)+/, "").replace(/^<<\s*|\s*>>$/gm, "").split("\n").map((x) => x.trim()).find((x) => x && !/[:：]$/.test(x)) ?? "").slice(0, 120);
      return { id: s.id, name: who(s.author), tag, labels: [...s.labels], state, at: decided.date, line, links };
    });
  }

  openLink(url) { return openLink(url); }

  systemRow(t, z, s, key) {
    const st = { run: { i: "⏳", color: t.accent, text: ago(s.at) === "剛剛" ? "剛開始跑" : `跑了 ${ago(s.at).replace(" 前", "").replace("前", "")}` }, pass: { i: "✓", color: t.ansi2, text: "通過" },
      fail: { i: "✗", color: t.ansi1, text: "失敗" }, info: { i: "·", color: t.muted, text: "" } }[s.state];
    return v_flex().id(`sys-${key}`).pl(26).gap(2).text_size(z - 1.5)
      .child(h_flex().gap(6).items_center()
        .child(div().flex_none().w(14).text_color(st.color).child(st.i))
        .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child([s.tag && s.tag !== s.name ? `${s.tag}（${s.name}）` : s.name, st.text, s.state === "run" ? "" : ago(s.at)].filter(Boolean).join(" · "))))
      .when(Boolean(s.line), (el) => el.child(div().pl(20).text_color(t.dim).whitespace_normal().child(s.line)))
      .when(s.links.length > 0, (el) => el.child(h_flex().pl(20).gap(6).flex_wrap().children(s.links.map((u, i) =>
        div().id(`sys-${key}-l${i}`).px(6).py(1).rounded(4).bg(t.raised).text_color(t.accent).cursor_pointer().hover((h) => h.bg(t.hover))
          .on_mouse_down("left", stop).on_click(() => { this.openLink(u); })
          .child(`🔗 ${shortLink(u)}`)))));
  }

  requirementRows(t, z, c, reqs) {
    const ok = (r) => r.status === "SATISFIED" || r.status === "OVERRIDDEN" || r.status === "FORCED";
    const missing = reqs.filter((r) => !ok(r));
    const out = [div().pt(4).text_size(z - 1).font_semibold().text_color(missing.length ? t.blocked : t.ansi2)
      .child(c.status !== "NEW" ? "合併條件" : missing.length ? `合併條件：還差 ${missing.length} 項（共 ${reqs.length} 項）` : `合併條件：全部通過（${reqs.length} 項）`)];
    const labelsOf = (r) => {
      const names = [...String(r.submittability_expression_result?.expression ?? "").matchAll(/label[:=]\s*"?([\w.-]+?)(?=[=,<>"\s]|$)/g)].map((m) => m[1]);
      return [...new Set(names.length ? names : [r.name])].filter((n) => c.labels?.[n]);
    };
    const passed = reqs.filter(ok);
    // with many requirements (a company may have 15) the passed ones fold to one line while some are still missing
    const fold = missing.length > 0 && passed.length > 3 && this.showPassed !== c.id;
    const shownReqs = fold ? missing : [...missing, ...passed];
    const foldRow = fold && div().id("req-passed").pl(26).py(1).text_size(z - 1).text_color(t.accent).cursor_pointer().hover((st) => st.bg(t.hover))
      .on_mouse_down("left", stop).on_click((_e, cx) => { this.showPassed = c.id; cx.notify(); })
      .child(`✓ 已通過 ${passed.length} 項（點開）`);
    const systems = this.systemsOf(c), used = new Set();
    for (const r of shownReqs) {
      const names = labelsOf(r).concat(r.name);
      const mine = systems.filter((s) => s.labels.some((l) => names.includes(l)));
      mine.forEach((s) => used.add(s.id));
      const votes = labelsOf(r).flatMap((n) => (c.labels[n].all ?? []).filter((v) => Number(v.value)).map((v) => ({ ...v, label: n })));
      const err = r.status === "ERROR";
      out.push(h_flex().id(`req-${r.name}`).gap(8).items_start().text_size(z - 1).py(1)
        .child(div().w(18).flex_none().font_semibold().text_color(ok(r) ? t.ansi2 : err ? t.ansi3 : t.ansi1).child(ok(r) ? "✓" : err ? "!" : "⊘"))
        .child(div().w(190).flex_none().truncate().text_color(ok(r) ? t.muted : t.foreground).child(r.name))
        .child(h_flex().flex_1().min_w(0).gap(6).flex_wrap().children(votes.length ? votes.map((v, i) => {
          const x = voteValue(t, v.value);
          return h_flex().id(`rv-${r.name}-${i}`).gap(3).child(div().text_color(x.color).font_semibold().child(x.text)).child(div().text_color(t.muted).child(who(v)));
        }) : [div().text_color(t.dim).child(err ? "Gerrit 算不出來" : ok(r) ? "" : r.name === "No-Unresolved-Comments" ? "還有未解決的留言" : "還沒有人給")])));
      // the systems behind this requirement: shown while it is missing, or when one is still running
      mine.filter((s) => !ok(r) || s.state === "run").forEach((s, i) => out.push(this.systemRow(t, z, s, `${r.name}-${i}`)));
    }
    if (foldRow) out.push(foldRow);
    // systems that vote on no requirement yet (a first run), or on labels no requirement names
    const rest = systems.filter((s) => !used.has(s.id) && (s.state === "run" || s.state === "fail" || !s.labels.length));
    if (rest.length) {
      out.push(div().pt(2).pl(26).text_size(z - 1.5).text_color(t.muted).child("其他檢查"));
      rest.forEach((s, i) => out.push(this.systemRow(t, z, s, `other-${i}`)));
    }
    return out;
  }

  // A big button. kind: "primary" (filled), "danger" (armed, red), or plain; on: (cx) => …
  big(t, z, id, label, { kind, on, off, active, grow } = {}) {
    const bg = off ? t.raised : kind === "primary" ? t.solid : kind === "danger" ? t.ansi1 : active ? t.selected : t.raised;
    const fg = off ? t.dim : kind === "primary" ? t.solid_foreground : kind === "danger" ? t.background : t.foreground;
    return div().id(id).h(34).px(14).flex().items_center().justify_center().rounded(7).text_size(z).font_semibold()
      .when(Boolean(grow), (el) => el.flex_1()).when(!grow, (el) => el.flex_none())
      .bg(bg).text_color(fg).border_1().border_color(active ? t.accent : bg)
      .when(!off, (el) => el.cursor_pointer().hover((st) => st.opacity(0.85)).on_mouse_down("left", stop).on_click((_e, cx) => on?.(cx)))
      .child(label);
  }

  // What you can do on a change, like Gerrit's REPLY dialog: a score per label you may vote on, a message, send.
  actions(t, z, c) {
    const me = this.self?._account_id;
    const busy = Boolean(this.sending);
    const card = v_flex().gap(8).p(10).rounded(8).bg(t.chrome).border_1().border_color(t.border);
    const open = c.status === "NEW";
    // Score rows: Gerrit's permitted_labels, your current vote highlighted, the picked one filled.
    for (const [name, vals] of Object.entries(open ? c.permitted_labels ?? {} : {})) {
      const mine = Number((c.labels?.[name]?.all ?? []).find((v) => v._account_id === me)?.value ?? 0);
      const picked = this.picked?.[name];
      // the label's full name above its buttons (Code-Review, Build, Verified …), as Gerrit's REPLY dialog
      card.child(div().text_size(z - 1).text_color(t.muted).child(name));
      const row = h_flex().gap(4).items_center();
      for (const raw of vals) {
        const v = Number(raw);
        const sel = picked != null ? picked === v : mine === v;
        const color = v > 0 ? t.ansi2 : v < 0 ? t.ansi1 : t.muted;
        row.child(div().id(`pick-${name}-${v}`).h(32).flex_1().min_w(34).flex().items_center().justify_center().rounded(6)
          .font_semibold().text_size(z).cursor_pointer()
          .bg(sel ? (v === 0 ? t.selected : color) : t.raised).text_color(sel && v !== 0 ? t.background : color)
          .border_1().border_color(sel && picked != null ? t.accent : sel ? (v === 0 ? t.selected : color) : t.raised)
          .hover((st) => st.opacity(0.85)).on_mouse_down("left", stop)
          .on_click((_e, cx) => {
            this.picked = { ...(this.picked ?? {}) };
            if (v === mine) delete this.picked[name]; else this.picked[name] = v;
            cx.notify();
          })
          .child(v > 0 ? `+${v}` : String(v)));
      }
      card.child(row);
    }
    if (open) {
      card.child(div().id("reply-box").w_full().min_h(64).p(6).rounded(6).bg(t.background).border_1().border_color(t.input)
        .cursor_text().on_mouse_down("left", stop)
        .child(Textarea.new(this.replyState()).w_full().text_size(z).text_color(t.foreground)));
      const n = Object.keys(this.picked ?? {}).length;
      const row = h_flex().gap(6).flex_wrap()
        .child(this.big(t, z, "send", this.sending === "reply" ? "送出中…" : n ? `💬 送出回覆和 ${n} 個分數` : "💬 送出回覆",
          { kind: "primary", grow: true, off: busy, on: (cx) => cx.spawn(async (cx) => this.sendReply(c, cx)) }));
      if (c.submittable) {
        const armed = this.armed === `submit-${c.id}` && Date.now() - this.armedAt <= 4000;
        row.child(this.big(t, z, "submit", this.sending === "submit" ? "合併中…" : armed ? "再按一次確認合併" : (this.detail.together?.changes?.length ?? 0) > 1 ? `✅ 合併（連同 topic 共 ${this.detail.together.changes.length} 個）` : "✅ 合併（Submit）",
          { kind: armed ? "danger" : undefined, off: busy, on: (cx) => cx.spawn(async (cx) => this.submit(c, cx)) }));
      }
      card.child(row);
      card.child(this.changeButtons(t, z, c));
    } else {
      if (c.actions?.restore?.enabled === true) card.child(this.changeButtons(t, z, c));
      card.child(div().text_size(z - 1).text_color(t.muted).child(c.status === "MERGED" ? "已合併：只能看。" : "已放棄：只能看。"));
    }
    if (this.actErr) card.child(div().text_size(z - 1).text_color(t.ansi1).whitespace_normal().child(`沒送出：${this.actErr}`));
    return card;
  }

  // Under a thread: Done / Ack resolve it in one press (Gerrit's quick replies); 回覆 opens a box.
  threadButtons(t, z, c, x) {
    const key = `th-${x.root.id}`, busy = Boolean(this.sending), mine = this.threadReply?.id === x.root.id;
    const small = (id, label, on, kind) => div().id(id).h(30).px(12).flex().items_center().justify_center().rounded(6)
      .text_size(z - 0.5).font_semibold().flex_none()
      .bg(busy ? t.raised : kind === "primary" ? t.solid : t.background).text_color(busy ? t.dim : kind === "primary" ? t.solid_foreground : t.foreground)
      .border_1().border_color(t.border)
      .when(!busy, (el) => el.cursor_pointer().hover((st) => st.opacity(0.85)).on_mouse_down("left", stop).on_click((_e, cx) => on(cx)))
      .child(label);
    const send = (msg, resolve) => (cx) => cx.spawn(async (cx) => this.replyThread(c, x, msg, resolve, cx));
    if (mine) {
      const st = this.threadReply.state;
      return v_flex().gap(6).pt(4)
        .child(div().id(`${key}-box`).w_full().min_h(56).p(6).rounded(6).bg(t.background).border_1().border_color(t.input)
          .cursor_text().on_mouse_down("left", stop).child(Textarea.new(st).w_full().text_size(z).text_color(t.foreground)))
        .child(h_flex().gap(6).flex_wrap()
          .child(small(`${key}-send-r`, this.sending === key ? "送出中…" : "送出並解決", (cx) => { const v = st.value().trim(); if (v) send(v, true)(cx); }, "primary"))
          .child(small(`${key}-send`, "送出（不解決）", (cx) => { const v = st.value().trim(); if (v) send(v, false)(cx); }))
          .child(small(`${key}-cancel`, "取消", (cx) => { this.threadReply = null; cx.notify(); })));
    }
    return h_flex().gap(6).pt(4).flex_wrap()
      .when(x.unresolved, (el) => el
        .child(small(`${key}-done`, this.sending === key ? "送出中…" : "✓ Done", send("Done", true), "primary"))
        .child(small(`${key}-ack`, "Ack", send("Ack", true))))
      .child(small(`${key}-reply`, "💬 回覆", (cx) => {
        const st = TextareaState.new({ placeholder: "回覆這串留言", rows: 2 });
        st.set_auto_grow(2, 8); st.set_soft_wrap(true);
        this.threadReply = { id: x.root.id, state: st };
        cx.notify();
        cx.spawn(async (cx) => { await cx.sleep(50); st.focus(); });
      }));
  }

  renderDetail(t, z, cx) {
    const { change: c, comments, loading, error } = this.detail;
    const body = v_flex().id("detail").flex_1().min_h(0).overflow_y_scrollbar().px(12).py(10).gap(10);
    body.child(v_flex().gap(4)
      .child(div().font_semibold().text_size(z + 1).whitespace_normal().child(String(c.subject ?? (error ? "" : "讀取中…"))))
      .child(h_flex().gap(6).flex_wrap().items_center().children(this.chips(t, z, c))
        .when(Boolean(c.project), (el) => el.child(div().text_size(z - 1).text_color(t.muted).child(`${c.project} · ${c.branch} · ${who(c.owner)} · 更新 ${ago(c.updated)}`)))));
    if (loading) return body.child(div().text_color(t.muted).child("讀取中…"));
    if (error) return body.child(div().text_color(t.ansi1).child(`讀不到：${error}`));
    const title = (text) => div().pt(4).text_size(z - 1).font_semibold().text_color(t.muted).child(text);

    // Attention set: whose turn it is
    const att = Object.values(c.attention_set ?? {});
    if (att.length) body.child(h_flex().gap(6).flex_wrap().text_size(z - 1)
      .child(div().text_color(t.muted).child("輪到："))
      .children(att.map((a, i) => div().id(`att-${i}`).px(6).rounded(4).bg(t.raised).text_color(a.account?._account_id === this.self?._account_id ? t.blocked : t.foreground).child(who(a.account)))));

    // Topic and the other changes of it
    for (const r of this.topicRows(t, z, c)) body.child(r);

    // People: reviewers and CC (Gerrit's REVIEWERS / CC), add, move, remove
    body.child(title("Reviewer／CC"));
    for (const r of this.peopleRows(t, z, c)) body.child(r);

    // What the change needs to merge (Gerrit 3.5+ submit requirements), else the labels and who voted
    const reqs = (c.submit_requirements ?? []).filter((r) => r.status !== "NOT_APPLICABLE");
    if (reqs.length) for (const r of this.requirementRows(t, z, c, reqs)) body.child(r);
    const jcard = this.jenkinsCard(t, z, c);
    if (jcard) body.child(jcard);
    const labels = reqs.length ? [] : Object.entries(c.labels ?? {}).filter(([, l]) => !l.optional || (l.all ?? []).some((v) => Number(v.value)));
    if (labels.length) {
      body.child(title("分數"));
      for (const [name, l] of labels) {
        const votes = (l.all ?? []).filter((v) => Number(v.value));
        body.child(h_flex().id(`lab-${name}`).gap(8).items_start().text_size(z - 1)
          .child(div().w(96).flex_none().truncate().child(name))
          .child(h_flex().flex_1().gap(6).flex_wrap().children(votes.length ? votes.map((v, i) => {
            const x = voteValue(t, v.value);
            return h_flex().id(`v-${name}-${i}`).gap(3).child(div().text_color(x.color).font_semibold().child(x.text)).child(div().child(who(v)));
          }) : [div().text_color(t.dim).child(l.optional ? "（選填）" : "還沒有人給")])));
      }
    }

    if (!reqs.length) {
      const systems = this.systemsOf(c);
      if (systems.length) { body.child(title("檢查系統")); systems.forEach((s, i) => body.child(this.systemRow(t, z, s, `all-${i}`))); }
    }

    const revs = Object.entries(c.revisions ?? {}).map(([sha, r]) => ({ sha, ...r })).sort((a, b) => b._number - a._number);
    const cur = revs.find((r) => r.sha === c.current_revision) ?? revs[0];

    // Files of the current patch set (or of two compared ones), with comment counts
    const { base, to } = this.compare();
    if (revs.length > 1) body.child(this.comparePicker(t, z, revs.map((r) => r._number).sort((a, b) => a - b), base, to));
    const cf = this.comparing() ? this.cmpFiles : null;
    if (cf?.loading) body.child(div().text_size(z - 1).text_color(t.muted).child("讀取檔案…"));
    if (cf?.error) body.child(div().text_size(z - 1).text_color(t.ansi1).child(`讀不到：${cf.error}`));
    const files = Object.entries(this.shownFiles());
    if (this.comparing() && cf?.files && !files.length) body.child(div().text_size(z - 1).text_color(t.dim).child("這兩版的檔案一樣（例如只是 rebase）"));
    if (files.length) {
      body.child(title(this.comparing()
        ? `檔案（${base != null ? `第 ${base} 版` : "Base"} → 第 ${to} 版，${files.length} 個不同）`
        : `檔案（第 ${cur._number} 版，共 ${files.length} 個）`));
      for (const [path, f] of files) {
        const n = (comments?.[path] ?? []).length;
        body.child(h_flex().id(`f-${path}`).gap(8).items_center().text_size(z - 1).px(4).py(3).rounded(5)
          .cursor_pointer().hover((st) => st.bg(t.hover)).on_click((_e, cx) => { this.remember(); cx.spawn(async (cx) => this.openDiff(path, cx)); })
          .child(div().flex_none().w(14).text_color(t.muted).child(f.status === "A" ? "+" : f.status === "D" ? "−" : f.status === "R" ? "→" : ""))
          .child(div().flex_1().min_w(0).text_ellipsis_start().font_family(mono()).child(vim_name(path)))
          .when(n > 0, (el) => el.child(div().flex_none().text_color(t.blocked).child(`留言 ${n}`)))
          .child(div().flex_none().font_family(mono()).text_color(t.ansi2).child(f.lines_inserted ? `+${f.lines_inserted}` : ""))
          .child(div().flex_none().font_family(mono()).text_color(t.ansi1).child(f.lines_deleted ? `−${f.lines_deleted}` : ""))
          .child(div().flex_none().text_color(t.muted).child("›")));
      }
    }

    // Comment threads (replies follow in_reply_to), unresolved first, like Gerrit's Comments tab
    const byId = new Map();
    for (const [path, list] of Object.entries(comments ?? {})) for (const m of list) byId.set(m.id, { path, ...m });
    const rootOf = (m) => { let r = m, n = 0; while (r.in_reply_to && byId.has(r.in_reply_to) && n++ < 50) r = byId.get(r.in_reply_to); return r; };
    const threads = new Map();
    for (const m of byId.values()) { const r = rootOf(m); if (!threads.has(r.id)) threads.set(r.id, []); threads.get(r.id).push(m); }
    const list = [...threads.values()].map((ms) => {
      ms.sort((a, b) => when(a.updated) - when(b.updated));
      return { root: ms[0], msgs: ms, unresolved: Boolean(ms[ms.length - 1].unresolved) };
    }).sort((a, b) => Number(b.unresolved) - Number(a.unresolved) || a.root.path.localeCompare(b.root.path) || (a.root.line ?? 0) - (b.root.line ?? 0));
    if (list.length) {
      const open = list.filter((x) => x.unresolved).length;
      const all = this.allComments === c.id;
      const shown = all ? list.slice(0, 60) : list.filter((x) => x.unresolved).slice(0, 30);
      body.child(title(`程式碼留言（${open} 個未解決，共 ${list.length} 串）`));
      const where = (m) => m.path === "/PATCHSET_LEVEL" ? "整體留言" : `${m.path === "/COMMIT_MSG" ? "提交說明" : m.path}${m.line ? `:${m.line}` : ""}`;
      shown.forEach((x, i) => body.child(v_flex().id(`th-${i}`).gap(4).p(8).rounded(6).bg(t.raised).text_size(z - 1)
        .child(h_flex().gap(6).items_center()
          .child(div().flex_1().min_w(0).text_ellipsis_start().font_family(mono()).text_color(t.muted).child(where(x.root)))
          .child(div().flex_none().text_color(x.unresolved ? t.blocked : t.ansi2).child(x.unresolved ? "未解決" : "已解決")))
        .children(x.msgs.map((m, k) => v_flex().id(`th-${i}-${k}`).gap(1)
          .child(div().text_color(t.muted).child(`${who(m.author)} · 第 ${m.patch_set} 版 · ${ago(m.updated)}`))
          .child(div().whitespace_normal().child(String(m.message ?? "").trim()))))
        .when(Boolean(shared(SAFE_CFG)?.auth) && c.status === "NEW", (el) => el.child(this.threadButtons(t, z, c, x)))));
      if (list.length > shown.length || all) body.child(div().id("more-comments").text_size(z - 1).text_color(t.accent).cursor_pointer()
        .on_click((_e, cx) => { this.allComments = all ? null : c.id; cx.notify(); })
        .child(all ? "只看未解決的" : `還有 ${list.length - shown.length} 串已解決的，點一下看`));
    }

    if (shared(SAFE_CFG)?.auth) body.child(title("回覆、給分")).child(this.actions(t, z, c));

    // Commit message: the first lines, click for all
    const msg = String(cur?.commit?.message ?? "").trim();
    if (msg) {
      const lines = msg.split("\n"), long = lines.length > 6, full = this.fullMsg === c.id;
      body.child(title("提交說明"))
        .child(div().id("commit-msg").font_family(mono()).text_size(z - 1.5).p(8).rounded(6).bg(t.raised).whitespace_normal()
          .when(long, (el) => el.cursor_pointer().hover((st) => st.bg(t.hover)).on_click((_e, cx) => { this.fullMsg = full ? null : c.id; cx.notify(); }))
          .child(long && !full ? `${lines.slice(0, 6).join("\n")}\n…（點一下看全部）` : msg));
    }

    // Patch sets
    if (revs.length) {
      body.child(title(`版本（共 ${revs.length} 版）`));
      revs.forEach((r) => body.child(h_flex().id(`ps-${r._number}`).gap(8).text_size(z - 1)
        .child(div().w(64).flex_none().font_family(mono()).text_color(r.sha === c.current_revision ? t.foreground : t.muted).child(`第 ${r._number} 版`))
        .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(`${who(r.uploader)} · ${ago(r.created)}${r.kind && r.kind !== "REWORK" ? ` · ${r.kind === "TRIVIAL_REBASE" ? "只是 rebase" : r.kind === "NO_CODE_CHANGE" ? "程式沒變" : r.kind === "NO_CHANGE" ? "沒有改變" : r.kind}` : ""}`))));
    }

    // Change log (newest first)
    const msgs = (c.messages ?? []).slice(-15).reverse();
    if (msgs.length) {
      body.child(title("紀錄"));
      msgs.forEach((m, i) => body.child(v_flex().id(`msg-${i}`).gap(1).pb(4).border_b(1).border_color(t.border).text_size(z - 1)
        .child(div().text_color(t.muted).child(`${who(m.author)} · ${ago(m.date)}`))
        .child(div().whitespace_normal().child(String(m.message ?? "").trim().split("\n").slice(0, 6).join("\n")))));
    }
    return body;
  }
}
