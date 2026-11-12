// The Lua the mod hands nvim at start (`nvim -c "lua ..."`): it runs on whichever machine
// the pane opens on, and that machine has no copy of this mod.
//
// - reload: an agent edits files beside this pane; nvim only rereads on focus or :checktime,
//   so a timer checks every second, and each reload is diffed so the changed lines stand out
// - tree: netrw on the right
// - agent: <leader>o lists the files the agent beside read or edited; <leader>ac/al/ad/as
//   comment lines and send the comments to it with hc send
// - lsp: go to definition, hover and lint errors from whichever servers this machine has (not as root)
const PATH_RULES = String.raw`local P = { win = vim.fn.has("win32") == 1 }
-- Home: like node (so like Claude Code). Windows: USERPROFILE, not nvim's HOMEDRIVE guess (often a network drive).
P.home = P.win and vim.uv.os_homedir() or vim.env.HOME or vim.uv.os_homedir() or ""
-- One spelling per file. Windows: nvim, git and the agent mix \ and / and drive-letter case, so C:/x/y.
function P.norm(p)
  if not P.win or type(p) ~= "string" then return p end
  return ((p:gsub("\\", "/"):gsub("^(%a):", function(d) return d:upper() .. ":" end)))
end
-- Absolute paths a shell command names. Windows: C:\x, C:/x, and Git Bash's /c/x. Everywhere: ~/x, $HOME/x and
-- $HOME in braces (Windows also ~\x and PowerShell's $env:USERPROFILE\x) as the home folder.
local NAME = "[^%s'\"<>|;&()=]+"
local HOME_SEP = P.win and "([\\/].*)$" or "(/.*)$"
local function from_home(w)
  local rest = w:match("^~" .. HOME_SEP) or w:match("^%$HOME" .. HOME_SEP) or w:match("^%$%{HOME%}" .. HOME_SEP)
    or (P.win and w:lower():match("^%$env:userprofile" .. HOME_SEP) and w:sub(17))
  return (rest and P.home ~= "") and P.home .. rest or w
end
function P.abs_paths(cmd)
  local out = {}
  cmd = type(cmd) == "string" and cmd or ""
  local function add(w)
    local p = from_home(w)
    if P.win and p:match("^%a:[\\/]") then out[#out + 1] = P.norm(p)
    elseif P.win and p:match("^/%a/") then out[#out + 1] = p:sub(2, 2):upper() .. ":" .. p:sub(3)
    elseif not P.win and p:match("^/") then out[#out + 1] = p end
  end
  -- quoted strings first, whole (paths with spaces), then the rest of the command word by word
  local rest = cmd:gsub([=[(["'])(.-)%1]=], function(_, q)
    add(q)
    return " " .. q:gsub("[\"']", " ") .. " " -- and the words inside it (python -c "open('/tmp/x')")
  end)
  for w in rest:gmatch(NAME) do add(w) end
  return out
end
`;

// The snap hook, a Claude Code PreToolUse hook (matcher Bash) run with `nvim -l`. jay-nvim writes it to
// ~/.config/jay-nvim/snap_hook.lua on the machine where it runs, so it exists wherever jay-nvim does (macOS,
// Windows, a remote Linux server) and always matches this version's path rules (PATH_RULES, shared with nvim).
const SNAP_HOOK = String.raw`-- jay-nvim's snap hook: written by jay-nvim (herdr-jay mods/jay-nvim/nvim.js); edits here are overwritten.
-- Claude Code PreToolUse hook, matcher Bash, run as: nvim -l <this file>. Before a command runs, keep a copy of each
-- file it names by absolute path (at most 20, each up to 1 MB; not /proc, /sys, /dev, never keys or credentials: ~/.ssh,
-- ~/.aws, ~/.gnupg, ~/.config/gh, ~/.kube, ~/.netrc, ~/.git-credentials, ~/.docker/config.json), so jay-nvim can mark
-- what the command changed in a file outside any git repo. Copies: ~/.cache/jay-nvim/snap/<tool_use_id>/<sha256 of the
-- path>, only you can read them, removed at the next Bash run after 10 minutes. Never blocks the command: prints
-- nothing, always exits 0.
pcall(function()
${PATH_RULES}
  local ok, call = pcall(vim.json.decode, io.read("*a") or "")
  if not ok or type(call) ~= "table" then return end
  local id = call.tool_use_id
  if type(id) ~= "string" or not id:match("^[%w_]+$") then return end
  local input = type(call.tool_input) == "table" and call.tool_input or {}
  local dir = P.home .. "/.cache/jay-nvim/snap"
  vim.fn.mkdir(dir, "p", 448) -- 0700
  local now = os.time()
  for name in vim.fs.dir(dir) do
    local st = vim.uv.fs_stat(dir .. "/" .. name)
    if st and now - st.mtime.sec > 600 then vim.fn.delete(dir .. "/" .. name, "rf") end
  end
  local function under(q, tops)
    for _, top in ipairs(tops) do
      if q == top or q:sub(1, #top + 1) == top .. "/" then return true end
    end
  end
  local SPECIAL = { "/proc", "/sys", "/dev" } -- reading one can hang (/proc/kmsg), also through a link
  -- Keys and credentials stay out of the cache, also through a link. Compared in lower case (macOS and Windows names
  -- ignore case; elsewhere a miss only means no copy). Windows: the same names under %USERPROFILE%, plus %APPDATA%'s.
  local SECRET = {}
  for _, h in ipairs({ P.norm(P.home), P.norm(vim.uv.fs_realpath(P.home) or P.home) }) do
    h = h:gsub("/$", ""):lower()
    if h ~= "" then
      for _, s in ipairs({ ".ssh", ".aws", ".gnupg", ".config/gh", ".kube", ".netrc", "_netrc", ".git-credentials",
        ".docker/config.json" }) do SECRET[#SECRET + 1] = h .. "/" .. s end
    end
  end
  if P.win and vim.env.APPDATA then
    local a = P.norm(vim.env.APPDATA):gsub("/$", ""):lower()
    SECRET[#SECRET + 1] = a .. "/github cli"
    SECRET[#SECRET + 1] = a .. "/gnupg"
  end
  for n, p in ipairs(P.abs_paths(input.command)) do
    if n > 20 then break end
    local real = vim.uv.fs_realpath(p) or p
    local skip = (not P.win and (under(p, SPECIAL) or under(real, SPECIAL)))
      or under(P.norm(p):lower(), SECRET) or under(P.norm(real):lower(), SECRET)
    local st = not skip and vim.uv.fs_stat(p)
    if st and st.type == "file" and st.size <= 1048576 then
      -- Non-blocking open, then check the opened file itself: the path may have become a FIFO since the stat.
      local c = vim.uv.constants or {}
      local fd = vim.uv.fs_open(p, (not P.win and c.O_NONBLOCK) and ((c.O_RDONLY or 0) + c.O_NONBLOCK) or "r", 0)
      local ft = fd and vim.uv.fs_fstat(fd)
      local data = ft and ft.type == "file" and ft.size <= 1048576 and vim.uv.fs_read(fd, 1048576, 0)
      if fd then vim.uv.fs_close(fd) end
      if data then vim.fn.mkdir(dir .. "/" .. id, "p", 448) end
      local out = data and vim.uv.fs_open(dir .. "/" .. id .. "/" .. vim.fn.sha256(p), "w", 384) -- 0600
      if out then vim.uv.fs_write(out, data, 0) vim.uv.fs_close(out) end
    end
  end
end)
os.exit(0)
`;

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
${PATH_RULES}-- For comparing two paths: Windows file names ignore case.
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
-- A program nvim gave up waiting for (run_wait) is killed with everything it started: a child left alive would keep
-- the output pipe open. unix: it runs as its own process group (detached = setsid), and the group is killed.
-- Windows has no groups: taskkill /T /F kills the tree (Git for Windows' cmd\git.exe is a launcher that starts the
-- real mingw64\bin\git.exe), run by its full path from an argument list, no shell.
P.own_group = not P.win
function P.kill_tree(obj)
  if P.win then
    local done = false
    local tk = (vim.env.SystemRoot or vim.env.windir or "C:\\Windows") .. "\\System32\\taskkill.exe"
    if pcall(vim.system, { tk, "/T", "/F", "/PID", tostring(obj.pid) }, {}, function() done = true end) then
      vim.wait(2000, function() return done end, nil, true)
    end
  else
    pcall(vim.uv.kill, -obj.pid, "sigkill")
  end
  pcall(obj.kill, obj, "sigkill")
