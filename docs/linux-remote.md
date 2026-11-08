# A Linux server as a Herdr machine / 把 Linux server 加成 Herdr 的機器

Herdr runs on your Windows PC (or Mac); a Linux server joins it over **ssh** as a "machine": its terminals and agents
show up in the same window. Nothing graphical runs on the server, and **no root is needed**.
Herdr 在 Windows（或 Mac）上跑；Linux server 用 ssh 加進來當「機器」，不用 root。

Not yet run on a real company server: note what differs and bring it to jay.

| Step / 步驟 | |
|---|---|
| [1](#1-ssh-key--ssh-金鑰) | ssh key (once) / ssh 金鑰 |
| [2](#2-add-the-machine--加機器) | Add the machine (Herdr installs its core there) / 加機器 |
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

## 2. Add the machine / 加機器

In Herdr: **Settings → Add machine** (or the `+` menu), enter `<user>@<server>` (or your ssh config name).
If the server has no herdr-core, Herdr offers to install it: it takes **the official build of the same version as
your core** for Linux, downloads it on your PC and copies it over ssh into `~/.local/bin` on the server (the
server needs no internet). If it needs a password, a new host key or something installed, it tells you what to run.
Herdr 會把同版本的官方 Linux core 從你電腦傳上去，裝在 server 的 `~/.local/bin`。

Your PC must reach the release download hosts (`github.com`, `objects.githubusercontent.com`,
`release-assets.githubusercontent.com`: already in the Windows host list).

Self-built core on the server instead (same public source, like the PC): later, if jay wants it — needs Rust 1.95.0
and Zig 0.16.0 on the server; ask jay first.

**Check** on your PC: `hc machine ls` shows the machine `connected` and its `version` equals `hc --version`.
After you update your own core, update the server's too: `hc machine update <name>` (terminals keep running).

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
| "hc … has no release to download" | your core is self-built at a version without an official Linux release | ask jay |
| Download fails while adding | the PC can't reach GitHub's release hosts | host list to IT (Windows guide step 0) |
| "nvim not found on <server>" | nvim not in `~/.local/bin` | step 3 |
| "jay-nvim needs Neovim 0.11 or newer" | apt's old nvim found first | step 3 (`~/.local/bin` is searched first) |
| "找不到 hc" in nvim on the server | core not in `~/.local/bin` | re-add the machine, or `hc machine update <name>` |
| nvim never follows the agent | the agent runs on the PC, not on the server (or in another tab) | step 4 |
| Machine shows `disconnected` after a while | ssh dropped (VPN, sleep) | Herdr reconnects; terminals on the server keep running |
