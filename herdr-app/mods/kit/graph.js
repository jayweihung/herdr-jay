// The 關係 tab of the Agents panel (agents.js): the agents running now, as cards, and who talks to whom.
//   a card    one agent (Herdr's agents()): its status, name (with 子 N: sub-agents of its own running, said.js),
//             which CLI and model (kit context, as its pane header
//             asked: CTX), what it wrote (kit note: NOTE); one column per space, named and ordered as Herdr's Agents list (grouped by
//             space) has them (names.js), so a card is found where its row is
//   a line    a message: `hc send` from inside one agent's terminal to another (herdr-core keeps `sent` on the
//             sender's record: to, count, last_ms, text); brighter the newer, thicker the more; dashed: who started whom
//             (`parent`)
// Click a card: its lines stand out and below it says each one (how many, when, the last message's first line);
// double-click: go to its pane. Lines to agents outside what is shown are listed there too.
// Above the drawing, what needs a look (waitsOf, clashesOf):
//   還沒回     A messaged B last, and B stopped after it without messaging A back (and A hasn't begun working again or messaged anyone since)
//   卡住       a chain of agents each waiting for the next (it messaged it, and stopped), ending at one that needs you
//              (blocked) or didn't answer; a chain that comes back to itself: 互等
//   同一個資料夾  two agents working at once in one folder (or one inside the other), not each in its own worktree
//   等你太久    an agent waiting for you (blocked) for over LONG_WAIT; its card warms up from WARN_WAIT on
//   可以關了    agents idle for over IDLE_CLOSE that nobody waits for: only said, never closed
//   做完等你看  (not when work of its own still runs: a background shell, a sub-agent; its card then reads as working,
//              背景工作中：<what runs>)
//              agents done whose pane you haven't looked at since (Herdr's done: looking turns it idle); one that said
//              something at the stop (said.js: its last question, else its last line) gets its own line with it
//   context 快滿 an agent's context FULL_PCT % full or more (its pane header's kit context): time for HANDOFF.md
// A machine that is offline (Herdr can't reach its core): its column grey, how long in its title.
// graphData and the geometry are plain functions (tests/kit/run.js); graphView draws them.
import { div, PathBuilder } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run } from "herdr";
import { stop, icon, spin, btn, copyOnRight, shortDir } from "./common.js";
import { shortSpan } from "./names.js";
import { noteView } from "./context.js";
import { saidNow, subsNow, STEPS } from "./said.js";

export const COL_W = 200, COL_W_DEFAULT = COL_W, NODE_H = 86, GAP_X = 100, GAP_Y = 24, PAD = 14, HEAD = 22, LOOP = 44;
const MIN = 60000, HOUR = 3600000;
export const WARN_WAIT = 2 * MIN, LONG_WAIT = 10 * MIN, IDLE_CLOSE = 30 * MIN, FULL_PCT = 80;
// what a blocked agent waits for (the status kind it reported)
const KIND = { permission: "等你允許", question: "在問你", auth: "要登入" };

