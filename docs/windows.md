# Herdr + herdr-jay on Windows / 在 Windows 上用

Text only: no scripts here. Every step is a command you type or an installer you run yourself.
Commands are for **PowerShell** unless marked otherwise. Checked against Herdr app v0.1.13 and core v0.1.19.
只有說明，沒有腳本：每一步都是自己打指令或自己跑安裝程式。指令都在 **PowerShell** 打。

Order / 順序：

1. Install the build tools (once) / 裝 build 工具（一次）
2. Build and install Herdr core (`hc`) / build＋安裝 Herdr core
3. Build and install the Herdr app / build＋安裝 Herdr app
4. Install Neovim and the other tools jay-nvim uses / 裝 Neovim 等工具
5. Install herdr-jay (copy two folders, add two keys) / 安裝 herdr-jay
6. Try it / 試用
7. When something goes wrong / 出問題時
8. Updating / 更新

After installing anything that changes `PATH`, **close and reopen PowerShell (and Herdr)**.
裝完任何會改 `PATH` 的東西，**PowerShell 和 Herdr 都要關掉重開**才看得到。

---

## 1. Build tools / build 工具（一次）

| Tool / 工具 | Version | winget (or ask IT / 公司軟體中心) | Check / 檢查 |
|---|---|---|---|
| Git for Windows | current | `winget install Git.Git` | `git --version`; also gives `sh` |
| Visual Studio Build Tools | 2022 | `winget install Microsoft.VisualStudio.2022.BuildTools` → in the installer, tick **"Desktop development with C++"** (MSVC + Windows SDK) | `where link` in a "Developer PowerShell" |
| Rust (rustup) | 1.95.0 | `winget install Rustlang.Rustup`, then `rustup toolchain install 1.95.0` and `rustup default 1.95.0` | `rustc --version` → 1.95.0 |
| Zig | **0.16.0** exactly | `winget install zig.zig` (check the version) or the zip from ziglang.org, folder added to `PATH` | `zig version` → 0.16.0 |
| LLVM (libclang) | current | `winget install LLVM.LLVM`, then `setx LIBCLANG_PATH "C:\Program Files\LLVM\bin"` | `clang --version` |
| just | current | `winget install Casey.Just` (or `cargo install just`) | `just --version` |

Rust must use the **MSVC** toolchain (the default on Windows): `rustup show` says `x86_64-pc-windows-msvc`.
Rust 要用 **MSVC** 版（Windows 預設就是）。

---

## 2. Herdr core (`hc`) / Herdr core

```powershell
git clone --recurse-submodules https://github.com/herdrdev/herdr-core.git
cd herdr-core
git checkout v0.1.19          # the tag you build / 要 build 的版本
git submodule update --init --recursive
```

