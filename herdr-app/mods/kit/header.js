// Roles "header" and "context" of the kit mod.
//
// header: a pane's header (the layout's pane frame: "header": { "content": { "mod": "kit", "props": { "role":
// "header" } } }; Herdr adds { pane, terminal } to those props). Like Herdr's own header ("mod": "pane") it shows the
// program's icon, the name, the folder and the agent's status, with split / zoom / close on hover (always laid out,
// shown only on hover, so nothing in the header moves). On an agent's pane it adds kit's button (what this agent uses:
// rules, skills, MCP; one click opens the "agent" popup, agent.js) and how full its context is.
// This header is the one place that asks kit about an agent:
//   kit list --json --dir <its folder> --pid <its process>      on the pane's machine
// and keeps the answer in shared state (AGENT_CACHE, AGENT_DATA in common.js) for the popup to show; the popup's ⟳
// and anything that changed what the agent uses ask for a fresh one (AGENT_WANT).
// How full the context is comes from
//   kit context --pid <the agent's process> --tool <claude|codex|omp> --dir <its folder>
// kept in CTX, asked again every 15 s while it works. A failed ask keeps the numbers it had. With kit api 1.4 the same
// ask also gets what the agent wrote about where it is (kit note --pid <pid> --json, in NOTE), for 關係 (graph.js) to
// show; the header itself doesn't (one place for it).
//
// context (props { role, target }): the popup the context chip opens, where the tokens go, like Claude Code's own
// /context:  kit context ... --detail [--fresh]  on the agent's machine (kit keeps it a minute; ⟳ asks again). Its
// buttons type the tool's own command into that agent (hc send, only while it waits: idle or done): 壓縮 (/compact,
// with what to keep where the tool takes it) and 清空重來 (Claude /clear, Codex and omp /new), each confirmed first;
// 拿掉 takes off what kit manages (the popup's kit rm), 開檔 opens a memory / instruction file in kit's editor window
// (this computer only), 複製 copies the summary. Nothing is asked while kit there can't be used (kit api).
// What it computes (the bar, the numbers, the tips) is in context.js.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { panes, spaces, agents, terminals, props, run, theme, hc, shared, setShared, openOverlay, closeOverlay, notify, appHome, readTextFile, exec } from "herdr";
import * as files from "fs/promises";
import { collectedFrom, AGENT_CACHE, AGENT_DATA, AGENT_WANT, CTX, NOTE, LIMIT_SENT, EDITORS, localGet, localSet, fs, stop, slash, shortDir, clean, spin, waiting, icon, textBlock,
  copyOnRight, btn, busyNow, takeBusy, giveBusy, markChanged, kit, kitJson, apiState, apiKnown, apiAtLeast, checkApi, apiCard, num, kfmt, reloadAfter, reloadNext } from "./common.js";
import { toolOf, ctxArgs, askZero, zeroNumbers, sendText, sendArgs, removal, ctxTips, summaryText, chipNumbers, level, howCounted, ago, catColorKey, barSegments,
  catShare, compactLine, noteArgs, CTX_FULL, NAME_MAX, limitOf, continueDue, CONTINUE_TEXT, usageLines, ompUsage, whenText,
  compactKey, compactStep, compactLive, compactedAfter, compactWords, reloadKey } from "./context.js";

const CTX_STALE = 15000, CTX_IDLE = 60000;   // how often to ask how full the context is: working / not
const STALE = 60000, LOAD_TTL = 90000;   // look again after a minute; a load longer than this is taken as lost
const SHORT = 120000;
const CTX_W = 480, CTX_H = 640;   // the context popup
export const POPUP_W = 440, POPUP_H = 560;    // the "agent" popup (agent.js draws it this tall)

// where a pane lives: its machine (its space's), and the key its answers are kept under
function placeOf(p) {
  const sp = spaces().find((s) => (s.tabs ?? []).some((t) => t.id === p.tab));
  const machine = sp?.machine ?? null, tb = sp?.tabs?.find((t) => t.id === p.tab);
  // its space / tab as hc ls names it ("work / 1"): two agents in one folder on one machine look alike without it
  const tab = sp && tb ? `${sp.name} / ${tb.name}` : null;
  return { machine, space: sp?.id ?? null, tab, key: `${machine ?? ""}|${p.cwd ?? ""}|${p.terminal}` };
}
const agentPanes = () => panes().filter((p) => p.terminal && p.program?.agent);
// 額度恢復後自動打「繼續」: on unless turned off in the context window (this computer)
const autoContinue = () => localGet("kit.autoContinue") !== "off";
// only the keys of panes that still exist (each folder change makes a new key)
function pruned(obj) {
  const live = new Set(agentPanes().map((p) => placeOf(p).key));
  return Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => live.has(k)));
}

// kit list for one agent; never this computer's list in place of another machine's
export async function loadAgent(machine, cwd, term) {
  const args = ["list", "--json"];
  if (cwd) args.push("--dir", cwd);
  const g = term ? await hc(["get", term, "--json"]).catch(() => null) : null;
  try { const pid = JSON.parse(g?.stdout ?? "{}").pid; if (pid) args.push("--pid", String(pid)); } catch {}
  const { data, error } = kitJson(await kit(args, 60000, machine), "kit list --json"), at = Date.now();
  if (error) return { error: error.message, code: error.code, machine, at };
  // the skills kit collect took: from whom (third_party.lock there), for the popup's groups
  const locks = await collectedFrom(data.sources, machine).catch(() => ({}));
  const items = (data.items ?? []).map((i) => ((i.kind === "skill" || i.kind === "plugin") && locks[i.source]?.[i.name] ? { ...i, from: locks[i.source][i.name] } : i));
  const view = data.here?.user === "root" ? await rootView(machine) : undefined;
  return { ...data, items, machine, at, view };
}
// An agent run as root: kit list can't see root's kit, but the machine may keep a copy root's cron writes (root's
// kit list --json --dir /root) that this account can read. -> { list, age (s, by that machine's clock) } | { age } | { none: why }
const ROOT_VIEW = "/var/lib/kit-root-view/list.json";
export const ROOT_VIEW_MAX = 30 * 60;   // older than this: shown as not kept up
async function rootView(machine) {
  try {
    const r = await exec("sh", ["-c", `f=${ROOT_VIEW}; [ -r "$f" ] || exit 3; date +%s; stat -c %Y "$f" 2>/dev/null || stat -f %m "$f"; cat "$f"`], { timeout: 20000, on: machine });
    if (r.code === 3) return { none: "沒有這個檔，或這個帳號讀不到" };
    if (r.code !== 0) return { none: clean(r.stderr) || `結束碼 ${r.code}` };
    const [now, mt, ...rest] = String(r.stdout ?? "").split("\n"), age = Number(now) - Number(mt);
    if (!(age >= 0)) return { none: "讀不到檔案的修改時間" };
    if (age > ROOT_VIEW_MAX) return { age };
    let list = null;
    try { list = JSON.parse(rest.join("\n")); } catch {}
    return list && typeof list === "object" && Array.isArray(list.items) ? { list, age } : { none: "內容不是 kit list --json" };
  } catch (e) { return { none: clean(String(e?.message ?? e)) || "讀的時候出錯" }; }
}
// the button's words: how many rules / skills / MCP this agent reads (kit's for the account, its folder's own,
// and the set kit run started it with), each name counted once
function summary(d) {
  if (!d) return { text: "…", level: "dim" };
  if (d.error) return { text: "出錯了", level: "bad", why: d.error };
  if (d.here?.user) return { text: `${d.here.user} · ${d.view?.list ? "只能看" : "這裡看不到"}`, level: "dim" };
  const names = { rule: new Set(), skill: new Set(), mcp: new Set() };
  for (const i of d.items ?? []) if ((i.status === "used" || i.status === "required") && names[i.kind]) names[i.kind].add(i.name);
  for (const i of d.here?.items ?? []) names[i.kind]?.add(`${i.scope}:${i.path ?? i.name}`);
  const ag = d.here?.agent;
  if (ag) for (const [k, key] of [["rule", "rules"], ["skill", "skills"], ["mcp", "mcp"]]) for (const n of ag[key] ?? []) names[k].add(n);
  const news = (d.items ?? []).filter((i) => i.new && i.kind !== "agent").length;
  const counts = [["規則", names.rule.size], ["技能", names.skill.size], ["MCP", names.mcp.size]];
  return { text: counts.map(([l, n]) => `${l} ${n}`).join(" · "), level: news ? "new" : "ok", news, counts, agent: ag?.name ?? null };
}

