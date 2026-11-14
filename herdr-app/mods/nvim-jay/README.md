# nvim-jay

Neovim in a pane beside your coding agent, inside [Herdr](https://github.com/herdrdev/herdr-app).
在 Herdr 裡，agent 旁邊開一格 Neovim。

Features, keys, macOS vs Windows, security: **[docs/nvim-jay.md](../../../docs/nvim-jay.md)**
(online: <https://github.com/jayweihung/herdr-jay/blob/main/docs/nvim-jay.md>).
Install: [macOS](../../../docs/macos.md) · [Windows](../../../docs/windows.md).

Quick install: copy (or symlink) `nvim-jay` (and `agent-files`, [docs/agent-files.md](../../../docs/agent-files.md)) into your Herdr home's `mods/`
(macOS: `~/.config/herdr-app/mods/`, Windows: `%USERPROFILE%\.config\herdr-app\mods\`), then add the keys:
macOS `"cmd-e": "mod.open:nvim-jay"`, `"cmd-o": "mod.open:agent-files"`;
Windows `"ctrl-shift-i": "mod.open:nvim-jay"`, `"ctrl-shift-j": "mod.open:agent-files"`.
Needs Neovim 0.11+, git and Herdr's `hc` on the machine where the pane opens.

Files: `main.js` (picks the launcher), `unix.js` (macOS / Linux / other machines), `windows.js` (Windows),
`mark.js` (argv marker agent-files looks for), `nvim.js` (the Lua; OS differences in its PLATFORM section),
`ship.js` + `send.js` (put the Lua and the tree on the machine nvim runs on), `nvim-tree/` (the file tree, bundled).

License: GPL-3.0 (`LICENSE.txt`), because it bundles nvim-tree (GPL-3.0); the rest of herdr-jay is Apache 2.0. Comment spans and message shape follow herdr-nvim (MIT, ChmaraX/herdr-nvim).
