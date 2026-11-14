// What the agents' Claude Code hook (nvim-jay's reply hook, on the agent's machine) keeps for the 關係 tab (graph.js):
//   ~/.cache/nvim-jay/said/<terminal id>  { at, text }   what it said when it stopped: the last line of its last words
//                                                         that asks something (？ or ?), else their last line
//   ~/.cache/nvim-jay/subs/<terminal id>  { at, list }   its sub-agents (SubagentStart / SubagentStop and every stop):
//                                                         [{ id, type, desc, done, start, last }], running or done in
//                                                         the last 30 minutes, newest first
// This computer's files are read directly, another machine's through `sh` there (cat). said: once per stop, only for
// agents done and not looked at; subs: every SUBS_MS while an agent works, once more when it stops. Nothing is
// guessed: a said file older than the stop says nothing (no hook there, or not Claude Code).
import { exec, hc, home, readTextFile, shared, setShared } from "herdr";
import { isWindows, slash } from "./common.js";

export const SAID = "kit.said.v1";   // address -> { at, text, asked, for, busy }
export const SUBS = "kit.subs.v1";   // address -> { at, list, asked, for, busy }
// A done agent may still have work of its own going: a command Claude Code's Bash tool runs in the background (a
// `sh -c` child of the agent's process that sources its shell-snapshots; MCP servers and caffeinate aren't shells) or
// a sub-agent. That isn't your turn: 關係 shows it working, 背景工作中, instead of 做完等你看. Asked every BG_MS (ps on its machine;
// none on Windows) while it is done and not looked at.
export const BG = "kit.bg.v1";       // address -> { at, jobs: [label], asked, busy }
// For Herdr's own Agents list (herdr-jay app patch 0009): address -> what still runs, for each done agent whose work
// goes on; the list shows those as working.
export const BUSY = "agents.busy";
// What each running sub-agent is doing now: the last step in its own transcript (the subs file says where), read
// every SUBS_MS (its last 64 KB, through sh on its machine; not on Windows). "<address>|<sub id>" -> { at, text }
export const STEPS = "kit.steps.v1";
const BG_MS = 15000;
const RETRY = 60000, MAX = 200, SUBS_MS = 15000, SUBS_MAX = 12;

const idOf = (addr) => String(addr).slice(String(addr).lastIndexOf("/") + 1);
const machineOf = (addr) => (String(addr).includes("/") ? String(addr).split("/")[0] : null);
const cut = (s, n) => { const c = [...String(s ?? "").replace(/\s+/g, " ").trim()]; return c.length > n ? `${c.slice(0, n - 1).join("")}…` : c.join(""); };

// the hook's said file -> { at, text } | null
export function parseSaid(s) {
  let j = null;
  try { j = JSON.parse(String(s ?? "")); } catch { return null; }
  const text = typeof j?.text === "string" ? cut(j.text, MAX) : "";
  const at = Number(j?.at);
  if (!text || !Number.isFinite(at) || at <= 0) return null;
  return { at, text };
}
// the hook's subs file -> { at, list } | null (each field checked; at most SUBS_MAX)
export function parseSubs(s) {
  let j = null;
  try { j = JSON.parse(String(s ?? "")); } catch { return null; }
  const at = Number(j?.at);
  if (!Number.isFinite(at) || at <= 0 || !Array.isArray(j?.list)) return null;
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  const list = j.list.filter((x) => x && typeof x === "object" && typeof x.id === "string").slice(0, SUBS_MAX)
    .map((x) => ({ id: cut(x.id, 40), type: cut(x.type, 40), desc: cut(x.desc, 120), done: x.done === true, start: num(x.start), last: num(x.last),
      path: typeof x.path === "string" && /\/subagents\/agent-[\w-]+\.jsonl$/.test(x.path) ? x.path : "" }));
  return { at, list };
}

