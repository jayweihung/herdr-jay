# trend: what's trending, beside your agents / 熱門：社群網站現在在熱什麼

A tab-bar button **熱門** and a panel, like Gerrit's (macOS and Windows):

- **The list costs no tokens.** Every hour launchd (macOS) or Task Scheduler (Windows) runs
  [`fetch.js`](../herdr-app/mods/trend/fetch.js) with node:
  [last30days](https://github.com/mvanhorn/last30days-skill) `--discover` (global: Reddit r/all, Hacker News, Digg when
  `digg-pp-cli` is on PATH) without any model, into `~/.config/herdr-app/trend/trends.json`. The panel only reads it.
  清單不花 token：launchd 每小時跑 last30days 的 discover（不叫模型），面板只讀結果。
- **The button**: how many topics you haven't seen (opening the panel counts them as seen), a ring while fetching, a
  red `!` when the last run failed. 按鈕：沒看過的主題數、抓的時候轉圈、上次失敗是紅色 `!`。
- **The panel**: each topic with its numbers (HN 分／留言…) and why it's up; click one for the top comment, its sources
  (click opens the browser, right-click copies) and **🔎 深入查** / **三句話說明**. The line under the title says when
  it last ran and when it runs next, and which sites answered (`✗ 讀不到` is not "nothing happened there"). **↻ 現在更新**
  runs it now. 面板：每個主題的數字和原因；點開看熱門留言、來源連結、深入查／三句話說明。標題下面寫上次和下次更新、哪些網站有回應。
- **Asking costs tokens, only when you ask.** The buttons and the box at the bottom send to a **kit trend agent** in
  this space (`hc send`), as Gerrit's 問 agent does: with none here, the Kit panel puts one in this space (`kit place`,
  the Kit button must be in the layout) and it starts on the question. Pick Claude / Codex / omp for the next one it
  opens. The answer is in the agent's own tab. Drag trend from the Agents panel onto a space to keep one there.
  問問題才花 token：送給這個 space 的 trend agent；沒有就先開一個。從 Agents 面板把 trend 拖到 space 也可以。

## Install / 安裝

1. **last30days in a kit source** (once; the agent and `fetch.js` both use this copy):

   ```sh
   kit collect https://github.com/mvanhorn/last30days-skill --path skills/last30days --to <your source> --allow
   ```

   `fetch.js` runs `<your source>/skills/last30days/scripts/last30days.py`: the path is its argument in the job below.
   Needs Python 3.12 or later (`python3`; Windows `python`, or set `PYTHON`) and node.
2. **The trend agent**: `agents/trend.md` in the same source (`skills: [last30days]`, `rules: [zh-tw]`), then
   `kit push`. The Agents panel lists it.
3. **The mod** and the layout blocks `{ "mod": "trend", "props": { "role": "toggle" } }` (id `trend-toggle`, beside
   Gerrit's) and a column `trend-panel` holding `{ "mod": "trend" }` (`"hidden": true`); jay's layouts have them.
4. **The hourly job**, below.

**macOS** (the mod as a link; one linked while Herdr runs: link it once more (`ln -sfn …`) after editing, or restart
Herdr, to load the new code):

```sh
ln -s ~/src/herdr-jay/herdr-app/mods/trend ~/.config/herdr-app/mods/trend
herdr-app check ~/.config/herdr-app/mods/trend
```

`~/Library/LaunchAgents/com.herdr-jay.trend.plist` (PATH: python3, and `~/.local/bin` for Digg):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.herdr-jay.trend</string>
  <key>ProgramArguments</key><array>
    <string>/opt/homebrew/bin/node</string>
    <string>/Users/YOU/.config/herdr-app/mods/trend/fetch.js</string>
    <string>/Users/YOU/src/YOUR-SOURCE/skills/last30days/scripts/last30days.py</string>
  </array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/Users/YOU/.local/bin:/usr/bin:/bin</string></dict>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
```

```sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.herdr-jay.trend.plist   # runs once now, then hourly
cat ~/.config/herdr-app/trend/status.json                                           # "ok": true after a few minutes
```

Remove: `launchctl bootout gui/$(id -u)/com.herdr-jay.trend` and delete the plist.

**Windows** (PowerShell; copy the mod again after each herdr-jay update whose CHANGELOG says **mods**; `conhost
--headless` keeps a console window from flashing every hour):

```powershell
$j = "$env:USERPROFILE\src\herdr-jay"
$h = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } else { "$env:USERPROFILE\.config\herdr-app" }
Remove-Item -Recurse -Force "$h\mods\trend" -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force "$j\herdr-app\mods\trend" "$h\mods\"
herdr-app check "$h\mods\trend" | Out-Host                                      # check passed
$l30 = "$env:USERPROFILE\src\YOUR-SOURCE\skills\last30days\scripts\last30days.py"
$node = (Get-Command node).Source
$run = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\conhost.exe" -Argument "--headless `"$node`" `"$h\mods\trend\fetch.js`" `"$l30`""
$hourly = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName herdr-jay-trend -Action $run -Trigger $hourly -Force `
  -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries) | Out-Null
Start-ScheduledTask herdr-jay-trend
Get-Content "$h\trend\status.json"                                              # "ok": true after a few minutes
```

Remove: `Unregister-ScheduledTask herdr-jay-trend -Confirm:$false`. The panel's ↻ runs the task (`schtasks /Run`).
On a company PC: getting last30days from GitHub and its network use (Reddit, HN, Digg, X) may need IT's OK first.
Windows 一樣：複製 mod，用工作排程器每小時跑；公司電腦先問過 IT。

## More sites / 更多來源

`fetch.js` never reads the browser's logins (`--no-browser-cookies`). 不讀瀏覽器的登入資料。

| Site | How |
|---|---|
| Digg | `npx -y @mvanhorn/printing-press-library@0.1.27 install digg --cli-only` (needs Go: `brew install go`); goes to `~/.local/bin` (Windows: put the folder it says on PATH) |
| Reddit `✗ 讀不到` | Reddit answers unauthenticated searches with 403, from home and from a residential proxy alike (tried 2026-11-16). What works: a ScrapeCreators key (`setup --github` in last30days, 10,000 free calls, then paid) with `LAST30DAYS_REDDIT_BACKEND=scrapecreators` |
| X | `AUTH_TOKEN` + `CT0` (x.com cookies), or `X_BEARER_TOKEN` / `XAI_API_KEY` (paid), stored with `printf '%s\n' "$T" \| python3 …/last30days.py setup --store-key AUTH_TOKEN` into `~/.config/last30days/.env` |
| A proxy | one line `http://user:pass@host:port` in `<Herdr home>/trend/proxy` (private: `chmod 600`): the whole run goes through it |

## Files / 檔案

`~/.config/herdr-app/trend/`: `trends.json` (last30days' discovery JSON, replaced only by a run that worked),
`status.json` (`started`, `finished`, `ok`, `error`), `last.log` (the last run's output), `proxy` (yours, optional).
