// What an agent said last, for the 關係 tab's 做完等你看 (graph.js): when it stops, nvim-jay's reply hook (a Claude Code
// Stop hook) writes { at, text } to ~/.cache/nvim-jay/said/<its terminal id> on the agent's machine: the last line of
// its last words that asks something (？ or ?), else their last line. Read here once per stop, only for agents that
// are done and not looked at yet; this computer's file directly, another machine's through `sh` there (cat). Nothing
// is guessed: a file older than the stop (no hook there, or not Claude) says nothing.
import { exec, home, readTextFile, shared, setShared } from "herdr";
import { isWindows, slash } from "./common.js";

export const SAID = "kit.said.v1";   // address -> { at, text, asked, for, busy }
const RETRY = 60000, MAX = 200;

const idOf = (addr) => String(addr).slice(String(addr).lastIndexOf("/") + 1);
const machineOf = (addr) => (String(addr).includes("/") ? String(addr).split("/")[0] : null);

// the hook's file -> { at, text } | null
export function parseSaid(s) {
  let j = null;
  try { j = JSON.parse(String(s ?? "")); } catch { return null; }
  const text = typeof j?.text === "string" ? j.text.replace(/\s+/g, " ").trim() : "";
  const at = Number(j?.at);
  if (!text || !Number.isFinite(at) || at <= 0) return null;
  return { at, text: [...text].length > MAX ? `${[...text].slice(0, MAX - 1).join("")}…` : text };
}

async function readSaid(addr) {
  const id = idOf(addr), m = machineOf(addr);
  if (!/^[\w-]+$/.test(id)) return null;
  if (!m) {
    const h = slash(home()), path = `${h}/.cache/nvim-jay/said/${id}`;
    return parseSaid(await readTextFile(isWindows() ? path.replace(/\//g, "\\") : path).catch(() => null));
  }
  const r = await exec("sh", ["-c", 'cat "$HOME/.cache/nvim-jay/said/$1" 2>/dev/null', "sh", id], { timeout: 15000, on: m }).catch(() => null);
  return parseSaid(r?.stdout);
}

// ags: Herdr's agents(); terms: terminals(). Asks for each done, unfocused agent once per stop (its record's
// status_ms), again after RETRY when it found nothing yet (the hook may still be writing)
export function saidTick(ags, terms, cx) {
  const rec = new Map((terms ?? []).map((r) => [r?.address, r])), all = shared(SAID) ?? {}, now = Date.now();
  const live = new Set((ags ?? []).map((a) => a.address));
  const kept = Object.fromEntries(Object.entries(all).filter(([a]) => live.has(a)));
  if (Object.keys(kept).length !== Object.keys(all).length) setShared(SAID, kept);
  for (const a of ags ?? []) {
    if (a.status !== "done" || a.focused) continue;
    const stop = Number(rec.get(a.address)?.status_ms) || 0, e = kept[a.address];
    if (e?.busy || (e && e.for === stop && (e.text || now - e.asked < RETRY))) continue;
    setShared(SAID, { ...(shared(SAID) ?? {}), [a.address]: { ...(e?.for === stop ? e : {}), for: stop, asked: now, busy: true } });
    cx.spawn(async (cx) => {
      const d = await readSaid(a.address).catch(() => null);
      const cur = shared(SAID) ?? {};
      setShared(SAID, { ...cur, [a.address]: { ...(cur[a.address] ?? {}), ...(d ?? {}), for: stop, asked: now, busy: false } });
      cx.notify();
    });
  }
}

// address -> what it said, when it said it at this stop (not long before its status became done)
export function saidNow(all, address, since) {
  const e = (all ?? {})[address];
  return e?.text && (!since || e.at >= since - 120000) ? e.text : "";
}