// how full an agent's context is: kit context on the agent's machine, for its foreground process.
// { numbers }, or null (this ask failed)
export async function agentPid(term) {
  const g = term ? await hc(["get", term, "--json"]).catch(() => null) : null;
  try { const j = JSON.parse(g?.stdout ?? "{}"); return j.foreground?.pid ?? j.pid ?? null; } catch { return null; }
}
// With withNote (kit api 1.4) also what it wrote about where it is (kit note --pid --json): note { text, at } | null (none),
// undefined when not asked or the ask failed (the old one stays). -> { ctx, note }
// before: what CTX had; a Claude whose status line says 0 (just compacted or cleared) is asked with --detail now and
// then (askZero), so the chip has its real number (zeroAt: when) instead of "讀取中" until its next reply
async function loadContext(machine, cwd, term, tool, withNote, before = null) {
  const pid = await agentPid(term);
  if (!pid) return { ctx: null, note: undefined };
  const r = await kit(ctxArgs(pid, tool, cwd), 60000, machine);
  let ctx = null, note;
  if (r.code === 0) try { const d = JSON.parse(r.out); ctx = d && typeof d === "object" ? d : null; } catch {}
  if (ctx && !Number(ctx.used) && !Number(ctx.pct) && tool === "claude") {
    let z = null;
    if (askZero(ctx, before, tool)) {
      const q = await kit(ctxArgs(pid, tool, cwd, true), 60000, machine);
      if (q.code === 0) try { z = JSON.parse(q.out); } catch {}
      const n = zeroNumbers(z, null);
      // asked (got a number or not): not again for a while
      ctx = n ? { ...ctx, ...n, zeroAt: Date.now() } : { ...ctx, zeroAt: Date.now() };
    } else {
      const n = zeroNumbers(null, before);
      ctx = { ...ctx, ...(n ?? {}), zeroAt: before?.zeroAt ?? null };
    }
  }
  if (withNote) {
    const n = await kit(noteArgs(pid), 30000, machine);
    if (n.code === 0) try { const d = JSON.parse(n.out); if (d && typeof d === "object") note = d.text ? { text: d.text, at: d.at } : null; } catch {}
  }
  return { ctx, note };
}
// a category's color in the bar and its dot
const catColor = (t, id) => t[catColorKey(id)] ?? t.dim;
const levelColor = (t, pct) => ({ full: t.blocked, high: t.working })[level(pct)] ?? t.foreground;

// the context window's last answer per pane (key -> { d, at }): shown at once when the window opens again, while
// kit context --detail asks anew (Claude Code's own count plus a read of the transcript's tail: seconds on a long one)
const LAST_DETAIL = new Map();
// the Agents list's right-click menu (Herdr's agents mod, shared "agents.menu"): context 細項, the files it touched (the
// agent-files mod, when there is one) and Kit, said again every few minutes; a pick ("agents.menu.pick") is done by the
// header of the agent's pane
const MENU_AGAIN = 120000;
// the agent-page mod, when there is one: its pane beside an agent (its 進度 and the pages the agent wrote; an agent on
// another machine: agent-page copies them from there, given machine and term). Its folder name is the terminal's id, made safe the way agent-page's main.js does (keep the two the same).
let pageMod = null;
const hasMod = (mod) => readTextFile(`${appHome()}/mods/${mod}/main.js`).then((x) => x != null, () => false);
function checkPage(cx) {
  if (pageMod !== null || checkPage.busy) return;
  checkPage.busy = true;
  cx.spawn(async (cx) => { pageMod = await hasMod("agent-page"); checkPage.busy = false; cx.notify(); });
}
const pageDir = (term) => String(term ?? "").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "") || "default";
const pageOpen = (p) => {
  const open = shared(`agent-page/${pageDir(p.terminal)}`);
  return open && panes().some((x) => x.pane === open && x.mod === "agent-page") ? open : null;
};
const pageFor = (p) => pageMod && p.terminal && p.program?.agent;
// Pages not seen on this computer: the red dot on ⎙ (the phone app has its own). Each agent's pages and a signature of
// each (a hash of the file here; cksum on another machine, where agent-page only copies them while open), looked at
// every PAGES_AGAIN; what this computer has seen is kept in localStorage per folder. The first look counts what is
// there as seen. A page shown in an open agent-page (its tab, shared "agent-page/<dir>/tab") is seen. The list not
// seen is shared ("agent-page/<dir>/unseen") for agent-page's tabs.
const PAGES_AGAIN = 15000;
const PAGE_ROOT = ".config/herdr-app/mods/agent-page/pages";
const PAGE_LIST = 'cd "$HOME/$1" 2>/dev/null || exit 0; for f in *.html *.htm; do [ -f "$f" ] && printf "%s %s\\n" "$(cksum < "$f" | tr " " _)" "$f"; done; exit 0';
const isPage = (n) => /\.html?$/i.test(n) && !n.startsWith(".");
const pageSigs = new Map(); // dir -> { at, busy, sigs: Map(name -> signature) }
const seenOf = (dir) => { try { return JSON.parse(localGet(`kit.pages.seen.${dir}`) ?? "null"); } catch { return null; } };
const setSeen = (dir, v) => localSet(`kit.pages.seen.${dir}`, JSON.stringify(v));
const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return `${(h >>> 0).toString(36)}_${s.length}`; };
function unseenPages(dir) {
  const e = pageSigs.get(dir), seen = seenOf(dir) ?? {};
  return e?.sigs ? [...e.sigs].filter(([n, sig]) => seen[n] !== sig).map(([n]) => n).sort() : [];
}
function markShown(p) {
  const dir = pageDir(p.terminal), tab = shared(`agent-page/${dir}/tab`), sig = pageSigs.get(dir)?.sigs?.get(tab);
  if (!pageOpen(p) || !sig) return;
  const seen = seenOf(dir) ?? {};
  if (seen[tab] !== sig) { seen[tab] = sig; setSeen(dir, seen); setShared(`agent-page/${dir}/unseen`, unseenPages(dir)); }
}
function checkPages(p, cx) {
  const dir = pageDir(p.terminal), e = pageSigs.get(dir) ?? { at: 0 };
  pageSigs.set(dir, e);
  markShown(p);
  if (e.busy || Date.now() - e.at < PAGES_AGAIN) return;
  e.busy = true;
  const machine = placeOf(p).machine;
  cx.spawn(async (cx) => {
    try {
      let sigs;
      if (machine) {
        const r = await exec("sh", ["-c", PAGE_LIST, "sh", `${PAGE_ROOT}/${pageDir(String(p.terminal).split("/").pop())}`], { on: machine, timeout: PAGES_AGAIN });
        if (r.code !== 0) return;
        sigs = new Map(String(r.stdout).split("\n").filter(Boolean).map((l) => { const i = l.indexOf(" "); return [l.slice(i + 1), l.slice(0, i)]; }));
      } else {
        const folder = `${appHome()}/mods/agent-page/.pages/${dir}`;
        const names = (await files.readdir(folder).catch(() => [])).filter(isPage);
        sigs = new Map(await Promise.all(names.map(async (n) => [n, hash((await readTextFile(`${folder}/${n}`).catch(() => "")) ?? "")])));
      }
      e.sigs = sigs;
      if (seenOf(dir) === null) setSeen(dir, Object.fromEntries(sigs));
      markShown(p);
      setShared(`agent-page/${dir}/unseen`, unseenPages(dir));
    } catch {} finally { e.at = Date.now(); e.busy = false; cx.notify(); }
  });
}
function togglePage(p) {
  const open = pageOpen(p);
  if (open) run("pane.close", { pane: open });
  else {
    // like the phone: the first page not seen here, else the tab it had
    const first = unseenPages(pageDir(p.terminal))[0];
    if (first) setShared(`agent-page/${pageDir(p.terminal)}/tab`, first);
    const machine = placeOf(p).machine, props = { dir: pageDir(p.terminal), beside: p.pane };
    if (machine) Object.assign(props, { machine, term: String(p.terminal).split("/").pop() });
    run("pane.split", { direction: "right", pane: p.pane, mod: "agent-page", props, share: 0.35 });
  }
}
function offerMenu(cx) {
  const m = shared("agents.menu") ?? {};
  if (Date.now() - (m.kit?.at ?? 0) < MENU_AGAIN || offerMenu.busy) return;
  offerMenu.busy = true;
  cx.spawn(async () => {
    try {
      const files = await hasMod("agent-files");
      pageMod = await hasMod("agent-page");
      const items = [{ id: "context", label: "context 細項" }, ...(files ? [{ id: "files", label: "讀過、改過的檔案" }] : []),
        ...(pageMod ? [{ id: "page", label: "說明頁：進度和它寫的頁面" }] : []), { id: "kit", label: "Kit：它用的規則、技能、MCP" }];
      setShared("agents.menu", { ...(shared("agents.menu") ?? {}), kit: { at: Date.now(), items } });
    } finally { offerMenu.busy = false; }
  });
}

