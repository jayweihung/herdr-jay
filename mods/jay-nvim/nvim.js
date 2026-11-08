// The Lua the mod hands nvim at start (`nvim -c "lua ..."`): it runs on whichever machine
// the pane opens on, and that machine has no copy of this mod.
//
// - reload: an agent edits files beside this pane; nvim only rereads on focus or :checktime,
//   so a timer checks every second, and each reload is diffed so the changed lines stand out
// - tree: netrw on the right
// - agent: <leader>o lists the files the agent beside read or edited; <leader>ac/al/ad/as
//   comment lines and send the comments to it with hc send
// - lsp: go to definition, hover and lint errors from whichever servers this machine has (not as root)
export const NVIM_INIT = String.raw`if vim.fn.has("nvim-0.11") == 0 then
  vim.api.nvim_echo({ { "jay-nvim needs Neovim 0.11 or newer (this is " .. tostring(vim.version()) .. ")", "ErrorMsg" } }, true, {})
  return
end
-- Run again (:source on Windows): stop the old timers, autocmds are in one cleared group.
local PREV = _G.JN
if PREV and PREV.timers then for _, t in ipairs(PREV.timers) do pcall(function() t:stop() t:close() end) end end
local AUG = vim.api.nvim_create_augroup("jay-nvim", { clear = true })
local TIMERS = {}
local function new_timer() local t = vim.uv.new_timer() TIMERS[#TIMERS + 1] = t return t end
local JN = { timers = TIMERS }
_G.JN = JN -- now, so a later error still leaves the timers stoppable
-- autoread would reload before FileChangedShell fires, leaving nothing to diff against
vim.o.autoread = false
-- ===================================== PLATFORM =====================================
-- Every difference between operating systems lives in this table P; nothing below tests the OS.
-- The facts are about the machine nvim runs on, which may not be the one Herdr runs on (a pane can open
-- on another machine). macOS and Linux share the "unix" side; Windows has its own.
local P = { win = vim.fn.has("win32") == 1 }
-- Home: like node (so like Claude Code). Windows: USERPROFILE, not nvim's HOMEDRIVE guess (often a network drive).
P.home = P.win and vim.uv.os_homedir() or vim.env.HOME or vim.uv.os_homedir() or ""
-- One spelling per file. Windows: nvim, git and the agent mix \ and / and drive-letter case, so C:/x/y.
function P.norm(p)
  if not P.win or type(p) ~= "string" then return p end
  return ((p:gsub("\\", "/"):gsub("^(%a):", function(d) return d:upper() .. ":" end)))
end
-- For comparing two paths: Windows file names ignore case.
function P.key(p)
  p = P.norm(p)
  return (P.win and type(p) == "string") and p:lower() or p
end
P.root = not P.win and vim.uv.getuid() == 0
-- A root (sudo'd) agent beside this pane can be detected on unix (its process tree); Windows has no such case.
P.sudo_check = not P.win
-- Windows runs a program found in the current folder before PATH (nvim, libuv and cmd.exe all do). The current
-- folder is usually the agent's project, which may be someone else's code: never run a program from it.
if P.win then vim.env.NoDefaultCurrentDirectoryInExePath = "1" end
function P.bin(name)
  local p = vim.fn.exepath(name)
  if p == "" then return nil end
  if P.win then -- the folder itself (a "." or relative PATH entry), not everything under it (scoop / npm live under home)
    local dir = P.key(vim.fs.dirname(P.norm(vim.fn.fnamemodify(p, ":p")))):gsub("/$", "")
    if dir == P.key(vim.fn.getcwd()):gsub("/$", "") then return nil end
  end
  return p
end
-- Where hc may be when PATH doesn't have it (Herdr starts panes with a bare PATH).
P.hc_paths = P.win and { (vim.env.LOCALAPPDATA or "") .. "/Programs/herdr-core/herdr-core.exe" }
  or { P.home .. "/.local/bin/hc", "/opt/homebrew/bin/hc", "/usr/local/bin/hc" }
-- Folders put in front of PATH for language servers (unix: Homebrew and ~/.local/bin; Windows: PATH as it is).
P.extra_path = not P.win and { P.home .. "/.local/bin", "/opt/homebrew/bin", "/usr/local/bin" } or nil
P.path_sep = P.win and ";" or ":"
-- Absolute paths a shell command names. Windows: C:\x, C:/x, and Git Bash's /c/x.
local NAME = "[^%s'\"<>|;&()=]+"
function P.abs_paths(cmd)
  local out = {}
  cmd = type(cmd) == "string" and cmd or ""
  local function add(p) out[#out + 1] = p end
  -- quoted strings first, whole (paths with spaces), then the rest of the command word by word
  local rest = cmd:gsub([=[(["'])(.-)%1]=], function(_, q)
    if P.win and q:match("^%a:[\\/]") then add(P.norm(q))
    elseif P.win and q:match("^/%a/") then add(q:sub(2, 2):upper() .. ":" .. q:sub(3))
    elseif not P.win and q:match("^/") then add(q) end
    return " " .. q:gsub("[\"']", " ") .. " " -- and the words inside it (python -c "open('/tmp/x')")
  end)
  for w in rest:gmatch(NAME) do
    if P.win and w:match("^%a:[\\/]") then add(P.norm(w))
    elseif P.win and w:match("^/%a/") then add(w:sub(2, 2):upper() .. ":" .. w:sub(3))
    elseif not P.win and w:match("^/") then add(w) end
  end
  return out
end
-- The Claude Code session of the agent in a pane: { pid = n } from ~/.claude/sessions/<pid>.json, or the file's table.
-- unix: the pane's foreground pid; under sudo there is none, so walk the pane's process tree (pgrep).
-- Windows: Herdr starts agents through pwsh (or npm's claude.cmd), so the pid is the shell's: take the live session
-- whose folder is the pane's, active last. shortcut: two Claude Codes in one folder may swap.
function P.session(info, t)
  local function read(f)
    local h = io.open(f)
    if not h then return nil end
    local ok, d = pcall(vim.json.decode, h:read("*a"))
    h:close()
    return ok and type(d) == "table" and d or nil
  end
  local dir = P.home .. "/.claude/sessions/"
  local pid = type(info) == "table" and info.foreground and info.foreground.pid
  if not P.win then
    if not pid and type(info) == "table" and info.pid then
      local todo = { tostring(info.pid) }
      while not pid and #todo > 0 do
        for c in (vim.system({ "pgrep", "-P", table.remove(todo, 1) }, { text = true }):wait().stdout or ""):gmatch("%d+") do
          if vim.uv.fs_stat(dir .. c .. ".json") then pid = tonumber(c) break end
          todo[#todo + 1] = c
        end
      end
    end
    return pid and read(dir .. pid .. ".json")
  end
  local s = pid and read(dir .. pid .. ".json")
  if s or type(t.cwd) ~= "string" then return s end
  local want = P.key(t.cwd):gsub("/$", "")
  for _, f in ipairs(vim.fn.glob(dir .. "*.json", false, true)) do
    local d = read(f)
    if d and type(d.cwd) == "string" and type(d.pid) == "number" and P.key(d.cwd):gsub("/$", "") == want
      and vim.uv.kill(d.pid, 0) == 0 and (not s or (tonumber(d.updatedAt) or 0) > (tonumber(s.updatedAt) or 0)) then
      s = d
    end
  end
  return s
end
-- The Herdr pane of another process (for "another nvim has this file"): Linux reads its environment; elsewhere unknown.
function P.pane_of_pid(pid)
  if P.win or not vim.uv.fs_stat("/proc/self") then return nil end -- Windows would read C:\proc\...
  local env = io.open("/proc/" .. pid .. "/environ")
  if not env then return nil end
  local pane = env:read("*a"):match("HC_TERMINAL_ID=([^%z]+)")
  env:close()
  return pane
end
-- ================================== end of PLATFORM ==================================

local HOME, norm = P.home, P.norm
-- git found on PATH only (nil: rejected or missing, and then every git feature is skipped: a bare "git" could be
-- looked up in the project folder again on Windows).
local GIT = P.bin("git")
-- A repo may be someone else's code, and git status / ls-files run what its own .git/config names: the
-- core.fsmonitor hook, and clean filters (filter.<x>.clean / process, picked by .gitattributes). Reading the config
-- runs nothing; every git call here switches those off for that repo (its own config only: your global ones, e.g. git-lfs, stay). Only for nvim's own git calls, not :terminal.
local function git_guard(dir)
  local out = { "-c", "core.fsmonitor=false" }
  local r = vim.system({ GIT, "-C", dir, "config", "--local", "--name-only", "--get-regexp", [[^filter\.]] }, { text = true }):wait()
  local seen = {}
  for key in (r.stdout or ""):gmatch("[^\n]+") do
    local name = key:match("^filter%.(.+)%.[^.]+$")
    if name and not seen[name] then
      seen[name] = true
      for _, k in ipairs({ "clean", "smudge", "process" }) do vim.list_extend(out, { "-c", "filter." .. name .. "." .. k .. "=" }) end
    end
  end
  return out
end
local NOGIT = { wait = function() return { code = 1, stdout = "", stderr = "git not found" } end }
local function git(dir, args, opts)
  if not GIT then return NOGIT end
  return vim.system(vim.list_extend(vim.list_extend({ GIT, "-C", dir }, git_guard(dir)), args), opts or {})
end
local api, ns, old = vim.api, vim.api.nvim_create_namespace("jay-nvim-changes"), {}
api.nvim_create_autocmd("FileChangedShell", { group = AUG, callback = function(a)
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
  local r = git(dir, { "show", "HEAD:./" .. name }, { text = true }):wait()
  if r.code == 0 then return vim.split(r.stdout, "\n", { plain = true, trimempty = false }) end
  if git(dir, { "rev-parse", "--is-inside-work-tree" }):wait().code == 0 then return {} end
end
local function mark_head(b)
  local before = head_lines(b)
  if not before then return end
  if before[#before] == "" then before[#before] = nil end
  mark(b, before)
end
api.nvim_create_autocmd({ "BufReadPost", "BufWritePost" }, { group = AUG, callback = function(a)
  if not old[a.buf] then pcall(mark_head, a.buf) end
end })
api.nvim_create_autocmd("FileChangedShellPost", { group = AUG, callback = function(a)
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
new_timer():start(1000, 1000, vim.schedule_wrap(function()
  if vim.fn.mode() ~= "c" then vim.cmd("silent! checktime") end
end))
-- Another pane's nvim has this file open too: say which, the first time you change it here (Emacs's file locks).
-- Saving still checks the disk (FileChangedShell above); this is the early heads-up.
local function other_nvims(b)
  local path, mine, out = P.key(api.nvim_buf_get_name(b)), vim.fn.swapname(b), {}
  -- the same file's other swap files sit beside ours (.swp .swo ...); swapfilelist() doubles the folder in 0.12
  local swaps = {}
  if mine ~= "" then
    local dir, stem = vim.fs.dirname(mine), vim.fs.basename(mine):sub(1, -4) -- "...file." without "swp"
    for name in vim.fs.dir(dir) do
      if #name == #stem + 3 and name:sub(1, #stem) == stem and name:sub(-3, -3) == "s" then swaps[#swaps + 1] = dir .. "/" .. name end
    end
  end
  for _, sw in ipairs(swaps) do
    local ok, i = pcall(vim.fn.swapinfo, sw)
    if ok and type(i) == "table" and i.pid and i.pid ~= vim.fn.getpid() and type(i.fname) == "string"
      and P.key(vim.fn.fnamemodify(i.fname, ":p")) == path and vim.uv.kill(i.pid, 0) == 0 then
      out[#out + 1] = P.pane_of_pid(i.pid) or ("pid " .. i.pid)
    end
  end
  return out
end
local warned = {}
api.nvim_create_autocmd("BufModifiedSet", { group = AUG, callback = function(a)
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
  if not GIT then error("no git") end
  -- netrw runs plain "git ls-files" through the shell: give it the same guard, then restore the environment
  local keep = { vim.env.GIT_CONFIG_COUNT, vim.env.GIT_CONFIG_KEY_0, vim.env.GIT_CONFIG_VALUE_0 }
  if not keep[1] then vim.env.GIT_CONFIG_COUNT, vim.env.GIT_CONFIG_KEY_0, vim.env.GIT_CONFIG_VALUE_0 = "1", "core.fsmonitor", "false" end
  local ok, h = pcall(vim.fn["netrw_gitignore#Hide"])
  vim.env.GIT_CONFIG_COUNT, vim.env.GIT_CONFIG_KEY_0, vim.env.GIT_CONFIG_VALUE_0 = keep[1], keep[2], keep[3]
  if not ok then error(h) end
  vim.g.netrw_list_hide = (vim.v.shell_error == 0 and h ~= "" and h .. "," or "") .. [[^\.\.\=/\=$]]
end)
local function has_tree()
  for _, w in ipairs(api.nvim_tabpage_list_wins(0)) do
    if vim.bo[api.nvim_win_get_buf(w)].filetype == "netrw" then return true end
  end
end
-- ! puts the tree on the right; the file window keeps focus. Lexplore toggles: not again on a re-run.
if not has_tree() then vim.cmd("Lexplore! | wincmd h") end
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
api.nvim_create_autocmd("VimResized", { group = AUG, callback = tree_width })
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
        if P.key((norm(top):gsub("/$", "")) .. "/" .. table.concat(stack, "/", 1, depth)) == P.key(path) then
          api.nvim_buf_set_extmark(b, tree_ns, i - 1, 0, { line_hl_group = "QtTreeCur" })
          api.nvim_win_set_cursor(w, { i, 0 })
          break
        end
      end
    end
  end
end
api.nvim_create_autocmd("BufWinEnter", { group = AUG, callback = function(a)
  if vim.bo[a.buf].buftype ~= "" then return end -- the tree itself is a nofile buffer
  local path = norm(api.nvim_buf_get_name(a.buf))
  vim.schedule(function() tree_mark(path) end) -- after netrw finishes moving its own cursor
end })

-- The agent beside this nvim: the one non-shell terminal in the same Herdr tab (hc ls "where").
-- Comment spans and the message shape follow herdr-nvim (MIT, ChmaraX/herdr-nvim lua/herdr-nvim).
if vim.g.mapleader == nil then vim.g.mapleader = " " end
local home = HOME
-- Coding agents (hc's agent name). Only these get comments typed into them: anything else (a shell, ssh, a REPL)
-- would run the quoted lines as commands.
local AGENTS = { ["claude-code"] = 1, codex = 1, gemini = 1, opencode = 1, pi = 1, aider = 1, amp = 1, goose = 1,
  crush = 1, ["cursor-agent"] = 1, copilot = 1, qwen = 1 }
local function is_agent(name) return AGENTS[((tostring(name):match("[^/\\]+$") or ""):lower():gsub("%.exe$", ""))] end

local hc_found
local function hc_bin()
  if hc_found then return hc_found end
  for _, name in ipairs({ "hc", "herdr-core" }) do -- Windows installs herdr-core.exe; hc.exe only if no hc existed
    hc_found = P.bin(name)
    if hc_found then return hc_found end
  end
  for _, p in ipairs(P.hc_paths) do
    if vim.fn.executable(p) == 1 then hc_found = p return p end
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
  local function tab_of(addr)
    local g = hc({ "get", addr })
    return type(g) == "table" and type(g.labels) == "table" and g.labels["herdr.tab"] or nil
  end
  local where
  for _, t in ipairs(ls.terminals or {}) do
    if t.address == me then where = t.where end
  end
  local out, mytab = {}, nil
  for _, t in ipairs(ls.terminals or {}) do
    -- "where" is "space / tab name" and names repeat: confirm the same tab by its id
    if where and t.where == where and t.address ~= me and t.state == "live" and is_agent(t.agent) then
      if mytab == nil then mytab = tab_of(me) or false end
      if not mytab or tab_of(t.address) == mytab then table.insert(out, t) end
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
  local s = P.session(hc({ "get", t.address }), t)
  return s and s.sessionId and vim.fn.glob(("%s/.claude/projects/*/%s.jsonl"):format(home, s.sessionId), false, true)[1]
end

-- An agent started under sudo: hc can't see its foreground and its log is root's, so nothing can be followed.
-- Say so once (no root handoff: an editor run as root, reachable by anything that can type into a pane, is a root door).
local function runs_as_root(t)
  if not P.sudo_check or P.root or t.agent ~= "claude-code" then return false end
  local info = hc({ "get", t.address })
  return type(info) == "table" and not info.foreground and info.pid ~= nil
    and vim.system({ "pgrep", "-u", "0", "-P", tostring(info.pid) }):wait().code == 0
end
-- A new pane has no "where" in hc ls for its first seconds, so keep asking for 10s until a claude-code agent shows up.
local root_probe, root_tries = new_timer(), 0
if P.sudo_check and not P.root then root_probe:start(0, 1000, vim.schedule_wrap(function()
  root_tries = root_tries + 1
  local agent = (JN.agents() or {})[1]
  if agent and runs_as_root(agent) then
    vim.notify("旁邊的 agent 用 root（sudo）在跑：它的紀錄只有 root 讀得到，jay-nvim 讀不到，所以跟不到它讀／改的檔", vim.log.levels.WARN)
  end
  if (agent and agent.agent == "claude-code") or root_tries >= 10 then root_probe:stop() end
end)) end

-- Bytes of the log from offset "from" (or the last "bytes") to the end.
local function read_log(log, bytes, from)
  local h = log and io.open(log, "rb")
  if not h then return nil end
  local size = h:seek("end")
  local start = h:seek("set", from or math.max(0, size - bytes))
  local text = h:read("*a")
  h:close()
  return text, start
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
        if path and not seen[P.key(path)] and vim.uv.fs_stat(path) then
          seen[P.key(path)] = true
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
  for _, p in ipairs(P.abs_paths(cmd)) do
    n = n + 1
    if n > 20 then break end
    local t = (vim.uv.fs_stat(p) or {}).type
    if t == "file" then consider(p); dirs[#dirs + 1] = vim.fs.dirname(p) elseif t == "directory" then dirs[#dirs + 1] = p end
  end
  local seen = {}
  for _, d in ipairs(dirs) do
    local top = git(d, { "rev-parse", "--show-toplevel" }, { text = true }):wait()
    top = top.code == 0 and vim.trim(top.stdout)
    if top and not seen[top] then
      seen[top] = true
      local files = git(top, { "-c", "core.quotepath=off", "ls-files", "-m", "-o", "--exclude-standard" }, { text = true }):wait().stdout or ""
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
local follow = { on = true, logs = {}, state = {}, checked = -1e9, last = nil, who = nil }
-- One agent's log since the last tick: the newest file it read or edited, or nil. s keeps that log's place.
local function scan(s)
  local st = vim.uv.fs_stat(s.log)
  if not st or st.size == s.pos then return end
  -- Read only what was appended since the last tick: a window on the tail misses the tool call
  -- when Claude Code writes a big attachment (rules, request blobs: up to 1.5MB) right after it.
  local first = s.pos and 1 or 2 -- a tail window may start mid-record
  local text, start = read_log(s.log, 256 * 1024, s.pos and math.min(s.pos, st.size))
  text = text or ""
  local cut = text:match(".*()\n") -- keep a half-written last record for the next tick
  if not cut or not start then return end
  s.pos = start + cut
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
  if now - follow.checked > (next(follow.logs) == nil and 3000 or 10000) then -- agents start and restart: re-find (3s while none)
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
    if P.key((norm(tostring(vim.w[nw].netrw_treetop)):gsub("/$", ""))) ~= P.key(dir) then
      vim.w[nw].netrw_treetop = nil
      vim.api.nvim_win_call(nw, function() vim.cmd("silent Explore " .. vim.fn.fnameescape(dir)) end)
      tree_width()
    end
  end
  vim.api.nvim_win_call(w, function()
    if P.key(vim.fn.expand("%:p")) ~= P.key(it.path) then vim.cmd.edit(vim.fn.fnameescape(it.path)) end
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
new_timer():start(1000, 1000, vim.schedule_wrap(function() pcall(follow_tick) end))
-- Title bar above each file: its path, and whether the agent is reading or editing it right now.
function JN.bar()
  if vim.bo.filetype == "netrw" then return "" end
  local name = vim.fn.expand("%:~:.")
  if name == "" then return "" end
  local it = follow.last
  local tag = it and P.key(it.path) == P.key(vim.fn.expand("%:p")) and ("  agent " .. it.tag .. "  ") or ""
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
  for _, it in ipairs(items) do seen[P.key(it.path)] = true end
  local root = vim.fn.getcwd()
  local st = git(root, { "status", "--porcelain", "-z" }, { text = true }):wait()
  local top = vim.trim(git(root, { "rev-parse", "--show-toplevel" }, { text = true }):wait().stdout or "")
  local skip = false
  for _, e in ipairs(st.code == 0 and vim.split(st.stdout, "\0", { trimempty = true }) or {}) do
    local path = norm(top .. "/" .. e:sub(4))
    local renamed = e:match("^[RC]") or e:match("^.[RC]")
    if skip then skip = false -- the old path of a rename / copy: a bare path, no status letters
    else
      if #e > 3 and not seen[P.key(path)] and vim.uv.fs_stat(path) then
        seen[P.key(path)] = true
        table.insert(items, { path = path, tag = "git" })
      end
      skip = renamed and true or false
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
local notes = PREV and PREV.notes_list and PREV.notes_list() or {} -- a re-run keeps unsent comments
function JN.notes_list() return notes end

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
  -- Control characters from a file or a comment would reach the agent's terminal as keys (Enter, Esc, Ctrl-C):
  -- drop them; tabs stay.
  local function clean(x) return (tostring(x):gsub("[%z\1-\8\11-\31\127]", "")) end
  local prefix = cwd and (P.key(cwd):gsub("/$", "") .. "/")
  local lines = { "從編輯器來的註解：", "" }
  for i, c in ipairs(list) do
    local f = P.key(c.file)
    local file = prefix and f:sub(1, #prefix) == prefix and c.file:sub(#prefix + 1) or c.file
    table.insert(lines, ("%d. %s:%s"):format(i, clean(file), c.l1 == c.l2 and c.l1 or (c.l1 .. "-" .. c.l2)))
    for _, s in ipairs(vim.api.nvim_buf_get_lines(c.n.buf, c.l1 - 1, math.min(c.l2, c.l1 + 2), false)) do
      s = clean(s)
      table.insert(lines, "   > " .. (vim.fn.strchars(s) > 200 and (vim.fn.strcharpart(s, 0, 200) .. " …") or s))
    end
    table.insert(lines, "   註解：" .. clean(c.n.text))
    table.insert(lines, "")
  end
  table.insert(lines, "請逐條處理，回覆每條改了什麼。")
  local text = table.concat(lines, "\n")
  if #text > 16000 then text = text:sub(1, 16000 + vim.str_utf_start(text, 16001)) .. "\n…（太長，後面截掉了；請分批送）" end -- Windows command line: 32767
  return #list > 0 and text or nil
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
-- jay-nvim-pick presses <M-o> (alt+o) in whatever mode nvim is in; <D-o> is cmd-o typed in nvim on a Mac.
-- It sends no Esc first: in a legacy-keyboard terminal Esc + Alt-o can read as <M-Esc> then "o" (a new line).
for _, k in ipairs({ "<D-o>", "<M-o>" }) do
  map("n", k, JN.pick, { desc = "agent 讀過／改過的檔" })
  map({ "i", "x", "s", "o", "c" }, k, function() vim.api.nvim_feedkeys(vim.keycode("<C-\\><C-n>"), "nx", false) JN.pick() end, { desc = "agent 讀過／改過的檔" })
end
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
-- pyright runs the project's Python (its venv) and ts_ls the project's own tsserver: both run the project's code,
-- so they start only in folders you trust (:JayTrust, kept in ~/.config/jay-nvim/trust). ruff only reads files.
if not P.root then
if P.extra_path and (vim.env.PATH or ""):sub(1, #P.extra_path[1]) ~= P.extra_path[1] then
  vim.env.PATH = table.concat(vim.list_extend(vim.list_extend({}, P.extra_path), { vim.env.PATH or "" }), P.path_sep)
end
local TRUST = HOME .. "/.config/jay-nvim/trust"
local function trusted(dir)
  local d = P.key(dir):gsub("/$", "") .. "/"
  for _, line in ipairs(vim.fn.filereadable(TRUST) == 1 and vim.fn.readfile(TRUST) or {}) do
    local t = P.key(vim.trim(line)):gsub("/$", "") .. "/"
    local h = P.key(HOME):gsub("/$", "") .. "/"
    -- a line for home or above (or a drive) would trust every project: ignored
    if t ~= "/" and not t:match("^%a:/$") and h:sub(1, #t) ~= t and d:sub(1, #t) == t then return true end
  end
end
local told = {}
local function only_trusted(markers, need)
  return function(b, on_dir)
    local r = vim.fs.root(b, markers)
    if not r or (need and not need(r)) then return end
    if trusted(r) then return on_dir(r) end
    if not told[r] then
      told[r] = true
      vim.notify(("pyright / TypeScript 沒啟動（K 不會顯示型別）：%s 還沒信任（它們會跑專案的程式碼）。\n要啟用：打 :JayTrust 按 Enter，再打 :e 重開檔案。每個專案只要一次。"):format(r), vim.log.levels.WARN)
    end
  end
end
vim.api.nvim_create_user_command("JayTrust", function(o)
  local r = o.args ~= "" and vim.fn.fnamemodify(o.args, ":p") or vim.fs.root(0, { "pyproject.toml", "setup.py", "tsconfig.json", "package.json", ".git" }) or vim.fn.getcwd()
  local k, h = P.key(r):gsub("/$", ""), P.key(HOME):gsub("/$", "")
  -- subfolders count: trusting home or a drive would trust every project
  if k == "" or k:match("^%a:$") or h:sub(1, #k + 1) == k .. "/" or k == h then
    return vim.notify("不信任 " .. r .. "：這是家目錄或更上層，等於信任所有專案。請在專案資料夾裡打 :JayTrust，或 :JayTrust <專案資料夾>", vim.log.levels.WARN)
  end
  vim.fn.mkdir(vim.fs.dirname(TRUST), "p")
  vim.fn.writefile({ r }, TRUST, "a")
  vim.notify("已信任 " .. r .. "（重開這個檔就會啟動）")
end, { nargs = "?", complete = "dir", desc = "信任這個專案：pyright / TypeScript 可以在這裡啟動" })
vim.diagnostic.config({ virtual_text = true, severity_sort = true })
local py_root = { "pyproject.toml", "ruff.toml", "setup.py", ".git" } -- backend/ruff.toml makes backend/ the root, so "from app..." resolves
for name, c in pairs({
  pyright = { cmd = { "pyright-langserver", "--stdio" }, filetypes = { "python" }, root_dir = only_trusted(py_root) },
  ruff = { cmd = { "ruff", "server" }, filetypes = { "python" }, root_markers = py_root },
  -- Only where the project has its own TypeScript (node_modules/typescript): the server needs its tsserver, and a
  -- global TypeScript 7 (the Go rewrite) ships none, so elsewhere it fails to start with an error popup.
  ts_ls = { cmd = { "typescript-language-server", "--stdio" },
    filetypes = { "javascript", "javascriptreact", "typescript", "typescriptreact" },
    root_dir = only_trusted({ "tsconfig.json", "package.json", ".git" },
      function(r) return vim.uv.fs_stat(r .. "/node_modules/typescript/lib/tsserver.js") end) },
}) do
  local exe = P.bin(c.cmd[1]) -- the full path: never a program sitting in the project folder
  if exe then c.cmd[1] = exe; vim.lsp.config(name, c); vim.lsp.enable(name) end
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
  if P.key(vim.fn.fnamemodify(it.filename, ":p")) ~= P.key(api.nvim_buf_get_name(0)) then vim.cmd.edit(vim.fn.fnameescape(it.filename)) end
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
local hov = { timer = new_timer() }
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
api.nvim_create_autocmd("FileType", { group = AUG, pattern = "qf", callback = function(a)
  map("n", "q", "<Cmd>cclose<CR>", { buffer = a.buf, desc = "關掉清單" })
end })
-- Right-click (mousemodel popup_setpos puts the cursor there first): nvim's menu, in Chinese, with the
-- language items on top. Its own MenuPopup handler names the English items, so it goes too.
vim.cmd([[
  silent! aunmenu PopUp
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
