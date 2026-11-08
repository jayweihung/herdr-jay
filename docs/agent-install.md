# For a coding agent installing this / 給幫忙安裝的 agent

jay asks a coding agent (e.g. Claude Code on the company Windows PC) to install Herdr + herdr-jay **on the PC and on
a Linux server reached over ssh**, all built from source. This page is the agent's runbook; the human guides it
points to have every command.
jay 請 agent 幫忙裝：Windows 本機 + 用 ssh 連的 Linux server，全部從原始碼 build。這頁是給 agent 的流程。

## Rules / 規則

- **Sources**: only this repo (`https://github.com/jayweihung/herdr-jay`), the official `herdrdev/herdr-core` and
  `herdrdev/herdr-app` at the tags in the [README versions table](../README.md#versions--版本), and the tool
  downloads the guides name. Never `hc update`, never Herdr's "Update herdr-core" / install button, never
  `hc machine update`: they install official builds instead of ours.
- **jay does, not you**: passwords and logins (GitHub, Claude Code, sudo / admin prompts, the one ssh password in
  linux-remote step 1), accepting licenses (Visual Studio Build Tools, etc.), anything IT must allow. Stop and ask.
- **No root / admin** unless jay says so; everything installs into the user's home.
- **Shared server**: build only with the low-priority, memory-capped command in linux-remote step 2. Don't touch
  other users' files, system config or services.
- **Check every step** with the guide's **Check** line before going on; on a failure, don't improvise around it:
  show jay the exact error and the guide's "When something goes wrong" row.
- **Public repo**: never commit or push to herdr-jay; never write company names, hosts, accounts or IPs into it.

## Order / 順序

| # | Where | What | Guide |
|---|---|---|---|
| 1 | PC | Windows steps 0–5: Git, tools, herdr-core, herdr-app, Neovim, herdr-jay mods + keys | [windows.md](windows.md) |
| 2 | PC | Windows step 6 checklist (jay presses the keys; you read the screens / `:messages`) | [windows.md §6](windows.md#6-test-checklist--實測清單) |
| 3 | PC → server | ssh key; `ssh <user>@<server> echo ok` without a password | [linux-remote.md §1](linux-remote.md#1-ssh-key--ssh-金鑰) |
| 4 | server (over ssh) | Rust + Zig in home, herdr-core from source at the README tag + patches, install to `~/.local/bin` | [linux-remote.md §2](linux-remote.md#2-herdr-core-on-the-server-built-from-source--server-上自己-build-core) |
| 5 | server | Neovim 0.11+ and git | [linux-remote.md §3](linux-remote.md#3-neovim-and-git-on-the-server--server-上的-neovim-和-git) |
| 6 | PC (jay clicks) | Settings → Add machine; decline any offer to install hc | [linux-remote.md §2b](linux-remote.md#2b-add-the-machine--加機器) |
| 7 | both | linux-remote §5 test, with an agent running on the server | [linux-remote.md §5](linux-remote.md#5-try-jay-nvim-there--試-jay-nvim) |

Server steps run through ssh from the PC, e.g. `ssh <user>@<server> 'bash -lc "…"'`, or in a Herdr tab on that
machine once step 6 is done. A long build: run it in a Herdr terminal on the server (it survives a dropped ssh).

## What to report to jay / 回報

```
PC:      hc --version ; herdr-app --version ; git -C %USERPROFILE%\src\herdr-jay describe --tags --always
server:  ~/.local/bin/hc --version ; ~/.local/bin/nvim --version | head -1 ; git -C ~/src/herdr-core describe --tags
PC:      hc machine ls          (the server: connected, same version)
```

plus which checklist steps passed / failed (with the error text).
