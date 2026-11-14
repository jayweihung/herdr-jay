// What the agents' Claude Code hook (nvim-jay's reply hook, on the agent's machine) keeps for the 關係 tab (graph.js):
//   ~/.cache/nvim-jay/said/<terminal id>  { at, text }   what it said when it stopped: the last line of its last words
//                                                         that asks something (？ or ?), else their last line
//   ~/.cache/nvim-jay/subs/<terminal id>  { at, list }   its sub-agents (SubagentStart / SubagentStop and every stop):
//                                                         [{ id, type, desc, done, start, last }], running or done in
//                                                         the last 30 minutes, newest first
// This computer's files are read directly, another machine's through `sh` there (cat). said: once per stop, only for
// agents done and not looked at; subs: every SUBS_MS while an agent works, once more when it stops. Nothing is
// guessed: a said file older than the stop says nothing (no hook there, or not Claude Code).
import { exec, home, readTextFile, shared, setShared } from "herdr";
import { isWindows, slash } from "./common.js";

export const SAID = "kit.said.v1";   // address -> { at, text, asked, for, busy }
export const SUBS = "kit.subs.v1";   // address -> { at, list, asked, for, busy }
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
    .map((x) => ({ id: cut(x.id, 40), type: cut(x.type, 40), desc: cut(x.desc, 120), done: x.done === true, start: num(x.start), last: num(x.last) }));
  return { at, list };
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
  for (const a of ags ?? []) {
    const stop = Number(rec.get(a.address)?.status_ms) || 0;
    const e = said[a.address];
    // a file from an earlier stop (the hook may still be writing this one) doesn't count as found
    const found = e?.text && (!stop || e.at >= stop - 120000);
    if (a.status === "done" && !a.focused && !e?.busy && !(e && e.for === stop && (found || now - e.asked < RETRY)))
      ask(SAID, a, stop, "said", parseSaid, cx);
    const s = subs[a.address];
    if (!s?.busy && (!s || s.for !== stop || (a.status === "working" && now - s.asked >= SUBS_MS)))
      ask(SUBS, a, stop, "subs", parseSubs, cx);
  }
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