// a pane's agent as agents() lists it (its address is the compact's key), the status Herdr's Agents list shows (done
// while its own work still runs, agents.busy: working), its core turn, and the name the notices use
const agentOf = (p) => { try { return (agents() ?? []).find((x) => x.pane === p.pane) ?? null; } catch { return null; } };
const statusOf = (a) => (a.status === "done" && (shared("agents.busy") ?? {})[a.address] ? "working" : a.status);
const turnOf = (addr) => { try { return (terminals() ?? []).find((x) => x.address === addr)?.turn; } catch { return undefined; } };
const nameOf = (a, fallback = "agent") => a?.title || a?.program?.name || a?.address || fallback;
// a compact's next step (compactStep): typed in (marked sent first, so no other copy and not Herdr's Agents list types
// it too), ended, or given up. -> for "send": a promise of whether hc typed it in
function compactNext(addr, e, step, name, turn) {
  const key = compactKey(addr);
  if (step === "send") {
    setShared(key, { ...e, state: "sent", sent: Date.now(), turn: Number.isFinite(turn) ? turn : null });
    const failed = (r) => {
      if (shared(key)?.at === e.at) setShared(key, null);
      notify({ title: "沒有送出壓縮", body: String(r?.stderr || r?.stdout || "hc 沒有回應").trim().slice(0, 300), level: "warning" });
      return false;
    };
    return hc(["send", addr, e.text]).then((r) => {
      if (r?.code !== 0) return failed(r);
      notify({ title: "壓縮中…", body: name, level: "info", timeout: 3000 });
      return true;
    }, () => failed(null));
  }
  setShared(key, null);
  if (step === "done") notify({ title: "壓縮好了", body: e.quiet ? `${name}（它不說何時壓縮完：送出 30 秒後當作好了）` : name, level: "success", timeout: 3000 });
  else if (step === "timeout") notify({ title: e.state === "sent" ? "壓縮沒等到結束" : "排隊的壓縮取消了", level: "warning", timeout: 6000,
    body: `${name}：${e.state === "sent" ? "3 分鐘還沒看到它壓縮完，不再等（看一下它的畫面）" : "等了 30 分鐘它還沒停下來，沒有送出"}` });
}

export class Header {
  constructor(role) { this.role = role; }

  init(_p, cx) {
    if (this.role === "context") return this.initContext(cx);
    this.hovered = false;
    // leftovers of older versions
    for (const k of ["kit.data.v1", "kit.target"]) if (shared(k) != null) setShared(k, null);
    cx.timer.every(1500, (cx) => this.tick(cx));
    this.tick(cx);
  }

  async close(_cx) {
    if (this.role !== "context") return;
    giveBusy(this.mine);
    this.mine = null;
    this.keep?.release();
    this.keep = null;
  }

  me() { return panes().find((p) => p.pane === props()?.pane); }

  // ask kit when there is no answer, it is a minute old, or someone asked for a fresh one; one ask at a time per agent.
  // First whether kit there is new enough (kit api): until it is, nothing else is asked.
  tick(cx) {
    const p = this.me();
    if (!p?.terminal || !p.program?.agent) return;
    checkPage(cx);
    if (pageFor(p)) checkPages(p, cx);
    offerMenu(cx);
    this.tickCompact(p);
    const w = placeOf(p), api = apiKnown(w.machine);
    if (!api) { checkApi(w.machine, cx); return; }
    if (!api.ok) return;
    this.tickContext(p, cx);
    this.tickLimit(p, cx);
    const c = (shared(AGENT_CACHE) ?? {})[w.key], want = (shared(AGENT_WANT) ?? {})[w.key] ?? 0;
    if (c?.busy && Date.now() - (c.started ?? 0) < LOAD_TTL) return;
    if (c && !c.busy && Date.now() - c.at < STALE && (c.started ?? 0) >= want) return;
    const started = Date.now();
    setShared(AGENT_CACHE, { ...pruned(shared(AGENT_CACHE)), [w.key]: { ...summary(null), ...(c ?? {}), busy: true, started } });
    cx.spawn(async (cx) => {
      let d;
      try { d = await loadAgent(w.machine, p.cwd, p.terminal); }
      catch (e) { d = { error: String(e?.message ?? e), machine: w.machine, at: Date.now() }; }
      setShared(AGENT_DATA, { ...pruned(shared(AGENT_DATA)), [w.key]: d });
      setShared(AGENT_CACHE, { ...pruned(shared(AGENT_CACHE)), [w.key]: { ...summary(d), started, at: Date.now(), busy: false } });
      cx.notify();
    });
  }

  // its compact (shared with Herdr's Agents list): a queued one typed in once it waits, a sent one ended (compactStep);
  // kit not needed (kit context's "compacted" ends one sooner: tickContext). Its queued /reload-plugins (after a kit
  // change: common.js reloadAfter) the same way.
  tickCompact(p) {
    const a = agentOf(p), e = a && shared(compactKey(a.address)), r = a && shared(reloadKey(a.address));
    const rs = r && compactStep(r, statusOf(a), null);
    if (rs) reloadNext(a.address, r, rs, nameOf(a));
    if (!e) return;
    const turn = turnOf(a.address), step = compactStep(e, statusOf(a), turn);
    if (step) compactNext(a.address, e, step, nameOf(a), turn);
  }

  // ask how full the context is: every 15 s while the agent works (and once when it stops), else every minute
  tickContext(p, cx) {
    const w = placeOf(p), all = shared(CTX) ?? {}, c = all[w.key];
    if (c?.busy && Date.now() - (c.started ?? 0) < LOAD_TTL) return;
    const age = Date.now() - (c?.at ?? 0), moved = c && c.status !== p.status;
    if (c && !moved && age < (p.status === "working" ? CTX_STALE : CTX_IDLE)) return;
    const started = Date.now();
    setShared(CTX, { ...pruned(all), [w.key]: { ...(c ?? {}), busy: true, started, status: p.status } });
    cx.spawn(async (cx) => {
      let d = null, note;
      try { ({ ctx: d, note } = await loadContext(w.machine, p.cwd, p.terminal, toolOf(p.app, p.program?.key), apiAtLeast(w.machine, 4), c)); } catch {}
      if (note !== undefined) setShared(NOTE, { ...pruned(shared(NOTE)), [w.key]: note });
      // a failed ask (no answer, kit busy, the machine away) keeps the numbers it had: only when it asked changes
      const before = (shared(CTX) ?? {})[w.key] ?? c ?? {};
      const now = d ? { ...d } : { ...before };
      setShared(CTX, { ...pruned(shared(CTX)), [w.key]: { ...now, busy: false, started, at: Date.now(), status: p.status } });
      const a = agentOf(p), e = a && shared(compactKey(a.address));
      if (compactedAfter(e, d, started)) compactNext(a.address, e, "done", nameOf(a));
      cx.notify();
    });
  }

