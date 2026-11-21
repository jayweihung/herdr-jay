# agent-page: where an agent stands, and its pages, beside it / agent 的進度和說明頁開在旁邊

A pane right of an agent with tabs:

- **進度** (first): where the agent's work stands, so you don't have to ask: **等你** (what it needs from you, with
  the command to type), **正在做**, **還沒做**, and **做完的** of the last 3 days by day (older ones stay in the file,
  counted). The agent keeps it in `status.json` (below); the tab redraws when it changes.
- Then one tab per HTML page the agent wrote for you (a comparison, a design, a diagram), newest first. A new page
  opens in its tab by itself; ⟳ loads it again. Closed and opened again (or after a Herdr restart) it shows the tab
  you left it on, and a page keeps what it saved in its localStorage.
- **Drag a page's tab** onto another to put it there (onto 進度: first after it); 進度 stays first and doesn't move.
  The order is kept in the folder (`order.json`, below), on the agent's machine, so the phone app shows the same order
  and can change it too. A page written after that comes first (right after 進度), newest first, then the ones you put
  in order. 拖分頁到另一個分頁上就換到那個位置（拖到「進度」上就排第一）；「進度」固定在最前面。順序存在 agent
  那台的資料夾，手機 App 看到的順序一樣，也能改。之後新寫的頁排在最前面。

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
- **`order.json`** in the same folder: the tabs' order after 進度, written when you drag a tab (by Herdr, or the phone
  app). Agents don't write it.

  ```json
  { "order": ["2026-11-16-0500-b.html", "2026-11-16-0430-a.html"], "updated": "2026-11-20T10:00:00.000Z" }
  ```

  Shown: pages it doesn't list first (new ones, newest first), then the listed ones in its order; a listed name whose
  file is gone is skipped; missing or broken: newest first. A reorder writes the whole list, every page, atomically
  (a temp file in the folder, renamed), on the agent's machine, with this one command (Herdr and the phone both run
  it; `<folder>` absolute, or relative to the home, as `.config/herdr-app/mods/agent-page/pages/t3` on another machine):

  ```sh
  sh -c 'cd && cd "$1" && printf "%s\n" "$2" > .order.json.$$ && mv -f .order.json.$$ order.json' sh '<folder>' '<the JSON>'
  ```

  For an agent on another machine Herdr writes it there (through its connection) and in its local copy; the next
  15 s listing copies it back like a page. Needs `sh` (not on Windows yet). 分頁順序存在 `order.json`：沒列到的（新的）
  排前面，再照它的順序；拖分頁時整個重寫（先寫暫存檔再改名），寫在 agent 那台。
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
   - **Follow Herdr's Appearance**, not the system's light/dark: the pane opens the page with Herdr's look in its
     hash (`#mode=dark&bg=%23…&panel=…&fg=…&muted=…&line=…&accent=…`, the theme's surface, raised, foreground, muted,
     border, accent; `mode` from the surface's brightness; `font` and `mono`: Herdr's interface and terminal fonts). Name your colors `--bg --panel --fg --muted --line
     --accent`, put your other colors' dark values under `:root[data-theme="dark"]` (and light ones under
     `[data-theme="light"]` if your default is dark), and paste this in `<head>` after your `<style>`:

     ```html
     <script>
     // Herdr's look (agent-page puts it in the hash); outside Herdr nothing changes. 跟著 Herdr 的外觀。
     (function(){var own;function a(){var p=new URLSearchParams(location.hash.slice(1)),r=document.documentElement,m=p.get("mode");if(m!=="light"&&m!=="dark")return;if(own===undefined)own=!!getComputedStyle(r).getPropertyValue("--bg").trim();r.dataset.theme=m;r.style.colorScheme=m;["bg","panel","fg","muted","line","accent"].forEach(function(k){var v=p.get(k);if(/^#[0-9a-f]{3,8}$/i.test(v||""))r.style.setProperty("--"+k,v)});var c=function(k){return(p.get(k)||"").replace(/[^\p{L}\p{N} ._-]/gu,"")},f=c("font"),o=c("mono"),s=document.getElementById("herdr-font")||document.head.appendChild(Object.assign(document.createElement("style"),{id:"herdr-font"}));s.textContent=(own?"":"html,body{background:var(--bg)!important;color:var(--fg)!important}a{color:var(--accent)}")+(f?'body{font-family:"'+f+'",system-ui,sans-serif!important}':"")+(o?'code,pre,kbd,samp{font-family:"'+o+'",ui-monospace,monospace!important}':"")}a();addEventListener("hashchange",a)})();
     // A picture opens big on a click; another click shows it full size (scroll), a click beside it or Esc closes. 點圖放大。
     (function(){var c=document.createElement("style");c.textContent="img{cursor:zoom-in}.img-zoom{position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;overflow:auto;cursor:zoom-out}.img-zoom img{width:auto!important;height:auto!important;margin:0!important;max-width:96vw!important;max-height:96vh!important;object-fit:contain}.img-zoom.full{display:block}.img-zoom.full img{max-width:none!important;max-height:none!important}";document.head.appendChild(c);addEventListener("click",function(e){var t=e.target,z=document.querySelector(".img-zoom");if(z){if(t.tagName==="IMG"&&!z.classList.contains("full")&&(t.naturalWidth>innerWidth||t.naturalHeight>innerHeight))z.classList.add("full");else z.remove();return}if(t.tagName==="IMG"&&!t.closest("a")){z=document.createElement("div");z.className="img-zoom";var i=new Image();i.src=t.src;i.alt=t.alt;z.appendChild(i);document.body.appendChild(z)}});addEventListener("keydown",function(e){var z=document.querySelector(".img-zoom");if(e.key==="Escape"&&z)z.remove()})})();
     </script>
     ```

     Opened outside Herdr (no hash) the page keeps its own colors (e.g. `prefers-color-scheme`). Herdr's theme
     changed: the page gets the new hash and repaints. The script also sets the body's font to Herdr's interface font
     and `code pre kbd samp` to its terminal font. A page without its own `--bg` (colors written in place) gets Herdr's background
     and text color on `html, body` instead. 說明頁跟 Herdr 的外觀和字型走：顏色用這 6 個名字、其他顏色照
     `data-theme` 分深淺，`<head>` 貼上面這段。
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