// ps lines "<ppid> <command>" -> what the agent's background shells run (the command inside eval '…'), at most 3
export function bgJobs(out, pid) {
  const jobs = [];
  for (const line of String(out ?? "").split("\n")) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!m || Number(m[1]) !== Number(pid) || !/shell-snapshots/.test(m[2]) || !/(^|\/)(z|ba)?sh\s+-c\s/.test(m[2])) continue;
    const ev = /\beval '([\s\S]*?)' < \/dev\/null/.exec(m[2]);
    jobs.push(cut((ev ? ev[1].replace(/'"'"'/g, "'") : "shell").split("\n")[0], 60));
  }
  return jobs.slice(0, 3);
}
async function readBg(addr) {
  const g = await hc(["get", addr, "--json"]).catch(() => null);
  let pid = null;
  try { const j = JSON.parse(g?.stdout ?? "{}"); pid = j.foreground?.pid ?? j.pid ?? null; } catch {}
  if (!pid) return null;
  const r = await exec("sh", ["-c", 'ps -A -ww -o ppid=,command= | awk -v p="$1" \'$1 == p\'', "sh", String(pid)], { timeout: 15000, on: machineOf(addr) }).catch(() => null);
  return r ? { at: Date.now(), jobs: bgJobs(r.stdout, pid) } : null;
}

// a transcript's tail (Claude Code JSONL; the first line may be cut) -> its last step, in a few words:
// "Bash：ls ~/x", "Read：src/a.rs", or the first line of what it last wrote
export function lastStep(tail) {
  let step = "";
  for (const line of String(tail ?? "").split("\n")) {
    let r = null;
    try { r = JSON.parse(line); } catch { continue; }
    const c = r?.type === "assistant" && Array.isArray(r.message?.content) ? r.message.content : [];
    for (const b of c) {
      if (b?.type === "tool_use") {
        const i = b.input ?? {}, arg = [i.command, i.file_path, i.path, i.pattern, i.url, i.query, i.description, i.prompt].find((v) => typeof v === "string" && v.trim());
        step = `${cut(b.name, 30)}${arg ? `：${cut(String(arg).split("\n")[0], 70)}` : ""}`;
      } else if (b?.type === "text" && typeof b.text === "string" && b.text.trim()) step = cut(b.text.trim().split("\n")[0], 80);
    }
  }
  return step;
}
// its last step, and its description from the meta file next to it (the subs file may not have it yet: the hook ran
// before Claude Code wrote it)
async function readStep(addr, path) {
  const meta = path.replace(/\.jsonl$/, ".meta.json");
  const r = await exec("sh", ["-c", 'tail -c 65536 "$1" 2>/dev/null; printf "\\n@@kit-meta@@\\n"; head -c 8192 "$2" 2>/dev/null', "sh", path, meta],
    { timeout: 15000, on: machineOf(addr) }).catch(() => null);
  if (!r) return null;
  const [tail, m] = String(r.stdout ?? "").split("\n@@kit-meta@@\n");
  let desc = "";
  try { const j = JSON.parse(m ?? ""); desc = typeof j?.description === "string" ? cut(j.description, 120) : ""; } catch {}
  return { at: Date.now(), text: lastStep(tail), desc };
}

async function readCache(addr, kind) {
  const id = idOf(addr), m = machineOf(addr);
  if (!/^[\w-]+$/.test(id)) return null;
  if (!m) {
    const path = `${slash(home())}/.cache/nvim-jay/${kind}/${id}`;
    return readTextFile(isWindows() ? path.replace(/\//g, "\\") : path).catch(() => null);
  }
  const r = await exec("sh", ["-c", 'cat "$HOME/.cache/nvim-jay/$1/$2" 2>/dev/null', "sh", kind, id], { timeout: 15000, on: m }).catch(() => null);
  return r?.stdout ?? null;
}

// one ask per agent at a time; key: which entry in the shared state; parse: the file's reader
function ask(key, a, stop, kind, parse, cx) {
  const e = (shared(key) ?? {})[a.address];
  setShared(key, { ...(shared(key) ?? {}), [a.address]: { ...(e?.for === stop ? e : {}), for: stop, asked: Date.now(), busy: true } });
  cx.spawn(async (cx) => {
    const d = parse(await readCache(a.address, kind).catch(() => null));
    const cur = shared(key) ?? {};
    setShared(key, { ...cur, [a.address]: { ...(cur[a.address] ?? {}), ...(d ?? {}), for: stop, asked: Date.now(), busy: false } });
    cx.notify();
  });
}
// the agents still there only
function prune(key, live) {
  const all = shared(key) ?? {}, kept = Object.fromEntries(Object.entries(all).filter(([a]) => live.has(a)));
  if (Object.keys(kept).length !== Object.keys(all).length) setShared(key, kept);
  return kept;
}

// ags: Herdr's agents(); terms: terminals(). said: each done, unfocused agent once per stop (its record's status_ms),
// again after RETRY when it found nothing yet. subs: every SUBS_MS while it works, and once per status change.
export function saidTick(ags, terms, cx) {
  const rec = new Map((terms ?? []).map((r) => [r?.address, r])), now = Date.now();
  const live = new Set((ags ?? []).map((a) => a.address));
  const said = prune(SAID, live), subs = prune(SUBS, live);
  prune(BG, live);
  for (const a of ags ?? []) {
    const stop = Number(rec.get(a.address)?.status_ms) || 0;
    const e = said[a.address];
    // a file from an earlier stop (the hook may still be writing this one) doesn't count as found
    const found = e?.text && (!stop || e.at >= stop - 120000);
    if (a.status === "done" && !a.focused && !e?.busy && !(e && e.for === stop && (found || now - e.asked < RETRY)))
      ask(SAID, a, stop, "said", parseSaid, cx);
    const b = (shared(BG) ?? {})[a.address];
    if (a.status === "done" && !a.focused && !b?.busy && (!b || now - b.asked >= BG_MS)) {
      setShared(BG, { ...(shared(BG) ?? {}), [a.address]: { ...(b ?? {}), asked: now, busy: true } });
      cx.spawn(async (cx) => {
        const d = await readBg(a.address).catch(() => null);
        setShared(BG, { ...(shared(BG) ?? {}), [a.address]: { ...((shared(BG) ?? {})[a.address] ?? {}), ...(d ?? {}), asked: Date.now(), busy: false } });
        cx.notify();
      });
    }
    const s = subs[a.address];
    if (!s?.busy && (!s || s.for !== stop || ((a.status === "working" || a.status === "done") && now - s.asked >= SUBS_MS)))
      ask(SUBS, a, stop, "subs", parseSubs, cx);
  }
  // the latest step of each running sub-agent (only while its agent is listed)
  const steps = shared(STEPS) ?? {};
  for (const a of ags ?? []) for (const x of subsNow(shared(SUBS), a.address, now, a.status === "working")) {
    const k = `${a.address}|${x.id}`, e = steps[k];
    if (x.done || !x.path || e?.busy || (e && now - e.asked < SUBS_MS)) continue;
    setShared(STEPS, { ...(shared(STEPS) ?? {}), [k]: { ...(e ?? {}), asked: now, busy: true } });
    cx.spawn(async (cx) => {
      const d = await readStep(a.address, x.path).catch(() => null);
      setShared(STEPS, { ...(shared(STEPS) ?? {}), [k]: { ...((shared(STEPS) ?? {})[k] ?? {}), ...(d ?? {}), asked: Date.now(), busy: false } });
      cx.notify();
    });
  }
  const keep = Object.fromEntries(Object.entries(shared(STEPS) ?? {}).filter(([k]) => live.has(k.slice(0, k.lastIndexOf("|")))));
  if (Object.keys(keep).length !== Object.keys(shared(STEPS) ?? {}).length) setShared(STEPS, keep);
  const busy = busyOf(ags, terms, shared(BG), shared(SUBS), now);
  if (JSON.stringify(busy) !== JSON.stringify(shared(BUSY) ?? {})) setShared(BUSY, busy);
}

// done agents whose own work still runs: address -> what runs (the newest background shell, else its sub-agents)
export function busyOf(ags, terms, bg, subs, now = Date.now()) {
  const rec = new Map((terms ?? []).map((r) => [r?.address, r])), out = {};
  for (const a of ags ?? []) {
    if (a.status !== "done") continue;
    const stop = Number(rec.get(a.address)?.status_ms) || 0, b = bg?.[a.address];
    const jobs = b?.at >= stop ? b.jobs ?? [] : [];
    const run = subsNow(subs, a.address, now).filter((x) => !x.done).length;
    if (jobs.length || run) out[a.address] = jobs[0] ?? `子 agent ${run} 個`;
  }
  return out;
}

// address -> what it said, when it said it at this stop (not long before its status became done)
export function saidNow(all, address, since) {
  const e = (all ?? {})[address];
  return e?.text && (!since || e.at >= since - 120000) ? e.text : "";
}
// address -> its sub-agents as last read: running first, then done; none when the file is over 30 minutes old and
// the agent isn't working (a long sub-agent of a working one may write nothing for a while)
export function subsNow(all, address, now = Date.now(), working = false) {
  const e = (all ?? {})[address];
  if (!e?.list || (!working && now - e.at > 30 * 60000)) return [];
  return [...e.list.filter((x) => !x.done), ...e.list.filter((x) => x.done)];
}
