# Changelog / 更新紀錄

Newest first. Each entry says what you need to do on your machine.
最新的在上面；每條寫了要做什麼。
Needs: **mods** = copy the mod folders again (macOS symlinks: nothing) · **gerrit** = copy the Gerrit panel again
(only if you installed it) · **gerrit plugin** = a line in `gerrit.json` (only if you use the Gerrit agent; the entry
says which) · **kit** = update kit itself on every machine where agents run (`kit self-update`, `kit sync`) ·
**layout** = jay's layout again (Windows: copy the file; macOS link: nothing), or your own layout as the entry says ·
**snap hook** = a line in Claude Code's `settings.json` on each machine where you added the hook (the entry says
which) · **core** / **app** = rebuild · **keys** = see [docs/keys.md](docs/keys.md).

## 2026-11-14, Agents panel: 關係 matches the Agents list; waits, idle, offline; 放大

Needs: **mods**.

關係 now reads like the Agents list next to it: one column per space (not per machine), in the list's order, each
card named the way the list names its row, with the list's time and status mark. Lines that pass a column go around
the cards in the gap between rows, so no label lands on a card. A card waiting for you warms up after 2 min and goes
red after 10 (and says what it waits for); one stopped for over 30 min that nobody waits for is dimmed with
「可以關了」 (never closed for you); an offline machine's column turns red with how long. 放大 opens the graph in a big
window. [docs/kit.md](docs/kit.md) §3.

## 2026-11-14, Agents panel: 關係, who talks to whom

Needs: **core**, **app**, **mods** (and the core on each Linux server, so its agents' messages count too).

The Agents panel has two tabs now: 定義 (as before) and 關係: the agents running now in this space (or all), one card
each (status, tab, which CLI and model, its kit note), one column per machine, and a line for every `hc send` between
them (how many, how long ago; dashed: who started whom). Click a card for its lines in words, double-click to go to it.
On top it says what needs a look: an agent that stopped without answering a message (還沒回), a chain of agents each
waiting for the next that ends at one needing you or not answering (卡住; 互等 when it loops), two agents working at
once in one folder. 時間軸 shows each agent's status over the last 15 min / 1 h / 6 h with every message as an arrow,
from a log the Agents button keeps on this computer for a day.
herdr-core `0001` keeps who each terminal sent to; herdr-app `0008` keeps the list current. [docs/kit.md](docs/kit.md) §3.

## 2026-11-14, Herdr app: linked mods reload when edited

Needs: **app** (rebuild with herdr-app patch 0007).

- macOS links herdr-jay's mods into `~/.config/herdr-app/mods`; editing them in the repo now reloads them at once (before:
  only after making the link again or restarting Herdr). Layouts, themes and settings files kept as links too.
mod 用連結裝的，在 repo 裡改完就會自己重新載入（要用打了 0007 patch 的 app）。

## 2026-11-14, kit: the note gets room first in a narrow header

Needs: **mods** (kit; Windows: copy it again).

- When an agent has a note and its header is narrow, the rest gives way in turn so the note shows: the folder (then
  in the note's tooltip), the context chip's numbers (just the %), the Kit chip's counts (just "Kit"; both in their
  tooltips), and last the name. A wide header, or one with no note, looks as before.
標題列窄時進度優先：資料夾、context 數字、Kit 數字依序收起來（都在提示裡）。

## 2026-11-14, kit: what the agent wrote about where it is, in its header

Needs: **mods** (kit; Windows: copy it again) and **kit** 0.6.0 (kit api 1.4) on the agents' machines.

