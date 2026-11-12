# Changelog / 更新紀錄

Newest first. Each entry says what you need to do on your machine.
最新的在上面；每條寫了要做什麼。
Needs: **mods** = copy the two mod folders again (macOS symlinks: nothing) · **core** / **app** = rebuild ·
**keys** = see [docs/keys.md](docs/keys.md).

## 2026-11-12 (folders)

Needs: **mods** (they moved: copy again from the new folder; macOS symlinks: link again).

- The repo now uses Herdr's own folder names, so a path here says where it goes: `herdr-app/mods/<mod>` →
  `~/.config/herdr-app/mods/<mod>`; patches to Herdr's source are in `herdr-core/patches/<tag>/` and
  `herdr-app/patches/<tag>/` (were `patches/<repo>/<tag>/`); `patches/README.md` is now [docs/patches.md](docs/patches.md).
  資料夾改用 Herdr 自己的名字：`herdr-app/mods/…` 就是裝到 `~/.config/herdr-app/mods/…`；補丁在 `herdr-core/patches/`。
  macOS: `cd ~/.config/herdr-app/mods && ln -sfn ~/src/herdr-jay/herdr-app/mods/jay-nvim ~/src/herdr-jay/herdr-app/mods/jay-nvim-pick .`
  (and `gerrit` the same way if you use it).
  Windows: the copy block in [windows.md §8](docs/windows.md) (already uses the new folder).
- New `herdr-app/layouts/jay.json`: jay's layout (Agents, Kit, Gerrit buttons and panels; the Kit bar on every
  terminal). Optional: [docs/layout.md](docs/layout.md).

## 2026-11-12

Needs: **core** (build v0.1.20, no patches), **app** (build v0.1.15), in that order; restart Herdr.

- Herdr core v0.1.20 (`de97ea5`) and app v0.1.15 (`9950887`), checked on macOS. Core v0.1.20 needs **no patches**:
  the one v0.1.19 had (skip Ghostty's xcframework) is in the official source now (#182);
  `patches/herdr-core/v0.1.20/` holds only a README.md. Applying the old v0.1.19 patch on v0.1.20 breaks the build.
  core v0.1.20 不用 patch（官方已收進去）；app v0.1.15。
- No default key changes, no hc API change; the mod API change (`knownAgents()` rejects when its check fails, parent
  addresses) doesn't affect these mods (`herdr-app check` ok on all).
- macOS: terminals opened by a core older than 0.1.20 can still end when Herdr quits. Install core first; after
  that, close and reopen old terminals when convenient (or restart the Mac).
- First tag checked on both OSes will now be `for-herdr-v0.1.15-r1`.
- **jay-nvim finds newer Claude Code's session** ([docs/nvim.md](docs/nvim.md)). Needs **mods** (macOS symlinks:
  nothing; reopen the nvim pane). Claude Code 2.1.322 no longer writes `~/.claude/sessions/<pid>.json`, so follow
  found nothing. Now, after that file: Claude Code's `~/.claude/daemon/roster.json` (background / remote-control
  sessions: the worker whose `pid` or `replPid` is the agent or under the pane), then, on every system, the agent's
  transcript folder `~/.claude/projects/<cwd with non-A-Z a-z 0-9 as ->`: the newest log changed since that Claude
  Code started (else in the last 24 h); `/clear`'s new log is followed. Two Claude Codes in one folder may swap.
  Only a plain file inside `~/.claude/projects` is followed (no link out of it). Snap hook unchanged.
  新版 Claude Code 不再寫 `sessions/<pid>.json`，跟檔改從 roster 或 agent 所在資料夾找對話紀錄。
