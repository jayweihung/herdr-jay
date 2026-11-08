# herdr-jay

jayweihung's general-purpose mods and settings for [Herdr](https://github.com/herdrdev/herdr-app).
jayweihung 的 Herdr 通用 mod 與設定。

- **Text only**: JavaScript mods, Lua, JSON, Markdown. No executables, no scripts, no binaries.
  只有文字檔（mod 的 .js、Lua、.json、.md），沒有執行檔、腳本或 binary。
- **Herdr itself is not here**: build it from the official source (Apache-2.0).
  不含 Herdr 本體，請從官方原始碼 build。
- Third-party mods are not included; install them from their authors.
  別人寫的 mod 不放這裡，請從原作者那裡裝。

## Contents / 內容

| Path | What |
|---|---|
| `mods/` | Herdr mods (coming: `jay-nvim` — Neovim in a Herdr pane with LSP, mouse, right-click menu, file tree, follow-the-agent) |

## Install / 安裝

1. Get this repo (`git clone` or download ZIP).
2. Copy each folder under `mods/` into your Herdr home's `mods/` folder
   (macOS / Linux: `~/.config/herdr-app/mods/`; Windows: check `herdr-app status` / Herdr settings for the home folder).
3. Herdr loads it by itself. Run `herdr-app check <mod folder>` to verify.

## Compatibility / 相容版本

Tested with Herdr app v0.1.13. Tags `for-herdr-vX.Y.Z` mark versions checked against that Herdr release.

## License

MIT. See [LICENSE](LICENSE).
