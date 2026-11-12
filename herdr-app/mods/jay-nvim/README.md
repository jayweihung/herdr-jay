# jay-nvim

Neovim in a pane beside your coding agent, inside [Herdr](https://github.com/herdrdev/herdr-app).
在 Herdr 裡，agent 旁邊開一格 Neovim。

Features, keys, macOS vs Windows, security: **[docs/nvim.md](../../../docs/nvim.md)**
(online: <https://github.com/jayweihung/herdr-jay/blob/main/docs/nvim.md>).
Install: [macOS](../../../docs/macos.md) · [Windows](../../../docs/windows.md).

Quick install: copy (or symlink) `jay-nvim` and `jay-nvim-pick` into your Herdr home's `mods/`
(macOS: `~/.config/herdr-app/mods/`, Windows: `%USERPROFILE%\.config\herdr-app\mods\`), then add the keys:
macOS `"cmd-e": "mod.open:jay-nvim"`, `"cmd-o": "mod.open:jay-nvim-pick"`;
Windows `"ctrl-shift-i": "mod.open:jay-nvim"`, `"ctrl-shift-j": "mod.open:jay-nvim-pick"`.
Needs Neovim 0.11+, git and Herdr's `hc` on the machine where the pane opens.

Files: `main.js` (picks the launcher), `unix.js` (macOS / Linux / other machines), `windows.js` (Windows),
`mark.js` (argv marker jay-nvim-pick looks for), `nvim.js` (the Lua; OS differences in its PLATFORM section).

License: Apache 2.0 (see the repo's LICENSE). Comment spans and message shape follow herdr-nvim (MIT, ChmaraX/herdr-nvim).
