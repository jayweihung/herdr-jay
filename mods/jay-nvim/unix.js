import { run } from "herdr";
import { NVIM_INIT } from "./nvim.js";
import { MARK } from "./mark.js";

// macOS, Linux, and any pane on another machine (Herdr "machines" are macOS or Linux): /bin/sh finds nvim and
// the whole Lua goes on nvim's command line. Core-launched panes get a bare PATH (no ~/.local/bin, no Homebrew),
// hence the explicit candidates.
// jay-nvim-pick finds this pane by the argv item MARK (main.js); keep it in the argv.
//
// Root handoff: nvim exits 77 when the agent beside it runs as root (a sudo'd agent): its log is only readable by root.
// Then, if ~/.config/jay-nvim/handoff names an absolute path, run it under sudo with the pane id and runtime dir.
// Read the security notes in docs/nvim.md first: a sudoers rule for it is a root door for every program you run.
// Never pass "$@" there: it holds this mod's Lua, which you can write, and run as root it would hand root to
// whatever runs as you.
const FIND_NVIM = `for n in "$HOME/.local/bin/nvim" /opt/homebrew/bin/nvim /usr/local/bin/nvim /usr/bin/nvim; do
  [ -x "$n" ] || continue
  "$n" "$@"; rc=$?; [ $rc = 77 ] || exit $rc
  h=$(head -n1 "$HOME/.config/jay-nvim/handoff" 2>/dev/null)
  case $h in /*) ;; *) echo "旁邊的 agent 用 root 在跑；沒設定 ~/.config/jay-nvim/handoff（見 docs/nvim.md）"; read _; exit 1 ;; esac
  exec sudo "$h" "$HC_TERMINAL_ID" "$XDG_RUNTIME_DIR"   # Linux: /run/user/<uid>; empty on macOS
done
echo "nvim not found on $(hostname)"; read _`;

export function openUnix() {
  run("terminal.open", { argv: ["/bin/sh", "-c", FIND_NVIM, "nvim", "--cmd", MARK, "-c", `lua ${NVIM_INIT}`], place: "right", name: "nvim" });
}
