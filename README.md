# herdr-jay

jayweihung's general-purpose mods and settings for [Herdr](https://github.com/herdrdev/herdr-app).
jayweihung 的 Herdr 通用 mod 與設定。

- **Text only**: JavaScript mods, Lua, JSON, Markdown. No executables, no scripts, no binaries.
  只有文字檔（mod 的 .js、Lua、.json、.md），沒有執行檔、腳本或 binary。
- **Herdr itself is not here**: build it from the official source (Apache-2.0), plus the text patches in `patches/` if any.
  不含 Herdr 本體：從官方原始碼 build，`patches/` 有修改的話先套上。
- Third-party mods are not included; install them from their authors.
  別人寫的 mod 不放這裡，請從原作者那裡裝。

## Contents / 內容

| Path | What |
|---|---|
| `mods/jay-nvim` | Neovim beside your agent: follow the agent's files, live diff, file tree, comments to the agent, LSP, mouse ([README](mods/jay-nvim/README.md)) |
| `patches/` | Changes to Herdr's own source (only what a mod can't do), as text patches on an official tag ([README](patches/README.md)) |
| `mods/jay-nvim-pick` | `cmd-o`: the files the agent read or edited, in the jay-nvim pane |

## Install / 安裝

1. Get this repo (`git clone` or download ZIP).
2. Copy each folder under `mods/` into your Herdr home's `mods/` folder
   (macOS / Linux: `~/.config/herdr-app/mods/`; Windows: `%USERPROFILE%\.config\herdr-app\mods\`).
3. Add the keys for your OS (below) to `keys.json`. Herdr loads mods and keys by itself. Run `herdr-app check <mod folder>` to verify.

**Windows, step by step** (build Herdr, Neovim, install, troubleshooting): [docs/windows.md](docs/windows.md).
Windows 完整步驟（build Herdr、裝 Neovim、安裝、出問題怎麼辦）：[docs/windows.md](docs/windows.md)。

## Mac vs Windows / Mac 和 Windows 的差別

The same mod folders work on both; nothing to switch. Each computer has its own Herdr home and its own `keys.json`.
同一份 mod 兩邊都能用，不用切換；每台電腦有自己的 Herdr 設定目錄和自己的 `keys.json`。

| | macOS | Windows |
|---|---|---|
| Herdr home | `~/.config/herdr-app` | `%USERPROFILE%\.config\herdr-app` |
| Open nvim | `cmd-e` | `ctrl-shift-i` |
| Files the agent touched | `cmd-o` | `ctrl-shift-j` |
| How nvim starts | `/bin/sh` finds nvim, Lua passed on the command line | `nvim -S mods\jay-nvim\.init.lua` (written by the mod) |
| Agent running as root (handoff) | optional | not available |

The mod checks the OS itself (`window().platform`); nvim checks it with `has("win32")`.
mod 自己判斷是哪個系統，不用設定。

## Compatibility / 相容版本

Tested with Herdr app v0.1.13. Tags `for-herdr-vX.Y.Z` mark versions checked against that Herdr release.

## License

Apache License 2.0 (the same as Herdr). See [LICENSE](LICENSE). Copyright 2026 jayweihung.
