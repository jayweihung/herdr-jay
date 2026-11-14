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

## 1. agent 視窗上的 Kit 按鈕

每個 agent（Claude Code、Codex、omp）視窗的標題列右邊有一顆按鈕，寫著它在用幾個東西：

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ ■ Claude Code   ~/src/myproj   [Kit  規則 2  skill 3  MCP 1] [context 35% 139k/400k]  ○ │
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
│ ▾ Skills（2）                                │
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
│ ▾ Skills（1）                                │
│   kit-hello  [Kit · 整個帳號]                │
│                            [從帳號拿掉]      │
│ ──────────────────────────────────────────── │
│ ▾ 還沒用的（3）                              │
│   humanizer               [加到整個帳號]     │
└──────────────────────────────────────────────┘
```

- 標 `Kit · 整個帳號` 的是 kit 裝給整個帳號的，可以「從帳號拿掉」；標 `Kit · 這個資料夾` 的是只加給這個資料夾的，可以「從資料夾拿掉」；標 `Kit · 團隊必備` 的是團隊規定要有的，拿不掉。
- 標 `這個資料夾`、`這個帳號（不是 kit 的）` 的是 agent 自己讀到的（`CLAUDE.md`、`.claude/rules`、`.claude/skills`、`.mcp.json`），只顯示，不改。
- **兩種加法，看 agent 在哪裡開的**（按鈕只會改到 agent 所在的地方，不會改到更大的範圍）：
  - 在一般資料夾開的 agent：只有「加到這個資料夾」「從資料夾拿掉」（`kit add --dir <資料夾>`）。加的東西只有在這個資料夾（含子資料夾）開的 agent 讀得到，整個帳號、別的資料夾、別的 agent 都不受影響。整個帳號的東西會列出來（標 `Kit · 整個帳號`），但這裡不能改。kit 會在資料夾裡放一個 `.agentkit` 記下加了哪些，再寫進各工具在專案裡會讀的地方（`CLAUDE.md`、`AGENTS.md`、`.claude/skills`、`.agents/skills`、`.mcp.json`、`.codex/config.toml`）。在子資料夾開的 agent 按，會加到上面已經有 `.agentkit` 的那個資料夾。
  - 在家目錄 `~` 開的 agent：只有「加到整個帳號」「從帳號拿掉」（`kit add`／`kit rm`）。這台電腦上你帳號的 Claude Code、Codex、omp（有裝的）和每個 agent、每個資料夾都會有或都沒有。
  - 只想給某一個 agent：請點 `kit run` 開的 agent，用它視窗裡的「加上」「拿掉」。
  - 資料夾的 MCP：Claude Code 不會每次問（kit 在 `.claude/settings.local.json` 允許它）；Codex 只在信任的資料夾讀，kit 會在 `~/.codex/config.toml` 信任這個資料夾；omp 只讀整個帳號的 MCP，不支援資料夾的。Codex 在子資料夾開也讀得到，是因為 kit 在 `~/.codex/config.toml` 最上面加了 `project_root_markers`。
- 「這次啟動帶的」：用 `kit run`（或 Agents 的「開啟」）開的 agent 才有，只有這個 agent 有，關掉就沒了。要改，到 Agents 改那個 agent。這時下面的標題會變成「另外也讀到的」。
- **skill 需要的程式**：skill 要的程式（例如 archify 要 Node.js 18 以上）這台沒有或太舊時，那一項下面會出現「⚠ 需要 Node.js 18 以上（這台沒有）［安裝］」（太舊是［升級］）。按下去先顯示 kit 會執行的指令（例如 `brew install node`），按「確定安裝」才執行（就是 `kit install-tool node --min 18`）；那種裝法失敗，kit 會換配方裡的下一種。kit 沒有這台能用的裝法時，只寫「請自己裝」。怎麼看出來、怎麼加新的程式，看 kit 的說明（「skill 需要的程式」）。
- **skill 自己的套件**：skill 要先 `npm install` 或 `pip install` 才能跑時，下面會出現「⚠ 需要先裝它自己的 npm 套件［安裝］」或「⚠ 需要先裝它自己的 Python 套件［安裝］」（skill 改過、要重裝時是［更新］）。按下去先顯示要執行的指令，按「確定安裝」才裝（就是 `kit install-deps <skill> npm|pip`）：裝在 kit 自己的資料夾（Python 是自己的 venv），不跑套件自己的安裝程式。kit 不接受的寫法（`requirements.txt` 的某一行、不是 npm registry 上的版本）只寫「kit 不裝：」和原因，沒有［安裝］。
- `同步` = `kit sync`（拿來源的新版、裝上團隊必備的）；`⟳` 只是重新讀一次畫面，不改任何東西。
- agent 開在別台主機（Herdr 的遠端 space）時，按鈕會到那台去問 kit（先問那台的 `kit api`）。**每台要跑 agent 的主機都要裝好 kit**（`kit init` 過），不然按鈕會寫「沒有 kit」或「出錯了」。
- 用別的帳號跑的 agent（例如 `sudo -i` 的 root）只會顯示「root 唯讀」，這裡看不到也不能改。
- 新加的 MCP 要重開 agent 才會讀到。

按鈕上的字：`…` 還在讀；`出錯了` 點開看原因；`沒有 kit`、`kit 太舊`、`mod 太舊`（紅色）看上面「需要什麼」的表，點開也會寫怎麼辦。

Kit 按鈕右邊的 `[context 35% 139k/400k]` 是這個 agent 的 context 用了多少（`kit context`，滑鼠停上去有提示，70% 以上變黃、90% 以上變紅，最多寫 100%）。agent 在工作時每 15 秒問一次，閒置時每分鐘一次。問不到（kit 正忙、那台連不上）時，先留著上一次的數字；還沒問到時寫「…」，問不到數字時寫「—」。那台的 kit 不能用（上面的表）時不顯示這格。右鍵複製這些數字。

**進度**（kit 0.6.0 以上）：agent 用 `kit note "剛做了什麼；下一步"` 寫了進度的話，資料夾後面會多一格 `[進度 改好 parser；下一步跑測試]`，顯示第一行；滑鼠停上去看全部和多久以前寫的，右鍵複製，超過兩小時變灰。跟 context 一起問（工作時每 15 秒，閒置時每分鐘），所以寫完最多等這麼久才出現。沒寫過就不顯示這格。Claude、omp 用 kit 0.6.0 就可以；Codex 在沙箱裡要 kit 0.6.1（kit 會在 Codex 的 config.toml 開放 `~/.config/agentkit/notes` 給它寫，開著的 Codex 要重開）。要 agent 自己寫，給它 rule `progress-note`（agentkit-library 有，`kit add rule progress-note`）。

標題列窄的時候進度優先：資料夾先收起來（滑到進度上看得到資料夾），還不夠就 context 只留百分比、Kit 只留「Kit」兩字（數字都在滑鼠停上去的提示裡，按下去一樣打開），最後才把名字縮短。寬的時候全部照常顯示；沒寫進度時跟以前一樣。

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
  - kit 管的 skill／規則／MCP 有「拿掉」：跟 Kit 按鈕的清單同一套規則（在資料夾開的 agent 只拿掉這個資料夾的，在家目錄開的拿掉整個帳號的，團隊必備的拿不掉），先問一次才做。拿掉後這個 agent 要清空重來（`/clear`）或重開才不會再讀它。
  - 記憶檔／指示檔有「開檔」：用 kit 的編輯視窗開（只有這台電腦的 agent 才有；別台的檔案不在這台）。
- **怎麼省**：只有數字顯示有地方可以省時才出現（快滿了、某個工具的結果特別大、MCP 或 Skills 佔很多、記憶檔很大……）。
- **下面**：離自動壓縮還有多少。
  - 「壓縮」：先問「確定壓縮？」；Claude、omp 可以寫一行「壓縮時要保留什麼（可空白）」，送出 `/compact <你寫的>`；Codex 的 `/compact` 不能帶文字，只送 `/compact`。
  - 「清空重來」（紅色）：問兩次（「會清掉這段對話的內容，確定？」→ 再確認一次），才送出 Claude 的 `/clear`、Codex 和 omp 的 `/new`。
  - 這兩顆只在 agent 停下來（閒置，或剛做完）時才能按，工作中、在等你回答時按不了；用 `hc send` 送，只送到這個 agent 的視窗。別台主機的 agent 也一樣。
- `⟳` 重新問（不用 kit 留的那一分鐘）；「複製」把細項整理成文字放到剪貼簿。
- Claude 的細項要問 Claude Code 本身，最多 30 秒（不花錢、不叫模型、不跑 hook、不寫對話紀錄）；問不到時會寫原因，改顯示估算的。細節看 kit 的說明（「context 細項」）。

## 2. 倉庫：看、改、新增

上排的 `Kit` 按鈕開關右邊的倉庫。這裡列出來源裡所有的規則、skill、MCP，可以直接改內容。
改的是這台電腦上來源的檔案，送出後，每台主機 `kit sync` 就會拿到（不用管是哪台主機）。

```
┌──────────────────────────────────────────────────┐
│ Kit  倉庫                             [同步] ⟳ ✕ │
│      改過規則／skill／MCP 1 個檔案，還沒送出     │
│ [my-team-source 團隊 · 送出要審]                 │
├──────────────────────────────────────────────────┤
│ [規則 5] Skills 2  MCP 1               [＋ 新增] │
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
- **＋ 新增 → 從網址收別人的**（只有 Skills 分頁有）：貼上別人的 repo 網址，選放在哪個倉，按「下載看看」。
  這一步只看不放：列出 repo 裡找到的 skill（有好幾個就讓你選）、授權、會執行的程式、會放到哪裡。
  沒問題就按「收進來」（就是 `kit collect`）。收的是文字檔加原作者的 LICENSE，並記在倉裡的 `third_party.lock`。
  作者還不在倉的允許清單（`kit.yaml` 的 `collect_sources`）時：
  - 你自己的倉（`push: direct`）：按鈕變成「加進清單並收進來」，會一起把作者加進清單。
  - 團隊的倉：不能收，要請維護者把作者加進清單。「下載看看」會直接說不在清單，不會去下載。
  網址的主機也要在 `kit.yaml` 的 `allowed_hosts` 裡：不在的話「下載看看」也不會去連。
  收進來後跟其他改動一樣：用 `git diff` 看檔案 → 黃色那條的「送出」→ agent 視窗上的 Kit 清單按「加到這個資料夾」（在家目錄開的 agent 是「加到整個帳號」）。

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
  送出前如果檔案又變了（剛剛有存檔），會擋下來、什麼都不送，請再看一次清單。送不出去時，訊息最前面是原因；檔案很多時只列前幾個。
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

