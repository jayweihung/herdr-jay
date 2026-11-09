# A Linux server as a Herdr machine / 把 Linux server 加成 Herdr 的機器

Herdr runs on your Windows PC (or Mac); a Linux server joins it over **ssh** as a "machine": its terminals and agents
show up in the same window. Nothing graphical runs on the server, and **no root is needed**.
Herdr 在 Windows（或 Mac）上跑；Linux server 用 ssh 加進來當「機器」，不用 root。

Not yet run on a real company server: note what differs and bring it to jay.

| Step / 步驟 | |
|---|---|
| [1](#1-ssh-key--ssh-金鑰) | ssh key (once) / ssh 金鑰 |
| [2](#2-herdr-core-for-the-server-built-on-the-pc--server-的-core在-pc-上-build) | herdr-core for the server, built on the PC / server 的 core（在 PC 上 build） |
| [2b](#2b-add-the-machine--加機器) | Add the machine / 加機器 |
| [3](#3-neovim-and-git-on-the-server--server-上的-neovim-和-git) | Neovim and git on the server (built there from source) |
| [3a](#3a-server-cant-download--server-不能上網) | Server can't download: Neovim from a pack / server 不能上網 |
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

## 2. herdr-core for the server, built on the PC / server 的 core（在 PC 上 build）

The server's herdr-core is **built on your Windows PC** (the same machine that builds Herdr for Windows, see
[windows.md](windows.md)) and copied over: nothing is compiled for herdr-core on the server, so it needs no Rust, no
Zig and no build memory.
server 的 core 在 Windows PC 上 build 好再複製過去；server 不用裝 Rust、Zig，也不用在 server 上編。

**What to build**: herdr-core at the tag in the [README versions table](../README.md#versions--版本), plus
`patches/herdr-core/<tag>/` (as in [windows.md step 2](windows.md#2-herdr-core-hc)), for **Linux x86_64**
(`x86_64-unknown-linux-musl`, a static program like the official Linux release, so it runs on any distro;
ARM server: `aarch64-unknown-linux-musl`). The version must equal the PC's core (`hc --version`).

**Where it goes on the server**: `~/.local/bin/herdr-core` (mode 755), plus `~/.local/bin/hc` as a link to it if
there is no `hc` yet. That folder matters: Herdr's "Add machine" and jay-nvim look for the core there. After
replacing it, `~/.local/bin/herdr-core server restart` (terminals there keep running).
放在 `~/.local/bin/herdr-core`（再加一個 `hc` 連結）；Herdr 和 jay-nvim 都在那裡找。

**Check** on the server: `~/.local/bin/herdr-core --version` prints the same version as `hc --version` on the PC.
There must be no other `herdr-core` on the server's PATH (`command -v herdr-core` prints nothing or your
`~/.local/bin/herdr-core`): Herdr uses one found on PATH before `~/.local/bin`.

**Source only on the server**: the server gets this one program (built by you from source) and Neovim's source
(step 3); nothing prebuilt from anyone else. Never `hc update` on the server, and on your PC never "Update" the
machine in Herdr or `hc machine update` (both put the official build there).
**Updating**: when the README table moves to a new core, build it for Windows and for Linux, copy it again, restart.

---

## 2b. Add the machine / 加機器

In Herdr: **Settings → Add machine** (or the `+` menu), enter `<user>@<server>` (or your ssh config name).
With step 2 done, Herdr finds the core and connects.
**Without it** Herdr says "Couldn't add … Run `hc machine add <target>` in a terminal". **Don't run that**: it asks
`Copy this hc (…) there? [Y/n]`, plain Enter means yes, and from Windows to Linux it actually **downloads the
official build** (not yours) onto the server. If you did start it, answer **n**. Do step 2, then add again.
沒做第 2 步時 Herdr 會叫你跑 `hc machine add`：不要跑（它會下載官方版到 server）；跑了就回答 n。
If it needs a password, a new host key or something installed, it tells you what to run.

**Check** on your PC: `hc machine ls` shows the machine `connected` and its `version` equals `hc --version`.

---

## 3. Neovim and git on the server / server 上的 Neovim 和 git

jay-nvim on a server pane looks for nvim in `~/.local/bin`, `/usr/local/bin`, `/usr/bin` and needs **0.11 or newer**.
Ubuntu's apt Neovim is older (22.04: 0.6, 24.04: 0.9).

**Build Neovim on the server itself, not on the PC.** Unlike herdr-core (step 2: one static program, cross-built on
the PC), Neovim's build only runs on Linux and links to the server's own system libraries, so it is compiled
**on the server**, from source. When the server can't download, the PC (or any machine with internet) only fetches the source (3a).
**Neovim 要在 server 上 build，不是在 PC 上**：core（第 2 步）可以在 PC 上 build 好再複製；Neovim 只能在 Linux 上 build，
所以把原始碼放到 server，在 server 上編（server 不能上網時，PC 或其他能上網的機器只負責抓原始碼打包，見 3a）。

Build **Neovim v0.12.6 from source** into your home (no root;
about 2–10 minutes; needs `gcc`, `make`, `cmake` ≥ 3.16 (built with SSL: it downloads the libraries itself), `git`, `curl`, `tar`; it downloads its libraries as source from
`github.com` / `raw.githubusercontent.com`). Everything below runs **in a server terminal** (a Herdr tab on that machine, or `ssh <user>@<server>`):
Neovim 也從原始碼 build（v0.12.6），裝在家目錄，不用 root。

Check the server has what the build needs (each line must say ok; MISSING → ask IT, Ubuntu: `gcc make cmake git curl`):

```sh
for c in cc make cmake git curl tar; do command -v $c >/dev/null && echo "ok  $c" || echo "MISSING  $c"; done
cmake --version | head -1
for h in github.com codeload.github.com raw.githubusercontent.com; do curl -sS -o /dev/null --max-time 10 "https://$h" && echo "ok  $h" || echo "BLOCKED  $h"; done
```

A BLOCKED host: ask IT, set the proxy (`export https_proxy=http://<proxy>:<port>`), or use [3a](#3a-server-cant-download--server-不能上網).

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

From the pack ([3a](#3a-server-cant-download--server-不能上網)): run `mkdir -p ~/.local/bin`, skip the first three lines and use `cd ~/hp/neovim` instead
of `cd ~/src/neovim`; the libraries are already there, nothing is downloaded.
Only source goes in: Neovim's libraries are source tarballs (libuv, LuaJIT, luv, lpeg, unibilium, utf8proc,
tree-sitter and its parsers); its translations are off, so no gettext. Neovim's own repo holds a few `.zip` / `.tar`
files under `test/` (sample data for its tests, not programs).

**Check**: the last line prints `NVIM v0.12.6`; `git --version` works (else ask IT for git).
Updating to a newer Neovim: only when the README says so; the same block with the new tag (`rm -rf build .deps` first).

Optional LSP for Python: the pip packages are prebuilt (`ruff` is a compiled program; `pyright` downloads Node.js),
so they are **not** for a source-only server. Without them jay-nvim works the same, only without go-to-definition,
hover types and lint errors.
Python 的 LSP（ruff、pyright）用 pip 裝的是現成程式，只能用原始碼的 server 不要裝；沒有它們 jay-nvim 照樣能用，只是沒有跳定義和型別提示。

---

## 3a. Server can't download / server 不能上網

Prepare Neovim's source and its libraries on the PC and copy them over; the server then needs no network.
The PC only downloads and packs **source**: the build itself still runs on the server (step 3).
On the PC (PowerShell; the list is read from Neovim's own `cmake.deps\deps.txt`, so versions and checksums are Neovim's):
在 PC 上把 Neovim 原始碼和它的函式庫抓好，複製到 server，server 不用上網。

```powershell
$p = "C:\hp"
New-Item -ItemType Directory -Force $p | Out-Null; Set-Location $p
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
tar -czf "$env:USERPROFILE\nvim-pack.tgz" -C $p neovim
scp "$env:USERPROFILE\nvim-pack.tgz" <user>@<server>:
```

**Or on any Linux / Mac machine that can download** (e.g. an office server; needs `git`, `curl`, `tar`). Same files:
也可以在任何能上網的 Linux / Mac（例如辦公室的 server）上抓，再把 `nvim-pack.tgz` 拿到 build 的 server：

```sh
p=~/hp; mkdir -p "$p" && cd "$p"
git clone --depth 1 --branch v0.12.6 https://github.com/neovim/neovim.git
libs=" LIBUV LUAJIT UNIBILIUM LUV LPEG LUA_COMPAT53 UTF8PROC TREESITTER TREESITTER_C TREESITTER_LUA TREESITTER_VIM TREESITTER_VIMDOC TREESITTER_QUERY TREESITTER_MARKDOWN "
while read -r k u _; do
  case "$k" in *_URL) n=${k%_URL} ;; *) continue ;; esac
  case "$libs" in *" $n "*) ;; *) continue ;; esac
  d="$p/neovim/.deps/build/downloads/$(printf %s "$n" | tr A-Z a-z)"
  mkdir -p "$d" && curl -fsSL -o "$d/${u##*/}" "$u"
done < "$p/neovim/cmake.deps/deps.txt"
find "$p/neovim/.deps/build/downloads" -type f | wc -l     # must be 14
tar -czf ~/nvim-pack.tgz -C "$p" neovim
```

Copy `~/nvim-pack.tgz` to the build server's home (`scp`, or however files reach it).

On the server, unpack and put back what Windows loses (Linux file modes and links; `.deps` is not in git and stays; harmless for a pack made on Linux):

```sh
mkdir -p ~/hp && tar -xzf ~/nvim-pack.tgz -C ~/hp && cd ~/hp/neovim
git -c core.fileMode=true -c core.symlinks=true reset -q --hard
```

Then `mkdir -p ~/.local/bin` and step 3's block from `cd ~/hp/neovim` on (skip its first three lines). The `core.autocrlf=false` keeps the
Linux line endings Neovim's build scripts need.
Checked: Neovim v0.12.6 builds with the network blocked from these 14 files (on macOS). Done for real at the company:
source fetched on an office Linux server, built on the RD server, jay-nvim follows there. The PowerShell part has not
run on Windows yet.

---

## 4. Agents on the server / server 上的 agent

An agent that should work on the server's files runs **on the server**: open a tab on that machine and start it
there, only if the company already provides Claude Code on the server (it is a prebuilt program: don't install it
yourself on a source-only server; its login is per machine). No agent there → do §5 with the PC's agent and skip the snap hook below.
Agents on the Windows PC and on the server can sit in different tabs of the same Herdr window.
要改 server 上的檔，agent 就在 server 上跑（在那台機器的分頁裡開）。

jay-nvim follows the agent **in the same tab and on the same machine** as the nvim pane.

**Snap hook** (so nvim marks Bash edits outside a repo, [nvim.md §7](nvim.md#7-snapshots-for-bash-edits-optional--bash-改檔的快照選用)):
after jay-nvim has opened on the server once (§5 step 2 writes `~/.config/jay-nvim/snap_hook.lua`), back up the
server's `~/.claude/settings.json` and merge in (keep its other settings; if `"PreToolUse"` already exists, add this
entry to its list; no settings.json yet → wrap the snippet in `{ }`):
server 上的 Claude Code 也要加一次 hook（jay-nvim 在 server 開過一次之後）：

```json
"hooks": {
  "PreToolUse": [
    { "matcher": "Bash", "hooks": [{ "type": "command", "timeout": 15,
      "command": "~/.local/bin/nvim -l ~/.config/jay-nvim/snap_hook.lua" }] }
  ]
}
```

Restart the agent. **Check**: after it changes a file outside the repo with a shell command naming its full path,
`~/.cache/jay-nvim/snap/` has a new folder.

---

## 5. Try jay-nvim there / 試 jay-nvim

1. Open a tab on the server machine in a project folder, start Claude Code there.
2. With its pane focused: `ctrl-shift-i` (Windows) / `cmd-e` (Mac) → nvim opens **on the server**, beside it.
3. Ask the agent to read / edit a file → nvim follows (then add the snap hook, §4); `ctrl-shift-j` / `cmd-o` → the list (alt+o reaches nvim).
4. `space a c` → comment, `space a s` → sent to the agent.
5. Only if pyright is on the server (not on a source-only one, step 3): `:JayTrust` once per project.

Bring jay the results like the Windows checklist (photos, `:messages`, and `hc machine ls` on the PC).

---

## 6. When something goes wrong / 出問題時

| What you see / 看到什麼 | Why / 原因 | Fix / 怎麼修 |
|---|---|---|
| Add machine asks for a password / fails to log in | no key login | step 1; `ssh <user>@<server> echo ok` must work with no prompt |
| "Couldn't add … run `hc machine add`", or a `Copy this hc … there? [Y/n]` prompt | no core on the server | don't run it / answer **n** (it downloads the official build); step 2 |
| `hc machine ls` says "needs an hc update: hc machine update …" | the server's core is a different version | **don't** run that (it installs the official build); build the PC's tag for Linux and copy it (step 2) |
| `herdr-core --version` on the server fails: "cannot execute binary file" / "Exec format error" | built for the wrong CPU or OS | build for `x86_64-unknown-linux-musl` (ARM server: `aarch64-…`), step 2 |
| Machine version differs from your PC's `hc --version` | one side updated | build the same tag for Windows and Linux, copy again (step 2) |
| Adding the machine starts a download | Herdr found no core on the server and fetches the official one | cancel; do step 2 first (nothing is downloaded when the core is in `~/.local/bin`) |
| "nvim not found on <server>" | nvim not in `~/.local/bin` | step 3 |
| Neovim build: a library download fails (`cmake.deps`, SSL / "unsupported protocol") | cmake without SSL, or a host blocked | ask IT for a cmake with SSL, or use [3a](#3a-server-cant-download--server-不能上網) (nothing downloaded) |
| Neovim build: `cmake: command not found` / "CMake 3.16 or higher is required" | no or old cmake | ask IT for cmake ≥ 3.16; then `rm -rf build .deps` (pack: keep `.deps/build/downloads`, delete the rest of `.deps`) and build again |
| Neovim build from the pack tries to download | a library file is missing or has another name | on the PC the count must be 14 (step 3a); copy the pack again |
| "jay-nvim needs Neovim 0.11 or newer" | apt's old nvim found first | step 3 (`~/.local/bin` is searched first) |
| "找不到 hc" in nvim on the server | core not in `~/.local/bin` | step 2 |
| nvim never follows the agent | the agent runs on the PC, not on the server (or in another tab) | step 4 |
| Machine shows `unreachable` (or `connecting`) after a while | ssh dropped (VPN, sleep) | Herdr reconnects; terminals on the server keep running |
