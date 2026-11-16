# trend: what's trending, beside your agents / 熱門：社群網站現在在熱什麼

A tab-bar button **熱門** and a panel, like Gerrit's (macOS and Windows):

- **The list costs no tokens.** Every hour launchd (macOS) or Task Scheduler (Windows) runs
  [`fetch.js`](../herdr-app/mods/trend/fetch.js) with node:
  [last30days](https://github.com/mvanhorn/last30days-skill) `--discover` (global: Hacker News, Digg when `digg-pp-cli`
  is on PATH; Reddit left out with `EXCLUDE_SOURCES=reddit`, its search only gets 403) without any model, into
  `~/.config/herdr-app/trend/trends.json`. The panel only reads it.
  清單不花 token：launchd 每小時跑 last30days 的 discover（不叫模型），面板只讀結果。
- **The button**: how many topics you haven't seen (opening the panel counts them as seen), a ring while fetching, a
  red `!` when the last run failed. 按鈕：沒看過的主題數、抓的時候轉圈、上次失敗是紅色 `!`。
- **The panel**: the list and the 報告 tab are web pages the mod writes to `<Herdr home>/mods/trend/.view/` (in
  Herdr's colors and font size): subject chips on top filter the list; each topic is a card with its numbers (HN
  分／留言…), why it's up and the first three lines of the post itself (PTT's text, read once per post, at most 20 new
  a refresh; Dcard's excerpt; a Reddit text post; Threads' post), **更多** for all of it, the top comment and its sources (a link opens the browser), and
  **🔎 深入查** / **三句話說明** / **📄 看報告**. The line under the title says when
  it last ran and when it runs next, and a 來源 line names each site once: ✓ when it answered (Reddit, PTT: how long
  ago its page was read), else why not (`讀不到` is not "nothing happened there"; right-click copies it). **↻ 現在更新**
  runs it now; **⤢** shows the panel alone in its row (again: back). 面板：每個主題的數字和原因；點開看熱門留言、來源連結、深入查／三句話說明。標題下面寫上次和下次更新、哪些網站有回應；⤢ 放大。
  last30days names 5 to 10 topics (it checks each across sites, marked 跨站), then the list has everything each site's
  own front page gave, HN's, Reddit's (r/all, today), PTT's, Dcard's, Threads' and Digg's in turn (marked by site; a
  story a topic already cites is left out), about 200 rows, grouped by subject (AI, 科技, 股票, 財經, 政治, 國際, 科學, 娛樂,
  遊戲, 體育, 趣聞, 其他) from words in the title, Digg's topic, Reddit's subreddit, PTT's board or Dcard's forum: no
  model, so some land in the wrong group. Reddit's page is opened by your installed Chrome or Edge, headless, with a
  profile of its own (Reddit blocks scripts with 403). PTT's is plain HTTP: its 8 most popular boards (hotboards,
  adult ones left out) and on each the posts with 50 推 or more (`over18=1` is the site's own age check, not a sign-in).
  Dcard's popular list is what https://www.dcard.tw/f fetches itself, in the same headless Chrome (its API gives
  scripts Cloudflare's 403). Threads has no trending list for a visitor: its front page shows its own pick (about 10
  posts a load), so each run's pick joins the last day's, most 讚 first, 30 kept. Each is read every 2 to 3 hours
  (Dcard 3 to 4); blocked, it waits 6, then 12, then 24 hours before one more try, and the 來源 line turns red.
  last30days 只挑 5 到 10 題（每題跨站比對過，標「跨站」），後面放 HN、Reddit、PTT、Dcard、Threads、Digg 自己熱門的全部（約 200
  條），依主題分組（看標題關鍵字、Digg 分類、Reddit／PTT／Dcard 看板；不叫模型，偶爾會分錯）。Reddit、Dcard、Threads 用本機
  的 Chrome／Edge 無頭開（各自的設定檔，不讀你的登入）；PTT 用純 HTTP 抓熱門看板前 8 個的「推文 ≥ 50」；Threads 沒有訪客看得到的
  熱門榜，是首頁推薦累積 24 小時、依讚數排。每站 2 到 4 小時一次；被擋就停 6、12、24 小時。
  **Moving and shared stories**: each run `fetch.js` keeps every link's first sighting and its score per run
  (`history.json`, the last 24, 2 days). A card whose score rose by 10 or more and a fifth or more in the last 1 to 3
  hours says **↑ +N・N 小時**; one that showed up in the last 3 hours says **新進榜** (once there are 6 hours of
  history); the chips **🔥 升溫** and **🆕 新進榜** show only those. A story on several sites or boards (titles sharing
  enough words or Chinese character pairs, PTT's `Re:` replies too) is one card, **N 站** or **N 篇**, the others
  listed under it with their own numbers and links. 每則記第一次出現和每輪分數：1 到 3 小時內分數漲一成以上標「↑ 升溫」，
  3 小時內出現標「新進榜」，上面的鈕可以只看這兩種；不同站或看板講同一件事的合成一張卡，下面列其他站的連結。
- **Asking costs tokens, only when you ask.** The buttons and the box at the bottom send to a **kit trend agent** in
  this space (`hc send`), as Gerrit's 問 agent does: with none here, the Kit panel puts one in this space (`kit place`,
  the Kit button must be in the layout) and it starts on the question. Pick Claude / Codex / omp for the next one it
  opens. The answer is in the agent's own tab. Drag trend from the Agents panel onto a space to keep one there.
  問問題才花 token：送給這個 space 的 trend agent；沒有就先開一個。從 Agents 面板把 trend 拖到 space 也可以。
