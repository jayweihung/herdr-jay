import { run } from "herdr";
import { MARK, reviewArgs, openPane } from "./mark.js";
import { where } from "./ship.js";

// macOS, Linux, and any pane on another machine (Herdr "machines" are macOS or Linux): ship.js puts the Lua and the
// file tree in ~/.cache/nvim-jay on that machine, then /bin/sh finds nvim and nvim sources the Lua. Core-launched panes
// get a bare PATH (no ~/.local/bin, no Homebrew), hence the explicit candidates.
// netrw is off before it loads (--cmd runs before plugins): the tree is nvim-tree.
// agent-files finds this pane by the argv item MARK (mark.js); keep it in the argv.
//
// A sudo'd agent beside the pane: nvim only says it can't follow it (no root handoff: an editor run as root that
// anything running as you can type into is a root door).
const FIND_NVIM = `for n in "$HOME/.local/bin/nvim" /opt/homebrew/bin/nvim /usr/local/bin/nvim /usr/bin/nvim; do
  [ -x "$n" ] || continue
  exec "$n" "$@"
done
echo "nvim not found on $(hostname)"; read _`;

// machine: the pane's machine (null: this computer). rv: a Gerrit review { review, name, space } (see main.js)
export async function openUnix(folder, rv = {}, machine = null) {
  const at = await where(machine);
  const dir = (name) => `$HOME . '/.cache/nvim-jay/${name}'`;
  openPane(run, ["/bin/sh", "-c", FIND_NVIM, "nvim", "--cmd", MARK, ...reviewArgs(rv.review),
    "--cmd", "let g:loaded_netrw = 1 | let g:loaded_netrwPlugin = 1",
    "--cmd", `let g:nvim_jay_tree = ${dir(at.tree)}`,
    "-c", `execute 'source ' . fnameescape(${dir(at.init)} . '/init.lua')`], folder, rv);
  return at;
}
