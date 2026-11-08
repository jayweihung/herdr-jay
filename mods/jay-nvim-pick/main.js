import { View, div } from "gpui-kit";
import { closeOverlay, focused, hc, notify, panes, props, run, terminals, window } from "herdr";

// Find the pane jay-nvim opened in the current tab, focus it and press the key nvim maps to JN.pick().
// Herdr keeps cmd keys for itself, so the key is sent with `hc keys`: on macOS super+o (arrives in nvim
// as <D-o>), elsewhere alt+o (<M-o>; Windows / Linux terminals carry no super key). Works for panes on
// other machines too.
// Recognised by argv: terminal.open's `name` doesn't show up in terminals() (hc ls name is null).
// jay-nvim's argv always holds "jay-nvim": the Lua's namespace names (macOS / Linux) or the init file's path (Windows).
const isJayNvim = (t) => Array.isArray(t?.argv) && t.argv.some((a) => String(a).includes("jay-nvim"));

export default class JayNvimPick extends View {
  init() {
    const { overlay } = props() ?? {};
    const tab = focused()?.tab;
    const byAddr = new Map(terminals().map((t) => [t.address, t]));
    const pane = panes().find((p) => p.tab === tab && p.terminal && isJayNvim(byAddr.get(p.terminal)));
    if (pane) {
      run("pane.focus", { pane: pane.pane });
      hc(["keys", pane.terminal, "esc", window()?.platform === "macos" ? "super+o" : "alt+o"]);
    } else {
      notify({ title: "這個分頁沒有 jay-nvim", body: "先開一格 jay-nvim（macOS cmd-e；Windows / Linux ctrl-shift-i）", level: "warning" });
    }
    if (overlay) closeOverlay(overlay);
  }

  render() {
    return div();
  }
}
