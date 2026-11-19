# agent-page: where an agent stands, and its pages, beside it / agent 的進度和說明頁開在旁邊

A pane right of an agent with tabs:

- **進度** (first): where the agent's work stands, so you don't have to ask: **等你** (what it needs from you, with
  the command to type), **正在做**, **還沒做**, and **做完的** of the last 3 days by day (older ones stay in the file,
  counted). The agent keeps it in `status.json` (below); the tab redraws when it changes.
- Then one tab per HTML page the agent wrote for you (a comparison, a design, a diagram), newest first. A new page
  opens in its tab by itself; ⟳ loads it again. Closed and opened again (or after a Herdr restart) it shows the tab
  you left it on, and a page keeps what it saved in its localStorage.

Open it with the page button in an agent pane's header (beside split / zoom / close; it stays lit while the pane is
open, and closes it again), or **說明頁** in the Agents list's right-click menu (both from the kit mod), or by the agent.
A **red dot** on the button (shown even without hover) means the agent wrote a page, or wrote one again, that this
computer hasn't shown yet; the button then opens on that page (the oldest such one), and its tab has a dot too. What
was seen is kept per computer (the phone app keeps its own); the first look at an agent counts its pages as seen.
agent 右邊一格：第一個分頁「進度」是等你、正在做、還沒做、最近 3 天做完的；後面每個分頁是 agent 寫給你的一頁。
關掉再開、或重開 Herdr，會回到你上次看的那個分頁。
用 agent 那格標題列的說明頁按鈕（再按一下關掉）、Agents 清單右鍵的「說明頁」，或 agent 自己開。
按鈕上有**紅點**：agent 寫了新頁或改過一頁，這台電腦還沒看過；按下去直接開那頁，分頁上也有紅點。看過的記錄每台各自分開（手機 App 也一樣）。

- **Only local files** the agent wrote into this mod's folder. No web sites: a link to one opens in the system
  browser. 只開 agent 寫在這個 mod 資料夾裡的檔，不開網站；頁面裡的網址連結用系統瀏覽器開。
