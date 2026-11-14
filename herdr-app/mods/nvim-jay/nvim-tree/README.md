# nvim-tree (bundled)

nvim-jay's file tree is [nvim-tree.lua](https://github.com/nvim-tree/nvim-tree.lua): `lua/`, `plugin/` and `LICENSE` (here `LICENSE.txt`)
of tag `nvim-tree-v1.19.0` (commit 9a2e0006d42f292eb3ade7dfdff201a7429a780c), with one change (below).
nvim-tree is GPL-3.0 (`LICENSE.txt` here), and so is nvim-jay (`../LICENSE.txt`).

## The one change

nvim-tree runs `git` by name with no switches. In someone else's repo that would run what the repo's own config names
(a `core.fsmonitor` hook, clean filters) and, on Windows, maybe a `git.exe` in the project folder. So every git
command it runs starts with what nvim-jay gives (`JN.tree_git`): git by its full path and the switches nvim-jay's own
git calls use; no git for a repo where nvim-jay runs none. Lines marked `-- nvim-jay`:

- `lua/nvim-tree/git/jay.lua` (new): asks nvim-jay for the start of the command.
- `lua/nvim-tree/git/runner.lua` (`git status`) and `lua/nvim-tree/git/utils.lua` (`rev-parse`, `config`): use it.

How it reaches nvim:

- macOS and Linux, this computer or another machine: `../ship.js` sends the files `files.txt` lists to
  `~/.cache/nvim-jay/nvim-tree-<hash>/` on that machine, once per version.
- Windows: nvim reads them from this folder.

nvim-jay sets it up itself (the `TREE` part of `../nvim.js`): its own mouse and right-click menu, none of nvim-tree's
default keys.

## Updating

1. Copy `lua/`, `plugin/` and `LICENSE` (as `LICENSE.txt`) of the new tag over these (delete what the tag no longer has), then make the
   change above again (`git diff` of these folders shows the old one; a new place that runs git needs it too:
   `grep -rn '"git"' lua`).
2. `node tests/nvim-jay/tree-files.js <tag> <commit>` rewrites `files.txt`.
3. Change the tag and commit above, run `node tests/nvim-jay/run.js`, and try the tree with the mouse.
