# Changelog / 更新紀錄

Newest first. Each entry says what you need to do on your machine.
最新的在上面；每條寫了要做什麼。
Needs: **mods** = copy the two mod folders again (macOS symlinks: nothing) · **core** / **app** = rebuild ·
**keys** = see [docs/keys.md](docs/keys.md).

## 2026-11-09

Needs: **mods** (copy both again), **app** (build v0.1.14).

- Install guides now include the **snap hook** step: [windows.md §5a](docs/windows.md#5a-snap-hook-for-claude-code--snap-hook),
  [linux-remote.md §4](docs/linux-remote.md#4-agents-on-the-server--server-上的-agent), and row 8 of
  [agent-install.md](docs/agent-install.md). Each machine running Claude Code adds the hook once.
  安裝文件補上 snap hook：每台跑 Claude Code 的機器加一次。
  Windows: matcher `Bash|PowerShell`, and the home folder is the one nvim reports (may be `H:\`), not always `C:\Users\<you>`.
- docs/windows.md: build tools reduced to the versions needed; **§8 Updating** now covers everything that gets
  updated — herdr-jay, core on the PC and the Linux server, app, mods, Neovim — in one order. README names the Neovim version.
  更新步驟集中在 §8：PC 和 server 的 core、app、mod、Neovim。
- **jay-nvim security fixes** (review): an untrusted repo could still make nvim's own git calls run a program — a
  filter name containing `=`, the `post-index-change` hook through `git status`, a partial clone's lazy fetch
  (`uploadpack` / `sshCommand`), a submodule's filter, and netrw's `git ls-files` on git older than 2.31. Now every git
  call has hooks, index writes and fetching off, `status` skips submodules, a `=` filter name means no git there, and
  netrw's call is guarded through `GIT_CONFIG_PARAMETERS`. Also: follow mode was one hour off in daylight-saving time
  zones. 修正：別人的 repo 還有幾種方法讓 nvim 的 git 跑程式，全部擋掉；夏令時間差一小時。
- **Snap hook** (jay-nvim): the Claude Code hook that saves a file before a Bash command changes it is now part of
  jay-nvim (Lua, run with `nvim -l`, written to `~/.config/jay-nvim/snap_hook.lua` on every machine jay-nvim runs on;
  macOS, Windows, Linux). Turn it on in Claude Code's settings: [docs/nvim.md §7](docs/nvim.md#7-snapshots-for-bash-edits-optional--bash-改檔的快照選用).
  snap hook 進 jay-nvim，三個系統都能用。
- docs/linux-remote.md: the server's herdr-core is now **built on the Windows PC** for Linux
  (`x86_64-unknown-linux-musl`) and copied over; the server needs no Rust or Zig and builds nothing for it. Only
  Neovim v0.12.6 is built on the server, from source (needs `gcc`, `make`, `cmake`); a server without internet gets
  Neovim's source + libraries as a pack from the PC (§3a). pip `ruff` / `pyright` are prebuilt: not for a
  source-only server. 公司 server：core 在 Windows 上 build 好複製過去，server 只 build Neovim。
- docs/windows.md: IT allow-list also names `%TEMP%\hc-local-*` (the core install script runs from there).
- Security fix (jay-nvim): the git guard missed filters set in a file the repo's `.git/config` includes
  (`include.path` / `includeIf`) or in `config.worktree`; nvim's own `git status` in such a repo ran them. Now
  read with `--includes --show-scope`. 修正：別人的 repo 用 include 藏的 git filter 會被執行。

- Herdr app v0.1.14 (`2405bf3`; core stays v0.1.19). No default key changes; the mod API change (exec timeout) doesn't
  affect these mods. First tag checked on both OSes will be `for-herdr-v0.1.14-r1`.
- New [docs/linux-remote.md](docs/linux-remote.md): a Linux server as a Herdr machine over ssh (key login, herdr-core
  built on the PC for Linux and copied, Neovim built on the server, agents on the server).
- New [docs/agent-install.md](docs/agent-install.md): runbook for a coding agent installing PC + server. jay-nvim also finds `~/.local/bin/herdr-core`.

- nvim opens in the focused pane's folder (it could start in the space's folder).
- Root handoff removed: a sudo'd agent beside the pane gets a one-time warning, no follow (docs/nvim.md 6).
- git safety: also the repo's own clean / smudge filters are off for nvim's git calls (not only fsmonitor);
  no git at all on Windows when only a project-folder git exists.
- Re-sourcing keeps the tree and unsent comments; trust-file lines for home or above are ignored.
- Fixes: UTF-8-safe cut of long comments, renames in the pick list, pick reports a failed key send,
  two Windows opens at once, `--out=/path` and paths inside quoted code in Bash commands.
- docs: Windows TLS revocation / AppLocker / tar / winget-less notes, blocks that work in a fresh window;
  macOS Intel PATH, update block stops on a bad tag and checks the core version before installing.

## 2026-11-08 (review 2)

Needs: **mods** (copy again; both mods changed together — use them as a pair).

- History rewritten once (2026-11-08) to remove session links from old commit messages; file contents unchanged.
  The old tag `for-herdr-v0.1.13` was re-created on the rewritten commit (the one exception to "tags never move").
  A clone from before: `git fetch --force --tags && git reset --hard origin/main` (or clone again).

- jay-nvim-pick always sends alt+o (`<M-o>`); finds the pane by a marker argv item, not the word "jay-nvim".
- Comments go only to known coding agents (never a shell / ssh / REPL), in this tab (by tab id); long lines cut.
- `:JayTrust` refuses home and above; git runs with `core.fsmonitor` off.
- Windows: programs under your home (scoop, npm) are found again; paths compared ignoring case everywhere;
  `C:\Program Files\…` and `/c/…` paths in Bash commands.
- Neovim older than 0.11 now says so instead of a Lua error; re-sourcing doesn't double timers.
- docs: zsh-safe macOS commands, safer update blocks (macOS and Windows), Windows TLS / PATH / SDK notes.

## 2026-11-08

Needs: **mods**, and **core** (apply `patches/herdr-core/v0.1.19`).

- herdr-core v0.1.19 now means upstream's moved tag `06793ed` (2 CI/test commits after `2e8ebb3`): `git fetch --tags --force`
  before checking it out. Built on `2e8ebb3` already? Nothing changes for you; rebuilding is optional.

- Install guides for macOS and Windows ([docs/macos.md](docs/macos.md), [docs/windows.md](docs/windows.md)),
  jay-nvim guide [docs/nvim.md](docs/nvim.md), this changelog, [docs/keys.md](docs/keys.md), versions table in README.
- Core patch: skip Ghostty's xcframework, so core builds with only the macOS Command Line Tools (harmless on Windows).
- jay-nvim:
  - split into `main.js` / `unix.js` / `windows.js`; every OS difference in the Lua's PLATFORM section.
  - Windows: finds Claude Code's session behind pwsh; one spelling for paths; pwsh / cmd count as shells;
    home like Claude Code; paths in Bash commands (`C:\`, `C:/`, `/c/`); the init file is `:source`d (no trouble with
    `#`, `%` or non-English user names); programs never run from the project folder.
  - Security: control characters are removed from comments sent to the agent; pyright and the TypeScript server
    (which run project code) start only in folders you trust (`:JayTrust`).
  - jay-nvim-pick sends no Esc first (could type an "o" on Windows); nvim maps the pick key in every mode.
  - Neovim 0.11 is enough (was 0.12).
  - "another nvim has this file" and `gd` compare paths correctly on Windows.
- License: Apache-2.0 for everything.
