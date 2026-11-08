# Herdr + herdr-jay on Windows / 在 Windows 上用

Build Herdr from the official source (plus jay's text patches), then copy two mod folders.
This repo holds only text; the build runs the official projects' own `just install` (PowerShell installers).
If your company blocks scripts, every `just install` below has a **by hand** version.
Commands are for **PowerShell**. Checked against Herdr app v0.1.14 and core v0.1.19. Not yet run on a real Windows PC.
從官方原始碼 build Herdr（加上 jay 的文字補丁），再複製兩個 mod 資料夾。指令都在 **PowerShell** 打。
公司擋腳本的話，每個 `just install` 下面都有「手動」做法。

| Step / 步驟 | |
|---|---|
| [0](#0-before-you-start--開始前) | Before you start: folder, long paths, admin, network / 開始前 |
| [1](#1-build-tools--build-工具一次) | Build tools (once) / build 工具 |
| [2](#2-herdr-core-hc) | Herdr core (`hc`) |
| [3](#3-herdr-app) | Herdr app |
| [4](#4-neovim) | Neovim (≥ 0.11) and optional LSP tools |
| [5](#5-install-herdr-jay--安裝-herdr-jay) | Install herdr-jay: copy two folders, add two keys |
| [6](#6-test-checklist--實測清單) | Test checklist (15 min) / 實測清單 |
| [7](#7-when-something-goes-wrong--出問題時) | When something goes wrong / 出問題時 |
| [8](#8-updating--更新) | Updating / 更新 |

**PATH**: installers and `setx` change only *new* windows. After each install, open a **new PowerShell** fresh
from the Start menu: a new tab in an open VS Code terminal or in an already running Windows Terminal keeps the old PATH.
Herdr started from the Start menu afterwards sees the new PATH too.
裝完東西後要從開始選單開**新的 PowerShell** 才看得到（已開著的 VS Code / Windows Terminal 開新分頁不算）。

**`herdr-app` prints after the prompt**: it is a windowed program, so PowerShell doesn't wait for it.
Add `| Out-Host` (as below) to see its output in order.
`herdr-app` 的輸出會跑到提示字元後面，後面加 `| Out-Host` 就正常。


A **Linux server** to work on over ssh (agents there, jay-nvim there): after this guide, see
[docs/linux-remote.md](linux-remote.md).
An agent doing the install for you: [docs/agent-install.md](agent-install.md).

---

## 0. Before you start / 開始前

**Official Herdr installed? / 裝過官方版 Herdr？** Quit it, stop its core (quitting the app leaves the core and
its terminals running, and Windows can't delete a running program; this **ends those terminals**), then delete it
and its Start-menu entry:
先關掉官方版 Herdr，停掉它的 core（會結束那些終端機），再刪掉：

```powershell
hc server stop
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Programs\herdr-app*", "$env:LOCALAPPDATA\Programs\herdr-core*"
Remove-Item "$([Environment]::GetFolderPath('Programs'))\Herdr.lnk" -ErrorAction SilentlyContinue
Test-Path "$env:LOCALAPPDATA\Programs\herdr-core\herdr-core.exe"     # must be False
```

(If `Test-Path` says True, something still runs it: sign out and in, then delete again.)

**Git first / 先裝 Git**: everything below uses it. `winget install Git.Git --scope user` (no admin), or the company
software center; then open a **new PowerShell** and check `git --version`.

winget notes: `winget` not found → install "App Installer" from the Microsoft Store, or use each tool's own
installer / the company software center. First run asks to accept terms: add
`--accept-source-agreements --accept-package-agreements`.
找不到 `winget`：從 Microsoft Store 裝「App Installer」，或用各工具自己的安裝程式／公司軟體中心。

**Admin rights / 管理員權限**: Visual Studio Build Tools need admin (or IT / the software center); LLVM too, unless you
use LLVM's no-admin release archive.
Everything else here can be installed per user. No admin → ask IT for
"Visual Studio 2022 Build Tools with **Desktop development with C++**" and "LLVM".
沒有管理員權限：請 IT 裝「Visual Studio 2022 Build Tools（勾 Desktop development with C++）」和「LLVM」。

**Network / 網路**: installing and building downloads from these hosts.
If something is blocked, give IT this list. Behind a proxy: `setx HTTPS_PROXY http://proxy:port` (new windows; the ConPTY download uses the system proxy instead).
安裝和 build 時會從這些網站下載；被擋就把清單給 IT。

- `github.com`, `codeload.github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`
  (Herdr, Ghostty, git dependencies, ConPTY, Neovim / LLVM downloads)
- `cdn.winget.microsoft.com`, `aka.ms`, `download.visualstudio.microsoft.com` (winget, Visual Studio Build Tools)
- `win.rustup.rs`, `static.rust-lang.org` (rustup, Rust), `index.crates.io`, `static.crates.io` (Rust libraries)
- `deps.files.ghostty.org`, `ziglang.org` (Zig packages)
- optional LSP tools (step 4): `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`

**Time and disk / 時間和空間**: the first build of each repo takes a long time (tens of minutes on a laptop)
and several GB. Windows Defender scanning makes it much slower: ask IT to exclude `%USERPROFILE%\src`
`%USERPROFILE%\.cargo` and `%USERPROFILE%\.rustup` if allowed.

**One short folder for everything / 全部放一個短路徑**: not under OneDrive or Documents (Windows' 260-character limit).

```powershell
git config --global core.longpaths true
git config --global http.sslBackend schannel        # company TLS inspection: use Windows' certificate store
New-Item -ItemType Directory -Force "$env:USERPROFILE\src" | Out-Null
```

Get herdr-jay now (step 2 needs its `patches`) / 先抓 herdr-jay（第 2 步要用）:

```powershell
Set-Location "$env:USERPROFILE\src"
git clone https://github.com/jayweihung/herdr-jay.git
```

Or on GitHub **Code → Download ZIP**, extract into `%USERPROFILE%\src` and rename the folder that directly contains
`mods` and `docs` to `herdr-jay` (Explorer's "Extract All" nests it: `herdr-jay-main\herdr-jay-main`; take the inner one).
Check / 檢查:

```powershell
Test-Path "$env:USERPROFILE\src\herdr-jay\mods"          # must be True
```

Every block below sets the folders it uses, so it works in any new window (except where it says "same window").

---

## 1. Build tools / build 工具（一次）

Install them the way your company does; the versions are what matter (the build fails or differs without them):
用公司的方式裝；版本要對：

| Tool | Version / what | Check (new PowerShell) |
|---|---|---|
| Git for Windows | any recent | `git --version` |
| Visual Studio 2022 Build Tools | **Desktop development with C++** + a **Windows 11 SDK** | `link.exe` found by the build |
| Rust | **1.95.0**, MSVC (`x86_64-pc-windows-msvc`); for the Linux server's core also the target `x86_64-unknown-linux-musl` | `rustc --version` |
| Zig | **0.16.0** | `zig version` |
| LLVM (only for the app) | any recent, `LIBCLANG_PATH` = its `bin` | `Test-Path "$env:LIBCLANG_PATH\libclang.dll"` |
| just | any | `just --version` |

### Add a folder to PATH

Per user, no admin, adds it only once. Change the first line to the folder you are adding:

```powershell
$add = "$env:LOCALAPPDATA\Programs\nvim-win64\bin"
$k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Environment", $true)
$p = [string]$k.GetValue("Path", "", "DoNotExpandEnvironmentNames")
if (($p -split ";") -notcontains $add) { $k.SetValue("Path", (($p.TrimEnd(";"), $add) -join ";").TrimStart(";"), "ExpandString"); [Environment]::SetEnvironmentVariable("HERDR_JAY_X", "1", "User"); [Environment]::SetEnvironmentVariable("HERDR_JAY_X", $null, "User") }
$k.Close()
```

It keeps entries like `%USERPROFILE%\…` as they are; the last two calls on the long line only tell Explorer that
PATH changed (so new windows see it).

If PowerShell refuses ("method invocation is supported only on core types"), or simply to do it by hand:
`rundll32 sysdm.cpl,EditEnvironmentVariables` → your user **Path** → **New** → paste the folder → OK.
手動也可以：上面那個指令打開「環境變數」→ 使用者的 Path → 新增 → 貼上資料夾。

---

## 2. Herdr core (`hc`)

Install the core **before** the app: an app that finds no core offers to download the official one.
先裝 core 再裝 app。

```powershell
Set-Location "$env:USERPROFILE\src"
git clone --recurse-submodules --shallow-submodules https://github.com/herdrdev/herdr-core.git
Set-Location herdr-core
git checkout v0.1.19
git rev-parse --short HEAD                          # must be 06793ed (README versions table)
git submodule update --init --recursive
```

A fresh clone gets the right commit. An older clone: run `git fetch --tags --force` before `git checkout`.
舊的 clone 要先 `git fetch --tags --force`。

**jay's patches / jay 的修改** — there is one for core v0.1.19; apply it so the build is the same as jay's
(it matters on a Mac, harmless on Windows). `$j` = the herdr-jay folder from step 0:

```powershell
Set-Location "$env:USERPROFILE\src\herdr-core"
$j = "$env:USERPROFILE\src\herdr-jay"
$pd = "$j\patches\herdr-core\v0.1.19"
$ps = @(Get-ChildItem "$pd\*.patch" -ErrorAction SilentlyContinue | Sort-Object Name).FullName
if ($ps) { git -c user.name=me -c user.email=me@local am -3 $ps } else { "no patches" }
```

If `git am` stops with an error: `git am --abort` and bring the message to jay.

Build and install:

```powershell
Set-Location "$env:USERPROFILE\src\herdr-core"
just install
```

It builds `herdr-core.exe`, downloads Microsoft's ConPTY (`conpty\conpty.dll` + `conpty\x64\OpenConsole.exe`, pinned and
hash-checked), installs into `%LOCALAPPDATA%\Programs\herdr-core`, adds that to PATH, and makes `hc.exe` (a hard link)
if you had no `hc`. No admin needed.

**Check** (new PowerShell): `hc --version` → `hc 0.1.19`.
`Test-Path "$env:LOCALAPPDATA\Programs\herdr-core\conpty\conpty.dll"` → `True` = Microsoft's ConPTY in use.

**Never run plain `hc update`** (without `--from`): it replaces this build with the official one. Update as in [step 8](#8-updating--更新).
**不要跑 `hc update`**，會換回官方版。

### If `just install` fails / `just install` 失敗時

- **ConPTY download blocked**: get `Microsoft.Windows.Console.ConPTY.1.24.260710001.nupkg` from
  github.com/microsoft/terminal releases (tag `v1.24.11911.0`) some other way, copy it to
  `"$([IO.Path]::GetTempPath())hc-conpty-1.24.260710001.zip"` (that exact name; e.g.
  `Copy-Item <file> "$([IO.Path]::GetTempPath())hc-conpty-1.24.260710001.zip"`), and run `just install` again: the script uses it and
  still checks its hash.
- **"running scripts is disabled on this system"**, or no ConPTY at all — by hand.
  The core then uses Windows' own ConPTY, which drops some terminal answers (programs may act up a little):

```powershell
Set-Location "$env:USERPROFILE\src\herdr-core"
cargo build --release --locked
$d = "$env:LOCALAPPDATA\Programs\herdr-core"
New-Item -ItemType Directory -Force $d | Out-Null
Copy-Item -Force target\release\herdr-core.exe $d
if (-not (Test-Path "$d\hc.exe")) { New-Item -ItemType HardLink -Path "$d\hc.exe" -Target "$d\herdr-core.exe" | Out-Null }
```

Then add it to PATH: [Add to PATH](#add-a-folder-to-path) with the first line `$add = "$env:LOCALAPPDATA\Programs\herdr-core"`.
Later updates by hand, while it runs: `hc update --from target\release\herdr-core.exe` (terminals kept).

---

## 3. Herdr app

```powershell
Set-Location "$env:USERPROFILE\src"
git clone --recurse-submodules --shallow-submodules https://github.com/herdrdev/herdr-app.git
Set-Location herdr-app
git checkout v0.1.14
git rev-parse --short HEAD                          # must be 2405bf3 (README versions table)
git submodule update --init --recursive
$j = "$env:USERPROFILE\src\herdr-jay"
$pd = "$j\patches\herdr-app\v0.1.14"                # none today
$ps = @(Get-ChildItem "$pd\*.patch" -ErrorAction SilentlyContinue | Sort-Object Name).FullName
if ($ps) { git -c user.name=me -c user.email=me@local am -3 $ps } else { "no patches" }
```

As in step 2: an older clone needs `git fetch --tags --force` before `git checkout`.

```powershell
Set-Location "$env:USERPROFILE\src\herdr-app"
just install
```

Installs `%LOCALAPPDATA%\Programs\herdr-app`, adds it to PATH, and puts **Herdr** in the Start menu. No admin needed.

**By hand** (scripts blocked): quit Herdr first if it runs.

```powershell
Set-Location "$env:USERPROFILE\src\herdr-app"
cargo build --release --locked
$a = "$env:LOCALAPPDATA\Programs\herdr-app"
New-Item -ItemType Directory -Force $a | Out-Null
Copy-Item -Force target\release\herdr-app.exe $a
```

Add it to PATH: [Add to PATH](#add-a-folder-to-path) with the first line `$add = "$env:LOCALAPPDATA\Programs\herdr-app"`. No Start-menu entry this way: right-click
`herdr-app.exe` in Explorer → **Pin to Start**, and open Herdr from that pin (below: "from the Start menu").

**Check**: `herdr-app --version | Out-Host` → `herdr-app 0.1.14`. Then open **Herdr** once from the Start menu:
it creates `%USERPROFILE%\.config\herdr-app` with `keys.json`, `settings.json` and `mods\`.
先從開始選單打開 Herdr 一次，它會建立設定目錄。

---

## 4. Neovim

jay-nvim does **not** install Neovim. It needs **Neovim 0.11 or newer** on PATH. Any one of:
jay-nvim 不會幫你裝 Neovim，要 **0.11 以上**：

- `winget install Neovim.Neovim` (an MSI for all users: may need admin)
- `scoop install neovim` (per user; needs scoop, which itself needs scripts allowed)
- no admin, no winget: download `nvim-win64.zip` from <https://github.com/neovim/neovim/releases>, unzip it with
  `Expand-Archive -Force "$env:USERPROFILE\Downloads\nvim-win64.zip" "$env:LOCALAPPDATA\Programs"` (or wherever your browser saved it; gives
  `nvim-win64\bin\nvim.exe`; not Explorer's "Extract All", which adds an extra folder level), and add
  `%LOCALAPPDATA%\Programs\nvim-win64\bin` to PATH ([Add to PATH](#add-a-folder-to-path))
- or IT / the software center ("Neovim")

**Check** (new PowerShell): `nvim --version` → first line `NVIM v0.11` or newer.

**Claude Code**: `claude --version` must work in a new PowerShell (it needs Git for Windows from step 0).
If it is missing, install it the way your company allows.
`claude --version` 要能跑；沒有就照公司允許的方式裝。

Optional, for go-to-definition and errors (skip if Node or Python are not allowed; jay-nvim works without them)
選用（LSP），公司不准裝 Node / Python 就跳過：

- Python: `npm i -g pyright`, `py -m pip install --user ruff` (then `ruff --version` must work in a new PowerShell; if not, add pip's
  `Scripts` folder to PATH)
- TypeScript: `npm i -g typescript-language-server`; it starts only in projects that have `node_modules\typescript`

---

## 5. Install herdr-jay / 安裝 herdr-jay

1. herdr-jay is already in `%USERPROFILE%\src\herdr-jay` (step 0).
2. Copy the two mod folders:

   ```powershell
   $j = "$env:USERPROFILE\src\herdr-jay"
   Test-Path "$j\mods\jay-nvim\mod.json"          # must be True; otherwise fix $j
   $h = "$env:USERPROFILE\.config\herdr-app"
   New-Item -ItemType Directory -Force "$h\mods" | Out-Null
   Copy-Item -Recurse -Force "$j\mods\jay-nvim", "$j\mods\jay-nvim-pick" "$h\mods\"
   Set-Content -Encoding ascii "$h\mods\jay-nvim\.herdr-jay" (git -C $j describe --tags --always --match "for-herdr-v*-r*")   # which herdr-jay you copied
   ```

   Got herdr-jay as a ZIP (no git)? Use this instead for the last line:
   `Set-Content -Encoding ascii "$h\mods\jay-nvim\.herdr-jay" "zip $(Get-Date -Format yyyy-MM-dd)"`

   (A different home only if you set `HERDR_APP_HOME` or `XDG_CONFIG_HOME`.)
3. Add the keys / 加按鍵:

   ```powershell
   notepad "$env:USERPROFILE\.config\herdr-app\keys.json"
   ```

   Find the line `  "global": {` and paste these two lines **directly under it** (keep the quotes and commas), then save (Ctrl+S):
   找到 `"global": {` 那一行，把下面兩行貼在它**正下方**（引號、逗號都要），存檔：

   ```json
   "ctrl-shift-i": "mod.open:jay-nvim",
   "ctrl-shift-j": "mod.open:jay-nvim-pick",
   ```

   Herdr reloads `keys.json` by itself. Once you edit it, new Herdr versions no longer add their new default keys:
   [docs/keys.md](keys.md) lists them per release.
4. Check / 檢查 → both print `check passed: ...`:

   ```powershell
   $h = "$env:USERPROFILE\.config\herdr-app"
   herdr-app check "$h\mods\jay-nvim" | Out-Host
   herdr-app check "$h\mods\jay-nvim-pick" | Out-Host
   ```

### 5a. Snap hook for Claude Code / snap hook

Lets jay-nvim mark what a Bash command changed in a file **outside** a git repo ([nvim.md §7](nvim.md#7-snapshots-for-bash-edits-optional--bash-改檔的快照選用)).
Do it during §6 (step 3 sends you here): jay-nvim's first start (§6 step 2) writes `<home>\.config\jay-nvim\snap_hook.lua`. `<home>` is
the **first** folder §6 step 3 prints (`vim.uv.os_homedir()`): usually `C:\Users\<you>`, but a company may set it to
another drive (e.g. `H:\`); use that one below.
jay-nvim 開過一次後，在 Claude Code 設定加這個 hook（一次就好，之後 jay-nvim 會自己更新 hook 檔）。

1. Back up `%USERPROFILE%\.claude\settings.json` (if it exists).
2. Merge into it (keep everything else; if `"hooks"` already has `"PreToolUse"`, add this entry to that list).
   Write `<home>` in full with forward slashes (no `~`, no `%…%`). The matcher also names `PowerShell` because
   Claude Code on Windows may run commands with its PowerShell tool instead of Bash:

   ```json
   "hooks": {
     "PreToolUse": [
       { "matcher": "Bash|PowerShell", "hooks": [{ "type": "command", "timeout": 15,
         "onFailure": "continue",
         "command": "nvim -l <home>/.config/jay-nvim/snap_hook.lua" }] }
     ]
   }
   ```

   e.g. `"nvim -l C:/Users/amy/.config/jay-nvim/snap_hook.lua"`. `"onFailure": "continue"` keeps a failed start
   of nvim from blocking commands (older Claude Code ignores it).
   `nvim` not found by the hook → write nvim.exe's full path (`where.exe nvim`) with forward slashes, e.g.
   `C:/Users/amy/AppData/Local/Programs/nvim-win64/bin/nvim.exe -l …`. A path with a space (winget's
   `C:/Program Files/Neovim/…`): Claude Code runs hook commands in Git Bash if it finds it, otherwise PowerShell, and
   the two quote differently; use the no-shell form instead (newer Claude Code): `"command": "C:/Program Files/Neovim/bin/nvim.exe"`,
   `"args": ["-l", "<home>/.config/jay-nvim/snap_hook.lua"]`.
3. Restart Claude Code (or `/hooks` once). **Check**: §6 step 7 — after Claude changes a file outside the repo with
   a shell command, `<home>\.cache\jay-nvim\snap\` has a new folder and nvim shows red / green.

---

## 6. Test checklist / 實測清單

About 15 minutes. What each step does is explained in [docs/nvim.md](nvim.md). If a step fails, take a photo of
the screen and of `:messages` in nvim, note the step number, go on.
大約 15 分鐘；哪一步失敗就拍照（含 nvim 的 `:messages`），記下第幾步，繼續下一步。

1. New PowerShell: `nvim --version`, `hc --version`, `git --version` → NVIM ≥ 0.11, `hc 0.1.19`, a git version.
2. In Herdr make a space for a git project (`ctrl-shift-n`, pick the folder); in a tab there run `claude`
   (no `cd` first). With that pane focused: `ctrl-shift-i` → nvim on the right in that pane's folder, file tree beside it, and
   `%USERPROFILE%\.config\herdr-app\mods\jay-nvim\.init.lua` exists.
3. In nvim: `:lua print(vim.uv.os_homedir(), vim.env.USERPROFILE)` → the same `C:\Users\<you>` twice.
   If the first is another drive (e.g. `H:\`), write it down. That first folder is `<home>`: now do
   [§5a](#5a-snap-hook-for-claude-code--snap-hook), then restart `claude` in the step-2 tab (or run `/hooks` there).
4. Tree: `.gitignore`d folders (e.g. `node_modules`) are missing; the open file's line is highlighted.
5. Ask Claude to read a file → within ~2 s nvim opens it, the bar on top shows `agent 讀`.
6. Ask Claude to edit a line → the file reloads, old line red `-`, new line green `+`, cursor there.
7. Ask Claude to change a repo file with a shell command (e.g. `sed -i`) → nvim follows it.
   Then a file **outside** the repo by absolute path → nvim should follow it too; note which path form Claude used
   (`C:\…`, `C:/…` or `/c/…`). With the snap hook (§5a): old lines red, new green, and
   `<home>\.cache\jay-nvim\snap\` (§5a) has a new folder. Without it the file just reloads.
8. In nvim `space o` → files Claude touched (newest first) plus git changes; pick one → it opens.
9. Focus Claude's pane, press `ctrl-shift-j` → focus jumps to nvim and the list opens. `Esc`, then `:set modified?`
   → `nomodified` (nothing typed into the file). Again from insert mode (`i` first).
10. `space a c` on a line, type `test`, Enter; `space a l` lists it; `space a s` → Claude gets one message, sent once.
11. Python file, pyright installed: first a note "pyright / TypeScript 沒啟動（K 不會顯示型別）：… 還沒信任" → `:JayTrust`, reopen the file
    (`:e`). Rest the mouse on a function name → a type popup after ~0.6 s. Right-click → the Chinese menu
    (Shift + right-click → Herdr's).
12. Put an error in the Python file → a message shows inline; `gd` on a name → jumps to its definition.
13. A second jay-nvim (another tab, same file): type in one → a yellow note "… 的 nvim 也開著這個檔".
14. `hc get <nvim pane>` (the address in Herdr, e.g. `t3`) → labels include `herdr.right-click=program`.
15. Bring jay the photos plus the lines of [8.0](#80-what-do-i-have--目前裝的是什麼).

---

## 7. When something goes wrong / 出問題時

nvim itself (follow, trust, LSP, comments): [docs/nvim.md → 8](nvim.md#8-when-something-goes-wrong--出問題時).
Here: install and Windows.

| What you see / 看到什麼 | Why / 原因 | Fix / 怎麼修 |
|---|---|---|
| `ctrl-shift-i` does nothing | key missing, or a typo in `keys.json` | with Herdr open: `herdr-app status \| Out-Host` shows keys.json errors; check quotes and commas |
| Error "nvim: not found on PATH" | Neovim not installed / not on PATH | step 4; `nvim --version` in a new PowerShell |
| Notification "jay-nvim 開不起來" | could not write `mods\jay-nvim\.init.lua` | the home folder must be writable; bring the message to jay |
| "找不到 hc" inside nvim | `hc` not on PATH | `hc --version`; step 2 |
| nvim never follows Claude | Claude started after a `cd`, or two Claudes in one folder | start Claude in the tab's own folder (step 6.2) |
| Herdr shows a core setup screen | no core found, or older than the app needs | **don't press Install / Update there** (it installs the official core); do step 2 (or 8), then reopen Herdr |
| "running scripts is disabled on this system" | company script policy | the **by hand** parts of steps 2 and 3 |
| "This app has been blocked" / herdr-app.exe or a build step won't start | AppLocker / WDAC / SmartScreen | ask IT to allow `%LOCALAPPDATA%\Programs\herdr-*`, `%USERPROFILE%\src\*\target`, `%TEMP%\hc-local-*` and `%TEMP%\hc-install-*` (the core install runs its script and the new exe from there), `%LOCALAPPDATA%\Programs\zig-*`, `%LOCALAPPDATA%\Programs\nvim-win64`, `%USERPROFILE%\.cargo\bin`, `%USERPROFILE%\.rustup\toolchains` (the real compilers), and if you used winget `%LOCALAPPDATA%\Microsoft\WinGet\Packages` + `…\WinGet\Links` (Zig, just); or use the by-hand part of step 2 (no `%TEMP%`) |
| Build: `libclang` not found | LLVM missing or `LIBCLANG_PATH` unset | step 1, LLVM row; new PowerShell |
| Build: `link.exe` not found | Build Tools without C++ | step 1, Build Tools row (C++ workload + Windows SDK) |
| Build: Zig errors | wrong Zig | `zig version` must be `0.16.0` |
| Build: path too long / file not found deep in `vendor` | 260-char limit | step 0: `core.longpaths`, short folder |
| Build: download / TLS errors | network blocked | step 0 host list to IT; `HTTPS_PROXY` |
| `SSL certificate problem: unable to get local issuer certificate` | company TLS inspection | `git config --global http.sslBackend schannel` |
| `CRYPT_E_NO_REVOCATION_CHECK` / "unable to check revocation" (git or cargo) | company TLS inspection | `git config --global http.schannelCheckRevoke false` and `setx CARGO_HTTP_CHECK_REVOKE false` (then a new PowerShell) |
| Build: "Failed to find fxc.exe" | Windows SDK missing | Visual Studio Installer → Modify → tick a **Windows 11 SDK** |

Anything else: copy the exact error text (a photo is fine) and bring it to jay.
其他狀況：把錯誤訊息原文抄下來（拍照也行）帶回家。

---

## 8. Updating / 更新

What gets updated, and where / 要更新的東西：

| What | Where it runs | How | When |
|---|---|---|---|
| herdr-jay | PC | `git pull` (8.1) | first, always |
| herdr-core | PC (Windows) **and** the Linux server | build the README tag + patches for both, install / copy (8.2, 8.3) | the README table names a new core |
| Herdr app | PC | build the README tag + patches (8.2) | the README table names a new app |
| jay-nvim mods | PC (they open nvim on the server too) | copy the two folders (8.4) | the CHANGELOG says **mods** |
| Neovim | PC and the server | new version (8.5) | only when the README says so (needs ≥ 0.11) |
| Claude Code snap hook | wherever jay-nvim runs | nothing: jay-nvim rewrites it | — |

Windows follows **herdr-jay**, never upstream directly: build only the versions in the
[README versions table](../README.md#versions--版本). How to know there is something new: the
[CHANGELOG](../CHANGELOG.md) (or `git -C "$env:USERPROFILE\src\herdr-jay" fetch; git -C "$env:USERPROFILE\src\herdr-jay" log --oneline HEAD..origin/main`);
each entry starts with what it **Needs**. Order: herdr-jay → core (PC, then server) → app → mods → keys, restart.
**Never plain `hc update`, never "Update herdr-core" in Herdr, never `hc machine update`** (they install official builds).
Windows 只跟 herdr-jay：只 build README 版本表裡的版本。順序：herdr-jay → core（PC，再 server）→ app → mod。

### 8.0 What do I have / 目前裝的是什麼

```powershell
$j = "$env:USERPROFILE\src\herdr-jay"; $h = "$env:USERPROFILE\.config\herdr-app"
hc --version
herdr-app --version | Out-Host
git -C $j describe --tags --always --match "for-herdr-v*-r*"
Get-Content "$h\mods\jay-nvim\.herdr-jay"
nvim --version | Select-Object -First 1
hc machine ls                                        # the server: connected, its version = hc --version
ssh <user>@<server> '~/.local/bin/herdr-core --version; ~/.local/bin/nvim --version | head -1'
```

Send these lines to jay when reporting a problem.

### 8.1 herdr-jay

```powershell
Set-Location "$env:USERPROFILE\src\herdr-jay"
git checkout main; git pull
```

If the README table names a tag for your Herdr (`for-herdr-v<app>-r<N>`), `git checkout <that tag>` (and
`git checkout main` before the next `git pull`). ZIP: delete the old folder, download again, rename to `herdr-jay`.

### 8.2 Core and app on the PC

Only if the README table lists a newer version. Order: **core** checkout block → its build block → [8.3](#83-core-on-the-linux-server)
(server) → **app** checkout block (`$repo = "herdr-app"`, the app version) → its build block.
In the first line replace `<version from the README table>` with that version (e.g. `v0.1.20`).
Paste each block with **Ctrl+V as one block** (not right-click, not line by line).
第一行換成 README 表裡的版本；整段用 Ctrl+V 一次貼上（不要右鍵、不要一行一行貼）。

```powershell
$repo = "herdr-core"; $tag = "<version from the README table>"     # then: $repo = "herdr-app"; $tag = "<app version>"
$j = "$env:USERPROFILE\src\herdr-jay"
$rd = "$j\patches\$repo"; $pd = "$rd\$tag"
if ((Test-Path $rd) -and -not (Test-Path $pd)) { "STOP: herdr-jay has no patches for $repo $tag yet: stay on your version" } else {
  Set-Location "$env:USERPROFILE\src\$repo"; git am --abort 2>$null; git fetch --tags --force; git checkout --force $tag
  git submodule update --init --recursive
  $ps = @(Get-ChildItem "$pd\*.patch" -ErrorAction SilentlyContinue | Sort-Object Name).FullName
  if ($ps) { git -c user.name=me -c user.email=me@local am -3 $ps } else { "no patches" } }
```

If it printed `STOP`, nothing changed: stay on your version. A version folder holding only `README.md` (no `.patch`
files) means jay checked that tag and it needs no patches: the block prints `no patches` and goes on.
If `git am` printed an error, **don't build**; see the rollback below.
印出 `STOP` 或 `git am` 出錯，就**不要** build。

For the app, also check it fits the core: `Get-Content distribution\core-version` must be ≤ `hc --version`.
Then, in the **same window** (it uses `$repo`):

```powershell
Set-Location "$env:USERPROFILE\src\$repo"
just install                                        # terminals keep running
```

Scripts blocked: core `cargo build --release --locked` then `hc update --from target\release\herdr-core.exe`;
app: quit Herdr, `cargo build --release --locked`, copy `target\release\herdr-app.exe` as in step 3.
**Check**: `hc --version` / `herdr-app --version | Out-Host` print the new versions.

Rollback (`git am` failed, or the new one misbehaves): `git am --abort`, rebuild the version you had (same block
with your old `$tag`), and bring the message to jay. Your old `$tag` is the number `hc --version` (core) or
`herdr-app --version` (app) printed, with a `v` in front, e.g. `$tag = "v0.1.19"`.

### 8.3 Core on the Linux server

Right after the PC's core, from the **same checkout** (so both are the same tag + patches): build herdr-core for
Linux (`x86_64-unknown-linux-musl`) and put it on the server as in
[linux-remote.md step 2](linux-remote.md#2-herdr-core-for-the-server-built-on-the-pc--server-的-core在-pc-上-build):
`~/.local/bin/herdr-core`, then `~/.local/bin/herdr-core server restart` (the server's terminals keep running).
**Check**: `hc machine ls` shows the server `connected`, same version as `hc --version`. Until both match, Herdr may
show it as `needs_update` and suggest `hc machine update`: **don't** run that (official build); copy yours.
PC 的 core 更新完，用同一份原始碼 build Linux 版，複製到 server；不要用 `hc machine update`。

### 8.4 Mods

Remove the old folders first so deleted files don't linger:

```powershell
$j = "$env:USERPROFILE\src\herdr-jay"; $h = "$env:USERPROFILE\.config\herdr-app"
Remove-Item -Recurse -Force "$h\mods\jay-nvim", "$h\mods\jay-nvim-pick" -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force "$j\mods\jay-nvim", "$j\mods\jay-nvim-pick" "$h\mods\"
Set-Content -Encoding ascii "$h\mods\jay-nvim\.herdr-jay" (git -C $j describe --tags --always --match "for-herdr-v*-r*")
herdr-app check "$h\mods\jay-nvim" | Out-Host
herdr-app check "$h\mods\jay-nvim-pick" | Out-Host
```

Nothing to copy to the server: jay-nvim hands nvim its Lua each time it opens a pane there. Already open nvim panes
keep the old version until you close and reopen them. If `check` fails, go back to your previous herdr-jay
(`git checkout <old tag or commit>`) and copy again.
server 不用複製：jay-nvim 每次開格子都把程式帶過去；開著的 nvim 要關掉重開才是新版。

### 8.5 Neovim

Only when the README says so (jay-nvim needs ≥ 0.11). PC: the same way you installed it (step 4: winget / scoop /
a new `nvim-win64.zip` over the old folder). Server: [linux-remote.md step 3](linux-remote.md#3-neovim-and-git-on-the-server--server-上的-neovim-和-git)
with the new tag (`rm -rf build .deps` first; from a pack: a new pack). **Check**: `nvim --version` on both.

### 8.6 Keys, then restart

If the new app version adds default keys, paste them from [docs/keys.md](keys.md). Quit and reopen Herdr.
