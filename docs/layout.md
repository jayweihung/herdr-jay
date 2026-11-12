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

**What it needs**: the `kit` mod and **kit** itself (a separate tool, 0.3.0 or later: see [kit.md](kit.md#needs--需要什麼);
at the company from the company's own Git server, never from GitHub), and the `gerrit` mod. Without a mod, its
place in the layout stays empty or shows an error (without `kit`, every terminal's top bar does); everything else
works. Without kit, keep Herdr's `main`.
需要 `kit` mod 和 kit 本身（kit 0.3.0 以上；公司從自己的 Git 伺服器拿，怎麼裝看 kit 的說明），以及 `gerrit` mod。沒有 kit 就繼續用 Herdr 的 main。

## Install / 安裝

Order: kit (the tool, 0.3.0 or later: `kit api` prints `1.0`), the `kit` mod, then the layout.
順序：先裝好 kit（0.3.0 以上），再放 kit mod，最後放 layout 並選它。

1. **kit** itself: kit's own guide (at the company: from the company's own Git server).
2. **The `kit` mod**: [kit.md → Install](kit.md#install--安裝) (macOS and Windows).
3. **The layout file**. macOS (a link: `git pull` in herdr-jay updates it):

   ```sh
   ln -sfn ~/src/herdr-jay/herdr-app/layouts/jay.json ~/.config/herdr-app/layouts/jay.json
   ```

   Windows (PowerShell):

   ```powershell
   $j = "$env:USERPROFILE\src\herdr-jay"
   $h = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } elseif ($env:XDG_CONFIG_HOME) { "$env:XDG_CONFIG_HOME\herdr-app" } else { "$env:USERPROFILE\.config\herdr-app" }
   Copy-Item -Force "$j\herdr-app\layouts\jay-win.json" "$h\layouts\jay-win.json"
   Test-Path "$h\layouts\jay-win.json"            # must be True
   ```

4. The Gerrit panel, if you use it: [gerrit.md](gerrit.md). Then in Herdr's layout menu pick **jay** (macOS) or
   **jay-win** (Windows), and quit and reopen Herdr.
   然後在 Herdr 的 layout 選單選 jay（Mac）／jay-win（Windows），重開 Herdr。

**Updating**: macOS follows `git pull` through the links. Windows: copy the layout file again (step 3) after a
herdr-jay update whose CHANGELOG says **layout**, and the kit mod (kit.md) when it says **mods** or **kit**. The kit
panel's 「放進上排」 / 「更新版面」 only show on a layout that still needs them; jay's never does.