**jay's patches / jay 的修改**: look in this repo's [`patches/`](../patches/). If there is `patches\herdr-core\<tag>\`,
check out exactly that tag and apply them (see [patches/README.md](../patches/README.md)):

```powershell
git am <path to herdr-jay>\patches\herdr-core\v0.1.19\*.patch
```

No `patches\herdr-core` folder = no changes: build the official tag as is. (Today there are none.)
沒有 `patches\herdr-core` 資料夾＝沒有修改，直接 build 官方版（目前沒有）。

Build and install:

```powershell
just install
```

This builds `herdr-core.exe`, downloads Microsoft's ConPTY (`conpty.dll`, from github.com/microsoft/terminal releases),
installs both into `%LOCALAPPDATA%\Programs\herdr-core`, adds that folder to your `PATH`, and makes `hc.exe` there
if you had no `hc` yet.
會 build `herdr-core.exe`、從微軟的 GitHub 下載 ConPTY、裝到 `%LOCALAPPDATA%\Programs\herdr-core`、加進 `PATH`。

**If the company blocks that download / 公司擋下載的話**: do it by hand. Herdr core still works with Windows' own
ConPTY (some keys that agents answer may act up):
手動裝，core 會改用 Windows 內建的 ConPTY（agent 有些按鍵回應可能怪怪的）：

```powershell
cargo build --release --locked
$d = "$env:LOCALAPPDATA\Programs\herdr-core"
New-Item -ItemType Directory -Force $d
Copy-Item target\release\herdr-core.exe $d
Copy-Item target\release\herdr-core.exe "$d\hc.exe"
[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path","User") + ";$d", "User")
```

Check (new PowerShell): `hc --version`.

---

## 3. Herdr app / Herdr app

```powershell
git clone --recurse-submodules https://github.com/herdrdev/herdr-app.git
cd herdr-app
git checkout v0.1.13
git submodule update --init --recursive
```

Patches: same as above, with `patches\herdr-app\<tag>\` (today there are none).

```powershell
just install
```

Installs to `%LOCALAPPDATA%\Programs\herdr-app`, adds it to `PATH`, and puts **Herdr** in the Start menu.
裝到 `%LOCALAPPDATA%\Programs\herdr-app`，開始選單會有 **Herdr**。

Check (new PowerShell): `herdr-app status`. Open Herdr once from the Start menu: it creates its home folder
`%USERPROFILE%\.config\herdr-app` (with `keys.json`, `settings.json`, `mods\`).
先從開始選單打開 Herdr 一次，它會建立設定目錄 `%USERPROFILE%\.config\herdr-app`。

---

## 4. Neovim and the other tools / Neovim 和其他工具

jay-nvim does **not** install Neovim: install it yourself, once.
jay-nvim **不會**幫你裝 Neovim，要自己裝一次。

- **Neovim ≥ 0.10** on `PATH`, any one of:
  - `winget install Neovim.Neovim`
  - `scoop install neovim`
  - the `.msi` from <https://github.com/neovim/neovim/releases> (blocked? ask IT / the software center for "Neovim")

  Check (new PowerShell): `nvim --version` → first line `NVIM v0.10` or newer.
- `git`: from step 1. `hc`: from step 2.
- Optional, for go-to-definition / errors (skip if Node or Python are not allowed; jay-nvim works without them)
  選用（LSP：跳到定義、顯示錯誤），公司不准裝 Node / Python 就跳過：
  - Python: `npm i -g pyright` and `pip install ruff`
  - TypeScript: `npm i -g typescript-language-server`; it only starts in a project that has
    `node_modules\typescript` (`npm i -D typescript` in the project).

---

## 5. Install herdr-jay / 安裝 herdr-jay

1. Get this repo: `git clone https://github.com/jayweihung/herdr-jay.git`
   (or on GitHub: **Code → Download ZIP**, then unzip). It is only text files.
2. Copy the two mod folders into Herdr's home / 把兩個資料夾複製到 Herdr 設定目錄：

   ```powershell
   $h = "$env:USERPROFILE\.config\herdr-app"
   Copy-Item -Recurse -Force herdr-jay\mods\jay-nvim, herdr-jay\mods\jay-nvim-pick "$h\mods\"
   ```

   (If you set `HERDR_APP_HOME` or `XDG_CONFIG_HOME`, the home is there instead; `herdr-app status` shows it.)
3. Add the keys / 加按鍵: open `%USERPROFILE%\.config\herdr-app\keys.json` (`notepad $h\keys.json`).
   Put these two lines right after the line `"global": {` (each ends with a comma, so the line after them still works):
   把這兩行加在 `"global": {` 那一行的正下方（兩行後面都有逗號，下面原本的按鍵不受影響）：

   ```json
   "ctrl-shift-i": "mod.open:jay-nvim",
   "ctrl-shift-j": "mod.open:jay-nvim-pick",
   ```

   If `keys.json` does not exist yet, open Herdr once (step 3). Save: Herdr reloads `keys.json` by itself.
4. Check the mods / 檢查：

   ```powershell
   herdr-app check "$h\mods\jay-nvim"
   herdr-app check "$h\mods\jay-nvim-pick"
   ```

   Both should say `Check passed`.

---

## 6. Try it / 試用

1. In Herdr, open a terminal pane in a project folder (start your agent there if you use one).
2. `ctrl-shift-i` → Neovim opens on the right with a file tree.
3. `ctrl-shift-j` → jumps to that nvim and lists the files the agent read or edited (Claude Code).
   Inside nvim, `space` then `o` does the same.
4. Comment a line: `space a c`, then send all comments to the agent: `space a s`.

`ctrl-shift-i` 開 nvim；`ctrl-shift-j` 跳到 nvim 並列出 agent 動過的檔案；nvim 裡 `空白鍵 a c` 加註解、`空白鍵 a s` 送給 agent。

---

## 7. When something goes wrong / 出問題時

| What you see / 看到什麼 | Why / 原因 | Fix / 怎麼修 |
|---|---|---|
| `ctrl-shift-i` does nothing | key not added, or a typo in `keys.json` | check the commas in `keys.json`; `herdr-app check` |
| A pane opens and closes / "nvim" not found | `nvim` not on `PATH` for Herdr | `nvim --version` in a new PowerShell; then **quit and reopen Herdr** |
| "jay-nvim 開不起來" notification | could not write `mods\jay-nvim\.init.lua` | the home folder must be writable; copy the message to jay |
| "找不到 hc" in nvim | `hc` not on `PATH` | `hc --version`; redo step 2; reopen Herdr |
| Files list empty | the agent is not Claude Code, or it has not read/edited files yet | following the agent works with Claude Code only |
| Herdr says core is missing / too old | core not installed or older than the app wants | step 2 again, then reopen Herdr |
| Build: `libclang` not found | LLVM missing or `LIBCLANG_PATH` unset | step 1, LLVM row; new PowerShell |
| Build: `link.exe` not found | VS Build Tools without C++ | step 1, tick "Desktop development with C++" |
| Build: zig errors | wrong Zig version | `zig version` must be 0.16.0 |

Anything else: copy the exact error text (a photo is fine) and bring it home to jay's Mac.
其他狀況：把錯誤訊息原文抄下來（拍照也行）帶回家。

---

## 8. Updating / 更新

When you update Herdr (new tag), take the matching herdr-jay tag `for-herdr-<that version>` if there is one,
otherwise the newest herdr-jay `main`; re-check `patches\` for that tag; copy the two mod folders again
(step 5.2) and run `herdr-app check`. `keys.json` stays as you left it.
更新 Herdr 時：用對應版本的 herdr-jay（沒有就用最新的 main），看 `patches\`，重新複製兩個 mod 資料夾，跑 `herdr-app check`。