// "claude-code" -> "claude"; the program's key when the agent never said
export const cliOf = (app, key) => (app === "claude-code" ? "claude" : app || (key && key !== "agent" ? key : "") || "?");
// "anthropic/claude-opus-5-5" -> "Opus 5.5"; other names as they are, without a provider
export function modelOf(m) {
  const s = String(m ?? "").replace(/^.*\//, "");
  const c = /^claude-(opus|sonnet|haiku|fable)-(\d+)-(\d+)/.exec(s);
  return c ? `${c[1][0].toUpperCase()}${c[1].slice(1)} ${c[2]}.${c[3]}` : s;
}
export function agoText(ms, now = Date.now()) {
  const d = Math.max(0, now - Number(ms || 0));
  return d < MIN ? "剛剛" : d < HOUR ? `${Math.floor(d / MIN)} 分前` : d < 24 * HOUR ? `${Math.floor(d / HOUR)} 小時前` : `${Math.floor(d / (24 * HOUR))} 天前`;
}
const machineOf = (addr) => (String(addr).includes("/") ? String(addr).split("/")[0] : "");
// what the pane header keeps per agent, by `machine|cwd|terminal` key: the entry for this terminal
const byTerminal = (obj, addr) => Object.entries(obj ?? {}).find(([k]) => k.endsWith(`|${addr}`))?.[1];

// agents: Herdr's agents(); terms: terminals(); space: the shown space's id, or null for every space;
// ctx, notes: the pane header's CTX and NOTE. -> { cols: [{ machine, nodes }], nodes, edges, outside }
//   edges: lines between shown agents; outside: lines with one end on a shown agent, the other not shown
// log: the event log (events.js), for when each status began (Herdr's list keeps status_ms from its first listing)
// down: machine name -> since when it is offline (events.js downMachines)
// names: address -> name as the Agents list shows it (names.js sidebarNames)
// said: what each agent said when it stopped (said.js SAID); subs: its sub-agents (said.js SUBS); bg: its background
// shells (said.js BG)
// steps: what each running sub-agent does now (said.js STEPS)
export function graphData({ agents, terms, space, ctx, notes, log = [], down = {}, names = {}, said = {}, subs = {}, bg = {}, steps = {}, now = Date.now() }) {
  const shown = (agents ?? []).filter((a) => !space || a.space === space);
  const rec = new Map((terms ?? []).map((r) => [r?.address, r]));
  const began = {};
  for (const e of log ?? []) if ((e.k === "status" || e.k === "start") && e.at > (began[e.a] ?? 0)) began[e.a] = e.at;
  const nodes = shown.map((a) => {
    const c = byTerminal(ctx, a.address), n = noteView(byTerminal(notes, a.address), now), r = rec.get(a.address);
    return { address: a.address, machine: machineOf(a.address), name: names?.[a.address] || a.tab_name || a.title || a.address, status: a.status,
      cli: cliOf(a.app, a.program?.key), model: modelOf(c?.model), pct: c?.pct != null ? Math.min(100, Math.round(Number(c.pct))) : null, note: n?.line ?? "", noteOld: Boolean(n?.old),
      program: a.program, space: a.space_name, spaceId: a.space, focused: Boolean(a.focused),
      since: Math.max(Number(r?.status_ms) || 0, began[a.address] ?? 0), cwd: String(r?.foreground?.cwd || r?.cwd || ""),
      kind: String((r?.report ?? r?.status)?.kind ?? ""), down: down?.[machineOf(a.address)] ?? null,
      subs: subsNow(subs, a.address, now, a.status === "working").map((x) => {
        const s = steps?.[`${a.address}|${x.id}`];
        return { ...x, desc: x.desc || s?.desc || "", step: x.done ? "" : s?.text ?? "" };
      }) };
  });
  // one column per space, in the list's order (agents() keeps a space's agents next to each other)
  const cols = [];
  for (const n of nodes) {
    const c = cols.find((x) => x.id === n.spaceId);
    if (c) c.nodes.push(n);
    else cols.push({ id: n.spaceId, space: n.space, nodes: [n] });
  }
  // a space on another machine says which (null: this computer, or a mix); offline: since when
  for (const c of cols) {
    const ms = new Set(c.nodes.map((n) => n.machine)), m = ms.size === 1 ? [...ms][0] : "";
    c.machine = m || null; c.down = m ? down?.[m] ?? null : null;
    for (const n of c.nodes) n.where = m ? "" : n.machine;   // the card says its machine only where the title doesn't
  }
  const has = new Set(nodes.map((n) => n.address));
  const lines = [];
  for (const r of terms ?? []) {
    for (const s of Array.isArray(r?.sent) ? r.sent : [])
      if (s?.to && s.to !== r.address) lines.push({ from: r.address, to: s.to, kind: "send", count: Number(s.count) || 1, at: Number(s.last_ms) || 0, text: String(s.text ?? "") });
    if (r?.parent && r.parent !== r.address) lines.push({ from: r.parent, to: r.address, kind: "parent", count: 0, at: Number(r.created_ms) || 0, text: "" });
  }
  const edges = lines.filter((l) => has.has(l.from) && has.has(l.to));
  const outside = lines.filter((l) => has.has(l.from) !== has.has(l.to));
  // a pair talking both ways: each line bends to its own side
  for (const e of edges) e.both = edges.some((o) => o !== e && o.kind === e.kind && o.from === e.to && o.to === e.from);
  const g = { cols, nodes, edges, outside, log: log ?? [] };
  g.waits = waitsOf(g, now);
  g.chains = chainsOf(g);
  g.clashes = clashesOf(nodes);
  // on an offline machine nothing is known for sure: no long waits or idle hints there
  const live = nodes.filter((n) => !n.down && n.since);
  g.longWaits = live.filter((n) => n.status === "blocked" && now - n.since >= LONG_WAIT).map((n) => ({ address: n.address, for: now - n.since, kind: n.kind }));
  // every agent waiting for you, from the start: the most urgent thing on the list, with what it asks (what the program
  // reported with its status: Claude Code's "answer: 要選 A 還是 B？ (A · B)", a permission's tool)
  g.blocked = nodes.filter((n) => !n.down && n.status === "blocked").map((n) => {
    const r = rec.get(n.address), rep = r?.report ?? (r?.status && typeof r.status === "object" ? r.status : null);
    const ask = String(rep?.msg ?? "").replace(/\s+/g, " ").trim().replace(/^(answer|allow|approve)\s*:\s*/i, "");
    return { address: n.address, for: n.since ? now - n.since : 0, kind: n.kind, ask: [...ask].slice(0, 160).join(""), hot: Boolean(n.since) && now - n.since >= LONG_WAIT };
  });
  const waited = new Set(g.waits.map((w) => w.to)), parents = new Set(g.edges.filter((e) => e.kind === "parent").map((e) => e.from));
  // done (not looked at yet) is news for you, never 可以關了
  g.idle = live.filter((n) => n.status === "idle" && now - n.since >= IDLE_CLOSE && !waited.has(n.address)
    && !parents.has(n.address) && !n.focused).map((n) => ({ address: n.address, for: now - n.since }));
  // what it said: the reply hook's line (its last question, word for word), else the one line the program itself
  // reported with its status (Claude Code: a short summary of its last words; the core's status.msg, which Herdr's
  // terminals() hands over as report.msg, status being a plain word there)
  for (const n of nodes) {
    const r = rec.get(n.address), rep = r?.report ?? (r?.status && typeof r.status === "object" ? r.status : null);
    const msg = String(rep?.msg ?? "").replace(/\s+/g, " ").trim();
    n.said = n.status === "done" && !n.focused ? saidNow(said, n.address, n.since) || [...msg].slice(0, 200).join("") : "";
    // done, but work of its own still going (a background shell seen after it stopped, a sub-agent): not your turn
    const b = bg?.[n.address], jobs = n.status === "done" && b?.at >= n.since ? b.jobs ?? [] : [];
    const subsRun = n.status === "done" ? (n.subs ?? []).filter((x) => !x.done).length : 0;
    n.background = jobs.length ? jobs[0] : subsRun ? `子 agent ${subsRun} 個` : "";
  }
  g.done = nodes.filter((n) => !n.down && n.status === "done" && !n.focused && !n.background).map((n) => ({ address: n.address, for: n.since ? now - n.since : 0, said: n.said }));
  g.full = nodes.filter((n) => !n.down && n.pct != null && n.pct >= FULL_PCT).map((n) => ({ address: n.address, pct: n.pct }));
  return g;
}

// how long, in words: "45 秒", "12 分", "3 小時", "2 天"
export const spanText = (ms) => { const s = Math.max(0, ms) / 1000; return s < 60 ? `${Math.floor(s)} 秒` : s < 3600 ? `${Math.floor(s / 60)} 分` : s < 86400 ? `${Math.floor(s / 3600)} 小時` : `${Math.floor(s / 86400)} 天`; };
// a card's status words when they say more than its dot: waiting for you (and how long), offline, can be closed.
// you: the card waits for you (blocked, or done and not looked at): it is colored all over, so you see where to go
export function cardState(g, n, now = Date.now()) {
  if (n.down) return { text: "連不到", color: "dim" };
  if (n.status === "blocked") {
    const d = n.since ? now - n.since : 0;
    return { text: `${KIND[n.kind] ?? "等你"}${n.since ? ` ${spanText(d)}` : ""}`, color: d >= LONG_WAIT ? "ansi1" : "blocked", warm: d >= WARN_WAIT, hot: d >= LONG_WAIT, you: true };
  }
  const idle = g.idle?.find((x) => x.address === n.address);
  if (idle) return { text: `閒置 ${spanText(idle.for)} · 可以關了`, color: "dim", idle: true };
  if (n.status === "done" && n.background) return { text: `背景工作中：${n.background}`, color: "working", busy: true };
  if (n.status === "done" && !n.focused) return { text: n.said ? `做完：${n.said}` : "做完 · 等你看", color: "done", you: true };
  return null;
}

// how long after a message the receiver must have stopped for it to count as not answering (its turn on the message)
const SETTLE = 1500;
// an asker that went on working this long after the other stopped had the answer in reach (its screen): not waiting
const MOVED_ON = 60000;
// A waits for B: A messaged B more times than B messaged A (an answer evens them out: whoever answered isn't
// waiting for an answer to it), the last one after B's last, and A has stopped (it isn't working on something else,
// and hasn't moved on since B stopped). How B stands: working (on it), blocked (needs you), or silent (stopped after it, no answer).
// -> [{ from, to, at, state, since }] (since: when B stopped, for silent and blocked)
// a message that says it wants no answer (in its first line, the part herdr-core keeps): 「不用回」「不用再回」「不必回」, [FYI]
export const noReply = (text) => /不[用必]再?回|\[fyi\]/i.test(String(text ?? ""));

export function waitsOf(g, now = Date.now()) {
  const node = new Map(g.nodes.map((n) => [n.address, n]));
  const last = (a, b) => g.edges.find((e) => e.kind === "send" && e.from === a && e.to === b);
  const firstStop = (b, at) => { let t = null; for (const x of g.log ?? []) if (x.k === "status" && x.a === b && x.v !== "working" && x.at > at && (t === null || x.at < t)) t = x.at; return t; };
  const workedAfter = (a, at) => (g.log ?? []).some((x) => x.k === "status" && x.a === a && x.v === "working" && x.at > at);
  const sentAfter = (a, at) => [...g.edges, ...(g.outside ?? [])].some((e) => e.kind === "send" && e.from === a && e.at > at);
  const out = [];
  for (const e of g.edges) {
    if (e.kind !== "send") continue;
    const a = node.get(e.from), b = node.get(e.to), back = last(e.to, e.from);
    if (!a || !b || (back && (back.at >= e.at || back.count >= e.count)) || a.status === "working" || noReply(e.text)) continue;
    const state = b.status === "working" ? "working" : b.status === "blocked" ? "blocked"
      : b.since > e.at + SETTLE ? "silent" : "working";   // stopped before the message settled in: still on it
    // A moved on after B stopped (began working again, or messaged anyone): it got what it needed some other way
    // (read B's screen, was told), it isn't sitting there waiting. A merely finishing the turn it sent in is not that.
    // (B's first stop after the message is the one that counts: it may have worked on other things since)
    const stopped = state === "silent" ? firstStop(e.to, e.at + SETTLE) ?? b.since : 0;
    // ...or it kept working well past B's stop (over MOVED_ON; just ending the turn it sent in takes seconds)
    if (state === "silent" && (workedAfter(e.from, stopped + SETTLE) || sentAfter(e.from, stopped + SETTLE) || a.since > stopped + MOVED_ON)) continue;
    out.push({ from: e.from, to: e.to, at: e.at, text: e.text, state, since: state === "working" ? 0 : b.since, waited: now - e.at });
  }
  return out;
}

// Chains of waits that end badly: following each agent's newest wait until one that waits for nobody (blocked or
// silent: stuck; working: fine, not listed) or one already in the chain (互等). -> [{ path, end, why }] (why: blocked |
// silent | loop), the longest first, none inside another
export function chainsOf(g) {
  const next = new Map();
  for (const w of [...g.waits].sort((a, b) => a.at - b.at)) next.set(w.from, w);   // the newest wait wins
  const waitedOn = new Set(g.waits.map((w) => w.to));
  const found = [];
  for (const start of next.keys()) {
    const path = [start];
    let why = null, w = next.get(start);
    while (w) {
      if (path.includes(w.to)) { why = "loop"; break; }
      path.push(w.to);
      const on = next.get(w.to);
      if (!on) { why = w.state === "working" ? null : w.state; break; }
      w = on;
    }
    if (why) found.push({ path, end: path.at(-1), why });
  }
  // a loop shows once (from its earliest-waiting agent's view: whichever start found it first); a chain that is the
  // tail of a longer one, and one starting where someone else waits too, give way
  const key = (c) => (c.why === "loop" ? [...c.path].sort().join(">") : c.path.join(">"));
  const seen = new Set();
  return found.sort((a, b) => b.path.length - a.path.length).filter((c) => {
    const k = key(c);
    if (seen.has(k)) return false;
    if (found.some((o) => o !== c && o.path.length > c.path.length && o.path.join(">").endsWith(c.path.join(">")))) return false;
    if (c.why !== "loop" && waitedOn.has(c.path[0]) && found.some((o) => o !== c && o.path.includes(c.path[0]))) return false;
    seen.add(k);
    return true;
  });
}

// a home folder (everyone starts there: not a shared project)
const isHome = (d) => /^(\/(Users|home)\/[^/]+|\/root|[A-Za-z]:[\\/]Users[\\/][^\\/]+)[\\/]?$/.test(d);
const norm = (d) => String(d).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
// Agents working at the same time in one folder on one machine (or one inside the other's). -> [{ nodes, dir }]
export function clashesOf(nodes) {
  const busy = nodes.filter((n) => n.status === "working" && n.cwd && !isHome(n.cwd));
  const groups = [];
  for (const n of busy) {
    const d = norm(n.cwd);
    const g = groups.find((x) => x.machine === n.machine && (x.key === d || d.startsWith(x.key + "/") || x.key.startsWith(d + "/")));
    if (!g) groups.push({ machine: n.machine, key: d, dir: n.cwd, nodes: [n.address] });
    else { g.nodes.push(n.address); if (d.length < g.key.length) { g.key = d; g.dir = n.cwd; } }
  }
  return groups.filter((g) => g.nodes.length > 1).map(({ nodes, dir }) => ({ nodes, dir }));
}

// a card's width for a panel `width` px wide (0: not measured yet): the columns fill it, between 170 and 260 each
export function colWidth(n, width) {
  if (!width || !n) return COL_W;
  return Math.max(170, Math.min(260, Math.floor((width - PAD * 2 - LOOP - (n - 1) * GAP_X) / n)));
}
// where each card is: address -> { x, y, w, top (its band's first row), band }, each column's title (heads), and the
// whole drawing's size. Columns that don't fit the panel's width go on below, as many as fit in each band (like the
// Agents list, top to bottom), so nothing needs scrolling sideways; not measured yet (0): one band.
export function layoutOf(cols, width = 0) {
  const fit = width ? Math.max(1, Math.floor((width - PAD * 2 - LOOP + GAP_X) / (170 + GAP_X))) : cols.length;
  const per = Math.max(1, Math.min(cols.length, fit)), cw = colWidth(per, width);
  const at = {}, heads = [];
  let y = PAD;
  for (let b = 0; b * per < cols.length; b++) {
    const band = cols.slice(b * per, (b + 1) * per), top = y + HEAD;
    band.forEach((c, i) => {
      const x = PAD + i * (cw + GAP_X);
      heads.push({ x, y });
      c.nodes.forEach((n, ri) => { at[n.address] = { x, y: top + ri * (NODE_H + GAP_Y), w: cw, top, band: b }; });
    });
    const rows = Math.max(1, ...band.map((c) => c.nodes.length));
    y = top + rows * NODE_H + (rows - 1) * GAP_Y + GAP_Y + 8;
  }
  return { at, cw, heads, w: PAD * 2 + per * cw + (per - 1) * GAP_X + LOOP, h: y - GAP_Y - 8 + PAD };
}

// a line's curve: from the side of its card that faces the other one; between cards in one column it loops out
// on the right. -> { a: start, c1, c2, b: end, mid } (points [x, y])
export function curveOf(p, q, both = false) {
  const off = both ? 9 : 0, COL_W = p.w ?? q.w ?? COL_W_DEFAULT;
  if (Math.abs(p.x - q.x) < 1) {
    const a = [p.x + COL_W, p.y + NODE_H / 2 - off], b = [q.x + COL_W, q.y + NODE_H / 2 + off];
    const out = 26 + Math.min(LOOP - 26, Math.abs(a[1] - b[1]) * 0.12) + (both ? 8 : 0);
    const c1 = [a[0] + out, a[1]], c2 = [b[0] + out, b[1]];
    return { a, c1, c2, b, mid: [a[0] + out * 0.75, (a[1] + b[1]) / 2] };
  }
  const right = q.x > p.x;
  const a = [right ? p.x + COL_W : p.x, p.y + NODE_H / 2 - off], b = [right ? q.x : q.x + COL_W, q.y + NODE_H / 2 + off];
  const dx = (b[0] - a[0]) * 0.45;
  const c1 = [a[0] + dx, a[1]], c2 = [b[0] - dx, b[1]];
  // past a column between them: around the cards on the way, not over them: out into the gap beside the sender,
  // along the space between two rows, into the gap beside the receiver (via: the corners); the label on that stretch
  // (also between bands: along the gap under the receiver's row, in its band)
  const bands = (p.band ?? 0) !== (q.band ?? 0);
  if (Math.abs(b[0] - a[0]) > COL_W + GAP_X || bands) {
    const step = NODE_H + GAP_Y, top = p.top ?? PAD + HEAD;
    const r = Math.max(1, Math.round(((a[1] + b[1]) / 2 - top + GAP_Y / 2) / step));
    const y = (bands ? q.y + NODE_H + GAP_Y / 2 : top + r * step - GAP_Y / 2) + (both ? (right ? -4 : 4) : 0);
    // a card's right side has its column's loops (out to LOOP + 8): pass them there, keep close on the left side
    const near = 20, past = LOOP + 30, ay = a[1] + 12;   // past: also past a loop's label (68 wide)
    const x1 = a[0] + (right ? past + off : -(near + off)), x2 = b[0] + (right ? -(near + off) : past + off);
    const via = [[x1, ay], [x1, y], [x2, y], [x2, b[1]]];
    return { a: [a[0], ay], b, via, c1: via[0], c2: via[3], mid: [(x1 + x2) / 2, y] };
  }
  return { a, c1, c2, b, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - (both ? 7 : 0)] };
}

