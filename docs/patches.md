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
| herdr-core v0.1.21 | `0001-feat-a-terminal-s-record-keeps-whom-it-sent-messages…` | `hc send` from inside a terminal adds `sent: [{to, count, last_ms, text}]` to the sender's record (one entry per receiver, the latest last, at most 32; `text`: the last message's first line, 120 characters) and a `sent` event; a receiver on another machine is kept by this core's name for it, and a machine's records read the same way here. The Kit panel's 關係 tab draws who talks to whom from it ([kit.md](kit.md) §3). Nothing else changes: the message is typed in as before. Without it the tab shows the agents but no lines. Plain Rust, nothing per OS. |
| herdr-core v0.1.20 | none (folder with README.md only) | the v0.1.19 patch is in the official source since v0.1.20 (#182) |
| herdr-core v0.1.19 | `0001-build-skip-Ghostty-s-xcframework…` | lets core build on a Mac with only the Command Line Tools (herdr-app already does this); harmless on Windows |
| herdr-app v0.1.16 | `0001-feat-drag-from-a-mod-onto-a-space…`, `0002-fix-keep-mod-drags-from-moving-windows…` | a mod can make what it draws draggable (`.on_drag`) and learn when it is dropped on a space in the sidebar Agents / Spaces panels (`nextDrop`): the Kit panel drags an agent onto a space ([kit.md](kit.md)). Mods can't add this themselves; the two built-in panels (agents, spaces) are changed by one import line and a few lines each. Without the patches the Kit panel shows a 「放到 space…」 button instead. |
| herdr-app v0.1.16 | `0003-feat-a-terminal-s-own-icon-in-the-lists…` | a terminal can have its own icon in the lists in place of its program's: `tab.new {icon}`, `terminal.icon {terminal, icon}`, kept as the core label `herdr.icon` (an .svg/.png under the app's folder, a plain relative path; anything else is ignored). The Kit panel opens a placed agent with its own logo. Without it the tab opens with the program's icon. |
| herdr-app v0.1.16 | `0004-feat-a-drag-can-refuse-some-drop-targets…` | a mod's drag can name the drop targets that won't take it: `on_drag(payload, label, refuse, refused_label)` (`refuse`: `drop_key`s, one per line) and a target's `.drop_key(key)`; the built-in Agents and Spaces panels key a space's row by its id. Over a refused target it dims, the chip says `refused_label`, the pointer shows the not-allowed sign, and a drop there isn't handed over. The Kit panel refuses the spaces where that agent already runs. Without it a drop there just shows the agent's tab. |
| herdr-app v0.1.16 | `0005-feat-drop-at-a-place-in-a-space-s-group-reorder-age…` | in the agents panel grouped by space, every agent row under a space's header takes a mod's drag too, a line showing where it lands (the header: first; a row: right after its tab); `dropOnSpace(drop, space, index)` and `nextDrop()`'s `index` (before that tab position, 1 = first; null on the spaces panel). A row also drags to another place in its own group (`tab.move`; other spaces refuse it). The Kit panel moves the new tab to the place it was dropped. Without it only the header takes the drop and the tab opens last. |
| herdr-app v0.1.16 | `0006-feat-tab.new-shell-false…` | `tab.new {argv, shell: false}` runs argv by itself instead of in your shell that stays after it, so the tab closes when the program exits. A Gerrit review opened in nvim (在 nvim 看) uses it: quitting nvim closes its tab. Without it the tab keeps a shell after nvim quits (the Gerrit panel no longer takes that shell for nvim). |
| herdr-app v0.1.16 | `0007-feat-edits-in-a-linked-mod-layout-or-settings-file-r…` | a mod, layout, theme or settings file that is a link into another folder (macOS: the herdr-jay mods linked into `~/.config/herdr-app`) reloads when edited there: the OS watcher doesn't follow links, so their targets are watched too (links read at start; a new link counts after a restart). Without it an edit in the repo shows only after the link is made again (`rm` + `ln -s`) or Herdr restarts. |
| herdr-app v0.1.16 | `0008-feat-keep-a-terminal-s-sent-list-current…` | applies the core's `sent` event (core `0001`) to the terminal list mods get (`terminals()`), so the 關係 tab's lines appear as messages are sent. One line; without it they appear only when the list is read again. Harmless with a core without the event. |
| herdr-app v0.1.16 | `0009-feat-the-Agents-list-shows-a-done-agent-as-working-w…` | the built-in Agents list reads shared `agents.busy` (address -> what runs) and shows those done agents as working: the kit mod puts there agents whose turn ended while their own work still runs (a background command, a sub-agent). Without it the list shows them as done (the 關係 tab still says 背景工作中). Harmless without the kit mod. |
| herdr-app v0.1.16 | `0010-feat-the-Agents-list-shows-an-agent-another-mod-says…` | the built-in Agents list reads shared `agents.waiting` (address -> { since, hot }) and shows those agents as Needs you, in red (`ansi1`) when hot: the kit mod puts there an agent waiting for the owner's OK (`kit pending add`, found by its pid) and one waiting for you 10 minutes or more. Same colors as the 關係 tab (orange, then red). Without it the list shows such an agent as done or idle. Harmless without the kit mod. |
| herdr-app v0.1.16 | `0011-fix-herdr-98-s-start-menu-and-quick-launch-offer-the…` | Herdr 98's Start menu and Quick Launch list the installed agents Herdr knows (`knownAgents()`, as the new-tab menu does) instead of their own list: each starts with its programs.json `run`, so Codex as `codex --no-daemon` (bare `codex` could run its commands in a shared Codex daemon, outside Herdr's terminal), an agent added in `programs.json` (omp) shows too, and the installed check works on Windows (the old one used `sh`: no agents there). Only the shipped `win98` mod changes. Without it Herdr 98 starts Codex without `--no-daemon` and lists no omp. |
| herdr-app v0.1.16 | `0012-feat-right-click-an-agent-in-the-agents-list…`, `0014-fix-the-agents-menu-s-sends-run-as-typed…` | right-click an agent in the built-in Agents list for a menu: compact, clear, new, continue, interrupt (typed into that agent's terminal as you would), pin, close, and items other mods add (`agentMenu`); it says when a send went through, with short reasons when it didn't. Without them the list has no right-click menu. |
| herdr-app v0.1.16 | `0013-chore-drop-the-type-files-herdr-app-check-generated…` | removes `.d.ts` files `herdr-app check` had written into the source tree by mistake. No behavior change. |
| herdr-app v0.1.16 | `0015-feat-a-web-element-for-mods…`, `0016-feat-a-web-page-s-alert-confirm-and-prompt…`, `0020-feat-a-web-page-s-user-agent-ends-in-herdr…`, `0022-feat-web-elements-on-windows…` | a mod can show a real web page: `web.new(id, { src, persist?, zoom? })`, `webCall`, `nextWebEvent` (macOS: the system's WebKit; Windows: WebView2, through wry). Only the sites in the mod's `mod.json` (`"web": { "allow": [...] }`, exact origins) load at the top level; other links, new windows and downloads open in the system browser. Microphone and camera for allowed sites only; alert / confirm / prompt as dialogs; `persist: true` keeps a sign-in across restarts (per mod and page id); no scripts into the page, no inspector. The page hides while a Herdr dialog, menu, popup or drag is over it, and Herdr's shortcuts keep working while it types (editing keys stay in the page). Its user agent ends in `Herdr/<version>`. On Windows GPUI's DirectComposition visual is put under child windows (one line in the vendored `gpui-pre-windows`) so the page isn't drawn over. **Windows: built and run on GitHub's Windows Server 2025 (2026-11-18: docs/windows.md steps, a page shown while terminals print, its data in `%LOCALAPPDATA%\herdr-app\WebView2`); keys and clicks not tried by a person yet.** Linux: the element says it isn't supported. Without them a mod can't show a web page. |
| herdr-app v0.1.16 | `0023-feat-a-mod-pane-s-object-props-get-its-own-pane`, `0024-fix-file-pages-of-a-linked-mod-load-on-macos…` | a mod pane opened with object `props` (`pane.split {mod, props}`) also gets its own `pane` in them, so it can close or focus itself (agent-page closes a second copy for the same agent). 0024: a `file://` page of a mod that is a link (`~/.config/herdr-app/mods/x` → your clone) loads on macOS: WebKit got read access to the folder the link points to but the file by the link's path, and showed nothing; now both are the real path. Plain Rust (0024: macOS only). Without them agent-page opens a second pane each time, and a linked mod's pages stay blank on macOS. |
| herdr-app v0.1.16 | `0025-feat-pane.split-share-gives-a-mod-pane-less-or-more…` | `pane.split {mod, share}`: the mod pane takes `share` (0.1–0.9) of the room it splits instead of half (agent-page opens at 0.35, so the agent keeps most of it). Plain Rust. Without it the pane opens at half. |
| herdr-app v0.1.16 | `0026-feat-text-in-mod-panels-can-be-selected-and-copied` | text in a mod's panel can be selected with the mouse (drag across it) and copied with the copy key (⌘C / Ctrl+Shift+C, `terminal.copy`): plain text a mod draws, and `TextView.html(...).selectable(true)`. With text selected in a mod the copy key copies it; with nothing selected the key goes on to the terminal as before. A click that didn't move still clicks (a row still opens). Plain Rust in the vendored gpui-kit and the app, nothing per OS. Without it a panel's text can't be copied. mod 面板的字可以拖曳選取、用複製鍵複製。 |
| herdr-app v0.1.16 | `0027-chore-third-party-notices-with-the-web-element-s-cra…` | `THIRD-PARTY-NOTICES` regenerated (`just notices`: bun + cargo-about 0.9.3) so it lists the licenses of the crates the web element brings in (wry and its dependencies); the app's notices test checks it. No behavior change. 授權清單補上網頁格用到的套件。 |
| herdr-app v0.1.16 | `0028-fix-the-app-drops-an-hc-identity-it-was-started-with` | The app drops `HC_TERMINAL_ID`, `HC_TERMINAL_SOCKET` and `HC_SCOPE` when it starts (`HC_SESSION` stays: it picks the core). Opened from a terminal in Herdr (`open` there), it used to keep that terminal's hc identity, so every `hc` a mod ran was sent as that terminal: the Agents menu's 壓縮 / 清空 / 繼續 arrived as `<hc from="t…">` messages instead of being typed in. 從 Herdr 裡的終端機開 app 時，不再帶著那格的身分（右鍵壓縮等才會真的打進去）。 |
| herdr-app v0.1.16 | `0029-fix-agents-files-and-changes-panels-remember-folds…` | The agents, files and changes panels keep their state across a reload or restart (localStorage): folded groups and agent trees; each folder's open subfolders and previewed file; per folder the picked file, closed diffs and an unsent commit message (cleared after a commit). Each keeps at most 50 folders. 面板關掉、重載、重開 Herdr 後，收合、展開的資料夾、選的檔、沒送的 commit 訊息都還在。 |
| herdr-app v0.1.16 | `0030-fix-a-hidden-web-page-no-longer-takes-files-dropped-…` | A web page that was moved away (a panel switched to another tab, a zoomed pane restored) is hidden **and** has no frame left: AppKit kept offering drags to the hidden page where it last was, so a screenshot or file dropped on the terminal there went into the page and the terminal got no path. Windows does the same (bounds 0). 藏起來的網頁格不再留在原位，拖到終端機的截圖、檔案不會被它收走。 |
| herdr-app v0.1.16 | `0017-feat-layout.zoom-shows-one-layout-node-alone…`, `0018-feat-layout-marks-the-node-layout.zoom-shows…`, `0019-fix-a-zoomed-layout-node-fills…`, `0021-fix-layout.zoom-lifts-the-node-s-largest-size…` | `layout.zoom {id}` shows one layout node (e.g. a side panel) alone in its row or column, filling it (its size and largest size are lifted while zoomed); again shows the rest. Never saved. `layout()` marks that node `zoomed: true`, so a panel can draw its zoom / unzoom button. 0019 also stops a crash when quitting with a web page open (macOS). Plain Rust, nothing per OS. Without them a panel can't take the whole width. |
| herdr-app v0.1.16 | `0031-feat-the-agents-menu-s-compact-is-queued-while-the-a…` | The Agents right-click menu's 壓縮 works while the agent works too (or is done while its own work still runs, `agents.busy`): it is queued (「已排隊，這輪結束後壓縮」) and typed in once the agent stops; once sent its row and menu say 「壓縮中…」 until a turn ends after it (the core's turn), the kit mod sees `kit context` say compacted, or 3 minutes (a note). Pressed again meanwhile, here or in the kit mod's context window, it only says 「已經在壓縮了」: one `/compact` per agent, kept in shared `compact/<address>` (`{ state: "queued" \| "sent", at, text, sent?, turn? }`). Sent plainly (`hc send`, not `--if idle`: the core still calls an agent you looked at done, and hc's `--if` knows only idle and working). Also makes `scripts/agents.test.ts` run again (earlier patches' exports and `import * as host` had broken it). 壓縮按了會說在排隊、壓縮中，連按只送一次。 |
| herdr-app v0.1.16 | `0032-fix-an-omp-compact-ends-30-s-after-it-was-typed-in-o…` | omp's status doesn't move while it compacts (it stays done, the core's turn doesn't go up; checked with omp 18.18.6), so 0031's 「壓縮中…」 waited 3 minutes and said it stopped waiting. A compact pressed for omp is marked `quiet` in `compact/<address>` and counts as done 30 seconds after it was typed in (the note says so). Claude Code and Codex report working, then done, while they compact: a turn still ends theirs. omp 的壓縮送出 30 秒後當作好了（它不回報壓縮中）。 |

## Apply / 套用

Step by step with checks: [macos.md](macos.md), [windows.md](windows.md).

**Today (core v0.1.21, app v0.1.16): core has one patch (`0001`), the app the ones in the table above.** Set the tag from
the README versions table; never apply one tag's patches on another tag.
現在 core 有一個補丁；app v0.1.16 有上表那幾個。只套那個 tag 自己資料夾裡的。

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
