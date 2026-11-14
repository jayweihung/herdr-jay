// The 關係 tab of the Agents panel (agents.js): the agents running now, as cards, and who talks to whom.
//   a card    one agent (Herdr's agents()): its status, name, which CLI and model (kit context, as its pane header
//             asked: CTX), what it wrote (kit note: NOTE); one column per machine, in tab order, so cards stay put
//   a line    a message: `hc send` from inside one agent's terminal to another (herdr-core keeps `sent` on the
//             sender's record: to, count, last_ms, text); brighter the newer, thicker the more; dashed: who started whom
//             (`parent`)
// Click a card: its lines stand out and below it says each one (how many, when, the last message's first line);
// double-click: go to its pane. Lines to agents outside what is shown are listed there too.
// Above the drawing, what needs a look (waitsOf, clashesOf):
//   還沒回     A messaged B last, and B stopped after it without messaging A back
//   卡住       a chain of agents each waiting for the next (it messaged it, and stopped), ending at one that needs you
//              (blocked) or didn't answer; a chain that comes back to itself: 互等
//   同一個資料夾  two agents working at once in one folder (or one inside the other), not each in its own worktree
// graphData and the geometry are plain functions (tests/kit/run.js); graphView draws them.
import { div, PathBuilder } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run } from "herdr";
import { stop, icon, btn, copyOnRight, shortDir } from "./common.js";
import { noteView } from "./context.js";

export const COL_W = 200, COL_W_DEFAULT = COL_W, NODE_H = 70, GAP_X = 84, GAP_Y = 24, PAD = 14, HEAD = 22, LOOP = 44;
const MIN = 60000, HOUR = 3600000;

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
export function graphData({ agents, terms, space, ctx, notes, now = Date.now() }) {
  const shown = (agents ?? []).filter((a) => !space || a.space === space);
  const rec = new Map((terms ?? []).map((r) => [r?.address, r]));
  const nodes = shown.map((a) => {
    const c = byTerminal(ctx, a.address), n = noteView(byTerminal(notes, a.address), now), r = rec.get(a.address);
    return { address: a.address, machine: machineOf(a.address), name: a.tab_name || a.title || a.address, status: a.status,
      cli: cliOf(a.app, a.program?.key), model: modelOf(c?.model), note: n?.line ?? "", noteOld: Boolean(n?.old),
      program: a.program, space: a.space_name, focused: Boolean(a.focused),
      since: Number(r?.status_ms) || 0, cwd: String(r?.foreground?.cwd || r?.cwd || "") };
  });
  const machines = [...new Set(nodes.map((n) => n.machine))].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  const cols = machines.map((m) => ({ machine: m, nodes: nodes.filter((n) => n.machine === m) }));
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
  const g = { cols, nodes, edges, outside };
  g.waits = waitsOf(g, now);
  g.chains = chainsOf(g);
  g.clashes = clashesOf(nodes);
  return g;
}

