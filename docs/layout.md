# jay's layout / jay 的畫面排法

`herdr-app/layouts/jay.json` (macOS) and `jay-win.json` (Windows) are the Herdr layout jay uses: Herdr's own `main`
layout (copied from it) plus

- buttons in the tab bar that open and close side panels: **Agents** and **Kit** (kit's mods), **Gerrit**
  (`herdr-app/mods/gerrit`, [gerrit.md](gerrit.md));
- kit's bar on top of every terminal (`kit-pane`: rules / skills / MCP, and the context cell) instead of Herdr's;
- theme paper (light) / ink (dark); the sidebar opens on "changes".

jay 用的 layout：從 Herdr 的 main 複製，加上 Agents、Kit、Gerrit 按鈕和面板、每個終端機上方的 Kit 列。

**Two files** because Herdr draws the window buttons (─ □ ✕) at the right end of the tab bar on Windows: `jay-win.json`
puts the three buttons **left** of the tabs so ✕ stays in the corner; `jay.json` puts them on the right (macOS keeps
its window buttons on the left). Otherwise the two are the same.
Windows 的關閉鈕在分頁列最右邊，所以 Windows 版把三顆按鈕放在分頁左邊。

**What it needs**: kit's three mods (`kit`, `kit-pane`, `kit-agents`) and `gerrit`. kit is a separate tool,
**agentkit**: at the company, get it from the company's own Git server (the copy made with `kit export-self`), never
from GitHub; its `docs/company.md` has the install. Without a mod, its place in the layout stays empty or shows an
error (without `kit-pane`, every terminal's top bar does); everything else works. Without kit, keep Herdr's `main`.
需要 kit 的三個 mod（公司從自己的 Git 伺服器拿 agentkit，照它的 docs/company.md 裝）和 gerrit。沒裝 kit 就繼續用 Herdr 的 main。

## Install / 安裝

Order: the layout first, then kit. `kit herdr-panel install` adds its blocks to the layout **in use**; with jay's
layout selected they are already there, so it only installs the mods.
先放 layout 並選它，再裝 kit。

**macOS**:

```sh
ln -sfn ~/src/herdr-jay/herdr-app/layouts/jay.json ~/.config/herdr-app/layouts/jay.json
```

**Windows** (PowerShell):

```powershell
$j = "$env:USERPROFILE\src\herdr-jay"
$h = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } elseif ($env:XDG_CONFIG_HOME) { "$env:XDG_CONFIG_HOME\herdr-app" } else { "$env:USERPROFILE\.config\herdr-app" }
Copy-Item -Force "$j\herdr-app\layouts\jay-win.json" "$h\layouts\jay-win.json"
Test-Path "$h\layouts\jay-win.json"    # must be True
```

Then in Herdr's layout menu pick **jay** (macOS) or **jay-win** (Windows); then install kit and run
`kit herdr-panel install`; copy the Gerrit panel if you use it ([gerrit.md](gerrit.md)). Quit and reopen Herdr.
然後在 Herdr 的 layout 選單選 jay（Mac）／jay-win（Windows），再裝 kit、跑 `kit herdr-panel install`。

**Updating**: macOS follows `git pull` through the link. Windows: run the Windows block again after a herdr-jay
update whose CHANGELOG says **layout**. `kit herdr-panel install` may edit the layout in use: on macOS that writes into
this repo through the link (check `git diff` before committing).
