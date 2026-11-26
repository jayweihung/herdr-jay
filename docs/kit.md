# kit in Herdr / 在 Herdr 裡用 kit

The `kit` mod (`herdr-app/mods/kit`) puts **kit** (a separate tool for the rules, skills and MCP your coding agents
use) into Herdr: a Kit button on every agent's pane, a repository panel and an Agents panel. It runs the `kit`
command and nothing else; the agents' logos it draws itself.
`kit` mod 把 kit 放進 Herdr：每個 agent 視窗上的 Kit 按鈕、倉庫面板、Agents 面板。它只執行 `kit` 指令；agent 的 logo 是它自己畫的。

| 在哪裡 | 做什麼 |
|---|---|
| 每個 agent 視窗上面的 **Kit 按鈕** | 看這個 agent 在用哪些規則、skill、MCP，加上或拿掉 |
| 上排的 **Kit** 按鈕 → 倉庫 | 看、改、新增規則、skill、MCP；改過的會在清單上面出現黃色的「有改動還沒送出」，按「送出」送出 |
| 上排的 **Agents** 按鈕 → Agents | 管 kit 做好的 agent（用哪些東西、它的 logo），用 Claude、Codex 或 omp 開起來 |

上排長這樣（Kit 和 Agents 各開各的面板，可以只開一個，也可以兩個一起開）：

```
┌─────────────────────────────────────────────────────────────────────┐
│ [分頁1] [分頁2] +                                     Agents · Kit │
└─────────────────────────────────────────────────────────────────────┘
```

Windows（和 Linux）的分頁列自己畫最小化、最大化、關閉，所以 `Agents`、`Kit` 放在分頁列的左邊，關閉鈕留在最右上角：

```
┌─────────────────────────────────────────────────────────────────────┐
│ Agents · Kit │ [分頁1] [分頁2] +                          ─  □  ✕ │
└─────────────────────────────────────────────────────────────────────┘
```

**複製**：面板和跳出視窗裡大段的文字（kit 的訊息、錯誤、說明、提示）可以用滑鼠拖曳選取，再按 Cmd+C（Windows：Ctrl+C）；名字、路徑、數字這種單一的值，按右鍵就複製，會跳出「已複製」。左鍵跟原本一樣。Mac、Windows 都一樣。

## Needs / 需要什麼

- **kit 0.3.0 or later** on this computer, and on every machine where agents run (Herdr's remote spaces: the Kit
  button asks kit **there**). How to install or update kit: see kit's own guide (at the company: from the company's
  own Git server, never from GitHub). Check: `kit api` prints `1.0` (any `1.x` works).
  要 kit 0.3.0 以上；每台跑 agent 的主機都要裝（遠端 space 的 Kit 按鈕會到那台去問 kit）。
  kit 怎麼裝、怎麼更新，看 kit 的說明（公司從自己的 Git 伺服器拿，不從 GitHub）。檢查：`kit api` 印出 `1.0`（`1.` 開頭都可以）。
- Where the mod finds kit: `kit` on **PATH** (Windows: `kit.cmd`), else where kit installs itself:
  `~/.local/bin/kit` (Windows: `%LOCALAPPDATA%\Programs\agentkit\kit.cmd`). Herdr opened from the Dock / Finder loads
  your login shell's PATH; a Linux desktop launcher may not, and a Windows PATH may not have caught up yet: the
  install folder covers both. On another machine: PATH, then `~/.local/bin/kit`, then `kit.cmd`.
  mod 先找 PATH 上的 kit（Windows 是 `kit.cmd`），找不到再找 kit 自己的安裝資料夾。
- **A layout with kit in it**: jay's layout ([layout.md](layout.md)) already has the Agents / Kit buttons, both panels
  and kit's header on every pane.
  畫面要有 kit 的位置：jay 的 layout 已經放好了。
- **kit 0.5.0** (`kit api` 1.3) for 倉庫 → MCP → 貼上設定 and for putting an agent in a space (`kit place`, on the
  space's machine). **Dragging** an agent onto a space also needs a Herdr with the drag API (`on_drag`,
  `nextDrop()`); without it the 放到 space… button does the same.
  「貼上設定」和「把 agent 放到 space」要 kit 0.5.0（那個 space 的機器上）；用拖的還要有拖放功能的 Herdr，沒有的話用「放到 space…」按鈕。

When Herdr starts, the mod first runs `kit api` (once, shared by every part, again every few minutes; the first time
it waits up to 40 seconds, since a company's virus scanner may hold kit's first start). `kit api` prints
`major.minor`: a new major means this mod can't read that kit, a new minor only adds things. Until it answers `1.x`,
the panels, the tab-bar buttons (a red `!`) and the Kit button say what is wrong instead of their content:
Herdr 一開，mod 先跑 `kit api`（第一次最多等 40 秒）。答案不是 `1.` 開頭時，面板、上排按鈕（紅色 `!`）和 Kit 按鈕會直接說哪裡不對：

| 畫面上 | 原因 | 怎麼辦 |
|---|---|---|
| 找不到 kit（Kit 按鈕：沒有 kit） | PATH 上和 kit 的安裝資料夾裡都沒有 kit／kit.cmd（別台主機：連不到，或那台沒裝 kit） | 照 kit 的說明裝好 kit；裝好還是找不到就重開 Herdr（讓它重新讀 PATH） |
| kit 沒回應（Kit 按鈕：kit 沒回應） | kit 開了，但沒在時間內回答（第一次開、防毒軟體在檢查、那台很忙） | 等一下再按「⟳ 再檢查一次」 |
| kit 太舊（Kit 按鈕：kit 太舊） | kit 沒有 `kit api`、答的是 `0.x`，或答的不是版本號 | 在那台的終端機打 `kit self-update`（要 0.3.0 以上），再按面板上的「⟳ 再檢查一次」 |
| Herdr 的 kit mod 太舊（Kit 按鈕：mod 太舊） | kit 比這個 mod 新（`kit api` 是 `2.x` 以上） | 更新 herdr-jay，重新連結或複製 `herdr-app/mods/kit`（下面），重開 Herdr |

## Install / 安裝

The one place for these steps (the macOS, Windows and layout guides link here). Coming from an older kit that
installed its own Herdr panel (`kit herdr-panel`): the CHANGELOG's 2026-11-13 entry first.
這裡是裝 kit mod 唯一的地方（其他文件都連到這裡）。以前用 kit 自己裝過面板的，先照 CHANGELOG 2026-11-13 那條做。

**macOS** (a link: `git pull` in herdr-jay updates it):

```sh
ln -sfn ~/src/herdr-jay/herdr-app/mods/kit ~/.config/herdr-app/mods/kit
herdr-app check ~/.config/herdr-app/mods/kit      # check passed
```

**Windows** (PowerShell; copy again after each herdr-jay update whose CHANGELOG says **mods** or **kit**):

```powershell
$j = "$env:USERPROFILE\src\herdr-jay"
$h = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } elseif ($env:XDG_CONFIG_HOME) { "$env:XDG_CONFIG_HOME\herdr-app" } else { "$env:USERPROFILE\.config\herdr-app" }
Remove-Item -Recurse -Force "$h\mods\kit" -ErrorAction SilentlyContinue      # the old copy: no deleted file stays behind
Copy-Item -Recurse -Force "$j\herdr-app\mods\kit" "$h\mods\"
herdr-app check "$h\mods\kit" | Out-Host       # check passed
```

`check passed` → then the layout ([layout.md](layout.md)), and quit and reopen Herdr.
先放 mod，再放 layout（layout.md），然後重開 Herdr。

**Your own layout instead of jay's**: the first time Herdr sees `mods/kit` it docks the repository panel on the right
of the layout in use (not on Herdr's own `main`, `terminals`, `win98`: duplicate one first from the command palette).
The panel then shows 「放進上排」: it puts the Agents and Kit buttons in the tab bar (after it on a Mac, before it where
the bar draws the window buttons), both panels beside the work area, and kit's header on every pane. A layout that
already has the Kit button but still an older kit's pieces (`kit-agents`, `kit-pane`) or a pane header that isn't
kit's gets 「更新版面」 instead: the same, done again. Neither ever shows on a layout that is already right (jay's).
The nodes are `kit-agents-toggle`, `kit-toggle`, `kit-panel`, `kit-agents-panel`; to arrange them by hand, these are
the blocks:
自己的 layout：Herdr 第一次看到 `mods/kit` 會把倉庫面板放在右邊，面板上的「放進上排」會把按鈕和面板放好；版面裡還有舊 kit 的東西時，按「更新版面」。要自己排的話，用這些區塊：

| What / 什麼 | Block content |
|---|---|
| repository panel / 倉庫 | `{ "mod": "kit" }` (role `repo`) |
| its tab-bar button / Kit 按鈕 | `{ "mod": "kit", "props": { "role": "repo-toggle" } }` |
| Agents panel | `{ "mod": "kit", "props": { "role": "agents" } }` |
| its tab-bar button / Agents 按鈕 | `{ "mod": "kit", "props": { "role": "agents-toggle" } }` |
| every pane's header / 每個窗格的標題列 | in the tab block: `"pane": { "header": { "content": { "mod": "kit", "props": { "role": "header" } } } }` |

The roles' older names still work (`panel` = `repo`, `toggle` = `repo-toggle`, `pane` = `agent`, the popup). A role
the mod doesn't know shows a card 「不認得的 role」 naming it: check the spelling in the layout.
舊的 role 名字還能用；打錯的 role 會顯示「不認得的 role」。

**Remove / 拿掉**: pick a layout without kit (or take kit's blocks out of yours; the pane header back to
`{ "mod": "pane" }`), then delete `mods/kit`.

### Each tab its own: start agents through kit (kit 0.17.0) / 每個分頁自己一份

