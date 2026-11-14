# Gerrit panel / Gerrit 面板

A panel on the right of Herdr that shows your Gerrit like Gerrit's own dashboard, opens a change's details on click,
and pops a notification when a change turns to you or someone replies. Same on Windows and macOS.
Herdr 右邊的 Gerrit 面板：跟 Gerrit 網頁首頁一樣的分區，點一下看細節，輪到你或有人回覆時跳通知。

Status: list, search, details, notifications, reply / vote / submit, reviewers / CC, rebase / abandon / WIP, comparing patch sets, topics, Jenkins builds, comment-thread replies, diffs with line comments. Next: opening a commented line in
nvim-jay. Tested with a login against a local Gerrit 3.14.5 (every
button, notifications, whole-topic submit, submit requirements) and against a fake Jenkins; `node tests/gerrit/run.js`
checks the same without either. **It has not run on a real company Gerrit or Jenkins yet**: note what differs and
bring it to jay.

| | |
|---|---|
| [1](#1-install--安裝) | Install / 安裝 |
| [2](#2-settings-file--設定檔) | Settings file / 設定檔 |
| [3](#3-what-you-see--畫面) | What you see / 畫面 |
| [4](#4-your-own-sections--自訂分區) | Your own sections / 自訂分區 |
| [5](#5-when-something-goes-wrong--出問題時) | When something goes wrong / 出問題時 |
| [6](#6-jenkins-builds--jenkins-build) | Jenkins builds / Jenkins build |
| [7](#7-ask-an-agent--問-agent) | Ask an agent / 問 agent |
| [8](#8-a-gerrit-agent-step-by-step--gerrit-agent-安裝步驟) | A Gerrit agent, step by step / Gerrit agent 安裝步驟 |
| [9](#9-read-a-change-in-nvim--在-nvim-看) | Read a change in nvim / 在 nvim 看 |

---

## 1. Install / 安裝

The mod is `herdr-app/mods/gerrit` in this repo. It runs on the PC (it talks to Gerrit over HTTPS from there), nothing goes on
a server.

**Windows** (PowerShell, after `git pull` in herdr-jay):

```powershell
$j = "$env:USERPROFILE\src\herdr-jay"; $h = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } elseif ($env:XDG_CONFIG_HOME) { "$env:XDG_CONFIG_HOME\herdr-app" } else { "$env:USERPROFILE\.config\herdr-app" }
Remove-Item -Recurse -Force "$h\mods\gerrit" -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force "$j\herdr-app\mods\gerrit" "$h\mods\"
herdr-app check "$h\mods\gerrit" | Out-Host
```

**macOS**: `ln -s ~/src/herdr-jay/herdr-app/mods/gerrit ~/.config/herdr-app/mods/gerrit`, then `herdr-app check ~/.config/herdr-app/mods/gerrit`.

The first time Herdr sees the folder it docks the panel at the far right of the window, outside the work area. The
panel then shows a big **移到上排** button: press it once and the panel moves next to the other panels: a **Gerrit**
button in the tab bar (with how many changes wait for you) opens and closes it, and the button keeps checking Gerrit
while the panel is closed. On Herdr's own layout (main) it first makes your copy `main-jay` and switches to it.
第一次會出現在視窗最右邊（版面外面），面板上有一顆「移到上排」大按鈕，按一次就會放進上排：上面多一顆 Gerrit 按鈕
（數字是輪到你的數量），按了開關面板；面板關著也會繼續檢查、通知。

Updating later: the same copy (Windows) or nothing (macOS link); then quit and reopen Herdr.
更新：Windows 再複製一次，Mac 不用；然後關掉 Herdr 再開。

## 2. Settings file / 設定檔

Until it exists, the panel shows what to write. Create `<home>/.config/herdr-app/gerrit.json`
(Windows: `<Herdr home>\gerrit.json`, normally `%USERPROFILE%\.config\herdr-app\gerrit.json`; with
`HERDR_APP_HOME` set, it is `%HERDR_APP_HOME%\gerrit.json`) with a text editor:

```json
{
  "url": "https://gerrit.example.com",
  "user": "your-gerrit-username",
  "http_password": "from Gerrit: Settings → HTTP Credentials → Generate",
  "poll_seconds": 60
}
```

- `url`: the address you open Gerrit at, without a trailing `/` (if Gerrit lives under a path, include it:
  `https://host/gerrit`).
- `user` / `http_password`: Gerrit's **HTTP password**, not your login password. In Gerrit: your avatar (top right) →
  Settings → HTTP Credentials → Generate new password. 不是登入密碼，是 Gerrit 設定頁產生的 HTTP 密碼。
- `poll_seconds`: how often it asks Gerrit (at least 15; default 60).
- `review` (optional): where 在 nvim 看 puts a change's files, see [§9](#9-read-a-change-in-nvim--在-nvim-看).
- `ci_labels` (optional): labels CI votes on, shown only as results, never as buttons; default `["Build", "Verified"]`.
  `[]` if people on your team set Verified by hand. CI 打的分數，不給按；預設 Build、Verified。
- `jenkins` (optional): Jenkins builds on a change's page, see [§6](#6-jenkins-builds--jenkins-build).
- `sections` (optional): your own sections, see [§4](#4-your-own-sections--自訂分區).
- `bots` (optional, usually not needed): which accounts are check systems (build, test, lint bots), as a regular
  expression on the account name, for example `"^ci_"`. Without it the panel asks Gerrit: accounts in Gerrit's
  **Service Users** group are systems; other accounts count only when their message starts with `[` or carries a
  link (never the change's owner). Set it only if a person's message shows up as a system.
  通常不用寫：Gerrit 的 Service Users 群組裡的帳號就是系統；有人的留言被誤當成系統時才寫。

The file stays on your PC: it is outside the mod folder, so copying a new mod never touches it, and it is never in
this repo. Don't share it. The panel reads it again within 10 seconds of a save.
這個檔只在你的電腦上，更新 mod 不會蓋掉它；不要給別人。

Without `user` / `http_password` it reads Gerrit anonymously (only public changes, no "you": no 輪到你, no
notifications).

## 3. What you see / 畫面

Sections, like Gerrit's dashboard (click a title to fold it; the fold is remembered):

| Section | Gerrit's name | Means |
|---|---|---|
| 輪到你 | Your Turn | changes waiting for **you now** (Gerrit's attention set, 3.3+): someone asked you, replied or voted |
| 草稿（WIP） | Work in progress | your changes marked WIP |
| 我送出的（等對方） | Outgoing reviews | your open changes, waiting for someone else |
| 我在 review（等對方） | Incoming reviews | changes you review where you already answered: waiting for the owner |
| CC 我的 | CCed on | open changes you are CC'd on |
| 最近合併／放棄 | Recently submitted | closed in the last 4 weeks, yours or reviewed by you (folded at first) |

Each change shows in **one** section: one that is your turn is only under 輪到你 (Gerrit's own dashboard lists it twice).
When you answer, it moves to 「等對方」; when they answer, it comes back. On a Gerrit older than 3.3 (no attention set) the
other sections list everything as before.
每個 change 只出現一次：輪到你的只在「輪到你」；你回了就移到「等對方」，對方回了又回來。

Each change is two lines: number and subject (with WIP, 私人, 合併衝突, 可以送出, 已合併, 已放棄 tags), then
project · branch · owner, unresolved comments (留言 N), each label as Gerrit shows it (`CR✓` approved, `CR✗`
rejected, `+1` / `-1`; `CR` = Code-Review, `V` = Verified: the capital letters of the name), the size (XS < 10
changed lines, S < 50, M < 250, L < 1000, XL) and when it last changed.

**Search** (the box above the sections; Enter or 🔍 搜尋): a change number (`123`, `#123`) or a Gerrit link pasted
from anywhere opens that change; anything else is a Gerrit search, the same text as Gerrit's search box
(`owner:alice is:open`, `project:tools/build status:merged -age:1w`, `message:fix`). Up to 50 results replace the
sections; **清除** brings them back.
搜尋框：打號碼或貼 Gerrit 網址直接打開；其他字就是 Gerrit 的搜尋語法；按「清除」回到分區。

**Click a change** → its page: whose turn it is, its **Reviewer** and **CC** people, **合併條件** (Gerrit 3.5+
submit requirements: 「還差 N 項」 with ⊘ and who voted on each, the passed ones folded to 「✓ 已通過 N 項（點開）」
when there are many. **Check systems** show under the requirement they vote on: any system that reports back to
Gerrit (Jenkins or not) by a message on the latest patch set, with its state guessed from the message and its votes
(⏳ 跑了 N 分 / ✓ 通過 / ✗ 失敗), the message's first line and its links (click 🔗 to open in your browser). A system
that has not voted yet, or votes on no requirement, shows under 「其他檢查」. 不管背後是不是 Jenkins，只要系統會回
Gerrit 留言，就會顯示在它負責的那個條件下面；older Gerrit: the votes and who gave them (labels nobody voted on and that aren't
required are left out), the comment threads (unresolved first; 整體留言 = patchset-level), the files of the latest
patch set (+/−, comments per file), the commit message (first lines; click for all), every patch set (and if it was
only a rebase), and the change log. **← 返回** goes back one page, like a browser: from a topic search back to the
change you clicked it on, from a change opened in 「同一個 topic」 back to the one before, from a diff back to the
change, up to the lists. 返回會回到上一頁（跟瀏覽器一樣）。

Drag the panel's edge to make it as wide as you like (no limit).

**Copying**: the subject, commit message, comments, change log and Jenkins log are text you can select with the mouse
and copy (Cmd+C / Ctrl+C); a **right-click** copies one value (a row or the title: the change's link; its number; a
project, branch, name, file path, `path:line`, patch set sha, link, diff line, the whole commit message or an error) and says 已複製.
可以用滑鼠選文字再 Cmd+C／Ctrl+C 複製；在單一個值上按右鍵就直接複製它（會跳「已複製」）。

**Click a file** → its diff (latest patch set against its parent), right in the panel: line numbers, removed lines
red, added green, unchanged runs folded to 「⋯ N 行沒改（點開）」, the comments under their lines (with Done / Ack /
回覆), and ↑ 上一個檔 / ↓ 下一個檔. **Click any line** to comment on it: 💬 送出留言（要對方處理）(unresolved) or
送出（只是備註）(resolved).
點檔案看 diff（紅刪綠增），留言在那一行下面；點任何一行就能留言。


**Topic**: a change's page shows its topic (🏷, also on each row of the lists). Click it to search every change of
the topic; **✎ 改** / **＋ 設定** (when Gerrit lets you: usually your own changes) changes it, an empty box removes it.
Under it, 「同一個 topic」 lists the other changes of the topic in any project, click one to open it. When the Gerrit
merges a whole topic at once (`change.submitWholeTopic`), the title turns red with 「合併時會一起送出」 and the merge
button says how many it submits: 「✅ 合併（連同 topic 共 N 個）」.
Topic：點 🏷 搜尋同 topic 全部；下面列同 topic 的其他 change；公司若設定整個 topic 一起合併，合併按鈕會寫共幾個。

**Compare two patch sets** (a change with more than one): the 「比較哪兩版」 box above the files. **從** Base (the
parent commit) or an older patch set, **到** any patch set; the files list then shows only what differs between the
two (with the commit message), and clicking a file shows that diff. Comments sit on their side: the left side is
the 從 patch set, the right the 到 one; a comment you write on the left goes on the 從 patch set. **回到最新版** goes
back to Base → latest. Useful to see what changed since you last reviewed (從 the patch set you reviewed, 到 the latest).
比較兩版：選「從」哪一版「到」哪一版，只列兩版之間不同的檔；適合看「我上次看完之後改了什麼」。

**Reply, vote, submit** (only when logged in), at the top of a change's page, like Gerrit's REPLY dialog:
- a row of big score buttons per label you may vote on (your current vote is highlighted; press one to pick it,
  press your current one to drop the pick). Not for labels CI votes on (`ci_labels`, §2; default Build and
  Verified): their results show under 合併條件. On your own change Code-Review goes up to +1 (no approving yourself);
- **the patch set you opened it at**: the page refreshes by itself, and when the owner uploads a new patch set while
  you are on it, a line says 「作者傳了第 N 版，你看的是第 M 版」. Until you press **看第 N 版**, a reply (and its
  drafts) goes to the patch set you were reading, scores aren't sent, and there is no 合併. 作者中途傳了新版：留言留在你看的那版，
  要打分數或合併先按「看第 N 版」。
- a box for the message, and **💬 送出回覆** sends the message and the picked scores together (and publishes your
  drafts, as Gerrit's SEND does);
- **✅ 合併（Submit）** when the change can be submitted, **on your own change** (the owner submits): press once, it turns red 「再按一次確認合併」, press again
  within 4 seconds.
- **Reviewer／CC**: **＋ 加 Reviewer／CC** opens a box: type part of a name, username or email, press 🔍 找人, then
  **加 Reviewer** or **加 CC** next to the right person. Next to each name, **→CC** / **→Reviewer** moves them;
  **✕** removes them (only shown on your own changes, and for yourself: Gerrit allows only that without admin rights).
  在細節頁上面加人：打名字按「找人」，再按「加 Reviewer」或「加 CC」。
- Under the send button, on **your own change**, only what Gerrit allows you on it now: **⤴ Rebase** (when it is
  behind its branch), **✓ 可以 review 了（Ready）** / **✎ 改回草稿（WIP）**, **🗑 放棄（Abandon）** (press twice, like 合併), and
  on an abandoned change **↺ 恢復（Restore）**. Someone else's change never shows them (nor ✎ Topic, nor ▶ of §6), even
  when Gerrit would let you (a project owner, an admin): those are the owner's to do.
  Rebase、WIP、放棄、Topic、合併、▶ Preflight 只在自己的 change 出現；別人的 change 就算 Gerrit 允許也不顯示。
- Each label you may vote on (e.g. Code-Review, Build, Verified) has its full name above its own row of buttons.
- Under each comment thread: **✓ Done** and **Ack** reply and mark it resolved in one press; **💬 回覆** opens a box
  with 送出並解決 / 送出（不解決）/ 取消.
- **Your drafts** (unsent replies, e.g. ones the gerrit agent's 幫我回覆 saved for you) show inside the thread they
  answer, boxed and marked 📝 你的草稿（還沒送出）, with what sending does to the thread. Such a thread offers
  **🗑 刪除草稿** instead of Done / Ack (they would answer twice); **💬 送出回覆** says how many drafts it sends and
  sends them even with an empty box. Only the account in `gerrit.json` sees its own drafts.
回覆、給分、合併都在細節頁最上面；留言串下面有 Done／Ack／回覆。合併要按兩次。
草稿（例如 agent「幫我回覆」存的，或在 nvim 寫的留言）會出現在它回覆的那串留言裡（新留言自成一串），標「📝 你的草稿（還沒送出）」；按「💬 送出回覆」一起送出，不要了就按「🗑 刪除草稿」。

**A change in a tab of its own** (add `"diff":"path/to/file"` to start on that file's diff):

```sh
herdr-app do tab.new --name "#7" --mod gerrit --props '{"open":"7"}'          # macOS
herdr-app do tab.new --name "bob" --mod gerrit --props '{"search":"owner:bob is:open"}'   # a search in its own tab
```
```powershell
herdr-app do tab.new --name "#7" --mod gerrit --props '{"open":"7"}'          # PowerShell 7.3 or newer (pwsh)
herdr-app do tab.new --name "#7" --mod gerrit --props '{\"open\":\"7\"}'     # Windows PowerShell 5.1
herdr-app do tab.new --name "bob" --mod gerrit --props '{\"search\":\"owner:bob is:open\"}'   # Windows PowerShell 5.1
```

**Notifications** (only when logged in), at most three per check:
- 輪到你：#123 … when a change enters 輪到你, with Gerrit's reason;
- Gerrit 有新動態：#123 … when a change in any section changed and the last message isn't yours.
Nothing on the first check after Herdr starts (it only learns what's there).

## 4. Your own sections / 自訂分區

Add `"sections"` to `gerrit.json` to replace the default ones. Each has a `title` and a Gerrit search `query` (the
same text as Gerrit's search box), optional `"limit"` (default 25) and `"turn": true` to notify like 輪到你:

```json
  "sections": [
    { "title": "輪到你", "query": "attention:self is:open", "turn": true },
    { "title": "我的專案", "query": "is:open project:my/project -is:wip" },
    { "title": "今天合併", "query": "is:merged owner:self -age:1d", "limit": 10 }
  ]
```

## 5. When something goes wrong / 出問題時

| What you see / 看到什麼 | Why / 原因 | Fix / 怎麼修 |
|---|---|---|
| 「Gerrit 還沒設定」 | no `gerrit.json`, or it isn't valid JSON | §2; the panel shows the JSON error |
| 讀不到：帳號或 HTTP 密碼不對（401） | wrong user or HTTP password (or the login password was used) | generate a new HTTP password (§2) |
| 讀不到：沒有權限（403） | that account can't use the REST API | ask the Gerrit admins |
| 讀不到： … certificate / SSL / TLS | the company's own HTTPS certificate isn't trusted by the PC | ask IT to install the company root certificate on the PC; bring jay the exact text |
| 讀不到： … (a network error) | the PC can't reach Gerrit (VPN, proxy) | open the same `url` in the browser on that PC; bring jay the text |
| 輪到你: 這個 Gerrit 太舊 | Gerrit older than 3.3 has no attention set | the other sections still work; or replace the sections (§4) |
| `url` works in the browser but the panel says 404 | Gerrit under a path, or a typo | `url` must be what the browser shows before `/dashboard/…` or `/c/…` |
| A new `gerrit.json` isn't picked up | — | wait 10 seconds or press 重新整理 |
| Changes to the mod don't show | the old copy is still running | quit and reopen Herdr |

**Tests** (after changing the mod): `node tests/gerrit/run.js` in herdr-jay (Node 18+, same on Windows and macOS, no
install, no Herdr, no Gerrit: a fake Gerrit answers). Every line must say `ok`.
改了 mod 之後跑 `node tests/gerrit/run.js`，全部 ok 才算過。

Bring jay: what the panel says (a photo is fine), the Gerrit version (under the panel title, the bottom of Gerrit's page, or
`<url>/config/server/version`), and whether 輪到你 / notifications appeared. Never send the HTTP password.

## 6. Jenkins builds / Jenkins build

For a Jenkins that doesn't post its build links on the change (it votes later, or a bot account does), the panel asks
Jenkins itself: which builds of your job have this change number in a parameter. A change's page then shows a
**Jenkins** card under 合併條件:

- each recent build of the change (newest 5): ● 跑中 with **跑了 12 分／平常 32 分** and a progress bar (Jenkins's
  own estimate: the usual time of that job), or ✓ 成功 / ✗ 失敗 / ⊘ 取消 with how long it took and when; who started
  it (`TRIGGER_BY`) and 「一起跑 N 個」 when several changes ran in the same build;
- builds still waiting: ⏳ 排隊中 with how long and Jenkins's reason;
- **📜 log**: the last 40 lines of that build's log, following it while it runs (only what was added is fetched);
- **▶ 跑 …**: starts your start job with this change number (as the Jenkins form would), then shows it queue and run.
  Only on your own open changes: the owner runs the preflight (其他人的 change 不顯示 ▶);
- a notification when a build you are watching finishes (成功 / 失敗).

It checks every 10 seconds while something runs or waits, else every minute, only while a change's page is open.

Add to `gerrit.json`:

```json
  "jenkins": {
    "url": "https://jenkins.example.com/ci",
    "user": "your-jenkins-user",
    "token": "from Jenkins: your name (top right) → Security → API Token → Add new token",
    "jobs": ["Preflight"],
    "start_job": "Preflight_Common",
    "change_param": "GERRIT_CHANGE"
  }
```

Only the ▶ button (no build list, no polling; results show under 合併條件 from the systems' messages):
只要 ▶ 按鈕（不看 build 進度）：

```json
  "jenkins": {
    "url": "https://jenkins.example.com/ci",
    "user": "your-jenkins-user",
    "token": "your API token",
    "start_job": "Preflight_Common",
    "start_label": "Preflight"
  }
```

- `url`: Jenkins's address up to (not including) `/job/…`: what the browser shows before `/job/` or `/view/`.
- `user` / `token`: your Jenkins login name and an **API token**, never your login password. The token is sent only
  to `url`.
- `jobs` (optional): the job(s) that do the real work and carry the change number (a job in a folder:
  `"folder/name"`). Leave it out to have **only the ▶ button**: nothing is polled, and how the run goes shows under
  合併條件 from the systems' own messages (§3). 不寫 `jobs` 就只有 ▶ 按鈕，結果看合併條件下面的系統留言。
- `start_job` (optional): the job that the ▶ button starts with `change_param` = the change number; leave it out for
  no button. `"start_params": { "NAME": "value" }` adds other parameters. `"start_label": "Preflight"` names the
  button 「▶ Preflight」 (default: 「▶ 跑 <job>」). 按鈕名稱用 `start_label` 改。
- `change_param`: the parameter holding the change number(s) (several are fine: `123,456`). Default `GERRIT_CHANGE`.

To find the names: open the job in the browser and add `/api/json?tree=builds[number,actions[parameters[name,value]]]{0,3}`
to its address; the parameter with the change number is the one for `change_param`. If the job you start only
dispatches (it ends in seconds), its log names the job it triggers: that one goes in `jobs`.
找名稱：在 job 網址後面加上面那段看參數；按下去只跑幾秒的 job 只是分派，它 log 裡寫的那個 job 才放 `jobs`。

| What you see / 看到什麼 | Why / 原因 | Fix / 怎麼修 |
|---|---|---|
| Jenkins 讀不到：帳號或 API token 不對（401） | wrong `user` / `token`, or the token was deleted | make a new API token |
| Jenkins 讀不到：找不到（404） | `url` or a job name is wrong | open `url` + `/job/<name>/api/json` in the browser |
| 最近 200 次 build 裡沒有這個 change | it never ran, or long ago, or `change_param` is not the right parameter | check with the address above |
| No Jenkins card | no `jenkins` in `gerrit.json`, or no `jobs` | — |

## 7. Ask an agent / 問 agent

A change's page has a **問 agent** card. It offers only agents with the Gerrit tools: a **kit gerrit agent** (one put
in a space from the Kit panel: its folder's `.agentkit` says `agent:gerrit`, see below) or one the panel opened from
`gerrit.json`'s `agent.start` (§8). Any other agent may lack the tools, and a request it can't do would look like it
went through. This space's agents come first. Press a preset and the panel sends the picked agent a ready-made request
about this change with `hc send`, then brings it to the front.

**Pick the question first.** The presets work even with no Gerrit agent open: the panel then opens one **in the space
you are in** and gives it the question as its first message (`tab.new`'s `task`), so it answers as soon as it's up;
nothing to press twice. With a gerrit agent in your kit sources (the Kit panel lists it), it is put in this space like
a drag from the Kit panel (`kit place`, its own `…/gerrit` folder, one per space; the Kit button must be in the layout:
it does the work); otherwise `agent.start` opens it. Neither: the card says how to set one up. Presets: **Review**, **整理留言**, **為什麼沒過**, **幫我回覆**. Each one calls a skill
(`/gerrit-panel:review 7 3 <url>` and so on) from the `gerrit-panel` plugin that comes with the mod
([herdr-app/mods/gerrit/claude-plugin](../herdr-app/mods/gerrit/claude-plugin/skills)): how to do the job is written in the skill, the button only says
which skill and which change. A kit gerrit agent gets the same request with its kit skills' names
(`/gerrit-review 7 3 <url>`: skills `gerrit-review`, `gerrit-comments`, `gerrit-why-blocked`, `gerrit-draft-replies`). The skills don't post or vote on Gerrit until you agree, and answer in Traditional
Chinese; the agent loads them with a second `--plugin-dir` (§8 step 5). **✎ 編輯問題** edits them in the panel: one block
per button with the words on it, what the agent is asked, and what would be sent for this change (updates as you
type); add, delete, 儲存, 取消, 還原成原本的 (back to `gerrit.json`'s or the built-in ones). A tab can open straight on
it: `--props '{"open":"7","edit_prompts":true}'`. The panel remembers the agents it opened from `agent.start` until their
tab is closed.
「問 agent」只列出有 Gerrit 工具的 agent：kit 的 gerrit agent（從 Kit 面板放進 space 的，資料夾的 `.agentkit` 寫著
`agent:gerrit`），或面板用 gerrit.json 的 `agent.start` 開的；這個 space 的排前面。別的 agent 不列，免得以為送出去就會做。
**先選問題**：還沒有 Gerrit agent 也能按，面板會在你現在這個 space 開一個，把問題當第一句話帶進去，開好就回答。kit 來源有
gerrit agent 就用它（跟從 Kit 面板拖進來一樣，版面裡要有 Kit 按鈕），沒有就用 `agent.start`。
按了就用 hc send 叫它用對應的 skill 處理這個 change（例如 `/gerrit-panel:review 7 3 網址`，kit 的 gerrit agent 是
`/gerrit-review 7 3 網址`）；做法寫在 skill 裡，都用繁體中文回答、沒問過你不會在 Gerrit 留言或給分。按「✎ 編輯問題」可以改按鈕。

A kit gerrit agent, in a kit source (see [docs/kit.md](kit.md)): `agents/gerrit.md` with `skills: [gerrit-review,
gerrit-comments, gerrit-why-blocked, gerrit-draft-replies]` (in the public agentkit-library) and `mcp: [gerrit]`, and
`mcp/gerrit.yaml`:

```yaml
name: gerrit
command: uv
args: [run, --directory, "${HOME}/src/gerrit-mcp-server", gerrit-mcp-server]
```

(the server cloned and set up as in §8 steps 1–3; Claude Code fills in `${HOME}`. Windows, where `HOME` may be unset:
`${USERPROFILE}` instead.)
`kit sync`, and the Kit panel lists gerrit. kit 來源加 gerrit agent 和 mcp 檔、`kit sync`，Kit 面板就有 gerrit。

Optional, in `gerrit.json`:

```json
  "agent": {
    "name": "gerrit",
    "start": ["claude"],
    "cwd": "/path/to/a/folder/for/it",
    "prompts": [ { "label": "Review", "text": "review change {change} ({url}, patch set {patchset})" } ]
  }
```

- `prompts` replace the presets. Words in braces are filled in: `{change}` `{patchset}` `{url}` `{project}`
  `{branch}` `{subject}` `{topic}` `{gerrit}`, and `{requirements}`: what the panel sees that the Gerrit
  tools don't return (unmet submit requirements, a conflict), e.g. （面板看到：合併條件未過：Code-Review；合併衝突）.
  為什麼沒過 sends it, so the agent never has to go around its tools.
- Windows: the same, with the folder written with `/` or doubled `\\` (JSON), e.g.
  `"cwd": "C:/Users/you/gerrit-agent"`; `"start": ["claude"]` works as in Herdr's own agent menu (Claude Code on
  PATH). Sending goes through Herdr itself, so nothing else is needed on Windows.
  Windows 一樣能用：路徑用 `/` 或 `\\`；送出是走 Herdr 本身，不用另外裝東西。
- `start` (a command, as a list): how to open a Gerrit agent when a preset is pressed with none open and the kit
  sources have no gerrit agent. It opens in a new tab of the space you are in, with the question as its first message;
  `name` is that tab's name, `cwd` is where it starts.

The request is only text typed into that agent: what it may do on Gerrit is up to the agent and its MCP settings.
送出去的只是文字；agent 能在 Gerrit 做什麼，看它自己的設定。

## 8. A Gerrit agent, step by step / Gerrit agent 安裝步驟

For 問 agent's presets the agent needs Gerrit tools. This sets up Claude Code with the open-source
[gerrit-mcp-server](https://gerrit.googlesource.com/gerrit-mcp-server) (Apache-2.0), started from the panel's
presets (no agent open: it opens one). Same steps on Windows and macOS; Windows commands are PowerShell. It needs Claude Code and
git already installed, and the PC must reach the internet (or the company's mirror) once: `uv` downloads the
server's Python packages on first start. Ask before installing on a company PC.
給「問 agent」用的 Gerrit agent：Claude Code + gerrit-mcp-server。Windows 指令是 PowerShell。公司電腦先問過再裝。

Two ways to use it: as a **kit gerrit agent** (§7: steps 1–3 here, then the agent and mcp files in a kit source; the
Kit panel places it), or with `gerrit.json`'s `agent.start` (all the steps here). With kit, skip steps 4–5.
兩種用法：kit 的 gerrit agent（做完這裡的 1–3 步，再照 §7 加 agent 和 mcp 檔，4、5 步不用），或 gerrit.json 的 `agent.start`（這裡全部步驟）。

**1. uv** (runs the server; installs Python for it):

```powershell
winget install --id=astral-sh.uv -e          # Windows; then open a new terminal
```
```sh
brew install uv                               # macOS
```

**2. The server** (source, into your src folder):

```powershell
git clone https://gerrit.googlesource.com/gerrit-mcp-server "$env:USERPROFILE\src\gerrit-mcp-server"   # Windows
```
```sh
git clone https://gerrit.googlesource.com/gerrit-mcp-server ~/src/gerrit-mcp-server                    # macOS
```

**3. Its settings**: which Gerrit, and the same user and HTTP password as `gerrit.json` (§2). The file:
Windows `%LOCALAPPDATA%\gerrit-mcp\gerrit_config.json`, macOS `~/Library/Application Support/gerrit-mcp/gerrit_config.json`.

```powershell
New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\gerrit-mcp" | Out-Null
notepad "$env:LOCALAPPDATA\gerrit-mcp\gerrit_config.json"     # Windows: paste the JSON below, save
```

```json
{
  "default_gerrit_base_url": "https://gerrit.example.com/",
  "gerrit_hosts": [
    {
      "name": "My Gerrit",
      "external_url": "https://gerrit.example.com/",
      "authentication": { "type": "http_basic", "username": "your-gerrit-username", "auth_token": "your HTTP password" }
    }
  ]
}
```

The URL ends with `/` and is the same in both places. Like `gerrit.json`, the file stays on your PC; don't share it.

**4. A folder for the agent** (it starts there; keep it empty):

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\gerrit-agent" | Out-Null   # Windows
```
```sh
mkdir -p ~/gerrit-agent                                                           # macOS
```

**5. How the panel opens it** (`agent.start`): add to `gerrit.json` (Windows paths with `/`). The first `--plugin-dir` gives the Gerrit
tools, the second the skills the buttons call: the `claude-plugin` folder inside the gerrit mod, in `<Herdr home>/mods`
(`~/.config/herdr-app/mods/gerrit/claude-plugin`; Windows normally `%USERPROFILE%\.config\herdr-app\mods\gerrit\claude-plugin`).
It comes with the mod: linking (macOS) or copying (Windows) the gerrit mod again updates it.

```json
  "agent": {
    "name": "gerrit",
    "start": ["claude", "--plugin-dir", "C:/Users/you/src/gerrit-mcp-server",
              "--plugin-dir", "C:/Users/you/.config/herdr-app/mods/gerrit/claude-plugin"],
    "cwd": "C:/Users/you/gerrit-agent"
  }
```

(macOS: `"/Users/you/src/gerrit-mcp-server"`, `"/Users/you/.config/herdr-app/mods/gerrit/claude-plugin"` and
`"/Users/you/gerrit-agent"`.) Quit and reopen Herdr. An agent already open keeps its old plugins: close its tab and
press a preset again.
第二個 `--plugin-dir` 是按鈕要叫的 skill：Herdr 家目錄裡 `mods/gerrit/claude-plugin`，跟著 gerrit mod 一起裝、一起更新。
已經開著的 agent 要關掉重開才會有。

**6. Try it**: open a change in the panel → **Review**. With no Gerrit agent open, one opens in a new tab of this
space and starts on the review. The first start takes a minute (uv installs the packages). In that agent type `/mcp`:
**gerrit** should say connected. If it says the config is missing or wrong, type `/gerrit:setup` there, or check
step 3. Type `/gerrit-panel` and the four skills should be offered.
打開一個 change 按 Review：沒有 Gerrit agent 會在這個 space 開一個，開好就開始 review。第一次要等一分鐘；在 agent 裡打 `/mcp` 看到 gerrit connected 就好了。

| What you see | Fix |
|---|---|
| `uv` not found (Windows) | open a new terminal after step 1, or reopen Herdr |
| uv can't download (proxy / no internet) | ask IT for the company's PyPI mirror; bring jay the text |
| gerrit not connected, 401 | the HTTP password in step 3 (not your login password) |
| `Unknown command: /gerrit-panel:…` | the second `--plugin-dir` (step 5) is missing or wrong; restart the agent |
| a button still sends a long sentence | it was edited before: ✎ 編輯問題 → 還原成原本的 |
| 「沒送出」 in the card | the agent's pane was closed: pick another, or start it again |

## 9. Read a change in nvim / 在 nvim 看

When the diff isn't enough (who calls this, where does that come from), read the change as files on this computer, in
nvim with the language servers: the whole file, the changed lines marked, go to definition. A change's page has a
**在 nvim 看** card above its files.
diff 看不懂的時候：把這一版拉到這台電腦，用 nvim 看整個檔案、跳到定義。change 頁面的檔案上面有「在 nvim 看」。

Needs the [nvim-jay](nvim-jay.md) mod (and its Neovim 0.11+), and `git` on PATH. Windows: PowerShell (built in).
要裝 nvim-jay mod，還要有 git。

**What a press does**
1. **Finds your clone** of the project: `review.repos` in `gerrit.json`, else a folder up to two levels under `~/src`
   whose `.git/config` has a remote for this project on this Gerrit (https `…/a/<project>`, or ssh). It only adds to
   it: the change goes into a separate folder (a git worktree), so your own folder, its branch and unsaved work stay as
   they are.
2. **No clone here**: it asks first: 「這台電腦上找不到 … 的 clone。要下載嗎？」. 下載 makes a store of its own
   (`<root>/.repos/<project>.git`) with only this patch set and its parent, not the history. Asked once per project.
3. **Downloads in the background** with a progress bar (Gerrit 準備中 → 下載 with %, size and speed → 整理 → 放進資料夾);
   **取消** stops it. Closing the panel doesn't stop it, and a big repo is not cut off after 10 minutes. The login
   reaches git only through a small credential helper that reads `gerrit.json` itself and answers only for the
   Gerrit's host: the password is never in a command line or a file of its own.
4. **Opens nvim** in a new tab (a space on this computer: the one you are in, else the first), in
   `<root>/<project>-<change>`, default `~/src/review/tools-build-7`. Pressing again goes to that tab.

**Which versions**: what the panel shows. Normally 第 N 版 against its parent commit; with 比較哪兩版 set (§3), 第 N 版
against 第 M 版 (only what changed since then: good for a second round). Another patch set later: press again, the same
folder moves to it.
跟上一個 commit 比；上面選了「從第 M 版到第 N 版」就只看兩版之間改了什麼（第二輪 review 用）。

**A newer patch set** while nvim is open: the panel asks Gerrit once a minute. nvim says 🆕 有第 N 版了, and its menu
(right-click, below) has 🆕 有第 N 版了：換過去 ▸ 換成第 N 版：只看第 M→N 版改的地方 (only what the author changed since the one you read) or the whole
of it; the same folder moves there, with a progress line at the top of nvim's list. The change's page reloads too: 🔍
只看第 M→N 版改的, 切到 nvim when nvim is open, 改成看… for what the page shows.
有新的一版：nvim 會說，右鍵選單裡可以換過去，只看這次改了什麼；面板那頁也會更新。

**In nvim** (nvim-jay's review mode, [nvim-jay.md](nvim-jay.md#9-gerrit-review-mode--gerrit-review-模式)):
- left: the changed files (新增 / 刪除 / 改名, +/−, 💬 comments), ✓ on the ones you opened, 看過 N / M;
- right: the whole file, changed lines marked against the base (removed lines in red above, added in green);
- this patch set's comments under their line, as threads (replies with ↳; unresolved in yellow, your drafts in blue);
- **Right-click (or Enter) on a line**: one menu of what fits there: 💬 留言（寫意見）; 🔧 直接改給作者看 (a suggested
  edit); 🤖 ask the Gerrit agent; each thread on the line ▸ 回覆 / ✅ Done / 👍 Ack; your draft there ▸ 改 / 刪; ⏩ the next
  unresolved thread; 🆕 another patch set; 📄 the commit message. The mouse picks what it is over; a click outside
  closes it;
- **select lines, then right-click (or Enter)**: ask the Gerrit agent about them (see below), or 🔧 直接改給作者看 (**a
  suggested edit**): they open in a small
  window, change them, `:w`, an optional note: a draft with Gerrit's suggestion block, so the author applies it with
  one click on Gerrit's page (works without any server setting);
- **older patch sets' threads**: on 第 N 版, the threads still open from earlier ones show on the lines they are on now
  (Gerrit moves them), marked 第 M 版留的; you can reply / Done there as usual;
- `]f` `[f` next / previous file, `]c` `[c` next / previous change, `o` in the list: tests first.

Comments, replies, Done / Ack and changes to your drafts become **your Gerrit drafts** (the panel saves them; they
show in the panel's thread, and **💬 送出回覆** publishes them with the rest). nvim never publishes anything.
在檔案裡按右鍵（或 Enter）就有這一行能做的事；留言、回覆、Done 都先存成草稿，面板按 💬 送出回覆才會送出。

**Your own change**: nvim says so at the top of the list. In an unresolved thread's ▸ (right-click menu) there is 🤖 請 agent 照這則改:
the Gerrit agent gets the thread and changes the files in the review folder (only the files: no commit, no push, no
comment). nvim marks what it changed as the file changes. 🔍 看還沒推的改動 shows the folder's diff; `]u` / `[u` go to
the next / previous unresolved thread nobody has answered. When it's right, commit --amend and push in that folder
yourself (a new patch set), and answer the threads Done.
自己的 change：未解決的留言可以請 agent 照著改（只改檔案，不 commit、不推），改好你自己推新的一版。

**Ask the agent about lines**: select them and right-click (or Enter): 問 agent 這幾行, then a question
(empty: 這段改動在做什麼？有沒有問題？). It goes to the Gerrit agent (§7) with the change, the file and lines, the folder's
path and the diff of exactly those lines (lines that the change didn't touch: the lines themselves); the agent has the
folder for anything around them. One already open in
this space gets it; else one opens here with it. It answers in its own tab; when it wants to comment it saves a draft
on that line, which shows in nvim within a minute (the panel asks Gerrit once a minute while nvim is open).
選幾行按 Enter 就把那幾行（和它的 diff）問 Gerrit agent；它要留意見的話會存成草稿。

**Both ways**: clicking a file in the panel's list makes the open nvim go to it too. New comments on Gerrit show in
nvim when the panel loads the change again.
面板點檔案，nvim 跟著跳；Gerrit 上有新留言，面板重新讀這個 change 時 nvim 也會更新。

**Folders**: the home page lists the changes you read in nvim (在 nvim 看過的 change). On a change's page,
**清掉資料夾** (press twice) moves its folder and the panel's notes to the Trash (Windows: the Recycle Bin), never
deletes them; not while its nvim is open. The store of a project without a clone stays (the next change of it
downloads less).
清掉資料夾：移到垃圾桶，不會直接刪；nvim 開著時不能清。

Optional, in `gerrit.json`:

```json
  "review": {
    "root": "~/src/review",
    "repos": { "tools/build": "~/src/build" },
    "search": ["~/src", "~/work"],
    "fetch_url": "ssh://you@gerrit.example.com:29418/{project}"
  }
```

- `root`: where the folders go (default `~/src/review`; Windows `%USERPROFILE%\src\review`).
- `repos`: your clone of a project, when it isn't found by itself.
- `search`: where to look for clones (two levels down; default `~/src`).
- `fetch_url`: how git reaches a project, `{project}` filled in. With ssh your own key is used and the HTTP password
  isn't needed. Default: the Gerrit address + `/a/<project>` with a login (`/<project>` without).

| What you see / 看到什麼 | Why / 原因 | Fix / 怎麼修 |
|---|---|---|
| 下載失敗：… Authentication failed / 401 | the HTTP password in `gerrit.json` (§2) | Gerrit → Settings → HTTP Credentials |
| 下載失敗：… couldn't find remote ref | that patch set isn't on Gerrit any more | reload the change |
| 下載失敗 over https at work | the company allows git only over ssh | `fetch_url` with ssh |
| 換不到這一版（那個資料夾裡有改過的檔？） | you edited files in the review folder | undo them there (`git checkout .`), or 清掉資料夾 |
| 沒有這台電腦上的 space | every space is on another machine | open a space on this computer |
| nvim opens without the list | nvim-jay is older than this panel | update the nvim-jay mod too |

