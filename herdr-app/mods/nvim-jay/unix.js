import { run } from "herdr";
import { NVIM_INIT } from "./nvim.js";
import { MARK } from "./mark.js";

// macOS, Linux, and any pane on another machine (Herdr "machines" are macOS or Linux): /bin/sh finds nvim and
// the whole Lua goes on nvim's command line. Core-launched panes get a bare PATH (no ~/.local/bin, no Homebrew),
// hence the explicit candidates.
// agent-files finds this pane by the argv item MARK (mark.js); keep it in the argv.
//
// A sudo'd agent beside the pane: nvim only says it can't follow it (no root handoff: an editor run as root that
// anything running as you can type into is a root door).
const FIND_NVIM = `for n in "$HOME/.local/bin/nvim" /opt/homebrew/bin/nvim /usr/local/bin/nvim /usr/bin/nvim; do
  [ -x "$n" ] || continue
  exec "$n" "$@"
done
echo "nvim not found on $(hostname)"; read _`;

export function openUnix(folder) {
  run("terminal.open", { folder: folder ?? undefined, argv: ["/bin/sh", "-c", FIND_NVIM, "nvim", "--cmd", MARK, "-c", `lua ${NVIM_INIT}`], place: "right", name: "nvim" });
}
