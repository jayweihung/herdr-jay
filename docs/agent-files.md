# agent-files: the agent's files in a popup / agent 讀過、改過的檔

A key (`cmd-o` on macOS, `ctrl-shift-j` on Windows) from an agent's pane, or any pane of its tab: a popup lists the
files the agent read or edited, newest first, then the files git shows changed in its folder. Type to filter,
↑ / ↓ and Enter to open one, Tab for the next agent when the tab has several, Esc to leave.
從 agent 那一格（或同一分頁任何一格）按 `cmd-o`／`ctrl-shift-j`：跳出 agent 讀過、改過的檔，新的在前，再加 git 的改動。打字篩選、Enter 打開、Tab 換下一個 agent、Esc 離開。

| Tag | Meaning |
|---|---|
| 讀 | the agent read it |
| 改 | the agent edited it |
| 寫 | the agent wrote it (new, or all of it) |
| git | changed in git, not touched by the agent (as far as its log shows) |

A file the agent made and is gone now shows 「（已不在）」.

**By turn** (kit 0.4.1 or later): the list is split by turn, like Claude Code's `/rewind`: each message you sent
and what the agent did until your next one, newest first. A turn's title is 「第 12 輪 · 03:41 · <the start of your
message>」 (a message relayed with `hc send` shows as 「hc t1p：…」); a file touched in several turns is under each.
↑ / ↓ skip the titles; typing filters the files and hides turns left empty. The files git shows changed come last,
under 「git 的改動」. With kit 0.4.0 the list is one run of files, newest first. Older parts of a very long
conversation (kit reads the last 8 MB of the log) are under 「更早」.
按輪分段（kit 0.4.1 以上）：每段是你的一則訊息和 agent 到下一則之前做的事，標題是第幾輪、時間和你那則訊息的開頭；同一個檔在好幾輪都碰過，就每輪都列。git 的改動放最後。

## Needs / 需要什麼

- **kit 0.4.0 or later** on the machine where the agent runs (`kit api` prints `1.1` or higher; by turn: 0.4.1,
  `1.2`): the list is
  `kit files`, which reads the agent's own log (Claude Code, Codex, omp) the way `kit context` finds it. At the
  company: kit from the company's own Git server ([kit.md](kit.md#needs--需要什麼)).
  Without it (no kit, or an older one) the popup says so; if the tab has an nvim-jay pane, nvim-jay's own list
  (Claude Code only) opens instead, as before.
  agent 跑的那台要有 kit 0.4.0 以上。沒有的話，同一頁有 nvim-jay 就改用 nvim-jay 自己的清單。
- An editor there (below).

## Where the file opens / 用什麼打開

1. **An nvim-jay pane in the tab** ([nvim-jay.md](nvim-jay.md)): the file opens in it and it gets the focus. (A
   pane opened before this update can't take it: close it and open a new one; until then the next way is used.)
2. Otherwise **a new pane right of the agent**, on the agent's machine, running your editor: `"editor"` below, else
   `$VISUAL`, else `$EDITOR`, else `vi` (Windows: `nvim`). Quitting the editor closes the pane.
3. Or, with `"gui": true`, the editor runs without a pane: for VS Code, Zed and other window apps, only for agents on
   this computer.

同一頁有 nvim-jay 就在它裡面開；沒有就在 agent 右邊開一格跑你的編輯器（設定的、`$VISUAL`、`$EDITOR`，都沒有就 `vi`；Windows 是 `nvim`）。

Settings, all optional: `agent-files.json` in Herdr's home (`~/.config/herdr-app/agent-files.json`; Windows
`%USERPROFILE%\.config\herdr-app\agent-files.json`):

```json
{ "editor": ["hx"], "gui": false, "nvim_jay": true }
```

- `editor`: the program and its first arguments; the file's path goes last. macOS / Linux: found on the login
  shell's PATH of that machine. Examples: `["hx"]`, `["vim"]`, `["nano"]`, with `"gui": true` `["code", "-g"]`.
- `nvim_jay`: `false` to skip the nvim-jay pane and always use the editor.

## Install / 安裝

macOS (a link: `git pull` in herdr-jay updates it):

```sh
ln -sfn ~/src/herdr-jay/herdr-app/mods/agent-files ~/.config/herdr-app/mods/agent-files
herdr-app check ~/.config/herdr-app/mods/agent-files
```

Windows (PowerShell):

```powershell
$j = "$env:USERPROFILE\src\herdr-jay"
$h = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } elseif ($env:XDG_CONFIG_HOME) { "$env:XDG_CONFIG_HOME\herdr-app" } else { "$env:USERPROFILE\.config\herdr-app" }
Remove-Item -Recurse -Force "$h\mods\agent-files" -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force "$j\herdr-app\mods\agent-files" "$h\mods\"
herdr-app check "$h\mods\agent-files" | Out-Host
```

Key, in `keys.json` under `"global": {` (macOS / Windows):

```json
"cmd-o": "mod.open:agent-files",
```

```json
"ctrl-shift-j": "mod.open:agent-files",
```

## How it works / 怎麼做的

`herdr-app/mods/agent-files/main.js`: finds the agent (the focused pane, else the tab's agent that changed last), its
process (`hc get`, the foreground pid) and machine (its space's), runs there

```
kit files --pid <pid> --tool <claude|codex|omp> --dir <its folder> --git --json
```

(kit from PATH, else `~/.local/bin/kit`; Windows `kit.cmd`, else kit's install folder; the same as the kit mod), and
shows kit's `files`. To open in nvim-jay it runs, on that machine,
`nvim --server ~/.cache/nvim-jay/sock/<nvim's pid> --remote-expr "v:lua.JN.open_hex('<path as hex>')"`
(Windows: `\\.\pipe\nvim-jay-<pid>`): nvim-jay listens there from its start, in a folder only you can enter.
