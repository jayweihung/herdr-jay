// kit for Herdr: one mod, a part per role (props.role). Everything goes through the kit command on PATH (kit.cmd on
// Windows); first `kit api` says whether that kit is one this mod can read (common.js: KIT_API). How to install and
// update: herdr-jay's docs/kit.md.
//
//   repo (default)   the repository (倉庫): rules / skills / MCP of kit's sources, to read, edit, add and send  repo.js
//                    and its 各機器 tab: every machine's kit, what it lacks, the approved commits           machines.js
//   repo-toggle      the tab-bar button that shows or hides the repository panel                            repo.js
//   editor           one file of the repository in its own big window                                       repo.js
//   agent            the popup for one agent (what it uses), opened from its pane header                    agent.js
//   agents           the agents kit's sources define: what each one uses, open one in a new tab             agents.js
//   agents-toggle    the tab-bar button that shows or hides the Agents panel                                agents.js
//   header           a pane's header (the layout's pane frame header): kit's button and the context chip    header.js
//   context          the popup the context chip opens: where the agent's tokens go                          header.js
// Older names still work: panel = repo, toggle = repo-toggle, pane = agent. A copy without a role but with a pane
// (Herdr gives a pane header { pane, terminal }) is a header; without either, the repository. Any other role: a card
// that says so. Where it all sits in a layout: layout.js; what every part shares: common.js.
import { View, div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { props, theme } from "herdr";
import { Repo } from "./repo.js";
import { AgentPopup } from "./agent.js";
import { Agents } from "./agents.js";
import { Header } from "./header.js";
import { fs } from "./common.js";

const PARTS = { repo: Repo, "repo-toggle": Repo, editor: Repo, agent: AgentPopup, agents: Agents, "agents-toggle": Agents, header: Header, context: Header };
const OLD_NAMES = { panel: "repo", toggle: "repo-toggle", pane: "agent" };
const own = (o, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);
// the part a copy is: its role (or what an older name means now), "unknown" for a role this mod doesn't have
export function roleOf(p) {
  const r = p?.role;
  if (r == null || r === "") return p?.pane != null ? "header" : "repo";
  const name = own(OLD_NAMES, r) ? OLD_NAMES[r] : r;
  return own(PARTS, name) ? name : "unknown";
}

// a role this mod doesn't have (a typing mistake in a layout or an openOverlay): say which, and the ones it has
class Unknown {
  init() {}
  render() {
    const t = theme(), z = fs(), role = props()?.role;
    return v_flex().size_full().p(12).gap(6).bg(t.surface).text_size(z - 1).text_color(t.foreground)
      .child(div().font_semibold().text_color(t.ansi1).child(`kit：不認得的 role「${typeof role === "string" ? role : JSON.stringify(role)}」`))
      .child(div().text_color(t.muted).child(`認得的：${Object.keys(PARTS).join("、")}（舊的名字 ${Object.keys(OLD_NAMES).join("、")} 也可以）。請改版面或叫它的地方。`));
  }
}

export default class Kit extends View {
  init(p, cx) {
    const role = roleOf(props() ?? {});
    this.part = role === "unknown" ? new Unknown() : new PARTS[role](role);
    return this.part.init(p, cx);
  }

  render(cx) { return this.part.render(cx); }

  async close(cx) { await this.part?.close?.(cx); }
}
