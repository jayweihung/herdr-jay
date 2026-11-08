# Herdr + herdr-jay on Windows / 在 Windows 上用

Text only: no scripts here. Every step is a command you type or an installer you run yourself.
只有說明，沒有腳本：每一步都是自己打指令或自己跑安裝程式。

## 1. Build Herdr from the official source / 從官方原始碼 build Herdr

Follow the official READMEs; they are the source of truth:

- App: <https://github.com/herdrdev/herdr-app> → "Build from source"
- Core (`hc`): <https://github.com/herdrdev/herdr-core> → "CONTRIBUTING.md"

What they need on Windows (as of Herdr app v0.1.13 / core v0.1.19):

| Tool | Version | Notes |
|---|---|---|
| Rust | the version official CI pins (1.95.0) | `rustup`, MSVC toolchain |
| Visual Studio Build Tools | current | C++ workload (linker, Windows SDK) |
| Zig | 0.16.0 | builds the terminal engine (libghostty) |
| Git for Windows | current | also provides `sh`, used by core templates |
| just | current | the repos' build recipes |

Clone with submodules (`git clone --recurse-submodules ...`), then `just build` / `just install` in each repo.
Build a release **tag** (e.g. `git checkout v0.1.13`) rather than `master`, so it matches the version herdr-jay was checked with.

## 2. Install herdr-jay / 安裝 herdr-jay

1. Get this repo (git clone, or download the ZIP of a `for-herdr-vX.Y.Z` tag that matches your Herdr).
2. Copy `mods/jay-nvim` and `mods/jay-nvim-pick` into your Herdr home's `mods\` folder.
   Find the home folder in Herdr's Settings, or with `herdr-app status`.
3. Add the keys to your Herdr home's `keys.json`, `global` section:

   ```json
   "ctrl-shift-i": "mod.open:jay-nvim",
   "ctrl-shift-j": "mod.open:jay-nvim-pick"
   ```

4. Check: `herdr-app check <home>\mods\jay-nvim`.

## 3. Tools jay-nvim uses / jay-nvim 需要的工具

- Neovim ≥ 0.10 on `PATH`: `winget install Neovim.Neovim`
- `git` (Git for Windows)
- `hc` on `PATH` (installed with Herdr core)
- Optional LSP: `npm i -g pyright typescript-language-server typescript`, `pip install ruff`

## 4. Updating / 更新

When you update Herdr, take the herdr-jay tag `for-herdr-<that version>` if there is one, and copy the mod folders again.
If there is no tag for your version yet, the newest tag usually still works; `herdr-app check` tells you.