- **jay-nvim follow fixes** ([docs/nvim.md](docs/nvim.md)). Needs **mods** (macOS symlinks: nothing; reopen the nvim
  pane). Follow keeps going after a Bash command that fails, follows a background Bash when it ends, follows
  sub-agents (Task), opens a new file the agent writes once it is there, prefers the files a Bash command names over
  other changes in the repo, `~/x` and `$HOME/x` count as paths (also in the snap hook, which jay-nvim rewrites
  itself), a stuck `hc` or `git` no longer freezes nvim, size caps (files over 4 MB are not opened by follow), a first
  open after a snapshotted Bash edit marks that edit (not everything since the last commit), the Edit line comes from
  `old_string` first. Root view: records carry `pid`; only the root agent under this pane counts. Tests:
  `node tests/jay-nvim/run.js`.
  jay-nvim 跟檔修正：Bash 失敗後還會跟、背景 Bash、sub-agent、新寫的檔、hc／git 卡住不再凍住 nvim 等。
- **jay-nvim review fixes** ([docs/nvim.md](docs/nvim.md)). Needs **mods** (macOS symlinks: nothing; reopen the nvim
  pane). The 4 MB cap now also holds for the committed copy a file is marked against (a committed 20 MB log the agent
  emptied no longer makes millions of red lines), and at most 50 removed lines show per change, then 「…還有 N 行」.
  A program nvim gave up on is killed with what it started (Windows: `taskkill /T /F`, for Git for Windows' launcher
  `git.exe`); after `hc` times out nvim asks it nothing for 30 s, after a `git` call times out no more git that round;
  a catch-up read looks at only the last Bash result; a background Bash ends only by its own task notification, not
  by a tool result quoting one.
  **Snap hook changed**: it never copies keys or credentials (`~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config/gh`,
  `~/.kube`, `~/.netrc`, `~/.git-credentials`, `~/.docker/config.json`, also through a link). jay-nvim rewrites
  `~/.config/jay-nvim/snap_hook.lua` itself the next time it opens on a machine; a copy you made by hand anywhere
  else must be copied again (the settings.json entry stays the same). Copies older than 10 minutes are removed at the
  next Bash run (they always were).
  jay-nvim 審查修正：HEAD 也受 4 MB 上限、刪除行每段最多 50 行、卡住的程式連子程序一起砍、hc 卡住後 30 秒不問；
  snap hook 不再存金鑰／帳密檔（hook 檔有改，手動複製的那份要重抄）。

## 2026-11-10

- **Gerrit panel: the 問 agent buttons call skills** ([docs/gerrit.md §7](docs/gerrit.md#7-ask-an-agent--問-agent)): Review, 整理留言, 為什麼沒過 and 幫我回覆 now send `/gerrit-panel:review <change> <patch set> <url>` and so on; how to do each job is in the `gerrit-panel` plugin (`agents/gerrit-panel`). Needs **gerrit** (Windows: copy it again), a second `--plugin-dir` in `gerrit.json` `agent.start` ([§8 step 5](docs/gerrit.md#8-a-gerrit-agent-step-by-step--gerrit-agent-安裝步驟)), restart Herdr and the Gerrit agent; buttons you edited before: ✎ → 還原成原本的.
- **Gerrit panel: 為什麼沒過 brings the submit requirements**: the Gerrit tools don't return them, and an agent once went around them with its own REST calls. The button now adds what the panel sees (`{requirements}`), and the skills use only the Gerrit tools (no curl, never the MCP's config file with the password). Needs **gerrit** (Windows: copy it again), restart Herdr and the Gerrit agent.
- **Gerrit panel: 問 agent** ([docs/gerrit.md §7](docs/gerrit.md#7-ask-an-agent--問-agent)): on a change's page, send the Gerrit agent (opened by its ＋ button, so it has the Gerrit tools; other agents aren't offered) a preset request about the change (Review, 整理留言, 為什麼沒過, 幫我回覆; answers in Traditional Chinese; ✎ 編輯問題 edits them in the panel) by `hc send`; your own prompts and a start button in `gerrit.json` `agent`. Needs **gerrit**, restart Herdr.

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
