import { View, div } from "gpui-kit";
import { appHome, closeOverlay, focused, notify, props, readTextFile, run, spaces, window, writeTextFile } from "herdr";
import { NVIM_INIT } from "./nvim.js";

// terminal.open has no machine param: the pane opens on the machine of the focused space,
// so one mod serves this computer and the machines it reaches. Core-launched panes get a bare PATH
// (no ~/.local/bin, no Homebrew), hence the explicit candidates.
// jay-nvim-pick finds this pane by "jay-nvim" in its argv (the Lua's namespace names, or the init file's path).
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

// Windows: no /bin/sh, and a command line holds at most 32767 characters (the Lua is longer), so the Lua goes
// to a hidden file in this mod's folder (it exists; hidden files don't hot-reload the mod) and nvim runs it with dofile. nvim.exe must be on PATH (winget / scoop / the installer).
// Only for a pane on this computer: a space on another machine is Linux or macOS, reached the other way.
async function openWindows() {
  const sep = appHome().includes("\\") ? "\\" : "/";
  const file = [appHome(), "mods", "jay-nvim", ".init.lua"].join(sep);
  const old = await readTextFile(file);
  if (old !== NVIM_INIT) await writeTextFile(file, NVIM_INIT, old);
  // dofile, not -S: :source would read "#" and "%" in the path as Vim filename specials.
  run("terminal.open", { argv: ["nvim", "-c", `lua dofile([==[${file}]==])`], place: "right", name: "nvim" });
}

function localSpace() {
  const id = focused()?.space;
  const s = spaces().find((x) => x.id === id);
  return !s?.machine;
}

export default class JayNvim extends View {
  init(_props, cx) {
    const { overlay } = props() ?? {};
    if (window()?.platform === "windows" && localSpace()) {
      cx.spawn(async () => {
        try {
          await openWindows();
        } catch (e) {
          notify({ title: "jay-nvim 開不起來", body: String(e?.message ?? e), level: "error" });
        }
        if (overlay) closeOverlay(overlay);
      });
      return;
    }
    run("terminal.open", { argv: ["/bin/sh", "-c", FIND_NVIM, "nvim", "-c", `lua ${NVIM_INIT}`], place: "right", name: "nvim" });
    if (overlay) closeOverlay(overlay);
  }

  render() {
    return div();
  }
}
