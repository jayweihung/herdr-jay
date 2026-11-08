import { View, div } from "gpui-kit";
import { closeOverlay, props, run } from "herdr";
import { NVIM_INIT } from "./nvim.js";

// terminal.open has no machine param: the pane opens on the machine of the focused space,
// so one mod serves both the server and the Mac. Core-launched panes get a bare PATH
// (no ~/.local/bin, no Homebrew), hence the explicit candidates.
// pick/main.js finds this pane by this argv ("nvim not found on"); keep them in step.
// nvim exits 77 when the agent beside it runs as root (a sudo'd agent): its log is only readable by root.
// Then, if ~/.config/jay-nvim/handoff names an absolute path, run it under sudo with the pane id and runtime dir
// (it should start root's own nvim with root's own copy of this Lua; see README). Never pass "$@" there:
// it holds this mod's Lua, which you can write, and run as root it would hand root to whatever runs as you.
const FIND_NVIM = `for n in "$HOME/.local/bin/nvim" /opt/homebrew/bin/nvim /usr/local/bin/nvim /usr/bin/nvim; do
  [ -x "$n" ] || continue
  "$n" "$@"; rc=$?; [ $rc = 77 ] || exit $rc
  h=$(head -n1 "$HOME/.config/jay-nvim/handoff" 2>/dev/null)
  case $h in /*) ;; *) echo "旁邊的 agent 用 root 在跑；沒設定 ~/.config/jay-nvim/handoff（見 jay-nvim README）"; read _; exit 1 ;; esac
  exec sudo "$h" "$HC_TERMINAL_ID" "$XDG_RUNTIME_DIR"
done
echo "nvim not found on $(hostname)"; read _`;

export default class JayNvim extends View {
  init() {
    const { overlay } = props() ?? {};
    run("terminal.open", { argv: ["/bin/sh", "-c", FIND_NVIM, "nvim", "-c", `lua ${NVIM_INIT}`], place: "right", name: "nvim" });
    if (overlay) closeOverlay(overlay);
  }

  render() {
    return div();
  }
}
