# Patches to Herdr itself / 對 Herdr 本體的修改

jayweihung's own changes to Herdr's source, as plain-text `git format-patch` files.
Most of what herdr-jay adds is mods (no source change); this folder is only for what a mod can't do.
這裡是 jayweihung 對 Herdr 原始碼的修改（純文字 patch）。大部分功能是 mod，不用改原始碼；只有 mod 做不到的才在這裡。

Layout: `patches/<repo>/<official tag>/NNNN-*.patch`, e.g. `patches/herdr-core/v0.1.19/0001-....patch`.
Each set applies on top of exactly that official release tag.
**No folder for a repo = no changes to it**: build the official tag as is.
A tag that needs no patches still gets a folder holding only README.md, so the update steps know it was checked.
不需要 patch 的 tag 也有資料夾（只放 README.md），更新步驟才知道 jay 驗過。
沒有某個 repo 的資料夾＝沒改它，直接 build 官方版本。

## What is here now / 目前有的修改

| Repo / tag | Patch | Why |
|---|---|---|
| herdr-core v0.1.19 | `0001-build-skip-Ghostty-s-xcframework…` | lets core build on a Mac with only the Command Line Tools (herdr-app already does this); harmless on Windows |
| herdr-app v0.1.13 | none | |

## Apply / 套用

Step by step with checks: [docs/macos.md](../docs/macos.md), [docs/windows.md](../docs/windows.md).

macOS (zsh), from the repo, on the tag the patch folder is named after:

```sh
git checkout v0.1.19
git submodule update --init --recursive
git -c user.name=me -c user.email=me@local am -3 ~/src/herdr-jay/patches/herdr-core/v0.1.19/*.patch
```

Windows (PowerShell does not expand `*.patch` for git):

```powershell
$j = "$env:USERPROFILE\src\herdr-jay"
git -c user.name=me -c user.email=me@local am -3 (Get-ChildItem "$j\patches\herdr-core\v0.1.19\*.patch" | Sort-Object Name).FullName
```

The `-c user.name=… user.email=…` only lets `git am` record the commit on a machine where git has no name set.
If `git am` fails: `git am --abort`, make sure you are on exactly that tag, try again.
`-3` lets git fall back to a 3-way merge if the files moved a little.

**Moved tags**: upstream sometimes moves a release tag a few CI/test commits later (e.g. herdr-core v0.1.19:
`2e8ebb3` → `06793ed`). Each patch's `base-commit:` line and the README versions table say which commit was checked; the
patches apply to either. Use `git fetch --tags --force` to get the moved tag.
上游偶爾會把 tag 移到後面幾個 CI/測試 commit；patch 兩邊都套得上。

## License

Apache License 2.0, like Herdr and the rest of herdr-jay.
