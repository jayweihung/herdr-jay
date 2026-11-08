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
| `patches/` | Changes to Herdr's own source (only what a mod can't do), as text patches on an official tag — Apache-2.0 ([README](patches/README.md)) |
| `mods/jay-nvim-pick` | `cmd-o`: the files the agent read or edited, in the jay-nvim pane |

## Install / 安裝

1. Get this repo (`git clone` or download ZIP).
2. Copy each folder under `mods/` into your Herdr home's `mods/` folder
   (macOS / Linux: `~/.config/herdr-app/mods/`; Windows: check `herdr-app status` / Herdr settings for the home folder).
3. Herdr loads it by itself. Run `herdr-app check <mod folder>` to verify.

Windows: see [docs/windows.md](docs/windows.md) (build Herdr from the official source, install these mods; text only).

## Compatibility / 相容版本

Tested with Herdr app v0.1.13. Tags `for-herdr-vX.Y.Z` mark versions checked against that Herdr release.

## License

MIT. See [LICENSE](LICENSE). Exception: `patches/` (changes to Herdr, Apache-2.0).
