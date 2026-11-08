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

**What the server needs first / server 要先有的**: Rust and Zig are the two compilers herdr-core is built with
(Rust for herdr-core itself, Zig for the terminal library inside it). They are **not** installed system-wide: the
official prebuilt toolchains are unpacked into your home below, no root. From the system it needs only `gcc`
(Rust links with `cc`), `git`, `curl`, `tar`, `xz` — and the server must reach these hosts while building:
`sh.rustup.rs`, `static.rust-lang.org`, `index.crates.io`, `static.crates.io`, `ziglang.org`, `github.com`,
`codeload.github.com`, `deps.files.ghostty.org`.
Rust 和 Zig 是 build herdr-core 用的編譯器，直接下載官方編好的放到家目錄（不用 root、不用自己編）；系統只要 gcc、git、curl、tar、xz，
build 時要連得到上面這些網址。

Check all of it in one go (each line must say ok):

```sh
for c in cc git curl tar xz; do command -v $c >/dev/null && echo "ok  $c" || echo "MISSING  $c"; done
for h in sh.rustup.rs static.rust-lang.org index.crates.io static.crates.io ziglang.org github.com codeload.github.com deps.files.ghostty.org; do curl -sS -o /dev/null --max-time 10 "https://$h" && echo "ok  $h" || echo "BLOCKED  $h"; done
```

