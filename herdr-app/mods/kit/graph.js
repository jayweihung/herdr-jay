// The 關係 tab of the Agents panel (agents.js): the agents running now, as cards, and who talks to whom.
//   a card    one agent (Herdr's agents()): its status, name, which CLI and model (kit context, as its pane header
//             asked: CTX), what it wrote (kit note: NOTE); one column per machine, in tab order, so cards stay put
//   a line    a message: `hc send` from inside one agent's terminal to another (herdr-core keeps `sent` on the
//             sender's record: to, count, last_ms, text); brighter the newer, thicker the more; dashed: who started whom
//             (`parent`)
// Click a card: its lines stand out and below it says each one (how many, when, the last message's first line);
// double-click: go to its pane. Lines to agents outside what is shown are listed there too.
// graphData and the geometry are plain functions (tests/kit/run.js); graphView draws them.
import { div, PathBuilder } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run } from "herdr";
import { stop, icon, btn, copyOnRight } from "./common.js";
import { noteView } from "./context.js";

export const COL_W = 200, NODE_H = 70, GAP_X = 84, GAP_Y = 24, PAD = 14, HEAD = 22, LOOP = 44;
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
  const nodes = shown.map((a) => {
    const c = byTerminal(ctx, a.address), n = noteView(byTerminal(notes, a.address), now);
    return { address: a.address, machine: machineOf(a.address), name: a.tab_name || a.title || a.address, status: a.status,
      cli: cliOf(a.app, a.program?.key), model: modelOf(c?.model), note: n?.line ?? "", noteOld: Boolean(n?.old),
      program: a.program, space: a.space_name, focused: Boolean(a.focused) };
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
  return { cols, nodes, edges, outside };
}

// where each card is: address -> { x, y }, and the whole drawing's size
export function layoutOf(cols) {
  const at = {};
  cols.forEach((c, ci) => c.nodes.forEach((n, ri) => { at[n.address] = { x: PAD + ci * (COL_W + GAP_X), y: PAD + HEAD + ri * (NODE_H + GAP_Y) }; }));
  const rows = Math.max(1, ...cols.map((c) => c.nodes.length));
  return { at, w: PAD * 2 + cols.length * COL_W + Math.max(0, cols.length - 1) * GAP_X + LOOP, h: PAD * 2 + HEAD + rows * NODE_H + (rows - 1) * GAP_Y };
}

// a line's curve: from the side of its card that faces the other one; between cards in one column it loops out
// on the right. -> { a: start, c1, c2, b: end, mid } (points [x, y])
export function curveOf(p, q, both = false) {
  const off = both ? 9 : 0;
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

const width = (e) => (e.kind === "parent" ? 1.2 : Math.min(4, 1.2 + Math.log2(e.count)));
const STATUS = { working: "working", blocked: "blocked", done: "done", idle: "idle" };

// the drawing: cards on a canvas with the lines under them; sel: the selected card's address
export function graphView(t, z, g, sel, { onSelect, now = Date.now() } = {}) {
  const { at, w, h } = layoutOf(g.cols);
  const canvas = div().id("kit-graph").relative().w(w).h(h).flex_none();
  const recent = (e) => now - e.at < 10 * MIN ? t.accent : now - e.at < HOUR ? t.muted : t.dim;
  const mine = (e) => !sel || e.from === sel || e.to === sel;
  // the selected card's lines last, so they lie on top
  const edges = [...g.edges].sort((x, y) => Number(mine(x)) - Number(mine(y)));
  for (const e of edges) {
    const p = at[e.from], q = at[e.to];
    if (!p || !q) continue;
    const k = curveOf(p, q, e.both), color = mine(e) ? (e.kind === "parent" ? t.done : recent(e)) : t.border;
    let path = PathBuilder.stroke(mine(e) && sel ? width(e) + 0.8 : width(e)).move_to(...k.a).cubic_bezier_to(...k.b, ...k.c1, ...k.c2);
    if (e.kind === "parent") path = path.dash_array([5, 4]);
    canvas.child(window.paint_path(path.build(), color).absolute().top(0).left(0).size_full());
    canvas.child(window.paint_path(PathBuilder.fill().add_polygon(arrowOf(k.c2, k.b), true).build(), color).absolute().top(0).left(0).size_full());
    if (e.kind === "send" && mine(e))
      canvas.child(div().absolute().left(k.mid[0] - 34).top(k.mid[1] - 8).w(68).flex().justify_center()
        .child(div().px(4).rounded(3).bg(t.surface).text_size(z - 3.5).text_color(color).child(`${e.count} 次 · ${agoText(e.at, now)}`)));
  }
  g.cols.forEach((c, ci) => canvas.child(div().absolute().left(PAD + ci * (COL_W + GAP_X)).top(PAD).w(COL_W).truncate()
    .text_size(z - 2.5).text_color(t.dim).child(c.machine || "這台電腦")));
  for (const n of g.nodes) canvas.child(card(t, z, n, at[n.address], sel === n.address, onSelect));
  return canvas;
}

function card(t, z, n, p, on, onSelect) {
  const dot = t[STATUS[n.status]] ?? t.unknown;
  return v_flex().id(`kit-graph-${n.address}`).absolute().left(p.x).top(p.y).w(COL_W).h(NODE_H).px(8).py(6).gap(1)
    .rounded(8).border_1().border_color(on ? t.accent : n.focused ? t.muted : t.border).bg(on ? t.selected : t.raised)
    .cursor_pointer().hover((s) => s.border_color(t.accent)).on_mouse_down("left", stop)
    .on_click((e, cx) => { if (e.click_count >= 2) run("pane.focus", { terminal: n.address }); else onSelect?.(on ? null : n.address, cx); })
    .child(h_flex().gap(5).items_center().min_w(0)
      .child(div().size(7).flex_none().rounded(4).bg(dot))
      .child(icon(n.program, 12, t.muted) ?? div())
      .child(div().flex_1().min_w(0).truncate().font_semibold().text_size(z - 1).child(n.name))
      .child(div().flex_none().text_size(z - 3).text_color(t.dim).child(n.address)))
    .child(div().truncate().text_size(z - 2.5).text_color(t.muted).child([n.cli, n.model].filter(Boolean).join(" · ")))
    .child(div().truncate().text_size(z - 2.5).text_color(n.noteOld ? t.dim : t.foreground).child(n.note || " "));
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
    box.child(v_flex().gap(0).px(8).py(4).rounded(6).bg(t.raised)
      .child(div().truncate().text_color(t.foreground).child(head))
      .when(Boolean(e.text), (el) => el.child(copyOnRight(div().truncate().text_size(z - 2.5).text_color(t.muted).child(`最後一則：${e.text}`), e.text))));
  }
  return box;
}
