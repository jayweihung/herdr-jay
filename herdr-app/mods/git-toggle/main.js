// Top-bar "Git" button: shows or hides the layout's "git-graph-panel" (rabeeh-ta/herdr-git-graph),
// without cloning Herdr's tabs mod. Needs the git-graph mod (rabeeh-ta/herdr-git-graph) installed beside it.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { run, theme, layout } from "herdr";

const PANEL = "git-graph-panel";
function find(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = find(c, id); if (f) return f; }
  return null;
}

export default class GitToggle extends View {
  render() {
    const t = theme(), node = find(layout(), PANEL), on = node && !node.hidden;
    return h_flex().size_full().pr(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("toggle-git").h(26).px(8).gap(5).flex_none().items_center().rounded(6).cursor_pointer()
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover((st) => st.bg(t.hover)).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => run("layout.toggle", { id: PANEL }))
        .child(svg("mods/git-graph/icons/graph.svg").size(13).flex_none().text_color(on ? t.foreground : t.muted))
        .child("Git"));
  }
}