  // a Claude or Codex stopped at its plan's usage limit (kit context's limit): once the limit has reset, type 繼續 for it, once
  // per stop and only while it waits (idle, done). Marked before it is sent, so a second window's header of the same
  // pane doesn't type it too; a send that fails is unmarked (tried again next tick). The context is asked again after.
  tickLimit(p, cx) {
    const w = placeOf(p), c = (shared(CTX) ?? {})[w.key], sent = (shared(LIMIT_SENT) ?? {})[w.key];
    let a = null; try { a = (agents() ?? []).find((x) => x.pane === p.pane) ?? null; } catch {}
    const status = a?.status ?? p.status;
    if (this.continuing || !continueDue(c, status, sent, Date.now(), autoContinue())) return;
    const args = sendArgs(a?.address ?? p.terminal, status, CONTINUE_TEXT);
    if (!args) return;
    const until = c.limit.until;
    this.continuing = true;
    setShared(LIMIT_SENT, { ...pruned(shared(LIMIT_SENT)), [w.key]: until });
    cx.spawn(async (cx) => {
      let ok = false;
      try { const r = await hc(args); ok = r?.code === 0; } catch {}
      const all = { ...(shared(LIMIT_SENT) ?? {}) };
      if (!ok && all[w.key] === until) { delete all[w.key]; setShared(LIMIT_SENT, all); }
      if (ok) {
        const cc = (shared(CTX) ?? {})[w.key];
        if (cc) setShared(CTX, { ...(shared(CTX) ?? {}), [w.key]: { ...cc, at: 0 } });   // ask again soon: the limit is gone
        notify?.({ title: "Kit", description: `額度恢復了，已替 ${a?.title || p.title || "agent"} 打「${CONTINUE_TEXT}」`, level: "info" });
      }
      this.continuing = false;
      cx.notify();
    });
  }

