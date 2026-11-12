# jay's layout / jay 的畫面排法

`herdr-app/layouts/jay.json` (macOS) and `jay-win.json` (Windows) are the Herdr layout jay uses: Herdr's own `main`
layout (copied from it) plus

- buttons in the tab bar that open and close side panels: **Agents** and **Kit** (`herdr-app/mods/kit`,
  [kit.md](kit.md)), **Gerrit** (`herdr-app/mods/gerrit`, [gerrit.md](gerrit.md));
- kit's bar on top of every terminal (the `kit` mod's `header` role: rules / skills / MCP, and the context cell)
  instead of Herdr's;
- theme paper (light) / ink (dark); the sidebar opens on "changes".

jay 用的 layout：從 Herdr 的 main 複製，加上 Agents、Kit、Gerrit 按鈕和面板、每個終端機上方的 Kit 列。

**Two files** because Herdr draws the window buttons (─ □ ✕) at the right end of the tab bar on Windows: `jay-win.json`
puts the three buttons **left** of the tabs so ✕ stays in the corner; `jay.json` puts them on the right (macOS keeps
its window buttons on the left). Otherwise the two are the same.
Windows 的關閉鈕在分頁列最右邊，所以 Windows 版把三顆按鈕放在分頁左邊。

**What it needs**: the `kit` mod and **kit** itself (a separate tool, with `kit api`: see [kit.md](kit.md#needs--需要什麼);
at the company from the company's own Git server, never from GitHub), and the `gerrit` mod. Without a mod, its
place in the layout stays empty or shows an error (without `kit`, every terminal's top bar does); everything else
works. Without kit, keep Herdr's `main`.
需要 `kit` mod 和 kit 本身（要有 `kit api` 的版本；公司從自己的 Git 伺服器拿，怎麼裝看 kit 的說明），以及 `gerrit` mod。沒有 kit 就繼續用 Herdr 的 main。

## Install / 安裝

Order: kit (the tool, `kit api` prints `1`), the mods, then the layout.
順序：先裝好 kit，再放 mod，最後放 layout 並選它。

**macOS** (links: `git pull` in herdr-jay updates them):

```sh
cd ~/.config/herdr-app/mods
rm -rf kit-agents kit-pane            # an older kit's own mods, now part of kit
[ -L kit ] || rm -rf kit              # an older kit's own copy of kit (a folder, not a link)
ln -sfn ~/src/herdr-jay/herdr-app/mods/kit .
ln -sfn ~/src/herdr-jay/herdr-app/layouts/jay.json ~/.config/herdr-app/layouts/jay.json
herdr-app check ~/.config/herdr-app/mods/kit
```

**Windows** (PowerShell):

```powershell
$j = "$env:USERPROFILE\src\herdr-jay"
$h = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } elseif ($env:XDG_CONFIG_HOME) { "$env:XDG_CONFIG_HOME\herdr-app" } else { "$env:USERPROFILE\.config\herdr-app" }
Remove-Item -Recurse -Force "$h\mods\kit", "$h\mods\kit-agents", "$h\mods\kit-pane" -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force "$j\herdr-app\mods\kit" "$h\mods\"
Copy-Item -Force "$j\herdr-app\layouts\jay-win.json" "$h\layouts\jay-win.json"
herdr-app check "$h\mods\kit" | Out-Host       # check passed
Test-Path "$h\layouts\jay-win.json"            # must be True
```

The Gerrit panel, if you use it: [gerrit.md](gerrit.md). Then in Herdr's layout menu pick **jay** (macOS) or
**jay-win** (Windows), and quit and reopen Herdr.
然後在 Herdr 的 layout 選單選 jay（Mac）／jay-win（Windows），重開 Herdr。

**Updating**: macOS follows `git pull` through the links. Windows: run the Windows block again after a herdr-jay
update whose CHANGELOG says **layout** or **mods**. The panel's 「放進上排」 only shows on a layout without kit's
buttons; it never edits jay's.