- **報告**: a deep dive ends as an HTML page the agent writes to `<Herdr home>/mods/trend/.reports/`
  (`<YYYY-MM-DD-HHMM>-<topic>.html`, `<meta name="trend-topic" content="<the topic as asked>">`, `agents/trend.md` says
  how). The panel's 報告 tab lists them newest first and shows one as a web page (the system's WebKit / WebView2;
  its links open in the browser); a topic with a report gets **📄 看報告**, and the button posts a notification when a
  new one is written. 深入查的結果是一頁 HTML，面板的「報告」分頁用網頁顯示；有報告的主題多一顆「📄 看報告」。

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
| Reddit (last30days' own search) | Left out (`EXCLUDE_SOURCES=reddit` in `fetch.js`): Reddit answers unauthenticated searches with 403, from home and from a residential proxy alike (tried 2026-11-16); the panel's Reddit rows come from its page instead. For last30days' cross-site check: a ScrapeCreators key (`setup --github` in last30days, 10,000 free calls, then paid) with `LAST30DAYS_REDDIT_BACKEND=scrapecreators`, and take reddit out of `EXCLUDE_SOURCES` |
| X | `AUTH_TOKEN` + `CT0` (x.com cookies: risks the account, jay's was suspended on 2026-11-16 after tries with last30days' bird), or `X_BEARER_TOKEN` / `XAI_API_KEY` (paid, no account), stored with `printf '%s\n' "$T" \| python3 …/last30days.py setup --store-key AUTH_TOKEN` into `~/.config/last30days/.env` |
| A proxy | one line `http://user:pass@host:port` in `<Herdr home>/trend/proxy` (private: `chmod 600`): last30days' requests go through it (not Reddit's page) |

## My videos / 我的影片

The panel's **影片** tab: your own YouTube searches, one per line in `~/.config/herdr-app/trend/videos.txt` (`#`
starts a comment), e.g.

```
TWICE 子瑜
TZUYU
```

`fetch.js` reads YouTube's own search page (uploads of this week) for each: no API key, no browser, no tokens; its
videos and its Shorts shelves (a Short says `Shorts` for its length). Each
card has YouTube's thumbnail, the title, channel, length, when it was posted and the views, under a chip per search;
click plays it in the panel (**← 影片** goes back). A search taken out of the file takes its videos with it; the list
keeps the newest 300.
影片分頁：videos.txt 一行一個搜尋，點一下在面板裡播（⤢ 放大面板）。

**📝 整理重點** above a playing video asks the trend agent (as the list's buttons do: tokens, only when you press
it) for the video's key points: it gets that one video's subtitles (or, without them, its description and comments)
and writes a one-line summary and 3 to 8 points with times to `<Herdr home>/trend/notes/<id>.txt`, which shows under
the player (right-click copies it); **📝 重新整理** asks again. 懶得看整支：按「📝 整理重點」，trend agent 整理好的重點會
出現在播放器下面。

**建議的主題** at the top of the tab, no tokens: a channel you played 2 or more videos of, a word in the titles of 2
or more of them (Chinese: a run of 2 to 4 characters in 3 or more), and what YouTube's own search box suggests for
each of your searches (asked once a day each), as small chips (the reason when you hover one). **＋** puts it in
`videos.txt` and searches it right away (`node fetch.js --videos`, 「正在搜」 meanwhile), **✕** in `videos-skip.txt` (not suggested again). 不用自己想主題：
影片分頁上面會建議（看你點過的影片、YouTube 的搜尋建議），按「＋」加入或「✕」不要。

**☆** on a card stars the video: it stays under **⭐ 收藏** for good (`trend/stars.json`), whatever the searches later
find or drop (the list keeps only the newest 300, and a search taken out takes its videos); **⭐** unstars it.
喜歡的影片按 ☆ 收藏，就一直留在「⭐ 收藏」，不會被擠掉。

