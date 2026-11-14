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
- **kit**: kit：只從公司自己的 Git 伺服器，網址問 jay. Not from GitHub or anywhere else, even if a page names it.
- **jay does, not you**: passwords and logins (GitHub, Claude Code, Codex `codex login`, omp `omp login`, sudo / admin prompts, the one ssh password in
  linux-remote step 1), accepting licenses (Visual Studio Build Tools, etc.), anything IT must allow. Stop and ask.
- **No root / admin** unless jay says so; everything installs into the user's home.
- **Shared server**: build only Neovim there, with the low-priority command in linux-remote step 3. Don't touch
  other users' files, system config or services.
- **Check every step** with the guide's **Check** line before going on; on a failure, don't improvise around it:
  show jay the exact error and the guide's "When something goes wrong" row.
- **Source only on the server**: herdr-core for the server is built **on the PC** (Linux target) and copied; Neovim
  is built on the server from source. Never put anything prebuilt by others there (no official hc, no Neovim
  tarball / AppImage, no pip `ruff` / `pyright`). npm's pyright (packed JavaScript, linux-remote §3b) only if jay
  says the company allows it.
- **Public repo**: never commit or push to herdr-jay; never write company names, hosts, accounts or IPs into it.

## Order / 順序

| # | Where | What | Guide |
|---|---|---|---|
| 1 | PC | Windows steps 0–5 (5a comes in row 2, at §6 step 3; §5 steps 5–6, kit and the layout, only in row 9): Git, tools, herdr-core, herdr-app, Neovim, herdr-jay mods (`nvim-jay`, `agent-files`) + keys. Agents: Claude Code, and Codex / omp only if jay uses them (§4: check, login, Codex as `codex --no-daemon`, omp in `programs.json`) | [windows.md](windows.md) |
| 2 | PC | Windows step 6 checklist (jay presses the keys; you read the screens / `:messages`) | [windows.md §6](windows.md#6-test-checklist--實測清單) |
| 3 | PC → server | ssh key; `ssh <user>@<server> echo ok` without a password | [linux-remote.md §1](linux-remote.md#1-ssh-key--ssh-金鑰) |
| 4 | PC → server | herdr-core at the README tag + patches built on the PC for Linux (`x86_64-unknown-linux-musl`), copied to `~/.local/bin/herdr-core` (+ `hc` link), restarted | [linux-remote.md §2](linux-remote.md#2-herdr-core-for-the-server-built-on-the-pc--server-的-core在-pc-上-build) |
| 5 | server | Neovim v0.12.6 built from source **on the server** (not on the PC: it only builds on Linux), and git | [linux-remote.md §3](linux-remote.md#3-neovim-and-git-on-the-server--server-上的-neovim-和-git); server can't download → [§3a](linux-remote.md#3a-server-cant-download--server-不能上網) |
| 6 | PC (jay clicks) | Settings → Add machine; never run `hc machine add` / `hc machine update` it may suggest, answer **n** to "Copy this hc" | [linux-remote.md §2b](linux-remote.md#2b-add-the-machine--加機器) |
| 7 | both | linux-remote §5 test, with an agent running on the server | [linux-remote.md §5](linux-remote.md#5-try-nvim-jay-there--試-nvim-jay) |
| 8 | server | Snap hook (PC already done in row 2): if a Claude Code agent runs on the server, after nvim-jay has opened there once, merge the PreToolUse hook into that machine's `~/.claude/settings.json` (keep its other settings; back it up first) | [windows.md §5a](windows.md#5a-snap-hook-for-claude-code--snap-hook), [linux-remote.md §4](linux-remote.md#4-agents-on-the-server--server-上的-agent), [nvim-jay.md §7](nvim-jay.md#7-snapshots-for-bash-edits-optional--bash-改檔的快照選用) |
| 9 | PC **and** server (only if jay asks) | jay's layout: kit itself (0.3.0 or later: `kit api` prints `1.0`) from the **company** Git server (kit's own guide), on the PC **and on the server** (the Kit button asks kit where the agent runs; without it the server's panes say 「沒有 kit」); the `kit` mod on the PC ([kit.md → Install](kit.md#install--安裝)); then the layout. The Gerrit panel is optional: without the `gerrit` mod its place in the layout shows an error, everything else works | [kit.md](kit.md), [layout.md](layout.md), [gerrit.md](gerrit.md) |

Server steps run through ssh from the PC, e.g. `ssh <user>@<server> 'bash -lc "…"'`, or in a Herdr tab on that
machine once step 6 is done. A long build: run it in a Herdr terminal on the server (it survives a dropped ssh).

## What to report to jay / 回報

```
(PC lines are PowerShell; Windows `<home>` = windows.md §6 step 3)
PC:      hc --version ; herdr-app --version ; git -C "$env:USERPROFILE\src\herdr-jay" describe --tags --always
PC:      claude --version ; codex --version ; codex login status ; omp --version   (the last three only if jay uses them)
server:  ~/.local/bin/herdr-core --version ; ~/.local/bin/nvim --version | head -1
server:  claude --version ; codex --version ; omp --version   (those the company provides there: linux-remote §4)
PC:      git -C "$env:USERPROFILE\src\herdr-core" describe --tags   (the source both cores were built from)
PC:      hc machine ls          (the server: connected, same version)
PC:      the PreToolUse command in $env:USERPROFILE\.claude\settings.json, and whether <home>\.cache\nvim-jay\snap\ got a folder
server:  the same in ~/.claude/settings.json and ~/.cache/nvim-jay/snap/ (if an agent runs there)
row 9:   PC: kit api ; herdr-app check "$h\mods\kit"   ($h as in windows.md §5)     server: kit api
```

plus which checklist steps passed / failed (with the error text).
