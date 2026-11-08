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

Build Herdr from the official source plus `patches/`, then install the mods. Step by step, with checks and troubleshooting:
從官方原始碼＋`patches/` build Herdr，再裝 mod。完整步驟（含檢查、疑難排解）：

- **macOS**: [docs/macos.md](docs/macos.md)
- **Windows**: [docs/windows.md](docs/windows.md)

Needs Neovim **0.11 or newer**. Never run plain `hc update` (it swaps in the official core).
需要 Neovim **0.11 以上**。不要跑 `hc update`（會換回官方 core）。

## Mac vs Windows / Mac 和 Windows 的差別

The same mod folders work on both; nothing to switch. Each computer has its own Herdr home and its own `keys.json`.
同一份 mod 兩邊都能用，不用切換；每台電腦有自己的 Herdr 設定目錄和自己的 `keys.json`。

| | macOS | Windows |
|---|---|---|
| Herdr home | `~/.config/herdr-app` | `%USERPROFILE%\.config\herdr-app` |
| Open nvim | `cmd-e` | `ctrl-shift-i` |
| Files the agent touched | `cmd-o` | `ctrl-shift-j` |
| How nvim starts | `/bin/sh` finds nvim, Lua passed on the command line | the mod writes `mods\jay-nvim\.init.lua`, nvim runs it (`dofile`) |
| Agent running as root (handoff) | optional | not available |

The mod checks the OS itself (`window().platform`); nvim checks it with `has("win32")`.
mod 自己判斷是哪個系統，不用設定。

## Compatibility / 相容版本

Made for Herdr app v0.1.13 / core v0.1.19 (with the core patch in `patches/`). **Use `main`** for now: the tag `for-herdr-v0.1.13` is older (no Windows
support). From now on, a `for-herdr-vX.Y.Z` tag is added only after both macOS and Windows have been checked on that release.
目前請用 `main`；舊 tag `for-herdr-v0.1.13` 沒有 Windows 支援。之後的 tag 都是 Mac 和 Windows 都驗過才打。

## Settings / 設定

jay keeps Herdr's defaults except `"appearance": "dark"` in `settings.json` (or Herdr Settings → Appearance → Dark).
除了深色外觀，其他都是 Herdr 預設。

## License

Apache License 2.0 (the same as Herdr). See [LICENSE](LICENSE). Copyright 2026 jayweihung.
