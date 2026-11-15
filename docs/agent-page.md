# agent-page: an agent's HTML page beside it / agent 做的說明頁開在旁邊

An agent writes an HTML page (an explanation, a diagram, a comparison) and shows it in a Herdr pane right of
itself, instead of opening a browser. The pane shows the newest page; when the agent writes another one (or rewrites
it), the pane switches to it. ◀ ▶ step through the agent's earlier pages, ⟳ loads the page again.
agent 寫一個 HTML 說明頁，開在自己右邊的 Herdr 格子裡，不用另開瀏覽器。寫新的頁面（或改舊的）格子就換過去；◀ ▶ 看之前的頁面。

- **Only local files** the agent wrote into this mod's folder. No web sites: a link to one opens in the system
  browser. 只開 agent 寫在這個 mod 資料夾裡的檔，不開網站；頁面裡的網址連結用系統瀏覽器開。
- **Agents on this computer.** The page is a file on the computer Herdr runs on, so an agent on another machine
  (over ssh) can't put one here. 只給同一台電腦上的 agent。
- Needs the Herdr build with web elements and `props.pane` (app patches 0015–0024, [patches.md](patches.md)): macOS
  14 or later; Windows with the WebView2 Runtime (not run on Windows yet).
  要有網頁格的 Herdr（app patch 0015–0024）。

## Install / 安裝

macOS: link the mod like the others ([macos.md](macos.md)):

```sh
ln -s ~/src/herdr-jay/herdr-app/mods/agent-page ~/.config/herdr-app/mods/agent-page
```

Windows: copy it ([windows.md](windows.md) §8.4):

```powershell
Copy-Item -Recurse -Force "$j\herdr-app\mods\agent-page" "$h\mods\"
herdr-app check "$h\mods\agent-page" | Out-Host
```

The pages go in the mod's `pages/` folder (git ignores it). 頁面放在 mod 的 `pages/` 底下，git 不收。

## For the agent / 給 agent 的步驟

1. **Write the page** to `<Herdr home>/mods/agent-page/pages/<your terminal id>/<time>-<topic>.html` (make the
   folder first, e.g. `mkdir -p`; the mod may not write there itself):
   - `<Herdr home>`: `~/.config/herdr-app` (`$HERDR_APP_HOME` if set; Windows: `%USERPROFILE%\.config\herdr-app`).
   - `<your terminal id>`: `$HC_TERMINAL_ID` (e.g. `t63`).
   - Start the name with the time, `2026-11-16-0430-topic.html`: names sort oldest to newest, and with no page
     written since it opened the pane shows the last name.
   - One self-contained file: inline CSS and scripts, or files next to it in the same folder. Nothing from the web
     (a CDN script won't load in a file page; links to sites open in the browser).
2. **Open the pane once** (it stays open, and shows each new page by itself):

   ```sh
   me=$(herdr-app ls | python3 -c 'import json,os,sys
   t=os.environ["HC_TERMINAL_ID"]
   print(next(x["pane"] for s in json.load(sys.stdin)["spaces"] for b in s["tabs"] for x in b["terminals"] if x["terminal"]==t))')
   herdr-app do pane.split "{\"direction\":\"right\",\"pane\":\"$me\",\"mod\":\"agent-page\",\"props\":{\"dir\":\"$HC_TERMINAL_ID\",\"beside\":\"$me\"}}"
   ```

   Running it again while the pane is open is harmless: the new copy sees the open one and closes itself. Either way
   the keyboard goes back to your pane, so the person keeps typing to you.
   再開一次也沒關係：新的那格看到已經有一格開著，會自己關掉。鍵盤會還給 agent 那格。
3. Tell the person the page is open beside you, in one line.

`props`: `dir` the folder under `pages/` (letters, digits, `.` `_` `-`; anything else becomes `_`), `beside` the pane
that gets the keyboard back. The app adds `pane` (the mod pane's own id).