// how long after a message the receiver must have stopped for it to count as not answering (its turn on the message)
const SETTLE = 1500;
// A waits for B: A's last message to B is newer than B's last to A, and A has stopped (it isn't working on
// something else). How B stands: working (on it), blocked (needs you), or silent (stopped after it, no answer).
// -> [{ from, to, at, state, since }] (since: when B stopped, for silent and blocked)
export function waitsOf(g, now = Date.now()) {
  const node = new Map(g.nodes.map((n) => [n.address, n]));
  const last = (a, b) => g.edges.find((e) => e.kind === "send" && e.from === a && e.to === b);
  const out = [];
  for (const e of g.edges) {
    if (e.kind !== "send") continue;
    const a = node.get(e.from), b = node.get(e.to), back = last(e.to, e.from);
    if (!a || !b || (back && back.at >= e.at) || a.status === "working") continue;
    const state = b.status === "working" ? "working" : b.status === "blocked" ? "blocked"
      : b.since > e.at + SETTLE ? "silent" : "working";   // stopped before the message settled in: still on it
    out.push({ from: e.from, to: e.to, at: e.at, state, since: state === "working" ? 0 : b.since, waited: now - e.at });
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
// where each card is: address -> { x, y, w }, and the whole drawing's size
export function layoutOf(cols, width = 0) {
  const at = {}, cw = colWidth(cols.length, width);
  cols.forEach((c, ci) => c.nodes.forEach((n, ri) => { at[n.address] = { x: PAD + ci * (cw + GAP_X), y: PAD + HEAD + ri * (NODE_H + GAP_Y), w: cw }; }));
  const rows = Math.max(1, ...cols.map((c) => c.nodes.length));
  return { at, cw, w: PAD * 2 + cols.length * cw + Math.max(0, cols.length - 1) * GAP_X + LOOP, h: PAD * 2 + HEAD + rows * NODE_H + (rows - 1) * GAP_Y };
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
  return { a, c1, c2, b, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - (both ? 7 : 0)] };
}

// an arrowhead at b, pointing away from c (the last control point)
export function arrowOf(c, b, size = 7) {
  const dx = b[0] - c[0], dy = b[1] - c[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  return [b, [b[0] - ux * size - uy * size * 0.55, b[1] - uy * size + ux * size * 0.55], [b[0] - ux * size + uy * size * 0.55, b[1] - uy * size - ux * size * 0.55]];
}

const strokeW = (e) => (e.kind === "parent" ? 1.2 : Math.min(4, 1.2 + Math.log2(e.count)));
const STATUS = { working: "working", blocked: "blocked", done: "done", idle: "idle" };

// the drawing: cards on a canvas with the lines under them; sel: the selected card's address
export function graphView(t, z, g, sel, { onSelect, now = Date.now(), width = 0 } = {}) {
  const { at, w, h, cw } = layoutOf(g.cols, width);
  const canvas = div().id("kit-graph").relative().w(w).h(h).flex_none();
  const recent = (e) => now - e.at < 10 * MIN ? t.accent : now - e.at < HOUR ? t.muted : t.dim;
  const mine = (e) => !sel || e.from === sel || e.to === sel;
  const waitOf = (e) => e.kind === "send" ? g.waits.find((w) => w.from === e.from && w.to === e.to && w.state !== "working") : null;
  const stuck = new Set(g.chains.flatMap((c) => c.path)), clash = new Set(g.clashes.flatMap((c) => c.nodes));
  // the selected card's lines last, so they lie on top
  const edges = [...g.edges].sort((x, y) => Number(mine(x)) - Number(mine(y)));
  for (const e of edges) {
    const p = at[e.from], q = at[e.to];
    if (!p || !q) continue;
    const wt = waitOf(e);
    const k = curveOf(p, q, e.both), color = !mine(e) ? t.border : wt ? t.blocked : e.kind === "parent" ? t.done : recent(e);
    let path = PathBuilder.stroke(mine(e) && sel ? strokeW(e) + 0.8 : strokeW(e)).move_to(...k.a).cubic_bezier_to(...k.b, ...k.c1, ...k.c2);
    if (e.kind === "parent") path = path.dash_array([5, 4]);
    canvas.child(window.paint_path(path.build(), color).absolute().top(0).left(0).size_full());
    canvas.child(window.paint_path(PathBuilder.fill().add_polygon(arrowOf(k.c2, k.b), true).build(), color).absolute().top(0).left(0).size_full());
    if (e.kind === "send" && mine(e))
      canvas.child(div().absolute().left(k.mid[0] - 34).top(k.mid[1] - 8).w(68).flex().justify_center()
        .child(div().px(4).rounded(3).bg(t.surface).text_size(z - 3.5).text_color(color).child(wt ? `${wt.state === "blocked" ? "等你處理" : "還沒回"} · ${agoText(wt.since, now).replace("前", "")}` : `${e.count} 次 · ${agoText(e.at, now)}`)));
  }
  g.cols.forEach((c, ci) => canvas.child(div().absolute().left(PAD + ci * (cw + GAP_X)).top(PAD).w(cw).truncate()
    .text_size(z - 2.5).text_color(t.dim).child(c.machine || "這台電腦")));
  for (const n of g.nodes) canvas.child(card(t, z, n, at[n.address], sel === n.address, onSelect, stuck.has(n.address) ? t.blocked : clash.has(n.address) ? t.working : null));
  return canvas;
}

// mark: a color for a card in trouble (a stuck chain; two in one folder), else null
function card(t, z, n, p, on, onSelect, mark = null) {
  const dot = t[STATUS[n.status]] ?? t.unknown;
  return v_flex().id(`kit-graph-${n.address}`).absolute().left(p.x).top(p.y).w(p.w ?? COL_W).h(NODE_H).px(8).py(6).gap(1)
    .rounded(8).when(Boolean(mark), (el) => el.border_2()).when(!mark, (el) => el.border_1())
    .border_color(mark ?? (on ? t.accent : n.focused ? t.muted : t.border)).bg(on ? t.selected : t.raised)
    .cursor_pointer().hover((s) => s.border_color(t.accent)).on_mouse_down("left", stop)
    .on_click((e, cx) => { if (e.click_count >= 2) run("pane.focus", { terminal: n.address }); else onSelect?.(on ? null : n.address, cx); })
    .child(h_flex().gap(5).items_center().min_w(0)
      .child(div().size(7).flex_none().rounded(4).bg(dot))
      .child(icon(n.program, 12, t.muted) ?? div())
      .child(div().flex_1().min_w(0).truncate().font_semibold().text_size(z - 1).child(n.name))
      .child(div().flex_none().text_size(z - 3).text_color(t.dim).child(n.address.split("/").pop())))
    .child(div().truncate().text_size(z - 2.5).text_color(t.muted).child([n.cli, n.model].filter(Boolean).join(" · ")))
    .child(div().truncate().text_size(z - 2.5).text_color(n.noteOld ? t.dim : t.foreground).child(n.note || " "));
}

// above the drawing: what needs a look, each a line; a click selects the agent it is about
export function alertsView(t, z, g, now = Date.now(), onSelect = null) {
  const name = (a) => g.nodes.find((n) => n.address === a)?.name ?? a;
  const items = [];
  for (const c of g.chains) {
    const path = c.path.map(name).join(" → ");
    const text = c.why === "loop" ? `互等：${path}`
      : c.why === "blocked" ? `卡住：${path}，${name(c.end)} 在等你處理`
      : `卡住：${path}，${name(c.end)} 停了但沒回`;
    items.push({ id: `chain-${c.path.join("-")}`, text, color: t.blocked, who: c.why === "loop" ? c.path[0] : c.end });
  }
  for (const w of g.waits.filter((x) => x.state === "silent" && !g.chains.some((c) => c.path.includes(x.from) && c.path.includes(x.to))))
    items.push({ id: `wait-${w.from}-${w.to}`, text: `${name(w.to)} 還沒回 ${name(w.from)}（${agoText(w.since, now).replace("前", "")}）`, color: t.blocked, who: w.to });
  for (const c of g.clashes)
    items.push({ id: `clash-${c.nodes.join("-")}`, text: `同一個資料夾：${c.nodes.map(name).join("、")} 同時在 ${shortDir(c.dir)} 裡改東西`, color: t.working, who: c.nodes[0] });
  if (!items.length) return null;
  const box = v_flex().gap(3).px(10).pt(2).pb(4);
  for (const i of items)
    box.child(h_flex().id(`kit-graph-alert-${i.id}`).gap(6).items_center().px(8).py(4).rounded(6).border_1().border_color(i.color)
      .text_size(z - 1.5).cursor_pointer().hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
      .on_click((_e, cx) => onSelect?.(i.who, cx))
      .child(div().size(7).flex_none().rounded(4).bg(i.color)).child(div().flex_1().min_w(0).child(i.text)));
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
        ? "點一張卡片看它跟誰說了什麼；連點兩下跳到它的分頁。線越亮越新、越粗次數越多；虛線是誰開了誰。"
        : "還沒看到誰用 hc send 傳話給誰（要新版 herdr-core 才會記下）。點一張卡片看它；連點兩下跳到它的分頁。"
      : "這裡沒有在跑的 agent。"));
  }
  const all = [...g.edges, ...g.outside].filter((e) => e.from === sel || e.to === sel).sort((a, b) => b.at - a.at);
  const n = g.nodes.find((x) => x.address === sel);
  box.child(h_flex().gap(8).items_center()
    .child(div().flex_1().min_w(0).truncate().font_semibold().child(`${n?.name ?? sel}（${sel}）`))
    .child(btn(t, z, "kit-graph-go", "到它的分頁", { small: true, on: () => run("pane.focus", { terminal: sel }) })));
  if (n?.note) box.child(copyOnRight(div().text_color(t.muted).child(`進度：${n.note}`), n.note));
  if (!all.length) return box.child(div().text_color(t.dim).child("它還沒跟誰傳過話。"));
  for (const e of all) {
    const out = e.from === sel, other = out ? e.to : e.from, who = name(other);
    const head = e.kind === "parent" ? (out ? `開了 ${who ?? other}` : `由 ${who ?? other} 開的`)
      : `${out ? "→ 傳給" : "← 收到"} ${who ? `${who}（${other}）` : `${other}（不在這裡）`} · ${e.count} 次 · ${agoText(e.at, now)}`;
    const wt = e.kind === "send" ? g.waits.find((w) => w.from === e.from && w.to === e.to) : null;
    const wait = !wt ? "" : wt.state === "working" ? (out ? "（它在處理）" : "（你在處理）")
      : wt.state === "blocked" ? (out ? "（它在等人處理，還沒回）" : "") : out ? "（還沒回）" : "（還沒回它）";
    box.child(v_flex().gap(0).px(8).py(4).rounded(6).bg(t.raised)
      .child(div().truncate().text_color(wt && wt.state !== "working" ? t.blocked : t.foreground).child(head + wait))
      .when(Boolean(e.text), (el) => el.child(copyOnRight(div().truncate().text_size(z - 2.5).text_color(t.muted).child(`最後一則：${e.text}`), e.text))));
  }
  return box;
}
