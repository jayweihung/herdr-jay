# A Linux server as a Herdr machine / 把 Linux server 加成 Herdr 的機器

Herdr runs on your Windows PC (or Mac); a Linux server joins it over **ssh** as a "machine": its terminals and agents
show up in the same window. Nothing graphical runs on the server, and **no root is needed**.
Herdr 在 Windows（或 Mac）上跑；Linux server 用 ssh 加進來當「機器」，不用 root。

Not yet run on a real company server: note what differs and bring it to jay.

| Step / 步驟 | |
|---|---|
| [1](#1-ssh-key--ssh-金鑰) | ssh key (once) / ssh 金鑰 |
| [2](#2-herdr-core-on-the-server-built-from-source--server-上自己-build-core) | herdr-core on the server, built from source / server 上自己 build core |
| [2a](#2a-server-cant-download--server-不能上網) | Server can't download: build offline from a pack / server 不能上網：離線 build |
| [2b](#2b-add-the-machine--加機器) | Add the machine / 加機器 |
| [3](#3-neovim-and-git-on-the-server--server-上的-neovim-和-git) | Neovim and git on the server |
| [4](#4-agents-on-the-server--server-上的-agent) | Agents on the server |
| [5](#5-try-jay-nvim-there--試-jay-nvim) | Try jay-nvim there |
| [6](#6-when-something-goes-wrong--出問題時) | When something goes wrong / 出問題時 |

---

## 1. ssh key / ssh 金鑰

Herdr never types a password for you: log in with a key. On **Windows**, in PowerShell (OpenSSH client; if `ssh` is
missing: Settings → System → Optional features → OpenSSH Client, or ask IT):

```powershell
ssh -V
if (-not (Test-Path "$env:USERPROFILE\.ssh\id_ed25519")) { ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\id_ed25519" }
```

Put the **public** key on the server (replace `<user>` and `<server>`; it asks for your password once):

```powershell
Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" | ssh <user>@<server> "umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys"
```

**Check**: `ssh <user>@<server> echo ok` prints `ok` **without** asking for a password.
If the company forbids keys or the server only allows a jump host, ask IT (Herdr can also use an ssh config `Host`
entry with `ProxyJump`: put it in `%USERPROFILE%\.ssh\config` and use that name).
一定要能不打密碼就 ssh 進去；公司不准用金鑰就問 IT。

On macOS the same with `ssh-keygen -t ed25519` and `ssh-copy-id <user>@<server>`.

---

## 2. herdr-core on the server, built from source / server 上自己 build core

Like macOS and Windows, the server runs herdr-core **built from the official source** at the tag in the
[README versions table](../README.md#versions--版本), plus `patches/herdr-core/<tag>/` — no root. Run this in a
terminal **on the server** (ssh in from step 1, or let an agent there do it: [agent-install.md](agent-install.md)).
跟 Mac、Windows 一樣，server 上的 core 也從官方原始碼 build（不用 root）。

Needs about 3 GB free disk in your home and up to 3 GB RAM while building (about 5 minutes on 2 cores; up to 30 on a slow server). On a busy shared server
the build below runs at the lowest priority with a memory cap, so it can't push the server's own services out.

**Source only / 只用原始碼**: everything on the server is built there from source — herdr-core, every Rust library
(crates: source only, checked), every Zig package, and Neovim (step 3). Only the two **compilers** may come as
builds, from the company (plan A) or the official ones (plan B). The Zig packages Ghostty pulls in are source
releases, but a few carry prebuilt test / sample files (`.exe`, `.so`, `.a`, `.jar`, `.class` in sentry, breakpad,
gettext, imgui); none is used by the build, and the steps below delete them before building.
server 上的東西都從原始碼 build；只有兩個編譯器可以用現成的（公司的＝方案 A，官方的＝方案 B）。
Zig 套件裡夾帶的幾個測試用執行檔不會用到，build 前刪掉。

**What the server needs from the system / 系統要有的**: `gcc` (Rust links with `cc`), `make`, `cmake` ≥ 3.16
(Neovim), `git`, `curl`, `tar`, `xz`, `od`. Plus the two compilers, below. While building it must reach
`index.crates.io`, `static.crates.io`, `github.com`, `codeload.github.com`, `raw.githubusercontent.com`,
`deps.files.ghostty.org` (plan B also `sh.rustup.rs`, `static.rust-lang.org`, `ziglang.org`).

Check all of it in one go (each line must say ok):

```sh
for c in cc make cmake git curl tar xz od; do command -v $c >/dev/null && echo "ok  $c" || echo "MISSING  $c"; done
cmake --version | head -1
for h in index.crates.io static.crates.io github.com codeload.github.com raw.githubusercontent.com deps.files.ghostty.org; do curl -sS -o /dev/null --max-time 10 "https://$h" && echo "ok  $h" || echo "BLOCKED  $h"; done
```

A MISSING command: ask IT to install it (Ubuntu: `gcc`, `make`, `cmake`, `git`, `curl`, `xz-utils`). A BLOCKED host:
ask IT to allow it, or set the company proxy first (`export https_proxy=http://<proxy>:<port>`). If the server can't
get out at all, use [2a](#2a-server-cant-download--server-不能上網): everything comes as one pack of sources from your PC.

### Compilers: plan A or plan B / 編譯器：方案 A 或 B

Rust (for herdr-core) and Zig (for the terminal library inside it). Take **A** for each one the company has in the
right version, **B** for the other. Neither plan has been run on a company server yet.
Rust 和 Zig 各自看：公司有對的版本就用方案 A，沒有就用方案 B。兩個方案都還沒在公司 server 試過。

**Plan A — the company's compilers / 方案 A：公司的編譯器**

```sh
rustc --version; cargo --version; zig version
```

- Rust: `rustc` and `cargo` **1.85 or newer** (the oldest herdr-core's libraries declare); jay builds with 1.95.0, so
  an older one is untested: if the build stops with "requires rustc 1.x" or "is not stable", use plan B for Rust.
- Zig: exactly **0.16.x** (Zig changes between versions; 0.15 or 0.17 is not checked). Else plan B for Zig.
- Nothing to install; the PATH line below only adds `~/.local/bin`. If the company's tools live in a folder you
  load with `module load …` or similar, do that first in every shell that builds.

**Plan B — official compilers in your home / 方案 B：官方編譯器裝在家目錄** (Rust 1.95.0, Zig 0.16.0; no root):

```sh
curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain 1.95.0 --no-modify-path
cd ~ && curl -fLO https://ziglang.org/download/0.16.0/zig-x86_64-linux-0.16.0.tar.xz
echo "70e49664a74374b48b51e6f3fdfbf437f6395d42509050588bd49abe52ba3d00  zig-x86_64-linux-0.16.0.tar.xz" | sha256sum -c
mkdir -p ~/.local/opt && tar -xJf zig-x86_64-linux-0.16.0.tar.xz -C ~/.local/opt && rm zig-x86_64-linux-0.16.0.tar.xz
```

(Plan B for only one of them: run only its lines — the `rustup` line for Rust, the three `zig` lines for Zig.)

Then in every shell that builds (or put it in `~/.profile`). Plan A: only the first part; plan B: all of it:

```sh
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$HOME/.local/opt/zig-x86_64-linux-0.16.0:$PATH"
```

**Check**: `rustc --version` (A: ≥ 1.85, B: `1.95.0`), `zig version` → `0.16.x`, `cc --version` works.

Source and jay's patches (the tag from the README table; herdr-jay is cloned beside it):

```sh
mkdir -p ~/src && cd ~/src
[ -d herdr-jay ] || git clone https://github.com/jayweihung/herdr-jay.git
git -C herdr-jay pull --ff-only
[ -d herdr-core ] || git clone https://github.com/herdrdev/herdr-core.git
cd herdr-core && git am --abort 2>/dev/null; git fetch --tags --force && git checkout --force v0.1.19
git submodule update --init --recursive --depth 1
git rev-parse --short HEAD
ls ~/src/herdr-jay/patches/herdr-core/v0.1.19/*.patch && git -c user.name=me -c user.email=me@local am -3 ~/src/herdr-jay/patches/herdr-core/v0.1.19/*.patch
```

`git rev-parse` must print `06793ed`. (The one patch today only matters on macOS; it is applied so every machine
builds the same source.)

Fetch the Zig packages and delete the prebuilt test / sample files in them (executables, libraries, Java
archives: recognised by their first bytes; it prints each one it deletes, about 23):
先抓 Zig 套件，再刪掉裡面夾帶的測試用執行檔／函式庫（會列出刪了哪些，約 23 個）：

```sh
cd ~/src/herdr-core/vendor/ghostty && zig build --fetch -Demit-lib-vt
find zig-pkg -type f -size +3c | while IFS= read -r f; do
  case $(od -An -tx1 -N4 "$f" | tr -d ' \n') in
    7f454c46|cafebabe|feedface|feedfacf|cefaedfe|cffaedfe|213c6172|504b0304|4d5a*) echo "deleted $f"; rm -f "$f" ;;
  esac
done
```

Run the same `find` loop again: it must print nothing. (If even downloading those files to the server is not
allowed, use [2a](#2a-server-cant-download--server-不能上網): there they are deleted on the PC and never reach the server.)

Build at low priority with a memory cap, then install into `~/.local/bin` and restart the core there (its terminals
keep running; a Herdr window connected to it reconnects):

```sh
cd ~/src/herdr-core
cap="systemd-run --user --scope -q -p MemoryMax=3G -p CPUWeight=10"; $cap true 2>/dev/null || cap=""
$cap nice -n 19 cargo build --release --locked -j 2
install -m 755 target/release/herdr-core ~/.local/bin/herdr-core.new && mv -f ~/.local/bin/herdr-core.new ~/.local/bin/herdr-core
[ -e ~/.local/bin/hc ] || ln -s herdr-core ~/.local/bin/hc
~/.local/bin/herdr-core server restart
~/.local/bin/hc --version
```

**Check**: the last line prints `hc 0.1.19`. If the build is killed (memory cap): run the build line again with
`-j 1`. A server without `systemd-run --user` builds without the cap (still lowest priority).

**Updating**: same block with the new tag from the README table. Never `hc update` on the server, and on your PC
never "Update" the machine in Herdr or `hc machine update` (both put the official build there).

---

## 2a. Server can't download / server 不能上網

If the check in step 2 says BLOCKED and IT won't open it, prepare **one pack** on your PC (it can reach the internet)
and copy it to the server with `scp`. The server then needs only the system tools of step 2 (`gcc`, `make`, `cmake`,
`git`, `tar`, `xz`, `od`) — no network at all.
server 連不出去時：在 PC 上把所有東西打包，scp 過去，server 完全不用上網。

What is in the pack / 包裡有什麼:

| | What | Source code? |
|---|---|---|
| herdr-core | the source at the README tag, with Ghostty | yes |
| Rust libraries | every crate herdr-core uses (`cargo vendor`, ~50 MB) | yes |
| Zig libraries | the packages a Linux build of Ghostty's terminal library fetches (`vendor/ghostty/zig-pkg`, ~370 MB), prebuilt test / sample files deleted | yes |
| Neovim | the source at `v0.12.6` plus its libraries (`.deps/build/downloads`, ~5 MB) | yes |
| herdr-jay | patches | yes (text) |
| Rust 1.95.0 | **plan B only**: the official Linux toolchain (`rust-1.95.0-x86_64-unknown-linux-gnu.tar.xz`, ~200 MB) | no: the compiler (step 2, plan A / B) |
| Zig 0.16.0 | **plan B only**: the official Linux toolchain (`zig-x86_64-linux-0.16.0.tar.xz`) | no: the compiler |

Everything except the two compilers is **source**, compiled on the server. Plan A (the company's compilers): leave
out the two plan B downloads below.
除了兩個編譯器，包裡全是原始碼。方案 A（公司的編譯器）就不用下載最後兩個。

**On the PC** (Windows, PowerShell; needs Git, Rust and Zig from [windows.md](windows.md) step 1). A short folder,
because Windows trips over long paths:

```powershell
$p = "C:\hp"
New-Item -ItemType Directory -Force $p | Out-Null; Set-Location $p
git -c core.autocrlf=false -c core.longpaths=true clone https://github.com/jayweihung/herdr-jay.git
git -c core.autocrlf=false -c core.longpaths=true clone https://github.com/herdrdev/herdr-core.git
Set-Location "$p\herdr-core"
git -c core.autocrlf=false -c core.longpaths=true checkout v0.1.19
git -c core.autocrlf=false -c core.longpaths=true submodule update --init --recursive --depth 1
git rev-parse --short HEAD   # must print 06793ed
New-Item -ItemType Directory -Force .cargo | Out-Null
cargo vendor --locked --versioned-dirs cargo-vendor | Out-File -Encoding ascii .cargo\config.toml
Set-Location "$p\herdr-core\vendor\ghostty"
zig build --fetch -Demit-lib-vt -Dtarget=x86_64-linux-gnu
```

`-Dtarget` makes Zig fetch what a **Linux** build needs (not the Windows set). Then delete the prebuilt test / sample
files (same rule as step 2: recognised by their first bytes; it lists each one, about 23):

```powershell
$bad = "7f454c46", "cafebabe", "feedface", "feedfacf", "cefaedfe", "cffaedfe", "213c6172", "504b0304"
Get-ChildItem -Recurse -File "$p\herdr-core\vendor\ghostty\zig-pkg" | Where-Object Length -ge 4 | ForEach-Object {
  $b = [byte[]]::new(4); $s = [IO.File]::OpenRead($_.FullName)
  try { [void]$s.Read($b, 0, 4) } finally { $s.Close() }
  $h = -join ($b | ForEach-Object { $_.ToString("x2") })
  if ($bad -contains $h -or $h.StartsWith("4d5a")) { "deleted $($_.FullName)"; Remove-Item -Force -LiteralPath $_.FullName }
}
```

Neovim's source and its libraries (the list is read from Neovim's own `cmake.deps\deps.txt`, so its versions and
checksums are Neovim's):

```powershell
Set-Location $p
git -c core.autocrlf=false -c core.longpaths=true clone --depth 1 --branch v0.12.6 https://github.com/neovim/neovim.git
$libs = "LIBUV", "LUAJIT", "UNIBILIUM", "LUV", "LPEG", "LUA_COMPAT53", "UTF8PROC", "TREESITTER", "TREESITTER_C",
  "TREESITTER_LUA", "TREESITTER_VIM", "TREESITTER_VIMDOC", "TREESITTER_QUERY", "TREESITTER_MARKDOWN"
foreach ($line in Get-Content "$p\neovim\cmake.deps\deps.txt") {
  $k, $u = -split $line
  if ($k -and $k.EndsWith("_URL") -and $libs -contains $k.Substring(0, $k.Length - 4)) {
    $d = "$p\neovim\.deps\build\downloads\" + $k.Substring(0, $k.Length - 4).ToLower()
    New-Item -ItemType Directory -Force $d | Out-Null
    curl.exe -fsSL -o "$d\$(Split-Path -Leaf $u)" $u
  }
}
(Get-ChildItem -Recurse -File "$p\neovim\.deps\build\downloads").Count     # must be 14
```

Plan B only, the two compilers:

```powershell
Set-Location $p
curl.exe -fLO https://static.rust-lang.org/dist/rust-1.95.0-x86_64-unknown-linux-gnu.tar.xz
curl.exe -fLO https://static.rust-lang.org/dist/rust-1.95.0-x86_64-unknown-linux-gnu.tar.xz.sha256
curl.exe -fLO https://ziglang.org/download/0.16.0/zig-x86_64-linux-0.16.0.tar.xz
```

Pack and copy:

```powershell
tar -czf "$env:USERPROFILE\herdr-pack.tgz" -C $p .
scp "$env:USERPROFILE\herdr-pack.tgz" <user>@<server>:
```

**Check**: `cat C:\hp\herdr-core\.cargo\config.toml` shows `directory = "cargo-vendor"`; the pack is about 0.5 GB
(plan B: about 0.7 GB).
(From a Mac or Linux with internet: the same steps in `sh`, without `.exe` and the `-c core.*` options; the
delete loop and the Neovim list as in step 2 / step 3.)

**On the server**, unpack and (plan B) install the compilers:

```sh
mkdir -p ~/hp && tar -xzf ~/herdr-pack.tgz -C ~/hp && cd ~/hp
# plan B only:
sha256sum -c rust-1.95.0-x86_64-unknown-linux-gnu.tar.xz.sha256
echo "70e49664a74374b48b51e6f3fdfbf437f6395d42509050588bd49abe52ba3d00  zig-x86_64-linux-0.16.0.tar.xz" | sha256sum -c
tar -xJf rust-1.95.0-x86_64-unknown-linux-gnu.tar.xz
rust-1.95.0-x86_64-unknown-linux-gnu/install.sh --prefix="$HOME/.local/rust" --disable-ldconfig
mkdir -p ~/.local/opt ~/.local/bin && tar -xJf zig-x86_64-linux-0.16.0.tar.xz -C ~/.local/opt
export PATH="$HOME/.local/bin:$HOME/.local/rust/bin:$HOME/.local/opt/zig-x86_64-linux-0.16.0:$PATH"
```

Plan A: only `mkdir -p ~/.local/bin; export PATH="$HOME/.local/bin:$PATH"` (and the company's `module load …`, if any).
Put the `export PATH` line in `~/.profile` (use it instead of step 2's line, which points at rustup's `~/.cargo/bin`).

Then the source:

```sh
cd ~/hp/herdr-core
git -c core.fileMode=true -c core.symlinks=true reset -q --hard
git -c core.fileMode=true -c core.symlinks=true submodule foreach -q git reset -q --hard
git rev-parse --short HEAD
git -c user.name=me -c user.email=me@local am -3 ~/hp/herdr-jay/patches/herdr-core/v0.1.19/*.patch
```

The two `reset` lines put back what Windows loses (Linux file modes and links); the `cargo-vendor` and `zig-pkg`
folders are not in git and stay. `git rev-parse` must print `06793ed`. Check that no prebuilt file came along: step
2's `find` loop, run in `~/hp/herdr-core/vendor/ghostty`, must print nothing.

Then step 2's build and install block (in `~/hp/herdr-core`), with **`--offline`** added to the build line:

```sh
$cap nice -n 19 cargo build --release --locked --offline -j 2
```

Neovim: step 3's build in `~/hp/neovim` instead of `~/src/neovim` (skip its `git clone` / `checkout` lines; the
libraries are already in `.deps/build/downloads`, so nothing is downloaded).

Checked: the herdr-core pack builds on macOS with the network blocked; with the Linux package set and the prebuilt
files deleted, Ghostty's terminal library still builds for Linux offline (cross-built on macOS); Neovim v0.12.6
builds offline from the 14 library files (on macOS). Not yet run from a Windows-made pack on a real Linux server, and
the PowerShell delete loop has not run on Windows: note what differs and bring it to jay.
**Updating**: a new pack for the new tag; delete `~/hp` first. Never `hc update`.

---

## 2b. Add the machine / 加機器

In Herdr: **Settings → Add machine** (or the `+` menu), enter `<user>@<server>` (or your ssh config name).
With step 2 done, Herdr finds the core in `~/.local/bin` and connects. (Without it, Herdr would offer to install
**the official build** of your version, downloaded from `releases.herdr.dev`: say no, do step 2.)
If it needs a password, a new host key or something installed, it tells you what to run.

**Check** on your PC: `hc machine ls` shows the machine `connected` and its `version` equals `hc --version`.

---

## 3. Neovim and git on the server / server 上的 Neovim 和 git

jay-nvim on a server pane looks for nvim in `~/.local/bin`, `/usr/local/bin`, `/usr/bin` and needs **0.11 or newer**.
Ubuntu's apt Neovim is older (22.04: 0.6, 24.04: 0.9). Build **Neovim v0.12.6 from source** into your home (no root;
about 2–10 minutes; needs `gcc`, `make`, `cmake` ≥ 3.16 from step 2; it downloads its libraries as source from
`github.com` / `raw.githubusercontent.com`). In a server terminal (a Herdr tab on that machine):
Neovim 也從原始碼 build（v0.12.6），裝在家目錄，不用 root。

```sh
mkdir -p ~/src ~/.local/bin && cd ~/src
[ -d neovim ] || git clone https://github.com/neovim/neovim.git
cd neovim && git fetch --tags --force && git checkout --force v0.12.6
cd ~/src/neovim && rm -rf build
nice -n 19 make CMAKE_BUILD_TYPE=Release CMAKE_INSTALL_PREFIX="$HOME/.local/opt/nvim"
make install
ln -sf ~/.local/opt/nvim/bin/nvim ~/.local/bin/nvim
~/.local/bin/nvim --version | head -1
```

From the pack ([2a](#2a-server-cant-download--server-不能上網)): skip the first three lines and use `cd ~/hp/neovim` instead
of `cd ~/src/neovim`; the libraries are already there, nothing is downloaded.
Only source goes in: Neovim's libraries are source tarballs (libuv, LuaJIT, luv, lpeg, unibilium, utf8proc,
tree-sitter and its parsers); its translations are off, so no gettext. Neovim's own repo holds a few `.zip` / `.tar`
files under `test/` (sample data for its tests, not programs).

**Check**: the last line prints `NVIM v0.12.6`; `git --version` works (else ask IT for git).
Updating to a newer Neovim: only when the README says so; the same block with the new tag (`rm -rf build .deps` first).

Optional LSP for Python: the pip packages are prebuilt (`ruff` is a compiled program; `pyright` downloads Node.js),
so they are **not** for a source-only server. Without them jay-nvim works the same, only without go-to-definition,
hover types and lint errors. (`ruff` from source would be `cargo install ruff --locked` with Rust from step 2: a long
build, not checked.)
Python 的 LSP（ruff、pyright）用 pip 裝的是現成程式，只能用原始碼的 server 不要裝；沒有它們 jay-nvim 照樣能用，只是沒有跳定義和型別提示。

---

## 4. Agents on the server / server 上的 agent

An agent that should work on the server's files runs **on the server**: open a tab on that machine and start it
there (Claude Code: install it on the server as the company allows; its login is per machine).
Agents on the Windows PC and on the server can sit in different tabs of the same Herdr window.
要改 server 上的檔，agent 就在 server 上跑（在那台機器的分頁裡開）。

jay-nvim follows the agent **in the same tab and on the same machine** as the nvim pane.

---

## 5. Try jay-nvim there / 試 jay-nvim

1. Open a tab on the server machine in a project folder, start Claude Code there.
2. With its pane focused: `ctrl-shift-i` (Windows) / `cmd-e` (Mac) → nvim opens **on the server**, beside it.
3. Ask the agent to read / edit a file → nvim follows; `ctrl-shift-j` / `cmd-o` → the list (alt+o reaches nvim).
4. `space a c` → comment, `space a s` → sent to the agent.
5. Python: `:JayTrust` once per project for pyright.

Bring jay the results like the Windows checklist (photos, `:messages`, and `hc machine ls` on the PC).

---

## 6. When something goes wrong / 出問題時

| What you see / 看到什麼 | Why / 原因 | Fix / 怎麼修 |
|---|---|---|
| Add machine asks for a password / fails to log in | no key login | step 1; `ssh <user>@<server> echo ok` must work with no prompt |
| Herdr offers to install hc on the server | the server has no core in `~/.local/bin` | say no; step 2 |
| Build killed / "signal: 9" | memory cap hit | build again with `-j 1` |
| `zig` / `rustc` not found | PATH line not set in this shell | step 2, the `export PATH` line |
| Machine version differs from your PC's `hc --version` | one side updated | build the same tag on both (README table) |
| Download fails while adding | the PC can't reach GitHub's release hosts | host list to IT (Windows guide step 0) |
| "nvim not found on <server>" | nvim not in `~/.local/bin` | step 3 |
| Neovim build: `cmake: command not found` / "CMake 3.16 or higher is required" | no or old cmake | ask IT for cmake ≥ 3.16; then `rm -rf build .deps` (pack: keep `.deps/build/downloads`, delete the rest of `.deps`) and build again |
| Neovim build from the pack tries to download | a library file is missing or has another name | on the PC the count must be 14 (step 2a); copy the pack again |
| herdr-core build: `requires rustc 1.xx` / "is not stable" | the company's Rust (plan A) is too old | plan B for Rust |
| herdr-core build: Zig errors | the company's Zig (plan A) isn't 0.16.x | plan B for Zig |
| `find` loop still prints files | a new Ghostty version pulls other packages | run it once more (it deletes them), then bring the list to jay |
| "jay-nvim needs Neovim 0.11 or newer" | apt's old nvim found first | step 3 (`~/.local/bin` is searched first) |
| "找不到 hc" in nvim on the server | core not in `~/.local/bin` | step 2 |
| nvim never follows the agent | the agent runs on the PC, not on the server (or in another tab) | step 4 |
| Machine shows `disconnected` after a while | ssh dropped (VPN, sleep) | Herdr reconnects; terminals on the server keep running |
