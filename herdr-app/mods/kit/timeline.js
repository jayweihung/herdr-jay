// The 關係 tab's timeline (agents.js): one lane per agent shown in the graph, its status as colored stretches over
// the last span (15 min, 1 h, 6 h), each message an arrow from the sender's lane to the receiver's at the time it
// went, each kit note a dot (the note in its tooltip). From the event log (events.js), so only what happened while
// Herdr ran here.
import { div, PathBuilder } from "gpui-kit";
import { v_flex } from "gpui-base";
import { arrowOf, agoText } from "./graph.js";

export const LABEL_W = 96, PLOT_W = 300, ROW_H = 24, AXIS_H = 18;
// the plot's width in a panel `width` px wide (0: not measured yet)
export const plotWidth = (width) => (width ? Math.max(160, Math.min(900, width - LABEL_W - 40)) : PLOT_W);
export const timelineHeight = (rows) => AXIS_H + rows * ROW_H + 6;
export const SPANS = [["15m", 15 * 60000, "15 分"], ["1h", 3600000, "1 小時"], ["6h", 6 * 3600000, "6 小時"]];

// status stretches for one agent in [from, to]: [{ x0, x1, v }] (times), from its status events
export function stretches(log, a, from, to) {
  const ev = log.filter((e) => e.a === a && (e.k === "status" || e.k === "start" || e.k === "gone")).sort((x, y) => x.at - y.at);
  const out = [];
  let cur = null, since = from;
  for (const e of ev) {
    if (e.at <= from) { cur = e.k === "gone" ? null : e.v; continue; }
    if (e.at > to) break;
    if (cur) out.push({ x0: since, x1: e.at, v: cur });
    cur = e.k === "gone" ? null : e.v; since = e.at;
  }
  if (cur) out.push({ x0: since, x1: to, v: cur });
  return out.filter((s) => s.x1 > s.x0);
}

// rows: the graph's nodes (address, name); log: events.js; -> the drawing
export function timelineView(t, z, rows, log, span, now = Date.now(), width = 0) {
  const PLOT_W = plotWidth(width), from = now - span, h = timelineHeight(rows.length), w = LABEL_W + PLOT_W + 12;
  const x = (at) => LABEL_W + ((at - from) / span) * PLOT_W;
  const yOf = new Map(rows.map((r, i) => [r.address, AXIS_H + i * ROW_H + ROW_H / 2]));
  const color = { working: t.working, blocked: t.blocked, done: t.done, idle: t.idle };
  const box = div().id("kit-timeline").relative().w(w).h(h).flex_none();
  // the axis: then, halfway, now
  for (const [frac, label] of [[0, `${agoText(from, now).replace("前", "")}前`], [0.5, ""], [1, "現在"]]) {
    box.child(div().absolute().left(LABEL_W + frac * PLOT_W).top(AXIS_H - 2).w(1).h(h - AXIS_H).bg(t.border));
    if (label) box.child(div().absolute().left(LABEL_W + frac * PLOT_W - (frac === 1 ? 26 : 0)).top(0).text_size(z - 3.5).text_color(t.dim).child(label));
  }
  rows.forEach((r, i) => {
    const y = AXIS_H + i * ROW_H;
    box.child(div().absolute().left(0).top(y + 4).w(LABEL_W - 8).truncate().text_size(z - 2.5).text_color(t.muted).child(r.name));
    for (const s of stretches(log, r.address, from, now))
      box.child(div().absolute().left(x(s.x0)).top(y + 7).w(Math.max(1.5, x(s.x1) - x(s.x0))).h(ROW_H - 14).rounded(2)
        .bg(color[s.v] ?? t.unknown).opacity(s.v === "idle" ? 0.45 : 0.9));
  });
  for (const e of log) {
    if (e.at < from || e.at > now) continue;
    const ya = yOf.get(e.a);
    if (ya == null) continue;
    if (e.k === "note") {
      box.child(div().id(`kit-tl-note-${e.a}-${e.at}`).absolute().left(x(e.at) - 3).top(ya - 3).size(6).rounded(3).bg(t.foreground).tooltip(e.text));
      continue;
    }
    if (e.k !== "send") continue;
    const yb = yOf.get(e.to), ex = x(e.at);
    if (yb == null) {   // to someone not shown: a short stub
      box.child(window.paint_path(PathBuilder.stroke(1.5).move_to(ex, ya).line_to(ex + 6, ya - 6).build(), t.accent).absolute().top(0).left(0).size_full());
      continue;
    }
    const end = [ex, yb + (yb > ya ? -4 : 4)];
    box.child(window.paint_path(PathBuilder.stroke(1.5).move_to(ex, ya).line_to(...end).build(), t.accent).absolute().top(0).left(0).size_full());
    box.child(window.paint_path(PathBuilder.fill().add_polygon(arrowOf([ex, ya], end, 5), true).build(), t.accent).absolute().top(0).left(0).size_full());
  }
  return v_flex().child(box);
}