// an arrowhead at b, pointing away from c (the last control point)
export function arrowOf(c, b, size = 7) {
  const dx = b[0] - c[0], dy = b[1] - c[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  return [b, [b[0] - ux * size - uy * size * 0.55, b[1] - uy * size + ux * size * 0.55], [b[0] - ux * size + uy * size * 0.55, b[1] - uy * size - ux * size * 0.55]];
}

const strokeW = (e) => (e.kind === "parent" ? 1.2 : Math.min(4, 1.2 + Math.log2(e.count)));

// the drawing: cards on a canvas with the lines under them; sel: the selected card's address
export function graphView(t, z, g, sel, { onSelect, now = Date.now(), width = 0 } = {}) {
  const { at, w, h, cw, heads } = layoutOf(g.cols, width);
  // a click on the empty part: nothing selected any more
  const canvas = div().id("kit-graph").relative().w(w).h(h).flex_none().on_click((_e, cx) => { if (sel) onSelect?.(null, cx); });
  const recent = (e) => now - e.at < 10 * MIN ? t.accent : now - e.at < HOUR ? t.muted : t.dim;
  const mine = (e) => !sel || e.from === sel || e.to === sel;
  const waitOf = (e) => e.kind === "send" ? g.waits.find((w) => w.from === e.from && w.to === e.to && w.state !== "working") : null;
  const stuck = new Map(g.chains.flatMap((c) => c.path.map((a) => [a, c.why === "blocked" ? t.blocked : stuckColor(t)]))), clash = new Set(g.clashes.flatMap((c) => c.nodes));
  // the selected card's lines last, so they lie on top
  const edges = [...g.edges].sort((x, y) => Number(mine(x)) - Number(mine(y)));
  for (const e of edges) {
    const p = at[e.from], q = at[e.to];
    if (!p || !q) continue;
    const wt = waitOf(e);
    const k = curveOf(p, q, e.both), color = !mine(e) ? t.border : wt ? (wt.state === "blocked" ? t.blocked : stuckColor(t)) : e.kind === "parent" ? t.done : recent(e);
    let path = PathBuilder.stroke(mine(e) && sel ? strokeW(e) + 0.8 : strokeW(e)).move_to(...k.a);
    if (k.via) { for (const v of k.via) path = path.line_to(...v); path = path.line_to(...k.b); }
    else path = path.cubic_bezier_to(...k.b, ...k.c1, ...k.c2);
    if (e.kind === "parent") path = path.dash_array([5, 4]);
    canvas.child(window.paint_path(path.build(), color).absolute().top(0).left(0).size_full());
    canvas.child(window.paint_path(PathBuilder.fill().add_polygon(arrowOf(k.c2, k.b), true).build(), color).absolute().top(0).left(0).size_full());
    if (e.kind === "send" && mine(e))
      canvas.child(div().absolute().left(k.mid[0] - 34).top(k.mid[1] - 8).w(68).flex().justify_center()
        .child(div().px(4).rounded(3).bg(t.surface).text_size(z - 3.5).text_color(color).child(wt ? `${wt.state === "blocked" ? "等你處理" : "還沒回"} · ${agoText(wt.since, now).replace("前", "")}` : `${e.count} 次 · ${agoText(e.at, now)}`)));
  }
  g.cols.forEach((c, ci) => canvas.child(div().absolute().left(heads[ci].x).top(heads[ci].y).w(cw).truncate()
    .text_size(z - 2.5).font_medium().text_color(c.down ? t.ansi1 : t.dim)
    .child([c.space || "", c.down ? `${c.machine} 斷線 ${spanText(now - c.down)}` : c.machine].filter(Boolean).join(" · "))));
  for (const n of g.nodes) {
    const st = cardState(g, n, now);
    // colored all over: your turn (waiting for you, done for you to look, a stuck chain); two in one folder: a
    // border only (a heads-up, not your turn)
    const you = stuck.has(n.address) || Boolean(st?.you);
    canvas.child(card(t, z, n, at[n.address], sel === n.address, onSelect,
      st?.hot ? t.ansi1 : st?.warm ? t.blocked : stuck.get(n.address) ?? (st?.you ? t[st.color] : clash.has(n.address) ? t.working : null), st, now, you));
  }
  return canvas;
}

// what the colors say, in one line above the drawing: the colored-all-over cards are your turn
export function legendView(t, z) {
  const dot = (c, label, frame = false) => h_flex().gap(3).items_center()
    .child(div().size(9).rounded(2).when(frame, (el) => el.border_2().border_color(c)).when(!frame, (el) => el.bg(c)))
    .child(div().child(label));
  return h_flex().id("kit-graph-legend").flex_wrap().px(12).pb(4).gap(10).text_size(z - 3.5).text_color(t.dim)
    .child(div().child("整張上色＝輪到你："))
    .child(dot(t.blocked, "等你處理")).child(dot(t.ansi1, "等太久")).child(dot(t.done, "做完等你看")).child(dot(stuckColor(t), "停了沒回／互等"))
    .child(dot(t.working, "同一個資料夾（只有框）", true));
}

// agents not answering each other (停了沒回, 互等: a nudge may do): their own color, apart from waiting for you
// (blocked) and waiting too long (ansi1); the theme's magenta
export const stuckColor = (t) => t.ansi5 || t.ansi1;

// c over base, a little of it (both "#rrggbb"; anything else: base as it is)
export function tint(base, c, amount = 0.16) {
  const rgb = (x) => (/^#[0-9a-f]{6}/i.test(String(x)) ? [1, 3, 5].map((i) => parseInt(String(x).slice(i, i + 2), 16)) : null);
  const a = rgb(base), b = rgb(c);
  if (!a || !b) return base;
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, "0")).join("")}`;
}

// the status mark the Agents list puts at the end of a row: working spins, blocked "!", done a dot, idle a ring
function glyph(t, s) {
  if (s === "working") return spin(12, t.working).mx(1);
  if (s === "blocked") return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
  if (s === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
  return div().size(7).mx(3).flex_none().rounded(4).bg(s === "done" ? t.done : t.dim + "00");
}

export const runningSubs = (n) => (n?.subs ?? []).filter((x) => !x.done).length;
// one line per sub-agent: what it was asked, its kind, running (since when, its latest step) or done (when)
export const subLine = (x, now = Date.now()) => `${x.desc || x.type || x.id}${x.type && x.desc ? `（${x.type}）` : ""} · ${x.done
  ? `做完 · ${agoText(x.last, now)}` : `在跑 · 開始 ${agoText(x.start, now)}${x.step ? ` · 正在：${x.step}` : ""}`}`;
export const subsText = (n, now = Date.now()) => (n?.subs ?? []).map((x) => subLine(x, now)).join("\n");

// mark: a color for a card in trouble (a stuck chain; two in one folder) or waiting for you, else null: a thick
// border; wash: a tint of it all over too (only where it is your turn)
function card(t, z, n, p, on, onSelect, mark = null, st = null, now = Date.now(), wash = true) {
  return v_flex().id(`kit-graph-${n.address}`).absolute().left(p.x).top(p.y).w(p.w ?? COL_W).h(NODE_H).px(8).py(6).gap(1)
    .rounded(8).when(Boolean(mark), (el) => el.border_2()).when(!mark, (el) => el.border_1())
    .border_color(mark ?? (on ? t.accent : n.focused ? t.muted : t.border)).bg(on ? t.selected : mark && wash ? tint(t.raised, mark) : t.raised)
    .when(Boolean(n.down || st?.idle) && !on, (el) => el.opacity(0.5))   // offline, or done long ago: in the background
    .cursor_pointer().hover((s) => s.border_color(t.accent)).on_mouse_down("left", stop)
    // like a row of the Agents list: a click goes to its pane; here its lines stand out too
    .on_click((_e, cx) => { cx.stop_propagation(); run("pane.focus", { terminal: n.address }); onSelect?.(n.address, cx); })
    .child(h_flex().gap(5).items_center().min_w(0)
      .child(icon(n.program, 14, t.foreground) ?? div())
      .child(div().flex_1().min_w(0).truncate().font_semibold().text_size(z - 1).child(n.name))
      // its own sub-agents (Claude Code's, through the reply hook): how many run now
      .when(runningSubs(n) > 0, (el) => el.child(div().id(`kit-graph-subs-${n.address}`).flex_none().px(4).rounded(3).bg(t.surface)
        .text_size(z - 4).text_color(t.working).tooltip(subsText(n, now)).child(`子 ${runningSubs(n)}`)))
      .when(Boolean(n.where), (el) => el.child(div().flex_none().text_size(z - 4).text_color(t.dim).child(n.where)))
      .when(Boolean(n.since), (el) => el.child(div().flex_none().text_size(z - 3).text_color(t.dim).child(shortSpan(now - n.since))))
      .child(n.down ? div().size(7).mx(3).flex_none().rounded(4).bg(t.unknown) : glyph(t, n.background ? "working" : n.status)))
    .child(h_flex().min_w(0).gap(4).text_size(z - 2.5)
      .child(div().flex_shrink_1().min_w(0).truncate().text_color(t.muted).child([n.cli, n.model].filter(Boolean).join(" · ") || " "))
      .when(n.pct != null, (el) => el.child(div().flex_none().text_color(n.pct >= 90 ? t.ansi1 : n.pct >= FULL_PCT ? t.blocked : t.dim).child(`· ${n.pct}%`))))
    .child(div().truncate().text_size(z - 2.5).text_color(n.noteOld ? t.dim : t.foreground).child(n.note || " "))
    .child(div().truncate().text_size(z - 3).font_semibold().text_color(st ? t[st.color] ?? t.dim : t.dim).child(st?.text || " "));
}

// 提醒它回: what is typed into an agent that stopped without answering (w: its wait). No <hc> tag in it, so the
// agent's reply hook doesn't take it for a message from another agent; the address it answers to is in that message.
export function nudgeText(g, w) {
  const name = (a) => g.nodes.find((n) => n.address === a)?.name ?? a;
  const first = String(w.text ?? "").slice(0, 80);
  return `[Herdr 提醒] 你還沒回 ${name(w.from)} 傳給你的訊息${first ? `（開頭：「${first}」）` : ""}。` +
    `要回就用 hc send 回給它（位址在那則訊息開頭的 from 裡）；只是通知、不用回的話，不必理會這則。`;
}

// above the drawing: what needs a look, each a line; a click selects the agent it is about.
// onNudge(wait, cx): 提醒它回 on an agent that stopped without answering (nudged: "from>to@at" keys already sent)
// pending: what waits for a person outside the agents (machines.js pendingRows: kit status's pending, root's report too)
export function alertsView(t, z, g, now = Date.now(), onSelect = null, { onNudge = null, nudged = new Set(), pending = [] } = {}) {
  const name = (a) => g.nodes.find((n) => n.address === a)?.name ?? a;
  const items = [];
  const waitOn = (from, to) => g.waits.find((w) => w.from === from && w.to === to);
  for (const c of g.chains) {
    const path = c.path.map(name).join(" → ");
    const text = c.why === "loop" ? `互等：${path}`
      : c.why === "blocked" ? `卡住：${path}，${name(c.end)} 在等你處理`
      : `卡住：${path}，${name(c.end)} 停了但沒回`;
    items.push({ id: `chain-${c.path.join("-")}`, text, color: c.why === "blocked" ? t.blocked : stuckColor(t), who: c.why === "loop" ? c.path[0] : c.end,
      nudge: c.why === "silent" ? waitOn(c.path.at(-2), c.end) : null });
  }
  for (const w of g.waits.filter((x) => x.state === "silent" && !g.chains.some((c) => c.path.includes(x.from) && c.path.includes(x.to))))
    items.push({ id: `wait-${w.from}-${w.to}`, text: `${name(w.to)} 還沒回 ${name(w.from)}（${agoText(w.since, now).replace("前", "")}）`, color: stuckColor(t), who: w.to, nudge: w });
  const ends = new Set(g.chains.map((c) => c.end));
  // waiting for you: on top, from the start (red past LONG_WAIT); one at the end of a 卡住 chain is said there
  const yours = [];
  for (const w of (g.blocked ?? g.longWaits.map((x) => ({ ...x, hot: true }))).filter((x) => !ends.has(x.address)))
    yours.push({ id: `${w.hot ? "long" : "you"}-${w.address}`, color: w.hot ? t.ansi1 : t.blocked, who: w.address,
      text: `${name(w.address)} ${KIND[w.kind] ?? "等你處理"}${w.hot ? "已經 " : " "}${w.for ? spanText(w.for) : ""}${w.ask ? `：「${w.ask}」` : ""}` });
  items.unshift(...yours);
  for (const c of g.clashes)
    items.push({ id: `clash-${c.nodes.join("-")}`, text: `同一個資料夾：${c.nodes.map(name).join("、")} 同時在 ${shortDir(c.dir)} 裡改東西`, color: t.working, who: c.nodes[0] });
  for (const [i, p] of pending.entries()) {
    const long = p.since ? `，等了 ${spanText(now - p.since)}` : "";
    const text = p.kind === "sign" ? `等你簽：${p.what ?? `${p.name} 有 ${p.commits ?? "新的"} 個 commit 等核准`}（${p.where}${long}）。簽章在 Mac 親手做`
      : p.kind === "owner" ? `等站長同意：${p.what}（${p.where}${long}）`
      : `${p.what}（${p.where}${long}）`;
    items.push({ id: `pending-${i}`, text, color: t.blocked, who: null });
  }
  const done = g.done ?? [], quiet = done.filter((x) => !x.said);
  for (const x of done.filter((y) => y.said))
    items.push({ id: `done-${x.address}`, text: `${name(x.address)} 做完等你看：「${x.said}」`, color: t.done, who: x.address });
  if (quiet.length) items.push({ id: "done", text: `做完等你看：${quiet.map((x) => name(x.address)).join("、")}`, color: t.done, who: quiet[0].address });
  for (const f of g.full ?? [])
    items.push({ id: `full-${f.address}`, text: `${name(f.address)} 的 context 用了 ${f.pct}%，快滿了：先請它寫 HANDOFF.md，再開新的接手`,
      color: f.pct >= 90 ? t.ansi1 : t.blocked, who: f.address });
  const idle = g.idle ?? [];
  if (idle.length) items.push({ id: "idle", text: `閒置超過 ${spanText(IDLE_CLOSE)}、沒人在等：${idle.map((x) => name(x.address)).join("、")}，可以關了（不會自動關）`,
    color: t.dim, who: idle[0].address });
  if (!items.length) return null;
  const box = v_flex().gap(3).px(10).pt(2).pb(4);
  for (const i of items)
    box.child(h_flex().id(`kit-graph-alert-${i.id}`).gap(6).items_center().px(8).py(4).rounded(6).border_1().border_color(i.color)
      .text_size(z - 1.5).cursor_pointer().hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
      .on_click((_e, cx) => { if (!i.who) return; run("pane.focus", { terminal: i.who }); onSelect?.(i.who, cx); })
      .child(div().size(7).flex_none().rounded(4).bg(i.color)).child(div().flex_1().min_w(0).child(i.text))
      .when(Boolean(i.nudge && onNudge), (el) => {
        const key = `${i.nudge.from}>${i.nudge.to}@${i.nudge.at}`, done = nudged.has(key);
        return el.child(btn(t, z, `kit-graph-nudge-${i.id}`, done ? "已提醒" : "提醒它回", { tiny: true, off: done, on: (cx) => onNudge(i.nudge, cx) }));
      }));
  return box;
}

// under the drawing: the selected card's lines in words (or how to read the drawing)
export function edgeList(t, z, g, sel, now = Date.now()) {
  const box = v_flex().gap(3).px(12).py(8).text_size(z - 1.5);
  const name = (a) => g.nodes.find((n) => n.address === a)?.name;
  if (!sel) {
    const sends = g.edges.filter((e) => e.kind === "send").length;
    return box.child(div().text_color(t.dim).child(g.nodes.length
      ? sends || g.edges.length
        ? "點一張卡片就切到那個 agent，圖上也標出它的線、下面寫它跟誰說了什麼（點空白處取消）。線越亮越新、越粗次數越多；虛線是誰開了誰。"
        : "還沒看到誰用 hc send 傳話給誰（要新版 herdr-core 才會記下）。點一張卡片就切到那個 agent。"
      : "這裡沒有在跑的 agent。"));
  }
  const all = [...g.edges, ...g.outside].filter((e) => e.from === sel || e.to === sel).sort((a, b) => b.at - a.at);
  const n = g.nodes.find((x) => x.address === sel);
  box.child(div().truncate().font_semibold().child(`${n?.name ?? sel}（${sel}）`));
  if (n?.note) box.child(copyOnRight(div().text_color(t.muted).child(`進度：${n.note}`), n.note));
  if (n?.said) box.child(copyOnRight(div().text_color(t.done).child(`停下來時說：${n.said}`), n.said));
  for (const x of n?.subs ?? []) box.child(div().text_color(x.done ? t.dim : t.working).child(`子 agent：${subLine(x, now)}`));
  const st = n && cardState(g, n, now);
  if (st?.idle) box.child(div().text_color(t.dim).child(`${st.text}：要關就在它的分頁關（這裡不幫你關）。`));
  if (n?.down) box.child(div().text_color(t.ansi1).child(`連不到 ${n.machine}（斷線 ${spanText(now - n.down)}）：看到的是斷線前的樣子。`));
  if (!all.length) return box.child(div().text_color(t.dim).child("它還沒跟誰傳過話。"));
  for (const e of all) {
    const out = e.from === sel, other = out ? e.to : e.from, who = name(other);
    const head = e.kind === "parent" ? (out ? `開了 ${who ?? other}` : `由 ${who ?? other} 開的`)
      : `${out ? "→ 傳給" : "← 收到"} ${who ? `${who}（${other}）` : `${other}（不在這裡）`} · ${e.count} 次 · ${agoText(e.at, now)}`;
    const wt = e.kind === "send" ? g.waits.find((w) => w.from === e.from && w.to === e.to) : null;
    const wait = !wt ? "" : wt.state === "working" ? (out ? "（它在處理）" : "（你在處理）")
      : wt.state === "blocked" ? (out ? "（它在等人處理，還沒回）" : "") : out ? "（還沒回）" : "（還沒回它）";
    box.child(v_flex().gap(0).px(8).py(4).rounded(6).bg(t.raised)
      .child(div().truncate().text_color(wt && wt.state !== "working" ? (wt.state === "blocked" ? t.blocked : stuckColor(t)) : t.foreground).child(head + wait))
      .when(Boolean(e.text), (el) => el.child(copyOnRight(div().truncate().text_size(z - 2.5).text_color(t.muted).child(`最後一則：${e.text}`), e.text))));
  }
  return box;
}
