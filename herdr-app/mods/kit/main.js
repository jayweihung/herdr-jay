// kit for Herdr: one mod, a part per role (props.role). Everything goes through the kit command on PATH (kit.cmd on
// Windows); first `kit api` says whether that kit is one this mod can read (common.js: KIT_API). How to install and
// update: herdr-jay's docs/kit.md.
//
//   panel (default)  the repository (倉庫): rules / skills / MCP of kit's sources, to read, edit, add and send  panel.js
//   toggle           the tab-bar button that shows or hides the panel                                        panel.js
//   pane             the popup for one agent (what it uses), opened from its pane header                     panel.js
//   editor           one file of the repository in its own big window                                        panel.js
//   agents           the agents kit's sources define: what each one uses, open one in a new tab              agents.js
//   agents-toggle    the tab-bar button that shows or hides the Agents panel                                 agents.js
//   header           a pane's header (the layout's pane frame header): kit's button and the context chip     header.js
//   context          the popup the context chip opens: where the agent's tokens go                           header.js
// A copy without a role but with a pane (Herdr gives a pane header { pane, terminal }) is a header.
import { View } from "gpui-kit";
import { props } from "herdr";
import { Panel } from "./panel.js";
import { Agents } from "./agents.js";
import { Header } from "./header.js";

const PARTS = { panel: Panel, toggle: Panel, pane: Panel, editor: Panel, agents: Agents, "agents-toggle": Agents, header: Header, context: Header };
export function roleOf(p) {
  if (typeof p?.role === "string" && Object.prototype.hasOwnProperty.call(PARTS, p.role)) return p.role;
  return p?.pane != null ? "header" : "panel";
}

export default class Kit extends View {
  init(p, cx) {
    const role = roleOf(props() ?? {});
    this.part = new PARTS[role](role);
    return this.part.init(p, cx);
  }

  render(cx) { return this.part.render(cx); }

  async close(cx) { await this.part?.close?.(cx); }
}
