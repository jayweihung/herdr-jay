import { View, div } from "gpui-kit";
import { closeOverlay, focused, hc, notify, panes, props, run, terminals } from "herdr";

// cmd-o: in the current tab, find the pane jay-nvim opened, focus it and press cmd-o there,
// which nvim maps to JN.pick(). Herdr keeps cmd keys for itself, so the key is sent with
// `hc keys` (super+o arrives in nvim as <D-o>); it works for server panes too.
// Recognised by argv: terminal.open's `name` doesn't show up in terminals() (hc ls name is null).
const isJayNvim = (t) => Array.isArray(t?.argv) && t.argv[0] === "/bin/sh" && t.argv[3] === "nvim" && String(t.argv[2]).includes("nvim not found on");

export default class JayNvimPick extends View {
  init() {
    const { overlay } = props() ?? {};
    const tab = focused()?.tab;
    const byAddr = new Map(terminals().map((t) => [t.address, t]));
    const pane = panes().find((p) => p.tab === tab && p.terminal && isJayNvim(byAddr.get(p.terminal)));
    if (pane) {
      run("pane.focus", { pane: pane.pane });
      hc(["keys", pane.terminal, "esc", "super+o"]);
    } else {
      notify({ title: "這個分頁沒有 jay-nvim", body: "先按 cmd-e 開一格", level: "warning" });
    }
    if (overlay) closeOverlay(overlay);
  }

  render() {
    return div();
  }
}