Gently, since every device in the house shares the IP (a production crawler's advice): each search at most every 3 hours, a few
seconds apart, your Chrome's version in the user agent, YouTube's cookies kept between runs. A sign of a block (429,
the consent or "sorry" page, "confirm you're not a bot", a page without results data) stops all searches for 6 hours,
then 12, then 24 (one try each time, with fresh cookies), and the tab says so; a search with nothing this week is not a
block. It reads the page, so a change at YouTube can break it: then a YouTube Data API key (`search.list`, 100 searches
a day free) is the way. 全家共用 IP，所以保守：每個搜尋 3 小時最多一次；被擋停 6、12、24 小時。

**Just the player** (no YouTube page around it): YouTube's embedded player plays only inside an https page (opened
alone, or from a local file, it shows Error 153), so it needs a small page on an https site of yours. This one also
starts at `?t=<seconds>` and, while playing, writes how far you got into its own `#t=<seconds>`: the panel keeps that
per video (`trend/progress.json`) and the next play of it goes on from there (▶ 上次看到 on its card). It loads no
script from YouTube (`iframe_api` would run as your site, with your sign-in's cookies): it hears the player over
`postMessage`, only from `https://www.youtube.com` and only from its own iframe.
換一支看再回來，會從上次看到的地方接著播。

```html
<!doctype html>
<meta charset="utf-8">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>video</title>
<style>html, body { margin: 0; height: 100%; background: #000; } iframe { display: block; border: 0; width: 100%; height: 100%; }</style>
<iframe allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
<script>
  const q = new URLSearchParams(location.search), v = q.get("v") ?? "", start = Math.max(0, parseInt(q.get("t") ?? "0", 10) || 0);
  const f = document.querySelector("iframe"), YT = "https://www.youtube.com";
  let now = start, playing = false, heard = false;
  if (/^[\w-]{11}$/.test(v)) {
    f.src = `${YT}/embed/${v}?autoplay=1&rel=0&playsinline=1&start=${start}&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
    // the player reports only after "listening"; said again every second until it answers
    const hello = () => f.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), YT);
    f.addEventListener("load", hello);
    const retry = setInterval(() => heard ? clearInterval(retry) : hello(), 1000);
    addEventListener("message", (e) => {
      if (e.origin !== YT || e.source !== f.contentWindow) return;
      let d;
      try { d = JSON.parse(e.data); } catch { return; }
      heard = true;
      const info = d?.info ?? {};
      if (typeof info.currentTime === "number") now = info.currentTime;
      if (info.playerState === 1) playing = true;
      else if (info.playerState === 0) { playing = false; history.replaceState(null, "", "#t=0"); }
      else if (info.playerState != null) playing = false;
    });
    setInterval(() => { if (playing) history.replaceState(null, "", "#t=" + Math.floor(now)); }, 3000);
  }
</script>
```

Its URL with `{id}` for the video goes in `<Herdr home>/trend/player` (one line, e.g.
`https://www.example.com/yt.html?v={id}`), and its site in the mod's `mod.json` allow list. To keep your site out of
this repo, the mod folder is then a folder of your own instead of one link: links to each file here but `mod.json`, a
copy of it with your site added (macOS; again when a new file comes here; restart Herdr after changing `mod.json`):

```sh
R=~/src/herdr-jay/herdr-app/mods/trend L=~/.config/herdr-app/mods/trend
rm "$L" && mkdir -p "$L/.reports" && for f in fetch.js gpui-kit.d.ts jsconfig.json main.js; do ln -s "$R/$f" "$L/$f"; done
cp "$R/mod.json" "$L/mod.json"   # then add "https://www.example.com" to "allow"
```

Without `player` a click opens YouTube's watch page. 只要播放器：在你自己的 https 網站放上面那頁，網址（`{id}`
代表影片）寫進 `trend/player`，網站加進本機那份 `mod.json`；mod 資料夾改成本機的，只有 `mod.json` 是自己的。

## Files / 檔案

`~/.config/herdr-app/trend/`: `trends.json` (last30days' discovery JSON, replaced only by a run that worked),
`status.json` (`started`, `finished`, `ok`, `error`), `last.log` (the last run's output), `proxy` (yours, optional),
`feeds.json` (HN's front page, Reddit's r/all top of today, PTT's popular posts, Dcard's popular list, Threads' pick of
the last day and Digg's top stories of the last 24 h: `{ at, since, hn, reddit, ptt, dcard, threads, digg, errors }`,
each row with `first`, maybe `rise` and `body` (its text), and, for the sites read gently, `<site>At`, `<site>BlockedAt`,
`<site>Blocks`), `ptt-text.json` (each PTT post's text, read once), `history.json`
(`{ since, links: { <url>: { first, last, samples: [[time, score]…] } } }`), `reddit-profile/`,
`dcard-profile/`, `threads-profile/` (the browser profiles those pages are opened with: their cookies only).
`<Herdr home>/mods/trend/.reports/`: the agent's reports (hidden: writing one doesn't reload the mod; git ignores it).
`videos.txt` (yours: the searches), `videos-skip.txt` (searches not to suggest), `stars.json` (the videos you starred),
`progress.json` (how far you got in each), `plays.json` (the videos you played,
newest 300: the panel writes it) and `videos.json` (`{ queries, searched, items, errors, blockedAt, blocks, cookies,
suggest, suggested }`) in the same `trend/` folder: the 影片 tab; `trend/player` (yours, optional): its player page.