A MISSING command: ask IT to install it (Ubuntu: `gcc`, `git`, `curl`, `xz-utils`). A BLOCKED host: ask IT to allow
it, or set the company proxy first (`export https_proxy=http://<proxy>:<port>`). If the server can't get out at all,
use [2a](#2a-server-cant-download--server-不能上網): everything comes as one pack of sources from your PC.

Tools, once (Rust 1.95.0 and Zig 0.16.0 in your home):

```sh
curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain 1.95.0 --no-modify-path
cd ~ && curl -fLO https://ziglang.org/download/0.16.0/zig-x86_64-linux-0.16.0.tar.xz
echo "70e49664a74374b48b51e6f3fdfbf437f6395d42509050588bd49abe52ba3d00  zig-x86_64-linux-0.16.0.tar.xz" | sha256sum -c
mkdir -p ~/.local/opt && tar -xJf zig-x86_64-linux-0.16.0.tar.xz -C ~/.local/opt && rm zig-x86_64-linux-0.16.0.tar.xz
```

Then in every shell that builds (or put it in `~/.profile`):

```sh
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$HOME/.local/opt/zig-x86_64-linux-0.16.0:$PATH"
```

**Check**: `rustc --version` → `1.95.0`, `zig version` → `0.16.0`, `cc --version` works.

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
and copy it to the server with `scp`. The server then needs only `gcc`, `git`, `tar`, `xz` — no network at all.
server 連不出去時：在 PC 上把所有東西打包，scp 過去，server 完全不用上網。

What is in the pack / 包裡有什麼:

| | What | Source code? |
|---|---|---|
| Rust 1.95.0 | the official Linux toolchain installer (`rust-1.95.0-x86_64-unknown-linux-gnu.tar.xz`, ~200 MB), installs into your home | built by the Rust project from `rustc-1.95.0-src.tar.xz` (same site) |
| Zig 0.16.0 | the official Linux toolchain (`zig-x86_64-linux-0.16.0.tar.xz`) | built from `zig-0.16.0.tar.xz` (same site) |
| herdr-core | the source at the README tag, with Ghostty | yes |
| Rust libraries | every crate herdr-core uses (`cargo vendor`, ~50 MB) | yes |
| Zig libraries | every package Ghostty uses (`zig build --fetch=all` → `vendor/ghostty/zig-pkg`, ~550 MB) | yes |
| herdr-jay | patches | yes (text) |
| Neovim | the official Linux build (step 3) | — |

All libraries are shipped as **source** and compiled on the server. Rust and Zig themselves come as the official
builds: compiling the compilers is not practical on a server with only gcc (Rust needs an older Rust plus LLVM,
cmake and Python; Zig needs LLVM and cmake; hours each). Download their source tarballs too if you want to read them.
函式庫都是原始碼、在 server 上編；Rust、Zig 這兩個編譯器本身用官方編好的（自己編要 LLVM、cmake、好幾個小時，不實際）。

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
zig build --fetch=all
Set-Location $p
curl.exe -fLO https://static.rust-lang.org/dist/rust-1.95.0-x86_64-unknown-linux-gnu.tar.xz
curl.exe -fLO https://static.rust-lang.org/dist/rust-1.95.0-x86_64-unknown-linux-gnu.tar.xz.sha256
curl.exe -fLO https://ziglang.org/download/0.16.0/zig-x86_64-linux-0.16.0.tar.xz
curl.exe -fLO https://github.com/neovim/neovim/releases/download/stable/nvim-linux-x86_64.tar.gz
tar -czf "$env:USERPROFILE\herdr-pack.tgz" -C $p .
scp "$env:USERPROFILE\herdr-pack.tgz" <user>@<server>:
```

**Check**: `cat C:\hp\herdr-core\.cargo\config.toml` shows `directory = "cargo-vendor"`; the pack is about 1 GB.
(From a Mac or Linux with internet: the same commands in `sh`, without `.exe` and the `-c core.*` options.)

**On the server**:

```sh
mkdir -p ~/hp && tar -xzf ~/herdr-pack.tgz -C ~/hp && cd ~/hp
sha256sum -c rust-1.95.0-x86_64-unknown-linux-gnu.tar.xz.sha256
echo "70e49664a74374b48b51e6f3fdfbf437f6395d42509050588bd49abe52ba3d00  zig-x86_64-linux-0.16.0.tar.xz" | sha256sum -c
tar -xJf rust-1.95.0-x86_64-unknown-linux-gnu.tar.xz
rust-1.95.0-x86_64-unknown-linux-gnu/install.sh --prefix="$HOME/.local/rust" --disable-ldconfig
mkdir -p ~/.local/opt ~/.local/bin && tar -xJf zig-x86_64-linux-0.16.0.tar.xz -C ~/.local/opt
export PATH="$HOME/.local/bin:$HOME/.local/rust/bin:$HOME/.local/opt/zig-x86_64-linux-0.16.0:$PATH"
cd ~/hp/herdr-core
git -c core.fileMode=true -c core.symlinks=true reset -q --hard
git -c core.fileMode=true -c core.symlinks=true submodule foreach -q git reset -q --hard
git rev-parse --short HEAD
git -c user.name=me -c user.email=me@local am -3 ~/hp/herdr-jay/patches/herdr-core/v0.1.19/*.patch
```

The two `reset` lines put back what Windows loses (Linux file modes and links); the `cargo-vendor` and `zig-pkg`
folders are not in git and stay. `git rev-parse` must print `06793ed`. Put the `export PATH` line in `~/.profile`
(use it instead of step 2's line, which points at rustup's `~/.cargo/bin`).

Then step 2's build and install block, with **`--offline`** added to the build line:

```sh
$cap nice -n 19 cargo build --release --locked --offline -j 2
```

Neovim (step 3) from the pack: `tar -xzf ~/hp/nvim-linux-x86_64.tar.gz -C ~/.local/opt` and the same link as step 3.

Checked: this pack builds on macOS with the network blocked (no download at build time). Not yet run from a
Windows-made pack on a real Linux server: note what differs and bring it to jay.
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
Ubuntu's apt Neovim is older (22.04: 0.6, 24.04: 0.9): install the official build into your home. In a server
terminal (a Herdr tab on that machine):

```sh
cd ~ && curl -fLO https://github.com/neovim/neovim/releases/download/stable/nvim-linux-x86_64.tar.gz
mkdir -p ~/.local/opt ~/.local/bin && tar -xzf nvim-linux-x86_64.tar.gz -C ~/.local/opt
ln -sf ~/.local/opt/nvim-linux-x86_64/bin/nvim ~/.local/bin/nvim && rm nvim-linux-x86_64.tar.gz
~/.local/bin/nvim --version | head -1
```

ARM server: `nvim-linux-arm64` instead. No internet on the server: download the file on your PC and copy it with
`scp nvim-linux-x86_64.tar.gz <user>@<server>:` first, then run the last three lines.
An error about `GLIBC` means a very old server: ask jay (an older-glibc build or the AppImage extracted with
`--appimage-extract`).

**Check**: the last line prints `NVIM v0.11` or newer; `git --version` works (else ask IT for git).
Optional LSP for Python: `python3 -m pip install --user ruff pyright` (they land in `~/.local/bin`).

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
| "jay-nvim needs Neovim 0.11 or newer" | apt's old nvim found first | step 3 (`~/.local/bin` is searched first) |
| "找不到 hc" in nvim on the server | core not in `~/.local/bin` | step 2 |
| nvim never follows the agent | the agent runs on the PC, not on the server (or in another tab) | step 4 |
| Machine shows `disconnected` after a while | ssh dropped (VPN, sleep) | Herdr reconnects; terminals on the server keep running |
