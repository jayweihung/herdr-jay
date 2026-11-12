import { View, div } from "gpui-kit";
import { closeOverlay, focused, hc, notify, panes, props, run, terminals } from "herdr";

// Find the pane jay-nvim opened in the current tab, focus it and press the key nvim maps to JN.pick().
// Herdr keeps cmd keys for itself, so the key is sent with `hc keys`: alt+o, which nvim reads as <M-o> everywhere.
// Not super+o: hc encodes keys on the machine where the pane runs, and a Linux pane would get a plain "o"
// (a new line in normal mode). No Esc first: nvim maps <M-o> in every mode.
// Recognised by argv: terminal.open's `name` doesn't show up in terminals() (hc ls name is null). Both jay-nvim
// launchers pass MARK (jay-nvim/mark.js; keep the two identical).
const MARK = "let g:jay_nvim = 1";
const PICK_KEY = "alt+o";
const isJayNvim = (t) => Array.isArray(t?.argv) && t.argv.some((a) => a === MARK);

export default class JayNvimPick extends View {
  init() {
    const { overlay } = props() ?? {};
    const tab = focused()?.tab;
    const byAddr = new Map(terminals().map((t) => [t.address, t]));
    const pane = panes().find((p) => p.tab === tab && p.terminal && isJayNvim(byAddr.get(p.terminal)));
    if (pane) {
      run("pane.focus", { pane: pane.pane });
      const fail = (why) => notify({ title: "jay-nvim 沒收到按鍵", body: String(why), level: "error" });
      Promise.resolve(hc(["keys", pane.terminal, PICK_KEY]))
        .then((r) => { if (r?.code) fail(r.stderr || `hc keys exit ${r.code}`); })
        .catch((e) => fail(e?.message ?? e));
    } else {
      notify({ title: "這個分頁沒有 jay-nvim", body: "先開一格 jay-nvim（macOS cmd-e；Windows ctrl-shift-i）", level: "warning" });
    }
    if (overlay) closeOverlay(overlay);
  }

  render() {
    return div();
  }
}