- An agent's header shows `[進度 …]` after the folder: the first line of what the agent wrote with `kit note`
  (the whole note and when in the tooltip, right-click copies, dim after two hours). Asked with the context
  (`kit note --pid <pid> --json`). Older kit: nothing changes ([docs/kit.md §1](docs/kit.md#1-agent-視窗上的-kit-按鈕)).
agent 用 `kit note` 寫的進度顯示在它的標題列（要 kit 0.6.0）。

## 2026-11-14, Gerrit review in nvim: quitting nvim closes its tab

Needs: **app** (rebuild with herdr-app patch 0006) and **mods** (nvim-jay; Windows: copy it again).

- 在 nvim 看 opens nvim by itself in its tab (`tab.new {shell: false}`, [patches.md](docs/patches.md)), so `:q` closes
  the tab instead of leaving a shell. On an app without the patch, the tab still keeps a shell (as before).
nvim 關掉，review 分頁就一起關（要用打了 0006 patch 的 app）。

## 2026-11-14, Gerrit panel: 切到 nvim only while nvim runs

Needs: **gerrit** (Windows: copy the Gerrit panel again).

- After you quit nvim in a review tab, the tab keeps a shell. The panel took that shell for nvim: it kept showing
  切到 nvim (which went to the shell), and 清掉資料夾 said nvim still had it open. Now only a pane where nvim itself
  still runs counts; the button goes back to 🔍 在 nvim 看, which opens a new one.
nvim 關掉後，面板不再把留下的 shell 當成 nvim：按鈕回到「在 nvim 看」，清掉資料夾也不會被擋。

## 2026-11-14, nvim-jay: a real file tree, one-click lists, a typing box; works on Linux again

Needs: **mods** (Windows: copy nvim-jay again, it now has a `nvim-tree` folder), then open nvim again.

- The file tree is nvim-tree (bundled; the `nvim-jay` mod folder is now GPL-3.0, the rest stays Apache-2.0). One click
  on a folder opens or closes it, one click on a file opens it; right-click: 新增檔案, 改名, 複製路徑, 重新整理, and the
  agent's files and follow (moved here from the code menu). Its git runs with nvim-jay's protections.
- One click opens in every list (errors, comments, a review's files). The errors list shows each place once, with
  short paths. The middle button no longer pastes.
- The code menu shows 跳到定義 / 找所有用到的地方 / 改名 only on a name; 看型別 is gone (rest the pointer on the name).
- Typing a name or a comment: a box under the line (Enter 送出 · Esc 取消, a click outside cancels) instead of the
  bottom line.
- Fixed: since the 「在 nvim 看」 entry below, nvim-jay couldn't start on Linux machines (its Lua was over Linux's 131072-byte limit for one
  argument). The Lua and the tree now go to `~/.cache/nvim-jay` on that machine first, once per version.
檔案樹換成 nvim-tree（點一下就開）；清單都點一下就開；中鍵不再貼上；打字改在游標下面的小框；Linux 機器上又能開了。

## 2026-11-14, nvim-jay: one menu on right-click

Needs: **mods** (Windows: copy nvim-jay again), then open nvim again.

- Right-click in nvim opens one menu with what can be done there, only what applies, drawn like a desktop app's menu
  (a border, lines between groups, the key on the right, ▸ items that open beside them). The mouse picks what it is
  over and moving it no longer closes the menu; a click outside or Esc does, and selected lines stay selected.
- In a Gerrit change, right-click and Enter open the same menu: 留言, 直接改給作者看, 問 agent, then each thread on
  the line (▸ 回覆 / Done / Ack / 請 agent 照這則改) and each draft of yours (▸ 改 / 刪), then the change (next unresolved
  thread, another patch set, commit 說明). Selected lines: ask, suggest an edit, copy. nvim-jay's own comments for an
  agent are off in a change's files.
- Gone: nvim's own right-click menu, and `space r r` / `r d` / `r k` / `r e` / `r x` (they took the line's first thread
  or draft; the menu names each one). The commit message opens in a window below (q closes it).
- Lists nvim asks you to pick from (which agent, which patch set, code actions) use the same menu.
右鍵（或 review 裡的 Enter）只有一個選單，只列這裡用得到的；滑鼠移動不會關掉；舊的五個 space r 捷徑拿掉。

## 2026-11-14, Gerrit panel: 在 nvim 看 (a change as files, in nvim)

Needs: **gerrit** and **mods** (nvim-jay too; Windows: copy both again), restart Herdr.

- A change's page has **在 nvim 看**: the patch set shown (or two compared) goes into a folder of its own,
  `~/src/review/<project>-<change>`, made from your clone when there is one (a git worktree beside it), else from a
  download of only that patch set and its parent (asked first, once per project). It downloads in the background with
  a progress bar and 取消, then opens nvim in a new tab.
- nvim-jay's review mode: the changed files on the left (seen ones ticked), the whole file with the changes marked
  against the base, this patch set's comments under their lines, `]f` / `]c` to move on, `space r c` writes a comment
  that the panel saves as your Gerrit draft. A file clicked in the panel opens in nvim too.
- The home page lists these folders; 清掉資料夾 moves one to the Trash. Settings: `review` in `gerrit.json`.
- Also fixed: since 880e059, opening a change in the panel that polls could replace its notification memory.
- A change's page that is open while you write comments in nvim reloads, so their 📝 drafts show right away.
- Fixed: multi-line text in the panel (commit message, 紀錄, comments) ran its lines together; line breaks and
  blank lines now show, and links in it stay links.
- In nvim, **Enter on a line** shows what you can do there; no keys to remember. Comments show as threads, and you
  can reply, Done, Ack, or edit / delete your draft (all saved as Gerrit drafts, published from the panel).
- **A newer patch set**: nvim says so; its Enter menu moves the folder there, only what changed since if you like. The
  change's page reloads and offers the same.
- **Select lines, then Enter**: asks the Gerrit agent about them, with their diff and the folder's path.
- **Suggest an edit**: select lines, Enter, 建議改法: change them in a small window, `:w`; the author applies it with one
  click on Gerrit's page.
- On a newer patch set, older patch sets' unresolved threads show where those lines are now.
- **Your own change**: ask the Gerrit agent to change the files as a thread asks (no commit, no push; nvim marks what it
  changed), see what isn't pushed yet, `]u` to the next unresolved thread.
- Details: [docs/gerrit.md](docs/gerrit.md) §9, [docs/nvim-jay.md](docs/nvim-jay.md) §9.
在 nvim 看：把這一版拉到這台電腦（有自己的 clone 就用它），背景下載有進度條，開好在 nvim 裡左邊是改過的檔、右邊整個檔案和留言；在 nvim 留言會存成 Gerrit 草稿。在檔案裡按 Enter 就有這一行能做的事（留言、回覆、Done、問 agent、換到新的一版），選幾行按 Enter 就問 agent。

## 2026-11-14, Gerrit panel: the owner's buttons only on your changes; votes on the patch set you read

Needs: **gerrit** (Windows: copy it again), restart Herdr.

- Rebase, WIP/Ready, Abandon/Restore, Topic ✎, 合併 (Submit) and Jenkins ▶ show only on your own change, even where
  Gerrit would let you (a project owner, an admin).
- Labels CI votes on (`ci_labels` in `gerrit.json`, default Build and Verified) are shown, never pressed.
- On your own change Code-Review goes up to +1.
- A new patch set arriving while you read: a line says so; replies go to the one you read, no scores or 合併 until you
  press 看第 N 版. Details: [docs/gerrit.md](docs/gerrit.md) §3.
作者才能按的按鈕只在自己的 change 出現；CI 的分數不給按；自己不能 +2；中途有新版會提醒，分數不會打到沒看過的版本。

## 2026-11-13, Gerrit panel: pick the question first; a kit gerrit agent

Needs: **mods**, **gerrit**; for a kit gerrit agent, **kit** (`kit sync` after adding it to your kit source).

- 問 agent: the presets (Review, 整理留言, 為什麼沒過, 幫我回覆) work with no Gerrit agent open. The panel opens one in
  the space you are in and gives it the question as its first message, so it answers once it's up. The
  **＋ 開 gerrit agent** button is gone.
- A kit agent named gerrit counts as a Gerrit agent (its folder's `.agentkit` says `agent:gerrit`) and is what the panel
  opens when your kit sources have one (through the Kit button, like a drag from the Kit panel). It is asked with its
  kit skills (`/gerrit-review …`); the skills are in agentkit-library. Setup: [docs/gerrit.md](docs/gerrit.md) §7.
- Without a kit gerrit agent, `gerrit.json`'s `agent.start` still works: it now opens in a new tab of this space.
- Kit: a place asked for an agent already open in that space sends the question to that one.
- Jenkins ▶ (e.g. ▶ Preflight) shows only on your own changes: the owner runs it. ▶ 只在自己的 change 顯示。
Gerrit 面板：先選問題，沒有 Gerrit agent 就在這個 space 開一個、開好就回答；kit 的 gerrit agent 也算，kit 來源有就用它。

## 2026-11-13, Herdr app: drop at a place in a space; reorder agents by dragging

Needs: **app** (same v0.1.15, now five patches: rebuild it; core unchanged), **mods**.

- `herdr-app/patches/v0.1.15/0005-…`: in the Agents panel grouped by space, every agent row under a space takes a drop
  too, and a line shows where it lands (the header: first; a row: right after it). An agent dragged from the Kit panel
  opens its tab there. Rows also drag to another place in their own space (the tab moves; other spaces refuse it).
- The Kit panel's agent tab icon is its logo cropped to the drawing, as big as the programs' icons.
- The Kit panel shows 放到 space… only on a Herdr that can't drag (dragging shows where it lands).
- Build steps: [docs/macos.md](docs/macos.md) §3/§8, [docs/windows.md](docs/windows.md) §3/§8.2 (app blocks only).
app 同樣是 v0.1.15，多了第五個 patch：Agents 面板裡可以放在 space 的某個位置、也能拖 agent 排順序；Kit 放的 agent 圖示跟其他程式一樣大。要重新 build app。

## 2026-11-13, Herdr app: a placed agent's own logo; one of each agent per space

Needs: **app** (same v0.1.15, now four patches: rebuild it; core unchanged), **kit** 0.5.2, **mods**.

- `herdr-app/patches/v0.1.15/0003-…`: a terminal can have its own icon in the lists (`tab.new {icon}`,
  `terminal.icon`, label `herdr.icon`). An agent dragged onto a space (or 放到 space…) now shows its own logo in the
  Agents panel instead of Claude's ([docs/kit.md](docs/kit.md)). An older app opens it with the program's icon.
- Dropping an agent on a space where it already runs opens no second one: its tab is shown (no toast). With
  `0004-…` you see it while dragging: that space dims, the chip says it's already open there, the pointer shows the
  not-allowed sign, and letting go does nothing.
- kit 0.5.2: placing an agent no longer shows the Claude tools.only note (its author sees it in `kit check`); Claude's
  tool limits no longer name `MultiEdit` (newer Claude Code warned "Deny rule MultiEdit matches no tool").
- Build steps: [docs/macos.md](docs/macos.md) §3/§8, [docs/windows.md](docs/windows.md) §3/§8.2 (the app blocks only;
  they already apply every patch in the folder).
app 同樣是 v0.1.15，多了第三、第四個 patch（agent 自己的 logo；拖的時候看得出哪個 space 已經開著），要重新 build app；同一個 space 不會開第二個同樣的 agent；kit 升到 0.5.2。

## 2026-11-13, Herdr core v0.1.21

Needs: **core** (v0.1.20 → official v0.1.21, no patches: [herdr-core/patches/v0.1.21](herdr-core/patches/v0.1.21/README.md)).
On the Linux server too ([docs/linux-remote.md](docs/linux-remote.md) §2).

- Windows: Herdr sees the program running in a PowerShell / cmd terminal, so agents started from a shell show their
  name and status; terminals start when PowerShell 7 isn't on PATH.
- Remote Linux: cores started over SSH get your login profile's environment (tools in `~/.local/bin` are found);
  a failing SSH login retries after 2, 5, then every 10 minutes; Herdr warns when logging out would stop your programs.
- Official notes: the herdr-core CHANGELOG, 0.1.21.
core 升到官方 v0.1.21（不用 patch）。Windows 看得到 PowerShell 裡跑的 agent；遠端 Linux 讀登入時的環境。

## 2026-11-13, Herdr app: drag onto a space

Needs: **app** (same v0.1.15, now with two patches: rebuild it; core unchanged), **kit** 0.5.0, **mods**.

- `herdr-app/patches/v0.1.15/`: a mod can make what it draws draggable and learns when it is dropped on a space in
  the sidebar Agents (grouped by space) or Spaces panel. The Kit panel uses it: drag an agent card onto a space and
  it gets its own folder there, with a tab running it ([docs/kit.md](docs/kit.md)). Without the patches the Kit panel
  shows 「放到 space…」 instead, which does the same.
- Build steps apply them: [docs/macos.md](docs/macos.md) §3/§8, [docs/windows.md](docs/windows.md) §3/§8.2 (the app
  blocks only). [docs/patches.md](docs/patches.md) says what they change.
app 同樣是 v0.1.15，多了兩個 patch（拖到 space），要重新 build app；core 不用動。

## 2026-11-13, kit: fixes to pasted MCP setups, placing agents, 各機器

Needs: **mods** (the kit mod changed: Windows copies it again; macOS symlink: nothing, Herdr picks it up on its next
start).
要做：mods（kit mod 有改）。

- **貼上設定**: the file the paste goes to kit in (`<Herdr's settings folder>/kit-tmp/mcp-paste.txt`) is made
  private first on Mac / Linux (folder 700, file 600; not written when that fails), is also blanked when the panel
  closes while kit reads it (Herdr quit, another layout, the window closed), and one left over is blanked the next
  time the panel opens. A blank that fails is said (a notification), not swallowed. A server picked from a paste with
  several is sent by kit's name (`MCP_DOCKER` → `mcp-docker`), so kit no longer refuses it.
  貼上的設定：暫存檔先設成只有自己能讀；kit 還在讀時面板被關掉也會清，下次打開也會清；清不掉會說。好幾個 server 時點的名字改用 kit 的寫法交給 kit。
- **Put an agent in a space** from the Agents window: handed to the tab-bar Agents button, so closing the window
  right after no longer cancels it. A place cut off by its panel closing gives the lock back at once (the other kit
  buttons no longer stay grey for 3 minutes) and says 「視窗關了，分頁沒開：再放一次」.
  從 Agents 視窗放 agent：交給分頁列的按鈕去跑，關掉視窗也會做完；被關掉中斷的會說，按鈕不會卡住變灰。
- **各機器**: the approval serial and the approved commits come from machines asked directly; an account's own report
  file counts only when no machine asked has approvals, labelled 「（自報）」. A slow load (many machines, older kits)
  is no longer restarted every minute.
  各機器：核准號碼和核准的 commit 先看直接問到的機器，自己回報的只在沒有時才用，標「（自報）」；慢的讀取不會一直重來。

## 2026-11-13, kit: an agent in a space, pasted MCP setups

Needs: **mods** (the kit mod changed: Windows copies it again; macOS symlink: nothing, Herdr picks it up on its next
start), **kit** 0.5.0 on the machines where you use these (`kit self-update`, `kit sync`). Dragging also needs a
Herdr with the drag API (`on_drag`, `nextDrop()`); without it, use the 放到 space… button.
要做：mods（kit mod 有改）、kit 0.5.0（用到的機器）。用拖的要有拖放功能的 Herdr；沒有的話按「放到 space…」。

- **Put an agent in a space** ([docs/kit.md](docs/kit.md#把-agent-放到-spacekit-050-以上)): drag its card from the
  Agents panel onto a space, or 放到 space… and pick one. On the space's machine `kit place <agent> <space
  folder>/<agent> --tool <tool> --json` makes that folder the agent; then a new tab in that space runs the command kit
  gave (`claude`, `codex` or `omp`) there. Progress and errors as notifications; another agent's folder or files
  kit didn't put there are left alone and said so.
  把 agent 拖到 space（或按「放到 space…」）：在那個 space 的資料夾裡建 agent 自己的資料夾，開新分頁跑它。
- **倉庫 → MCP → ＋ 新增 → 貼上設定**: paste an MCP setup (JSON, `claude mcp add …`, `codex mcp add …`, Codex TOML);
  「看看會變成什麼」 shows the yaml, the `${VAR}` names (never values), the pinned package, what it needs; 「建立」
  writes it and opens the file. Several servers: pick one. The paste goes to kit in a file in Herdr's own folder,
  blanked right after, never as an argument.
  貼上別人的 MCP 設定：先看會寫成什麼（token 換成變數名字），再建立。
- **MCP rows in an agent's Kit list** say which `${VAR}`s this machine hasn't set (names only) and 「每次啟動時下載
  <package>@<version>」 with 裝套件 (`kit install-deps mcp <name>`, after showing what it runs).
- 各機器 knows kit 0.5.0 (api 1.3): 貼上 MCP 設定, 各機器的核准和來源, 把 agent 放到 space.

## 2026-11-13, kit: 各機器

Needs: **mods** (the kit mod changed: Windows copies it again; macOS symlink: nothing, Herdr picks it up on its next
start). Optional: `kit-machines.json` for accounts that report themselves; a kit with `kit status` (coming in kit's
next version) for the 核准 and 來源 parts.
要做：mods（kit mod 有改）。自己回報的帳號要用的話，寫 `kit-machines.json`；「核准」「來源」要等有 `kit status` 的新版 kit。

- **The repository panel has a fourth tab, 各機器** ([docs/kit.md](docs/kit.md#各機器倉庫的第四個分頁)): every machine
  and account this Herdr knows, its kit version, and what it lacks next to the newest one, by name
  (「沒有：按輪分段」, else 「齊全」), with 「升到 kit 0.4.1 就有」 and a button that **copies** the upgrade command
  (`kit self-update && kit sync`; Windows: `kit self-update; if ($?) { kit sync }`), never runs it. 核准: which signed
  approval an account uses and whether its commits are the approved ones; 來源: this computer's kit and sources, each
  commit against the approved one. Loaded only when the tab is opened, every machine at once; kept until ⟳ or 10
  minutes. Machines that can't be reached are grey with the reason.
  倉庫多一個「各機器」分頁：每台、每個帳號的 kit 版本，少了什麼直接寫出來，「複製升級指令」只複製不執行；核准和來源的 commit。
- **Accounts the mod can't ask (a server's root)** write `kit status --json` to a file themselves; list those files in
  `<Herdr's settings folder>/kit-machines.json` and the tab reads them (read only, at most 64 KB, only kit status's
  fields, never run; only on machines this Herdr knows). The mod never uses sudo or another account.
  mod 不能問的帳號（例如 root）自己寫回報檔，在 kit-machines.json 列出來，分頁就會讀（只讀、不執行）。

## 2026-11-13, agent-files by turn

Needs: **mods** (agent-files changed: Windows copies it again; macOS symlink: nothing), **kit** (0.4.1 for the
turns; with 0.4.0 the list stays as it was).
要做：mods（agent-files 有改）、kit（0.4.1 才有按輪分段；0.4.0 照舊）。

- **agent-files splits the list by turn** (each message you sent and what the agent did until the next), newest
  first, like Claude Code's `/rewind`: 「第 12 輪 · 03:41 · <the start of your message>」, then that turn's files;
  git's changes last ([docs/agent-files.md](docs/agent-files.md)). Needs `kit files` from **kit 0.4.1**
  (`kit api` 1.2): `kit self-update`, `kit sync` where agents run.
  agent-files 的清單按輪分段（像 Claude Code 的 /rewind）；要 kit 0.4.1。
- **Picking a file did nothing**: the popup closed before the file was opened, and Herdr cancels a closed popup's
  unfinished work. It now shows 「開啟中…」 and closes once the file is open.
  選了檔沒反應的問題修好了：跳出視窗等檔案開好才關。

Windows: copy `herdr-app\mods\agent-files` again (see [agent-files.md → Install](docs/agent-files.md#install--安裝)).

## 2026-11-13, agent logos

Needs: **mods** (the kit mod changed: Windows copies it again; macOS symlink: nothing, Herdr picks it up on its next
start).
要做：mods（kit mod 有改）。

- **Every agent in the Agents panel has a logo**: a cute animal-robot head, drawn by the kit mod itself with
  [Zdog](https://zzz.dog) (nothing to install). Ten animals, each in its own colors and with something only it has
  (the cat's stripes, the rabbit's folded ear, the frog's crown, the panda's bamboo leaf ...), or in one of ten
  colors. In the list a still SVG (kept in `~/.config/herdr-app/data/kit/bots/`); in an agent's page drawn live: it
  turns its head and blinks. 「換 logo…」 picks the animal and color (or 隨機): it's written in the agent file as
  `bot: <animal>` or `bot: <animal> <color>` and sent with kit push like the rest; without one, the agent's name
  picks the animal, the same on every computer.
  Agents 面板每個 agent 都有一個動物機器人 logo（Zdog 畫的，點進去會轉頭眨眼）；「換 logo…」選動物和顏色，寫進 agent 檔的 `bot:`。

## 2026-11-13, later (agent-files)

Needs: **kit** (0.4.0 or later, for the new list; optional, see below), **mods** (a new folder, an old one removed;
nvim-jay changed), **keys** (one line); then close the nvim panes opened before the update.
要做：kit（0.4.0 以上，新清單要用；沒有也能用，見下面）、mods（新增 agent-files、拿掉 nvim-jay-agent-files、nvim-jay 有改）、keys（一行）；最後關掉更新前開的 nvim 格子。

- **nvim-jay-agent-files is now agent-files** ([docs/agent-files.md](docs/agent-files.md)), no longer tied to nvim:
  `cmd-o` / `ctrl-shift-j` shows the files the agent read or edited (then what git shows changed) in a Herdr popup;
  the one you pick opens in the tab's nvim-jay pane, else in a new pane with your editor (`agent-files.json`:
  `"editor"`, else `$VISUAL` / `$EDITOR`, else `vi`; `"gui": true` for VS Code and the like). Claude Code, Codex
  and omp, on this computer or on another machine. The list comes from **`kit files`** (kit 0.4.0, `kit api` 1.1)
  where the agent runs. Without it: the popup says so, and with an nvim-jay pane in the tab, nvim-jay's own list
  opens instead (as before).
  nvim-jay-agent-files 改成 agent-files：清單在 Herdr 的跳出視窗，選了用 nvim-jay 或你的編輯器開；要 kit 0.4.0。
- **nvim-jay** listens for agent-files (`~/.cache/nvim-jay/sock/<pid>`, a folder only you can enter; Windows
  `\\.\pipe\nvim-jay-<pid>`). A pane opened before the update doesn't: close it and open a new one. nvim-jay no
  longer finds panes by the name before the rename (`g:jay_nvim`).
  nvim-jay 多了讓 agent-files 叫它開檔的入口；更新前開的 nvim 格子要關掉重開。

What to do / 要做的事:

1. **kit** (optional), on every machine where agents run: `kit self-update`, `kit sync`; `kit api` prints `1.1` or
   higher. At the company: once the company's Git server has kit 0.4.0. Until then agent-files uses nvim-jay's
   own list; nothing breaks.
   kit：每台 `kit self-update`、`kit sync`，`kit api` 要 1.1 以上。公司要等 Git 伺服器有 kit 0.4.0；之前 agent-files 會改用 nvim-jay 自己的清單。
2. **mods**. macOS (links):

   ```sh
   cd ~/.config/herdr-app/mods
   rm -f nvim-jay-agent-files                   # the old link
   ln -sfn ~/src/herdr-jay/herdr-app/mods/agent-files .
   herdr-app check ~/.config/herdr-app/mods/agent-files
   ```

   Windows (PowerShell):

   ```powershell
   $j = "$env:USERPROFILE\src\herdr-jay"; $h = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } elseif ($env:XDG_CONFIG_HOME) { "$env:XDG_CONFIG_HOME\herdr-app" } else { "$env:USERPROFILE\.config\herdr-app" }
   Remove-Item -Recurse -Force "$h\mods\nvim-jay", "$h\mods\nvim-jay-agent-files", "$h\mods\agent-files" -ErrorAction SilentlyContinue
   Copy-Item -Recurse -Force "$j\herdr-app\mods\nvim-jay", "$j\herdr-app\mods\agent-files" "$h\mods\"
   Set-Content -Encoding ascii "$h\mods\nvim-jay\.herdr-jay" (git -C $j describe --tags --always --match "for-herdr-v*-r*")
   herdr-app check "$h\mods\nvim-jay" | Out-Host
   herdr-app check "$h\mods\agent-files" | Out-Host
   ```
3. **keys**: in `keys.json`, the `cmd-o` line (Windows `ctrl-shift-j`) becomes

   ```json
   "cmd-o": "mod.open:agent-files",
   ```

   ```json
   "ctrl-shift-j": "mod.open:agent-files",
   ```
4. Close every nvim pane opened before the update (PC and server) and open new ones (`cmd-e` / `ctrl-shift-i`).
   Quit and reopen Herdr if `herdr-app status` shows an error about `nvim-jay-agent-files`.
   關掉更新前開的 nvim 格子，再開新的。

## 2026-11-13 (kit mod, nvim-jay)

Needs: **kit** (0.3.0 or later, step 1 first), **mods** (new folders, old ones removed), **gerrit** (Windows),
**layout**, **keys** (two lines), **gerrit plugin** (one line), **snap hook** (one line); then restart Herdr and
close the old nvim panes.
要做：kit（0.3.0 以上，先做第 1 步）、mods（新資料夾、刪掉舊的）、gerrit（Windows 重新複製）、layout、keys（兩行）、gerrit.json（一行）、snap hook（一行）；最後重開 Herdr、關掉舊的 nvim 格子。

- **jay-nvim is now nvim-jay**, **jay-nvim-pick is now nvim-jay-agent-files** (same features: `cmd-o` / Windows
  `ctrl-shift-j` jumps to nvim and lists the files the agent read or edited). Everything moved with the names: the
  mod folders, `tests/nvim-jay`, `docs/nvim-jay.md` (was `docs/nvim.md`), `~/.cache/nvim-jay`,
  `~/.config/nvim-jay/snap_hook.lua`, `~/.config/nvim-jay/root_view`. The `.herdr-jay` marker keeps its name. Until
  the next release nvim-jay-agent-files also finds nvim panes opened before the rename.
  jay-nvim 改名 nvim-jay，jay-nvim-pick 改名 nvim-jay-agent-files，功能不變；快取、hook 檔的路徑也跟著改。
- **The kit mod is here now** (`herdr-app/mods/kit`, [docs/kit.md](docs/kit.md)): what an older kit installed itself
  as three mods (`kit`, `kit-agents`, `kit-pane`) is one mod `kit` with a role per part (`repo`, `repo-toggle`,
  `agent`, `agents`, `agents-toggle`, `header`, `context`; the older names `panel`, `toggle`, `pane` still work). It
  runs `kit` from PATH (`kit.cmd` on Windows), else from kit's install folder; no `config.json`. It needs **kit 0.3.0
  or later** (`kit api` prints `1.0`): with an older kit the panels say 「kit 太舊」 (`kit self-update`); with a kit
  newer than the mod, 「Herdr 的 kit mod 太舊」 (update herdr-jay). kit's own `kit herdr-panel install` is gone; don't
  run it any more. It reads only kit's JSON (what changed and what 送出 sends: `kit list --json`, `kit push --json`),
  no git of its own. A layout with Kit's button but an older kit's pieces gets 「更新版面」 in the Kit panel.
  kit 的 Herdr 面板搬到 herdr-jay：三個 mod 合成一個 `kit`，要 kit 0.3.0 以上。
- **The Gerrit panel's skills moved into the gerrit mod**: the `gerrit-panel` plugin is now
  `herdr-app/mods/gerrit/claude-plugin` (was `agents/gerrit-panel`), so it is installed and updated with the mod.
  The buttons still call `/gerrit-panel:…`.
  Gerrit 面板的 skill 搬進 gerrit mod 裡（claude-plugin）。
- jay's layouts (`jay.json`, `jay-win.json`) use the `kit` mod and its roles.

What to do / 要做的事:

1. **kit** (only if you use it), first, on this computer **and** on every machine where agents run:

   ```sh
   kit self-update
   kit sync
   kit api          # must print 1.0 (any 1.x)
   ```

   `kit api` prints anything else (an error, `沒有這個指令`, a `0.`): **stop here and tell jay** — the company's
   Git server doesn't have the new kit yet. Until it does, skip step 3: keep the old kit mods (`kit`, `kit-agents`,
   `kit-pane`) and your layout as they are (they keep working with the old kit). Steps 2 and 4–6 are fine.
   有用 kit：每台都先 `kit self-update`、`kit sync`，`kit api` 要印出 `1.0`。印的不是 1.x 就停下來告訴 jay（公司的 Git 伺服器還沒有新版 kit），先不要刪舊的 kit mod、不要動 layout。
2. **mods** (nvim-jay; Windows also gerrit). macOS (links):

   ```sh
   cd ~/.config/herdr-app/mods
   rm -f jay-nvim jay-nvim-pick                 # the old links
   ln -sfn ~/src/herdr-jay/herdr-app/mods/nvim-jay ~/src/herdr-jay/herdr-app/mods/nvim-jay-agent-files .
   ```

   Windows (PowerShell): the old folders out, then [windows.md §8.4](docs/windows.md#84-mods) (copies `nvim-jay`,
   `nvim-jay-agent-files`; and `gerrit` again if you use it: the skills now come with it):

   ```powershell
   $h = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } elseif ($env:XDG_CONFIG_HOME) { "$env:XDG_CONFIG_HOME\herdr-app" } else { "$env:USERPROFILE\.config\herdr-app" }
   Remove-Item -Recurse -Force "$h\mods\jay-nvim", "$h\mods\jay-nvim-pick" -ErrorAction SilentlyContinue
   ```

   Mac 重新連結；Windows 刪掉舊資料夾，再照 §8.4 複製。
3. **kit mod and layout** (only after step 1 printed `1.x`). The older kit's own mods out:

   ```sh
   cd ~/.config/herdr-app/mods                  # macOS
   rm -rf kit-agents kit-pane                   # an older kit's mods, now part of kit
   [ -L kit ] || rm -rf kit                     # an older kit's own copy of kit (a folder, not a link)
   ```
   ```powershell
   Remove-Item -Recurse -Force "$h\mods\kit-agents", "$h\mods\kit-pane" -ErrorAction SilentlyContinue   # Windows ($h as in step 2)
   ```

   then the kit mod: [kit.md → Install](docs/kit.md#install--安裝). The layout:
   - **jay's layout**: macOS nothing (a link); Windows copy `jay-win.json` again ([layout.md](docs/layout.md#install--安裝) step 3).
   - **Your own layout** (one where an older kit put its buttons): after the restart (step 5) open the Kit panel and
     press 「更新版面」. Or by hand, three places in your layout's JSON:
     `{ "mod": "kit-agents", "props": { "role": "toggle" } }` → `{ "mod": "kit", "props": { "role": "agents-toggle" } }`;
     `{ "mod": "kit-agents" }` → `{ "mod": "kit", "props": { "role": "agents" } }`;
     the pane header's `{ "mod": "kit-pane" }` → `{ "mod": "kit", "props": { "role": "header" } }`.
     Until then those places show an error.
   自己的 layout：重開後在 Kit 面板按「更新版面」，或手動改上面三個地方。
4. **keys** and **gerrit plugin**. In `keys.json` the two lines become:

   ```json
   "cmd-e": "mod.open:nvim-jay",
   "cmd-o": "mod.open:nvim-jay-agent-files",
   ```

   Windows:

   ```json
   "ctrl-shift-i": "mod.open:nvim-jay",
   "ctrl-shift-j": "mod.open:nvim-jay-agent-files",
   ```

   Gerrit agent (only if `gerrit.json` has `agent.start`): its second `--plugin-dir`, `…/herdr-jay/agents/gerrit-panel`,
   becomes `<Herdr home>/mods/gerrit/claude-plugin` (e.g. `C:/Users/you/.config/herdr-app/mods/gerrit/claude-plugin`,
   macOS `/Users/you/.config/herdr-app/mods/gerrit/claude-plugin`; [gerrit.md §8 step 5](docs/gerrit.md#8-a-gerrit-agent-step-by-step--gerrit-agent-安裝步驟)).
   Then close the Gerrit agent's pane and start it again with ＋.
   keys.json 那兩行改成新名字；gerrit.json 的第二個 `--plugin-dir` 改成 Herdr 家目錄裡的 `mods/gerrit/claude-plugin`。
5. **Restart**: quit and reopen Herdr. Then **close every nvim pane opened before the update**, on the PC and on the
   server (restarting Herdr doesn't close them; they still run the old code), and open new ones (`cmd-e` /
   `ctrl-shift-i`). `herdr-app check` each mod.
   重開 Herdr，然後把更新前開的 nvim 格子全部關掉（PC 和 server 都要；重開 Herdr 不會關掉它們），再開新的。
6. **snap hook**, on every machine where you added it (the PC, a Mac, a Linux server): first open a new nvim pane
   there (step 5; it writes the new hook file). Then in Claude Code's `settings.json` (`~/.claude/settings.json`;
   Windows `%USERPROFILE%\.claude\settings.json`), in the PreToolUse hook's `command` (or `args`), replace
   `/.config/jay-nvim/` with `/.config/nvim-jay/`; keep the rest of the line (the `nvim` path, Windows' `<home>`).
   Without the change the old hook keeps its copies where nvim-jay no longer looks (no red / green for Bash edits
   outside a repo). Restart Claude Code (or `/hooks`). A `root_view` file moves from `~/.config/jay-nvim/` to
   `~/.config/nvim-jay/`. Then the old folders can be deleted: `~/.config/jay-nvim` and `~/.cache/jay-nvim`; on
   Windows `<home>\.config\jay-nvim` and `<home>\.cache\jay-nvim`, where `<home>` is nvim's home folder
   ([windows.md §6 step 3](docs/windows.md#6-test-checklist--實測清單)), which may not be `%USERPROFILE%`.
   每台有裝 snap hook 的機器：先開一格新的 nvim（寫出新的 hook 檔），再把 settings.json 那一行裡的 `/.config/jay-nvim/` 改成 `/.config/nvim-jay/`，重開 Claude Code。

## 2026-11-12 (folders)

Needs: **mods** (they moved: copy again from the new folder; macOS symlinks: link again).

- The repo now uses Herdr's own folder names, so a path here says where it goes: `herdr-app/mods/<mod>` →
  `~/.config/herdr-app/mods/<mod>`; patches to Herdr's source are in `herdr-core/patches/<tag>/` and
  `herdr-app/patches/<tag>/` (were `patches/<repo>/<tag>/`); `patches/README.md` is now [docs/patches.md](docs/patches.md).
  資料夾改用 Herdr 自己的名字：`herdr-app/mods/…` 就是裝到 `~/.config/herdr-app/mods/…`；補丁在 `herdr-core/patches/`。
  macOS: `cd ~/.config/herdr-app/mods && ln -sfn ~/src/herdr-jay/herdr-app/mods/jay-nvim ~/src/herdr-jay/herdr-app/mods/jay-nvim-pick .`
  (and `gerrit` the same way if you use it).
  Windows: the copy block in [windows.md §8.4](docs/windows.md#84-mods) (already uses the new folder); the mods'
  content didn't change, so this is only needed before copying a newer version.
- New `herdr-app/layouts/jay.json` (macOS) and `jay-win.json` (Windows: the buttons sit left of the tabs, away from
  the window's ─ □ ✕): jay's layout (Agents, Kit, Gerrit buttons and panels; the Kit bar on every terminal).
  Optional, needs kit (at the company from its own Git server): [docs/layout.md](docs/layout.md).
  jay 的 layout，Mac 用 jay.json、Windows 用 jay-win.json；要先有 kit。
- Docs: Windows paths follow `HERDR_APP_HOME` everywhere; the Gerrit agent's download sites are in
  [windows.md §0](docs/windows.md#0-before-you-start--開始前); [docs/patches.md](docs/patches.md) has one apply
  command for any tag.
- [linux-remote.md §2](docs/linux-remote.md#2-herdr-core-for-the-server-built-on-the-pc--server-的-core在-pc-上-build):
  the commands to build the server's core on the PC (`rust-lld`, no Linux compiler) and to copy it over safely.

## 2026-11-12

Needs: **core** (build v0.1.20, no patches), **app** (build v0.1.15), in that order; restart Herdr.

- Herdr core v0.1.20 (`de97ea5`) and app v0.1.15 (`9950887`), checked on macOS. Core v0.1.20 needs **no patches**:
  the one v0.1.19 had (skip Ghostty's xcframework) is in the official source now (#182);
  `herdr-core/patches/v0.1.20/` (then `patches/herdr-core/v0.1.20/`) holds only a README.md. Applying the old v0.1.19 patch on v0.1.20 breaks the build.
  core v0.1.20 不用 patch（官方已收進去）；app v0.1.15。
- No default key changes, no hc API change; the mod API change (`knownAgents()` rejects when its check fails, parent
  addresses) doesn't affect these mods (`herdr-app check` ok on all).
- macOS: terminals opened by a core older than 0.1.20 can still end when Herdr quits. Install core first; after
  that, close and reopen old terminals when convenient (or restart the Mac).
- Tag `for-herdr-v0.1.15-r1`: checked on macOS only so far (see the README tag table).
- **jay-nvim finds newer Claude Code's session** ([docs/nvim-jay.md](docs/nvim-jay.md)). Needs **mods** (macOS symlinks:
  nothing; reopen the nvim pane). Claude Code 2.1.322 no longer writes `~/.claude/sessions/<pid>.json`, so follow
  found nothing. Now, after that file: Claude Code's `~/.claude/daemon/roster.json` (background / remote-control
  sessions: the worker whose `pid` or `replPid` is the agent or under the pane), then, on every system, the agent's
  transcript folder `~/.claude/projects/<cwd with non-A-Z a-z 0-9 as ->`: the newest log changed since that Claude
  Code started (else in the last 24 h); `/clear`'s new log is followed. Two Claude Codes in one folder may swap.
  Only a plain file inside `~/.claude/projects` is followed (no link out of it). Snap hook unchanged.
  新版 Claude Code 不再寫 `sessions/<pid>.json`，跟檔改從 roster 或 agent 所在資料夾找對話紀錄。
- **jay-nvim follow fixes** ([docs/nvim-jay.md](docs/nvim-jay.md)). Needs **mods** (macOS symlinks: nothing; reopen the nvim
  pane). Follow keeps going after a Bash command that fails, follows a background Bash when it ends, follows
  sub-agents (Task), opens a new file the agent writes once it is there, prefers the files a Bash command names over
  other changes in the repo, `~/x` and `$HOME/x` count as paths (also in the snap hook, which jay-nvim rewrites
  itself), a stuck `hc` or `git` no longer freezes nvim, size caps (files over 4 MB are not opened by follow), a first
  open after a snapshotted Bash edit marks that edit (not everything since the last commit), the Edit line comes from
  `old_string` first. Root view: records carry `pid`; only the root agent under this pane counts. Tests:
  `node tests/jay-nvim/run.js`.
  jay-nvim 跟檔修正：Bash 失敗後還會跟、背景 Bash、sub-agent、新寫的檔、hc／git 卡住不再凍住 nvim 等。
- **jay-nvim review fixes** ([docs/nvim-jay.md](docs/nvim-jay.md)). Needs **mods** (macOS symlinks: nothing; reopen the nvim
  pane). The 4 MB cap now also holds for the committed copy a file is marked against (a committed 20 MB log the agent
  emptied no longer makes millions of red lines), and at most 50 removed lines show per change, then 「…還有 N 行」.
  A program nvim gave up on is killed with what it started (Windows: `taskkill /T /F`, for Git for Windows' launcher
  `git.exe`); after `hc` times out nvim asks it nothing for 30 s, after a `git` call times out no more git that round;
  a catch-up read looks at only the last Bash result; a background Bash ends only by its own task notification, not
  by a tool result quoting one.
  **Snap hook changed**: it never copies keys or credentials (`~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config/gh`,
  `~/.kube`, `~/.netrc`, `~/.git-credentials`, `~/.docker/config.json`, also through a link). jay-nvim rewrites
  `~/.config/jay-nvim/snap_hook.lua` itself the next time it opens on a machine; a copy you made by hand anywhere
  else must be copied again (the settings.json entry stays the same). Copies older than 10 minutes are removed at the
  next Bash run (they always were).
  jay-nvim 審查修正：HEAD 也受 4 MB 上限、刪除行每段最多 50 行、卡住的程式連子程序一起砍、hc 卡住後 30 秒不問；
  snap hook 不再存金鑰／帳密檔（hook 檔有改，手動複製的那份要重抄）。

## 2026-11-10

- **Gerrit panel: the 問 agent buttons call skills** ([docs/gerrit.md §7](docs/gerrit.md#7-ask-an-agent--問-agent)): Review, 整理留言, 為什麼沒過 and 幫我回覆 now send `/gerrit-panel:review <change> <patch set> <url>` and so on; how to do each job is in the `gerrit-panel` plugin (`agents/gerrit-panel`). Needs **gerrit** (Windows: copy it again), a second `--plugin-dir` in `gerrit.json` `agent.start` ([§8 step 5](docs/gerrit.md#8-a-gerrit-agent-step-by-step--gerrit-agent-安裝步驟)), restart Herdr and the Gerrit agent; buttons you edited before: ✎ → 還原成原本的.
- **Gerrit panel: 為什麼沒過 brings the submit requirements**: the Gerrit tools don't return them, and an agent once went around them with its own REST calls. The button now adds what the panel sees (`{requirements}`), and the skills use only the Gerrit tools (no curl, never the MCP's config file with the password). Needs **gerrit** (Windows: copy it again), restart Herdr and the Gerrit agent.
- **Gerrit panel: 問 agent** ([docs/gerrit.md §7](docs/gerrit.md#7-ask-an-agent--問-agent)): on a change's page, send the Gerrit agent (opened by its ＋ button, so it has the Gerrit tools; other agents aren't offered) a preset request about the change (Review, 整理留言, 為什麼沒過, 幫我回覆; answers in Traditional Chinese; ✎ 編輯問題 edits them in the panel) by `hc send`; your own prompts and a start button in `gerrit.json` `agent`. Needs **gerrit**, restart Herdr.

- **Gerrit panel: name the ▶ button**: `"start_label": "Preflight"` in the `jenkins` block shows 「▶ Preflight」. Needs **gerrit** (Windows: copy it again), restart Herdr.
- **Gerrit panel: ▶ Preflight without watching Jenkins**: a `jenkins` block with `start_job` and no `jobs` gives only the start button (the results come back as messages under 合併條件). Needs **gerrit** (Windows: copy it again), restart Herdr.
- **Gerrit panel: check systems under 合併條件**: the bots that report back to Gerrit (build, test, any system, Jenkins or not) show under the requirement they vote on, from their messages on the latest patch set: ⏳ running for how long / ✓ / ✗, the message's first line and its links (click to open in the browser). Optional `bots` in `gerrit.json` names the accounts. Needs **gerrit** (Windows: copy it again), restart Herdr.
- **Gerrit panel: Jenkins builds** ([docs/gerrit.md §6](docs/gerrit.md#6-jenkins-builds--jenkins-build)): a change's page lists the Jenkins builds that have its number in a parameter: progress (跑了 / 平常), result, queue, the log's last lines live, ▶ to start the job, and a notification when one finishes. Needs **gerrit** (Windows: copy it again), a `jenkins` block in `gerrit.json` with an API token, restart Herdr.
- **Gerrit panel: 合併條件** on a change's page: Gerrit's submit requirements, what is still missing first (⊘, who voted), passed ones folded when many. Needs **gerrit** (Windows: copy it again), restart Herdr.
- **Gerrit panel: ← 返回 goes back one page** like a browser: after clicking a topic, a change in 「同一個 topic」, a search result or a file, it returns to the page you were on (before, a topic search had no way back). Needs **gerrit** (Windows: copy it again), restart Herdr.
- **Gerrit panel: topics** ([docs/gerrit.md §3](docs/gerrit.md#3-what-you-see--畫面)): the topic on a change (click: search it; ✎ set / change / remove) and on list rows; 「同一個 topic」 lists its other changes in any project; with whole-topic submit the merge button says how many it merges. Needs **gerrit** (Windows: copy it again), restart Herdr.
- **Gerrit panel: compare two patch sets** ([docs/gerrit.md §3](docs/gerrit.md#3-what-you-see--畫面)): pick 從 (Base or an older patch set) and 到; the files and diffs show only what changed between them, comments on their side. Needs **gerrit** (Windows: copy it again), restart Herdr.
- **Gerrit panel: search, rebase / abandon / WIP** ([docs/gerrit.md §3](docs/gerrit.md#3-what-you-see--畫面)): a search box above the sections (a number or pasted Gerrit link opens the change; other text is a Gerrit search; Enter works), `{"search":"…"}` for a search in its own tab; on a change, Rebase, Ready / WIP, Abandon (press twice) and Restore, shown only when Gerrit allows them. Needs **gerrit** (Windows: copy it again), restart Herdr.
- **Gerrit panel: Reviewer／CC** on a change's page: see them, add (search by name → 加 Reviewer / 加 CC), move between the two, remove (on your own changes). Score rows show the label's full name (Code-Review, Build, Verified …). Needs **gerrit** (Windows: copy it again), restart Herdr.
- Gerrit panel: tests (`node tests/gerrit/run.js`, no Herdr or Gerrit needed): settings file, login errors, change ids with "/", one section per change, old Gerrit without attention, notifications, reply / thread reply / submit requests, diff folding, and drawing every page without Herdr's render errors.
- **Gerrit panel: each change in one section** ([docs/gerrit.md §3](docs/gerrit.md#3-what-you-see--畫面)): 輪到你 no longer repeats under the others, which are now 我送出的（等對方）and 我在 review（等對方）. The 在瀏覽器開 button is gone (long diffs load more in place). Needs **gerrit**, restart Herdr.

- **Gerrit panel: diffs** ([docs/gerrit.md §3](docs/gerrit.md#3-what-you-see--畫面)): click a file for its diff in the panel (red / green rows, folded unchanged lines, comments inline, previous / next file), click a line to comment. The change page reads like Gerrit's: files, comments, then reply / vote. No width limit (drag the edge; a panel moved with 移到上排 before today: delete `"max"` of `gerrit-panel` in your layout). `props {open, diff}` starts a copy on a change. Fixed: projects with a "/" in the name (change id escaped twice: details, diffs and every reply failed with 404). Needs **gerrit**, restart Herdr.

- **Gerrit panel: reply, vote, submit without the web page** ([docs/gerrit.md §3](docs/gerrit.md#3-what-you-see--畫面)): big score buttons per label, a reply box, 💬 送出回覆 (message + scores + drafts), ✅ 合併 (press twice); under comment threads ✓ Done / Ack / 💬 回覆. Tested against a local Gerrit 3.14. Needs **gerrit**, restart Herdr.

- **jay-nvim follows a root agent through a root view** ([docs/nvim-jay.md §6](docs/nvim-jay.md#6-agent-running-as-root--agent-用-root-跑)): when a root-side hook keeps copies you can read (`index.jsonl` + `blobs/`), name its folder in `~/.config/jay-nvim/root_view` and nvim opens root's file as a read-only copy, marked and at the line. The root-agent notice is one short line (no more "Press ENTER"), kept in `:messages`. Needs **mods**; nothing to do on machines without a root agent.

- **Gerrit panel sits with the other panels**: a **Gerrit** button in the tab bar (number = changes waiting for you) opens and closes it, and keeps checking and notifying while it's closed. A panel still docked outside shows a **移到上排** button that moves it there (on Herdr's own layout it first makes `main-jay`). Header buttons are bigger. Fixed: on Gerrit 3.14+ four default sections said 讀不到 (`-is:ignored` no longer exists there; dropped). Needs **gerrit** (copy `mods/gerrit`), restart Herdr, press 移到上排 once.

## 2026-11-09

Needs: **mods** (copy both again), **app** (build v0.1.14), and once per machine running Claude Code: the snap hook in its settings.

- **New: Gerrit panel** (`mods/gerrit`, [docs/gerrit.md](docs/gerrit.md)), step 1: Gerrit's dashboard sections (輪到你, WIP, 我送出的, 等我 review, CC, 最近合併), a change's votes, comment threads, files, commit message, patch sets and log, notifications when it turns to you or someone replies. Settings in `<home>/.config/herdr-app/gerrit.json` (HTTP password). Tested on a public Gerrit without a login only. Needs **gerrit** (copy `mods/gerrit`).
- **jay-nvim**: the tree lists a file the agent just created when nvim follows it (no closing and reopening). docs: nvim.md says which edits get marks outside a git repo. Needs **mods**.
- **jay-nvim follow fix**: newer Claude Code logs `api-request-blob` records that repeat earlier tool calls; jay-nvim read them as new and jumped back to an older file. Only the agent's own records count now. Needs **mods**.
- docs: windows.md §4 — Neovim on Windows can be skipped when you only work on a Linux server.
- **jay-nvim: no trust step** (jay's choice): pyright / TypeScript start in every project, no `:JayTrust` (command removed; `~/.config/jay-nvim/trust` no longer read). They run the project's own Python / TypeScript as you: don't open repos you don't trust. Needs **mods**.
- docs: [linux-remote.md §3b](docs/linux-remote.md#3b-python-go-to-definition-pyright-optional--python-跳定義選用): Python go-to-definition on the server with npm's pyright 1.1.414 on the server's own Node (online or offline `.tgz`, tested offline on Mac), how to use it (`:JayTrust`, right-click 跳到定義, `gd`, `ctrl-o`) and what to check when the right-click menu is missing. Ask the company first: it is packed JavaScript, not source. The `.tgz` is also on herdr-jay's release `pyright-1.1.414` (same sha256 as npm's).
- docs: Neovim is built **on the Linux server** (not on the PC like herdr-core) said plainly in linux-remote §3, windows §8, agent-install; §3a can pack the source on any Linux / Mac that can download (tested: 14 files). Company server: built and following.
- Install guides now include the **snap hook** step: [windows.md §5a](docs/windows.md#5a-snap-hook-for-claude-code--snap-hook),
  [linux-remote.md §4](docs/linux-remote.md#4-agents-on-the-server--server-上的-agent), and row 8 of
  [agent-install.md](docs/agent-install.md). Each machine running Claude Code adds the hook once.
  安裝文件補上 snap hook：每台跑 Claude Code 的機器加一次。
  Windows: matcher `Bash|PowerShell`, and the home folder is the one nvim reports (may be `H:\`), not always `C:\Users\<you>`.
- **Snap hook fixes** (review): the `/proc` `/sys` `/dev` skip never applied (a Lua `and nil or` slip), so e.g.
  `/proc/self/environ` was copied; a file swapped for a FIFO after the check could stall the command; jay-nvim now
  writes the hook file via a temp file + rename, so a hook starting meanwhile never runs half a file.
  修 snap hook：/proc 等沒真的跳過、FIFO 可能卡住、寫 hook 檔改成先寫暫存再換名。
- docs/nvim-jay.md: §4 (macOS vs Windows), §5 (how it is built) and §6 (agent as root) were cut by mistake in the
  previous change; back.
- docs/windows.md: build tools reduced to the versions needed; **§8 Updating** now covers everything that gets
  updated — herdr-jay, core on the PC and the Linux server, app, mods, Neovim — in one order. README names the Neovim version.
  更新步驟集中在 §8：PC 和 server 的 core、app、mod、Neovim。
- **jay-nvim security fixes** (review): an untrusted repo could still make nvim's own git calls run a program — a
  filter name containing `=`, the `post-index-change` hook through `git status`, a partial clone's lazy fetch
  (`uploadpack` / `sshCommand`), a submodule's filter, and netrw's `git ls-files` on git older than 2.31. Now every git
  call has hooks, index writes and fetching off, `status` skips submodules, a `=` filter name means no git there, and
  netrw's call is guarded through `GIT_CONFIG_PARAMETERS`. Also: follow mode was one hour off in daylight-saving time
  zones. 修正：別人的 repo 還有幾種方法讓 nvim 的 git 跑程式，全部擋掉；夏令時間差一小時。
- **Snap hook** (jay-nvim): the Claude Code hook that saves a file before a Bash command changes it is now part of
  jay-nvim (Lua, run with `nvim -l`, written to `~/.config/jay-nvim/snap_hook.lua` on every machine jay-nvim runs on;
  macOS, Windows, Linux). Turn it on in Claude Code's settings: [docs/nvim-jay.md §7](docs/nvim-jay.md#7-snapshots-for-bash-edits-optional--bash-改檔的快照選用).
  snap hook 進 jay-nvim，三個系統都能用。
- docs/linux-remote.md: the server's herdr-core is now **built on the Windows PC** for Linux
  (`x86_64-unknown-linux-musl`) and copied over; the server needs no Rust or Zig and builds nothing for it. Only
  Neovim v0.12.6 is built on the server, from source (needs `gcc`, `make`, `cmake`); a server without internet gets
  Neovim's source + libraries as a pack from the PC (§3a). pip `ruff` / `pyright` are prebuilt: not for a
  source-only server. 公司 server：core 在 Windows 上 build 好複製過去，server 只 build Neovim。
- docs/windows.md: IT allow-list also names `%TEMP%\hc-local-*` (the core install script runs from there).
- Security fix (jay-nvim): the git guard missed filters set in a file the repo's `.git/config` includes
  (`include.path` / `includeIf`) or in `config.worktree`; nvim's own `git status` in such a repo ran them. Now
  read with `--includes --show-scope`. 修正：別人的 repo 用 include 藏的 git filter 會被執行。

- Herdr app v0.1.14 (`2405bf3`; core stays v0.1.19). No default key changes; the mod API change (exec timeout) doesn't
  affect these mods. First tag checked on both OSes will be `for-herdr-v0.1.14-r1`.
- New [docs/linux-remote.md](docs/linux-remote.md): a Linux server as a Herdr machine over ssh (key login, herdr-core
  built on the PC for Linux and copied, Neovim built on the server, agents on the server).
- New [docs/agent-install.md](docs/agent-install.md): runbook for a coding agent installing PC + server. jay-nvim also finds `~/.local/bin/herdr-core`.

- nvim opens in the focused pane's folder (it could start in the space's folder).
- Root handoff removed: a sudo'd agent beside the pane gets a one-time warning, no follow (docs/nvim-jay.md 6).
- git safety: also the repo's own clean / smudge filters are off for nvim's git calls (not only fsmonitor);
  no git at all on Windows when only a project-folder git exists.
- Re-sourcing keeps the tree and unsent comments; trust-file lines for home or above are ignored.
- Fixes: UTF-8-safe cut of long comments, renames in the pick list, pick reports a failed key send,
  two Windows opens at once, `--out=/path` and paths inside quoted code in Bash commands.
- docs: Windows TLS revocation / AppLocker / tar / winget-less notes, blocks that work in a fresh window;
  macOS Intel PATH, update block stops on a bad tag and checks the core version before installing.

## 2026-11-08 (review 2)

Needs: **mods** (copy again; both mods changed together — use them as a pair).

- History rewritten once (2026-11-08) to remove session links from old commit messages; file contents unchanged.
  The old tag `for-herdr-v0.1.13` was re-created on the rewritten commit (the one exception to "tags never move").
  A clone from before: `git fetch --force --tags && git reset --hard origin/main` (or clone again).

- jay-nvim-pick always sends alt+o (`<M-o>`); finds the pane by a marker argv item, not the word "jay-nvim".
- Comments go only to known coding agents (never a shell / ssh / REPL), in this tab (by tab id); long lines cut.
- `:JayTrust` refuses home and above; git runs with `core.fsmonitor` off.
- Windows: programs under your home (scoop, npm) are found again; paths compared ignoring case everywhere;
  `C:\Program Files\…` and `/c/…` paths in Bash commands.
- Neovim older than 0.11 now says so instead of a Lua error; re-sourcing doesn't double timers.
- docs: zsh-safe macOS commands, safer update blocks (macOS and Windows), Windows TLS / PATH / SDK notes.

## 2026-11-08

Needs: **mods**, and **core** (apply `patches/herdr-core/v0.1.19`).

- herdr-core v0.1.19 now means upstream's moved tag `06793ed` (2 CI/test commits after `2e8ebb3`): `git fetch --tags --force`
  before checking it out. Built on `2e8ebb3` already? Nothing changes for you; rebuilding is optional.

- Install guides for macOS and Windows ([docs/macos.md](docs/macos.md), [docs/windows.md](docs/windows.md)),
  jay-nvim guide [docs/nvim-jay.md](docs/nvim-jay.md), this changelog, [docs/keys.md](docs/keys.md), versions table in README.
- Core patch: skip Ghostty's xcframework, so core builds with only the macOS Command Line Tools (harmless on Windows).
- jay-nvim:
  - split into `main.js` / `unix.js` / `windows.js`; every OS difference in the Lua's PLATFORM section.
  - Windows: finds Claude Code's session behind pwsh; one spelling for paths; pwsh / cmd count as shells;
    home like Claude Code; paths in Bash commands (`C:\`, `C:/`, `/c/`); the init file is `:source`d (no trouble with
    `#`, `%` or non-English user names); programs never run from the project folder.
  - Security: control characters are removed from comments sent to the agent; pyright and the TypeScript server
    (which run project code) start only in folders you trust (`:JayTrust`).
  - jay-nvim-pick sends no Esc first (could type an "o" on Windows); nvim maps the pick key in every mode.
  - Neovim 0.11 is enough (was 0.12).
  - "another nvim has this file" and `gd` compare paths correctly on Windows.
- License: Apache-2.0 for everything.
