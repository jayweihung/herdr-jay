# Patches to Herdr itself / 對 Herdr 本體的修改

jayweihung's own changes to Herdr's source, as plain-text `git format-patch` files.
Most of what herdr-jay adds is mods (no source change); this folder is only for what a mod can't do.
這裡是 jayweihung 對 Herdr 原始碼的修改（純文字 patch）。大部分功能是 mod，不用改原始碼；只有 mod 做不到的才在這裡。

Layout: `<repo>/patches/<official tag>/NNNN-*.patch` (the same folder names as Herdr's own repos), e.g.
`herdr-core/patches/v0.1.19/0001-....patch`.
Each set applies on top of exactly that official release tag.
**No folder for a repo = no changes to it**: build the official tag as is.
A tag that needs no patches still gets a folder holding only README.md, so the update steps know it was checked.
不需要 patch 的 tag 也有資料夾（只放 README.md），更新步驟才知道 jay 驗過。
沒有某個 repo 的資料夾＝沒改它，直接 build 官方版本。

## What is here now / 目前有的修改

| Repo / tag | Patch | Why |
|---|---|---|
| herdr-core v0.1.21 | none (folder with README.md only) | checked 2026-11-13 |
| herdr-core v0.1.20 | none (folder with README.md only) | the v0.1.19 patch is in the official source since v0.1.20 (#182) |
| herdr-core v0.1.19 | `0001-build-skip-Ghostty-s-xcframework…` | lets core build on a Mac with only the Command Line Tools (herdr-app already does this); harmless on Windows |
| herdr-app v0.1.15 | `0001-feat-drag-from-a-mod-onto-a-space…`, `0002-fix-keep-mod-drags-from-moving-windows…` | a mod can make what it draws draggable (`.on_drag`) and learn when it is dropped on a space in the sidebar Agents / Spaces panels (`nextDrop`): the Kit panel drags an agent onto a space ([kit.md](kit.md)). Mods can't add this themselves; the two built-in panels (agents, spaces) are changed by one import line and a few lines each. Without the patches the Kit panel shows a 「放到 space…」 button instead. |
| herdr-app v0.1.15 | `0003-feat-a-terminal-s-own-icon-in-the-lists…` | a terminal can have its own icon in the lists in place of its program's: `tab.new {icon}`, `terminal.icon {terminal, icon}`, kept as the core label `herdr.icon` (an .svg/.png under the app's folder, a plain relative path; anything else is ignored). The Kit panel opens a placed agent with its own logo. Without it the tab opens with the program's icon. |
| herdr-app v0.1.15 | `0004-feat-a-drag-can-refuse-some-drop-targets…` | a mod's drag can name the drop targets that won't take it: `on_drag(payload, label, refuse, refused_label)` (`refuse`: `drop_key`s, one per line) and a target's `.drop_key(key)`; the built-in Agents and Spaces panels key a space's row by its id. Over a refused target it dims, the chip says `refused_label`, the pointer shows the not-allowed sign, and a drop there isn't handed over. The Kit panel refuses the spaces where that agent already runs. Without it a drop there just shows the agent's tab. |

## Apply / 套用

Step by step with checks: [macos.md](macos.md), [windows.md](windows.md).

**Today (core v0.1.21, app v0.1.15): core has nothing to apply; the app has the two drag patches.** Set the tag from
the README versions table; never apply one tag's patches on another tag.
現在 core 沒有補丁；app v0.1.15 有兩個（拖到 space）。只套那個 tag 自己資料夾裡的。

macOS (zsh), in the Herdr repo (`herdr-core` or `herdr-app`), on that tag:

```sh
repo=herdr-core tag=vX.Y.Z
git checkout "$tag"
git submodule update --init --recursive
ls ~/src/herdr-jay/$repo/patches/$tag/*.patch && git -c user.name=me -c user.email=me@local am -3 ~/src/herdr-jay/$repo/patches/$tag/*.patch
```

Windows (PowerShell does not expand `*.patch` for git):

```powershell
$j = "$env:USERPROFILE\src\herdr-jay"; $repo = "herdr-core"; $tag = "vX.Y.Z"
$p = @(Get-ChildItem "$j\$repo\patches\$tag\*.patch" -ErrorAction SilentlyContinue | Sort-Object Name)
if ($p.Count) { git -c user.name=me -c user.email=me@local am -3 $p.FullName } else { "no patches for $repo $tag" }
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
