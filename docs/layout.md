# jay's layout / jay 的畫面排法

`herdr-app/layouts/jay.json` is the Herdr layout jay uses: Herdr's `main` layout plus

- buttons on the right of the tab bar that open and close side panels: **Agents** and **Kit** (from
  [agentkit](https://github.com/jayweihung/agentkit)), **Gerrit** (`herdr-app/mods/gerrit`, [gerrit.md](gerrit.md));
- the Kit bar on top of every terminal (`kit-pane`: rules / skills / MCP, and the context cell).

jay 用的 layout：Herdr 的 main 加上右上角的 Agents、Kit、Gerrit 按鈕和面板，以及每個終端機上方的 Kit 列。

It needs those mods installed: kit's three (`kit herdr-panel install`, see agentkit's docs) and `gerrit`.
Without a mod, its place in the layout stays empty or shows an error; everything else works.
沒裝那些 mod 的話，那一塊會空著或顯示錯誤，其他照常。

## Install / 安裝

macOS:

```sh
ln -sfn ~/src/herdr-jay/herdr-app/layouts/jay.json ~/.config/herdr-app/layouts/jay.json
```

Windows (PowerShell):

```powershell
$j = "$env:USERPROFILE\src\herdr-jay"; $h = "$env:USERPROFILE\.config\herdr-app"
Copy-Item -Force "$j\herdr-app\layouts\jay.json" "$h\layouts\jay.json"
```

Then pick **jay** in Herdr's layout menu. 然後在 Herdr 的 layout 選單選 **jay**。

`kit herdr-panel install` edits the layout in use (it adds or keeps its own blocks). On macOS that writes into
this repo through the link: check `git diff` before committing. On Windows, copy again after a herdr-jay update
(your copy is not changed by `git pull`).
