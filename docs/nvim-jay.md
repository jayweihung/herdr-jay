# nvim-jay: Neovim beside your agent / agent 旁邊的 Neovim

What it does and how to use it, the same on every OS. Installing: [macOS](macos.md) · [Windows](windows.md).
功能和用法（各系統一樣）。安裝請看 [macOS](macos.md)、[Windows](windows.md)。

The Herdr mod `nvim-jay` opens the pane. The list of the agent's files from Herdr (`cmd-o`) is the `agent-files` mod
([agent-files.md](agent-files.md)): with an nvim-jay pane in the tab, the file you pick opens there.
Needs **Neovim 0.11 or newer**, `git`, and `hc` on the machine where the pane opens.

## Contents / 目錄

1. [Features](#1-features--功能)
2. [Keys](#2-keys--按鍵)
3. [Language servers](#3-language-servers--語言伺服器)
4. [macOS vs Windows](#4-macos-vs-windows--兩個系統的差別)
5. [How it is built](#5-how-it-is-built--程式結構)
6. [Agent running as root](#6-agent-running-as-root--agent-用-root-跑)
7. [Snapshots for Bash edits (optional)](#7-snapshots-for-bash-edits-optional--bash-改檔的快照選用)
8. [When something goes wrong](#8-when-something-goes-wrong--出問題時)
9. [Gerrit review mode](#9-gerrit-review-mode--gerrit-review-模式)

---

## 1. Features / 功能

- **Follow the agent**: opens the file the agent beside it (Claude Code) last read or edited — several agents:
  whichever touched a file last; its sub-agents (Task) count too. A file the agent writes new opens once it is
  written (after you approve it). Never while you type or with unsaved changes; files over 4 MB are skipped
  (`space o` still lists them), and a file whose last commit is over 4 MB is not marked against it. `space a f` toggles.
  跟著 agent 開檔（含它叫出來的 sub-agent）。
- **Live reload with a diff**: files the agent edits reload every second; changed lines show like Claude Code's diff
  (red `-` old, green `+` new). Opening a file in a git repo marks what changed since the last commit.
  Outside a git repo there is no older copy to compare with, so only these get marks: changes made while the file is
  open in nvim, a file the agent wrote new (all `+`), and Bash edits with the snap hook ([7](#7-snapshots-for-bash-edits-optional--bash-改檔的快照選用)).
  The first jump to a file the agent edited earlier shows no marks there (outside a git repo). A file follow opens
  for the first time after a Bash edit with a snapshot is marked against the snapshot (that command's change), not
  against the last commit. At most 50 removed lines show per change, then one line 「…還有 N 行」 (an agent emptying a
  big file doesn't flood nvim).
  agent 改檔時自動重讀，標出改了哪幾行。不在 git repo 裡沒有舊版可比：只有開著時的修改、新寫的檔、和有 snap hook 的 Bash 修改有標記。
- **File tree** on the right ([nvim-tree](https://github.com/nvim-tree/nvim-tree.lua), bundled in the mod, GPL-3.0),
  without git-ignored files; git's marks (✗ changed, + added, ? new) and error dots beside names; the shown file is
  highlighted and the tree moves to its folder. One click on a folder opens or closes it, one click on a file opens
  it (a double click is the same as one). Right-click: 打開／展開／收起, 新增檔案 (a `/` at the end makes a folder),
  改名, 複製路徑, 重新整理, and the agent's files and follow. Nothing in it deletes. Keys: Enter or `o` opens, `R`
  reloads; the rest is the menu.
  檔案樹：點一下資料夾就展開／收起，點一下檔案就打開；右鍵有新增、改名、複製路徑、重新整理。
- **Comments to the agent**: comment a line or a selection, list, delete, and send them all to the agent with
  `hc send`. Control characters are removed before sending, so file text can't act as keys in the agent's terminal;
  quoted lines are cut at 200 characters. Only known coding agents (Claude Code, Codex, Gemini, opencode, pi, aider,
  …) count as agents — never a shell, ssh or a REPL, where the quoted lines would run as commands.
  Comment spans and message shape follow [herdr-nvim](https://github.com/ChmaraX/herdr-nvim) (MIT).
- **Files the agent touched**: a list of files the agent read or edited, newest first, plus files git shows as changed.
- **Language servers**: go to definition, hover, errors — see [3](#3-language-servers--語言伺服器).
- **Mouse**: rest the pointer on a name for its type, on an error to read it. Lists open what you click with one
  click: the tree, the errors / comments list, a review's file list. The middle button does nothing (it used to paste).
  滑鼠：清單都是點一下就開；中鍵不做事（以前會貼上）。
- **One menu (right-click)**: what can be done where you clicked, only what applies, in groups: the language server
  (跳到定義, 找所有用到的地方, 改名: only on a name), errors (the list shows each place once, with short paths),
  comments for the agent (刪掉 only on a commented line, 列出 / 送給 agent only when there are some), editing (剪下 / 複製 /
  貼上 on selected lines; 開網址 on a link). The agent's files and follow are in the tree's menu. On selected lines it is about
  those lines. Drawn like a desktop app's menu: a border, a line between groups, the key on the right (␣ = space);
  the mouse picks what it is over, a ▸ item opens its menu beside it, moving the mouse never closes it; a click
  outside, Esc or q does (selected lines stay selected). Keys work too: j k ↑ ↓, Enter / l / →, h / ←. Every list nvim
  asks you to pick from (which agent, which patch set, a language server's code actions) is this menu too.
  Herdr gives right-clicks to the program only when the pane is labelled `herdr.right-click=program`; nvim-jay sets
  that label. Shift + right-click still opens Herdr's menu.
  一個選單：右鍵就有這裡能做的事（只列用得到的），選幾行再右鍵就是那幾行的；滑鼠移過去就選、▸ 會在旁邊展開，
  點外面或 Esc 關掉。
- **Typing a name or a comment**: a box opens just under the line (title says what it is for, `Enter 送出 · Esc 取消`
  at the bottom); Esc, `q` or a click outside cancels. 要打字時（新名字、留言）在游標下面開一個小框，Enter 送出、Esc 或點外面取消。
- **Two panes on one file**: a heads-up the first time you change a file another nvim also has open.
- **Bash edits**: when a shell command of the agent ends (also with an error, also one run in the background), nvim
  opens what it changed: the files Claude Code saw it change, else a changed file the command names (`/abs/path`,
  `~/x`, `$HOME/x`, or relative to the agent's folder), else the newest changed file in the repo. When nvim catches
  up on several finished commands at once (it was busy), only the last one counts. A background command counts as
  ended only by Claude Code's own task notification, not by text that quotes one (a Read of a log).
  Bash 指令跑完（失敗或背景跑的也算）就開它改的檔：先看指令裡寫到的檔，沒有才找 repo 裡最新改的。

## 2. Keys / 按鍵

Herdr keys (in `keys.json`, `global`) — differ per OS because Windows has no cmd key:

| | macOS | Windows |
|---|---|---|
| Open nvim-jay beside the focused pane | `cmd-e` | `ctrl-shift-i` |
| The agent's files in a popup, picked one opens here ([agent-files](agent-files.md)) | `cmd-o` | `ctrl-shift-j` |

Inside nvim (`space` is the leader), the same everywhere:

| Key | What |
|---|---|
| right-click | the menu: what can be done here (on selected lines: with them; in the tree: the file or folder) |
| one click | in the tree, the errors / comments list or a review's file list: opens that one (a folder: open / close) |
| middle click | nothing |
| `space o` | files the agent read / edited (+ git changes) |
| `space a c` | comment this line (or the selection in visual mode) |
| `space a l` | list comments |
| `space a d` | delete the comment on this line |
| `space a s` | send all comments to the agent |
| `space a f` | follow the agent on / off |
| `gd` | go to definition; `K` hover; `[d` `]d` errors (nvim's defaults) |

## 3. Language servers / 語言伺服器

Started only if installed on that machine (never as root):

| Server | For | Runs project code? | Starts |
|---|---|---|---|
| `ruff` | Python lint | no (reads files) | always |
| `pyright` | Python types, go to definition | yes: the project's Python (its venv) | always |
| `typescript-language-server` | JS / TS | yes: the project's own `node_modules/typescript` | when the project has it |

There is **no trust step** (no `:JayTrust`; removed 2026-11-09 by jay's choice): opening a `.py` / `.ts` file starts
the server right away. The cost: pyright runs the project's Python (e.g. its `.venv/bin/python`) and TypeScript its
own `node_modules/typescript`, as you. A cloned repo or a pull request can be someone else's code, and follow mode
opens files without asking, so keep repos you don't trust out of nvim (or open them where pyright isn't installed).
不用再打 `:JayTrust`：打開檔案就會啟動。代價是 pyright／TypeScript 會用你的身分跑專案裡的 Python／TypeScript；
不信任的 repo 不要用這個 nvim 開。

git, the language servers and hc are run by full path; on Windows never from the project folder (Windows would
otherwise run a `git.exe` or `ruff.exe` sitting in it). The sudo check runs `pgrep` by name; it doesn't read the
project folder for programs.

A repo can name programs in its own config that git runs. For every git call nvim makes, these are off:
`core.fsmonitor`; the repo's clean / smudge filters, set in `.git/config`, a file it includes (`include.path`,
`includeIf`) or `config.worktree` (your global filters, e.g. git-lfs, stay; with git older than 2.26 every filter is
off); hooks (`core.hooksPath` points at an empty folder) and index writes; any fetch (`protocol.allow=never`,
`GIT_NO_LAZY_FETCH`: a partial clone would fetch a missing file with a command the repo names); submodules
(`git status --ignore-submodules=all`). A repo whose filter name contains `=` (which `-c` can't switch off) gets no
git at all from nvim. The tree's git (nvim-tree's `status`, `rev-parse`) gets all of this too: that is the one
change nvim-jay makes to nvim-tree (`herdr-app/mods/nvim-jay/nvim-tree/README.md`).
別人的 repo 可以在自己的設定裡指定 git 要跑的程式；nvim 跑的每個 git 都把這些關掉（fsmonitor、filter、hook、抓取、子模組）。

## 4. macOS vs Windows / 兩個系統的差別

One `nvim.js` for both; all OS differences sit in its PLATFORM section ([5](#5-how-it-is-built--程式結構)).

| | macOS (and Linux, other machines) | Windows |
|---|---|---|
| Herdr home | `~/.config/herdr-app` | `%USERPROFILE%\.config\herdr-app` |
| Keys | `cmd-e`, `cmd-o` | `ctrl-shift-i`, `ctrl-shift-j` |
| Launcher | `unix.js`: `/bin/sh` finds nvim in `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`; `ship.js` first puts the Lua and the tree in `~/.cache/nvim-jay` on that machine (Linux takes at most 131072 bytes per argument, the Lua is longer), nvim `:source`s it | `windows.js`: writes `mods\nvim-jay\.init.lua` (a command line holds at most 32767 characters), nvim `:source`s it, the tree from `mods\nvim-jay\nvim-tree`; nvim from PATH |
| Finding the agent's session | the pane's process (`~/.claude/sessions/<pid>.json`, Claude Code up to about 2.1.309), or a process under it; then Claude Code's `~/.claude/daemon/roster.json` (background / remote-control sessions); then the agent's folder (below) | a process under the pane's (agents run inside pwsh); then the roster; then the live session in `sessions/*.json` whose folder is the pane's; then the agent's folder (below) |
| Paths | as they are | one spelling (`C:/x/y`), case ignored when comparing |
| Paths in Bash commands | `/abs/path`, `~/x`, `$HOME/x` | `C:\x`, `C:/x`, `/c/x`, `~\x`, `$HOME\x`, `$env:USERPROFILE\x` |
| Agent running as root | follows root's copies if a root view is set up, else a one-line note ([6](#6-agent-running-as-root--agent-用-root-跑)) | — |
| Opened from agent-files through | `~/.cache/nvim-jay/sock/<pid>` | `\\.\pipe\nvim-jay-<pid>` |

Newer Claude Code (2.1.322 on macOS) no longer writes `~/.claude/sessions/<pid>.json`, so on every system nvim-jay
falls back to the agent's folder: Claude Code keeps its logs in `~/.claude/projects/<folder>/`, the folder being the
agent's cwd (the agent process's own, else the pane's) with every character but A-Z, a-z, 0-9 turned into `-`
(`/Users/me/my.app` → `-Users-me-my-app`, `C:\Users\x` → `C--Users-x`). It follows the newest `<id>.jsonl` there that changed
since that Claude Code started (known from the date of its `sessions/<pid>.<x>.key` file, never its content, or on
Linux from `/proc`; else: changed in the last 24 h). `/clear` starts a new log, and the newest one follows it.
Shortcut: two Claude Codes in the same folder may get mixed up. Only a plain file really inside `~/.claude/projects`
is read (no link leading out of it). Not for an agent under `sudo` (its log is root's; see
[6](#6-agent-running-as-root--agent-用-root-跑)). On Windows the processes under the pane are not yet tested on a real
Windows machine; start the agent in the folder the tab was opened in (no `cd` first) so the pane's folder is the
agent's.
新版 Claude Code 不再寫 `sessions/<pid>.json`：改找 agent 所在資料夾的對話紀錄，取最新的那個（同一資料夾開兩個 Claude Code 可能會搞混）。

## 5. How it is built / 程式結構

```
herdr-app/mods/nvim-jay/
  main.js     picks the launcher: Windows + a pane on this computer → windows.js, otherwise unix.js
  unix.js     macOS / Linux / other machines: /bin/sh finds nvim
  ship.js     puts the Lua and the tree in ~/.cache/nvim-jay/{init,nvim-tree}-<hash> on that machine, once per version
  send.js     how (CHECK / PUT / DONE shell scripts over Herdr exec, arguments under 100000 bytes); tested by run.js
  windows.js  Windows: .init.lua + :source
  mark.js     the argv item both launchers pass, so agent-files finds the pane; a review's --cmd and how its tab opens
  nvim.js     the Lua (one string, NVIM_INIT), run by nvim on the machine where the pane opens
                PLATFORM  every OS difference, in one table P (nothing below tests the OS)
                then: reload + diff, swap-file heads-up, tree, agent + follow, comments, keys, LSP, mouse,
                and REVIEW (a Gerrit change, §9)
  nvim-tree/  the file tree (nvim-tree v1.19.0, GPL-3.0) with one change, files.txt (what ship.js sends), README.md
  LICENSE.txt GPL-3.0: this mod folder only (it bundles nvim-tree); the rest of herdr-jay is Apache-2.0
herdr-app/mods/agent-files/      (its own mod: agent-files.md)
  main.js     finds the pane by the argv item `let g:nvim_jay = 1`; opens a file through nvim's server
              (JN.open_hex), or, without kit files, focuses it and sends alt+o (nvim: <M-o>, its own list)
```

The Lua no longer rides on nvim's command line: it did until 2026-11-14, and once it grew past 131072 bytes nvim-jay
couldn't start on Linux machines (`E2BIG`). The folders on the other machine are named by a hash of what is in them, so
a new version goes there once and two versions side by side don't mix; ones unused for 30 days are removed.

**Tests** (after changing the follow code): `node tests/nvim-jay/run.js` in herdr-jay (Node 18+, Neovim, git;
macOS / Linux). It runs the Lua in a headless nvim with a temp HOME and a fake `hc`, so nothing of yours is touched;
then a second nvim in review mode (`tests/nvim-jay/review.lua`, §9) on a small repo it makes.
改了之後跑 `node tests/nvim-jay/run.js`，全部 ok 才算過。

Programs nvim waits for get a time limit, so a stuck one can't freeze it: `hc` 2 s, `git` 5 s (a git that can't
read the repo's filters in time isn't run at all), `pgrep` 1 s. At the limit the program is killed together with
what it started (macOS / Linux: its process group; Windows: `taskkill /T /F`, since Git for Windows' `git.exe` starts
the real git), so nvim waits up to about twice the limit, usually just the limit. After `hc` times out, nvim asks
it nothing for 30 s; after a `git` call times out, no more git until that round is done (the follow tick, the file
being opened, the key pressed).
程式卡住時有時限，最多約兩倍時限就放手；hc 卡住後 30 秒內不再問，git 卡住後這一輪不再叫 git。

## 6. Agent running as root / agent 用 root 跑

When the agent beside the pane runs under `sudo`, its session log is root's: nvim-jay can't read it, says so once,
and doesn't follow that agent (everything else works). There is no root mode on purpose: an editor running as root
that any program running as you can type into (`hc keys`) would be a root door.
旁邊的 agent 用 sudo 跑時，nvim-jay 讀不到它的紀錄，只提示一次、不跟著開檔；故意不提供 root 模式。

**Root view (optional).** If something on the machine, run by root, keeps copies of what the root agent read or
changed where you can read them, nvim-jay follows those instead. nvim-jay itself never installs or runs that part;
it only reads:

- `<dir>/index.jsonl`: one JSON line per touch: `{"t": <unix time>, "tool": "Read"|"Edit"|"Write"|"Bash"|…,
  "path": "/abs/path", "before": "<sha256>"|null, "after": "<sha256>", "line": <n>|null, "pid": <n>,
  "session_id": "<id>"|null}`. `pid` is the root Claude Code process itself: nvim-jay follows a record only if that
  process runs under the pane of the agent beside it (anywhere below the pane's process: shell → sudo → claude), so
  root agents in other tabs don't move it. A record without `pid` (an older root side) counts only while no record in
  the index has one, and only if its `t` is after nvim started following (never an old touch on open).
  `session_id` is not used by nvim-jay;
- `<dir>/blobs/<sha256>`: the file's content at that moment (up to 4 MB is shown).

Put `<dir>` as the only line of `~/.config/nvim-jay/root_view` (as you, on that machine). Then the file shows as
`root:/abs/path` in a read-only buffer (colors, but no language server or plugins), the change marked against
`before`, the title bar saying 「root 的檔，複本，唯讀」, the cursor on `line`. The tree moves to the folder only if
you can open it. Without the file, a root agent gets the one-line note 「root 的 agent：跟不到（沒有 root_view）」.
有 root 端的複本（root 讀過／改過的檔複製一份給你看）時，在 `~/.config/nvim-jay/root_view` 寫它的資料夾，nvim-jay
就跟著開那份複本（唯讀）；沒有就只提示一行，不會停在「Press ENTER」。

## 7. Snapshots for Bash edits (optional) / Bash 改檔的快照（選用）

A file changed by a Bash command outside a git repo has no "before" to diff against. The **snap hook** keeps one:
a Claude Code PreToolUse hook that, before each Bash command, saves the files the command names by absolute path,
`~/x` or `$HOME/x` (at most 20, each up to 1 MB, not `/proc`, `/sys`, `/dev`) to `~/.cache/nvim-jay/snap/<tool_use_id>/` (only you can
read them; a copy older than 10 minutes is removed at the next Bash run). nvim-jay then marks what the command
changed. Without it those files just reload.
Keys and credentials are never copied, also not through a link to them: `~/.ssh`, `~/.aws`, `~/.gnupg`,
`~/.config/gh`, `~/.kube`, `~/.netrc` (Windows also `_netrc`), `~/.git-credentials`, `~/.docker/config.json`
(Windows: the same under `%USERPROFILE%`, plus `%APPDATA%\GitHub CLI` and `%APPDATA%\gnupg`).
repo 外的檔被 Bash 指令改掉時，沒有「改之前」可比；snap hook 會在指令跑之前先存一份，nvim-jay 才標得出改了哪裡。
金鑰、帳密檔（`~/.ssh`、`~/.aws` 等）一律不存；超過 10 分鐘的複本在下一次跑 Bash 時刪掉。

The hook is a Lua file nvim-jay writes itself, on every machine where it runs (macOS, Windows, a Linux server):
`~/.config/nvim-jay/snap_hook.lua` (Windows: under `vim.uv.os_homedir()`, usually `%USERPROFILE%`), refreshed when
nvim-jay updates. It runs with `nvim -l`, so it needs nothing but Neovim. To turn it on, open nvim-jay once on that
machine, then add this to Claude Code's `~/.claude/settings.json` there (back it up first; keep its other settings;
if `"PreToolUse"` already exists, add this entry to its list; no settings.json yet → wrap the snippet in `{ }`):
nvim-jay 會自己把 hook 寫到每台機器上；在那台機器的 Claude Code 設定加這段就啟用：

```json
"hooks": {
  "PreToolUse": [
    { "matcher": "Bash", "hooks": [{ "type": "command", "command": "nvim -l ~/.config/nvim-jay/snap_hook.lua" }] }
  ]
}
```

`nvim` must be on the PATH Claude Code runs hooks with; if not, give its full path (macOS Homebrew
`/opt/homebrew/bin/nvim`, a Linux server `~/.local/bin/nvim`). Windows (not yet tested there): full paths, and
matcher `Bash|PowerShell`; see [windows.md §5a](windows.md#5a-snap-hook-for-claude-code--snap-hook). The hook prints nothing and
always exits 0; only if nvim itself can't start does the hook fail (`"onFailure": "continue"` keeps that from blocking).
Check: after the agent runs a Bash command naming a file, `~/.cache/nvim-jay/snap/` has a folder for it.

### 7a. The reply hook: answer the agents that asked (optional) / 回覆檢查（選用）

Agents talk with `hc send`; a message arrives tagged `<hc from="t7 review">…</hc>`. An agent sometimes reads it and
stops without answering, and the one that asked waits (the Agents panel's 關係 tab shows it as 還沒回 / 卡住). The
**reply hook** is a Claude Code Stop hook that catches this at the source: when the agent is about to stop, it looks at
what came in since its last stop, and for each message from another agent that it didn't answer with `hc send` to
that agent (by its address, its id under any machine name, or its name), it keeps the agent going once with a reminder:
answer, or just stop if it was only a notice. A message that says in its first line it wants no answer (`不用回`,
`不用再回`, `不必回`, `[FYI]`) is never reminded; nor is one from the agent itself. Each message is reminded at most
once (how far it looked: `~/.cache/nvim-jay/reply/<session>`), and never twice in a row (Claude Code's
`stop_hook_active`). It reads only the newest part of the transcript (at most 4 MB), runs no other program, and
anything unexpected (no transcript, bad input) lets the agent stop.
別的 agent 用 hc send 傳來的訊息，agent 要停之前還沒用 hc send 回，就提醒它一次：要回就回，只是通知就直接結束。
訊息第一行寫了「不用回」「不用再回」「不必回」或 `[FYI]` 的不提醒；同一則只提醒一次。

nvim-jay writes it next to the snap hook, `~/.config/nvim-jay/reply_hook.lua`, on every machine where it runs. To
turn it on, add a Stop entry to that machine's `~/.claude/settings.json` (same rules as above: back it up, keep the
rest, add to `"Stop"` if it is there; full `nvim` path if needed; Windows: under `%USERPROFILE%`):

```json
"hooks": {
  "Stop": [
    { "hooks": [{ "type": "command", "command": "nvim -l ~/.config/nvim-jay/reply_hook.lua" }] }
  ]
}
```

Only Claude Code has this hook; omp and codex agents aren't reminded (the 關係 tab still shows them, with its
提醒它回 button). Sending yourself: put `不用回` (or `[FYI]`) in the first line of a message that needs no answer, so
neither the hook nor the 關係 tab waits for one.

## 8. When something goes wrong / 出問題時

OS-specific problems (install, PATH, keys) are in each install guide. These are the same everywhere:

| What you see / 看到什麼 | Why / 原因 | Fix / 怎麼修 |
|---|---|---|
| "nvim-jay needs Neovim 0.11 or newer" | Neovim older than 0.11 (e.g. Ubuntu's apt) | install a newer Neovim (the official release or a PPA) |
| "找不到 hc" inside nvim | `hc` not found | install Herdr core; check `hc --version` |
| nvim never follows the agent | agent isn't Claude Code, nothing read yet, or follow is off | `space a f`; on Windows see [4](#4-macos-vs-windows--兩個系統的差別) |
| No hover / go-to-definition | server not installed on that machine | install it; `:checkhealth vim.lsp` |
| No "another nvim has this file" warning | the other nvim uses no swap file, or is on another machine | — |

Anything else: `:messages` in nvim, plus a photo of the error.

## 9. Gerrit review mode / Gerrit review 模式

Opened by the Gerrit panel's **在 nvim 看** ([gerrit.md §9](gerrit.md#9-read-a-change-in-nvim--在-nvim-看)), never by
`cmd-e`: a new tab in the change's own folder (a git worktree at that patch set); quitting nvim closes the tab (with
Herdr app patch 0006, [patches.md](patches.md); without it a shell stays in the tab). The panel passes
`--cmd "let g:nvim_jay_review = '<…>/review.json'"`; that file is the panel's (files, comments, base and head, a jump)
and it rewrites it when something changes. Everything else of nvim-jay stays (language servers, the mouse, the
menu); follow is off and there is no tree. nvim-jay's own comments for an agent are off in the change's files: there
you comment on Gerrit.
由 Gerrit 面板的「在 nvim 看」打開，在那個 change 自己的資料夾開新分頁；左邊是改過的檔，右邊是整個檔案。
不用記鍵：在檔案裡按右鍵（或 Enter）就有這裡能做的事，選幾行再按右鍵就是那幾行的；下面的 space r … 只是捷徑。

- **Left**: the change's files in Gerrit's order: 新增 / 刪除 / 改名, `+N -M`, `💬N（K 未解）`; ✓ on the ones you
  opened (kept per patch set in `seen.json` beside review.json); 看過 N / M. `Enter` or one click opens one.
  `o`: tests first / Gerrit's order.
- **Right**: the whole file. Changed lines are marked against the change's **base** (its parent, or the older patch set
  picked in the panel), not against HEAD; a renamed file against its old name; a deleted file shows what it had, all
  in red. It opens on the first change.
- **Comments**: this patch set's under their line, as threads: `💬 Alice（未解決）：…` in yellow, replies `↳ Bob：…`,
  resolved threads grey, your drafts blue `📝 你的草稿（還沒送出）`.
- **Right-click (or Enter) on a line** (in a file of the change): the menu (§1) with the change's part first:
  💬 留言（寫意見） and 🔧 直接改給作者看 (a suggested edit, below), 🤖 問 agent 這一行; then each thread on the line as one ▸
  item (🟡 open, ⚪ resolved: 回覆, ✅ Done, 👍 Ack, and on your own change 🤖 請 agent 照這則改) and each draft of yours
  (▸ 改草稿, 刪掉草稿); then the change: ⏩ the next unresolved thread, 🔍 看還沒推的改動 (your change), 🆕 another patch
  set (▸ only what it changed since, or all of it), 📄 commit 說明 (in a window below; q closes it). The language
  server's items follow when there is one. In the list: 開這個檔, 先看測試. Elsewhere (other files) Enter does what it did.
- **Select lines, then right-click (or Enter)**: 🤖 ask the Gerrit agent about them (the question can be empty: what
  does it do, anything wrong; the panel sends the change, file, lines, this folder's path and the diff of exactly those
  lines), 🔧 直接改給作者看: the lines open in a small window below; change them, `:w`, a note if you like (`:q!`: never
  mind). It becomes your draft with Gerrit's suggestion block (shown as ✏️ 建議改成：…), and the author applies it with
  one click. Or 複製.
  留言是寫意見，作者自己改；直接改給作者看是你改好，作者在 Gerrit 按一下就套用。
- **Older patch sets**: their threads that are still open show on the lines they are on now, 第 M 版留的.
- **Your own change** (the list says so): 🤖 請 agent 照這則改 in an unresolved thread's ▸, 🔍 看還沒推的改動 (the folder's
  diff); `]u` `[u` the next / previous unresolved thread nobody has answered.
- **Where it goes**: every one of these is a line in `from-nvim.jsonl` beside review.json (`draft`, `reply`, `edit`,
  `delete`, `update`, `ask`); the panel saves drafts on Gerrit (on the thread's patch set; they show at once, marked
  存到 Gerrit 中…), moves the folder, or asks the agent. Drafts are published with the panel's 💬 送出回覆. Nothing is
  published from nvim.
- **A newer patch set**: the panel looks once a minute; the list says 🆕 有第 N 版了, and while it downloads ⏳ (or ⚠
  why it didn't). The same folder moves; the files reload.
- **The panel's clicks**: a file clicked in the panel's list opens here too (review.json's `jump`, read every second).

| Key | What |
|---|---|
| `]f` `[f` | next / previous changed file (marks it seen) |
| `]c` `[c` | next / previous change in this file |
| `]u` `[u` | next / previous unresolved thread nobody has answered |
| right-click or `Enter` (in a file) | the menu above (lines selected: for those lines) |

Shortcuts for what the menu has (the menu shows them on the right):

| Key | What |
|---|---|
| `space r c` | 留言 on this line |
| `space r s` | 直接改給作者看 (this line, or the selected ones) |
| `space r a` | ask the Gerrit agent (this line, or the selected ones) |
| `space r u` | another patch set |
| `space r m` | the commit message |
| `space r l` | the list of files (back to it, or open it again) |
| `o` (in the list) | tests first / Gerrit's order |

The files can be edited (to try something), but the panel then can't move the folder to another patch set until you
undo them (`git checkout .`).
檔案可以改來試，但改過之後面板就換不了版本，要先還原。