end
-- Where hc may be when PATH doesn't have it (Herdr starts panes with a bare PATH).
P.hc_paths = P.win and { (vim.env.LOCALAPPDATA or "") .. "/Programs/herdr-core/herdr-core.exe" }
  or { P.home .. "/.local/bin/hc", P.home .. "/.local/bin/herdr-core", "/opt/homebrew/bin/hc", "/usr/local/bin/hc" }
-- Folders put in front of PATH for language servers (unix: Homebrew and ~/.local/bin; Windows: PATH as it is).
P.extra_path = not P.win and { P.home .. "/.local/bin", "/opt/homebrew/bin", "/usr/local/bin" } or nil
P.path_sep = P.win and ";" or ":"
-- The pids under a pane's process (children, their children, ...; at most "max"), from nvim itself: no external
-- program to hang (macOS, Linux and Windows each have their own nvim_get_proc_children).
function P.tree(pid, max)
  local out, todo = {}, { pid }
  while #todo > 0 and #out < max do
    local ok, kids = pcall(vim.api.nvim_get_proc_children, table.remove(todo, 1))
    for _, c in ipairs(ok and kids or {}) do
      if #out >= max then break end
      out[#out + 1] = c
      todo[#todo + 1] = c
    end
  end
  return out
end
-- A small JSON file as a table (nil: missing, not a plain file, over max bytes, or not JSON). libuv, not io.open:
-- on Windows io.open goes through the ANSI code page (a non-English user name).
local function read_json(f, max)
  local st = vim.uv.fs_lstat(f)
  if not st or st.type ~= "file" or st.size > (max or 65536) then return nil end
  local fd = vim.uv.fs_open(f, "r", 0)
  local data = fd and vim.uv.fs_read(fd, st.size, 0)
  if fd then vim.uv.fs_close(fd) end
  local ok, d = pcall(vim.json.decode, data or "")
  return ok and type(d) == "table" and d or nil
end
-- When a Claude Code (or a process it runs under) started, in epoch seconds, or nil when not cheaply known.
-- Newer Claude Codes keep ~/.claude/sessions/<pid>.<x>.key from their start: only its date is looked at (never its
-- content, a secret). Linux: also /proc (the start in clock ticks after boot; 100 a second).
local BOOT
function P.started(pids, first)
  local dir, want = P.home .. "/.claude/sessions", {}
  for _, p in ipairs(pids) do want[tostring(p)] = true end
  for name in vim.fs.dir(dir) do
    local p = name:match("^(%d+)%.[^/\\]*%.key$")
    local st = p and want[p] and vim.uv.fs_lstat(dir .. "/" .. name)
    if st and st.type == "file" then
      return (st.birthtime and st.birthtime.sec > 0) and st.birthtime.sec or st.mtime.sec
    end
  end
  if P.win or not first or not vim.uv.fs_stat("/proc/self/stat") then return nil end
  if not BOOT then
    local f = io.open("/proc/stat")
    for l in f and f:lines() or function() end do
      BOOT = tonumber(l:match("^btime%s+(%d+)"))
      if BOOT then break end
    end
    if f then f:close() end
  end
  local f = io.open("/proc/" .. first .. "/stat")
  local stat = f and f:read(4096) or ""
  if f then f:close() end
  local ticks = tonumber((vim.split(stat:match(".*%)%s+(.*)") or "", "%s+")[20]))
  return BOOT and ticks and BOOT + math.floor(ticks / 100) or nil
end
-- Claude Code's transcript folder for a cwd: ~/.claude/projects/<cwd with every character but A-Z a-z 0-9 as "-">
-- (one per JavaScript character: two for one outside the BMP); a name over 200 is cut there and gets a hash of
-- its own after a "-", so then the one folder starting that way (none when two do).
function P.project_dir(cwd)
  local name = cwd:gsub("[%z\1-\127\192-\255][\128-\191]*", function(ch)
    return ch:match("^[A-Za-z0-9]$") and ch or (#ch >= 4 and "--" or "-")
  end)
  local top = P.home .. "/.claude/projects/"
  if #name <= 200 then
    local st = vim.uv.fs_stat(top .. name)
    return st and st.type == "directory" and top .. name or nil
  end
  local found = vim.fn.glob(top .. name:sub(1, 200) .. "-*", false, true) -- name is A-Z a-z 0-9 and "-" only
  return #found == 1 and found[1] or nil
end
-- The Claude Code session of the agent in a pane, cheapest first:
-- 1. ~/.claude/sessions/<pid>.json (Claude Code up to about 2.1.309) for the pane's foreground pid, else the first
--    process under the pane's process that has one (unix under sudo: no foreground; Windows: Herdr starts agents
--    through pwsh or npm's claude.cmd, so the foreground is the shell).
-- 2. ~/.claude/daemon/roster.json (background and remote-control sessions): the worker whose pid or replPid is the
--    foreground or under the pane. Only those fields and sessionId are looked at (it also holds tokens).
-- 3. Windows: the live session in sessions/*.json whose folder is the pane's, active last.
-- 4. The transcript folder of the agent's cwd (the foreground's, else the pane's): its newest <id>.jsonl, changed
--    since that Claude Code started (when known, else in the last 24 h). /clear starts a new one: newest follows it.
--    Not on unix without a foreground (sudo: the root view's case).
-- shortcut (3, 4): two Claude Codes in one folder may swap.
-- Returns { sessionId = id } (1-3: the log is projects/*/<id>.jsonl) or { sessionId = id, log = path } (4).
function P.session(info, t)
  local dir = P.home .. "/.claude/sessions/"
  info = type(info) == "table" and info or {}
  local fg = type(info.foreground) == "table" and info.foreground or {}
  local pid, top = tonumber(fg.pid), tonumber(info.pid)
  local s = pid and read_json(dir .. pid .. ".json")
  if s then return s end
  local tree = top and P.tree(top, 64) or {}
  for _, c in ipairs(tree) do
    s = read_json(dir .. c .. ".json")
    if s then return s end
  end
  local mine, pids = {}, {}
  for _, p in ipairs(vim.list_extend({ pid or false, top or false }, tree)) do
    if p and not mine[p] then mine[p], pids[#pids + 1] = true, p end
  end
  local roster = read_json(P.home .. "/.claude/daemon/roster.json", 1048576)
  for _, w in pairs(type(roster) == "table" and type(roster.workers) == "table" and roster.workers or {}) do
    if type(w) == "table" and type(w.sessionId) == "string"
      and (mine[tonumber(w.pid) or false] or mine[tonumber(w.replPid) or false]) then
      return { sessionId = w.sessionId }
    end
  end
  if P.win and type(t.cwd) == "string" then
    local want = P.key(t.cwd):gsub("/$", "")
    for _, f in ipairs(vim.fn.glob(dir .. "*.json", false, true)) do
      local d = read_json(f)
      if d and type(d.cwd) == "string" and type(d.pid) == "number" and P.key(d.cwd):gsub("/$", "") == want
        and vim.uv.kill(d.pid, 0) == 0 and (not s or (tonumber(d.updatedAt) or 0) > (tonumber(s.updatedAt) or 0)) then
        s = d
      end
    end
    if s then return s end
  end
  -- unix without a foreground: an agent under sudo, whose log is root's (the pane's folder would give one of yours)
  if P.sudo_check and not info.foreground then return nil end
  local cwd = type(fg.cwd) == "string" and fg.cwd ~= "" and fg.cwd or type(t.cwd) == "string" and t.cwd ~= "" and t.cwd
  if not cwd then return nil end
  local proj = P.project_dir(cwd)
  local real = not proj and vim.uv.fs_realpath(cwd)
  proj = proj or (real and real ~= cwd and P.project_dir(real))
  if not proj then return nil end
  local start = P.started(pids, pid or top)
  local since = start and start - 2 or os.time() - 86400
  local best, bt, n = nil, nil, 0
  for name in vim.fs.dir(proj) do
    n = n + 1
    if n > 5000 then break end
    local id = name:match("^([%w%-_]+)%.jsonl$")
    local st = id and vim.uv.fs_lstat(proj .. "/" .. name)
    local at = st and st.type == "file" and st.mtime.sec + st.mtime.nsec / 1e9
    if at and at >= since and (not bt or at > bt) then best, bt = { sessionId = id, log = proj .. "/" .. name }, at end
  end
  return best
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
-- Size caps: nvim opens, diffs and reads these whole.
local FILE_MAX = 4 * 1024 * 1024 -- a file follow opens or marks against HEAD (larger: skipped; space o still lists it), a root copy
local LOG_CATCHUP = 8 * 1024 * 1024 -- log bytes read in one tick; more piled up (nvim was busy): only the newest
-- Keep the snap hook file current (see SNAP_HOOK at the top of nvim.js; enabling it is a Claude Code setting).
-- libuv, not io.open: on Windows io.open goes through the ANSI code page (a non-English user name).
pcall(function()
  local f, want = HOME .. "/.config/jay-nvim/snap_hook.lua", [=====[
${SNAP_HOOK}]=====]
  local st = vim.uv.fs_stat(f)
  local fd = st and vim.uv.fs_open(f, "r", 0)
  local have = fd and vim.uv.fs_read(fd, st.size, 0)
  if fd then vim.uv.fs_close(fd) end
  if have ~= want then
    vim.fn.mkdir(vim.fs.dirname(f), "p")
    -- Write a temp file, then rename it over: a hook starting meanwhile never runs a half-written file.
    local tmp = f .. ".tmp" .. vim.uv.os_getpid()
    local w = vim.uv.fs_open(tmp, "wx", 420) -- 0644
    local ok = w and vim.uv.fs_write(w, want, 0) == #want
    if w then vim.uv.fs_close(w) end
    if not (ok and vim.uv.fs_rename(tmp, f)) then vim.uv.fs_unlink(tmp) end
  end
end)
-- git found on PATH only (nil: rejected or missing, and then every git feature is skipped: a bare "git" could be
-- looked up in the project folder again on Windows).
local GIT = P.bin("git")
-- A repo may be someone else's code, and git status / ls-files run what its own .git/config names: the
-- core.fsmonitor hook, and clean filters (filter.<x>.clean / process, picked by .gitattributes). Reading the config
-- runs nothing; every git call here switches those off for that repo (its own config only: your global ones, e.g. git-lfs, stay). Only for nvim's own git calls, not :terminal.
-- The repo's config means .git/config, the files it includes (include.path / includeIf: --local alone skips them)
-- and config.worktree: --show-scope names all of them "local" or "worktree". A git older than 2.26 has no
-- --show-scope: then every filter is switched off, yours too (only in nvim's own git calls).
-- Run a program and wait for it at most ms: one that takes longer (a stuck hc daemon, git on a hung mount) is killed
-- with what it started (P.kill_tree), code 124, and nvim goes on. Always a result: also when it can't start (127), or
-- when its output stays open after the kill. Waits at most about twice ms (the kill and its cleanup: under 1 s on
-- unix, up to 2.5 s on Windows), usually just ms. vim.system's own timeout is not used: its wait() waits ms for the
-- TERM, then ms again after a KILL.
local function run_wait(cmd, opts, ms)
  local done
  local ok, obj = pcall(vim.system, cmd, vim.tbl_extend("force", opts or {}, { detach = P.own_group or nil }),
    function(r) done = r end)
  if not ok then return { code = 127, stdout = "", stderr = tostring(obj) } end
  if vim.wait(ms, function() return done ~= nil end, nil, true) then return done end
  P.kill_tree(obj)
  vim.wait(500, function() return done ~= nil end, nil, true) -- let it close its pipes when it can
  return { code = 124, stdout = "", stderr = "timeout" }
end
local GIT_WAIT = 5000 -- ms
-- Per round: once a git call times out, no more git until nvim is idle again (this follow tick, this file opening, this
-- key): each further call would wait 5 s more on the same hung mount. Cleared by vim.schedule, which only runs then.
local GIT_STUCK = { on = false }
local function git_wait(cmd, opts)
  if GIT_STUCK.on then return { code = 124, stdout = "", stderr = "timeout" } end
  local r = run_wait(cmd, opts, GIT_WAIT)
  if r.code == 124 and not GIT_STUCK.on then
    GIT_STUCK.on = true
    vim.schedule(function() GIT_STUCK.on = false end)
  end
  return r
end
local function git_guard(dir)
  local out = { "-c", "core.fsmonitor=false" }
  local cmd = { GIT, "-C", dir, "config", "--includes", "--show-scope", "--name-only", "--get-regexp", [[^filter\.]] }
  local r = git_wait(cmd, { text = true })
  local scoped = r.code <= 1 -- 1: no filter set anywhere
  if not scoped and r.code ~= 124 then
    table.remove(cmd, 6)
    r = git_wait(cmd, { text = true })
  end
  -- the filters weren't read (killed after the timeout, or any other failure): no git here rather than one with them on
  if r.code > 1 then return nil end
  local seen = {}
  for line in (r.stdout or ""):gmatch("[^\n]+") do
    local scope, key = line:match("^(%S+)\t(.+)$")
    if not scoped then scope, key = "local", line end
    local name = (scope == "local" or scope == "worktree") and key:match("^filter%.(.+)%.[^.]+$")
    -- "-c filter.a=b.clean=" would set filter.a to "b.clean=": a name with "=" can't be switched off, so no git here
    if name and name:find("=", 1, true) then return nil end
    if name and not seen[name] then
      seen[name] = true
      for _, k in ipairs({ "clean", "smudge", "process" }) do vim.list_extend(out, { "-c", "filter." .. name .. "." .. k .. "=" }) end
    end
  end
  return out
end
local NOGIT = { wait = function() return { code = 1, stdout = "", stderr = "git not found" } end }
-- Also off for every call: hooks (core.hooksPath to a folder that never has any; status may run post-index-change),
-- index writes (GIT_OPTIONAL_LOCKS), and any fetch (a partial clone fetches a missing blob with a command the repo
-- names: uploadpack, core.sshCommand): protocol.allow=never and GIT_NO_LAZY_FETCH.
local NO_HOOKS = P.home .. "/.cache/jay-nvim/no-hooks"
local GIT_ENV = { GIT_OPTIONAL_LOCKS = "0", GIT_NO_LAZY_FETCH = "1" }
local function git(dir, args, opts)
  if not GIT or GIT_STUCK.on then return NOGIT end
  local guard = git_guard(dir)
  if not guard then return NOGIT end
  local base = { GIT, "-C", dir, "-c", "protocol.allow=never", "-c", "core.hooksPath=" .. NO_HOOKS }
  local r = git_wait(vim.list_extend(vim.list_extend(base, guard), args), vim.tbl_extend("force", opts or {}, { env = GIT_ENV }))
  return { wait = function() return r end }
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
local DEL_MAX = 50
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
      local function row(t)
        t = "-" .. (" "):rep(math.max(left - 1, 1)) .. t
        rows[#rows + 1] = { { t .. (" "):rep(math.max(width - vim.fn.strdisplaywidth(t), 0)), "QtDiffDel" } }
      end
      -- at most DEL_MAX removed lines per change, then one line for the rest (a truncated 4 MB file: not 100k rows)
      for i = from, from + math.min(gone, DEL_MAX) - 1 do row(before[i] or "") end
      if gone > DEL_MAX then row(("…還有 %d 行"):format(gone - DEL_MAX)) end
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
-- Untracked files in a repo count as all new; outside a repo nothing is marked. Returns nil, true when the committed
-- copy is over FILE_MAX (or not a file): in a repo, but not marked.
local function head_lines(b)
  local f = api.nvim_buf_get_name(b)
  if f == "" or vim.bo[b].buftype ~= "" then return end
  local dir, name = vim.fn.fnamemodify(f, ":h"), vim.fn.fnamemodify(f, ":t")
  if name:find("[\r\n]") then return end
  -- Its size first (the working file's size says nothing: an agent may have truncated a committed 20 MB log), then
  -- that very object by its id, so a commit landing in between can't swap in a bigger one.
  local r = git(dir, { "cat-file", "--batch-check" }, { text = true, stdin = "HEAD:./" .. name .. "\n" }):wait()
  local oid, kind, size = (r.code == 0 and r.stdout or ""):match("^(%x+) (%a+) (%d+)\n?$")
  if oid then
    if kind ~= "blob" or tonumber(size) > FILE_MAX then return nil, true end
    r = git(dir, { "cat-file", "blob", oid }, { text = true }):wait()
    if r.code == 0 then return vim.split(r.stdout, "\n", { plain = true, trimempty = false }) end
    return
  end
  -- "HEAD:./x missing": untracked (or no commit yet); not a repo: cat-file fails
  if r.code == 0 and git(dir, { "rev-parse", "--is-inside-work-tree" }):wait().code == 0 then return {} end
end
local function mark_head(b)
  local st = vim.uv.fs_stat(api.nvim_buf_get_name(b))
  if st and st.size > FILE_MAX then return end
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
  -- netrw runs plain "git ls-files --other --ignored" through the shell (no filters, but core.fsmonitor and a
  -- fetch): switch those off through the environment, in GIT_CONFIG_PARAMETERS' old 'key=value' form that every git
  -- reads (GIT_CONFIG_COUNT needs 2.31), added to any value already set; then restore the environment
  local keep = { vim.env.GIT_CONFIG_PARAMETERS, vim.env.GIT_OPTIONAL_LOCKS, vim.env.GIT_NO_LAZY_FETCH }
  vim.env.GIT_CONFIG_PARAMETERS = (keep[1] and keep[1] .. " " or "") .. "'core.fsmonitor=false' 'protocol.allow=never'"
  vim.env.GIT_OPTIONAL_LOCKS, vim.env.GIT_NO_LAZY_FETCH = "0", "1"
  local ok, h = pcall(vim.fn["netrw_gitignore#Hide"])
  vim.env.GIT_CONFIG_PARAMETERS, vim.env.GIT_OPTIONAL_LOCKS, vim.env.GIT_NO_LAZY_FETCH = keep[1], keep[2], keep[3]
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
-- hc's agent name as one spelling: no folder, lower case, no ".exe" (Windows)
local function agent_kind(name) return ((tostring(name):match("[^/\\]+$") or ""):lower():gsub("%.exe$", "")) end
local function is_agent(name) return AGENTS[agent_kind(name)] end
local function is_claude(t) return agent_kind(t.agent) == "claude-code" end

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

-- A stuck hc (its daemon not answering) must not freeze nvim: killed after 2 s (code 124), and then no hc call for
-- 30 s (follow looks for agents every 3 s, the root check every second at start: each would wait 2 s again).
local HC_QUIET = { till = 0 }
local function hc(args)
  local bin = hc_bin()
  if not bin then return nil, "找不到 hc" end
  if vim.uv.now() < HC_QUIET.till then return nil, "hc 剛才沒回應，30 秒內先不問" end
  local r = run_wait({ bin, unpack(args) }, { text = true }, 2000)
  if r.code == 124 then
    HC_QUIET.till = vim.uv.now() + 30000
    return nil, "hc 沒回應（" .. tostring(args[1]) .. "）"
  end
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
      if mytab == nil then
        mytab = tab_of(me)
        -- our own tab unknown (hc get failed): an agent in another tab with the same name would pass; ask again later
        if not mytab then return nil, "hc 讀不到這格的分頁" end
      end
      if tab_of(t.address) == mytab then table.insert(out, t) end
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

-- The agent's log: ~/.claude/projects/<folder>/<sessionId>.jsonl (P.session finds the id, or the file itself).
local TOOLS = { Read = "讀", Edit = "改", MultiEdit = "改", NotebookEdit = "改", Write = "寫" }
-- Only a plain file really inside ~/.claude/projects (no link, also no linked folder, leading out of it).
local function in_projects(f)
  local top, real, st = vim.uv.fs_realpath(home .. "/.claude/projects"), vim.uv.fs_realpath(f), vim.uv.fs_lstat(f)
  if not (top and real and st and st.type == "file") then return nil end
  top = P.key(top):gsub("/$", "")
  return P.key(real):sub(1, #top + 1) == top .. "/" and f or nil
end
local function session_log(t)
  if not is_claude(t) or t.address:find("/") then return nil end
  local s = P.session(hc({ "get", t.address }), t)
  -- the id goes into a glob: only an id's own characters
  local id = s and type(s.sessionId) == "string" and s.sessionId:match("^[%w%-_]+$")
  if not id then return nil end
  if type(s.log) == "string" then
    return vim.fs.basename(s.log) == id .. ".jsonl" and in_projects(s.log) or nil
  end
  for _, f in ipairs(vim.fn.glob(("%s/.claude/projects/*/%s.jsonl"):format(home, id), false, true)) do
    if in_projects(f) then return f end
  end
end

-- An agent started under sudo: hc can't see its foreground and its log is root's, so nothing can be followed.
-- Say so once (no root handoff: an editor run as root, reachable by anything that can type into a pane, is a root door).
-- Returns the pane's process id (true), or false.
local function runs_as_root(t)
  if not P.sudo_check or P.root or not is_claude(t) then return false end
  local info = hc({ "get", t.address })
  local pid = type(info) == "table" and not info.foreground and tonumber(info.pid)
  return pid and run_wait({ "pgrep", "-u", "0", "-P", tostring(pid) }, {}, 1000).code == 0 and pid or false
end
-- Root view: a root-side hook (not part of jay-nvim) may keep copies of what a root agent read or changed, readable
-- by you: <dir>/index.jsonl, one JSON record per touch {t, tool, path, before, after, line, pid}, and <dir>/blobs/<sha256>
-- holding a file's content. <dir> is the one line of ~/.config/jay-nvim/root_view (none: a root agent can't be
-- followed). nvim only reads them: a copy opens read-only, never as the real file.
local function root_view_dir()
  local f = io.open(HOME .. "/.config/jay-nvim/root_view", "r")
  local d = f and vim.trim(f:read("*l") or "")
  if f then f:close() end
  return d and d ~= "" and vim.uv.fs_access(d .. "/index.jsonl", "R") and d or nil
end
-- A new pane has no "where" in hc ls for its first seconds, so keep asking for 10s until a claude-code agent shows up.
-- One short line (a long one stops nvim at "Press ENTER" in a narrow pane), kept in :messages.
local root_probe, root_tries = new_timer(), 0
if P.sudo_check and not P.root then root_probe:start(0, 1000, vim.schedule_wrap(function()
  root_tries = root_tries + 1
  local agent = (JN.agents() or {})[1]
  if agent and runs_as_root(agent) then
    vim.api.nvim_echo({ { root_view_dir() and "root 的 agent：跟它留的複本（唯讀）" or "root 的 agent：跟不到（沒有 root_view）", "WarningMsg" } }, true, {})
  end
  if (agent and is_claude(agent)) or root_tries >= 10 then root_probe:stop() end
end)) end

-- The root view's records since the last tick: the newest touch, as a follow item, or nil.
local function blob(dir, sha)
  if type(sha) ~= "string" or not sha:match("^%x+$") then return nil end
  local st = vim.uv.fs_stat(dir .. "/blobs/" .. sha)
  if not st or st.type ~= "file" or st.size > FILE_MAX then return nil end
  local f = io.open(dir .. "/blobs/" .. sha, "rb")
  if not f then return nil end
  local text = f:read(FILE_MAX) or ""
  f:close()
  return vim.split((text:gsub("\r?\n$", "")), "\r?\n", { trimempty = false })
end
-- A root view index is shared by every root agent on the machine. A record names its agent by "pid": the root
-- Claude Code's process id, which must run under the pane of an agent this nvim follows (s.panes, set when the agents
-- are found). An index without any "pid" (an older root side): every record counts, but none from before this view
-- started (on open, the last one could be any root agent's, days ago).
local function root_pid_ok(s, pid)
  if s.under and (s.under[pid] or vim.uv.now() - s.under_at < 2000) then return s.under[pid] == true end
  s.under, s.under_at = {}, vim.uv.now() -- an agent restarted under the pane has a new pid: list again (at most every 2s)
  for pane in pairs(s.panes or {}) do
    s.under[pane] = true
    for _, c in ipairs(P.tree(pane, 256)) do s.under[c] = true end
  end
  return s.under[pid] == true
end
local function scan_root(s)
  local st = vim.uv.fs_stat(s.log)
  if not st or st.size == s.pos then return end
  if s.pos and st.size < s.pos then s.pos = nil end -- index started over
  local from = s.pos and math.max(s.pos, st.size - LOG_CATCHUP) or math.max(0, st.size - 64 * 1024)
  local h = io.open(s.log, "rb")
  if not h then return end
  h:seek("set", from)
  local text = h:read(st.size - from) or ""
  h:close()
  local cut = text:match(".*()\n")
  if not cut then return end
  s.pos = from + cut
  local it
  for _, l in ipairs(vim.split(text:sub(1, cut - 1), "\n", { plain = true })) do
    local ok, r = pcall(vim.json.decode, l)
    local pid = ok and type(r) == "table" and tonumber(r.pid)
    if pid then s.has_pid = true end
    local mine = pid and root_pid_ok(s, pid) or (not pid and not s.has_pid and (tonumber(ok and type(r) == "table" and r.t) or 0) >= s.since)
    if mine and type(r.path) == "string" and r.path:sub(1, 1) == "/" and type(r.after) == "string" then
      local changed = type(r.before) == "string" and r.before ~= r.after or r.before == vim.NIL or r.before == nil and r.tool == "Write"
      it = { path = r.path, root = { dir = s.dir, after = r.after, before = r.before ~= vim.NIL and r.before or nil },
        tag = r.tool == "Read" and "讀" or r.tool == "Write" and "寫" or changed and "改" or "讀",
        line = tonumber(r.line) }
    end
  end
  return it, st.mtime
end

-- Show a root view item: a read-only scratch buffer "root:<path>" with the copy, marked against the copy before.
-- Found again by its exact name, not bufnr()'s file pattern ({a,b} in a path would match nothing, then E95).
local function show_root(it)
  local name = "root:" .. it.path
  local b
  for _, x in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_get_name(x) == name and vim.bo[x].buftype == "nofile" then b = x break end
  end
  if not b then
    b = vim.api.nvim_create_buf(true, true)
    vim.api.nvim_buf_set_name(b, name)
    vim.bo[b].buftype, vim.bo[b].bufhidden, vim.bo[b].swapfile, vim.bo[b].modeline = "nofile", "hide", false, false
  end
  local lines = blob(it.root.dir, it.root.after) or { "（複本讀不到：" .. it.root.after .. "）" }
  vim.bo[b].modifiable, vim.bo[b].readonly = true, false
  vim.api.nvim_buf_set_lines(b, 0, -1, false, lines)
  vim.bo[b].modifiable, vim.bo[b].readonly, vim.bo[b].modified = false, true, false
  -- colors only: a filetype would start language servers and ftplugins on root's file
  local ft = vim.filetype.match({ filename = it.path, contents = lines })
  if ft then vim.bo[b].syntax = ft end
  vim.api.nvim_set_current_buf(b)
  local before = it.tag == "寫" and {} or it.root.before and it.root.before ~= it.root.after and blob(it.root.dir, it.root.before)
  if before then mark(b, before) else vim.api.nvim_buf_clear_namespace(b, ns, 0, -1) end
  return b
end

-- Bytes of the log from offset "from" (or the last "bytes") to its end when opened.
local function read_log(log, bytes, from)
  local h = log and io.open(log, "rb")
  if not h then return nil end
  local size = h:seek("end")
  local start = h:seek("set", from or math.max(0, size - bytes))
  local text = start and size > start and h:read(size - start) or ""
  h:close()
  return text, start
end

-- Newest first, one entry per file. "first" = index of the first whole line in text. Only files that are there,
-- except with "missing": a Write's new file not written yet (the call waits for your approval) as { missing = true }.
local function paths_in(text, first, missing)
  local seen, out = {}, {}
  local lines = vim.split(text or "", "\n", { plain = true })
  for i = #lines, first, -1 do
    local line = lines[i]
    if line:find('"tool_use"', 1, true) and not line:find('^{"type":"api%-request') then
      local okl, rec = pcall(vim.json.decode, line)
      -- Only the agent's own turns: newer Claude Code also logs "api-request-blob" records that repeat earlier
      -- tool calls, and reading those as new made nvim jump back to an older file.
      local content = okl and type(rec) == "table" and rec.type == "assistant" and type(rec.message) == "table" and rec.message.content
      for j = type(content) == "table" and #content or 0, 1, -1 do
        local c = content[j]
        local path = norm(type(c) == "table" and c.type == "tool_use" and TOOLS[c.name] and type(c.input) == "table" and (c.input.file_path or c.input.notebook_path))
        if type(path) == "string" and not seen[P.key(path)] then
          local st = vim.uv.fs_stat(path)
          local gone = not st and missing and c.name == "Write" or nil
          if (st and st.type == "file") or gone then
            seen[P.key(path)] = true
            table.insert(out, { path = path, tag = TOOLS[c.name], line = tonumber(c.input.offset), edit = TOOLS[c.name] == "改" and c.input or nil, at = i, missing = gone })
          end
        end
      end
    end
  end
  return out
end

function JN.agent_files(t)
  local text, start = read_log(session_log(t), 8 * 1024 * 1024)
  return paths_in(text, start == 0 and 1 or 2) -- line 1 may start mid-record
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

local function epoch(ts) -- "2026-11-07T18:43:13.354Z" is UTC; os.time reads a table as local time
  local y, mo, d, h, mi, s = (type(ts) == "string" and ts or ""):match("^(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
  if not y then return end
  local now = os.time()
  return os.time({ year = y, month = mo, day = d, hour = h, min = mi, sec = s, isdst = false })
    + os.difftime(now, os.time(os.date("!*t", now))) -- isdst: the table os.date("!*t") gives has false
end
-- What a file held before a Bash call ran, kept by the snap hook (SNAP_HOOK, a PreToolUse hook): the call reaches the log only
-- after it ran (root's agent), so nvim cannot keep it itself. Diffed against for a file outside a repo (no HEAD), and
-- for a file follow opens for the first time
local SNAP = HOME .. "/.cache/jay-nvim/snap/"
local function snap_of(ids, p)
  for _, id in ipairs(ids or {}) do -- parallel calls: the first one that named the file saw it before any of them ran
    local f = SNAP .. id .. "/" .. vim.fn.sha256(p)
    local st = vim.uv.fs_stat(f)
    if st and st.type == "file" and st.size <= 1048576 then return vim.fn.readfile(f) end
  end
end
local function stamp(p)
  local st = vim.uv.fs_stat(p)
  return st and st.mtime.sec .. "." .. st.mtime.nsec
end
-- Bash has no file_path. When a Bash call's result lands, open the file it changed: the newest file changed since
-- the call started, from the first of these groups that has one:
--   1. what Claude Code saw the command change (the result's bashEditDiff: files the agent had read),
--   2. files the command names: by absolute path, ~/x or $HOME/x, or a path relative to the agent's folder,
--   3. the git repo of the agent's folder or of a folder the command names (git ls-files: modified or new, not ignored).
-- Only group 3 can take a file that something else saved meanwhile.
-- shortcut: a relative path is read against the agent's folder (a cd in the command misses it, then group 3).
local function bash_changed(cwd, since, cmd, diff)
  cwd = norm(cwd)
  cmd = type(cmd) == "string" and cmd or ""
  local function newest(list)
    local best, at
    for _, p in ipairs(list) do
      local st = vim.uv.fs_stat(p)
      if st and st.type == "file" and st.mtime.sec >= since
        and (not at or st.mtime.sec > at.sec or (st.mtime.sec == at.sec and st.mtime.nsec > at.nsec)) then
        best, at = norm(p), st.mtime
      end
    end
    return best
  end
  local saw = {}
  for _, f in ipairs(type(diff) == "table" and type(diff.files) == "table" and diff.files or {}) do
    if type(f) == "table" and type(f.filePath) == "string" then saw[#saw + 1] = f.filePath end
  end
  local p = newest(saw)
  if p then return p end
  local named, dirs = {}, { cwd }
  for n, q in ipairs(P.abs_paths(cmd)) do
    if n > 20 then break end
    local t = (vim.uv.fs_stat(q) or {}).type
    if t == "file" then named[#named + 1] = q; dirs[#dirs + 1] = vim.fs.dirname(q) elseif t == "directory" then dirs[#dirs + 1] = q end
  end
  local n = 0
  for w in cmd:gsub("[\"']", " "):gmatch(NAME) do
    n = n + 1
    if n > 200 then break end
    if not w:match("^[-/~$]") and not w:match("^%a:") and #w < 1024 then
      local q = cwd .. "/" .. w
      if (vim.uv.fs_stat(q) or {}).type == "file" then named[#named + 1] = q end
    end
  end
  p = newest(named)
  if p then return p end
  local seen, files, looked, uniq = {}, {}, {}, {}
  for _, d in ipairs(dirs) do -- one folder named twice (two files in it): one lookup
    local k = (P.key(d):gsub("/$", ""))
    if not looked[k] then looked[k], uniq[#uniq + 1] = true, d end
  end
  for _, d in ipairs(uniq) do
    local top = git(d, { "rev-parse", "--show-toplevel" }, { text = true }):wait()
    top = top.code == 0 and vim.trim(top.stdout)
    if top and not seen[top] then
      seen[top] = true
      local r = git(top, { "-c", "core.quotepath=off", "ls-files", "-m", "-o", "--exclude-standard" }, { text = true }):wait()
      for f in (r.code == 0 and r.stdout or ""):gmatch("[^\n]+") do files[#files + 1] = top .. "/" .. f end
    end
  end
  return newest(files)
end

-- The line an Edit (or MultiEdit's last edit) changed, plus the first line its old and new text differ on.
-- The call is logged before the edit is made (and before you approve it), so the file holds either text.
-- old_string first: Edit requires it to be unique in the file, so where it is, is the place (before the edit; after
-- it, it is gone). new_string has no such rule (a short one like "end" can also sit higher up): used when old_string
-- isn't there exactly once, or when new_string contains old_string (then old_string sits inside the new text, too low).
local function edit_line(b, e)
  if type(e) == "table" and type(e.edits) == "table" then e = e.edits[#e.edits] end
  local new, old = type(e) == "table" and e.new_string, type(e) == "table" and e.old_string
  if type(new) ~= "string" or type(old) ~= "string" then return end
  local text = table.concat(vim.api.nvim_buf_get_lines(b, 0, -1, false), "\n")
  local at = old ~= "" and not new:find(old, 1, true) and text:find(old, 1, true)
  if at and text:find(old, at + 1, true) then at = nil end
  at = at or (new ~= "" and text:find(new, 1, true)) or (old ~= "" and text:find(old, 1, true))
  if not at then return end
  local n, o, d = vim.split(new, "\n", { plain = true }), vim.split(old, "\n", { plain = true }), 1
  while n[d] and n[d] == o[d] do d = d + 1 end
  return select(2, text:sub(1, at - 1):gsub("\n", "")) + d
end

-- Follow: open whatever file an agent in this tab last read or edited; with several agents, whichever
-- touched a file last . Never while you type
-- or when the shown buffer has unsaved changes.
local follow = { on = true, logs = {}, state = {}, subdirs = {}, subseen = {}, round = 0, checked = -1e9, last = nil, who = nil }
local function new_state(log, pos) return { log = log, pos = pos, calls = {}, seq = 0 } end
-- One agent's log since the last tick: the newest file it read or edited, or nil. s keeps that log's place.
local function scan(s)
  local st = vim.uv.fs_stat(s.log)
  if not st or st.size == s.pos then return end
  if s.pos and st.size < s.pos then s.pos = nil end -- the log started over
  -- Read only what was appended since the last tick: a window on the tail misses the tool call
  -- when Claude Code writes a big attachment (rules, request blobs: up to 1.5MB) right after it.
  -- More than LOG_CATCHUP behind (nvim was busy): only the newest part.
  local from = s.pos and math.max(s.pos, st.size - LOG_CATCHUP)
  local first = (s.pos and from == s.pos) and 1 or 2 -- a tail window may start mid-record
  local text, start = read_log(s.log, 256 * 1024, from)
  text = text or ""
  local cut = text:match(".*()\n") -- keep a half-written last record for the next tick
  if not cut or not start then return end
  if start == 0 then first = 1 end -- the whole log: its first line is whole
  s.pos = start + cut
  local body = text:sub(1, cut - 1)
  local it, waits
  for _, x in ipairs(paths_in(body, first, true)) do
    if not x.missing then it = x break end
    waits = waits or x
  end
  -- A Write that waited for your approval: its file is there now (this chunk has its result); older than all of this chunk
  local w = s.waiting
  if w and (vim.uv.fs_stat(w.path) or {}).type == "file" then
    s.waiting = nil
    if not it then it, w.at = w, 0 end
  elseif w and os.time() - w.since > 900 then
    s.waiting = nil
  end
  if waits then s.waiting, waits.missing, waits.since = waits, nil, os.time() end
  -- A Bash call's result: noted here; after the chunk, the last one opens what it changed, unless a Read or Edit came
  -- after it. Only the last: the earlier ones are history (a chunk of many is nvim catching up), and each costs git calls.
  local last_bash
  local function ran(call, cwd, res, i)
    if type(cwd) == "string" then last_bash = { call = call, cwd = cwd, res = res, i = i } end
  end
  local calls = s.calls
  local lines = vim.split(body, "\n", { plain = true })
  for i = first, #lines do
    local l = lines[i]
    -- the request blobs repeat the whole conversation (up to 1.5MB each); only the records themselves count
    if not l:find('^{"type":"api%-request') and (l:find('"Bash"', 1, true) or next(calls) ~= nil
      and (l:find('"tool_use_id"', 1, true) or l:find("<tool-use-id>", 1, true))) then
      local ok, rec = pcall(vim.json.decode, l)
      rec = ok and type(rec) == "table" and rec or {}
      local content = type(rec.message) == "table" and type(rec.message.content) == "table" and rec.message.content or {}
      for _, c in ipairs(rec.type == "assistant" and content or {}) do
        if type(c) == "table" and c.type == "tool_use" and c.name == "Bash" and type(c.id) == "string" and c.id:match("^[%w_]+$") then
          -- parallel Bash calls (until a result lands) share one list of ids for the snapshots
          if not s.batch_open then s.batch, s.batch_open = {}, true end
          table.insert(s.batch, c.id)
          s.seq = s.seq + 1
          local cmd = type(c.input) == "table" and type(c.input.command) == "string" and c.input.command or ""
          calls[c.id] = { t = epoch(rec.timestamp) or os.time(), cmd = cmd, batch = s.batch, n = s.seq }
        end
      end
      -- Results, by tool_use_id. toolUseResult is a table when the command exited 0 (or went to the background), a
      -- string when it didn't: "Error: Exit code N ..." (it ran: files may have changed), refused, interrupted.
      for _, c in ipairs(rec.type == "user" and content or {}) do
        local call = type(c) == "table" and c.type == "tool_result" and type(c.tool_use_id) == "string" and calls[c.tool_use_id]
        if call then
          s.batch_open = false
          local res = rec.toolUseResult
          if type(res) == "table" and res.backgroundTaskId ~= nil then
            call.bg, call.cwd = true, rec.cwd -- run_in_background (or moved there after a timeout): still running
          else
            calls[c.tool_use_id] = nil
            if (type(res) == "table" and res.stdout ~= nil) or (type(res) == "string" and res:find("^Error: Exit code")) then
              ran(call, rec.cwd, res, i)
            end
          end
        end
      end
      -- A background command ended: its task notification names the call. Only from the notification itself (a
      -- queue-operation record, or a user turn whose text starts with <task-notification>), never from a tool result:
      -- a Read of a log like this one holds the same text.
      local note
      if rec.type == "queue-operation" then
        note = rec.content
      elseif rec.type == "user" and type(rec.message) == "table" then
        note = rec.message.content
        for _, c in ipairs(type(note) == "table" and note or {}) do
          if type(c) == "table" and c.type == "text" and type(c.text) == "string" and c.text:find("^%s*<task%-notification>") then
            note = c.text
            break
          end
        end
      end
      local id = type(note) == "string" and note:find("^%s*<task%-notification>")
        and note:match("<tool%-use%-id>([%w_]+)</tool%-use%-id>")
      local call = id and calls[id]
      if call and call.bg then
        calls[id] = nil
        ran(call, call.cwd, nil, i)
      end
    end
  end
  if last_bash and not (it and it.at > last_bash.i) then
    local b = last_bash
    local p = bash_changed(b.cwd, b.call.t, b.call.cmd, type(b.res) == "table" and b.res.bashEditDiff)
    -- an Edit just before the Bash call (same second) looks changed by it: keep the Edit's line while the file is as the Edit left it
    local last = it or s.last
    local same = last and last.edit and last.path == p and (last == it or last.mt == stamp(p))
    if p and not same then it = { path = p, tag = "改", at = b.i, before = snap_of(b.call.batch, p) } end
  end
  -- results that never came (the log was cut, the agent quit): keep the newest 64 calls
  local ids = vim.tbl_keys(calls)
  if #ids > 64 then
    table.sort(ids, function(a, b) return calls[a].n < calls[b].n end)
    for k = 1, #ids - 64 do calls[ids[k]] = nil end
  end
  if it then
    it.mt = stamp(it.path)
    s.last = it
  end
  return it, st.mtime
end
local function loaded(path)
  for _, b in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_is_loaded(b) and P.key(vim.api.nvim_buf_get_name(b)) == P.key(path) then return true end
  end
  return false
end
local function follow_tick()
  if not follow.on or vim.fn.mode() ~= "n" then return end
  local now = vim.uv.now()
  if now - follow.checked > (next(follow.logs) == nil and 3000 or 10000) then -- agents start and restart: re-find (3s while none)
    follow.checked = now
    follow.logs, follow.subdirs, follow.round = {}, {}, follow.round + 1
    for _, t in ipairs(JN.agents() or {}) do
      local log = session_log(t)
      -- kept by log, so a missed lookup does not reread an agent's tail
      if log then
        follow.state[log] = follow.state[log] or new_state(log)
        follow.logs[log] = t
        -- its sub-agents (Task) log apart: <session>/subagents/*.jsonl beside <session>.jsonl (Claude Code 2.1.309+)
        follow.subdirs[log:sub(1, -7) .. "/subagents"] = t
      else
        -- a root agent: its log is root's; follow the root view instead, when there is one
        local dir = is_claude(t) and root_view_dir()
        local pane = dir and runs_as_root(t)
        if pane then
          local idx = dir .. "/index.jsonl"
          local s = follow.state[idx] or { log = idx, dir = dir, root = true, since = os.time() }
          follow.state[idx] = s
          if s.round ~= follow.round then s.round, s.panes, s.under = follow.round, {}, nil end
          s.panes[pane] = true -- the root agents' panes: whose records count (root_pid_ok)
          follow.logs[idx] = t
        end
      end
    end
  end
  -- Sub-agent logs, looked for every tick: those there the first time a folder is looked at are history (read from
  -- their end), later ones are new (read from their start).
  for dir, t in pairs(follow.subdirs) do
    local new = follow.subseen[dir]
    follow.subseen[dir] = true
    pcall(function()
      for name, kind in vim.fs.dir(dir) do
        if kind == "file" and name:match("%.jsonl$") then
          local log = dir .. "/" .. name
          follow.state[log] = follow.state[log] or new_state(log, new and 0 or (vim.uv.fs_stat(log) or {}).size)
          follow.logs[log] = t
        end
      end
    end)
  end
  local w = edit_win()
  -- unsaved changes: leave the logs unread, so the switch lands once they are saved or dropped
  if vim.bo[vim.api.nvim_win_get_buf(w)].modified then return end
  local it, newest
  for log, t in pairs(follow.logs) do
    local s = follow.state[log]
    local got, mt = (s.root and scan_root or scan)(s)
    -- two agents in one tick: the one whose log was written last
    if got and (not newest or mt.sec > newest.sec or (mt.sec == newest.sec and mt.nsec > newest.nsec)) then
      it, newest, follow.who = got, mt, t
    end
  end
  if not it then return end -- no dedup: the agent touching the same file again brings you back to it
  if not it.root then -- not a file any more, or too big to open and diff here (space o still lists it)
    local st = vim.uv.fs_stat(it.path)
    if not st or st.type ~= "file" or st.size > FILE_MAX then return end
  end
  follow.last = it
  local dir = norm(vim.fs.dirname(it.path))
  for _, nw in ipairs(it.root and not vim.uv.fs_access(dir, "X") and {} or tree_wins()) do -- the tree shows the file's folder
    -- re-root the tree there: under the old root, netrw would only set curdir and leave a deep folder collapsed.
    -- Checked on the tree itself, not "folder changed": a rebuilt tree (a new :Lexplore) starts back at cwd
    if P.key((norm(tostring(vim.w[nw].netrw_treetop)):gsub("/$", ""))) ~= P.key(dir) then
      vim.w[nw].netrw_treetop = nil
      vim.api.nvim_win_call(nw, function() vim.cmd("silent Explore " .. vim.fn.fnameescape(dir)) end)
      tree_width()
    else
      -- same folder, but a file the agent just made isn't listed yet: list the folder again (once per file,
      -- so a git-ignored file, which the tree hides, doesn't relist it every time)
      local name, shown = vim.fs.basename(it.path), false
      for _, l in ipairs(vim.api.nvim_buf_get_lines(vim.api.nvim_win_get_buf(nw), 0, -1, false)) do
        if (l:gsub("^[| ]+", ""):gsub("[*@=/]$", "")) == name then shown = true break end
      end
      follow.relisted = follow.relisted or {}
      if not shown and not follow.relisted[P.key(it.path)] then
        follow.relisted[P.key(it.path)] = true
        vim.w[nw].netrw_treetop = nil
        vim.api.nvim_win_call(nw, function() vim.cmd("silent Explore " .. vim.fn.fnameescape(dir)) end)
        tree_width()
      end
    end
  end
  vim.api.nvim_win_call(w, function()
    local fresh = false -- opened just now (not loaded before): no reload has marked it yet
    if it.root then
      it.buf = show_root(it)
    elseif P.key(vim.fn.expand("%:p")) ~= P.key(it.path) then
      fresh = not loaded(it.path)
      vim.cmd.edit(vim.fn.fnameescape(it.path))
    end
    local b = vim.api.nvim_get_current_buf()
    if not it.root then
      if it.before and fresh then
        -- a Bash edit with a snapshot: that command's change, not everything since the last commit (opening marked HEAD)
        mark(b, it.before)
      else
        -- Outside a git repo, unmarked: a Write is all new; a Bash edit diffs against what the file held before the call
        local before = it.tag == "寫" and {} or it.before
        if before and #vim.api.nvim_buf_get_extmarks(b, ns, 0, -1, { limit = 1 }) == 0 then
          local head, big = head_lines(b)
          if not head and not big then mark(b, before) end
        end
      end
    end
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
-- for tests (tests/jay-nvim): the follow pieces, run without Herdr
JN.test = { abs_paths = P.abs_paths, paths_in = paths_in, scan = scan, scan_root = scan_root, new_state = new_state,
  bash_changed = bash_changed, edit_line = edit_line, show_root = show_root, follow = follow, follow_tick = follow_tick,
  session = P.session, session_log = session_log, started = P.started, git = git, run_wait = run_wait,
  head_lines = head_lines, hc_quiet = HC_QUIET, git_stuck = GIT_STUCK }
new_timer():start(1000, 1000, vim.schedule_wrap(function() pcall(follow_tick) end))
-- Title bar above each file: its path, and whether the agent is reading or editing it right now.
function JN.bar()
  if vim.bo.filetype == "netrw" then return "" end
  local name = vim.fn.expand("%:~:.")
  if name == "" then return "" end
  local it = follow.last
  local here = it and (it.root and it.buf == vim.api.nvim_get_current_buf() or not it.root and P.key(it.path) == P.key(vim.fn.expand("%:p")))
  local tag = here and ("  " .. (it.root and "root " or "agent ") .. it.tag .. "  ") or ""
  if here and it.root then name = it.path .. "（root 的檔，複本，唯讀）" end
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
  local st = git(root, { "status", "--porcelain", "-z", "--ignore-submodules=all" }, { text = true }):wait()
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
-- pyright runs the project's Python (its venv) and ts_ls the project's own tsserver: both run the project's code.
-- They start in every project, without asking (jay's choice); ruff only reads files.
if not P.root then
if P.extra_path and (vim.env.PATH or ""):sub(1, #P.extra_path[1]) ~= P.extra_path[1] then
  vim.env.PATH = table.concat(vim.list_extend(vim.list_extend({}, P.extra_path), { vim.env.PATH or "" }), P.path_sep)
end
-- No trust step (jay, 2026-11-09): pyright / ts_ls start in any project; they may run that project's code.
local function project_root(markers, need)
  return function(b, on_dir)
    local r = vim.fs.root(b, markers)
    if r and (not need or need(r)) then return on_dir(r) end
  end
end
vim.diagnostic.config({ virtual_text = true, severity_sort = true })
local py_root = { "pyproject.toml", "ruff.toml", "setup.py", ".git" } -- backend/ruff.toml makes backend/ the root, so "from app..." resolves
for name, c in pairs({
  pyright = { cmd = { "pyright-langserver", "--stdio" }, filetypes = { "python" }, root_dir = project_root(py_root) },
  ruff = { cmd = { "ruff", "server" }, filetypes = { "python" }, root_markers = py_root },
  -- Only where the project has its own TypeScript (node_modules/typescript): the server needs its tsserver, and a
  -- global TypeScript 7 (the Go rewrite) ships none, so elsewhere it fails to start with an error popup.
  ts_ls = { cmd = { "typescript-language-server", "--stdio" },
    filetypes = { "javascript", "javascriptreact", "typescript", "typescriptreact" },
    root_dir = project_root({ "tsconfig.json", "package.json", ".git" },
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
