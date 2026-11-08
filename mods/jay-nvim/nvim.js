// The Lua the mod hands nvim at start (`nvim -c "lua ..."`): it runs on whichever machine
// the pane opens on, and that machine has no copy of this mod.
//
// - reload: an agent edits files beside this pane; nvim only rereads on focus or :checktime,
//   so a timer checks every second, and each reload is diffed so the changed lines stand out
// - tree: netrw on the right
// - agent: <leader>o lists the files the agent beside read or edited; <leader>ac/al/ad/as
//   comment lines and send the comments to it with hc send
// - lsp: go to definition, hover and lint errors from whichever servers this machine has (not as root)
export const NVIM_INIT = String.raw`-- autoread would reload before FileChangedShell fires, leaving nothing to diff against
vim.o.autoread = false
-- Windows: no HOME, no uid, ';' between PATH entries, no pgrep / sudo.
local WIN = vim.fn.has("win32") == 1
local HOME = WIN and vim.uv.os_homedir() or vim.env.HOME or vim.uv.os_homedir() or "" -- Windows: like node (Claude Code), not nvim's HOMEDRIVE guess
-- One spelling per file on Windows (C:/x/y): nvim, git and the agent mix \\ and /, and drive-letter case.
local function norm(p)
  if not WIN or type(p) ~= "string" then return p end
  return ((p:gsub("\\", "/"):gsub("^(%a):", function(d) return d:upper() .. ":" end)))
end
local function is_root() return not WIN and vim.uv.getuid() == 0 end
local api, ns, old = vim.api, vim.api.nvim_create_namespace("jay-nvim-changes"), {}
api.nvim_create_autocmd("FileChangedShell", { callback = function(a)
  if vim.v.fcs_reason == "deleted" then vim.v.fcs_choice = "ask" return end
  old[a.buf] = api.nvim_buf_get_lines(a.buf, 0, -1, false)
  -- unsaved edits: you pick keep or load; on load the diff shows what replaced your text
  vim.v.fcs_choice = vim.bo[a.buf].modified and "ask" or "reload"
end })
-- Claude Code's diff look: removed lines in red with "-", added lines in green with "+".
-- A changed line shows as both: the old text in red above, the new text in green.
api.nvim_set_hl(0, "QtDiffAdd", { bg = "#225c2b" })
api.nvim_set_hl(0, "QtDiffDel", { bg = "#7a2936" })
api.nvim_set_hl(0, "QtSignAdd", { fg = "#7ee787", bold = true })
api.nvim_set_hl(0, "QtSignDel", { fg = "#ff7b72", bold = true })
local function mark(b, before)
  api.nvim_buf_clear_namespace(b, ns, 0, -1)
  local after = api.nvim_buf_get_lines(b, 0, -1, false)
  local w = vim.fn.win_findbuf(b)[1]
  local left = w and vim.fn.getwininfo(w)[1].textoff or 2
  local width = w and api.nvim_win_get_width(w) or vim.o.columns
  local first
  -- an empty file (no lines, or the one blank line of an empty buffer) is "", else a new file shows a red blank "-"
  local function text(t) return (#t == 0 or (#t == 1 and t[1] == "")) and "" or table.concat(t, "\n") .. "\n" end
  for _, h in ipairs((vim.text and vim.text.diff or vim.diff)(text(before), text(after), { result_type = "indices" })) do
    local from, gone, at, n = unpack(h)
    if gone > 0 then
      local rows = {}
      for i = from, from + gone - 1 do
        local t = "-" .. (" "):rep(math.max(left - 1, 1)) .. (before[i] or "")
        rows[#rows + 1] = { { t .. (" "):rep(math.max(width - vim.fn.strdisplaywidth(t), 0)), "QtDiffDel" } }
      end
      -- old text sits above the new lines; a pure removal hangs below line "at" (above line 1 when at is 0)
      local above = n > 0 or at == 0
      api.nvim_buf_set_extmark(b, ns, math.max(at - 1, 0), 0, { virt_lines = rows, virt_lines_above = above, virt_lines_leftcol = true })
    end
    for l = at, at + n - 1 do
      api.nvim_buf_set_extmark(b, ns, l - 1, 0, { line_hl_group = "QtDiffAdd", sign_text = "+", sign_hl_group = "QtSignAdd" })
    end
    first = first or math.max(at, 1)
  end
  return first, #after
end
-- What git last committed, so a file opened after the agent edited it still shows the change.
-- Untracked files in a repo count as all new; outside a repo nothing is marked.
local function head_lines(b)
  local f = api.nvim_buf_get_name(b)
  if f == "" or vim.bo[b].buftype ~= "" then return end
  local dir, name = vim.fn.fnamemodify(f, ":h"), vim.fn.fnamemodify(f, ":t")
  local r = vim.system({ "git", "-C", dir, "show", "HEAD:./" .. name }, { text = true }):wait()
  if r.code == 0 then return vim.split(r.stdout, "\n", { plain = true, trimempty = false }) end
  if vim.system({ "git", "-C", dir, "rev-parse", "--is-inside-work-tree" }):wait().code == 0 then return {} end
end
local function mark_head(b)
  local before = head_lines(b)
  if not before then return end
  if before[#before] == "" then before[#before] = nil end
  mark(b, before)
end
api.nvim_create_autocmd({ "BufReadPost", "BufWritePost" }, { callback = function(a)
  if not old[a.buf] then pcall(mark_head, a.buf) end
end })
api.nvim_create_autocmd("FileChangedShellPost", { callback = function(a)
  local b, before = a.buf, old[a.buf]
  old[b] = nil
  if not before then return end
  -- only this edit, the same +/- the agent's tool shows; HEAD is the base when a file is opened or saved
  local first, count = mark(b, before)
  for _, w in ipairs(first and vim.fn.win_findbuf(b) or {}) do
    api.nvim_win_set_cursor(w, { math.max(1, math.min(first, count)), 0 })
    api.nvim_win_call(w, function() vim.cmd("normal! zz") end)
  end
end })
vim.uv.new_timer():start(1000, 1000, vim.schedule_wrap(function()
  if vim.fn.mode() ~= "c" then vim.cmd("silent! checktime") end
end))
-- Another pane's nvim has this file open too: say which, the first time you change it here (Emacs's file locks).
-- Saving still checks the disk (FileChangedShell above); this is the early heads-up.
local function other_nvims(b)
  local path, mine, out = api.nvim_buf_get_name(b), vim.fn.swapname(b), {}
  -- the same file's other swap files sit beside ours (.swp .swo ...); swapfilelist() doubles the folder in 0.12
  for _, sw in ipairs(mine == "" and {} or vim.fn.glob(vim.fn.escape(mine:sub(1, -4), "[]*?") .. "s??", false, true)) do
    local ok, i = pcall(vim.fn.swapinfo, sw)
    if ok and type(i) == "table" and i.pid and i.pid ~= vim.fn.getpid() and type(i.fname) == "string"
      and vim.fn.fnamemodify(i.fname, ":p") == path and vim.uv.kill(i.pid, 0) == 0 then
      local env = io.open("/proc/" .. i.pid .. "/environ") -- its Herdr pane; no /proc on a Mac
      local pane = env and env:read("*a"):match("HC_TERMINAL_ID=([^%z]+)")
      if env then env:close() end
      out[#out + 1] = pane or ("pid " .. i.pid)
    end
  end
  return out
end
local warned = {}
api.nvim_create_autocmd("BufModifiedSet", { callback = function(a)
  if not vim.bo[a.buf].modified or vim.bo[a.buf].buftype ~= "" then return end
  local others = table.concat(other_nvims(a.buf), "、")
  if others ~= "" and warned[a.buf] ~= others then
    vim.notify(others .. " 的 nvim 也開著這個檔。兩邊都改的話，後存的那邊會被問要不要蓋掉", vim.log.levels.WARN)
  end
  warned[a.buf] = others
end })
vim.g.netrw_banner, vim.g.netrw_liststyle, vim.g.netrw_browse_split, vim.g.netrw_winsize = 0, 3, 4, 25
-- A narrow side pane: one statusline, wrapped lines that keep their indent, no "~" past the end,
-- and a tree without the .gitignore'd files or the ../ entry
vim.o.laststatus, vim.o.signcolumn, vim.o.cursorline = 3, "yes", true
vim.o.linebreak, vim.o.breakindent, vim.o.display = true, true, "lastline"
vim.opt.fillchars:append({ eob = " ", lastline = " " })
-- Hide() returns git's error text when git fails (root's nvim in your repo: dubious ownership, two lines = an
-- empty pattern) and "" in a repo with nothing ignored; either way an empty pattern hid every file
pcall(function()
  local h = vim.fn["netrw_gitignore#Hide"]()
  vim.g.netrw_list_hide = (vim.v.shell_error == 0 and h ~= "" and h .. "," or "") .. [[^\.\.\=/\=$]]
end)
vim.cmd("Lexplore! | wincmd h") -- ! puts the tree on the right; the file window keeps focus
-- The tree keeps at least 30 columns (25% of a 90-column pane was 16), also after the pane resizes
local tree_ns = api.nvim_create_namespace("jay-nvim-tree")
api.nvim_set_hl(0, "QtTreeCur", { bg = "#1f4f7a", bold = true })
local function tree_wins()
  return vim.tbl_filter(function(w) return vim.bo[api.nvim_win_get_buf(w)].filetype == "netrw" end,
    api.nvim_tabpage_list_wins(0))
end
local function tree_width()
  for _, w in ipairs(tree_wins()) do
    api.nvim_win_set_width(w, math.max(30, math.floor(vim.o.columns / 4)))
    vim.wo[w].winfixwidth = true
  end
end
tree_width()
api.nvim_create_autocmd("VimResized", { callback = tree_width })
-- Mark the file shown on the right in the tree. Each "| " is one level below w:netrw_treetop;
-- the full path is matched, not the name, so two __init__.py never get mixed up.
local function tree_mark(path)
  for _, w in ipairs(tree_wins()) do
    local b, top = api.nvim_win_get_buf(w), vim.w[w].netrw_treetop
    api.nvim_buf_clear_namespace(b, tree_ns, 0, -1)
    local stack = {}
    for i, l in ipairs(top and api.nvim_buf_get_lines(b, 0, -1, false) or {}) do
      local bars = l:match("^[| ]*")
      local depth = math.floor(#bars / 2)
      if depth > 0 then
        stack[depth] = (l:sub(#bars + 1):gsub("[*@=/]$", "")) -- netrw marks executables *, links @
        if (norm(top):gsub("/$", "")) .. "/" .. table.concat(stack, "/", 1, depth) == path then
          api.nvim_buf_set_extmark(b, tree_ns, i - 1, 0, { line_hl_group = "QtTreeCur" })
          api.nvim_win_set_cursor(w, { i, 0 })
          break
        end
      end
    end
  end
end
api.nvim_create_autocmd("BufWinEnter", { callback = function(a)
  if vim.bo[a.buf].buftype ~= "" then return end -- the tree itself is a nofile buffer
  local path = norm(api.nvim_buf_get_name(a.buf))
  vim.schedule(function() tree_mark(path) end) -- after netrw finishes moving its own cursor
end })

-- The agent beside this nvim: the one non-shell terminal in the same Herdr tab (hc ls "where").
-- Comment spans and the message shape follow herdr-nvim (MIT, ChmaraX/herdr-nvim lua/herdr-nvim).
if vim.g.mapleader == nil then vim.g.mapleader = " " end
local JN = {}
_G.JN = JN
local home = HOME
local SHELLS = { bash = 1, sh = 1, zsh = 1, fish = 1, dash = 1, ksh = 1, nvim = 1, pwsh = 1, powershell = 1, cmd = 1, nu = 1 }
-- hc names a terminal by its program; on Windows that can be "C:\\...\\pwsh.exe"
local function is_shell(name) return SHELLS[((tostring(name):match("[^/\\]+$") or ""):lower():gsub("%.exe$", ""))] end

local function hc_bin()
  if vim.env.JAY_NVIM_HC then return vim.env.JAY_NVIM_HC end -- set by a handoff command (see README)
  for _, name in ipairs({ "hc", "herdr-core" }) do -- Windows installs herdr-core.exe; hc.exe only if no hc existed
    local found = vim.fn.exepath(name)
    if found ~= "" then return found end
  end
  local lad = vim.env.LOCALAPPDATA
  for _, p in ipairs({ home .. "/.local/bin/hc", "/opt/homebrew/bin/hc", "/usr/local/bin/hc",
    lad and (lad .. "/Programs/herdr-core/herdr-core.exe") or "" }) do
    if vim.fn.executable(p) == 1 then return p end
  end
end

local function hc(args)
  local bin = hc_bin()
  if not bin then return nil, "找不到 hc" end
  local r = vim.system({ bin, unpack(args) }, { text = true }):wait()
  if r.code ~= 0 then return nil, vim.trim(r.stderr ~= "" and r.stderr or r.stdout) end
  local ok, v = pcall(vim.json.decode, r.stdout)
  return ok and v or r.stdout
end

function JN.agents()
  local ls, err = hc({ "ls" })
  if type(ls) ~= "table" then return nil, err or "hc ls 讀不懂" end
  local me = vim.env.HC_TERMINAL_ID
  local where
  for _, t in ipairs(ls.terminals) do
    if t.address == me then where = t.where end
  end
  local out = {}
  for _, t in ipairs(ls.terminals) do
    if where and t.where == where and t.address ~= me and t.state == "live" and not is_shell(t.agent) then
      table.insert(out, t)
    end
  end
  return out
end

-- Asks only when the tab holds more than one agent.
local function with_agent(cb)
  local list, err = JN.agents()
  if not list then return vim.notify("找不到 agent：" .. err, vim.log.levels.ERROR) end
  if #list == 0 then return vim.notify("這個分頁裡沒有 agent", vim.log.levels.WARN) end
  if #list == 1 then return cb(list[1]) end
  vim.ui.select(list, { prompt = "給哪個 agent", format_item = function(t) return t.address .. " · " .. t.agent .. " · " .. t.where end },
    function(t) if t then cb(t) end end)
end

-- Claude Code keeps ~/.claude/sessions/<pid>.json -> sessionId; the log is projects/*/<id>.jsonl.
local TOOLS = { Read = "讀", Edit = "改", MultiEdit = "改", NotebookEdit = "改", Write = "寫" }
local function session_log(t)
  if t.agent ~= "claude-code" or t.address:find("/") then return nil end
  local info = hc({ "get", t.address })
  local pid = type(info) == "table" and info.foreground and info.foreground.pid
  -- An agent under sudo: Herdr runs as you and reports no foreground. Walk the pane's process tree
  -- for the first pid with a session file in our ~/.claude (root's nvim finds root's claude; yours finds none).
  if not pid and not WIN and type(info) == "table" and info.pid then
    local todo = { tostring(info.pid) }
    while not pid and #todo > 0 do
      for c in (vim.system({ "pgrep", "-P", table.remove(todo, 1) }, { text = true }):wait().stdout or ""):gmatch("%d+") do
        if vim.uv.fs_stat(("%s/.claude/sessions/%s.json"):format(home, c)) then pid = tonumber(c) break end
        todo[#todo + 1] = c
      end
    end
  end
  local f = pid and io.open(("%s/.claude/sessions/%d.json"):format(home, pid))
  local ok, s
  if f then
    ok, s = pcall(vim.json.decode, f:read("*a"))
    f:close()
  elseif WIN and type(t.cwd) == "string" then
    -- Windows: Herdr starts agents through pwsh (or npm's claude.cmd), so the pane's pid is the shell's.
    -- Take the live Claude Code session in the agent's folder that was active last.
    -- shortcut: two Claude Codes in one folder may swap; upgrade by walking the pane's child processes.
    local want = norm(t.cwd):lower():gsub("/$", "")
    for _, file in ipairs(vim.fn.glob(home .. "/.claude/sessions/*.json", false, true)) do
      local h = io.open(file)
      local okd, d = pcall(vim.json.decode, h and h:read("*a") or "")
      if h then h:close() end
      if okd and type(d) == "table" and type(d.cwd) == "string" and type(d.pid) == "number"
        and norm(d.cwd):lower():gsub("/$", "") == want and vim.uv.kill(d.pid, 0) == 0
        and (not s or (tonumber(d.updatedAt) or 0) > (tonumber(s.updatedAt) or 0)) then
        ok, s = true, d
      end
    end
  end
  if not ok or type(s) ~= "table" then return nil end
  return ok and s.sessionId and vim.fn.glob(("%s/.claude/projects/*/%s.jsonl"):format(home, s.sessionId), false, true)[1]
end

-- An agent started under sudo: hc can't see its foreground and its log is root's.
-- This nvim then exits 77 and main.js runs the configured handoff command (README), which should run root's own copy of this Lua.
local function runs_as_root(t)
  if WIN or is_root() or t.agent ~= "claude-code" then return false end
  local info = hc({ "get", t.address })
  return type(info) == "table" and not info.foreground and info.pid ~= nil
    and vim.system({ "pgrep", "-u", "0", "-P", tostring(info.pid) }):wait().code == 0
end
-- A new pane has no "where" in hc ls for its first seconds, so keep asking for 10s until a claude-code agent shows up.
local root_probe, root_tries = vim.uv.new_timer(), 0
if not WIN then root_probe:start(0, 1000, vim.schedule_wrap(function()
  root_tries = root_tries + 1
  local agent = (JN.agents() or {})[1]
  if agent and runs_as_root(agent) then vim.cmd("cquit 77") end
  if (agent and agent.agent == "claude-code") or root_tries >= 10 then root_probe:stop() end
end)) end

-- Bytes of the log from offset "from" (or the last "bytes") to the end.
local function read_log(log, bytes, from)
  local h = log and io.open(log, "rb")
  if not h then return nil end
  local size = h:seek("end")
  h:seek("set", from or math.max(0, size - bytes))
  local text = h:read("*a")
  h:close()
  return text
end

-- Newest first, one entry per file. "first" = index of the first whole line in text.
local function paths_in(text, first)
  local seen, out = {}, {}
  local lines = vim.split(text or "", "\n", { plain = true })
  for i = #lines, first, -1 do
    local line = lines[i]
    if line:find('"tool_use"', 1, true) then
      local okl, rec = pcall(vim.json.decode, line)
      local content = okl and type(rec.message) == "table" and rec.message.content
      for j = type(content) == "table" and #content or 0, 1, -1 do
        local c = content[j]
        local path = norm(type(c) == "table" and c.type == "tool_use" and TOOLS[c.name] and type(c.input) == "table" and (c.input.file_path or c.input.notebook_path))
        if path and not seen[path] and vim.uv.fs_stat(path) then
          seen[path] = true
          table.insert(out, { path = path, tag = TOOLS[c.name], line = tonumber(c.input.offset), edit = TOOLS[c.name] == "改" and c.input or nil, at = i })
        end
      end
    end
  end
  return out
end

function JN.agent_files(t)
  return paths_in(read_log(session_log(t), 8 * 1024 * 1024), 2) -- line 1 may start mid-record
end

-- The window that shows files, not the netrw tree.
local function edit_win()
  local cur = vim.api.nvim_get_current_win()
  if vim.bo[vim.api.nvim_win_get_buf(cur)].filetype ~= "netrw" then return cur end
  for _, w in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
    if vim.bo[vim.api.nvim_win_get_buf(w)].filetype ~= "netrw" then return w end
  end
  return cur
end

-- Bash has no file_path. When a Bash result lands, open the newest file changed since that Bash call started:
-- in the git repo of the agent's cwd or of a folder the command names (git ls-files: modified or new, not ignored),
-- or a file the command names by absolute path (also outside repos, e.g. a root agent working under /root).
-- shortcut: a relative path outside the cwd's repo is not found; upgrade if agents cd elsewhere a lot.
local function epoch(ts) -- "2026-11-07T18:43:13.354Z" is UTC; os.time reads a table as local time
  local y, mo, d, h, mi, s = (type(ts) == "string" and ts or ""):match("^(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
  if not y then return end
  local now = os.time()
  return os.time({ year = y, month = mo, day = d, hour = h, min = mi, sec = s }) + os.difftime(now, os.time(os.date("!*t", now)))
end
local PATHS = "/[^%s'\"<>|;&()]+" -- absolute paths in a command line
-- What a file held before a Bash call ran, kept by snap_hook.sh (a PreToolUse hook): the call reaches the log only
-- after it ran (root's agent), so nvim cannot keep it itself. Diffed against for a file outside a repo (no HEAD)
local SNAP = HOME .. "/.cache/jay-nvim/snap/"
local function snap_of(ids, p)
  for _, id in ipairs(ids) do -- parallel calls: the first one that named the file saw it before any of them ran
    local f = SNAP .. id .. "/" .. vim.fn.sha256(p)
    if vim.uv.fs_stat(f) then return vim.fn.readfile(f) end
  end
end
local function stamp(p)
  local st = vim.uv.fs_stat(p)
  return st and st.mtime.sec .. "." .. st.mtime.nsec
end
local function bash_changed(cwd, since, cmd)
  local best, at
  local function consider(p)
    local st = vim.uv.fs_stat(p)
    if st and st.type == "file" and st.mtime.sec >= since and (not at or st.mtime.sec > at) then best, at = norm(p), st.mtime.sec end
  end
  local dirs, n = { cwd }, 0
  for p in (type(cmd) == "string" and cmd or ""):gmatch(PATHS) do
    n = n + 1
    if n > 20 then break end
    local t = (vim.uv.fs_stat(p) or {}).type
    if t == "file" then consider(p); dirs[#dirs + 1] = vim.fs.dirname(p) elseif t == "directory" then dirs[#dirs + 1] = p end
  end
  local seen = {}
  for _, d in ipairs(dirs) do
    local top = vim.system({ "git", "-C", d, "rev-parse", "--show-toplevel" }, { text = true }):wait()
    top = top.code == 0 and vim.trim(top.stdout)
    if top and not seen[top] then
      seen[top] = true
      local files = vim.system({ "git", "-C", top, "-c", "core.quotepath=off", "ls-files", "-m", "-o", "--exclude-standard" }, { text = true }):wait().stdout or ""
      for f in files:gmatch("[^\n]+") do consider(top .. "/" .. f) end
    end
  end
  return best
end

-- The line an Edit (or MultiEdit's last edit) changed: where its new text sits, or its old text when the file
-- is not rewritten yet, plus the first line the two differ on.
-- shortcut: a short new_string that also appears higher up lands there; upgrade by preferring the match nearest a mark.
local function edit_line(b, e)
  if type(e) == "table" and type(e.edits) == "table" then e = e.edits[#e.edits] end
  local new, old = type(e) == "table" and e.new_string, type(e) == "table" and e.old_string
  if type(new) ~= "string" or type(old) ~= "string" then return end
  local text = table.concat(vim.api.nvim_buf_get_lines(b, 0, -1, false), "\n")
  local at = (new ~= "" and text:find(new, 1, true)) or (old ~= "" and text:find(old, 1, true))
  if not at then return end
  local n, o, d = vim.split(new, "\n", { plain = true }), vim.split(old, "\n", { plain = true }), 1
  while n[d] and n[d] == o[d] do d = d + 1 end
  return select(2, text:sub(1, at - 1):gsub("\n", "")) + d
end

-- Follow: open whatever file an agent in this tab last read or edited; with several agents, whichever
-- touched a file last . Never while you type
-- or when the shown buffer has unsaved changes.
local follow = { on = true, logs = {}, state = {}, checked = 0, last = nil, who = nil }
-- One agent's log since the last tick: the newest file it read or edited, or nil. s keeps that log's place.
local function scan(s)
  local st = vim.uv.fs_stat(s.log)
  if not st or st.size == s.pos then return end
  -- Read only what was appended since the last tick: a window on the tail misses the tool call
  -- when Claude Code writes a big attachment (rules, request blobs: up to 1.5MB) right after it.
  local first = s.pos and 1 or 2 -- a tail window may start mid-record
  local text = read_log(s.log, 256 * 1024, s.pos and math.min(s.pos, st.size)) or ""
  local cut = text:match(".*()\n") -- keep a half-written last record for the next tick
  if not cut then return end
  s.pos = (s.pos or (st.size - #text)) + cut
  local body = text:sub(1, cut - 1)
  local it = paths_in(body, first)[1]
  local lines = vim.split(body, "\n", { plain = true })
  for i = first, #lines do
    local l = lines[i]
    -- the request blobs repeat the whole conversation (up to 1.5MB each); only the records themselves count
    if not l:find('^{"type":"api%-request') and (l:find('"Bash"', 1, true) or l:find('"toolUseResult":{"stdout"', 1, true)) then
      local ok, rec = pcall(vim.json.decode, l)
      rec = ok and type(rec) == "table" and rec or {}
      local content = rec.type == "assistant" and type(rec.message) == "table" and rec.message.content
      for _, c in ipairs(type(content) == "table" and content or {}) do
        if type(c) == "table" and c.type == "tool_use" and c.name == "Bash" then
          -- parallel Bash calls in one message: keep every command and the first start until a result lands
          if s.ran ~= false then s.bash, s.cmd, s.ran, s.ids = epoch(rec.timestamp) or s.bash, "", false, {} end
          local cmd = type(c.input) == "table" and type(c.input.command) == "string" and c.input.command or ""
          s.cmd = s.cmd .. "\n" .. cmd
          if type(c.id) == "string" and c.id:match("^[%w_]+$") then s.ids[#s.ids + 1] = c.id end
        end
      end
      local res = rec.type == "user" and rec.toolUseResult
      if s.bash and type(res) == "table" and res.stdout ~= nil and type(rec.cwd) == "string" and not (it and it.at > i) then
        local p = bash_changed(rec.cwd, s.bash, s.cmd)
        s.ran = true
        -- an Edit just before the Bash call (same second) looks changed by it: keep the Edit's line while the file is as the Edit left it
        local last = it or s.last
        local same = last and last.edit and last.path == p and (last == it or last.mt == stamp(p))
        if p and not same then it = { path = p, tag = "改", at = i, before = snap_of(s.ids, p) } end
      end
    end
  end
  if it then
    it.mt = stamp(it.path)
    s.last = it
  end
  return it, st.mtime
end
local function follow_tick()
  if not follow.on or vim.fn.mode() ~= "n" then return end
  local now = vim.uv.now()
  if next(follow.logs) == nil or now - follow.checked > 10000 then -- agents start and restart; re-find every 10s
    follow.checked = now
    follow.logs = {}
    for _, t in ipairs(JN.agents() or {}) do
      local log = session_log(t)
      -- kept by log, so a missed lookup does not reread an agent's tail
      if log then follow.state[log] = follow.state[log] or { log = log, cmd = "", ids = {} }; follow.logs[log] = t end
    end
  end
  local w = edit_win()
  -- unsaved changes: leave the logs unread, so the switch lands once they are saved or dropped
  if vim.bo[vim.api.nvim_win_get_buf(w)].modified then return end
  local it, newest
  for log, t in pairs(follow.logs) do
    local got, mt = scan(follow.state[log])
    -- two agents in one tick: the one whose log was written last
    if got and (not newest or mt.sec > newest.sec or (mt.sec == newest.sec and mt.nsec > newest.nsec)) then
      it, newest, follow.who = got, mt, t
    end
  end
  if not it then return end -- no dedup: the agent touching the same file again brings you back to it
  follow.last = it
  local dir = norm(vim.fs.dirname(it.path))
  for _, nw in ipairs(tree_wins()) do -- the tree shows the file's folder
    -- re-root the tree there: under the old root, netrw would only set curdir and leave a deep folder collapsed.
    -- Checked on the tree itself, not "folder changed": a rebuilt tree (a new :Lexplore) starts back at cwd
    if (norm(tostring(vim.w[nw].netrw_treetop)):gsub("/$", "")) ~= dir then
      vim.w[nw].netrw_treetop = nil
      vim.api.nvim_win_call(nw, function() vim.cmd("silent Explore " .. vim.fn.fnameescape(dir)) end)
      tree_width()
    end
  end
  vim.api.nvim_win_call(w, function()
    if norm(vim.fn.expand("%:p")) ~= it.path then vim.cmd.edit(vim.fn.fnameescape(it.path)) end
    -- Outside a git repo, unmarked: a Write is all new; a Bash edit diffs against what the file held before the call
    local b = vim.api.nvim_get_current_buf()
    local before = it.tag == "寫" and {} or it.before
    if before and #vim.api.nvim_buf_get_extmarks(b, ns, 0, -1, { limit = 1 }) == 0 and not head_lines(b) then mark(b, before) end
    local at = it.line or (it.tag == "改" and edit_line(b, it.edit))
    if at then -- a Read's offset goes to the top, an edited line to the middle
      pcall(vim.api.nvim_win_set_cursor, w, { math.max(1, math.min(at, vim.api.nvim_buf_line_count(0))), 0 })
      vim.cmd(it.line and "normal! zt" or "normal! zz")
    elseif it.tag ~= "讀" then
      -- a file reloaded while hidden got its marks but no window to scroll; go to the first one now
      local m = vim.api.nvim_buf_get_extmarks(0, ns, 0, -1, { limit = 1 })[1]
      if m then
        vim.api.nvim_win_set_cursor(w, { m[2] + 1, 0 })
        vim.cmd("normal! zz")
      end
    end
  end)
  vim.cmd("redrawstatus!")
end
vim.uv.new_timer():start(1000, 1000, vim.schedule_wrap(function() pcall(follow_tick) end))
-- Title bar above each file: its path, and whether the agent is reading or editing it right now.
function JN.bar()
  if vim.bo.filetype == "netrw" then return "" end
  local name = vim.fn.expand("%:~:.")
  if name == "" then return "" end
  local it = follow.last
  local tag = it and it.path == norm(vim.fn.expand("%:p")) and ("  agent " .. it.tag .. "  ") or ""
  return "%#TabLineSel#" .. tag .. "%#WinBar# " .. name:gsub("%%", "%%%%") .. "%m"
end
vim.o.winbar = "%{%v:lua.JN.bar()%}"
function JN.toggle_follow()
  follow.on = not follow.on
  vim.notify(follow.on and "跟著 agent 開檔：開" or "跟著 agent 開檔：關")
end

function JN.pick()
  local list = JN.agents() or {}
  local t = list[1]
  for _, a in ipairs(list) do -- the agent follow last went with
    if follow.who and a.address == follow.who.address then t = a end
  end
  local items = t and JN.agent_files(t) or {}
  local seen = {}
  for _, it in ipairs(items) do seen[it.path] = true end
  local root = vim.fn.getcwd()
  local git = vim.system({ "git", "-C", root, "status", "--porcelain", "-z" }, { text = true }):wait()
  local top = vim.trim(vim.system({ "git", "-C", root, "rev-parse", "--show-toplevel" }, { text = true }):wait().stdout or "")
  for _, e in ipairs(git.code == 0 and vim.split(git.stdout, "\0", { trimempty = true }) or {}) do
    local path = norm(top .. "/" .. e:sub(4))
    if #e > 3 and not seen[path] and vim.uv.fs_stat(path) then
      seen[path] = true
      table.insert(items, { path = path, tag = "git" })
    end
  end
  if #items == 0 then return vim.notify("agent 還沒讀過或改過檔案，git 也沒有改動", vim.log.levels.WARN) end
  vim.ui.select(items, {
    prompt = "agent 讀過／改過的檔（新的在前）",
    format_item = function(it) return ("%-3s %s"):format(it.tag, vim.fn.fnamemodify(it.path, ":~:.")) end,
  }, function(it)
    if not it then return end
    vim.api.nvim_set_current_win(edit_win())
    vim.cmd.edit(vim.fn.fnameescape(it.path))
  end)
end

-- Comments: a line span kept by an extmark, so it follows later edits.
local cns = vim.api.nvim_create_namespace("jay-nvim-comments")
local notes = {}

function JN.comment(l1, l2)
  local b = vim.api.nvim_get_current_buf()
  vim.ui.input({ prompt = ("註解（第 %d%s 行）："):format(l1, l2 > l1 and ("–" .. l2) or "") }, function(text)
    if not text or text == "" then return end
    local id = vim.api.nvim_buf_set_extmark(b, cns, l1 - 1, 0, {
      end_row = l2, end_col = 0, right_gravity = false, end_right_gravity = true,
      virt_text = { { "  » " .. text, "DiagnosticInfo" } }, virt_text_pos = "eol",
    })
    table.insert(notes, { buf = b, id = id, text = text })
  end)
end

local function resolved()
  local out = {}
  for _, n in ipairs(notes) do
    local pos = vim.api.nvim_buf_is_valid(n.buf) and vim.api.nvim_buf_get_extmark_by_id(n.buf, cns, n.id, { details = true })
    if pos and pos[1] then
      local l1 = pos[1] + 1
      table.insert(out, { n = n, file = vim.api.nvim_buf_get_name(n.buf), l1 = l1, l2 = math.max(l1, pos[3].end_row) })
    end
  end
  table.sort(out, function(a, b) return a.file == b.file and a.l1 < b.l1 or a.file < b.file end)
  return out
end

function JN.list()
  local qf = {}
  for _, c in ipairs(resolved()) do
    table.insert(qf, { filename = c.file, lnum = c.l1, end_lnum = c.l2, text = c.n.text })
  end
  if #qf == 0 then return vim.notify("還沒有註解") end
  vim.fn.setqflist(qf, "r")
  vim.cmd("copen")
end

function JN.drop_here()
  local b, l = vim.api.nvim_get_current_buf(), vim.fn.line(".")
  for i = #notes, 1, -1 do
    local n = notes[i]
    local pos = n.buf == b and vim.api.nvim_buf_get_extmark_by_id(b, cns, n.id, { details = true })
    if pos and pos[1] and pos[1] + 1 <= l and l <= math.max(pos[1] + 1, pos[3].end_row) then
      vim.api.nvim_buf_del_extmark(b, cns, n.id)
      table.remove(notes, i)
    end
  end
end

function JN.message(cwd)
  local list = resolved()
  local function slash(p) return WIN and (p:gsub("\\", "/"):lower()) or p end -- Windows: \ or /, any case
  local prefix = cwd and (slash(cwd):gsub("/$", "") .. "/")
  local lines = { "從編輯器來的註解：", "" }
  for i, c in ipairs(list) do
    local f = slash(c.file)
    local file = prefix and f:sub(1, #prefix) == prefix and c.file:sub(#prefix + 1) or c.file
    table.insert(lines, ("%d. %s:%s"):format(i, file, c.l1 == c.l2 and c.l1 or (c.l1 .. "-" .. c.l2)))
    for _, s in ipairs(vim.api.nvim_buf_get_lines(c.n.buf, c.l1 - 1, math.min(c.l2, c.l1 + 2), false)) do
      table.insert(lines, "   > " .. s)
    end
    table.insert(lines, "   註解：" .. c.n.text)
    table.insert(lines, "")
  end
  table.insert(lines, "請逐條處理，回覆每條改了什麼。")
  return #list > 0 and table.concat(lines, "\n") or nil
end

function JN.send()
  with_agent(function(t)
    local text = JN.message(t.cwd)
    if not text then return vim.notify("還沒有註解") end
    local bin = hc_bin()
    if not bin then return vim.notify("找不到 hc", vim.log.levels.ERROR) end
    local sent = notes
    notes = {}
    vim.notify("送給 " .. t.address .. "（等你停手就送出）")
    -- hc send waits for the person to pause before pressing Enter, so it must not block nvim.
    vim.system({ bin, "send", t.address, text }, { text = true }, vim.schedule_wrap(function(r)
      if r.code ~= 0 then
        notes = vim.list_extend(sent, notes)
        return vim.notify("沒送出去：" .. vim.trim(r.stderr), vim.log.levels.ERROR)
      end
      for _, n in ipairs(sent) do
        if vim.api.nvim_buf_is_valid(n.buf) then vim.api.nvim_buf_del_extmark(n.buf, cns, n.id) end
      end
      vim.notify(("已送出 %d 條註解給 %s"):format(#sent, t.address))
    end))
  end)
end

local map = vim.keymap.set
map("n", "<leader>o", JN.pick, { desc = "agent 讀過／改過的檔" })
map("n", "<D-o>", JN.pick, { desc = "agent 讀過／改過的檔" })
map("n", "<M-o>", JN.pick, { desc = "agent 讀過／改過的檔" }) -- jay-nvim-pick on Windows / Linux (no cmd key)
map("n", "<leader>ac", function() JN.comment(vim.fn.line("."), vim.fn.line(".")) end, { desc = "註解這行" })
function JN.comment_sel()
  local a, b = vim.fn.line("v"), vim.fn.line(".")
  vim.api.nvim_feedkeys(vim.keycode("<Esc>"), "nx", false)
  JN.comment(math.min(a, b), math.max(a, b))
end
map("x", "<leader>ac", JN.comment_sel, { desc = "註解選取的行" })
map("n", "<leader>al", JN.list, { desc = "列出註解" })
map("n", "<leader>ad", JN.drop_here, { desc = "刪掉這行的註解" })
map("n", "<leader>as", JN.send, { desc = "註解送給 agent" })
map("n", "<leader>af", JN.toggle_follow, { desc = "跟著 agent 開檔（開／關）" })

-- Language servers: go to definition, hover, lint errors. Core-launched panes have a bare PATH,
-- and pyright / typescript-language-server are node scripts that need node on it.
-- A server not installed on this machine is skipped. Keys are nvim's defaults (K, grr, grn, gra, [d ]d) plus gd.
-- Never as root: the servers load code from the project (tsserver from its node_modules), which you can write.
if not is_root() then
if not WIN then vim.env.PATH = table.concat({ HOME .. "/.local/bin", "/opt/homebrew/bin", "/usr/local/bin", vim.env.PATH or "" }, ":") end
vim.diagnostic.config({ virtual_text = true, severity_sort = true })
local py_root = { "pyproject.toml", "ruff.toml", "setup.py", ".git" } -- backend/ruff.toml makes backend/ the root, so "from app..." resolves
for name, c in pairs({
  pyright = { cmd = { "pyright-langserver", "--stdio" }, filetypes = { "python" }, root_markers = py_root },
  ruff = { cmd = { "ruff", "server" }, filetypes = { "python" }, root_markers = py_root },
  -- Only where the project has its own TypeScript (node_modules/typescript): the server needs its tsserver, and a
  -- global TypeScript 7 (the Go rewrite) ships none, so elsewhere it fails to start with an error popup.
  ts_ls = { cmd = { "typescript-language-server", "--stdio" },
    filetypes = { "javascript", "javascriptreact", "typescript", "typescriptreact" },
    root_dir = function(b, on_dir)
      local r = vim.fs.root(b, { "tsconfig.json", "package.json", ".git" })
      if r and vim.uv.fs_stat(r .. "/node_modules/typescript/lib/tsserver.js") then on_dir(r) end
    end },
}) do
  if vim.fn.executable(c.cmd[1]) == 1 then vim.lsp.config(name, c); vim.lsp.enable(name) end
end
map("n", "gd", function() JN.definition() end, { desc = "跳到定義" })
end

-- gd opens the file with :edit, the way any file is opened: nvim's own jump (nvim_win_set_buf) stops with E325
-- when another pane's nvim holds the file's swap file (neovim #25272); :edit only notes it (W325).
function JN.on_list(o)
  local items = o.items or {}
  if #items == 0 then return end
  if #items > 1 then
    vim.fn.setqflist({}, " ", o)
    return vim.cmd("botright copen")
  end
  local it = items[1]
  vim.cmd("normal! m'") -- so <C-o> and the back button come back here
  if vim.fn.fnamemodify(it.filename, ":p") ~= api.nvim_buf_get_name(0) then vim.cmd.edit(vim.fn.fnameescape(it.filename)) end
  pcall(api.nvim_win_set_cursor, 0, { it.lnum, math.max(it.col - 1, 0) })
  vim.cmd("normal! zv")
end
function JN.definition() vim.lsp.buf.definition({ on_list = JN.on_list }) end

-- Mouse. Rest it on a name to see its type, on an error to read it
-- (hover.nvim's way); right-click lists the same in Chinese.
-- No key Herdr uses is taken. Herdr keeps right-click for its own menu unless the pane asks for it (Shift+right-click
-- still opens Herdr's), passes plain moves once nvim turns on mousemoveevent, and never passes the side buttons.
vim.o.mousemoveevent = true
if hc_bin() and vim.env.HC_TERMINAL_ID then vim.system({ hc_bin(), "label", vim.env.HC_TERMINAL_ID, "herdr.right-click=program" }) end
vim.o.mouse = "a" -- also the command line: a click picks from <leader>o's list and the comment-send choice
local hov = { timer = vim.uv.new_timer() }
local function hover_close()
  if hov.win and api.nvim_win_is_valid(hov.win) then api.nvim_win_close(hov.win, true) end
  hov.win = nil
end
-- m: vim.fn.getmousepos()
function JN.hover_at(m)
  if m.winid == 0 or m.line == 0 or not api.nvim_win_is_valid(m.winid) then return end
  local b = api.nvim_win_get_buf(m.winid)
  if vim.bo[b].buftype ~= "" then return end
  local row, col = m.line - 1, m.column - 1
  local text = api.nvim_buf_get_lines(b, row, row + 1, false)[1] or ""
  if col >= #text then return end -- past the end of the line
  local opts = { relative = "mouse", focusable = false, focus = false, border = "rounded", max_width = 80, max_height = 20 }
  for _, d in ipairs(vim.diagnostic.get(b, { lnum = row })) do
    if d.col <= col and ((d.end_lnum or row) > row or col < math.max(d.end_col or 0, d.col + 1)) then
      _, hov.win = vim.diagnostic.open_float(b, vim.tbl_extend("force", opts, { scope = "cursor", pos = { row, col } }))
      return
    end
  end
  local key = hov.key
  if not vim.lsp.get_clients({ bufnr = b, method = "textDocument/hover" })[1] then return end
  vim.lsp.buf_request_all(b, "textDocument/hover", function(client)
    return { textDocument = { uri = vim.uri_from_bufnr(b) },
      position = { line = row, character = vim.str_utfindex(text, client.offset_encoding, col, false) } }
  end, function(results)
    if hov.key ~= key then return end -- the mouse moved on
    for _, r in pairs(results) do
      local c = r.result and r.result.contents
      local lines = c and vim.split(vim.trim(table.concat(vim.lsp.util.convert_input_to_markdown_lines(c), "\n")), "\n") or { "" }
      if lines[1] ~= "" then
        _, hov.win = vim.lsp.util.open_floating_preview(lines, "markdown", opts)
        return
      end
    end
  end)
end
map("n", "<MouseMove>", function()
  local m = vim.fn.getmousepos()
  if hov.win and m.winid == hov.win then return end -- reading the float
  local text = m.line > 0 and api.nvim_win_is_valid(m.winid)
    and api.nvim_buf_get_lines(api.nvim_win_get_buf(m.winid), m.line - 1, m.line, false)[1] or ""
  -- the word under the mouse: moving within it keeps the float
  local key = m.winid .. ":" .. m.line .. ":" .. (text:sub(1, m.column):find("[%w_]*$") or 0)
  if key == hov.key then return end
  hov.key = key
  hover_close()
  hov.timer:stop()
  hov.timer:start(600, 0, vim.schedule_wrap(function()
    if hov.key == key and vim.fn.mode() == "n" then JN.hover_at(vim.fn.getmousepos()) end
  end))
end, { desc = "滑鼠停著：看型別或錯誤" })
-- The list at the bottom (all errors, or several definitions): one key opens and closes it, q closes it from inside
function JN.toggle_list()
  for _, w in ipairs(vim.fn.getwininfo()) do
    if w.quickfix == 1 and w.tabnr == vim.fn.tabpagenr() then return vim.cmd("cclose") end
  end
  vim.cmd("botright copen")
end
map("n", "<leader>q", JN.toggle_list, { desc = "下面的清單（開／關）" })
api.nvim_create_autocmd("FileType", { pattern = "qf", callback = function(a)
  map("n", "q", "<Cmd>cclose<CR>", { buffer = a.buf, desc = "關掉清單" })
end })
-- Right-click (mousemodel popup_setpos puts the cursor there first): nvim's menu, in Chinese, with the
-- language items on top. Its own MenuPopup handler names the English items, so it goes too.
vim.cmd([[
  aunmenu PopUp
  nnoremenu PopUp.看型別 <Cmd>lua vim.lsp.buf.hover()<CR>
  nnoremenu PopUp.跳到定義 <Cmd>lua JN.definition()<CR>
  nnoremenu PopUp.找所有用到的地方 <Cmd>lua vim.lsp.buf.references()<CR>
  nnoremenu PopUp.改名 <Cmd>lua vim.lsp.buf.rename()<CR>
  nnoremenu PopUp.跳回上一個位置 <C-o>
  nnoremenu PopUp.列出所有錯誤 <Cmd>lua vim.diagnostic.setqflist()<CR>
  nnoremenu PopUp.關掉錯誤清單 <Cmd>cclose<CR>
  anoremenu PopUp.-agent- <Nop>
  nnoremenu PopUp.agent\ 讀過／改過的檔 <Cmd>lua JN.pick()<CR>
  nnoremenu PopUp.跟著\ agent\ 開檔（開／關） <Cmd>lua JN.toggle_follow()<CR>
  nnoremenu PopUp.註解這行 <Cmd>lua JN.comment(vim.fn.line("."), vim.fn.line("."))<CR>
  vnoremenu PopUp.註解選取的行 <Cmd>lua JN.comment_sel()<CR>
  nnoremenu PopUp.刪掉這行的註解 <Cmd>lua JN.drop_here()<CR>
  nnoremenu PopUp.列出註解 <Cmd>lua JN.list()<CR>
  nnoremenu PopUp.註解送給\ agent <Cmd>lua JN.send()<CR>
  anoremenu PopUp.-1- <Nop>
  vnoremenu PopUp.剪下 "+x
  vnoremenu PopUp.複製 "+y
  anoremenu PopUp.貼上 "+gP
  vnoremenu PopUp.貼上 "+P
  nnoremenu PopUp.全選 ggVG
  vnoremenu PopUp.全選 gg0oG$
  amenu PopUp.開網址 gx
]])
api.nvim_create_autocmd("MenuPopup", { group = api.nvim_create_augroup("nvim.popupmenu", { clear = true }), callback = function()
  local lsp = vim.lsp.get_clients({ bufnr = 0 })[1] and "enable" or "disable"
  for _, n in ipairs({ "看型別", "跳到定義", "找所有用到的地方", "改名" }) do vim.cmd("nmenu " .. lsp .. " PopUp." .. n) end
  vim.cmd("nmenu " .. (next(vim.diagnostic.count()) and "enable" or "disable") .. " PopUp.列出所有錯誤")
  local open = vim.tbl_contains(vim.tbl_map(function(w) return w.quickfix end, vim.fn.getwininfo()), 1)
  vim.cmd("nmenu " .. (open and "enable" or "disable") .. " PopUp.關掉錯誤清單")
  local url = require("vim.ui")._get_urls()[1]
  vim.cmd("amenu " .. (url and vim.startswith(url, "http") and "enable" or "disable") .. " PopUp.開網址")
end })`;
