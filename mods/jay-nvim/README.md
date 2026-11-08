# jay-nvim

Neovim in a pane beside your coding agent, inside [Herdr](https://github.com/herdrdev/herdr-app).
在 Herdr 裡，agent 旁邊開一格 Neovim。

- **Follow the agent**: opens the file the agent beside it last read or edited (several agents: whichever touched a file last). Never while you type or with unsaved changes. `<leader>af` toggles.
  跟著 agent 開檔。
- **Live reload with a diff**: files the agent edits reload every second; changed lines show like Claude Code's diff (red `-` old, green `+` new).
  agent 改檔時自動重讀，標出改了哪幾行。
- **File tree** on the right (netrw), without git-ignored files; the shown file is marked.
- **Comments to the agent**: `<leader>ac` comment a line / selection, `<leader>al` list, `<leader>ad` delete, `<leader>as` send them to the agent with `hc send`. (Comment spans and message shape follow [herdr-nvim](https://github.com/ChmaraX/herdr-nvim), MIT.)
- **Files the agent touched**: `<leader>o` (or `cmd-o` with `jay-nvim-pick`) lists files the agent read or edited.
- **LSP** (not as root): go to definition, hover, lint errors from whatever servers the machine has — pyright, ruff, typescript-language-server.
- **Mouse**: `mouse=a`, hover a name for its type or an error to read it, right-click menu (in Chinese). Herdr gives right-clicks to the program only when the pane is labelled `herdr.right-click=program`; jay-nvim sets that label itself when it starts.
- **Two panes on one file**: a heads-up the first time you change a file another pane's nvim also has open.

## Install / 安裝

Copy both folders into your Herdr home's `mods/` (macOS / Linux: `~/.config/herdr-app/mods/`):

- `jay-nvim` — opens the pane (`mod.open:jay-nvim`)
- `jay-nvim-pick` — `cmd-o`: focus the jay-nvim pane in this tab and open the "files the agent touched" list

Keys (add to your `keys.json`, `global` section):

```json
"cmd-e": "mod.open:jay-nvim",
"cmd-o": "mod.open:jay-nvim-pick"
```

Needs on each machine where the pane opens: `nvim` (≥ 0.10) and `hc` on a usual path
(`~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`). LSP servers are optional.

Windows: not supported yet (the launcher uses `/bin/sh`).

## Agent running as root (optional) / agent 用 root 跑（選用）

When the agent beside the pane runs under `sudo`, its session log is root's, so jay-nvim exits with code 77.
If `~/.config/jay-nvim/handoff` holds an absolute path, the pane then runs `sudo <that path> <pane id> <runtime dir>`.
That command must be root-owned, allowed in sudoers, check both arguments, and start **root's own** nvim with
**root's own** copy of `nvim.js` (never this mod's Lua: you can write it, so running it as root would hand root to
anything running as you). It may set `JAY_NVIM_HC` to root's `hc`. Without the file, the pane just says so.

## Optional: snapshots for Bash edits

A file changed by a Bash command outside a git repo has no "before" to diff against. If something (for example a
Claude Code PreToolUse hook) saves the file's previous content under `~/.cache/jay-nvim/snap/`, jay-nvim diffs
against it. Without it, those files just reload.

## License

MIT (see the repo's LICENSE).
