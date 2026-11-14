// What happened to the agents, for the 關係 tab's timeline (graph.js): each status change, each message (hc send,
// from herdr-core's `sent`), each new kit note, and when an agent showed up or went away. Kept on this computer for a
// day (at most MAX events; also saved for the next start), recorded by whichever part of the kit mod ticks: the
// Agents button is in the tab bar all the time, the panel when it is open. Both may tick; the diff against the last
// look is shared (EVENTS), so each change is recorded once.
//   { at, k: "status", a, v }          a's status became v (working, blocked, done, idle)
//   { at, k: "send", a, to, n, text }  a sent n more messages to `to` (text: the last one's first line)
//   { at, k: "note", a, text }         a wrote a new kit note
//   { at, k: "start" | "gone", a }     a appeared (its status then in v) / went away
//   { at, k: "down" | "up", m }        machine m (Herdr's name for it) went offline / came back
// It also keeps since when each machine is offline (machines in the shared state: name -> { down, since }).
import { shared, setShared, agents, terminals, machines } from "herdr";
import { NOTE, localGet, localSet } from "./common.js";

export const EVENTS = "kit.events.v1";   // shared: { last: { address -> { status, sent: { to -> count }, note } }, log }
const STORE = "kit.agent-events";
export const KEEP_MS = 24 * 3600000, MAX = 5000;
const SAVE_MS = 15000;

// address -> its note (the pane header keeps them by `machine|cwd|terminal`)
export const notesByAddr = (notes) => Object.fromEntries(Object.entries(notes ?? {}).filter(([, n]) => n?.text)
  .map(([k, n]) => [k.slice(k.lastIndexOf("|") + 1), String(n.text).split("\n")[0]]));

// last: what was seen the time before (null: nothing yet); -> { last, events } (events: what changed since)
export function diffEvents(last, ags, terms, notes, now = Date.now()) {
  const seen = {}, events = [], rec = new Map((terms ?? []).map((r) => [r?.address, r]));
  for (const a of ags ?? []) {
    const r = rec.get(a.address), was = last?.[a.address];
    const sent = Object.fromEntries((Array.isArray(r?.sent) ? r.sent : []).filter((s) => s?.to).map((s) => [s.to, Number(s.count) || 1]));
    const note = notes?.[a.address] ?? "";
    // the core's status_ms when it is fresh; Herdr's list keeps it from the first listing (status events don't
    // carry it), so an old one means "just now"; the first look takes it as it is (when it got there)
    const sm = Number(r?.status_ms) || 0, at = !last ? Math.min(now, sm || now) : sm > now - 5000 ? Math.min(now, sm) : now;
    seen[a.address] = { status: a.status, sent, note };
    if (!was) { if (last) events.push({ at, k: "start", a: a.address, v: a.status }); else events.push({ at, k: "status", a: a.address, v: a.status }); continue; }
    if (was.status !== a.status) events.push({ at, k: "status", a: a.address, v: a.status });
    for (const s of Array.isArray(r?.sent) ? r.sent : []) {
      const n = (sent[s.to] ?? 0) - (was.sent?.[s.to] ?? 0);
      if (n > 0) events.push({ at: Math.min(now, Number(s.last_ms) || now), k: "send", a: a.address, to: s.to, n, text: String(s.text ?? "") });
    }
    if (note && note !== was.note) events.push({ at: now, k: "note", a: a.address, text: note });
  }
  for (const a of Object.keys(last ?? {})) if (!seen[a]) events.push({ at: now, k: "gone", a });
  return { last: seen, events: events.sort((x, y) => x.at - y.at) };
}

// machines: Herdr's machines() (name null: this computer, never offline); was: name -> { down, since }
// -> { now: name -> { down, since }, events }
export function diffMachines(was, list, now = Date.now()) {
  const out = {}, events = [];
  for (const m of list ?? []) {
    if (!m?.name) continue;
    const down = m.layout === "unavailable", w = was?.[m.name];
    if (m.layout === "loading" && !w) continue;   // not known yet
    const same = w && w.down === (m.layout === "loading" ? w.down : down);
    out[m.name] = same ? w : { down, since: now };
    if (!same && (w || down)) events.push({ at: now, k: down ? "down" : "up", m: m.name });
  }
  return { now: out, events };
}
// machine name -> since when it is offline (only those that are)
export const downMachines = () => Object.fromEntries(Object.entries(shared(EVENTS)?.machines ?? {}).filter(([, v]) => v.down).map(([k, v]) => [k, v.since]));

function load() {
  try { const d = JSON.parse(localGet(STORE) ?? "null"); if (d && Array.isArray(d.log)) return { last: d.last ?? null, log: d.log, savedAt: Date.now() }; } catch {}
  return { last: null, log: [], savedAt: 0 };
}

// one look: what changed since the last one goes into the log; saved for the next start every SAVE_MS
export function logTick(now = Date.now()) {
  const st = shared(EVENTS) ?? load();
  const { last, events: ev } = diffEvents(st.last, agents(), terminals(), notesByAddr(shared(NOTE)), now);
  const ms = diffMachines(st.machines, machines?.() ?? [], now), events = [...ev, ...ms.events];
  const log = events.length ? [...st.log, ...events].filter((e) => now - e.at < KEEP_MS).slice(-MAX) : st.log;
  const save = now - (st.savedAt ?? 0) > SAVE_MS && (events.length || st.dirty);
  if (save) localSet(STORE, JSON.stringify({ last, log }));
  setShared(EVENTS, { last, log, machines: ms.now, savedAt: save ? now : st.savedAt, dirty: !save && Boolean(events.length || st.dirty) });
}

export const eventLog = () => shared(EVENTS)?.log ?? load().log;
