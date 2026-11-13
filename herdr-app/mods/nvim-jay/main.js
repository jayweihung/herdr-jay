import { View, div } from "gpui-kit";
import { closeOverlay, focused, notify, props, spaces, window } from "herdr";
import { openUnix } from "./unix.js";
import { openWindows } from "./windows.js";

// Opens nvim (with the Lua in nvim.js) in a pane to the right of the focused one. Another mod may open it as an
// overlay with props { review, folder, name, space } (the Gerrit panel's 在 nvim 看): a Gerrit review in a new tab of
// that space (one on this computer: the review's files are here), in that folder. Which launcher depends on where
// the pane will run, not on this computer alone: terminal.open has no machine parameter, the pane opens on the
// machine of the focused pane (or of the focused space). Other machines are macOS or Linux.
//   unix.js    macOS, Linux, other machines
//   windows.js Windows, this computer
function onThisComputer() {
  const f = focused();
  if (f?.terminal) return !String(f.terminal).includes("/"); // "machine/t3" is a pane on another machine
  const s = spaces().find((x) => x.id === f?.space);
  return !s?.machine;
}

export default class NvimJay extends View {
  init(_props, cx) {
    const { overlay, review, folder, name, space } = props() ?? {};
    const str = (x) => (typeof x === "string" && x ? x : undefined);
    const rv = str(review) ? { review, name: str(name), space: str(space) } : {};
    // the focused pane's live folder (the agent's project); terminal.open alone may start in the space's folder
    const cwd = rv.review && typeof folder === "string" ? folder : focused()?.cwd ?? null;
    if (window()?.platform === "windows" && (rv.review || onThisComputer())) {
      cx.spawn(async () => {
        try {
          await openWindows(cwd, rv);
        } catch (e) {
          notify({ title: "nvim-jay 開不起來", body: String(e?.message ?? e), level: "error" });
        }
        if (overlay) closeOverlay(overlay);
      });
      return;
    }
    openUnix(cwd, rv);
    if (overlay) closeOverlay(overlay);
  }

  render() {
    return div();
  }
}
