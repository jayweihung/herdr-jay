# Herdr + herdr-jay on Windows / 在 Windows 上用

Text only: no scripts here. Every step is a command you type or an installer you run yourself.
只有說明，沒有腳本：每一步都是自己打指令或自己跑安裝程式。

## 1. Build Herdr: official source + jay's patches / 官方原始碼＋jay 的修改

Herdr's own build steps are in the official READMEs:

- App: <https://github.com/herdrdev/herdr-app> → "Build from source"
- Core (`hc`): <https://github.com/herdrdev/herdr-core> → "CONTRIBUTING.md"

**Before building, check [`patches/`](../patches/)**: if there is a folder for that repo, check out exactly the tag it is
named after and apply the patches (`git am`, see [patches/README.md](../patches/README.md)). No folder = no changes:
build the official tag as is. This way the company build has the same Herdr as jay's own.
**build 之前先看 `patches/`**：有那個 repo 的資料夾，就切到資料夾名稱的那個 tag、`git am` 套上；沒有就直接 build 官方 tag。

What the build needs on Windows (as of Herdr app v0.1.13 / core v0.1.19):

| Tool | Version | Notes |
|---|---|---|
| Rust | the version official CI pins (1.95.0) | `rustup`, MSVC toolchain |
| Visual Studio Build Tools | current | C++ workload (linker, Windows SDK) |
| Zig | 0.16.0 | builds the terminal engine (libghostty) |
| Git for Windows | current | also provides `sh`, used by core templates |
| just | current | the repos' build recipes |

Clone with submodules (`git clone --recurse-submodules ...`), check out a release **tag** (e.g. `git checkout v0.1.13`),
apply patches if any, then `just build` / `just install`.

## 2. Install the tools jay-nvim uses / 先裝 jay-nvim 要用的工具

jay-nvim does **not** install Neovim for you: install it first, once per machine.
jay-nvim **不會**幫你裝 Neovim，要自己先裝（每台一次）。

- **Neovim ≥ 0.10**, on `PATH`. Any one of:
  - `winget install Neovim.Neovim`
  - `scoop install neovim`
  - the `.msi` from <https://github.com/neovim/neovim/releases> (if the company blocks downloads, ask IT / the software center for "Neovim")
  - Check / 檢查：open a new terminal, `nvim --version` (first line ≥ `NVIM v0.10`).
- `git` (Git for Windows; you already have it for the build).
- `hc`: comes with Herdr core (`just install` in herdr-core). Check: `hc --version` or `herdr-core --version`.
  jay-nvim also finds `%LOCALAPPDATA%\Programs\herdr-core\herdr-core.exe`.
- Optional LSP / 選用：`npm i -g pyright typescript-language-server typescript`, `pip install ruff`
  (needs Node / Python; skip if not allowed — jay-nvim works without them).

## 3. Install herdr-jay / 安裝 herdr-jay

1. Get this repo (git clone, or download the ZIP of a `for-herdr-vX.Y.Z` tag that matches your Herdr).
2. Your Herdr home is `%USERPROFILE%\.config\herdr-app` (unless `HERDR_APP_HOME` or `XDG_CONFIG_HOME` is set;
   `herdr-app status` shows it). Copy `mods\jay-nvim` and `mods\jay-nvim-pick` into its `mods\` folder.
   Herdr 設定目錄：`%USERPROFILE%\.config\herdr-app`，把兩個資料夾複製到裡面的 `mods\`。
3. Add the keys to the home's `keys.json`, `global` section:

   ```json
   "ctrl-shift-i": "mod.open:jay-nvim",
   "ctrl-shift-j": "mod.open:jay-nvim-pick"
   ```

4. Check: `herdr-app check %USERPROFILE%\.config\herdr-app\mods\jay-nvim`.
5. Try it: `ctrl-shift-i` opens nvim on the right. If it says nvim is not found, nvim is not on `PATH`
   (reopen Herdr after installing so it sees the new `PATH`).

## 4. Updating / 更新

When you update Herdr, take the herdr-jay tag `for-herdr-<that version>` if there is one, and copy the mod folders again.
If there is no tag for your version yet, the newest tag usually still works; `herdr-app check` tells you.