  // [context 35% 139k/400k]: like the Kit chip, one width whatever it says (the header never moves); yellow from
  // 70 %, red from 90 %; a click opens where the tokens go, a right-click copies the numbers
  contextChip(t, p) {
    const c = (shared(CTX) ?? {})[placeOf(p).key], lim = limitOf(c);
    if (lim) return this.limitChip(t, p, lim);
    const { has, pct, nums, copy, loading } = chipNumbers(c);
    const color = pct == null ? t.dim : levelColor(t, pct);
    const chip = h_flex().id(`kit-ctx-${p.pane}`).flex_none().w(CTX_FULL).h(22).pl(2).pr(6).gap(5).items_center().rounded(6)
      .bg(t.surface).border_1().border_color(pct != null && pct >= 90 ? t.blocked : t.border).text_size(11).cursor_pointer()
      .hover((st) => st.bg(t.hover).border_color(t.accent))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); this.openContext(p); }).tooltip("context 用了多少，按一下看細項")
      .child(div().h(16).px(5).flex().flex_none().items_center().rounded(4).bg(t.raised).font_semibold().text_color(t.foreground).child("context"))
      .when(pct != null, (el) => el.child(div().flex_none().font_semibold().text_color(color).child(`${pct}%`)))
      // no number yet: "讀取中", breathing like a card at work
      .when(pct == null, (el) => el.child(div().id(`kit-ctx-wait-${p.pane}`).flex_none().min_w(0).truncate().text_color(t.dim)
        .child(nums).when(loading, (d) => d.loop("opacity", { from: 0.3, to: 1, period: 1400 }))))
      .when(pct != null, (el) => el.child(div().min_w(0).truncate().text_color(t.dim).child(nums)));
    return has ? copyOnRight(chip, copy) : chip;
  }

  // [上限 00:10 恢復]: in the context chip's place while the agent is stopped at its plan's usage limit (red); once it
  // has reset and 繼續 is about to be typed: [上限 已恢復]. A click opens the context window (the usage is there)
  limitChip(t, p, lim) {
    const when = whenText(lim.until), auto = autoContinue();
    const text = lim.back ? (auto ? "已恢復，馬上繼續" : "已恢復") : `${when} 恢復`;
    const tip = lim.back ? `${lim.name}上限已經恢復${auto ? `，會替它打「${CONTINUE_TEXT}」` : `；自動繼續關著，要自己叫它繼續`}`
      : `撞到${lim.name}上限，${when} 恢復${auto ? `；到時替它打「${CONTINUE_TEXT}」` : ""}。按一下看用量`;
    return h_flex().id(`kit-ctx-${p.pane}`).flex_none().w(CTX_FULL).h(22).pl(2).pr(6).gap(5).items_center().rounded(6)
      .bg(t.surface).border_1().border_color(lim.back ? t.working : t.blocked).text_size(11).cursor_pointer()
      .hover((st) => st.bg(t.hover).border_color(t.accent))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); this.openContext(p); }).tooltip(tip)
      .child(div().h(16).px(5).flex().flex_none().items_center().rounded(4).bg(lim.back ? t.working : t.blocked).font_semibold().text_color(t.background).child("上限"))
      .child(div().min_w(0).truncate().text_color(lim.back ? t.working : t.blocked).child(text));
  }

  openContext(p) {
    const w = placeOf(p);
    const target = { key: w.key, pane: p.pane, term: p.terminal, machine: w.machine, tab: w.tab, cwd: p.cwd ?? null, tool: toolOf(p.app, p.program?.key),
      title: ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || "", program: p.program ?? null };
    openOverlay({ mod: "kit", props: { role: "context", target }, kind: "popup", width: CTX_W, height: CTX_H });
  }

  // split / zoom / close: always laid out (so nothing moves), seen and clickable only while the header is hovered
  button(t, id, name, command, args, live) {
    const b = div().id(id).flex_none().p(3).rounded(4).text_color(t.dim).child(svg(`mods/pane/${name}.svg`).size(14));
    if (!live) return b.invisible();
    return b.hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); run(command, args); });
  }

  // agent-page beside this agent: shown while it's open (in the accent color) or while it has a page not seen here (a red
  // dot), else on hover like the others
  pageButton(t, p, live) {
    const on = Boolean(pageOpen(p)), fresh = unseenPages(pageDir(p.terminal)).length;
    // the id changes with the state: Herdr keeps a tooltip while the pointer stays, so after a click (open / close) the
    // old text ("關掉說明頁") would stay; a new id starts a new one with the right words
    const b = div().id(`kit-head-p-${p.pane}-${on ? "on" : "off"}`).relative().flex_none().p(3).rounded(4).text_color(on ? t.accent : t.dim)
      .child(svg("mods/agent-page/icon.svg").size(14))
      .when(fresh > 0 && !on, (el) => el.child(div().absolute().top(1).right(1).size(6).rounded(3).bg(t.blocked)));
    if (!live && !on && !fresh) return b.invisible();
    return b.tooltip(on ? "關掉說明頁" : fresh ? `說明頁：${fresh} 頁還沒看` : "說明頁：進度和它寫的頁面").hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); togglePage(p); });
  }

  // what the Kit chip says: kit there can't be used (none, too old, newer than this mod): which, in red (the popup says
  // what to do); else this agent's counts
  kitSummary(p) {
    const w = placeOf(p), c = (shared(AGENT_CACHE) ?? {})[w.key], a = apiState(w.machine);
    return a?.kind && !a.ok ? { text: { missing: "沒有 kit", timeout: "kit 沒回應", old: "kit 太舊", newer: "mod 太舊" }[a.kind] ?? "kit 不能用", level: "bad" }
      : c?.text ? c : summary(null);
  }

  openAgent(p) {
    const w = placeOf(p);
    const target = { key: w.key, term: p.terminal, machine: w.machine, space: w.space, tab: w.tab, cwd: p.cwd ?? null, app: p.app ?? null,
      title: ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || "", program: p.program ?? null };
    openOverlay({ mod: "kit", props: { role: "agent", target }, kind: "popup", width: POPUP_W, height: POPUP_H });
  }

  // a pick in the Agents list's right-click menu for this pane's agent (the menu focused the pane first, so this header
  // shows): once, and only a fresh one
  menuPick(p) {
    const k = shared("agents.menu.pick");
    if (!k || k.mod !== "kit" || k.pane !== p.pane || Date.now() - (k.at ?? 0) > 10000) return;
    setShared("agents.menu.pick", null);
    if (k.id === "context") this.openContext(p);
    else if (k.id === "kit") this.openAgent(p);
    else if (k.id === "files") run("mod.open", { name: "agent-files" });
    else if (k.id === "page" && pageFor(p) && !pageOpen(p)) togglePage(p);
  }

  kitButton(t, p) {
    const w = placeOf(p), s = this.kitSummary(p);
    const color = s.level === "bad" ? t.blocked : t.dim;
    // [kit | 規則 1  skill 3  MCP 1]: the word kit says what it is, the numbers stand out from their labels
    const body = s.counts
      ? s.counts.map(([label, n]) => h_flex().gap(3).items_center()
        .child(div().text_color(t.dim).child(label))
        .child(div().font_semibold().text_color(n ? t.foreground : t.dim).child(String(n))))
      : [div().text_color(color).child(s.text)];
    return h_flex().id(`kit-btn-${p.pane}`).flex_none().h(22).pl(2).pr(8).gap(7).items_center().rounded(6)
      .bg(t.surface).border_1().border_color(s.level === "bad" ? t.blocked : t.border).text_size(11)
      .hover((st) => st.bg(t.hover).border_color(t.accent))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); this.openAgent(p); })
      .child(div().h(16).px(5).flex().items_center().rounded(4).bg(t.raised).font_semibold().text_color(t.foreground).child("Kit"))
      .when(Boolean(s.agent), (el) => el.child(div().text_color(t.accent).child(s.agent)))
      .children(body)
      .when(Boolean(s.news), (el) => el.child(div().px(4).rounded(4).bg(t.done).text_color(t.background).child(`${s.news} 新`)));
  }

  render(cx) {
    if (this.role === "context") return this.renderContext(cx);
    const t = theme(), p = this.me();
    if (!p) return div();
    if (p.terminal && p.program?.agent) this.menuPick(p);
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const pic = icon(p.program, 14, t.dim), st = p.status, pane = p.pane, agent = Boolean(p.terminal && p.program?.agent), live = this.hovered;
    const ctxOn = agent && apiState(placeOf(p).machine)?.ok !== false;
    // the status in a small box of one width (a red "!" for Needs you, a dot when done, else nothing): the header never moves
    const status = div().flex_none().w(16).h(22).flex().items_center().justify_center()
      .when(st === "blocked", (el) => el.child(div().flex_none().size(14).flex().items_center().justify_center().rounded(7).bg(t.blocked)
        .text_size(10).font_bold().text_color(t.background).tooltip("Needs you：在等你回答").child("!")))
      .when(st === "done", (el) => el.child(div().size(7).flex_none().rounded(4).bg(t.done)));
    // split / zoom / close: always laid out (nothing moves; not over the chips, which a hover must reach), seen on hover
    const buttons = h_flex().flex_none().gap(2).items_center()
      .when(pageFor(p), (el) => el.child(this.pageButton(t, p, live)))
      .child(this.button(t, `kit-head-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }, live))
      .child(this.button(t, `kit-head-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }, live))
      .child(this.button(t, `kit-head-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }, live))
      .child(this.button(t, `kit-head-x-${pane}`, "close", "pane.close", { pane }, live));
    return h_flex().id(`kit-head-${pane}`).size_full().px(10).gap(8).items_center()
      .bg(t.background).border_b(1).border_color(t.border).text_size(12)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(NAME_MAX).font_medium().text_color(t.foreground).child(name))
      .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(shortDir(p.cwd)))
      .when(agent && Boolean(shared(reloadKey(p.terminal))), (el) => el.child(div().flex_none().text_color(t.dim)
        .child((shared(reloadKey(p.terminal)).texts ?? []).some((x) => x !== "/reload-plugins") ? "排隊送規則" : "排隊重新載入")))
      .when(agent, (el) => el.child(this.kitButton(t, p)).when(ctxOn, (el) => el.child(this.contextChip(t, p))))
      .child(status)
      .child(buttons);
  }

  // ---------- the context popup (role "context") ----------
  initContext(cx) {
    this.role = "context";
    this.target = props()?.target ?? {};
    const last = LAST_DETAIL.get(props()?.target?.key);
    this.d = last?.d ?? null;          // kit context --detail's answer (the last one first, while it is asked anew)
    this.dAt = last?.at ?? null;       // when this.d was read, while it is the last window's
    this.asked = false;                // asked once when it opens; ⟳ asks again
    this.err = null;        // why the last ask failed (an older answer stays)
    this.loading = false;
    // which lists are open (group id, "group|name"); the groups are kept for the next time it opens
    try { this.open = JSON.parse(localGet("kit.ctx.open") || "null") ?? { msgs: true }; } catch { this.open = { msgs: true }; }
    if (typeof this.open !== "object" || Array.isArray(this.open)) this.open = { msgs: true };
    this.more = {};         // lists shown in full
    this.ask = null;        // what waits for 確定: "compact", "clear", "clear2", "rm:<group>|<name>"
    this.msg = null;        // { ok, text } after a button
    this.sending = false;
    this.mine = null;       // the id of the kit.busy this window holds
    this.keep = InputState.new({ placeholder: "壓縮時要保留什麼（可空白）" });
    this.keep.on("submit", (_e, cx) => this.send("compact", cx));
    // kit context --detail only once kit api says kit there can be used (the header asks it; asked here too in case)
    const m = this.target.machine ?? null;
    const tick = (cx) => {
      const api = apiKnown(m);
      if (!api) checkApi(m, cx);
      else if (api.ok && !this.asked && !this.loading) { this.asked = true; this.loadDetail(false, cx); }
      if (api?.ok && apiAtLeast(m, 7) && this.usage === undefined) this.loadUsage(cx);
      cx.notify();   // the agent's status (which buttons work) and "n 秒前"
    };
    tick(cx);
    cx.timer.every(2000, tick);
  }

  // kit usage on the agent's machine (kit api 1.7): the plan's 5-hour and weekly use, asked once per window and by ⟳
  loadUsage(cx) {
    this.usage = null;
    const m = this.target.machine ?? null;
    cx.spawn(async (cx) => {
      let u = null;
      try { const r = await kit(["usage"], 30000, m); if (r.code === 0) { const d = JSON.parse(r.out); if (d && typeof d === "object") u = d; } } catch {}
      this.usage = u;
      cx.notify();
    });
  }

  paneNow() { return panes().find((p) => p.pane === this.target.pane) ?? null; }
  agentNow() { try { return (agents() ?? []).find((a) => a.pane === this.target.pane) ?? null; } catch { return null; } }
  statusNow() { return this.agentNow()?.status ?? this.paneNow()?.status ?? null; }
  addrNow() { return this.agentNow()?.address ?? this.paneNow()?.terminal ?? this.target.term ?? null; }
  kitList() { return (shared(AGENT_DATA) ?? {})[this.target.key] ?? null; }
  get busy() { return busyNow(); }

  loadDetail(fresh, cx) {
    const m = this.target.machine ?? null;
    if (apiState(m)?.ok !== true) return checkApi(m, cx, true);   // ⟳ while kit can't be used: ask kit api again
    if (this.loading) return;
    this.loading = true;
    this.err = null;
    const tg = this.target, seq = (this.seq = (this.seq ?? 0) + 1);
    cx.spawn(async (cx) => {
      let d = null, err = null;
      try {
        const p = this.paneNow(), pid = await agentPid(p?.terminal ?? tg.term);
        if (!pid) err = "找不到這個 agent 的程式（它可能已經關掉了）。";
        else {
          const r = await kit(ctxArgs(pid, tg.tool, p?.cwd ?? tg.cwd, true, fresh), 60000, tg.machine ?? null);
          if (r.code !== 0) err = clean(r.err || r.out) || `kit context 失敗（${r.code}）`;
          else {
            try { d = JSON.parse(r.out); } catch { d = null; }
            if (!d || !Array.isArray(d.categories)) { d = null; err = "kit context --detail 的輸出讀不懂（kit 太舊？打 kit self-update）"; }
          }
        }
      } catch (e) { err = String(e?.message ?? e); }
      if (seq === this.seq) {
        if (d) { this.d = d; this.dAt = null; LAST_DETAIL.set(tg.key, { d, at: Date.now() }); }
        this.err = err; this.loading = false;
      }
      cx.notify();
    });
  }

  // 壓縮 / 清空重來: the tool's own command, typed into this agent by hc send, only while it waits for you
  send(what, cx) {
    if (this.sending) return;
    const text = sendText(this.d?.commands, what, what === "compact" ? this.keep?.value() : "");
    if (what === "compact") return this.compact(text, cx);
    const args = sendArgs(this.addrNow(), this.statusNow(), text);
    this.ask = null;
    if (!args) { this.msg = { ok: false, text: "沒送出：要等 agent 停下來（閒置或剛做完）才能送。" }; cx.notify(); return; }
    this.sending = true;
    this.msg = null;
    cx.notify();
    cx.spawn(async (cx) => {
      let err = null;
      try { const r = await hc(args); if (r?.code !== 0) err = String(r?.stderr || r?.stdout || `exit ${r?.code}`).trim().slice(0, 300); }
      catch (e) { err = String(e?.message ?? e); }
      this.sending = false;
      this.msg = err ? { ok: false, text: `沒送出：${err}` } : { ok: true, text: `已送出 ${text}：這段對話清掉了，按 ⟳ 再看。` };
      cx.notify();
    });
  }

  // 壓縮: one per agent per cycle, with Herdr's Agents list (shared "compact/<address>"): typed in now if it waits, else
  // queued until this turn ends (the agent's header or the Agents list types it in then); pressed again, it only says so
  compact(text, cx) {
    const addr = this.addrNow(), st = this.compactStatus(), key = addr && compactKey(addr);
    this.ask = null;
    if (key && compactLive(shared(key))) { this.msg = { ok: true, text: "已經在壓縮了" }; cx.notify(); return; }
    if (!key || !text || !["idle", "done", "working"].includes(st)) {
      this.msg = { ok: false, text: "沒送出：它在等你回答，或看不到它的狀態。" };
      cx.notify();
      return;
    }
    const job = { state: "queued", at: Date.now(), text, quiet: this.target.tool === "omp" };
    setShared(key, job);
    this.keep?.set_value("");
    this.msg = null;
    if (st === "working") return cx.notify();
    this.sending = true;
    cx.notify();
    cx.spawn(async (cx) => {
      const ok = await compactNext(addr, job, "send", nameOf(this.agentNow(), addr), turnOf(addr));
      this.sending = false;
      if (!ok) this.msg = { ok: false, text: "沒送出壓縮（原因在通知裡）" };
      cx.notify();
    });
  }
  // as Herdr's Agents list shows it: done while its own work still runs (agents.busy) is working
  compactStatus() { const st = this.statusNow(); return st === "done" && (shared("agents.busy") ?? {})[this.addrNow()] ? "working" : st; }

  // 拿掉: kit rm (--dir for the folder's), as the Kit popup does; it counts from the agent's next conversation
  remove(rm, cx) {
    if (!rm?.args || this.busy) return;
    this.mine = takeBusy(`拿掉 ${rm.name}`, SHORT);
    if (!this.mine) return;
    this.ask = null;
    this.msg = null;
    cx.notify();
    const tg = this.target, clear = this.d?.commands?.clear || "/clear";
    cx.spawn(async (cx) => {
      try {
        const r = await kit(rm.args, 60000, tg.machine ?? null);
        const where = rm.where === "folder" ? ` ${shortDir(rm.dir)} ` : "整個帳號";
        this.msg = r.code === 0
          ? { ok: true, text: [`已從${where}拿掉 ${rm.name}。這個 agent 要清空重來（${clear}）或重開才不會再讀它。`, clean(r.err)].filter(Boolean).join("\n") }
          : { ok: false, text: `沒拿掉 ${rm.name}：${clean(r.err || r.out) || `失敗（${r.code}）`}` };
        const line = r.code === 0 ? await reloadAfter(rm.args, tg.machine ?? null).catch(() => "") : "";
        if (line) this.msg = { ...this.msg, text: `${this.msg.text}\n${line}` };
      } catch (e) {
        this.msg = { ok: false, text: `沒拿掉 ${rm.name}：${e?.message ?? e}` };
      } finally {
        giveBusy(this.mine);
        this.mine = null;
        // every Kit button on that machine looks again (kit list), and the repository when it is this computer
        markChanged(tg.machine ?? null);
        cx.notify();
      }
    });
  }

  // 開檔: a memory / instruction file in kit's editor window (this computer's files only)
  openFile(g, it, cx) {
    const path = it.path, open = (shared(EDITORS) ?? {})[path];
    if (open?.dirty && Date.now() - (open.at ?? 0) < 120000) {
      this.msg = { ok: false, text: "這個檔案已經開在大視窗裡，還沒存檔：先去那裡存檔或關掉。" };
      cx.notify();
      return;
    }
    const name = slash(path).split("/").pop() || path;
    openOverlay({ mod: "kit", kind: "window", key: `kit-editor:${path}`, width: 0.7, height: 0.85,
      props: { role: "editor", item: { path, name, kind: "file", plain: true, source: [g.name, it.note].filter(Boolean).join(" · "), rel: shortDir(path) } } });
  }

  copySummary(cx) {
    const tg = this.target, text = summaryText(this.d, tg.title, [tg.machine ?? "這台電腦", shortDir(tg.cwd)].filter(Boolean).join(" · "));
    if (!text) return;
    cx.write_to_clipboard(text);
    notify({ title: "已複製", body: "context 的細項", level: "success", timeout: 1500 });
  }

  renderContext(_cx) {
    const t = theme(), z = fs(), d = this.d, p = this.paneNow();
    const root = v_flex().id("ctx-root").size_full().h(CTX_H).rounded(8).bg(t.surface).text_size(z).text_color(t.foreground)
      .child(this.ctxHeader(t, z));
    if (this.msg) root.child(this.ctxMessage(t, z));
    const api = apiState(this.target.machine ?? null);
    if (api?.kind && !api.ok) return root.child(apiCard(t, z, api, this.target.machine ?? null, "ctx"));
    const body = v_flex().id("kit-header-body").flex_1().min_h(0).overflow_y_scrollbar().px(12).py(10).gap(10);
    if (!p) body.child(div().text_color(t.dim).child("這個 agent 已經關掉了。"));
    if (this.err) body.child(v_flex().p(8).rounded(6).bg(t.raised).text_size(z - 1).text_color(t.blocked)
      .child(textBlock("ctx-err", d ? `沒更新到（下面是上一次的）：${this.err}` : this.err)));
    const asking = this.target.tool === "claude" ? "正在問 Claude Code" : "讀取中";
    if (!d) {
      // what is known already: the pane header's number and the plan's use; the parts come when kit answers
      const c = (shared(CTX) ?? {})[this.target.key], q = chipNumbers(c);
      if (q.has) body.child(div().font_semibold().child(`已使用 ${q.pct != null ? `${Math.round(q.pct)}% · ` : ""}${q.nums}`));
      const use0 = this.ctxUsage(t, z);
      if (use0) body.child(use0);
      if (!this.err) body.child(waiting(t, z, `${asking}各部分用了多少（長的對話要幾秒）…`, t.dim));
      return root.child(body);
    }
    if (this.dAt && this.loading) body.child(h_flex().gap(6).items_center().text_size(z - 2).text_color(t.dim)
      .child(spin(z - 3, t.dim)).child(`下面是 ${ago(Math.floor(this.dAt / 1000))}的數字，${asking}最新的…`));
    body.child(this.ctxTop(t, z, d));
    const use = this.ctxUsage(t, z);
    if (use) body.child(use);
    if (d.error) body.child(v_flex().p(8).rounded(6).bg(t.raised).text_size(z - 1.5).text_color(t.working)
      .child(textBlock("ctx-derr", d.categories?.length ? `${d.error}\n所以下面是估算的。` : d.error)));
    if (d.categories?.length) body.child(this.ctxBar(t, d)).child(this.ctxCats(t, z, d));
    const list = this.kitList(), can = (g, name) => Boolean(removal(list, g, name)?.args);
    const tips = ctxTips(d, can);
    if (tips.length) body.child(v_flex().gap(4).p(8).rounded(6).bg(t.raised)
      .child(div().font_semibold().child("怎麼省"))
      .children(tips.map((x, i) => h_flex().gap(6).items_start().text_size(z - 1.5)
        .child(div().flex_none().text_color(t.dim).child("•"))
        .child(div().flex_1().min_w(0).child(textBlock(`ctx-tip-${i}`, x))))));
    for (const g of d.groups ?? []) body.child(this.ctxGroup(t, z, g, list));
    if (d.note) body.child(div().text_size(z - 2.5).text_color(t.dim).child(textBlock("ctx-note", `${d.note}${d.exact ? "" : "\n≈ 是估算的數字。"}`)));
    return root.child(body).child(this.ctxFooter(t, z, d));
  }

  ctxHeader(t, z) {
    const tg = this.target, pic = icon(tg.program, 18, t.foreground);
    const where = [tg.machine ?? "這台電腦", tg.tab, shortDir(tg.cwd)].filter(Boolean).join(" · ");
    return h_flex().flex_none().px(10).py(8).gap(6).items_center().border_b(1).border_color(t.border)
      .child(div().size(32).flex_none().rounded(16).bg(t.raised).flex().items_center().justify_center().child(pic ?? div().text_color(t.dim).child("•")))
      .child(v_flex().flex_1().min_w(0)
        .child(copyOnRight(div().truncate().font_semibold().child(`${tg.title || "agent"} 的 context`), tg.title || "agent"))
        .child(copyOnRight(div().truncate().text_size(z - 1.5).text_color(t.dim).child(where), tg.cwd ?? where)))
      .child(btn(t, z, "ctx-copy", "複製", { tiny: true, off: !this.d, on: (cx) => this.copySummary(cx) }))
      .child(btn(t, z, "ctx-reload", this.loading ? spin(z - 2, t.dim) : "⟳", { tiny: true, off: this.loading, on: (cx) => { this.loadDetail(true, cx); if (apiAtLeast(this.target.machine ?? null, 7)) this.loadUsage(cx); } }))
      .child(btn(t, z, "ctx-close", "✕", { tiny: true, on: () => closeOverlay(props()?.overlay) }));
  }

  ctxMessage(t, z) {
    const m = this.msg;
    return h_flex().flex_none().mx(10).mt(8).p(8).gap(8).items_start().rounded(6).bg(t.raised).border_1().border_color(m.ok ? t.border : t.blocked)
      .child(div().flex_1().min_w(0).text_size(z - 1).text_color(m.ok ? t.foreground : t.blocked).child(textBlock("ctx-msg", m.text)))
      .child(div().id("ctx-msg-x").flex_none().px(4).cursor_pointer().text_color(t.dim).hover((s) => s.text_color(t.foreground))
        .on_mouse_down("left", stop).on_click((_e, cx) => { this.msg = null; cx.notify(); }).child("✕"));
  }

  // 方案用量: the plan's windows for this agent's tool (kit usage), the limit it stopped at (kit context's limit, as the
  // header keeps it), and whether 繼續 is typed for it once the limit resets
  ctxUsage(t, z) {
    const tool = this.target.tool === "codex" ? "codex" : this.target.tool === "claude" ? "claude" : this.target.tool === "omp" ? "omp" : null;
    if (!tool) return null;
    const c = (shared(CTX) ?? {})[this.target.key];
    // omp: what omp says for the provider of the model it uses (it may be another account than Claude Code's or Codex's)
    const om = tool === "omp" ? ompUsage(this.usage, this.d?.model ?? c?.model) : null, use = tool === "omp" ? om?.u : this.usage?.[tool];
    const lines = usageLines(use), lim = limitOf(c), auto = autoContinue();
    if (!lines.length && !lim) return null;
    const who = tool === "claude" ? "Claude" : tool === "codex" ? "Codex" : `omp 的 ${om?.provider ?? "帳號"}`;
    const box = v_flex().gap(4).p(8).rounded(6).bg(t.raised).border_1().border_color(lim && !lim.back ? t.blocked : t.border)
      .child(div().font_semibold().child(`方案用量（${who}，這個帳號所有 agent 一起算）`));
    if (lim) box.child(div().text_size(z - 1).text_color(lim.back ? t.working : t.blocked)
      .child(lim.back ? `${lim.name}上限已經恢復${auto ? `，會替它打「${CONTINUE_TEXT}」` : "，要自己叫它繼續"}` : `撞到${lim.name}上限停下來了，${whenText(lim.until)} 恢復`));
    // each window: its line, and under it a bar of how much is used (like the context bar below: the accent color, from 70 % working's, from 90 % red; a window that reset: empty)
    for (const [i, x] of lines.entries()) box.child(v_flex().id(`ctx-use-${i}`).gap(3).text_size(z - 1.5)
      .child(div().min_w(0).text_color(levelColor(t, x.pct)).child(x.text))
      .child(h_flex().id(`ctx-use-bar-${i}`).h(6).w_full().rounded(3).overflow_hidden().bg(t.border)
        .child(div().h(6).flex_none().w(`${x.pct ?? 0}%`).bg(({ full: t.blocked, high: t.working })[level(x.pct)] ?? t.accent))));
    if (use?.at) box.child(div().text_size(z - 2.5).text_color(t.dim).child(`${ago(Math.floor(use.at / 1000))}的數字`));
    box.child(h_flex().gap(6).items_center().text_size(z - 1.5)
      .child(div().flex_1().min_w(0).text_color(t.dim).child(`撞到上限停下來的 agent，額度恢復後自動打「${CONTINUE_TEXT}」：${auto ? "開" : "關"}`))
      .child(btn(t, z, "ctx-auto", auto ? "關掉" : "打開", { tiny: true, on: (cx) => { localSet("kit.autoContinue", auto ? "off" : "on"); cx.notify(); } })));
    return box;
  }

  // 已使用 61% · 243k / 400k, and whose count it is
  ctxTop(t, z, d) {
    const pct = d.pct == null ? null : Math.min(100, d.pct);
    const color = levelColor(t, pct);
    const how = howCounted(d);
    return v_flex().gap(2)
      .child(h_flex().gap(6).items_end()
        .child(div().text_color(t.dim).child("已使用"))
        .child(copyOnRight(div().text_size(z + 8).font_semibold().text_color(color).child(pct == null ? "—" : `${pct}%`), pct == null ? "" : `${pct}%`))
        .child(copyOnRight(div().pb(2).font_semibold().child(`· ${num(d.used)} / ${d.window != null ? num(d.window) : "?"}`), `${d.used ?? ""} / ${d.window ?? ""}`)))
      .child(div().text_size(z - 2).text_color(t.dim).child([d.model, how, d.at ? ago(d.at) : ""].filter(Boolean).join(" · ")));
  }

  // the stacked bar: what is used (by category), then what is free, Claude's auto-compact reserve at the end
  ctxBar(t, d) {
    const { used, buffer } = barSegments(d), seg = (pct, color) => div().h(10).flex_none().w(`${pct}%`).bg(color);
    return h_flex().h(10).w_full().rounded(5).overflow_hidden().bg(t.raised)
      .children(used.map((s) => seg(s.pct, catColor(t, s.id))))
      .child(div().flex_1())
      .when(buffer != null, (el) => el.child(seg(buffer, t.border)));
  }

  ctxCats(t, z, d) {
    const w = Number(d.window) || 0, list = v_flex().gap(3);
    for (const c of d.categories ?? []) {
      const deferred = c.kind === "deferred", free = c.kind === "free", buffer = c.kind === "buffer";
      const dot = div().size(9).flex_none().rounded(5);
      if (deferred) dot.border_1().border_color(t.dim);
      else if (free) dot.bg(t.raised).border_1().border_color(t.border);
      else dot.bg(buffer ? t.border : catColor(t, c.id));
      list.child(h_flex().gap(8).items_center().text_size(z - 1)
        .child(dot)
        .child(div().flex_1().min_w(0).truncate().text_color(deferred || free ? t.dim : t.foreground).child(deferred ? `${c.name} · 用到才載入（${kfmt(c.tokens)}）` : c.name))
        .child(copyOnRight(div().flex_none().w(70).text_right().text_color(deferred ? t.dim : t.foreground).child(deferred ? "—" : `${c.est ? "≈" : ""}${kfmt(c.tokens)}`), String(c.tokens)))
        .child(div().flex_none().w(48).text_right().text_color(t.dim).child(catShare(c, w))));
    }
    return list;
  }

  // one list (memory files, skills, MCP by server, what was said by kind and by tool, …): click to open; most first
  ctxGroup(t, z, g, list) {
    const items = g.items ?? [], open = Boolean(this.open[g.id]);
    const head = h_flex().id(`g-${g.id}`).gap(6).items_center().rounded(4).cursor_pointer().hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
      .on_click((_e, cx) => {
        this.open[g.id] = !open;
        localSet("kit.ctx.open", JSON.stringify(Object.fromEntries(Object.entries(this.open).filter(([k]) => !k.includes("|")))));
        cx.notify();
      })
      .child(div().w(12).text_color(t.dim).child(open ? "▾" : "▸"))
      .child(div().flex_1().min_w(0).truncate().font_semibold().child(`${g.name}（${items.length}）`))
      .child(div().flex_none().text_color(t.dim).child(g.tokens == null ? "" : `${g.est ? "≈" : ""}${kfmt(g.tokens)}`));
    if (!open) return head;
    const shown = this.more[g.id] ? items : items.slice(0, 40);
    const rows = v_flex().gap(1).pl(12).children(shown.map((it) => this.ctxItem(t, z, g, it, `${g.id}|${it.name}`, 0, list)));
    if (shown.length < items.length) rows.child(div().id(`more-${g.id}`).px(4).py(2).cursor_pointer().text_size(z - 1.5).text_color(t.accent).hover((s) => s.underline())
      .on_mouse_down("left", stop).on_click((_e, cx) => { this.more[g.id] = true; cx.notify(); }).child(`還有 ${items.length - shown.length} 個…`));
    return v_flex().gap(4).child(head).child(rows);
  }

  ctxItem(t, z, g, it, key, depth, list) {
    const kids = it.items ?? [], open = Boolean(this.open[key]);
    const rm = depth === 0 ? removal(list, g.id, it.name, it.path) : null;
    const canOpen = depth === 0 && Boolean(it.path) && (g.id === "memory" || g.id === "instructions") && !this.target.machine;
    const asking = this.ask === `rm:${key}`, est = g.est ? "≈" : "";
    const row = h_flex().id(`it-${key}`).gap(6).items_center().px(4).py(2).rounded(4).hover((s) => s.bg(t.hover)).text_size(z - 1);
    if (kids.length) row.cursor_pointer().on_mouse_down("left", stop).on_click((_e, cx) => { this.open[key] = !open; cx.notify(); });
    row.child(div().w(10).flex_none().text_color(t.dim).child(kids.length ? (open ? "▾" : "▸") : ""))
      .child(v_flex().flex_1().min_w(0)
        .child(copyOnRight(div().truncate().child(it.name), it.path || it.name))
        .when(Boolean(it.note), (el) => el.child(copyOnRight(div().truncate().text_size(z - 2.5).text_color(t.dim).child(it.note), it.note))))
      .child(copyOnRight(div().flex_none().text_color(t.dim).child(it.tokens == null ? "" : `${est}${kfmt(it.tokens)}`), it.tokens == null ? "" : String(it.tokens)));
    if (canOpen) row.child(btn(t, z, `open-${key}`, "開檔", { tiny: true, on: (cx) => this.openFile(g, it, cx) }));
    if (rm?.required) row.child(div().flex_none().text_size(z - 2.5).text_color(t.dim).child("團隊必備"));
    else if (rm?.args && !asking) row.child(btn(t, z, `rm-${key}`, "拿掉", { tiny: true, off: Boolean(this.busy), on: (cx) => { this.ask = `rm:${key}`; cx.notify(); } }));
    const out = v_flex().gap(1).child(row);
    if (asking) out.child(v_flex().ml(16).p(6).gap(6).rounded(6).bg(t.raised).text_size(z - 1.5)
      .child(textBlock(`rm-ask-${key}`, rm.where === "folder" ? `從 ${shortDir(rm.dir)} 拿掉 ${rm.name}？（kit rm --dir）` : `從整個帳號拿掉 ${rm.name}？（kit rm：每個資料夾的 agent 都不會再有）`))
      .child(h_flex().gap(6)
        .child(btn(t, z, `rm-yes-${key}`, "確定拿掉", { tiny: true, kind: "danger", off: Boolean(this.busy), on: (cx) => this.remove(rm, cx) }))
        .child(btn(t, z, `rm-no-${key}`, "取消", { tiny: true, on: (cx) => { this.ask = null; cx.notify(); } }))));
    if (open && kids.length) out.child(v_flex().pl(14).gap(1).children(kids.map((k) => this.ctxItem(t, z, g, k, `${key}|${k.name}`, depth + 1, list))));
    return out;
  }

  // how far to the auto-compaction, and 壓縮 / 清空重來 (each asks first). 壓縮 while it works is queued (once per agent:
  // compactNext); 清空重來 only while it waits for you
  ctxFooter(t, z, d) {
    const st = this.statusNow(), ready = (st === "idle" || st === "done") && !this.sending, c = d.commands ?? {};
    const cst = this.compactStatus(), cReady = ["idle", "done", "working"].includes(cst) && !this.sending;
    const now = this.addrNow() ? compactWords(shared(compactKey(this.addrNow()))) : "";
    const { left, line } = compactLine(d);
    const foot = v_flex().flex_none().px(12).py(8).gap(6).border_t(1).border_color(t.border);
    if (line) foot.child(copyOnRight(div().text_size(z - 1).text_color(t.dim).child(line), String(left)));
    const why = this.sending ? "送出中…" : st === "working" ? "它在工作中：停下來才能按" : st === "blocked" ? "它在等你回答：先處理它" : !st ? "看不到它的狀態" : "";
    const cancel = btn(t, z, "ask-no", "取消", { tiny: true, on: (cx) => { this.ask = null; cx.notify(); } });
    if (this.ask === "compact") {
      foot.child(div().font_semibold().child("確定壓縮？"));
      if (c.with_text) foot.child(Input.new(this.keep).h(28).px(8).rounded(6).border_1().border_color(t.accent).bg(t.background).text_size(z - 1).text_color(t.foreground));
      else foot.child(div().text_size(z - 2).text_color(t.dim).child(`${c.compact} 在這裡不能帶文字，會照它自己的方式壓縮。`));
      return foot.child(h_flex().gap(6).items_center()
        .child(btn(t, z, "compact-yes", "確定壓縮", { tiny: true, kind: "primary", off: !cReady, on: (cx) => this.send("compact", cx) }))
        .child(cancel).child(div().flex_1().text_size(z - 2).text_color(t.dim).child(cst === "working" ? "它在工作中：會排隊，這輪結束後壓縮" : why)));
    }
    if (this.ask === "clear" || this.ask === "clear2") {
      const second = this.ask === "clear2";
      foot.child(div().text_size(z - 1).text_color(t.ansi1).child(textBlock(`clear-ask-${second}`, second
        ? `再確認一次：會送出 ${c.clear}，這段對話就回不來了。`
        : "會清掉這段對話的內容，確定？")));
      return foot.child(h_flex().gap(6).items_center()
        .child(btn(t, z, "clear-yes", second ? "清空重來" : "確定", { tiny: true, kind: "danger", off: !ready,
          on: (cx) => { if (second) this.send("clear", cx); else { this.ask = "clear2"; cx.notify(); } } }))
        .child(cancel).child(div().flex_1().text_size(z - 2).text_color(t.dim).child(why)));
    }
    return foot.child(h_flex().gap(6).items_center()
      .child(btn(t, z, "compact", now ? (now === "壓縮中…" ? now : "已排隊") : this.sending ? "送出中…" : "壓縮", { tiny: true, off: (!cReady && !now) || !c.compact,
        on: (cx) => { if (now) this.msg = { ok: true, text: "已經在壓縮了" }; else { this.ask = "compact"; if (c.with_text) this.keep?.focus(); } cx.notify(); } }))
      .child(btn(t, z, "clear", "清空重來", { tiny: true, kind: "danger", off: !ready || !c.clear, on: (cx) => { this.ask = "clear"; cx.notify(); } }))
      .child(div().flex_1().min_w(0).truncate().text_size(z - 2).text_color(now ? t.working : t.dim)
        .child(now || why || (c.compact ? `會打 ${c.compact} 或 ${c.clear} 到這個 agent` : ""))));
  }
}
