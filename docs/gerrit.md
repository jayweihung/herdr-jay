# Gerrit panel / Gerrit 面板

A panel on the right of Herdr that shows your Gerrit like Gerrit's own dashboard, opens a change's details on click,
and pops a notification when a change turns to you or someone replies. Same on Windows and macOS.
Herdr 右邊的 Gerrit 面板：跟 Gerrit 網頁首頁一樣的分區，點一下看細節，輪到你或有人回覆時跳通知。

Status: list, search, details, notifications, reply / vote / submit, reviewers / CC, rebase / abandon / WIP, comparing patch sets, topics, comment-thread replies, diffs with line comments. Next: Jenkins build progress, then opening a commented line in
jay-nvim. Tested against a public Gerrit (3.15) without a login; **logging in and notifications have not run on a real
company Gerrit yet**: note what differs and bring it to jay.

| | |
|---|---|
| [1](#1-install--安裝) | Install / 安裝 |
| [2](#2-settings-file--設定檔) | Settings file / 設定檔 |
| [3](#3-what-you-see--畫面) | What you see / 畫面 |
| [4](#4-your-own-sections--自訂分區) | Your own sections / 自訂分區 |
| [5](#5-when-something-goes-wrong--出問題時) | When something goes wrong / 出問題時 |

---

## 1. Install / 安裝

The mod is `mods/gerrit` in this repo. It runs on the PC (it talks to Gerrit over HTTPS from there), nothing goes on
a server.

**Windows** (PowerShell, after `git pull` in herdr-jay):

```powershell
$j = "$env:USERPROFILE\src\herdr-jay"; $h = "$env:USERPROFILE\.config\herdr-app"
Remove-Item -Recurse -Force "$h\mods\gerrit" -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force "$j\mods\gerrit" "$h\mods\"
herdr-app check "$h\mods\gerrit" | Out-Host
```

**macOS**: `ln -s ~/src/herdr-jay/mods/gerrit ~/.config/herdr-app/mods/gerrit`, then `herdr-app check ~/.config/herdr-app/mods/gerrit`.

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
(Windows: `%USERPROFILE%\.config\herdr-app\gerrit.json`) with a text editor:

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

**Click a change** → its page: whose turn it is, its **Reviewer** and **CC** people, the votes and who gave them (labels nobody voted on and that aren't
required are left out), the comment threads (unresolved first; 整體留言 = patchset-level), the files of the latest
patch set (+/−, comments per file), the commit message (first lines; click for all), every patch set (and if it was
only a rebase), and the change log. **← 返回** goes back.

Drag the panel's edge to make it as wide as you like (no limit).

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
  press your current one to drop the pick);
- a box for the message, and **💬 送出回覆** sends the message and the picked scores together (and publishes your
  drafts, as Gerrit's SEND does);
- **✅ 合併（Submit）** when the change can be submitted: press once, it turns red 「再按一次確認合併」, press again
  within 4 seconds.
- **Reviewer／CC**: **＋ 加 Reviewer／CC** opens a box: type part of a name, username or email, press 🔍 找人, then
  **加 Reviewer** or **加 CC** next to the right person. Next to each name, **→CC** / **→Reviewer** moves them;
  **✕** removes them (only shown on your own changes, and for yourself: Gerrit allows only that without admin rights).
  在細節頁上面加人：打名字按「找人」，再按「加 Reviewer」或「加 CC」。
- Under the send button, only what Gerrit allows you on this change now: **⤴ Rebase** (when it is behind its branch),
  **✓ 可以 review 了（Ready）** / **✎ 改回草稿（WIP）**, **🗑 放棄（Abandon）** (press twice, like 合併), and on an
  abandoned change **↺ 恢復（Restore）**.
- Each label you may vote on (e.g. Code-Review, Build, Verified) has its full name above its own row of buttons.
- Under each comment thread: **✓ Done** and **Ack** reply and mark it resolved in one press; **💬 回覆** opens a box
  with 送出並解決 / 送出（不解決）/ 取消.
回覆、給分、合併都在細節頁最上面；留言串下面有 Done／Ack／回覆。合併要按兩次。

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
