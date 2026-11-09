# Changelog / 更新紀錄

Newest first. Each entry says what you need to do on your machine.
最新的在上面；每條寫了要做什麼。
Needs: **mods** = copy the two mod folders again (macOS symlinks: nothing) · **core** / **app** = rebuild ·
**keys** = see [docs/keys.md](docs/keys.md).

## 2026-11-10

- **Gerrit panel: name the ▶ button**: `"start_label": "Preflight"` in the `jenkins` block shows 「▶ Preflight」. Needs **gerrit** (Windows: copy it again), restart Herdr.
- **Gerrit panel: ▶ Preflight without watching Jenkins**: a `jenkins` block with `start_job` and no `jobs` gives only the start button (the results come back as messages under 合併條件). Needs **gerrit** (Windows: copy it again), restart Herdr.
- **Gerrit panel: check systems under 合併條件**: the bots that report back to Gerrit (build, test, any system, Jenkins or not) show under the requirement they vote on, from their messages on the latest patch set: ⏳ running for how long / ✓ / ✗, the message's first line and its links (click to open in the browser). Optional `bots` in `gerrit.json` names the accounts. Needs **gerrit** (Windows: copy it again), restart Herdr.
- **Gerrit panel: Jenkins builds** ([docs/gerrit.md §6](docs/gerrit.md#6-jenkins-builds--jenkins-build)): a change's page lists the Jenkins builds that have its number in a parameter: progress (跑了 / 平常), result, queue, the log's last lines live, ▶ to start the job, and a notification when one finishes. Needs **gerrit** (Windows: copy it again), a `jenkins` block in `gerrit.json` with an API token, restart Herdr.
- **Gerrit panel: 合併條件** on a change's page: Gerrit's submit requirements, what is still missing first (⊘, who voted), passed ones folded when many. Needs **gerrit** (Windows: copy it again), restart Herdr.
- **Gerrit panel: ← 返回 goes back one page** like a browser: after clicking a topic, a change in 「同一個 topic」, a search result or a file, it returns to the page you were on (before, a topic search had no way back). Needs **gerrit** (Windows: copy it again), restart Herdr.
- **Gerrit panel: topics** ([docs/gerrit.md §3](docs/gerrit.md#3-what-you-see--畫面)): the topic on a change (click: search it; ✎ set / change / remove) and on list rows; 「同一個 topic」 lists its other changes in any project; with whole-topic submit the merge button says how many it merges. Needs **gerrit** (Windows: copy it again), restart Herdr.
- **Gerrit panel: compare two patch sets** ([docs/gerrit.md §3](docs/gerrit.md#3-what-you-see--畫面)): pick 從 (Base or an older patch set) and 到; the files and diffs show only what changed between them, comments on their side. Needs **gerrit** (Windows: copy it again), restart Herdr.
- **Gerrit panel: search, rebase / abandon / WIP** ([docs/gerrit.md §3](docs/gerrit.md#3-what-you-see--畫面)): a search box above the sections (a number or pasted Gerrit link opens the change; other text is a Gerrit search; Enter works), `{"search":"…"}` for a search in its own tab; on a change, Rebase, Ready / WIP, Abandon (press twice) and Restore, shown only when Gerrit allows them. Needs **gerrit** (Windows: copy it again), restart Herdr.
- **Gerrit panel: Reviewer／CC** on a change's page: see them, add (search by name → 加 Reviewer / 加 CC), move between the two, remove (on your own changes). Score rows show the label's full name (Code-Review, Build, Verified …). Needs **gerrit** (Windows: copy it again), restart Herdr.
- Gerrit panel: tests (`node tests/gerrit/run.js`, no Herdr or Gerrit needed): settings file, login errors, change ids with "/", one section per change, old Gerrit without attention, notifications, reply / thread reply / submit requests, diff folding, and drawing every page without Herdr's render errors.
- **Gerrit panel: each change in one section** ([docs/gerrit.md §3](docs/gerrit.md#3-what-you-see--畫面)): 輪到你 no longer repeats under the others, which are now 我送出的（等對方）and 我在 review（等對方）. The 在瀏覽器開 button is gone (long diffs load more in place). Needs **gerrit**, restart Herdr.

- **Gerrit panel: diffs** ([docs/gerrit.md §3](docs/gerrit.md#3-what-you-see--畫面)): click a file for its diff in the panel (red / green rows, folded unchanged lines, comments inline, previous / next file), click a line to comment. The change page reads like Gerrit's: files, comments, then reply / vote. No width limit (drag the edge; a panel moved with 移到上排 before today: delete `"max"` of `gerrit-panel` in your layout). `props {open, diff}` starts a copy on a change. Fixed: projects with a "/" in the name (change id escaped twice: details, diffs and every reply failed with 404). Needs **gerrit**, restart Herdr.

- **Gerrit panel: reply, vote, submit without the web page** ([docs/gerrit.md §3](docs/gerrit.md#3-what-you-see--畫面)): big score buttons per label, a reply box, 💬 送出回覆 (message + scores + drafts), ✅ 合併 (press twice); under comment threads ✓ Done / Ack / 💬 回覆. Tested against a local Gerrit 3.14. Needs **gerrit**, restart Herdr.

- **jay-nvim follows a root agent through a root view** ([docs/nvim.md §6](docs/nvim.md#6-agent-running-as-root--agent-用-root-跑)): when a root-side hook keeps copies you can read (`index.jsonl` + `blobs/`), name its folder in `~/.config/jay-nvim/root_view` and nvim opens root's file as a read-only copy, marked and at the line. The root-agent notice is one short line (no more "Press ENTER"), kept in `:messages`. Needs **mods**; nothing to do on machines without a root agent.

- **Gerrit panel sits with the other panels**: a **Gerrit** button in the tab bar (number = changes waiting for you) opens and closes it, and keeps checking and notifying while it's closed. A panel still docked outside shows a **移到上排** button that moves it there (on Herdr's own layout it first makes `main-jay`). Header buttons are bigger. Fixed: on Gerrit 3.14+ four default sections said 讀不到 (`-is:ignored` no longer exists there; dropped). Needs **gerrit** (copy `mods/gerrit`), restart Herdr, press 移到上排 once.

## 2026-11-09

Needs: **mods** (copy both again), **app** (build v0.1.14), and once per machine running Claude Code: the snap hook in its settings.

- **New: Gerrit panel** (`mods/gerrit`, [docs/gerrit.md](docs/gerrit.md)), step 1: Gerrit's dashboard sections (輪到你, WIP, 我送出的, 等我 review, CC, 最近合併), a change's votes, comment threads, files, commit message, patch sets and log, notifications when it turns to you or someone replies. Settings in `<home>/.config/herdr-app/gerrit.json` (HTTP password). Tested on a public Gerrit without a login only. Needs **gerrit** (copy `mods/gerrit`).
- **jay-nvim**: the tree lists a file the agent just created when nvim follows it (no closing and reopening). docs: nvim.md says which edits get marks outside a git repo. Needs **mods**.
- **jay-nvim follow fix**: newer Claude Code logs `api-request-blob` records that repeat earlier tool calls; jay-nvim read them as new and jumped back to an older file. Only the agent's own records count now. Needs **mods**.
- docs: windows.md §4 — Neovim on Windows can be skipped when you only work on a Linux server.
- **jay-nvim: no trust step** (jay's choice): pyright / TypeScript start in every project, no `:JayTrust` (command removed; `~/.config/jay-nvim/trust` no longer read). They run the project's own Python / TypeScript as you: don't open repos you don't trust. Needs **mods**.
- docs: [linux-remote.md §3b](docs/linux-remote.md#3b-python-go-to-definition-pyright-optional--python-跳定義選用): Python go-to-definition on the server with npm's pyright 1.1.414 on the server's own Node (online or offline `.tgz`, tested offline on Mac), how to use it (`:JayTrust`, right-click 跳到定義, `gd`, `ctrl-o`) and what to check when the right-click menu is missing. Ask the company first: it is packed JavaScript, not source. The `.tgz` is also on herdr-jay's release `pyright-1.1.414` (same sha256 as npm's).
- docs: Neovim is built **on the Linux server** (not on the PC like herdr-core) said plainly in linux-remote §3, windows §8, agent-install; §3a can pack the source on any Linux / Mac that can download (tested: 14 files). Company server: built and following.
- Install guides now include the **snap hook** step: [windows.md §5a](docs/windows.md#5a-snap-hook-for-claude-code--snap-hook),
  [linux-remote.md §4](docs/linux-remote.md#4-agents-on-the-server--server-上的-agent), and row 8 of
  [agent-install.md](docs/agent-install.md). Each machine running Claude Code adds the hook once.
  安裝文件補上 snap hook：每台跑 Claude Code 的機器加一次。
  Windows: matcher `Bash|PowerShell`, and the home folder is the one nvim reports (may be `H:\`), not always `C:\Users\<you>`.
- **Snap hook fixes** (review): the `/proc` `/sys` `/dev` skip never applied (a Lua `and nil or` slip), so e.g.
  `/proc/self/environ` was copied; a file swapped for a FIFO after the check could stall the command; jay-nvim now
  writes the hook file via a temp file + rename, so a hook starting meanwhile never runs half a file.
  修 snap hook：/proc 等沒真的跳過、FIFO 可能卡住、寫 hook 檔改成先寫暫存再換名。
- docs/nvim.md: §4 (macOS vs Windows), §5 (how it is built) and §6 (agent as root) were cut by mistake in the
  previous change; back.
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
