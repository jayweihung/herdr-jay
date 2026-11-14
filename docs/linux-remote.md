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
| [3b](#3b-python-go-to-definition-pyright-optional--python-跳定義選用) | Python go-to-definition: pyright (optional) / Python 跳定義 |
| [4](#4-agents-on-the-server--server-上的-agent) | Agents on the server |
| [5](#5-try-nvim-jay-there--試-nvim-jay) | Try nvim-jay there |
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
`herdr-core/patches/<tag>/` (as in [windows.md step 2](windows.md#2-herdr-core-hc)), for **Linux x86_64**
(`x86_64-unknown-linux-musl`, a static program like the official Linux release, so it runs on any distro;
ARM server: `aarch64-unknown-linux-musl`). The version must equal the PC's core (`hc --version`).

**Build** (PowerShell on the PC, after [windows.md step 2](windows.md#2-herdr-core-hc): same clone, same tag and
patches; Zig is already there). `rust-lld` comes with Rust, so no Linux C compiler is needed:
（在 PC 上，跟 Windows 版同一份 source；`rust-lld` 是 Rust 自帶的，不用另外裝 Linux 的編譯器）

```powershell
Set-Location "$env:USERPROFILE\src\herdr-core"
rustup target add x86_64-unknown-linux-musl
$env:CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER = "rust-lld"
cargo build --release --locked --target x86_64-unknown-linux-musl -p herdr-core
Test-Path target\x86_64-unknown-linux-musl\release\herdr-core    # must be True
```

(Checked on macOS with the same command: a static x86-64 Linux program. Not yet tried on Windows: if the link step
fails, bring the error to jay.) ARM server: `aarch64-unknown-linux-musl` in all three places.
（在 Mac 上用同樣指令試過可以；Windows 還沒實測，失敗就把錯誤訊息拿給 jay。）

**Copy and restart** (from the PC; `<user>@<server>` as in step 1). The new file goes next to the old one first, so a
broken copy never replaces a working core:

```powershell
scp target\x86_64-unknown-linux-musl\release\herdr-core <user>@<server>:.local/bin/herdr-core.new
ssh <user>@<server> 'cd ~/.local/bin && chmod 755 herdr-core.new && ./herdr-core.new --version && mv herdr-core.new herdr-core && { [ -e hc ] || ln -s herdr-core hc; } && ./herdr-core server restart'
```

No `~/.local/bin` on the server yet: `ssh <user>@<server> mkdir -p .local/bin` first.

**Where it goes on the server**: `~/.local/bin/herdr-core` (mode 755), plus `~/.local/bin/hc` as a link to it if
there is no `hc` yet. That folder matters: Herdr's "Add machine" and nvim-jay look for the core there. After
replacing it, `~/.local/bin/herdr-core server restart` (terminals there keep running).
放在 `~/.local/bin/herdr-core`（再加一個 `hc` 連結）；Herdr 和 nvim-jay 都在那裡找。

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

nvim-jay on a server pane looks for nvim in `~/.local/bin`, `/usr/local/bin`, `/usr/bin` and needs **0.11 or newer**.
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

Optional LSP for Python: the **pip** packages are prebuilt (`ruff` is a compiled program; `pyright` downloads Node.js),
so they are **not** for a source-only server. Without them nvim-jay works the same, only without go-to-definition,
hover types and lint errors. For go-to-definition see [3b](#3b-python-go-to-definition-pyright-optional--python-跳定義選用) (npm's pyright on the server's own Node).
Python 的 LSP 用 pip 裝的是現成程式，只能用原始碼的 server 不要裝；要跳定義看 3b。

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
    curl.exe -fsSL --ssl-no-revoke -o "$d\$(Split-Path -Leaf $u)" $u   # --ssl-no-revoke: company proxies often block the certificate revocation check
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
source fetched on an office Linux server, built on the RD server, nvim-jay follows there. The PowerShell part has not
run on Windows yet.

---

## 3b. Python go-to-definition: pyright (optional) / Python 跳定義（選用）

Right-click → 跳到定義 / 看型別, `gd`, `K` need **pyright** (ruff only lints; it is not needed for this).
跳定義、看型別要有 pyright（ruff 只檢查錯誤，不用裝）。

**Ask first**: npm's `pyright` is Microsoft's packed **JavaScript** (no compiled program inside; it runs on the
server's own Node). It is not plain source: pyright's own build needs `rspack`, which only comes prebuilt, so it
can't be built from source alone. If the company only allows source, skip this step (nvim-jay works without it).
先問公司：npm 的 pyright 是微軟打包好的 JavaScript（裡面沒有編好的執行檔，用 server 自己的 Node 跑），不是原始碼；
pyright 本身沒辦法只用原始碼 build。公司不准的話就跳過這步。

**Needs** Node ≥ 14 on the server (from IT; check `node --version` and `npm --version`).

Server can download (in a server terminal):

```sh
mkdir -p ~/.local/bin
npm install -g --prefix ~/.local --omit=optional --no-audit --no-fund pyright@1.1.414
```

Server can't reach npm: get the same file (`pyright-1.1.414.tgz`, about 4 MB) one of these ways, then copy it to the
server's home. server 連不到 npm：用下面任一種拿到同一個檔，再複製到 server 的家目錄。

- **From herdr-jay's release** (an unchanged copy of npm's file; the server or the PC only needs GitHub):
  從 herdr-jay 的 Release 下載（跟 npm 上的一模一樣）：
  ```sh
  curl -fLO https://github.com/jayweihung/herdr-jay/releases/download/pyright-1.1.414/pyright-1.1.414.tgz
  ```
  (PowerShell: `curl.exe -fLO --ssl-no-revoke …` the same URL — `--ssl-no-revoke` because company proxies often block Windows' certificate revocation check; or open the URL in a browser.)
- **From npm** on any machine that has it: `npm pack pyright@1.1.414`.

Then, if it isn't on the server yet: `scp pyright-1.1.414.tgz <user>@<server>:`

then on the server:

```sh
sha256sum ~/pyright-1.1.414.tgz              # must be bf5f473f6167c0d14175492c3263d783b4489a6956e1c06c18e15228e3a3fa42
mkdir -p ~/.local/bin
npm install -g --prefix ~/.local --offline --omit=optional --no-audit --no-fund ~/pyright-1.1.414.tgz
```

**Check**: `~/.local/bin/pyright --version` prints `pyright 1.1.414`. (Tested on a Mac: offline install from the
`.tgz` with an empty npm cache and no registry, with Node 26 / npm 11 and with Node 18 / npm 9.2.0; the package has no other
dependencies. npm 9 itself needs Node ≥ 14.17, so any server with npm 9 is new enough.)

**How to use / 怎麼用**

1. Close the nvim pane and open it again (`ctrl-shift-i`): nvim looks for pyright when it opens.
   nvim 那格關掉重開（`ctrl-shift-i`），它開的時候才會找 pyright。
2. Open a `.py` file of the project. pyright starts by itself; nothing to type (no `:JayTrust`).
   It runs the project's Python, so don't open repos you don't trust ([nvim-jay.md §3](nvim-jay.md#3-language-servers--語言伺服器)).
   打開 `.py` 檔 pyright 就會自己啟動，不用打任何指令。
3. Then, on a name:
   - **right-click** → 跳到定義 / 看型別 / 找所有用到的地方 / 改名 (Shift + right-click is Herdr's own menu);
   - or keys: `gd` go to definition, `K` its type, `grr` every use, `ctrl-o` jump back;
   - rest the mouse on a name: its type pops up.
   在名稱上按右鍵選「跳到定義」，或按 `gd`；`ctrl-o` 跳回來；滑鼠停在名稱上會顯示型別。
4. Check it runs: `:checkhealth vim.lsp` lists `pyright` under active clients.

| What you see / 看到什麼 | Why / 原因 | Fix / 怎麼修 |
|---|---|---|
| Right-click shows Herdr's menu (or nvim's English one), not the Chinese one | this nvim wasn't opened by nvim-jay, or the pane didn't get the `herdr.right-click=program` label | open nvim with `ctrl-shift-i`, not by typing `nvim`; `:lua print(JN ~= nil, vim.env.HC_TERMINAL_ID)` must print `true` and an id |
| The menu is there but 跳到定義 / 看型別 are grey | pyright not running here | no pyright (Check above); or the file was open before pyright was installed (`:e`) |
| `:checkhealth vim.lsp`: pyright exits, "env: node: No such file" | `node` not on the pane's PATH | ask IT where node is; it must be in `/usr/bin`, `/usr/local/bin` or `~/.local/bin` |
| `npm install` tries the network with `--offline` | an old npm, or the `.tgz` name differs | use the full path to the `.tgz`; `npm --version` ≥ 7 |

**Updating**: only when the README says so; the same steps with the new version.

---

## 4. Agents on the server / server 上的 agent

An agent that should work on the server's files runs **on the server**: open a tab on that machine and start it
there, only if the company already provides Claude Code on the server (it is a prebuilt program: don't install it
yourself on a source-only server; its login is per machine). No agent there → do §5 with the PC's agent and skip the snap hook below.
Agents on the Windows PC and on the server can sit in different tabs of the same Herdr window.
要改 server 上的檔，agent 就在 server 上跑（在那台機器的分頁裡開）。

nvim-jay follows the agent **in the same tab and on the same machine** as the nvim pane.

**Snap hook** (so nvim marks Bash edits outside a repo, [nvim-jay.md §7](nvim-jay.md#7-snapshots-for-bash-edits-optional--bash-改檔的快照選用)):
after nvim-jay has opened on the server once (§5 step 2 writes `~/.config/nvim-jay/snap_hook.lua`), back up the
server's `~/.claude/settings.json` and merge in (keep its other settings; if `"PreToolUse"` already exists, add this
entry to its list; no settings.json yet → wrap the snippet in `{ }`):
server 上的 Claude Code 也要加一次 hook（nvim-jay 在 server 開過一次之後）：

```json
"hooks": {
  "PreToolUse": [
    { "matcher": "Bash", "hooks": [{ "type": "command", "timeout": 15,
      "command": "~/.local/bin/nvim -l ~/.config/nvim-jay/snap_hook.lua" }] }
  ]
}
```

Restart the agent. **Check**: after it changes a file outside the repo with a shell command naming its full path,
`~/.cache/nvim-jay/snap/` has a new folder.
Optional, the **reply hook** (an agent answers the agents that messaged it before it stops,
[nvim-jay.md §7a](nvim-jay.md#7a-the-reply-hook-answer-the-agents-that-asked-optional--回覆檢查選用)): add a
`"Stop"` list next to `"PreToolUse"`:
選用：要 agent 停之前先回別的 agent 的訊息，再加這段：

```json
  "Stop": [
    { "hooks": [{ "type": "command", "timeout": 15,
      "command": "~/.local/bin/nvim -l ~/.config/nvim-jay/reply_hook.lua" }] }
  ]
```

The same command under `"SubagentStart"` and `"SubagentStop"` too lets the 關係 tab show the agent's own
sub-agents (子 N on its card). 同一行也放在 `"SubagentStart"`、`"SubagentStop"` 底下，關係圖就看得到子 agent。
Added before 2026-11-13? Then the line says `~/.config/jay-nvim/snap_hook.lua` (nvim-jay was called jay-nvim): that
old file is no longer updated, and its copies go where nvim-jay no longer looks. Change `/.config/jay-nvim/` to
`/.config/nvim-jay/` in the line (after a new nvim-jay pane has opened there once), restart the agent; the old
`~/.config/jay-nvim` and `~/.cache/jay-nvim` can be deleted ([CHANGELOG](../CHANGELOG.md) 2026-11-13).
2026-11-13 以前加的 hook 寫的是 `~/.config/jay-nvim/…`：改成 `nvim-jay`，再重開 agent。

Codex or omp on the server instead: nvim follows them without any hook. Their hooks (snap, reply) go in their own
settings there, `~/.codex/hooks.json` and `~/.omp/agent/hooks/pre/nvim-jay.js`, with `~/.local/bin/nvim` and
`/home/<you>/...`: [nvim-jay.md §7b](nvim-jay.md#7b-codex-and-omp--codex-和-omp).
server 上跑的是 Codex 或 omp：跟著開檔不用設定；hook 照 nvim-jay.md §7b 加在它們自己的設定裡。

---

## 5. Try nvim-jay there / 試 nvim-jay

1. Open a tab on the server machine in a project folder, start Claude Code there.
2. With its pane focused: `ctrl-shift-i` (Windows) / `cmd-e` (Mac) → nvim opens **on the server**, beside it.
3. Ask the agent to read / edit a file → nvim follows (then add the snap hook, §4); `ctrl-shift-j` / `cmd-o` → the list (kit 0.4.0 on the server: [agent-files.md](agent-files.md)); pick a file → it opens in that nvim.
4. `space a c` → comment, `space a s` → sent to the agent.
5. Only if pyright is on the server ([3b](#3b-python-go-to-definition-pyright-optional--python-跳定義選用)): right-click a name → 跳到定義.

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
| "nvim-jay needs Neovim 0.11 or newer" | apt's old nvim found first | step 3 (`~/.local/bin` is searched first) |
| "找不到 hc" in nvim on the server | core not in `~/.local/bin` | step 2 |
| nvim never follows the agent | the agent runs on the PC, not on the server (or in another tab) | step 4 |
| Machine shows `unreachable` (or `connecting`) after a while | ssh dropped (VPN, sleep) | Herdr reconnects; terminals on the server keep running |
