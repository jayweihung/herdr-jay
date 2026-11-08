# Changelog / 更新紀錄

Newest first. Each entry says what you need to do on your machine.
最新的在上面；每條寫了要做什麼。
Needs: **mods** = copy the two mod folders again (macOS symlinks: nothing) · **core** / **app** = rebuild ·
**keys** = see [docs/keys.md](docs/keys.md).

## 2026-11-08

Needs: **mods**, and **core** (apply `patches/herdr-core/v0.1.19`).

- Install guides for macOS and Windows ([docs/macos.md](docs/macos.md), [docs/windows.md](docs/windows.md)),
  jay-nvim guide [docs/nvim.md](docs/nvim.md), this changelog, [docs/keys.md](docs/keys.md), versions table in README.
- Core patch: skip Ghostty's xcframework, so core builds with only the macOS Command Line Tools (harmless on Windows).
- jay-nvim:
  - split into `main.js` / `unix.js` / `windows.js`; every OS difference in the Lua's PLATFORM section.
  - Windows: finds Claude Code's session behind pwsh; one spelling for paths; pwsh / cmd count as shells;
    home like Claude Code; paths in Bash commands (`C:\`, `C:/`, `/c/`); the init file is `:source`d (no trouble with
    `#`, `%` or non-English user names); programs never run from the project folder.
  - Security: control characters are removed from comments sent to the agent; pyright and the TypeScript server
    (which run project code) start only in folders you trust (`:JayTrust`).
  - jay-nvim-pick sends no Esc first (could type an "o" on Windows); nvim maps the pick key in every mode.
  - Neovim 0.11 is enough (was 0.12).
  - "another nvim has this file" and `gd` compare paths correctly on Windows.
- License: Apache-2.0 for everything.
