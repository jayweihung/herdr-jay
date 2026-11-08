# jay-nvim: Neovim beside your agent / agent 旁邊的 Neovim

What it does and how to use it, the same on every OS. Installing: [macOS](macos.md) · [Windows](windows.md).
功能和用法（各系統一樣）。安裝請看 [macOS](macos.md)、[Windows](windows.md)。

Two Herdr mods: `jay-nvim` opens the pane, `jay-nvim-pick` jumps to it and lists the agent's files.
Needs **Neovim 0.11 or newer**, `git`, and `hc` on the machine where the pane opens.

## Contents / 目錄

1. [Features](#1-features--功能)
2. [Keys](#2-keys--按鍵)
3. [Language servers and trust](#3-language-servers-and-trust--語言伺服器和信任)
4. [macOS vs Windows](#4-macos-vs-windows--兩個系統的差別)
5. [How it is built](#5-how-it-is-built--程式結構)
6. [Agent running as root](#6-agent-running-as-root--agent-用-root-跑)
7. [Snapshots for Bash edits (optional)](#7-snapshots-for-bash-edits-optional--bash-改檔的快照選用)
8. [When something goes wrong](#8-when-something-goes-wrong--出問題時)

---

## 1. Features / 功能

- **Follow the agent**: opens the file the agent beside it (Claude Code) last read or edited — several agents:
  whichever touched a file last. Never while you type or with unsaved changes. `space a f` toggles.
  跟著 agent 開檔。
- **Live reload with a diff**: files the agent edits reload every second; changed lines show like Claude Code's diff
  (red `-` old, green `+` new). Opening a file in a git repo marks what changed since the last commit.
  agent 改檔時自動重讀，標出改了哪幾行。
- **File tree** on the right (netrw), without git-ignored files (the ignore list comes from the repo nvim started in);
  the shown file is highlighted.
- **Comments to the agent**: comment a line or a selection, list, delete, and send them all to the agent with
  `hc send`. Control characters are removed before sending, so file text can't act as keys in the agent's terminal;
  quoted lines are cut at 200 characters. Only known coding agents (Claude Code, Codex, Gemini, opencode, pi, aider,
  …) count as agents — never a shell, ssh or a REPL, where the quoted lines would run as commands.
  Comment spans and message shape follow [herdr-nvim](https://github.com/ChmaraX/herdr-nvim) (MIT).
- **Files the agent touched**: a list of files the agent read or edited, newest first, plus files git shows as changed.
- **Language servers**: go to definition, hover, errors — see [3](#3-language-servers-and-trust--語言伺服器和信任).
- **Mouse**: rest the pointer on a name for its type, on an error to read it; right-click menu in Chinese. Herdr gives
  right-clicks to the program only when the pane is labelled `herdr.right-click=program`; jay-nvim sets that label.
  Shift + right-click still opens Herdr's menu.
- **Two panes on one file**: a heads-up the first time you change a file another nvim also has open.
- **Bash edits**: when the agent changes files with a shell command, nvim follows the newest changed file in the
  agent's repo, or a file the command names by absolute path.

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
| `:JayTrust` | trust this project for pyright / TypeScript |

## 3. Language servers and trust / 語言伺服器和信任

Started only if installed on that machine (never as root):

| Server | For | Runs project code? | Starts |
|---|---|---|---|
| `ruff` | Python lint | no (reads files) | always |
| `pyright` | Python types, go to definition | yes: the project's Python (its venv) | only in trusted folders |
| `typescript-language-server` | JS / TS | yes: the project's own `node_modules/typescript` | only in trusted folders that have it |

A cloned repo or a pull request can be someone else's code; follow mode opens files without asking. So the two servers
that run project code start only in folders listed in `~/.config/jay-nvim/trust` (one folder per line; subfolders
count). The first time, nvim tells you; `:JayTrust` adds the current project (or `:JayTrust <folder>`), then reopen the file.
It refuses your home folder or anything above it (that would trust every project).
會跑專案程式碼的兩個伺服器，只在你信任的資料夾啟動；第一次會提示，打 `:JayTrust` 就好。

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
| Finding the agent's session | the pane's process (`~/.claude/sessions/<pid>.json`) | the live Claude Code session in the pane's start folder (agents run inside pwsh) |
| Paths | as they are | one spelling (`C:/x/y`), case ignored when comparing |
| Paths in Bash commands | `/abs/path` | `C:\x`, `C:/x`, `/c/x` |
| Agent running as root | a warning, no follow ([6](#6-agent-running-as-root--agent-用-root-跑)) | — |
| Pick key nvim receives | `<M-o>` (alt+o) | `<M-o>` (alt+o) |

On Windows, start the agent in the folder the tab was opened in (no `cd` first): that is how jay-nvim finds its
session. Two Claude Codes in the same folder may get mixed up.

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

## 6. Agent running as root / agent 用 root 跑

When the agent beside the pane runs under `sudo`, its session log is root's: jay-nvim can't read it, says so once,
and doesn't follow that agent (everything else works). There is no root mode on purpose: an editor running as root
that any program running as you can type into (`hc keys`) would be a root door.
旁邊的 agent 用 sudo 跑時，jay-nvim 讀不到它的紀錄，只提示一次、不跟著開檔；故意不提供 root 模式。

## 7. Snapshots for Bash edits (optional) / Bash 改檔的快照（選用）

A file changed by a Bash command outside a git repo has no "before" to diff against. The **snap hook** keeps one:
a Claude Code PreToolUse hook that, before each Bash command, saves the files the command names by absolute path
(at most 20, each up to 1 MB, not `/proc`, `/sys`, `/dev`) to `~/.cache/jay-nvim/snap/<tool_use_id>/` (only you can
read them; removed after 10 minutes). jay-nvim then marks what the command changed. Without it those files just reload.
repo 外的檔被 Bash 指令改掉時，沒有「改之前」可比；snap hook 會在指令跑之前先存一份，jay-nvim 才標得出改了哪裡。

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
| "pyright / TypeScript 沒啟動 … 還沒信任" | folder not trusted | `:JayTrust`, then reopen the file |
| No hover / go-to-definition | server not installed on that machine | install it; `:checkhealth vim.lsp` |
| No "another nvim has this file" warning | the other nvim uses no swap file, or is on another machine | — |

Anything else: `:messages` in nvim, plus a photo of the error.
