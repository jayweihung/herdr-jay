# Herdr + herdr-jay on Windows / 在 Windows 上用

Build Herdr from the official source (plus jay's text patches), then copy two mod folders.
This repo holds only text; the build runs the official projects' own `just install` (PowerShell installers).
If your company blocks scripts, every `just install` below has a **by hand** version.
Commands are for **PowerShell**. Checked against Herdr app v0.1.13 and core v0.1.19. Not yet run on a real Windows PC.
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
| [6](#6-try-it--試用) | Try it / 試用 |
| [7](#7-when-something-goes-wrong--出問題時) | When something goes wrong / 出問題時 |
| [8](#8-updating--更新) | Updating / 更新 |

**PATH**: installers and `setx` change only *new* windows. After each install, open a **new PowerShell**.
Herdr started from the Start menu afterwards sees the new PATH too.
裝完東西後要開**新的 PowerShell** 才看得到。

**`herdr-app` prints after the prompt**: it is a windowed program, so PowerShell doesn't wait for it.
Add `| Out-Host` (as below) to see its output in order.
`herdr-app` 的輸出會跑到提示字元後面，後面加 `| Out-Host` 就正常。

---

## 0. Before you start / 開始前

**Git first / 先裝 Git**: everything below uses it. `winget install Git.Git --scope user` (no admin), or the company
software center; then open a **new PowerShell** and check `git --version`.

**Admin rights / 管理員權限**: Visual Studio Build Tools need admin (or IT / the software center); LLVM too, unless you
use the no-admin download in step 1.
Everything else here can be installed per user. No admin → ask IT for
"Visual Studio 2022 Build Tools with **Desktop development with C++**" and "LLVM".
沒有管理員權限：請 IT 裝「Visual Studio 2022 Build Tools（勾 Desktop development with C++）」和「LLVM」。

**Network / 網路**: the build downloads source code and libraries (not programs) from these hosts.
If something is blocked, give IT this list. Behind a proxy: `setx HTTPS_PROXY http://proxy:port` (new windows; the ConPTY download uses the system proxy instead).
build 時會從這些網站下載；被擋就把清單給 IT。

- `github.com`, `codeload.github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`
  (Herdr, Ghostty, git dependencies, ConPTY, Neovim / LLVM downloads)
- `index.crates.io`, `static.crates.io` (Rust libraries), `static.rust-lang.org` (rustup)
- `deps.files.ghostty.org`, `ziglang.org` (Zig packages)

**Time and disk / 時間和空間**: the first build of each repo takes a long time (tens of minutes on a laptop)
and several GB. Windows Defender scanning makes it much slower: ask IT to exclude `%USERPROFILE%\src`
and `%USERPROFILE%\.cargo` if allowed.

**One short folder for everything / 全部放一個短路徑**: not under OneDrive or Documents (Windows' 260-character limit).

```powershell
git config --global core.longpaths true
New-Item -ItemType Directory -Force "$env:USERPROFILE\src" | Out-Null
```

Get herdr-jay now (step 2 needs its `patches`) / 先抓 herdr-jay（第 2 步要用）:

```powershell
Set-Location "$env:USERPROFILE\src"
git clone https://github.com/jayweihung/herdr-jay.git
```

Or on GitHub **Code → Download ZIP**, extract into `%USERPROFILE%\src` and rename the folder that directly contains
`mods` and `docs` to `herdr-jay`. Every block below sets the folders it uses, so it works in any new window.

---

## 1. Build tools / build 工具（一次）

| Tool / 工具 | Install (per user unless noted) | Check (new PowerShell) / 檢查 |
|---|---|---|
| Git for Windows | step 0 | `git --version` |
| Visual Studio 2022 Build Tools (**admin**) | `winget install Microsoft.VisualStudio.2022.BuildTools --override "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"` | see below |
| Rust | `winget install Rustlang.Rustup`, then **in a new PowerShell**: `rustup toolchain install 1.95.0` and `rustup default 1.95.0` | `rustc --version` → `rustc 1.95.0` |
| Zig **0.16.0** | `winget install zig.zig --version 0.16.0`, or unzip `zig-x86_64-windows-0.16.0.zip` from ziglang.org into `%LOCALAPPDATA%\Programs`, rename the folder `zig-x86_64-windows-0.16.0` to `zig` (it must directly contain `zig.exe`) and add `%LOCALAPPDATA%\Programs\zig` to PATH (see [Add to PATH](#add-a-folder-to-path)) | `zig version` → `0.16.0` |
| LLVM (only for the app; **admin**) | `winget install LLVM.LLVM`, then `setx LIBCLANG_PATH "C:\Program Files\LLVM\bin"` | `Test-Path "$env:LIBCLANG_PATH\libclang.dll"` → `True` |
| just | `winget install Casey.Just` | `just --version` |

Build Tools check: this prints a folder; nothing printed = the C++ part is missing
(open **Visual Studio Installer** → Modify → tick **Desktop development with C++**):

```powershell
& "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
```

LLVM without admin: download `clang+llvm-<version>-x86_64-pc-windows-msvc.tar.xz` from
<https://github.com/llvm/llvm-project/releases>, extract it (`tar -xf <file>`) into `%LOCALAPPDATA%\Programs`, and
`setx LIBCLANG_PATH "<that folder>\bin"`.

winget notes: `winget` not found → install "App Installer" from the Microsoft Store, or use each tool's own
installer / the company software center. First run asks to accept terms: add
`--accept-source-agreements --accept-package-agreements`.

Rust must be the **MSVC** kind (the Windows default): `rustup show` lists `x86_64-pc-windows-msvc`.

### Add a folder to PATH

Per user, no admin, adds it only once. Change the first line to the folder you are adding:

```powershell
$add = "$env:LOCALAPPDATA\Programs\zig"
$p = [Environment]::GetEnvironmentVariable("Path", "User")
if (("$p" -split ";") -notcontains $add) { [Environment]::SetEnvironmentVariable("Path", (("$p".TrimEnd(";"), $add) -join ";").TrimStart(";"), "User") }
```

If PowerShell refuses ("method invocation is supported only on core types"), or simply to do it by hand:
`rundll32 sysdm.cpl,EditEnvironmentVariables` → your user **Path** → **New** → paste the folder → OK.
手動也可以：上面那個指令打開「環境變數」→ 使用者的 Path → 新增 → 貼上資料夾。

---

## 2. Herdr core (`hc`)

Install the core **before** the app: an app that finds no core offers to download the official one.
先裝 core 再裝 app。

```powershell
Set-Location "$env:USERPROFILE\src"
git clone --recurse-submodules https://github.com/herdrdev/herdr-core.git
Set-Location herdr-core
git checkout v0.1.19
git submodule update --init --recursive
```

**jay's patches / jay 的修改** — there is one for core v0.1.19; apply it so the build is the same as jay's
(it matters on a Mac, harmless on Windows). `$j` = the herdr-jay folder from step 0:

```powershell
$j = "$env:USERPROFILE\src\herdr-jay"
$pd = "$j\patches\herdr-core\v0.1.19"
if (Test-Path $pd) { git -c user.name=me -c user.email=me@local am (Get-ChildItem "$pd\*.patch" | Sort-Object Name).FullName } else { "no patches" }
```

If `git am` stops with an error: `git am --abort` and bring the message to jay.

Build and install:

```powershell
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
  `$env:TEMP\hc-conpty-1.24.260710001.zip` (that exact name), and run `just install` again: the script uses it and
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
git clone --recurse-submodules https://github.com/herdrdev/herdr-app.git
Set-Location herdr-app
git checkout v0.1.13
git submodule update --init --recursive
$j = "$env:USERPROFILE\src\herdr-jay"
$pd = "$j\patches\herdr-app\v0.1.13"            # none today
if (Test-Path $pd) { git -c user.name=me -c user.email=me@local am (Get-ChildItem "$pd\*.patch" | Sort-Object Name).FullName } else { "no patches" }
```

```powershell
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
`herdr-app.exe` in Explorer → **Pin to Start**.

**Check**: `herdr-app --version | Out-Host` → `herdr-app 0.1.13`. Then open **Herdr** once from the Start menu:
it creates `%USERPROFILE%\.config\herdr-app` with `keys.json`, `settings.json` and `mods\`.
先從開始選單打開 Herdr 一次，它會建立設定目錄。

---

## 4. Neovim

jay-nvim does **not** install Neovim. It needs **Neovim 0.11 or newer** on PATH. Any one of:
jay-nvim 不會幫你裝 Neovim，要 **0.11 以上**：

- `winget install Neovim.Neovim` (an MSI for all users: may need admin)
- `scoop install neovim` (per user; needs scoop, which itself needs scripts allowed)
- no admin, no winget: download `nvim-win64.zip` from <https://github.com/neovim/neovim/releases>, unzip into
  `%LOCALAPPDATA%\Programs` (gives `nvim-win64\bin\nvim.exe`), add `%LOCALAPPDATA%\Programs\nvim-win64\bin` to PATH
- or IT / the software center ("Neovim")

**Check** (new PowerShell): `nvim --version` → first line `NVIM v0.11` or newer.

Optional, for go-to-definition and errors (skip if Node or Python are not allowed; jay-nvim works without them)
選用（LSP），公司不准裝 Node / Python 就跳過：

- Python: `npm i -g pyright`, `pip install ruff` (then `ruff --version` must work in a new PowerShell; if not, add pip's
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
   ```

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

   Herdr reloads `keys.json` by itself. Note: once you edit it, new Herdr versions no longer add their new default keys
   to it for you.
4. Check / 檢查 → both print `check passed: ...`:

   ```powershell
   $h = "$env:USERPROFILE\.config\herdr-app"
   herdr-app check "$h\mods\jay-nvim" | Out-Host
   herdr-app check "$h\mods\jay-nvim-pick" | Out-Host
   ```

---

## 6. Try it / 試用

1. In Herdr, make a space for your project (`ctrl-shift-n`, pick the project folder); new tabs there (`ctrl-shift-t`)
   start in that folder. Run your agent there.
   nvim opens in the folder the focused pane was *started* in; a later `cd` in PowerShell doesn't move it.
   請在專案資料夾開終端機再跑 agent；PowerShell 裡後來 `cd` 不算。
2. With the agent's pane focused: `ctrl-shift-i` → Neovim on the right, file tree beside it.
3. `ctrl-shift-j` → jumps to that nvim and lists the files the agent read or edited (Claude Code). In nvim: `space` `o`.
4. Comment a line: `space a c`. Send all comments to the agent: `space a s`.

`ctrl-shift-i` 開 nvim；`ctrl-shift-j` 列出 agent 動過的檔案；`空白鍵 a c` 加註解、`空白鍵 a s` 送給 agent。

---

## 7. When something goes wrong / 出問題時

| What you see / 看到什麼 | Why / 原因 | Fix / 怎麼修 |
|---|---|---|
| `ctrl-shift-i` does nothing | key missing, or a typo in `keys.json` | with Herdr open: `herdr-app status \| Out-Host` shows keys.json errors; check quotes and commas |
| Error "nvim: not found on PATH" | Neovim not installed / not on PATH | step 4; `nvim --version` in a new PowerShell |
| Lua error about `vim.lsp.config` or `vim.system` | Neovim older than 0.11 | install a newer one (step 4) |
| Notification "jay-nvim 開不起來" | could not write `mods\jay-nvim\.init.lua` | the home folder must be writable; bring the message to jay |
| "找不到 hc" inside nvim | `hc` not on PATH | `hc --version`; step 2 |
| nvim never follows the agent / files list shows only git | agent isn't Claude Code, or nothing read yet, or two Claude Codes in one folder | following works with Claude Code; one per folder |
| Herdr shows a core setup screen | no core found, or older than the app needs | **don't press Install / Update there** (it installs the official core); do step 2 (or 8), then reopen Herdr |
| "running scripts is disabled on this system" | company script policy | the **by hand** parts of steps 2 and 3 |
| Build: `libclang` not found | LLVM missing or `LIBCLANG_PATH` unset | step 1, LLVM row; new PowerShell |
| Build: `link.exe` not found | Build Tools without C++ | step 1, vswhere check |
| Build: Zig errors | wrong Zig | `zig version` must be `0.16.0` |
| Build: path too long / file not found deep in `vendor` | 260-char limit | step 0: `core.longpaths`, short folder |
| Build: download / TLS errors | network blocked | step 0 host list to IT; `HTTPS_PROXY` |

Anything else: copy the exact error text (a photo is fine) and bring it to jay.
其他狀況：把錯誤訊息原文抄下來（拍照也行）帶回家。

---

## 8. Updating / 更新

Order: core, then app, then the mods. **Never plain `hc update`** (it installs the official core over yours).
順序：core → app → mod。不要用 `hc update`。

1. herdr-jay (ZIP: download again into the same folder):

   ```powershell
   Set-Location "$env:USERPROFILE\src\herdr-jay"
   git checkout main; git pull
   git checkout for-herdr-v0.1.20        # only if that tag exists for your new Herdr; otherwise stay on main
   ```

2. herdr-core first, then herdr-app. Each has **its own** new tag (core and app versions differ). Set the two lines at
   the top, run, then again for the other repo:

   ```powershell
   $repo = "herdr-core"; $tag = "v0.1.20"              # then: $repo = "herdr-app"; $tag = "<app tag>"
   $j = "$env:USERPROFILE\src\herdr-jay"
   Set-Location "$env:USERPROFILE\src\$repo"
   git fetch --tags --force
   git checkout --force $tag
   git submodule update --init --recursive
   $pd = "$j\patches\$repo\$tag"
   if (Test-Path $pd) { git -c user.name=me -c user.email=me@local am (Get-ChildItem "$pd\*.patch" | Sort-Object Name).FullName } else { "no patches" }
   ```

   ```powershell
   just install                                        # terminals keep running
   ```

3. Mods — remove the old folders first so deleted files don't linger:

   ```powershell
   $j = "$env:USERPROFILE\src\herdr-jay"
   $h = "$env:USERPROFILE\.config\herdr-app"
   Remove-Item -Recurse -Force "$h\mods\jay-nvim", "$h\mods\jay-nvim-pick" -ErrorAction SilentlyContinue
   Copy-Item -Recurse -Force "$j\mods\jay-nvim", "$j\mods\jay-nvim-pick" "$h\mods\"
   herdr-app check "$h\mods\jay-nvim" | Out-Host
   ```

4. Quit and reopen Herdr. `keys.json` stays as you left it.