### 各機器（倉庫的第四個分頁）

倉庫的分頁「規則、Skills、MCP」後面是「各機器」：這個 Herdr 認得的每台主機、每個帳號裝的是哪一版 kit、比最新的少了什麼，以及來源是不是核准過的版本。

```
┌ Kit ─────────────────────────────────────────────────────────┐
│  規則   Skills   MCP   [各機器]                            ⟳  │
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
│       規則 1 · skill 1 · MCP 0           │
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
- 「編輯檔案」可以直接改 agent 檔（提示、說明）。
- 上面的大頭是即時畫的：點進來、換 logo 或點它一下，它會轉頭、眨眼打招呼。
- 「換 logo…」：選動物、顏色（「原色」是那隻動物自己的顏色），或按「隨機」。選了就寫進 agent 檔開頭的
  `bot: <動物>` 或 `bot: <動物> <顏色>`（例如 `bot: fox`、`bot: fox sky`），跟其他改動一樣按「送出」或 `kit push`。
  「照名字」會拿掉這一行，換回照名字挑的。
- logo 是 mod 用 Zdog 自己畫的，不用裝任何東西。清單上的小圖是 SVG，每種組合只寫一次，存在 `~/.config/herdr-app/data/kit/bots/`。

### 把 agent 放到 space（kit 0.5.0 以上）

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
  `tab.new`，帶 `space`、`folder`、`argv`）。進度和結果用通知說；kit 的提醒（例如 Codex 不能只開某些工具）也會列出來。
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

## 指令對照

| 畫面上 | 等於打 |
|---|---|
| Herdr 一開（每台主機一次，之後每幾分鐘）、「⟳ 再檢查一次」 | `kit api`（要印出 `1.x`） |
| 視窗按鈕的清單 | `kit list --json --dir <資料夾> --pid <行程>` |
| 加到整個帳號／從帳號拿掉 | `kit add` ／ `kit rm` |
| 加到這個資料夾／從資料夾拿掉 | `kit add --dir <資料夾>` ／ `kit rm --dir <資料夾>` |
| 安裝／升級（skill 需要的程式） | `kit install-tool <程式> [--min 版本]` |
| 安裝／更新（skill 自己的套件） | `kit install-deps <skill> [npm\|pip]` |
| 窗格上方的 context 35%（每 15 秒，閒置時每分鐘） | `kit context --pid <pid> --tool <claude\|codex\|omp> --dir <資料夾>` |
| 按 context 那格（細項） ／ 它的 ⟳ | `kit context --pid <pid> --tool <工具> --dir <資料夾> --detail` ／ 再加 `--fresh` |
| 窗格上方的進度（跟 context 一起問） | `kit note --pid <pid> --json` |
| 細項的「壓縮」／「清空重來」 | 在那個 agent 打 `/compact [要保留什麼]` ／ `/clear`（Codex、omp：`/new`），用 `hc send` |
| 細項的「拿掉」 | `kit rm <種類> <名字>` ／ `kit rm --dir <資料夾> <種類> <名字>` |
| 同步 | `kit sync` |
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
| 開啟 | `kit run <名字> --tool <工具>` |
| 把 agent 拖到 space ／ 放到 space… | 在那個 space 的機器上 `kit place <名字> <space 的資料夾>/<名字> --tool <工具> --json`，再在那個 space 開新分頁跑 kit 給的指令 |
| ＋ 新增 → 貼上設定：看看會變成什麼 | `kit new mcp [名字] --config <暫存檔> --to <來源> --look`（貼的內容在檔案裡，不在參數裡） |
| ＋ 新增 → 貼上設定：建立 | `kit new mcp [名字] --config <暫存檔> --to <來源>` |
| 裝套件（MCP 固定版本的套件） | `kit install-deps mcp <名字>` |

## For developers / 改 mod 的人

`herdr-app/mods/kit/`: `main.js` picks the part by `props.role`; `repo.js` (repo, repo-toggle, editor), `agent.js`
(agent), `agents.js` (agents, agents-toggle), `place.js` (an agent put in a space: the drag payload, the drop loop,
`kit place` then `tab.new`), `header.js` (header, context), `layout.js` (where kit sits in a
layout: 放進上排 / 更新版面), `machines.js` (the repository's 各機器 tab: every machine's kit, what it lacks by
`FEATURES`, the self-reported accounts of `kit-machines.json`, the sources against the approved commits), `context.js` (what the context window and chip compute, from plain values), `common.js`
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