With kit 0.17.0 or newer on every machine where agents run, Herdr's new-tab menu can start Claude Code, Codex and omp
through `kit open`: each tab then has its own rules, skills, MCP, plugins and Claude's memory, also when several tabs
are in one folder (`kit add --tab <tab> …` adds to one; `kit tab show <tab>` lists the tab's, the folder's and the
account's). Add to `programs.json` in Herdr's home (macOS `~/.config/herdr-app/programs.json`; Windows `$h` as above;
merge if it exists):
裝了 kit 0.17.0 以上，新分頁選單改經過 `kit open` 開，每個分頁就有自己的一份（同一個資料夾開好幾個也是）。在 Herdr 的
`programs.json` 加這段（已經有就合併）：

```json
{ "programs": {
    "claude": { "run": ["kit", "open", "claude", "--tab-env", "HC_TERMINAL_ID"], "check": "claude" },
    "codex": { "run": ["kit", "open", "codex", "--tab-env", "HC_TERMINAL_ID", "--", "--no-daemon"], "check": "codex" },
    "omp": { "name": "omp", "icon": "icons/pi.svg", "tint": true, "match": ["omp"],
             "run": ["kit", "open", "omp", "--tab-env", "HC_TERMINAL_ID"], "check": "omp" } } }
```

- `check` needs the app with patch `0034` (`herdr-app/patches/v0.1.18`): without it the menu takes kit for the agent
  and lists all three as installed. 要有 app 的 0034 補丁，選單才看 `check` 判斷有沒有裝。
- The menu starts these on remote machines' spaces too: every machine you open agents on needs kit 0.17.0
  (`kit self-update`). 別台機器的 space 也照這個開，那台也要 kit 0.17.0。
- A tab's copy goes when its tab closes: the kit mod runs `kit tab rm <tab>` on that tab's machine once its tool no
  longer runs, and when Herdr starts `kit tab keep <the terminals there>` once per machine (for tabs closed while Herdr
  wasn't running). 分頁關掉，kit mod 就在那台 `kit tab rm` 清掉它那份；Herdr 一開，每台跑一次 `kit tab keep`（Herdr 沒開時關掉的分頁）。
- With kit 0.17.0 the Kit mod uses these tabs too: the Kit popup's 「這個分頁的」, the Agents panel's 開啟 and drag
  (`kit open --agent`), and 自動重開接回 (resumed through `kit open`). Below: §1 and §3.
  Kit mod 也跟著用：Kit 視窗的「這個分頁的」、Agents 的開啟和拖到 space（`kit open --agent`）、自動重開接回（經過 `kit open` 接回）。
- Remove: take the three `run` / `check` lines out again. 不要了就把這三段拿掉。

## 1. agent 視窗上的 Kit 按鈕

每個 agent（Claude Code、Codex、omp）視窗的標題列右邊有一顆按鈕，寫著它在用幾個東西：

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ ■ Claude Code   ~/src/myproj   [Kit  規則 2  技能 3  MCP 1]  [context 35% 139k/400k]  ○ │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ >                                                                                       │
```

按 Kit 按鈕會跳出這個 agent 的清單：

在 `~/ai` 開的 agent（只能改這個資料夾）：

```
┌──────────────────────────────────────────────┐
│ ■ Claude Code              [同步] ⟳  ✕       │
│   這台電腦 · ~/ai                            │
├──────────────────────────────────────────────┤
│ 這個 agent 在用的                            │
│ ▾ 規則（2）                                  │
│   zh-tw         [Kit · 團隊必備]             │
│   CLAUDE.md        [這個資料夾]              │
│ ▾ 技能（2）                                  │
│   archify  [Kit · 這個資料夾]                │
│                          [從資料夾拿掉]      │
│   kit-hello  [Kit · 整個帳號]                │
│ ──────────────────────────────────────────── │
│ ▾ 還沒用的（3）                              │
│   humanizer             [加到這個資料夾]     │
└──────────────────────────────────────────────┘
```

在家目錄 `~` 開的 agent（只能改整個帳號）：

```
┌──────────────────────────────────────────────┐
│ ■ Claude Code              [同步] ⟳  ✕       │
│   這台電腦 · ~                               │
├──────────────────────────────────────────────┤
│ 這個 agent 在用的                            │
│ ▾ 技能（1）                                  │
│   kit-hello  [Kit · 整個帳號]                │
│                            [從帳號拿掉]      │
│ ──────────────────────────────────────────── │
│ ▾ 還沒用的（3）                              │
│   humanizer               [加到整個帳號]     │
└──────────────────────────────────────────────┘
```

- 標 `Kit · 整個帳號` 的是 kit 裝給整個帳號的，可以「從帳號拿掉」；標 `Kit · 這個資料夾` 的是只加給這個資料夾的，可以「從資料夾拿掉」；標 `Kit · 團隊必備` 的是團隊規定要有的，拿不掉。
- 標 `這個資料夾`、`這個帳號（不是 kit 的）` 的是 agent 自己讀到的（`CLAUDE.md`、`.claude/rules`、`.claude/skills`、`.mcp.json`），只顯示，不改。
- **被擋下的**（kit 0.7.0 起）：`kit sync` 不讓工具載入的東西（不是公司的，也不是 kit 放的），標 `被擋下：不是 kit 的`、在哪、哪個工具。「收進 kit」：填原本的網址就用 `kit collect <網址> --to <來源> --allow`（可以貼 skill 資料夾的網頁網址；預設收進 `agentkit-library`），不填就用 `kit new skill <名字> --from <它的資料夾> --to <來源>`（預設是另一個自己的來源），只列 `push: direct` 的自己的來源；只收不加（2026-11-22 起），收好它出現在「還沒用的」，要用再按那一列的加到…。外掛要網址；MCP 到倉庫用「貼上設定」收。舊的 kit 沒有這一段。
- **兩種加法，看 agent 在哪裡開的**（按鈕只會改到 agent 所在的地方，不會改到更大的範圍）：
  - 在一般資料夾開的 agent：只有「加到這個資料夾」「從資料夾拿掉」（`kit add --dir <資料夾>`）。加的東西只有在這個資料夾（含子資料夾）開的 agent 讀得到，整個帳號、別的資料夾、別的 agent 都不受影響。整個帳號的東西會列出來（標 `Kit · 整個帳號`），但這裡不能改。kit 會在資料夾裡放一個 `.agentkit` 記下加了哪些，再寫進各工具在專案裡會讀的地方（`CLAUDE.md`、`AGENTS.md`、`.claude/skills`、`.agents/skills`、`.mcp.json`、`.codex/config.toml`）。在子資料夾開的 agent 按，會加到上面已經有 `.agentkit` 的那個資料夾。
  - 在家目錄 `~` 開的 agent：只有「加到整個帳號」「從帳號拿掉」（`kit add`／`kit rm`）。這台電腦上你帳號的 Claude Code、Codex、omp（有裝的）和每個 agent、每個資料夾都會有或都沒有。
  - 只想給某一個 agent：請點 `kit run` 開的 agent，用它視窗裡的「加上」「拿掉」。
  - **不用先開 agent：在 space 上按右鍵**（要 Herdr app 補丁 0035，見 [patches.md](patches.md)）：左邊 Spaces 清單的 space 按右鍵，
    選單在「Close」上面多一項「Kit：~/ai」（那個 space 的資料夾，家目錄換成 `~`）；資料夾就是家目錄、或 space 沒設資料夾（那台的家目錄）的寫
    「Kit：整個帳號」；別台主機的 space 前面加主機名字，例如「Kit：server 的整個帳號」「Kit：server 的 /home/me/ai」（別台的家目錄這裡不知道，
    是不是家目錄由那台的 kit 判斷）。按了跳出跟上面一樣的清單，標題是那一行字：資料夾的只能「加到這個資料夾」「從資料夾拿掉」
    （`kit add|rm --dir <space 的資料夾>`），整個帳號的只能「加到整個帳號」「從帳號拿掉」（`kit add|rm`，不帶 `--dir`），都在那個 space 的主機上跑。
    清單是在那裡開新 agent 會讀到的（標題「在這裡開的 agent 會讀到的」）；沒有「這次用了」「同步」「這個分頁的」（這些跟某個 agent 有關）。
    加上、拿掉後跟 agent 的 Kit 視窗一樣，在那裡開著的 agent 會重新載入或問要不要重開。用的是 space 設的資料夾（新分頁開在哪），
    不是裡面的終端機現在 `cd` 到哪。Mac、Windows 一樣（選單是 Herdr 內建的 JS；Windows 的 kit 是 `kit.cmd`）。
    沒有補丁的 Herdr 沒有這一項，其他都照舊。
  - 資料夾的 MCP：Claude Code 不會每次問（kit 在 `.claude/settings.local.json` 允許它）；Codex 只在信任的資料夾讀，kit 會在 `~/.codex/config.toml` 信任這個資料夾；omp 讀資料夾的 `.mcp.json`，但只在這個資料夾本身開時（子資料夾裡開的讀不到）。Codex 在子資料夾開也讀得到，是因為 kit 在 `~/.codex/config.toml` 最上面加了 `project_root_markers`。
- **這次用了**（kit 0.6.10 起）：「這個 agent 在用的」上面一行寫這次對話到現在用了哪些 skill、MCP（不是 kit 管的也列），用過的那一列標「這次用了 N 次」，在你最後一則訊息之後用的再標「剛剛」。規則每次對話一開始就全部帶，不另外標。Claude、Codex、omp 都可以；⟳ 重新看。從 agent 自己的紀錄檔讀（`kit used`），只拿名字。
- **看用途**：每一列名字下面是一行說明（太長會被截掉）；點一下那一列（名字或說明）展開完整說明，可以選取複製，再點一下收起。規則的說明是規則檔第一行的 `# ` 標題，MCP 的是它 yaml 裡的 `description:`。有中文說明（kit 0.6.9 的 `kit describe`，翻一次存在倉裡）就顯示中文，展開時下面附原文；原文改了會改回顯示原文，等再翻。只有面板看中文，agent 還是讀原本的說明，不多花 token。
- **找和分組**：最上面有一個搜尋框（找名字、說明、從哪收的），找的時候每段都會打開。「還沒用的」先列 kit 倉裡自己寫的，
  再列從網址收來的：同一個網址收了好幾個就收成一組「▸ 收自 mattpocock/skills（39）」，點一下打開（記在這台電腦），
  只收一個的就是一行，寫「收自 作者/repo」。每個都有自己的「加到這個資料夾」，要哪個加哪個。分組看的是 agent 那台主機上倉裡的 `third_party.lock`。
- **版本**（kit api 1.14 起）：每一列名字旁邊用淡色小字寫版本：自己寫的是來源裡最後一次改到它的日期「11/21 版」（同一天改好幾次「11/21 版（3）」，改了還沒 commit 是「改了還沒送出」），收來的是原作者那個 commit 的時間「原作者 11/10 版」（問不到就寫收進來時的日期）；滑鼠停上去看完整日期、commit 訊息、指紋，收來的再加收進來的日期。這個 agent 讀的那一份不是最新的，那一列標「舊版」，下面一行寫原因和怎麼辦：
  - 「倉庫有新版（最新是 11/21 版），這台還沒換」：kit 0.13.0 起，倉庫改了不會自動換到這台（Claude 開啟時的自動同步只裝新加的、拿掉不要的）。
    按那一列的「同步這個」只換那一個（規則、技能、MCP、外掛都可以），或上面的「全部同步（N）」全部換（N 是這個 agent 有幾項在等）。
    換完照需要幫這個 agent 送 /reload-plugins 或問要不要重開接回。用 `kit hold` 固定的那一列標「固定」、不算舊版，「全部同步」也不換它，
    要換按「換成新版」，「取消固定」讓它之後跟著「全部同步」。
  - 「這次對話開始後改過（11/21 版），重開接回同一個對話才會讀到」：規則、MCP、外掛在對話一開始就讀了（omp 的外掛只有 hook 要重開；其餘打 `/reload-plugins`）。技能是「這次對話用的是舊版，開新對話才會讀到新的」（用過才算）。
  清單最上面一行總結：「全部最新」；按「同步」就能全部變新的時寫「5 項舊版：按同步」；有同步也救不了的（這次對話已經用過舊版的技能）時寫「3 項舊版：2 項按同步，1 項開新對話才會讀到」，全部都是這種時寫「2 項舊版：開新對話才會讀到」。那台的 kit 比 api 1.14 舊時只寫一次「那台的 kit 太舊，更新後才看得到版本」。root 的唯讀清單只寫版本，不標舊版。
- **「這個分頁的（關掉就清掉）」**（kit 0.17.0，`kit api` 1.22 起）：經過 `kit open --tab` 開的分頁（Herdr 新分頁選單照上面的 `programs.json`、Agents 的開啟和拖到 space），清單最上面多這一段，是 `kit tab show <分頁> --json` 的「分頁自己的」：只有這個分頁有，分頁關掉就清掉。標「<agent> 帶的」是一開始從那個 agent 開帶進來的；標「資料夾也有」「整個帳號也有」的開的時候不帶（下面那層本來就讀得到）。
  - 每一列的「拿掉」= `kit rm --tab <分頁> <種類> <名字>`，拿掉後跟整個帳號的一樣送一則訊息叫它不要再用（不關掉它）。
  - 「還沒用的」每一列多一個「加到這個分頁」= `kit add --tab <分頁> <種類> <名字>`（這時資料夾、整個帳號的按鈕變成一般顏色）。kit 說要重開才讀得到的（`restart`：Claude 的技能以外都是），照樣跳「要重開才讀得到」小視窗問一次，重開接回時經過 `kit open`，分頁那份還在。
  - 下面「另外也讀到的」是資料夾和整個帳號的，跟以前一樣。
  - kit 不認得這個分頁（不是經過 `kit open` 開的）：最上面寫一行「這個分頁沒經過 kit 開」，其他照舊。kit 比 0.17.0 舊：照舊，沒有這一段。
- 「這次啟動帶的」：用 `kit run`（或 kit 0.17.0 以前 Agents 的「開啟」）開的 agent 才有，只有這個 agent 有，關掉就沒了。要改，到 Agents 改那個 agent。這時下面的標題會變成「另外也讀到的」。經過 `kit open` 開的分頁改看上面的「這個分頁的」。
- **skill 需要的程式**：skill 要的程式（例如 archify 要 Node.js 18 以上）這台沒有或太舊時，那一項下面會出現「⚠ 需要 Node.js 18 以上（這台沒有）［安裝］」（太舊是［升級］）。按下去先顯示 kit 會執行的指令（例如 `brew install node`），按「確定安裝」才執行（就是 `kit install-tool node --min 18`）；那種裝法失敗，kit 會換配方裡的下一種。kit 沒有這台能用的裝法時，只寫「請自己裝」。怎麼看出來、怎麼加新的程式，看 kit 的說明（「skill 需要的程式」）。
- **skill 自己的套件**：skill 要先 `npm install` 或 `pip install` 才能跑時，下面會出現「⚠ 需要先裝它自己的 npm 套件［安裝］」或「⚠ 需要先裝它自己的 Python 套件［安裝］」（skill 改過、要重裝時是［更新］）。按下去先顯示要執行的指令，按「確定安裝」才裝（就是 `kit install-deps <skill> npm|pip`）：裝在 kit 自己的資料夾（Python 是自己的 venv），不跑套件自己的安裝程式。kit 不接受的寫法（`requirements.txt` 的某一行、不是 npm registry 上的版本）只寫「kit 不裝：」和原因，沒有［安裝］。
- `同步` = `kit sync`（拿來源的新版、裝上團隊必備的），而且讓**這個 agent** 也跟上：同步完再讀一次這個 agent 的清單，看每一項舊版：
  - 要打 `/reload-plugins` 的：送給它一次（它在忙就排隊，停下來才送）。
  - 要重開才讀得到的（Claude Code 的規則、MCP；Codex 的外掛、MCP；omp 的規則、帶 hook 的外掛）：跳出「要重開才讀得到」小視窗問一次（選過「以後都直接做」就直接排隊）；kit run 開的、Windows、找不到對話 id 的照舊只說「要自己重開」和原因。
  - 同步後這台還是舊的（同步沒帶來，例如被擋著或還沒核准）、這次對話已經用過舊版的技能（要開新對話）：只寫出來。
  - 同步本身已經對這個 agent 送過 `/reload-plugins` 或問過要不要重開，就不再送、不再問。
  - 做完在上面寫一行，例如「同步好了；t3：送了 /reload-plugins，要重開接回（在跳出的視窗選）」或「同步好了，這個 agent 全部最新」。
- `⟳` 只是重新讀一次畫面，不改任何東西。
- agent 開在別台主機（Herdr 的遠端 space）時，按鈕會到那台去問 kit（先問那台的 `kit api`）。**每台要跑 agent 的主機都要裝好 kit**（`kit init` 過），不然按鈕會寫「沒有 kit」或「出錯了」。
- 用別的帳號跑的 agent（例如 `sudo -i` 的 root）只會顯示「root 唯讀」，這裡看不到也不能改。
- 新加的 MCP：Claude Code、Codex 要重開才讀得到，Herdr 會問你要不要在它停下來時自動重開接回（見「加上、拿掉、同步之後」）。

按鈕上的字：`…` 還在讀；`出錯了` 點開看原因；`沒有 kit`、`kit 太舊`、`mod 太舊`（紅色）看上面「需要什麼」的表，點開也會寫怎麼辦。

**說明頁按鈕**：標題列右邊（分割、放大、關閉的左邊）多一個頁面圖示，裝了 agent-page mod、而且 agent 在這台電腦上才有：按了在這個 agent 右邊打開它的進度和說明頁，開著時圖示亮著，再按一下關掉。Agents 清單右鍵選單的「說明頁」也一樣（[agent-page.md](agent-page.md)）。

Kit 按鈕右邊的 `[context 35% 139k/400k]` 是這個 agent 的 context 用了多少（`kit context`，滑鼠停上去有提示，70% 以上變黃、90% 以上變紅，最多寫 100%）。agent 在工作時每 15 秒問一次，閒置時每分鐘一次。問不到（kit 正忙、那台連不上）時，先留著上一次的數字；還沒問到時寫「讀取中」（一亮一暗，不寫 0%）。Claude 剛 /compact、/clear 完或剛開，到它下一次回話前狀態列都說 0，這時改問 Claude Code 自己（`kit context --detail`，同一格最多 10 分鐘問一次），顯示它算的數字，問不到數字時寫「—」。那台的 kit 不能用（上面的表）時不顯示這格。右鍵複製這些數字。

**打開 context 視窗**：各部分用了多少要 kit 去問 Claude Code、再讀對話紀錄檔的尾巴，長的對話要幾秒。這段時間視窗先顯示已經知道的：
上面那格的數字和方案用量；同一個 agent 再打開時，先顯示上一次的細項（寫「下面是 N 分前的數字，正在問 Claude Code最新的…」），問到了就換掉。

**用量上限**（Claude 要 kit 0.6.5 以上，Codex 要 0.6.6 以上）：Claude 或 Codex 撞到方案的用量上限停下來（5 小時、每週，Codex 免費方案是每月），context 那格變成紅色的 `[上限 00:10 恢復]`，滑鼠停上去寫是哪一種上限。額度恢復後一分鐘，Herdr 替它打「繼續」（只打一次，只在它停著時打：閒置或做完，在工作或在問你時不打），格子先變黃 `[上限 已恢復，馬上繼續]`，打完就回到 context %，右上角跳一個通知。按那一格打開的 context 視窗最上面有「方案用量」：這個帳號 5 小時、每週用了幾 %、幾點重置，每一行下面一條比例條（主題的強調色，70% 起黃、90% 起紅，已重置的是空的；`kit usage`；Claude 的要 kit 的狀態列，Codex 的從它的對話檔讀；omp 的是 kit 0.6.7 起，照它用的模型那一家（例如 anthropic）問 `omp usage`，kit 在背景每 5 分鐘問一次；所有 agent 一起算），和「額度恢復後自動打繼續」的開關（這台電腦，預設開）。omp 撞到上限還認不出來（omp 沒留下撞到上限的紀錄可以讀）。Codex 是從它的對話檔裡最後一次的用量看出來的（`rate_limit_reached`）；工作區的額度（credits）用完沒有恢復時間，不算。

**進度**（kit 0.6.0 以上）：agent 用 `kit note "剛做了什麼；下一步"` 寫的進度在「關係」圖看：每個 agent 的方塊顯示第一行，滑鼠停上去看全部，超過兩小時變灰。窗格上方不顯示（2026-11-15 拿掉了，跟關係圖重複，又擠得只看得到半句）。窗格上方跟 context 一起問它（工作時每 15 秒，閒置時每分鐘），所以寫完最多等這麼久才出現。Claude、omp 用 kit 0.6.0 就可以；Codex 在沙箱裡要 kit 0.6.1（kit 會在 Codex 的 config.toml 開放 `~/.config/agentkit/notes` 給它寫，開著的 Codex 要重開）。要 agent 自己寫，給它 rule `progress-note`（agentkit-library 有，`kit add rule progress-note`）；這條規則也叫在 Herdr 裡的 agent 同時更新旁邊說明頁的「進度」（`status.json`，[agent-page.md](agent-page.md)）。

標題列的東西都固定寬度：context 那格、狀態那格（在等你回答是紅色「!」（滑鼠停上去寫 Needs you）、做完是圓點、工作中什麼都不顯示，只佔一個圖示寬）寬度不變，分割／放大／關閉三顆按鈕一直佔著位置，滑鼠移上去才看得到、按得到，所以滑鼠移進移出、數字變動時，標題列不會跳。

### context 細項（按 context 那格）

會跳出一個像 Claude Code `/context` 的視窗，告訴你 token 用在哪裡（`kit context --detail`）：

```
┌──────────────────────────────────────────────┐
│ ■ Claude Code 的 context      [複製] ⟳  ✕    │
│   這台電腦 · ~/src/myproj                    │
├──────────────────────────────────────────────┤
│ 已使用 61% · 243,213 / 400,000               │
│ claude-opus-5-5 · Claude Code 自己算的 · 3 秒前 │
│ ████████████▓▓▓▓▒▒░░░░░░░░░░░░░░░░░░░░▒▒▒▒  │
│ ● 系統提示                  4.0k    1.0%     │
│ ● 系統工具                  6.0k    1.5%     │
│ ○ 系統工具（延後載入）· 用到才載入（13.0k）  — │
│ ● MCP 工具                  3.0k    0.8%     │
│ ● 記憶檔                    1.2k    0.3%     │
│ ● 對話訊息                 100k    25.0%     │
│ ● 自動壓縮保留區            33.0k   8.3%     │
│ ○ 可用空間                 237k    59.3%     │
│ ┌ 怎麼省 ─────────────────────────────────┐ │
│ │ • 「Read」的呼叫和結果約 52.3k（22%）：… │ │
│ └──────────────────────────────────────────┘ │
│ ▸ 記憶檔（2）                         1.2k   │
│ ▾ MCP（依伺服器）（2）                3.0k   │
│     ▸ gerrit  2 個工具       2.5k   [拿掉]   │
│ ▸ 對話內容（依種類）（7）            100k    │
├──────────────────────────────────────────────┤
│ 距自動壓縮還有 124k（到 367k 會自動壓縮）    │
│ [壓縮] [清空重來]                            │
└──────────────────────────────────────────────┘
```

- **上面**：用了多少（%、用量／上限），是誰算的、多久以前問的。上限用 Claude Code `/context` 一樣的（`settings.json` 有 `autoCompactWindow` 就是它，例如 400k，不是狀態列的 1M）。
- **長條和各分類**：每一類一個顏色。「延後載入」的（工具用到才載入）不佔空間，寫「—」。Codex、omp 的數字前面有 `≈`：總數是工具自己記的，各分類是估的。
- **清單**（按一下打開）：記憶檔／指示檔（路徑 `~` 開頭）、Skills、MCP（依伺服器，再按一下看每個工具）、對話內容（依種類）、工具（呼叫＋結果，依工具名）、附加內容（依種類）、自訂 agents、斜線指令。多的在前。
  - kit 管的 skill／規則／MCP 有「拿掉」：跟 Kit 按鈕的清單同一套規則（在資料夾開的 agent 只拿掉這個資料夾的，在家目錄開的拿掉整個帳號的，團隊必備的拿不掉），先問一次才做。拿掉後這個 agent 要清空重來（Claude `/clear`，Codex、omp `/new`）或重開才不會再讀它。
  - 記憶檔／指示檔有「開檔」：用 kit 的編輯視窗開（只有這台電腦的 agent 才有；別台的檔案不在這台）。
- **怎麼省**：只有數字顯示有地方可以省時才出現（快滿了、某個工具的結果特別大、MCP 佔很多、記憶檔很大……）。
  Skills 佔多少不給建議：面板不知道 agent 用不用得到（細項裡看得到每個多大）。
  工具結果那條建議告一段落再壓縮：那些是 agent 記得做到哪的依據，做到一半壓縮可能忘掉細節。
- **下面**：離自動壓縮還有多少。
  - 「壓縮」：先問「確定壓縮？」；Claude、omp 可以寫一行「壓縮時要保留什麼（可空白）」，送出 `/compact <你寫的>`；Codex 的 `/compact` 不能帶文字，只送 `/compact`。
    agent 在工作中（或剛做完、自己的背景工作還在跑）也能按：先排隊，下面寫「已排隊，這輪結束後壓縮」，它停下來才送（Codex 工作中不收指令、omp 工作中收到 `/compact` 會先停掉手上的事，所以都等它停下來）；送出後寫「壓縮中…」，直到壓縮完（kit 0.7.5 的 `kit context` 說 compacted，或它做完那一輪；omp 壓縮時不回報狀態，送出 30 秒後當作好了；3 分鐘沒結束就不再等，跳通知）。
    排隊或壓縮中再按（這裡或 Herdr Agents 清單的右鍵「壓縮」都一樣，app patch 0031、0032）只會說「已經在壓縮了」，一個 agent 一次只送一個 `/compact`。
  - 「清空重來」（紅色）：問兩次（「會清掉這段對話的內容，確定？」→ 再確認一次），才送出 Claude 的 `/clear`、Codex 和 omp 的 `/new`。
  - 「清空重來」只在 agent 停下來（閒置，或剛做完）時才能按；兩顆在等你回答時都按不了；用 `hc send` 送，只送到這個 agent 的視窗。別台主機的 agent 也一樣。
    Herdr 顯示「閒置」的 agent（你看過它做完），core 有時還記成「做完」：照樣送得出去（以前用 `hc send --if idle` 會被拒）。額度恢復後自動打的「繼續」也一樣。
- `⟳` 重新問（不用 kit 留的那一分鐘）；「複製」把細項整理成文字放到剪貼簿。
- Claude 的細項要問 Claude Code 本身，最多 30 秒（不花錢、不叫模型、不跑 hook、不寫對話紀錄）；問不到時會寫原因，改顯示估算的。細節看 kit 的說明（「context 細項」）。

### 加上、拿掉、同步之後：開著的 agent 重新載入

Kit 面板（或 context 細項的「拿掉」）改了什麼，同一台電腦上有讀到它的 agent 不用重開：整個帳號的改動是那個工具的每個 agent，`--dir` 的改動是在那個資料夾或底下的。哪些種類改了：加上、拿掉看指令；同步看同步前後的 `kit list --json`（項目、版本、被擋下的）。

加上（和同步改到、加上的）：

| 工具 | skill | plugin | MCP | 規則（同步改到的） |
|---|---|---|---|---|
| Claude Code | 不用（它自己看 skill 資料夾） | 送 `/reload-plugins` | 自動重開接回（kit 寫在 `~/.claude.json`，`/reload-plugins` 不讀） | 自動重開接回（CLAUDE.md 只在開頭讀） |
| omp | 送 `/reload-plugins` | 送 `/reload-plugins`；外掛裡有 hook 時自動重開接回 | 送 `/reload-plugins` | 自動重開接回 |
| Codex | 不用（新的 skill 下一輪就看得到，試過 0.169） | 自動重開接回 | 自動重開接回 | 不用（每一輪都重讀 AGENTS.md） |

送的方式跟「壓縮」一樣：它閒置或做完才用 `hc send` 送；工作中或在等你回答就排隊（標題列寫「排隊重新載入」，共用 `reload/<位址>`），停下來才送；一個 agent 只排一個，30 分鐘沒停就取消並通知。做完後訊息多一行，例如「t1、t2 已重新載入；t4（Codex）停下來時自動重開接回；t3 要自己重開（kit run 開的要自己重開）」。加上、拿掉規則不用重開：開著的 Claude、omp 會收到一則訊息叫它去讀。

**拿掉的（`kit rm`，整個帳號或資料夾；同步拿掉的也一樣）一律不重開、不用開新對話**：開著的 agent（Claude Code、omp、Codex 都是）收到一則訊息，每種一則、名字用「、」接：
- 技能：「kit 剛從這個資料夾（或整個帳號）拿掉技能 X：之後不要再用它」
- MCP：「kit 剛從…拿掉 MCP X：之後不要再用它的工具」
- 外掛：「kit 剛從…拿掉外掛 X：之後不要再用它的技能和指令」
- 規則：跟原本一樣（Codex 每一輪重讀 AGENTS.md，不送）。

例外：拿掉的外掛裡有 hook（hook 不管訊息怎麼說都會自己跑）：Claude Code 送 `/reload-plugins`（拿掉它的 hook），omp、Codex 照原本自動重開接回。訊息的送法跟重新載入一樣（停下來才送、排隊）；做完的那行寫「t3 已告訴它拿掉了（不用關）」。用別的帳號（root）跑的不送。

- 排隊的不管那個 agent 的標題列在不在畫面上都會送：任何一個標題列每 1.5 秒看一次全部的 agent。
- 一次排了好幾則（例如重新載入和規則）就一則一則送，照順序：前一則送出 2 秒後、它又停下來，才送下一則。
- 用別的帳號（例如 root）跑的 agent 不送：它的 kit 不是這個，規則的路徑也是你的帳號的。
- 輸入框裡你打到一半的字：`hc send` 會等你送出或清掉，最多等到你最後一次按鍵後 60 秒（Herdr Core 的 `draft_wait`）；`hc get` 看不到輸入框，過了就可能打在你的字後面。

**自動重開接回**（kit mod 1.13）：上表寫「自動重開接回」的，Herdr 等它停下來，關掉再接回同一個對話（對話內容都在），它就讀到新的了。
- 先問一次（每次 kit 改動問一次，不是每個 agent 問）：跳出一個小視窗「好／以後都直接做／這次不要」。Herdr 的通知沒有按鈕，所以用視窗。「以後都直接做」記在 Herdr 的共用狀態（`kit.relaunch.auto`，Herdr 重開還在，換電腦不跟著走）；要改回先問，到那個 agent 的 Kit 視窗按「改回先問」。
- 什麼時候做：狀態是閒置或做完、沒有背景工作（`agents.busy`、`hc get` 的子 agent、Claude 的 `sessions/<pid>.json` 不是 busy）、沒有排隊或進行中的壓縮、你沒在那一格（那格是 focused 而且 Herdr 在前面就等）。30 分鐘還沒等到就取消並通知。
- 怎麼做：打它自己的結束指令（Claude `/exit` 再按 Enter 選單、Codex `/quit`、omp `/exit`），等那一格回到 shell，讀畫面上它印的接回指令（`claude <原本的旗標> --resume <id>`、`codex resume <id>`、`omp --resume <id>`），跟關之前找到的對話 id 對過（Claude：`sessions/<pid>.json`；omp：它開著的對話檔；Codex：先打 `/status` 看 Session 那行）才打進去。Claude 前面加 `env -u CLAUDE_CODE_CHILD_SESSION`。Codex 開起來跳「有新版」選單就按 Esc。
  經過 `kit open` 開的分頁（kit 0.17.0：`kit tab list` 有它）改打 `kit open <工具> --tab-env HC_TERMINAL_ID -- <接回指令後面的參數>`（例如 `kit open claude --tab-env HC_TERMINAL_ID -- --resume <id>`），分頁那份照樣在；接不回時給的指令也是這種。
- 你看到的：標題列寫「等它停下來就重開接回」→「套用 kit 的改動中… 關掉 → 接回同一個對話」→「已接回」幾秒，加一則通知「<agent> 已接回同一個對話，新的 MCP 已經可以用」。Herdr 不能在一格上面蓋一層提示，所以寫在標題列。它停下來了、但你在那一格時寫「你在這格：切到別格就重開接回」（Herdr 讀不到最後一次按鍵的時間，所以等你切走）。
- 接回後程式先問問題（Claude 的「Allow external CLAUDE.md file imports?」、信任資料夾）：不替你回答，標題列寫「接回了，在等你回答它的問題」，通知寫它問什麼；你回答、出現平常的輸入框後就算接回。
- 問要不要重開的小視窗跳出來時，Kit 視窗和用量視窗會自己關掉：Herdr 的小視窗一定在彈出視窗下面，不關會被擋住一半。
- 接不回：標題列紅字「接不回」，通知寫原因和接回指令；按「接不回」在這格再打一次，右鍵複製。**不會自己重試**（重試可能開出一段新的空對話）。Herdr 在中間重開了也一樣停下來，給你指令。
- 手機遠端（Remote Control）連著的 Claude 照樣重開接回：接回後它自己再連上。
- 不自動做、只告訴你（訊息寫「要自己重開（原因）」）：`kit run` 開的、Windows、程式關掉後那格不會留 shell 的、找不到對話 id 或對話沒存檔的。別的帳號（root）的 agent 不碰。
- 別台機器的 agent：一樣做（`hc` 用 `機器/t7` 的位址，找 id 在那台跑），還沒實測。
- 接回後，這次對話給過的「這次都允許」要再給一次。

## 2. 倉庫：看、改、新增

上排的 `Kit` 按鈕開關右邊的倉庫。這裡列出來源裡所有的規則、skill、MCP，可以直接改內容。
改的是這台電腦上來源的檔案，送出後，每台主機 `kit sync` 就會拿到（不用管是哪台主機）。

```
┌──────────────────────────────────────────────────┐
│ Kit  倉庫                             [同步] ⟳ ✕ │
│      改過規則／skill／MCP 1 個檔案，還沒送出     │
│ [my-team-source 團隊 · 送出要審]                 │
├──────────────────────────────────────────────────┤
│ [規則 5] 技能 2  MCP 1                 [＋ 新增] │
│ ┌──────────────────────────────────────────────┐ │
│ │ 找：名字、說明、來源                         │ │
│ └──────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────┐ │
│ │ 有改動還沒送出                        [送出] │ │
│ │ my-team-source：chrome-reconnect（1 個檔案） │ │
│ └──────────────────────────────────────────────┘ │
│ chrome-reconnect  [改過]                       › │
│   my-team-source                                 │
│ zh-tw  [團隊必備]                              › │
│   my-team-source                                 │
└──────────────────────────────────────────────────┘
```

點一列就打開它：

```
┌──────────────────────────────────────────┐
│ [← 回去]  chrome-reconnect  [⤢ 放大][存檔] │
│           my-team-source · rules/chrome-reconnect.md │
├──────────────────────────────────────────┤
│ 1  # Chrome 連不上                       │
│ 2                                        │
│ 3  ...                                   │
├──────────────────────────────────────────┤
│ 還沒存檔            [重新讀取][用編輯器開] │
└──────────────────────────────────────────┘
```

- **存檔**：寫回檔案。如果檔案在別的地方被改過，會擋下來，不會蓋掉別人的；先複製你改的，按「重新讀取」，再貼回去。
- **⤢ 放大**：用大視窗改，還沒存的內容會一起帶過去。大視窗可以拖，按「✕ 關掉」。
- **用編輯器開**：用這台電腦平常的編輯器打開（Mac 是文字編輯、Windows 是預設程式、Linux 是 `xdg-open`）。
- **＋ 新增 → 自己從頭寫**：打名字（小寫英文、數字和 `-`），選放在哪個倉，按「建立並打開」。
  框裡會寫出檔案會建在哪裡，例如 `~/src/my-source/skills/my-review/SKILL.md`。kit 建好起始檔案後就在面板打開它（就是 `kit new`）。
  寫完：存檔 → 清單上面黃色那條按「送出」送上去 → 要用它就在 agent 視窗上的 Kit 清單按「加到這個資料夾」（在家目錄開的 agent 是「加到整個帳號」）。
- **＋ 新增 → 從網址收別人的**（只有「技能」分頁有）：貼上別人的 repo 網址，選放在哪個倉，按「下載看看」。
  這一步只看不放：列出 repo 裡找到的 skill、授權、會執行的程式、會放到哪裡。
  沒問題就按「收進來」（就是 `kit collect`）。收的是文字檔加原作者的 LICENSE，並記在倉裡的 `third_party.lock`。
  repo 裡有好幾個 skill 時，每個前面有 ✓（勾了）／○（沒勾）／✕（不能收：沒有 LICENSE、名字不行、跟你自己的同名），
  一開始能收的全部勾好；點一下勾／不勾，下面顯示它的說明，也有「全選」「全不選」。下面一張卡片寫勾了幾個、
  其中幾個有會執行的程式、幾個是 GPL、幾個之前收過，按「收進來（N 個）」一個一個收（每個都重新下載一次），
  下面一條進度條照收了幾個填滿，寫「收進來中 12/39：名字（已收好 11 個，在下面清單）」。收好一個，下面清單「收來的」那一組（一開始就打開）就馬上多一個，
  不用等全部收完；收不了的跳過，最後列出名字和原因。收到一半 Herdr 重新載入 kit mod（有人存了 mod 的檔）或重開，
  面板會接著收剩下的（斷掉時正在收的那個排到最後），進度條照樣顯示，不用重按。
  作者還不在倉的允許清單（`kit.yaml` 的 `collect_sources`）時：
  - 你自己的倉（`push: direct`）：按鈕變成「加進清單並收進來」，會一起把作者加進清單。
  - 團隊的倉：不能收，要請維護者把作者加進清單。「下載看看」會直接說不在清單，不會去下載。
  網址的主機也要在 `kit.yaml` 的 `allowed_hosts` 裡：不在的話「下載看看」也不會去連。
  **清單怎麼顯示**：「技能」分頁先列「自己寫的」，再列「收來的（照網址分）」：同一個網址收了好幾個就收成一組
  （例如「▸ mattpocock/skills 39 個」，點一下打開／收起來，這台電腦會記得），只收一個的就是一行，寫「收自 作者/repo」。
  搜尋時每組自動打開。分組看的是倉裡的 `third_party.lock`。
  **等你放行**：送出時被 commit 前的檢查（hook）擋下，原因只是檔案本身（可以執行、檔案類型、二進位檔，例如收來的 skill 裡沒副檔名的腳本），
  面板上方出現紅框卡片「等你放行：<倉> 送出被擋，N 個檔案」，列出檔案和原因（點檔名打開看），關係圖也有一行「等你同意」（點了打開 Kit 面板）。
  按「放行並送出」：這份內容記進 `~/.config/agentkit-dev/allow.txt`，再送一次；之後檔案改了會再擋。按「不要」：不放行，改動留在這台。
  agent 送出被擋時也一樣出現在這裡，由你決定；agent 不能自己放行（Claude 有禁止規則擋那個資料夾，Codex 的沙箱寫不到）。禁用字、身分這類擋法不能放行。
  **版本**（kit api 1.14 起）：每一列名字旁邊淡色小字「11/21 版」（自己寫的，同一天改好幾次「11/21 版（3）」，改了還沒 commit「改了還沒送出」）或「原作者 11/10 版」（收來的），滑鼠停上去看完整日期、commit 訊息、指紋（收來的再加收進來的日期）。
  **原作者有新版、連不到**（kit 0.6.8 起）：面板一天問一次 `kit outdated --json`（每個收來的 skill 去問原作者的 git 現在是哪個 commit，
  記在這台電腦）。kit 0.10.2 起只有那個 skill 自己的資料夾（或原作者最上層的授權檔）真的有改才算，原作者只改了 repo 裡別的地方不算。
  「收來的」標題旁寫「原作者有 N 個新版、M 個連不到原作者」（滑鼠停在上面看幾小時前查的），那一行／那一組旁邊用淡色小字寫「原作者有新版」
  （意思是原作者那邊有比較新的，不是你這份是新的），連不到的標紅色「連不到」，關係圖也多一行（點了打開 Kit 的「技能」）。「⟳」馬上再查一次；
  「更新（N）」照 `third_party.lock` 一個一個 `kit collect <名字>` 收新版本，一次一個倉（N 是按一次會更新的數目，滑鼠停上去看是哪個倉），
  你自己的倉收好就直接送出。「連不到」是原作者的 repo 不見了、改名、改成私人，或這台連不上網；
  原作者只是把那個資料夾刪掉，要收的時候才會知道。只有你是維護者的倉才查。
  **看改了什麼**（kit 0.11.0 起，kit api 1.16）：有「原作者有新版」的那一列有「看改了什麼」，點了在下面展開 `kit outdated --diff` 的答案：
  你的是哪天的版本、原作者現在是哪天，原作者動到這個資料夾的每一次改動（日期、說明，最多列 20 次），改了哪些檔（新增／改了／刪了、加減幾行）；
  點一個檔看它的差異（加的綠色、刪的紅色，最多 150 行）。原作者的授權檔也改了會特別說。看完按「只更新這個」只收這一個（別的不動），或「收起來」。
  看過了、這次不想收：按「先不收」，現在有新版的那些改寫「原作者有新版・先不收」，關係圖不再提醒；原作者之後又出更新的一版才會再提醒。改主意按「再提醒」（記在這台電腦）。
  **收進來之後**（2026-11-15 起）：
  - 你自己的倉（`push: direct`）：收好就直接送出（`kit push`，不再按「送出」「確定送出」：「下載看看」已經看過要收什麼）。
    那個倉還有別的改動沒送時不自動送，訊息會說，請用黃色那條的「送出」一起看。
    收集和加上是兩步（2026-11-22 起，jay）：這裡只收，不加到任何地方；要用，到 agent 視窗的 Kit 清單「加到這個資料夾」或「加到整個帳號」。
    這台電腦有簽這個倉（kit 0.6.8 起 `kit list --json` 的 `sign`）時，送出後多一張卡片「要給用簽過版本的機器（例如 root）用：請簽 …」
    和「複製指令」（`kit approve <倉的資料夾> --push`）：只複製不執行，在終端機貼上，kit 會先列出改了什麼再問你。
  - 團隊的倉：跟以前一樣，用 `git diff` 看檔案 → 黃色那條的「送出」開 PR → 合併、kit sync 後在 agent 視窗的 Kit 清單加。
  - 同一個 repo 收好幾個只下載一次（kit 0.6.8 起，下載的東西照 commit 留 60 分鐘）。

- **外掛分頁**（kit 0.6.9 起）：外掛是一包 skill、hook、MCP、指令（例如 ponytail）。「＋ 新增」只有「從網址收」：跟收 skill
  一樣「下載看看」→ 看授權、會跑的程式（外掛的 hook 會在 agent 開始、送出訊息時自動跑）→「收進來」（只收）。要用，到在家目錄開的 agent 的 Kit 清單按「加到整個帳號」
  （`kit add plugin <名字>`）：kit 照 Claude、Codex、omp 自己裝外掛的方式裝（從這台簽過的那份裝，不自動更新）。
  不要的檔案（例如資訊列）面板還不能挑：用指令 `kit collect <網址> --skip <檔案>`。
  Agent 視窗：外掛只能加到整個帳號，在資料夾開的 agent 只會說「外掛只能加到整個帳號」，不給按鈕。
  Codex 的外掛 hook 要信任：簽過的版本 kit 自己請 Codex 信任；沒簽的，關係圖多一行「要你同意：… 在 Codex 打 /hooks 信任一次」。

- **＋ 新增 → 貼上設定**（只有 MCP 分頁有，要 kit 0.5.0 以上）：把別人給的 MCP 設定整段貼進框裡：README 上的 JSON
  （`mcpServers`）、`claude mcp add …`、`codex mcp add …`，或 Codex `config.toml` 的 `[mcp_servers.名字]`。名字可以不寫（用設定裡的）。
  按「看看會變成什麼」（`kit new mcp [名字] --config <檔案> --to <來源> --look`）：只列出會寫成什麼，還不寫：
  - 名字、種類（在這台跑的程式／網址）、會寫的檔案、整個 yaml。
  - token、密碼：kit 換成 `${變數名}`，畫面上只有變數的名字，值不會寫進倉、也不會顯示。每台電腦自己設環境變數。
  - 套件固定在哪個版本（沒寫版本的，kit 查今天的最新版固定下來）；kit 不幫它裝的會說原因。它要的程式（`node`、`uv`……）、kit 的提醒。
  - 設定裡有好幾個 server（或寫的名字不在裡面）：列出名字，點一個就只建那一個。名字照設定裡寫的顯示，交給 kit 的是 kit 的寫法
    （小寫，其他字元換成 `-`：`MCP_DOCKER` → `mcp-docker`），也就是建出來的名字。看不懂的設定、名字不對、已經有同名的，都會直接說。
  沒問題就按「建立」（同一個指令拿掉 `--look`），建好就在面板打開那個檔案。貼的內容或名字在「看」之後改過的話，會請你再看一次。
  接下來：「送出」→ 要用的地方「加進來」（整個帳號，或資料夾的「加到這個資料夾」）→ 有固定版本的套件，每台在 agent 視窗的
  Kit 清單按「裝套件」（`kit install-deps mcp <名字>`；沒裝的照樣能用，只是每次啟動時下載）→ 每台設好環境變數。
  **貼上的內容怎麼交給 kit**：不放在指令的參數裡（Windows 的 `kit.cmd` 會弄壞引號，參數也會被別的程式看到），而是寫進
  Herdr 自己資料夾裡的一個檔案（`<Herdr 的設定資料夾>/kit-tmp/mcp-paste.txt`），kit 一讀完（不管成功失敗）就清成空的。
  Mac／Linux 先把 `kit-tmp` 設成只有自己能開（700）、檔案只有自己能讀（600），設不成就不寫；Windows 的設定資料夾在使用者
  自己的設定檔資料夾裡，本來就只有自己（和管理員）能讀。kit 還在讀時面板被關掉（關掉 Herdr、換版面、關視窗），關掉時就清；
  連這樣都沒清到的（例如 Herdr 當掉），下次打開面板時清。清不掉時會用通知說，請自己刪掉那個檔案。

```
┌ 新增 mcp ────────────────────────────────────┐
│ [自己從頭寫] [貼上設定]                      │
│ ┌──────────────────────────────────────────┐ │
│ │ {"mcpServers": {"github": {"command": …  │ │
│ └──────────────────────────────────────────┘ │
│ 名字（可以不寫：用設定裡的名字）             │
│ [看看會變成什麼] 取消                        │
│ ┌──────────────────────────────────────────┐ │
│ │ github  在這台跑的程式  → ~/src/…  [建立] │ │
│ │ command: npx …                           │ │
│ │ 每台電腦要先設定環境變數：GITHUB_TOKEN   │ │
│ │ 套件 @…/server-github 固定在 2025.4.8 版 │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

  agent 視窗的 Kit 清單裡，MCP 那一列會寫這台沒設的環境變數（只有名字）、「每次啟動時下載 <套件>@<版本>」和「裝套件」按鈕
  （先列出 kit 會執行什麼，按「確定安裝」才裝）。

```
┌ 新增 skill ──────────────────────────────────┐
│ [自己從頭寫] [從網址收別人的]                │
│ 網址（公司內請用自己 Git 伺服器的網址）      │
│ [https://git.example.org/作者/repo         ] │
│ 放在哪個倉                                   │
│ [my-source（自己的 · 直接推）]               │
│ [my-library（自己的 · 直接推）]              │
│ [重新下載] 取消                              │
│ ┌──────────────────────────────────────────┐ │
│ │ archify  archify/     [加進清單並收進來] │ │
│ │ Create validated architecture, …         │ │
│ │ 授權：Apache-2.0                         │ │
│ │ ⚠ 有 103 個會執行的程式，送出前請看過    │ │
│ │ 會放到 ~/src/my-library/skills/…         │ │
│ │ 還不在允許清單：按下去會一起加進去       │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

- **有改動還沒送出**（清單上面黃色那條）：有改過的檔案時才會出現，寫著每個倉改了哪些。按「送出」先列出每個來源會送哪些檔案（`kit push --dry-run --json`），確認後按那個來源的「確定送出」。
- **有改動送不出去**（同一條變紅）：改過的檔案一變（收進來、新增、存了新檔），面板會自己先試一次 `kit push --dry-run`（大的倉要一分鐘左右，不必按）。`kit check` 會擋下的話，那條變紅、列出 kit 說的原因，標題寫「有問題送不出去」，被擋的那樣在清單上多一個紅色「送不出去」，關係分頁上面多一行「Kit：… 有改動送不出去」（點了打開 Kit 面板），第一次還會跳通知。改好（或把那樣移掉）、改過的檔案一變，就再試一次；改的是檔案以外的地方（例如不該公開的字清單）時，按 ⟳ 或「送出」重試。
  送出前如果檔案又變了（剛剛有存檔），會擋下來、什麼都不送，請再看一次清單。某個來源其實已經送出去了（例如 `kit add` 時已經直接推了），不會跳框，面板上只寫一行「＜來源＞：沒有要送的，已經都送出去了。」。送不出去時，訊息最前面是原因；檔案很多時只列前幾個。
  送的方式看來源的 `kit.yaml`：
  - `push: pr`（不寫就是這個，標「團隊 · 送出要審」）：開一個分支、push、開 PR，等別人審。
  - `push: direct`（標「自己的 · 直接推」）：直接 commit 到現在的分支再推，不開 PR。
- **同步**：`kit sync`。**⟳**：重新讀取畫面。
- 想在終端機先看會送什麼：`kit push --to <來源名字> --dry-run`。

```
┌──────────────────────────────────────────┐
│ 送出前看一下                      [取消] │
│ my-team-source   團隊 · 送出要審 [確定送出]│
│   skills/my-skill/SKILL.md               │
│ my-source        自己的 · 直接推 [確定送出]│
│   rules/zh-tw.md                         │
└──────────────────────────────────────────┘
```

### 各機器（倉庫的最後一個分頁）

倉庫的分頁「規則、技能、MCP、外掛」後面是「各機器」：這個 Herdr 認得的每台主機、每個帳號裝的是哪一版 kit、比最新的少了什麼，以及來源是不是核准過的版本。

```
┌ Kit ─────────────────────────────────────────────────────────┐
│  規則   技能   MCP   外掛   [各機器]                       ⟳  │
├──────────────────────────────────────────────────────────────┤
│  最新：kit 0.4.1 · 核准簽到第 7 號                             │
│  機器 / 帳號        kit     功能            核准    上次回報    │
│  ● 這台電腦  amy    0.4.1   齊全            —       剛剛        │
│  ● box  amy         0.4.1   齊全            —       剛剛        │
│  ● box root         0.4.1   齊全            #7 ✓    12 分鐘前（自己回報）│
│  ● server  amy      0.4.0   沒有：按輪分段  —       剛剛        │
│      升到 kit 0.4.1 就有   [複製升級指令]                       │
│  ● old-box          —       —               —       —           │
│      連不到 old-box，或那台沒裝 kit                             │
│  來源（這台電腦）                                             │
│  核准紀錄：第 7 號（box root 回報的）                          │
│  agentkit          e8c976e  ✓ 跟核准的一樣                      │
│  my-library        fccb4d0  ⚠ 跟核准的不一樣（核准的是 1a2b3c4）│
└──────────────────────────────────────────────────────────────┘
```

- **哪些列**：這台電腦；每台有 space 的主機，和 Herdr 連著的主機（`hc machine ls`）；`kit-machines.json` 裡寫的自己回報的帳號（下面）。只有這個 Herdr 認得的主機：公司的 Herdr 只會看到公司的主機。什麼都沒寫死。
- **怎麼問**：跟 Kit 按鈕一樣，到那台去跑 kit（Mac／Linux 用 sh 找 `kit`，Windows 用 `kit.cmd`），每台同時問，每台最多等 20 秒。先問 `kit status --json`；那台的 kit 還沒有這個指令（舊版）時，改問 `kit api` 和 `kit --version`，這時「核准」和「來源」是「—」。連不到、沒裝 kit、沒回應的那一列是灰的，下面寫原因；Herdr 已經知道沒連上的主機不會去問。
- **只在打開這個分頁時才讀**，不會讓 Kit 面板變慢。讀到的會留著，10 分鐘後（還開著這個分頁時）或按右上的 ⟳ 才再讀。
- **功能**：跟最新的那一列比。一樣新就是「齊全」；比較舊的，用黃字直接寫少了什麼（「沒有：按輪分段」，好幾個用「、」接），下面一行寫「升到 kit 0.4.1 就有」和「複製升級指令」。哪一版有什麼，是 mod 裡的一張小表（`machines.js` 的 `FEATURES`，照 `kit api` 的版本比，畫面上不顯示這個號碼）：

  | 功能 | 要 kit |
  |---|---|
  | Kit 面板 | 0.3.0 |
  | agent-files 清單 | 0.4.0 |
  | 按輪分段（agent-files） | 0.4.1 |

  最新的 kit 比這張表還新時，寫「kit 0.5.0 的新功能」。
- **複製升級指令**：只放到剪貼簿，**不會執行**。Mac／Linux 是 `kit self-update && kit sync`，Windows（那台用 `kit.cmd` 跑 kit 時）是 PowerShell 的 `kit self-update; if ($?) { kit sync }`。伺服器上的升級，先問過那台的主人。
- **核准**：那個帳號用簽過的版本（`kit approve`，例如 root）時，寫它的核准紀錄是第幾號；它回報的每個 commit（kit 本身和每個來源）都等於核准的就加 ✓，有不一樣的是 ⚠，簽章不對是紅字「簽章不對」。不用核准的帳號是「—」。
  最上面「核准簽到第幾號」只看直接問到的機器；回報檔是那個帳號自己寫的（能寫那個檔案的人都能寫任何號碼），所以只有在沒有任何直接問到的機器有核准時才用它，並標「（自報）」。
- **上次回報**：問到的時間；自己回報的帳號是回報檔裡寫的時間（超過兩天變黃）。
- **來源（這台電腦）**：這台的 kit 本身和每個來源現在的 commit，跟核准紀錄比（這台自己有用核准就用這台的，不然用直接問到的機器裡核准號碼最新的；都沒有才用回報檔的，標「（自報）」。Windows 的 kit 沒有自己的核准，所以一定是別台的）：「✓ 跟核准的一樣」、「⚠ 跟核准的不一樣」，沒有核准紀錄時是「—」。mod 不跑 git，所以只說一不一樣，不說誰比較新。
- 名字、commit 按右鍵就複製。

#### 自己回報的帳號：`kit-machines.json`

有的帳號 mod 沒辦法去問（例如伺服器上的 root：mod 只用你的帳號跑 kit，**從不用 sudo 或別的帳號**）。那個帳號可以自己把 `kit status --json` 的輸出寫到一個你的帳號讀得到的檔案，mod 再去讀那個檔案。要讀哪些，寫在 Herdr 設定資料夾裡的 `kit-machines.json`（`~/.config/herdr-app/kit-machines.json`，Windows `%USERPROFILE%\.config\herdr-app\kit-machines.json`；有設 `HERDR_APP_HOME` 就在那裡）。沒有這個檔案就沒有這些列。

```json
{
  "reported": [
    { "label": "box root", "machine": "box", "file": "/path/to/kit-status.json" },
    { "label": "這台的另一個帳號", "machine": null, "file": "/path/to/other-account-status.json" }
  ]
}
```

- `label`：畫面上的名字（60 字以內）。`machine`：檔案在哪台（Herdr 的主機名字，跟 space 的一樣），`null` 是這台電腦。`file`：那台上的檔案路徑。
- 只讀這個 Herdr 認得的主機；不認得的那一列是灰的，寫「這個 Herdr 不認得 …，不讀」。最多 20 筆，缺 `label` 或 `file` 的不用（畫面上會說有幾筆沒用）。
- 讀的方式：Herdr 的 `readTextFile`（到那台去讀，跟開檔一樣），**只讀、不執行**，不跑 shell。超過 64 KB、不是 JSON、不是下面的格式，都不用，那一列寫原因。
- 那個帳號什麼時候、寫到哪裡，由那台的主人自己決定（例如排程定時跑一次）；mod 不管、也不幫它寫。

#### 回報檔的格式

就是那個帳號自己跑 `kit status --json` 的輸出（kit 的 README「給程式讀的介面」）：

```json
{
  "kit": "0.4.1",
  "api": "1.2",
  "user": "root",
  "at": 1763000000,
  "self": {"name": "agentkit", "commit": "<40 個字的 commit>", "approved": "<commit 或 null>"},
  "approvals": {"serial": 7, "used": 7, "valid": true},
  "sources": [
    {"name": "team", "source": "<網址或資料夾>", "dir": "<資料夾>", "commit": "<commit 或 null>", "approved": "<commit 或 null>"}]
}
```

mod 只用這些欄位，每個都先檢查：`kit`（版本）、`api`（`major.minor`）、`user`、`at`（Unix 秒數，「上次回報」）、`self` 和 `sources[]` 的 `name`／`commit`／`approved`（commit 要是十六進位的字）、`approvals` 的 `serial`／`used`／`valid`（不用核准是 `null`）。其他欄位都不看。

## 3. Agents：做好的 agent

上排的 `Agents` 按鈕開關右邊的 Agents 面板（和倉庫一樣是獨立的面板，不在倉庫裡面；layout 裡沒有 Agents 面板時，按鈕會開一個 Agents 視窗）。
有改過還沒送出的 agent 時，按鈕旁邊會有一個小點。
這裡是來源裡 `agents/` 的 agent，每個是一組挑好的規則、skill、MCP 加上提示。

```
┌──────────────────────────────────────────┐
│ Agents                              ⟳ ✕ │
│        2 個 agent · 用 kit run 開        │
├──────────────────────────────────────────┤
│ (熊)  hello                            › │
│       測試用 agent · my-team-source      │
│       規則 1 · 技能 1 · MCP 0            │
│ (狗)  ping   [改過]                    › │
│       ...                                │
└──────────────────────────────────────────┘
```

每個 agent 都有一個 logo：可愛的動物機器人頭。10 種動物各有自己的原色和特徵（貓的虎斑、兔子折下來的耳朵、青蛙的皇冠、
熊貓頭上的竹葉……），也可以換成 10 種顏色之一。agent 檔裡沒寫 `bot:` 的話，會照名字挑一隻（原色），每台電腦都一樣。

點一個 agent：

- 看它用了哪些規則、skill、MCP，「拿掉」或從「加上…」裡加（就是 `kit agent <名字> add|rm ...`，改的是來源裡的 agent 檔）。
- 改完一樣回倉庫，按清單上面黃色那條的「送出」。
- 選 Claude、Codex 或 omp，按「開啟」，會在新分頁用 `kit run <名字> --tool ...` 開起來。這只影響這次開的 agent，不改你的設定檔。
  這台是 kit 0.17.0（`kit api` 1.22）以上時改用 `kit open <工具> --agent <名字> --tab-env HC_TERMINAL_ID`（Codex 加 `-- --no-daemon`）：
  新分頁一開始有那個 agent 的規則、技能、MCP、提示，之後在它的 Kit 視窗「這個分頁的」加或拿掉，分頁關掉就清掉。
- 「編輯檔案」可以直接改 agent 檔（提示、說明）。
- 上面的大頭是即時畫的：點進來、換 logo 或點它一下，它會轉頭、眨眼打招呼。
- 「換 logo…」：選動物、顏色（「原色」是那隻動物自己的顏色），或按「隨機」。選了就寫進 agent 檔開頭的
  `bot: <動物>` 或 `bot: <動物> <顏色>`（例如 `bot: fox`、`bot: fox sky`），跟其他改動一樣按「送出」或 `kit push`。
  「照名字」會拿掉這一行，換回照名字挑的。
- logo 是 mod 用 Zdog 自己畫的，不用裝任何東西。清單上的小圖是 SVG，每種組合只寫一次，存在 `~/.config/herdr-app/data/kit/bots/`。

### 把 agent 放到 space（kit 0.5.0 以上）

**kit 0.17.0（`kit api` 1.22）以上**（看的是那個 space 的機器）：不建資料夾、不跑 `kit place`，直接在那個 space 開新分頁跑
`kit open <工具> --agent <agent> --tab-env HC_TERMINAL_ID`（Codex 加 `-- --no-daemon`；那台的 kit 是 `kit.cmd` 時經過
`cmd.exe /d /c kit.cmd`），開在 space 自己的資料夾（沒有就是那台的家目錄）。這個分頁有自己一份那個 agent 的東西，分頁關掉就清掉。
「一個 space 只開一個」改看那台的 `kit tab list --json`：那個 agent 的分頁、工具還在跑（`live`）、而且那個終端機在這個 space，
就切到那一格（`task` 照樣用 `hc send` 送給它）。拖的時候變淡的 space 照最近一次讀到的 `kit tab list`（這台在 Agents 面板每次重讀時一起讀；
別台在放過一次之後才知道）。下面是比較舊的 kit 的做法，拖、按鈕、位置、logo、別的 mod 叫它放都一樣。

讓一個 space 裡有一個「就是這個 agent」的資料夾：在那裡開的 `claude`、`codex`、`omp` 就是它（它的規則、skill、MCP、提示、
工具限制），不用每次 `kit run`。

- **拖過去**：把 Agents 面板上的 agent 拖到 Agents 或 Spaces 面板的某個 space 上放開。要有拖放功能的 Herdr
  （herdr-app 的 drag 修改：元素的 `on_drag`、`nextDrop()`）；舊的 Herdr 沒有，就只有下面的按鈕，其他都一樣。
- **放到 space…**（只有不能拖的舊 Herdr 才有）：agent 那一列或它的詳細頁按「放到 space…」，從列出的 space 裡點一個。
  能拖的 Herdr 不顯示這個按鈕：拖的時候看得到放在哪裡、哪個 space 不收。
- 接著在那個 space 的機器上跑 `kit place <agent> <space 的資料夾>/<agent> --tool <工具> --json`：在 space 的資料夾裡建
  `<agent>` 這個資料夾（只建最後一層），放進它的東西。space 沒有資料夾的話是那台的家目錄。Windows 的機器用 `\`。
  工具是 agent 詳細頁選的（Claude、Codex、omp；沒選是 Claude）。
- kit 做好後，在那個 space 開一個新分頁，在那個資料夾跑 kit 給的指令（就是 `claude`、`codex` 或 `omp`；Herdr 的
  `tab.new`，帶 `space`、`folder`、`argv`）。Codex 會補上 `--no-daemon`（kit 給的只有 `codex`）：Herdr 裡的 Codex 要這樣開，
  不然它的指令在 Codex 共用的背景服務裡跑，不在 Herdr 的終端機裡。進度和結果用通知說；kit 的提醒（例如 Codex 擋不到的工具限制）也會列出來。
- **它自己的 logo**：那一格在 Herdr 的清單（左邊 Agents 欄等）顯示這個 agent 的機器人頭像，不是 Claude／Codex 的圖示
  （`tab.new` 多帶 `icon`，圖檔是 Kit 寫在 Herdr 資料夾裡的 `data/kit/bots/…svg`）。要有 icon 修改的 Herdr
  （herdr-app 的 `0003` patch）；舊的 Herdr 不認得 `icon`，分頁照開，只是用程式的圖示。
- **一個 space 只開一個**：那個 space 裡已經有 agent 在 `<space 的資料夾>/<agent>`（或底下）跑著，再放一次不會多開，
  只切到那一格，Agents 面板寫一行「已經在 … 開著了」（不跳通知）。要它的資料夾重新照 agent 檔同步：`kit sync`。
  拖的時候就看得出來（herdr-app 的 `0004` patch）：拖到它已經開著的 space 上，那一列變淡、跟著游標的小標籤變成
  「… 已經在這個 space 開著了」、游標變成禁止符號，放開也不會做任何事。舊的 Herdr 拖的時候看不出來，放下去才切到那一格。
- **放在哪個位置**（herdr-app 的 `0005` patch）：Agents 面板（依 space 分組）裡，space 的標題和底下每一列 agent 都能放，
  拖過去時那一列下面有一條線：放在標題 = 排第一個，放在某一列 = 排在它後面，新分頁會移到那裡。Spaces 面板的 space 列：
  排最後。群組裡的 agent 也能直接拖來排順序（只能在同一個 space 裡）。
- **別的 mod 也能叫它放**：Gerrit 面板按問題但還沒有 Gerrit agent 時，請 Kit 按鈕把 gerrit 放進目前的 space，問題當第一句話
  帶進新分頁（`tab.new` 的 `task`）；那個 space 已經開著 gerrit 的話，切到那一格、用 `hc send` 把問題送給它
  （[docs/gerrit.md](gerrit.md) §7）。共用的 `kit.place.ask` 每筆可以多帶 `task`。
- 那裡已經是別的 agent 的資料夾、或已經有不是 kit 放的東西時，kit 不會動它，通知會說原因。那台的 kit 太舊（沒有
  `kit place`）也會直接說。
- 之後在那裡開的 agent 的 Kit 清單按「加到這個資料夾」／「從資料夾拿掉」，只改這個資料夾。拖好幾個 agent 就是好幾個資料夾。
- 從 Agents **視窗**放的，交給分頁列上的 Agents 按鈕去跑：放了之後馬上關掉視窗也照樣做完。版面裡沒有那個按鈕時由視窗自己跑；
  這時、或是跑的那一份（面板、按鈕）在 kit 跑到一半被關掉時，會說「視窗關了，分頁沒開：再放一次（kit place 可以重跑）」，
  其他按鈕也不會被卡住變灰。

### 關係：現在在跑的 agent 誰跟誰在傳話

Agents 面板上方有兩個分頁：「定義」是上面那些做好的 agent，「關係」是**現在正在跑的** agent（不管是 kit run 開的、
還是自己在終端機打 `claude`／`omp`／`codex` 開的，只要它回報狀態就算），畫成一張圖：

```
 web                              srv · box
┌──────────────────────┐ 4 次·剛剛 ┌──────────────────────┐
│ 前端            3m ◌ │──────────▶│ server          1m ! │
│ claude · Opus 5.5    │           │ codex · gpt-5.5      │
│ 改 parser；下一步…    │           │                      │
│                      │           │ 等你允許 3 分         │
└──────────────────────┘           └──────────────────────┘
```

- **跟左邊 Agents 清單對得起來**：一個 space 一欄，欄名就是 space 名（在別台機器上的，後面寫機器名），欄的順序、
  欄裡卡片的順序、卡片的名字，都跟左邊清單（依 space 分組）一模一樣，用的是同一套取名規則（有取名的分頁用分頁名，
  不然用 agent 自己的標題）。卡片右上的時間（`5m`、`22h`）和狀態圖示（轉圈是工作中、`!` 是等你、實心點是做完、
  空心圈是閒著）也跟清單一樣。
- **卡片**：一個 agent。第一行是名字（它自己開的子 agent 有在跑時，後面多一個「子 2」）、多久沒變、狀態圖示；第二行是哪個 CLI、哪個模型、context 用了幾 %（標題列問
  `kit context` 得到的，所以要它的分頁開過；80% 起變黃、90% 起變紅）；第三行是它自己寫的進度（`kit note`）；
  第四行是要注意的狀態（等你多久、做完等你看、閒置可以關了、連不到）。
- **線**：誰用 `hc send` 傳話給誰。箭頭指向收的那一方，越亮越新（10 分鐘內最亮，1 小時以上變淡），越粗次數越多，
  線上寫「幾次 · 多久前」。虛線是誰用 `hc run` 開了誰。兩邊互傳時是兩條分開的線。同一欄的兩張卡片之間，線從右邊繞出去；
  隔了一欄以上的，線從卡片之間的空隙繞過去，不會壓在別的卡片上。
- **放大**：右上「放大」開一個大視窗（螢幕的九成），整張圖一次看得到；範圍跟著面板目前選的。
  寬度有剩的時候（大視窗、寬的面板），多的空間分給卡片之間（一欄之間最多 240，列之間也跟著拉開），線和線上的字不會擠在一起。
- **點一張卡片**：跟左邊 Agents 清單一樣，切到那個 agent 的格子；同時圖上它的線變明顯，其他的變淡，下面一條一條寫出
  它傳給誰、收到誰的，幾次、多久前、最後一則的第一行（右鍵複製）。不在圖上的（別的 space、不是 agent 的 terminal）
  也列在這裡。點圖上空白的地方取消。它自己開的子 agent 也列在這裡：「子 agent：find the parser（Explore） · 在跑 · 開始 2 分前 ·
  正在：Read：src/parser.rs」（正在做的那一步，每 15 秒從子 agent 自己的對話紀錄最後一段讀）。滑鼠移到卡片上的「子 2」也會跳出同一份清單。
  Claude Code 的子 agent 要在 settings.json 加 reply hook 的 SubagentStart／SubagentStop 兩段
  （[nvim-jay.md §7a](nvim-jay.md#7a-the-reply-hook-answer-the-agents-that-asked-optional--回覆檢查選用)）。
  **omp 和 Codex** 不用裝東西：面板每 15 秒在那台機器上用 `sh` 讀它們自己的檔案（Windows 本機用 Windows PowerShell）。
  omp 從 `~/.omp/agent/terminal-sessions/<終端機>` 找到它的對話檔，子 agent 是旁邊同名資料夾裡的 `<名字>.jsonl`
  （任務、做完沒、正在做的那一步）；Codex 用 `lsof`（Linux 用 `/proc`）看它開著的 rollout 檔，子 agent 是最近 30 分鐘、
  `parent_thread_id` 接到它的那些 rollout（名字是 Codex 給的暱稱，說明是 `agent_path` 的最後一段）。
  Windows 本機沒有終端機名字也查不到行程開著哪些檔，改用它的資料夾（Herdr 記的 cwd）找：omp 是那個資料夾的 session 資料夾裡
  最新的對話檔，Codex 是最近 7 天裡 `cwd` 是那個資料夾、沒有 `parent_thread_id` 的最新 rollout。同一個資料夾開兩個 omp
  （或兩個 Codex），只看得到最新那個的。
- **範圍**：「這個 space」只畫目前的 space；「全部 space」畫全部。選的分頁和範圍會記住。
- **上面的提醒**（有才出現，點一下切到它說的那個 agent）：
  - **還沒回**：A 傳給 B 的次數比 B 傳給 A 多（一問一答剛好打平：回覆的那一方不算在等），A 最後那句之後，B 已經停下來
    （處理完那一輪）卻沒有回 A。線變紅，寫「還沒回 · 12 分」。B 還在工作中就不算（它在處理）；A 自己又去做別的事
    （工作中）也不算在等。B 停下來之後 A 又動過（又開始工作、傳話給任何人，或本來就在工作、又做了超過 1 分鐘才停），也不算在等：A 已經用別的方式拿到結果
    （例如看 B 的畫面、別人轉告），沒有在乾等。A 最後那句的第一行寫了「不用回」「不用再回」「不必回」或 `[FYI]`，也不算在等
    （通知、確認、報告這種）。除此之外看的是誰傳給誰幾次、狀態什麼時候變，不看內容，所以只是提醒。
  - **提醒它回**：還沒回、或卡住的那一串最後是「停了沒回」時，那行右邊有「提醒它回」。按了會在 B 的格子打一句
    「[Herdr 提醒] 你還沒回 A 傳給你的訊息（開頭：…）。要回就用 hc send 回給它…；不用回的話不必理會」，
    只在 B 停著（閒著或做完）時才打（在工作或在等你按允許時不打），同一則只能按一次（按過變「已提醒」）。
    Claude Code 的 agent 可以裝 reply hook（[nvim-jay.md §7a](nvim-jay.md#7a-the-reply-hook-answer-the-agents-that-asked-optional--回覆檢查選用)），
    在它要停之前就先提醒它回，大多不用等到這裡。
  - **卡住**：一串 agent 一個等一個（傳了話、停下來等），一路追到最後一個：它在等你處理（例如等你按允許）或停了沒回，
    寫「卡住：前端 → review → server，server 在等你處理」。繞回自己就是 **互等**。整串卡片上色：最後一個在等你處理是
    等你的顏色；停了沒回或互等是另一個顏色（主題的洋紅 ansi5，Herdr 預設主題看起來是淡紫），按「提醒它回」可能就解開。
    還沒回的那條線也是這個顏色。
  - **同一個資料夾**：兩個 agent 同時在工作，又在同一個資料夾（或一個在另一個裡面），框成黃色（只有框，不整張上色：
    不是輪到你，只是提醒可能互相改到）。各自在自己的 worktree、
    在不同機器、或只是在家目錄的不算；停下來就消失。
  - **等你處理**：agent 在等你（要你允許、在問你、要登入）時，一開始就在最上面列一行，帶著它問的內容（程式跟狀態一起回報的
    那句）：「server 在問你 50 秒：「要選 A 還是 B？ (A · B)」」，卡片也上等你的顏色、第四行寫「在問你 50 秒」；超過 10 分鐘
    變紅，那行變成「server 在問你已經 12 分：「…」」。卡住那一串的最後一個在等你，就寫在卡住那行，不重複。
  - **等你簽／等站長同意**：kit 的核准清單有新 commit 還沒核准（`kit status --json` 的 `pending`，kit api 1.6 起；
    用核准紀錄的帳號例如 root，從它的回報檔讀，就是 Kit 面板「各機器」讀的那些），或有 agent／服務用
    `kit pending add` 登記在等你同意，一個一行：「等你簽：agentkit 有 3 個新 commit 等核准（box root，等了 2 小時）。
    簽章在 Mac 親手做」。這裡只提醒，沒有簽章或同意的按鈕；點「等你簽」那行打開 Kit 面板的「各機器」分頁。
    這台電腦已經簽了那個 commit（kit 0.6.8 起）、只是那邊還沒 kit sync 時，那行變灰，寫「已簽（serial 19）：…，等 box root 同步」。
    每 10 分鐘重新問一次各機器（關係分頁開著時）；
    kit 比 0.6.3 舊的機器沒有這一項。
    「等站長同意」會找出是哪個 agent 在等：`kit pending add` 記下 agent 的程式（pid）和它上面的程式（kit 0.6.8 起，`up`），面板到那台問 Herdr
    哪個終端機在跑它（終端機自己的程式在 `up` 裡也算：用 `sudo` 開的 root 服務也找得到），
    那行就寫它的名字「等站長同意：升 kit（Claude Code · box，等了 51 分）」，點一下跳到它的卡片；
    它的卡片也整張上色（跟等你處理一樣：一開始橘、10 分鐘後紅），寫「等站長同意 51 分」，不會再是一般的做完藍色。
    在這台電腦上 `kit pending add` 的（要你自己同意或動手的事，例如自己 build）寫「等你同意」，不寫「等站長同意」；
    就算你正在看那個終端機，卡片也照樣上色。
    等同意的清單另外常常重讀：這台電腦每 5 秒、其他機器每 15 秒（各機器的其他資料還是 10 分鐘），
    所以記下或拿掉後幾秒內卡片就變色，跟卡片上的進度文字（每 15 秒）差不多同時。
    你點去看某個 agent、回了它、或它開始／停下來，卡片和左邊側欄在半秒內就跟著變。
  - **做完等你看**：做完了、你還沒去看過的（Herdr 的「做完」，你點進去看過就變成閒著），列成一行，卡片寫「做完 · 等你看」。
    有裝 reply hook（[nvim-jay.md §7a](nvim-jay.md#7a-the-reply-hook-answer-the-agents-that-asked-optional--回覆檢查選用)）的
    Claude Code agent，會寫出它停下來時最後說的話：最後一段裡最後一句問句（有「？」），沒有問句就是最後一行。
    沒有 reply hook 的，用 Claude Code 自己跟狀態一起回報的那一句摘要（herdr-core 紀錄裡的 `status.msg`）。
    omp 和 Codex 一樣挑法，從它們自己的對話檔最後一段讀（跟讀子 agent 同一次）。
    卡片第四行寫「做完：測試都過了」，上面也單獨一行「t63 做完等你看：「…」」，點卡片下面的說明也有整句。
  - **問你**：做完了、而那句話是在問你（有「？」，或「跟我說」「回我」「要不要」「你決定」「…嗎」這類問法，例如
    「要推的話跟我說。」；「之後想改再跟我說」「有需要隨時告訴我」這種收尾客套話，和「機器到了跟我說」「你那邊裝好再告訴我」這種等事情發生了再說的不算），就當成在等你回答：卡片整張上色（跟等你處理一樣，一開始橘、10 分鐘後紅），寫「問你：要推的話跟我說。」，
    上面單獨一行「t63 問你（3 分）：「…」」排在最上面，Herdr 左邊的 Agents 側欄也顯示 Needs you（app patch 0010）。
    跟做完等你看不同：**你正在看它時也照樣上色**，你點進去看過（Herdr 變成閒著）也一樣，等你回了、它開始工作才消失；
    在問你的不會列成「可以關了」。
    這一輪結束了、但它自己的工作還在跑（在背景跑的指令，例如測試；或它開的子 agent），就不算輪到你：
    卡片右上轉圈、第四行寫「背景工作中：pwsh tests/run.ps1」，不列在這裡。背景跑完、它真的停下來，才變成做完等你看。
    背景指令每 15 秒看一次：
    - Claude Code：在那台機器上用 `ps` 看那個 agent 底下、讀它 shell-snapshots 的 shell（Windows 本機還看不到）。
    - Codex：用 `ps` 看它底下的 `zsh -lc <指令>`（它的 background terminal，`/ps` 列的那些；Windows 本機還看不到）。
      Herdr 自己看到 Codex 畫面上「1 background terminal running」時通常已經算工作中，這裡補它沒看到的時候。
      Codex 要用 `codex --no-daemon` 開（Herdr 的選單和 Kit 面板放 agent 時都會加），不然指令在 Codex 共用的背景服務裡跑，看不到。
    - omp：它的背景工作（bash 的 `async: true`，`/jobs` 列的那些）在 omp 自己裡面跑，沒有行程可看，改讀它的對話檔：
      開始了（`async` running）、還沒送回結果（`async-result`）、沒被取消、沒超過它的時限（預設 600 秒；時限 0 最多算 6 小時），
      就算還在跑。跟讀子 agent 同一次，Windows 本機也有。omp 自己預設會等背景工作（畫面寫 Waiting for background job），
      這時 Herdr 本來就算工作中；按 Esc 不等了，它才停下來，這裡才派上用場。
  - **撞到用量上限**（kit 0.6.5 起，Claude Code）：agent 停在方案的用量上限時，卡片和最上面一行寫「t63 撞到 5 小時上限，00:10 恢復」
    （等你處理的顏色）。時間到了、還沒繼續：變深紅，寫「已恢復（00:10），還沒繼續：去打「繼續」，或在 context 視窗開自動繼續」；
    自動繼續已經替它打了「繼續」：寫「已恢復，已自動繼續」，它開始工作就消失。撞到上限的不會列成「可以關了」。
  - **要你處理的卡片會上色**：在等你（等你允許、在問你、要登入，一開始就算）或做完等你看的卡片，框加粗、整張帶一點
    那個顏色（等你是等你的顏色，做完是做完的顏色；等超過 10 分鐘變紅、而且整張顏色深很多，上面那行也加粗加底；
    很多主題的「等你處理」和「等太久」根本是同一個紅（例如 atom-one-dark 都是 #e06c75），所以靠深淺分；卡住的一串見上面）。**整張上色＝輪到你**，
    其他的（同一個資料夾）只有框。**工作中**（或做完但背景還在跑）的卡片，框會慢慢一亮一暗，看得出它在動、但不是輪到你
    （Herdr 原生動畫，不用計時器，不耗電）。圖上面有一行小圖例寫「整張上色」的每個顏色（兩種框不列）。
  - **context 快滿**：context 用到 80% 以上，一個一行「X 的 context 用了 85%，快滿了：先請它寫 HANDOFF.md，再開新的接手」
    （90% 起變紅）。
  - **可以關了**：閒著超過 30 分（做完但你還沒看的不算）、沒有人在等它、不是它開出來的 agent 的上層、也不是你正在看的，卡片變淡、
    寫「閒置 40 分 · 可以關了」，上面一行列出全部。**只是提醒，不會自動關**；要關就到它的分頁關。
- **斷線**：連不到的機器（Herdr 連不上它的 core），它的欄名變紅、寫「斷線 3 分」，卡片變淡、寫「連不到」，
  看到的是斷線前的樣子。
- **時間軸**（右上「時間軸」）：一個 agent 一條，色條是狀態（工作中、等你、做完、閒著），箭頭是一次傳話（從誰到誰、
  什麼時候），白點是寫了進度（游標停上去看內容）。可以看最近 15 分、1 小時、6 小時。資料是 Agents 按鈕在 Herdr
  開著時每 2 秒比對一次（`events.js`），存在這台電腦上一天（最多 5000 筆，重開 Herdr 還在）；Herdr 沒開的時候記不到。
- **要什麼**：傳話紀錄是 herdr-core 的 `0001` patch 記下來的（[patches.md](patches.md)），沒有它圖上只有卡片、沒有線
  （下面會說）。即時更新要 herdr-app 的 `0008` patch，沒有的話要等 app 重新讀 terminal 清單才會看到新的線。
  遠端機器（Linux 伺服器）上的 agent 互傳，要那台的 herdr-core 也有這個 patch；從這台傳過去的，這台自己就記得。
  Mac、Windows、Linux 都一樣（core 的改動沒有任何跟系統有關的部分，面板是同一份 JS）。

## 指令對照

| 畫面上 | 等於打 |
|---|---|
| Herdr 一開（每台主機一次，之後每幾分鐘）、「⟳ 再檢查一次」 | `kit api`（要印出 `1.x`） |
| 視窗按鈕的清單 | `kit list --json --dir <資料夾> --pid <行程>` |
| 加到整個帳號／從帳號拿掉 | `kit add` ／ `kit rm` |
| 加到這個資料夾／從資料夾拿掉 | `kit add --dir <資料夾>` ／ `kit rm --dir <資料夾>` |
| space 右鍵「Kit：~/ai」／「Kit：整個帳號」的清單 | 在那個 space 的主機上 `kit list --json --dir <space 的資料夾>` ／ `kit list --json`；加上、拿掉同上兩行 |
| 安裝／升級（skill 需要的程式） | `kit install-tool <程式> [--min 版本]` |
| 安裝／更新（skill 自己的套件） | `kit install-deps <skill> [npm\|pip]` |
| 窗格上方的 context 35%（每 15 秒，閒置時每分鐘） | `kit context --pid <pid> --tool <claude\|codex\|omp> --dir <資料夾>` |
| 按 context 那格（細項） ／ 它的 ⟳ | `kit context --pid <pid> --tool <工具> --dir <資料夾> --detail` ／ 再加 `--fresh` |
| 關係圖的進度（窗格上方跟 context 一起問） | `kit note --pid <pid> --json` |
| 細項的「壓縮」／「清空重來」 | 在那個 agent 打 `/compact [要保留什麼]` ／ `/clear`（Codex、omp：`/new`），用 `hc send` |
| 細項的「拿掉」 | `kit rm <種類> <名字>` ／ `kit rm --dir <資料夾> <種類> <名字>` |
| 同步 | `kit sync`（前後各一次 `kit list --json`，比出哪些種類改了） |
| 加上、拿掉、同步之後 | 在讀到它的 agent 打 `/reload-plugins`，用 `hc send`；要重開的：`hc send` 結束指令、`hc get`、`hc read`、`hc send` 接回指令（找 id：在那台跑 `sh`，讀 `sessions/<pid>.json` 或 `lsof`） |
| ⟳ | 只重新讀取畫面 |
| 倉庫的清單（含哪些改過、還沒送出） | `kit list --json`（`sources[].changed`、`items[].changed`） |
| 各機器（每台、每個帳號；打開那個分頁、或按它的 ⟳ 時） | `kit status --json`（舊版 kit：`kit api`、`kit --version`）；自己回報的帳號：讀它的回報檔 |
| 各機器的「複製升級指令」 | 不執行，只複製 `kit self-update && kit sync`（Windows：`kit self-update; if ($?) { kit sync }`） |
| ＋ 新增 → 自己從頭寫 | `kit new <種類> <名字> --to <來源>` |
| ＋ 新增 → 從網址收：下載看看 | `kit collect <網址> --to <來源> --look`（只看，輸出 JSON） |
| ＋ 新增 → 從網址收：收進來 | `kit collect <網址> --to <來源> --path <資料夾> [--allow]` |
| 送出 → 確定送出 | `kit push --to <來源> --dry-run --json` → 再一次 `--dry-run --json`（檔案清單要一樣）→ `kit push --to <來源> --json` |
| Agents 清單 | `kit agents --json` |
| agent 的加上／拿掉 | `kit agent <名字> add\|rm <種類> <東西>` |
| 開啟 | `kit run <名字> --tool <工具>`；kit 0.17.0 起 `kit open <工具> --agent <名字> --tab-env HC_TERMINAL_ID`（新分頁） |
| 把 agent 拖到 space ／ 放到 space… | 在那個 space 的機器上 `kit place <名字> <space 的資料夾>/<名字> --tool <工具> --json`，再在那個 space 開新分頁跑 kit 給的指令；kit 0.17.0 起先看那台的 `kit tab list --json`，沒開著就在那個 space 開新分頁跑 `kit open <工具> --agent <名字> --tab-env HC_TERMINAL_ID` |
| agent 視窗「這個分頁的」 | `kit tab show <分頁> --json`（標題列讀清單時一起讀）；拿掉 `kit rm --tab <分頁> <種類> <名字>`，加到這個分頁 `kit add --tab <分頁> <種類> <名字>` |
| 分頁關掉 ／ Herdr 開起來 | 那台 `kit tab list --json`，工具不在跑了才 `kit tab rm <分頁>`；每台一次 `kit tab keep <那台的終端機>` |
| ＋ 新增 → 貼上設定：看看會變成什麼 | `kit new mcp [名字] --config <暫存檔> --to <來源> --look`（貼的內容在檔案裡，不在參數裡） |
| ＋ 新增 → 貼上設定：建立 | `kit new mcp [名字] --config <暫存檔> --to <來源>` |
| 裝套件（MCP 固定版本的套件） | `kit install-deps mcp <名字>` |

## For developers / 改 mod 的人

`herdr-app/mods/kit/`: `main.js` picks the part by `props.role`; `repo.js` (repo, repo-toggle, editor), `agent.js`
(agent), `agents.js` (agents, agents-toggle), `place.js` (an agent put in a space: the drag payload, the drop loop,
`kit place` then `tab.new`, or with kit 0.17 `tab.new` running `kit open`; a closed tab's `kit tab rm`), `header.js` (header, context), `layout.js` (where kit sits in a
layout: 放進上排 / 更新版面), `machines.js` (the repository's 各機器 tab: every machine's kit, what it lacks by
`FEATURES`, the self-reported accounts of `kit-machines.json`, the sources against the approved commits), `context.js` (what the context window and chip compute, from plain values), `versions.js` (an item's version in words and why an agent's copy is old, from plain values), `common.js`
(running kit, `kit api`, the shared state keys, the layout's node ids, one kit action at a time, the shared UI
pieces, and `kitJson`: kit's JSON and its error codes), `bots.js` (the agents' logos: an agent file's `bot:`, the
still SVGs, the live `LiveBot` view), `bot-models.js` (the animals in Zdog, their colors), `bot-paint.js` (Zdog draws
through a canvas; a mod has none, so this records what it drew and turns it into Herdr's own filled paths:
`window.paint_path`), `zdog.js` (Zdog 1.1.3, MIT, bundled as one ES module). A change to how the logos look: raise
`BOT_VERSION` in `bots.js`, so every computer writes the SVGs again. A render may take 50 ms and every polygon is an
element, so a live logo is its own view (`cx.new`) and redraws alone. The mod reads only kit's JSON (kit list / agents / push / status
`--json`, kit collect `--look`, kit context), never kit's words for people (it shows them as they are) and never git
itself; the list it reads is kit's README, 「給程式讀的介面」. It reads `kit api` major 1, minor 0 or later
(`KIT_API` in `common.js`): kit raises the minor when it adds something and the major when it changes what this mod
reads; a new major needs a new mod.
Tests: `node tests/kit/run.js` (Node 18+; a fake Herdr and a fake kit answering in kit 0.3.0's JSON; at the end a
real kit: the one in `KIT=<path>` if set, else the one on PATH, else it says it skipped that one. A real kit that
answers `1.x` is also run in an empty temp home: its JSON commands, and a source of its own sent with 送出). `node tests/check-mods.js` runs
`herdr-app check` on every mod and on the kit mod once per role (skipped without herdr-app on PATH).