- **An agent on another machine** (a Herdr machine over ssh) writes the same folder there, under the home of the user
  Herdr connects as: `~/.config/herdr-app/mods/agent-page/pages/<its terminal id>/`. The pane lists it there every
  15 s (through Herdr's connection) and copies what changed with `scp` over the machine's ssh target (`hc machine ls`),
  so the pages show here (in `.pages/<machine>_<id>/`). Needs `scp` here and key login to that target (as Herdr's own connection). Files deleted
  there stay here. 別台機器上的 agent 寫在那台同一個位置（Herdr 連線用的帳號的家目錄），面板每 15 秒去看，有變就用 scp 抄過來。
  An agent running as another user there (e.g. root) writes into that user's folder and makes the files readable
  (`chmod a+r`). 用別的帳號（例如 root）跑的 agent 寫到連線帳號的資料夾，並讓檔案可讀。
- Needs the Herdr build with web elements and `props.pane` (app patches 0015–0025, [patches.md](patches.md)): macOS
  14 or later; Windows with the WebView2 Runtime (not run on Windows yet).
  要有網頁格的 Herdr（app patch 0015–0025）。

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

The pages go in the mod's hidden `.pages/` folder (git ignores it). Hidden because Herdr reloads a mod when a file in
its folder changes, except under hidden folders: with a plain `pages/`, every page or status written reloaded every
open agent-page (it flickered; one on another machine copied again and again). 頁面放在 mod 的 `.pages/`（點開頭：Herdr 不會因為它變動而重新載入 mod），git 不收。

## For the agent / 給 agent 的步驟

The folder is `<Herdr home>/mods/agent-page/.pages/<your terminal id>/` (on another machine than Herdr's:
`~/.config/herdr-app/mods/agent-page/pages/<your terminal id>/` in the home of the user Herdr connects as) (make it first, e.g. `mkdir -p`; the mod may
not write there itself). `<Herdr home>`: `~/.config/herdr-app` (`$HERDR_APP_HOME` if set; Windows:
`%USERPROFILE%\.config\herdr-app`). `<your terminal id>`: `$HC_TERMINAL_ID` (e.g. `t63`).

**`status.json`: keep it current** at the same moments you'd write a progress line (a step done, a guess confirmed,
stuck, waiting for the person, all done). Rewrite the whole file; keep done items (the pane shows the last 3 days).
It's also your handoff: after a restart or a compacted conversation, read it first.
Forgetting is caught: nvim-jay's stop hook ([nvim-jay.md](nvim-jay.md) §7a) keeps an agent going once when a turn of
work didn't write it. The pane shows the file's own time (not `updated`), and under **等你** first what Kit sees the
agent wait for (its Needs you: a `kit pending`, or its last words asking you; shared `agents.waiting`'s `why`), unless
the agent's own list says it. 忘了寫會被 nvim-jay 的結束前檢查提醒；畫面的時間看檔案本身；「等你」最上面是 Kit
看到的（Needs you 的原因），agent 自己沒寫也看得到。
Agents with kit's rule `progress-note` (agentkit-library, signed 2026-11-16) are told this in one line, so you
don't have to ask each one. 有 kit 規則 `progress-note` 的 agent 會自己寫，不用一個一個交代。

```json
{
  "title": "t63 · what this agent works on",
  "updated": "2026-11-16T05:05:00+08:00",
  "waiting": [{ "text": "what you need from the person", "cmd": "the command to type, if any" }],
  "doing":   [{ "text": "…", "project": "herdr-jay" }],
  "todo":    [{ "text": "…", "project": "herdr-app" }],
  "done":    [{ "text": "…", "project": "agentkit", "date": "2026-11-16" }],
  "notes":   ["details for whoever continues (not shown)"]
}
```

An item can be a plain string. `project` is a small label; `date` (YYYY-MM-DD) puts a done item under its day.
進度寫在 `status.json`：做完一段、卡住、等人時更新整個檔；做完的留著（畫面只列最近 3 天）。它也是交接檔。

**A page for the person:**

1. **Write the page** to the folder as `<time>-<topic>.html`:
   - Start the name with the time, `2026-11-16-0430-topic.html`: tabs are newest first, titled by the topic.
   - One self-contained file: inline CSS and scripts, or files next to it in the same folder. Nothing from the web
     (a CDN script won't load in a file page; links to sites open in the browser).
2. **Open the pane** if it isn't (it stays open and shows each new page by itself; the person may have closed it):

   ```sh
   me=$(herdr-app ls | python3 -c 'import json,os,sys
   t=os.environ["HC_TERMINAL_ID"]
   print(next(x["pane"] for s in json.load(sys.stdin)["spaces"] for b in s["tabs"] for x in b["terminals"] if x["terminal"]==t))')
   herdr-app do pane.split "{\"direction\":\"right\",\"pane\":\"$me\",\"mod\":\"agent-page\",\"props\":{\"dir\":\"$HC_TERMINAL_ID\",\"beside\":\"$me\"},\"share\":0.35}"
   ```

   Running it again while the pane is open is harmless: the new copy sees the open one and closes itself. Either way
   the keyboard goes back to your pane, so the person keeps typing to you.
   再開一次也沒關係：新的那格看到已經有一格開著，會自己關掉。鍵盤會還給 agent 那格。
3. Tell the person the page is open beside you, in one line.

`props`: `dir` the folder under `.pages/` (letters, digits, `.` `_` `-`; anything else becomes `_`), `beside` the pane
that gets the keyboard back. The app adds `pane` (the mod pane's own id). `share` 0.35: the pane takes about a third of the width, so
the agent keeps most of it. `share` 0.35：說明頁只佔約三分之一寬，agent 那格比較大。
