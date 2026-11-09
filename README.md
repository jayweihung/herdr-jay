# herdr-jay

jayweihung's general-purpose mods and settings for [Herdr](https://github.com/herdrdev/herdr-app).
jayweihung 的 Herdr 通用 mod 與設定。

- **Text only**: JavaScript mods, Lua, JSON, Markdown, text patches. No executables, no scripts, no binaries.
  只有文字檔，沒有執行檔、腳本或 binary。
- **Herdr itself is not here**: build it from the official source (Apache-2.0) plus the text patches in `patches/`.
  不含 Herdr 本體：從官方原始碼 build，再套上 `patches/`。
- Third-party mods are not included; install them from their authors.

## Where to read / 從哪裡看

| | |
|---|---|
| **macOS** install, update, troubleshooting / Mac 安裝 | [docs/macos.md](docs/macos.md) |
| **Windows** install, update, troubleshooting, test checklist / Windows 安裝 | [docs/windows.md](docs/windows.md) |
| **For a coding agent** installing it all (PC + Linux server) / 給幫忙安裝的 agent | [docs/agent-install.md](docs/agent-install.md) |
| **Linux server** as a Herdr machine over ssh / Linux server 當遠端機器 | [docs/linux-remote.md](docs/linux-remote.md) |
| **jay-nvim** features, keys, macOS vs Windows, security / nvim 功能 | [docs/nvim.md](docs/nvim.md) |
| **Gerrit panel**: dashboard, change details, notifications / Gerrit 面板 | [docs/gerrit.md](docs/gerrit.md) |
| New Herdr default keys per release / 各版新增的預設按鍵 | [docs/keys.md](docs/keys.md) |
| Patches to Herdr's source / 對 Herdr 原始碼的修改 | [patches/README.md](patches/README.md) |
| What changed in herdr-jay / 更新紀錄 | [CHANGELOG.md](CHANGELOG.md) |

## Contents / 內容

| Path | What |
|---|---|
| `mods/jay-nvim` | Neovim beside your agent: follow the agent's files, live diff, file tree, comments to the agent, LSP, mouse |
| `mods/jay-nvim-pick` | `cmd-o` / `ctrl-shift-j`: jump to the jay-nvim pane and list the files the agent read or edited |
| `mods/gerrit` | Gerrit beside your agents: 輪到你 / 我送出的 / 等我 review…, a change's votes, comment threads and files, notifications ([docs/gerrit.md](docs/gerrit.md)) |
| `patches/<repo>/<tag>/` | changes to Herdr's own source (only what a mod can't do), one folder per official tag |
| `docs/` | the guides above |

## Versions / 版本

Build exactly these. **Don't build a Herdr version that isn't in this table** — wait until it is (jay checks each
release first). Upstream sometimes moves a release tag a few CI/test commits later; the commit column says which
one was checked.
只 build 這張表裡的版本；表上沒有的新版，等 jay 驗過再更新。

| herdr-jay | Herdr app | Herdr core | core patches | Checked on macOS | Checked on Windows |
|---|---|---|---|---|---|
| `main` (now) | v0.1.14 (`2405bf3`) | v0.1.19 (`06793ed`, the moved tag; `git fetch --tags --force`) | `patches/herdr-core/v0.1.19` | 2026-11-09 | not yet |

The app needs at least the core in its `distribution/core-version` (v0.1.14: core 0.1.11).
Neovim: **v0.12.6** (the Linux server builds this tag from source; anything ≥ 0.11 works with jay-nvim).
Neovim：server 從原始碼 build v0.12.6；0.11 以上都能用。
pyright (optional, Python go-to-definition on the server): **1.1.414**, npm's package on the server's Node
([linux-remote.md §3b](docs/linux-remote.md#3b-python-go-to-definition-pyright-optional--python-跳定義選用); also on the release `pyright-1.1.414`).
pyright（選用，server 上的 Python 跳定義）：1.1.414。

**Tags** `for-herdr-v<app version>-r<N>` mark a herdr-jay state checked on **both** macOS and Windows. They never
move; a fix on the same Herdr gets the next `-r`. Take the highest `-r` for your app version. The old tag
`for-herdr-v0.1.13` (no `-r`) is older and macOS-only. The first tag checked on both is `for-herdr-v0.1.14-r1`:
use `main` until it exists.
tag 一旦打上就不移動；同一版 Herdr 有修正就加 `-r`。舊的 `for-herdr-v0.1.13` 沒有 Windows 支援；第一個兩邊都驗過的會是 `for-herdr-v0.1.14-r1`。

Never run plain `hc update`, and don't press Install / Update on Herdr's core screen or run "Update herdr-core":
they install the official core over yours.
不要跑 `hc update`，也不要按 Herdr 的「更新 core」：會換回官方版。

## Settings / 設定

jay keeps Herdr's defaults except `"appearance": "dark"` in `settings.json` (or Settings → Appearance → Dark).
Keys: only the two jay-nvim keys ([docs/nvim.md](docs/nvim.md#2-keys--按鍵)).
除了深色外觀和兩個 jay-nvim 按鍵，其他都是 Herdr 預設。

## License

Apache License 2.0 (the same as Herdr). See [LICENSE](LICENSE). Copyright 2026 jayweihung.
