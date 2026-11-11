# jay-nvim: Neovim beside your agent / agent 旁邊的 Neovim

What it does and how to use it, the same on every OS. Installing: [macOS](macos.md) · [Windows](windows.md).
功能和用法（各系統一樣）。安裝請看 [macOS](macos.md)、[Windows](windows.md)。

Two Herdr mods: `jay-nvim` opens the pane, `jay-nvim-pick` jumps to it and lists the agent's files.
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
- **File tree** on the right (netrw), without git-ignored files (the ignore list comes from the repo nvim started in);
  the shown file is highlighted. A file the agent creates appears when nvim follows it there (other new files: `ctrl-l`
  in the tree).
- **Comments to the agent**: comment a line or a selection, list, delete, and send them all to the agent with
  `hc send`. Control characters are removed before sending, so file text can't act as keys in the agent's terminal;
  quoted lines are cut at 200 characters. Only known coding agents (Claude Code, Codex, Gemini, opencode, pi, aider,
  …) count as agents — never a shell, ssh or a REPL, where the quoted lines would run as commands.
  Comment spans and message shape follow [herdr-nvim](https://github.com/ChmaraX/herdr-nvim) (MIT).
- **Files the agent touched**: a list of files the agent read or edited, newest first, plus files git shows as changed.
- **Language servers**: go to definition, hover, errors — see [3](#3-language-servers--語言伺服器).
- **Mouse**: rest the pointer on a name for its type, on an error to read it; right-click menu in Chinese. Herdr gives
  right-clicks to the program only when the pane is labelled `herdr.right-click=program`; jay-nvim sets that label.
  Shift + right-click still opens Herdr's menu.
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
| Open jay-nvim beside the focused pane | `cmd-e` | `ctrl-shift-i` |
| Jump to it and list the agent's files | `cmd-o` | `ctrl-shift-j` |

Inside nvim (`space` is the leader), the same everywhere:

| Key | What |
|---|---|
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
otherwise run a `git.exe` or `ruff.exe` sitting in it). netrw's tree runs `git` by name through the shell, and the
sudo check runs `pgrep`; neither reads the project folder for programs.

A repo can name programs in its own config that git runs. For every git call nvim makes, these are off:
`core.fsmonitor`; the repo's clean / smudge filters, set in `.git/config`, a file it includes (`include.path`,
`includeIf`) or `config.worktree` (your global filters, e.g. git-lfs, stay; with git older than 2.26 every filter is
off); hooks (`core.hooksPath` points at an empty folder) and index writes; any fetch (`protocol.allow=never`,
`GIT_NO_LAZY_FETCH`: a partial clone would fetch a missing file with a command the repo names); submodules
(`git status --ignore-submodules=all`). A repo whose filter name contains `=` (which `-c` can't switch off) gets no
git at all from nvim. The tree's `git ls-files` gets `core.fsmonitor` and fetching off through the environment.
別人的 repo 可以在自己的設定裡指定 git 要跑的程式；nvim 跑的每個 git 都把這些關掉（fsmonitor、filter、hook、抓取、子模組）。

## 4. macOS vs Windows / 兩個系統的差別

One `nvim.js` for both; all OS differences sit in its PLATFORM section ([5](#5-how-it-is-built--程式結構)).

| | macOS (and Linux, other machines) | Windows |
|---|---|---|
| Herdr home | `~/.config/herdr-app` | `%USERPROFILE%\.config\herdr-app` |
| Keys | `cmd-e`, `cmd-o` | `ctrl-shift-i`, `ctrl-shift-j` |
| Launcher | `unix.js`: `/bin/sh` finds nvim in `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`; the Lua goes on the command line | `windows.js`: writes `mods\jay-nvim\.init.lua` (a command line holds at most 32767 characters), nvim `:source`s it; nvim from PATH |
| Finding the agent's session | the pane's process (`~/.claude/sessions/<pid>.json`), or a process under it | a process under the pane's (agents run inside pwsh); if none: the live Claude Code session in the pane's start folder |
| Paths | as they are | one spelling (`C:/x/y`), case ignored when comparing |
| Paths in Bash commands | `/abs/path`, `~/x`, `$HOME/x` | `C:\x`, `C:/x`, `/c/x`, `~\x`, `$HOME\x`, `$env:USERPROFILE\x` |
| Agent running as root | follows root's copies if a root view is set up, else a one-line note ([6](#6-agent-running-as-root--agent-用-root-跑)) | — |
| Pick key nvim receives | `<M-o>` (alt+o) | `<M-o>` (alt+o) |

On Windows jay-nvim looks for the agent's session among the processes under the pane (not yet tested on a real
Windows machine). If that finds none, it falls back to the folder: then start the agent in the folder the tab was
opened in (no `cd` first), and two Claude Codes in the same folder may get mixed up.

## 5. How it is built / 程式結構

```
mods/jay-nvim/
  main.js     picks the launcher: Windows + a pane on this computer → windows.js, otherwise unix.js
  unix.js     macOS / Linux / other machines: /bin/sh finds nvim
  windows.js  Windows: .init.lua + :source
  mark.js     the argv item both launchers pass, so jay-nvim-pick finds the pane
  nvim.js     the Lua (one string, NVIM_INIT), run by nvim on the machine where the pane opens
                PLATFORM  every OS difference, in one table P (nothing below tests the OS)
                then: reload + diff, swap-file heads-up, tree, agent + follow, comments, keys, LSP, mouse
mods/jay-nvim-pick/
  main.js     finds the pane by the argv item `let g:jay_nvim = 1`, focuses it, sends alt+o (nvim: <M-o>)
```

`nvim.js` stays a single file: the unix launcher puts the whole Lua on one command line, and a root-side copy can be
pinned by its sha256.

**Tests** (after changing the follow code): `node tests/jay-nvim/run.js` in herdr-jay (Node 18+, Neovim, git;
macOS / Linux). It runs the Lua in a headless nvim with a temp HOME and a fake `hc`, so nothing of yours is touched.
改了之後跑 `node tests/jay-nvim/run.js`，全部 ok 才算過。

Programs nvim waits for get a time limit, so a stuck one can't freeze it: `hc` 2 s, `git` 5 s (a git that can't
read the repo's filters in time isn't run at all), `pgrep` 1 s. At the limit the program is killed together with
what it started (macOS / Linux: its process group; Windows: `taskkill /T /F`, since Git for Windows' `git.exe` starts
the real git), so nvim waits up to about twice the limit, usually just the limit. After `hc` times out, nvim asks
it nothing for 30 s; after a `git` call times out, no more git until that round is done (the follow tick, the file
being opened, the key pressed).
程式卡住時有時限，最多約兩倍時限就放手；hc 卡住後 30 秒內不再問，git 卡住後這一輪不再叫 git。

## 6. Agent running as root / agent 用 root 跑

When the agent beside the pane runs under `sudo`, its session log is root's: jay-nvim can't read it, says so once,
and doesn't follow that agent (everything else works). There is no root mode on purpose: an editor running as root
that any program running as you can type into (`hc keys`) would be a root door.
旁邊的 agent 用 sudo 跑時，jay-nvim 讀不到它的紀錄，只提示一次、不跟著開檔；故意不提供 root 模式。

**Root view (optional).** If something on the machine, run by root, keeps copies of what the root agent read or
changed where you can read them, jay-nvim follows those instead. jay-nvim itself never installs or runs that part;
it only reads:

- `<dir>/index.jsonl`: one JSON line per touch: `{"t": <unix time>, "tool": "Read"|"Edit"|"Write"|"Bash"|…,
  "path": "/abs/path", "before": "<sha256>"|null, "after": "<sha256>", "line": <n>|null, "pid": <n>,
  "session_id": "<id>"|null}`. `pid` is the root Claude Code process itself: jay-nvim follows a record only if that
  process runs under the pane of the agent beside it (anywhere below the pane's process: shell → sudo → claude), so
  root agents in other tabs don't move it. A record without `pid` (an older root side) counts only while no record in
  the index has one, and only if its `t` is after nvim started following (never an old touch on open).
  `session_id` is not used by jay-nvim;
- `<dir>/blobs/<sha256>`: the file's content at that moment (up to 4 MB is shown).

Put `<dir>` as the only line of `~/.config/jay-nvim/root_view` (as you, on that machine). Then the file shows as
`root:/abs/path` in a read-only buffer (colors, but no language server or plugins), the change marked against
`before`, the title bar saying 「root 的檔，複本，唯讀」, the cursor on `line`. The tree moves to the folder only if
you can open it. Without the file, a root agent gets the one-line note 「root 的 agent：跟不到（沒有 root_view）」.
有 root 端的複本（root 讀過／改過的檔複製一份給你看）時，在 `~/.config/jay-nvim/root_view` 寫它的資料夾，jay-nvim
就跟著開那份複本（唯讀）；沒有就只提示一行，不會停在「Press ENTER」。

## 7. Snapshots for Bash edits (optional) / Bash 改檔的快照（選用）

A file changed by a Bash command outside a git repo has no "before" to diff against. The **snap hook** keeps one:
a Claude Code PreToolUse hook that, before each Bash command, saves the files the command names by absolute path,
`~/x` or `$HOME/x` (at most 20, each up to 1 MB, not `/proc`, `/sys`, `/dev`) to `~/.cache/jay-nvim/snap/<tool_use_id>/` (only you can
read them; a copy older than 10 minutes is removed at the next Bash run). jay-nvim then marks what the command
changed. Without it those files just reload.
Keys and credentials are never copied, also not through a link to them: `~/.ssh`, `~/.aws`, `~/.gnupg`,
`~/.config/gh`, `~/.kube`, `~/.netrc` (Windows also `_netrc`), `~/.git-credentials`, `~/.docker/config.json`
(Windows: the same under `%USERPROFILE%`, plus `%APPDATA%\GitHub CLI` and `%APPDATA%\gnupg`).
repo 外的檔被 Bash 指令改掉時，沒有「改之前」可比；snap hook 會在指令跑之前先存一份，jay-nvim 才標得出改了哪裡。
金鑰、帳密檔（`~/.ssh`、`~/.aws` 等）一律不存；超過 10 分鐘的複本在下一次跑 Bash 時刪掉。

The hook is a Lua file jay-nvim writes itself, on every machine where it runs (macOS, Windows, a Linux server):
`~/.config/jay-nvim/snap_hook.lua` (Windows: under `vim.uv.os_homedir()`, usually `%USERPROFILE%`), refreshed when
jay-nvim updates. It runs with `nvim -l`, so it needs nothing but Neovim. To turn it on, open jay-nvim once on that
machine, then add this to Claude Code's `~/.claude/settings.json` there (back it up first; keep its other settings;
if `"PreToolUse"` already exists, add this entry to its list; no settings.json yet → wrap the snippet in `{ }`):
jay-nvim 會自己把 hook 寫到每台機器上；在那台機器的 Claude Code 設定加這段就啟用：

```json
"hooks": {
  "PreToolUse": [
    { "matcher": "Bash", "hooks": [{ "type": "command", "command": "nvim -l ~/.config/jay-nvim/snap_hook.lua" }] }
  ]
}
```

`nvim` must be on the PATH Claude Code runs hooks with; if not, give its full path (macOS Homebrew
`/opt/homebrew/bin/nvim`, a Linux server `~/.local/bin/nvim`). Windows (not yet tested there): full paths, and
matcher `Bash|PowerShell`; see [windows.md §5a](windows.md#5a-snap-hook-for-claude-code--snap-hook). The hook prints nothing and
always exits 0; only if nvim itself can't start does the hook fail (`"onFailure": "continue"` keeps that from blocking).
Check: after the agent runs a Bash command naming a file, `~/.cache/jay-nvim/snap/` has a folder for it.

## 8. When something goes wrong / 出問題時

OS-specific problems (install, PATH, keys) are in each install guide. These are the same everywhere:

| What you see / 看到什麼 | Why / 原因 | Fix / 怎麼修 |
|---|---|---|
| "jay-nvim needs Neovim 0.11 or newer" | Neovim older than 0.11 (e.g. Ubuntu's apt) | install a newer Neovim (the official release or a PPA) |
| "找不到 hc" inside nvim | `hc` not found | install Herdr core; check `hc --version` |
| nvim never follows the agent | agent isn't Claude Code, nothing read yet, or follow is off | `space a f`; on Windows see [4](#4-macos-vs-windows--兩個系統的差別) |
| No hover / go-to-definition | server not installed on that machine | install it; `:checkhealth vim.lsp` |
| No "another nvim has this file" warning | the other nvim uses no swap file, or is on another machine | — |

Anything else: `:messages` in nvim, plus a photo of the error.
