-- Run by run.js inside a headless nvim that has just run nvim-jay's Lua (JN.test holds the follow pieces).
local T = JN.test
for _, t in ipairs(JN.timers) do pcall(function() t:stop() end) end -- the tests drive follow themselves
local ROOT, FAKE, HOME = vim.env.JN_TEST_ROOT, vim.env.JN_FAKE, vim.env.HOME
local fails, n = 0, 0
local function check(name, ok, detail)
  n = n + 1
  if ok then print("ok    " .. name) else fails = fails + 1 print("FAIL  " .. name .. (detail and ("\n      " .. vim.inspect(detail)) or "")) end
end
local function test(name, fn)
  local ok, e = pcall(fn)
  if not ok then fails, n = fails + 1, n + 1 print("FAIL  " .. name .. "\n      " .. tostring(e)) end
end
local function write(p, text) vim.fn.mkdir(vim.fs.dirname(p), "p") local f = assert(io.open(p, "wb")) f:write(text) f:close() end
local function append(p, recs)
  local f = assert(io.open(p, "ab"))
  for _, r in ipairs(recs) do f:write(vim.json.encode(r) .. "\n") end
  f:close()
end
local function iso(t) return os.date("!%Y-%m-%dT%H:%M:%S.000Z", t) end
local function bash(id, cmd, extra)
  return { type = "assistant", timestamp = iso(os.time() - 2), message = { content = {
    { type = "tool_use", id = id, name = "Bash", input = vim.tbl_extend("force", { command = cmd }, extra or {}) } } } }
end
local function result(id, cwd, res) return { type = "user", cwd = cwd, message = { content = { { type = "tool_result", tool_use_id = id } } }, toolUseResult = res } end
local function tool(name, input, id) return { type = "assistant", timestamp = iso(os.time()), message = { content = { { type = "tool_use", id = id or "toolu_x", name = name, input = input } } } } end
local function sh(cmd) local r = vim.system({ "sh", "-c", cmd }, { text = true }):wait() assert(r.code == 0, cmd .. ": " .. r.stderr) return r.stdout end

-- 9: ~/x and $HOME/x
test("abs_paths", function()
  local got = T.abs_paths([[cat ~/a.txt $HOME/b.txt ${HOME}/c.txt "/x y/z" /etc/hosts ~other/q rel/p]])
  local want = { HOME .. "/a.txt", HOME .. "/b.txt", HOME .. "/c.txt", "/x y/z", "/x", "/etc/hosts" } -- "/x": a word inside the quotes
  table.sort(got) table.sort(want)
  check("abs_paths: ~/x, $HOME/x, braced $HOME, quoted, absolute (not ~other, not relative)", vim.deep_equal(got, want), got)
end)

local repo = ROOT .. "/repo"
sh("mkdir -p '" .. repo .. "' && cd '" .. repo .. "' && git init -q && echo a > a.txt && echo b > b.txt && git add . && git commit -qm init")

-- 1: a failed Bash (string result) ends the call; the next Bash is followed
test("bash failure", function()
  local log = ROOT .. "/s1.jsonl"
  write(log, "")
  local s = T.new_state(log, 0)
  append(log, { bash("toolu_f1", "sed -i x a.txt; false"), result("toolu_f1", repo, "Error: Exit code 1\nboom") })
  write(repo .. "/a.txt", "a2\n")
  local it = T.scan(s)
  check("failed Bash (exit 1) still follows the file it changed", it and it.path == repo .. "/a.txt", it)
  check("failed Bash: no call left waiting", next(s.calls) == nil, s.calls)
  append(log, { bash("toolu_f2", "echo > b.txt"), result("toolu_f2", repo, { stdout = "", stderr = "" }) })
  write(repo .. "/b.txt", "b2\n")
  it = T.scan(s)
  check("the next Bash is followed", it and it.path == repo .. "/b.txt", it)
  append(log, { bash("toolu_f3", "rm -rf x"), result("toolu_f3", repo, "User rejected tool use") })
  check("a refused Bash: nothing, no call left", T.scan(s) == nil and next(s.calls) == nil, s.calls)
end)

-- 3: a file the command names wins over a newer change elsewhere in the repo
test("bash_changed", function()
  local since = os.time() - 1
  write(repo .. "/a.txt", "a3\n")
  vim.uv.sleep(20)
  write(repo .. "/b.txt", "b3\n") -- newer, but not this command's
  check("named relative file wins", T.bash_changed(repo, since, "sed -i s/a/A/ a.txt") == repo .. "/a.txt")
  check("named absolute file wins", T.bash_changed(repo, since, "perl -pi -e1 " .. repo .. "/a.txt") == repo .. "/a.txt")
  check("nothing named: newest in the repo", T.bash_changed(repo, since, "make") == repo .. "/b.txt")
  check("bashEditDiff first", T.bash_changed(repo, since, "x b.txt", { files = { { filePath = repo .. "/a.txt" } } }) == repo .. "/a.txt")
end)

-- 6: background Bash: followed when its task notification lands
test("background bash", function()
  local log = ROOT .. "/s2.jsonl"
  write(log, "")
  local s = T.new_state(log, 0)
  append(log, { bash("toolu_b1", "sleep 9; echo > " .. repo .. "/a.txt", { run_in_background = true }),
    result("toolu_b1", repo, { stdout = "", stderr = "", backgroundTaskId = "bt1" }) })
  check("background: nothing at start", T.scan(s) == nil)
  check("background: call kept", s.calls.toolu_b1 and s.calls.toolu_b1.bg)
  write(repo .. "/a.txt", "a4\n")
  append(log, { { type = "queue-operation", operation = "enqueue", content = "<task-notification>\n<task-id>bt1</task-id>\n<tool-use-id>toolu_b1</tool-use-id>\n<status>completed</status>" } })
  local it = T.scan(s)
  check("background: followed when it ends", it and it.path == repo .. "/a.txt", it)
  check("background: call done", next(s.calls) == nil)
end)

-- 7: a Write of a new file waits until the file is there
test("write new file", function()
  local log = ROOT .. "/s3.jsonl"
  write(log, "")
  local s = T.new_state(log, 0)
  local p = repo .. "/new.txt"
  append(log, { tool("Write", { file_path = p, content = "x\n" }, "toolu_w1") })
  check("Write before approval: nothing yet", T.scan(s) == nil and s.waiting)
  write(p, "x\n")
  append(log, { result("toolu_w1", repo, { type = "create", filePath = p }) })
  local it = T.scan(s)
  check("Write after approval: followed", it and it.path == p and it.tag == "寫", it)
end)

-- 10: a log far behind: only the newest part is read
test("catch-up cap", function()
  local log = ROOT .. "/s4.jsonl"
  write(log, "")
  local s = T.new_state(log, 0)
  local f = assert(io.open(log, "ab"))
  local junk = vim.json.encode({ type = "progress", data = string.rep("x", 1000) }) .. "\n"
  for _ = 1, 9 * 1024 do f:write(junk) end
  f:close()
  append(log, { tool("Read", { file_path = repo .. "/a.txt" }) })
  local it = T.scan(s)
  check("9MB behind: newest record still found", it and it.path == repo .. "/a.txt", it)
end)

-- 11: edit_line
test("edit_line", function()
  local b = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(b, 0, -1, false, { "end", "local x = 1", "end", "local y = 2", "end" })
  check("before the edit: old text's line", T.edit_line(b, { old_string = "local y = 2\nend", new_string = "local y = 3\nend" }) == 4)
  vim.api.nvim_buf_set_lines(b, 0, -1, false, { "end", "local x = 1", "end", "local y = 3", "end" })
  check("after the edit: new text's line", T.edit_line(b, { old_string = "local y = 2\nend", new_string = "local y = 3\nend" }) == 4)
  vim.api.nvim_buf_set_lines(b, 0, -1, false, { "a", "new line", "old line", "z" })
  check("new contains old: the inserted line", T.edit_line(b, { old_string = "old line", new_string = "new line\nold line" }) == 2)
end)

-- 5: root view records by pid
test("root view", function()
  local dir = ROOT .. "/rootview"
  write(dir .. "/blobs/aa", "one\n")
  write(dir .. "/blobs/bb", "two\n")
  local idx = dir .. "/index.jsonl"
  local child = vim.system({ "sleep", "30" }) -- a process under this nvim, as the root agent under its pane
  local function rec(path, after, pid, t) return { t = t or os.time(), tool = "Read", path = path, after = after, pid = pid } end
  -- old index, no pid anywhere: records from before this view started don't count
  write(idx, "")
  append(idx, { rec("/old/file", "aa", nil, os.time() - 86400) })
  local s = { log = idx, dir = dir, root = true, since = os.time(), panes = { [vim.fn.getpid()] = true } }
  check("no pid, older than the view: not followed", T.scan_root(s) == nil)
  append(idx, { rec("/new/file", "aa") })
  local it = T.scan_root(s)
  check("no pid, newer: followed", it and it.path == "/new/file", it)
  append(idx, { rec("/other/agent", "bb", 1), rec("/mine", "aa", child.pid), rec("/other/agent2", "bb", 1) })
  it = T.scan_root(s)
  check("pid: only a process under the pane", it and it.path == "/mine", it)
  append(idx, { rec("/no/pid/now", "aa") })
  check("once pids appear, a record without one is ignored", T.scan_root(s) == nil)
  child:kill(9)
  -- 12: a path with {a,b}: found again, no E95
  local ok, e = pcall(function()
    local b1 = T.show_root({ path = "/etc/{a,b}.conf", tag = "讀", root = { dir = dir, after = "aa" } })
    local b2 = T.show_root({ path = "/etc/{a,b}.conf", tag = "讀", root = { dir = dir, after = "bb" } })
    assert(b1 == b2, "two buffers")
    assert(vim.api.nvim_buf_get_lines(b2, 0, -1, false)[1] == "two", "content")
  end)
  check("show_root: {a,b} in the path", ok, e)
end)

-- 2 + 8 + 4 + 15: follow_tick end to end with a fake hc; a sub-agent's edit is followed, a snapshot is the diff base
test("follow end to end", function()
  local sid = "sess-1"
  local proj = HOME .. "/.claude/projects/p"
  local log = proj .. "/" .. sid .. ".jsonl"
  write(HOME .. "/.claude/sessions/4242.json", vim.json.encode({ sessionId = sid, pid = 4242 }))
  write(log, "")
  local old_sub = proj .. "/" .. sid .. "/subagents/agent-old.jsonl"
  write(old_sub, "")
  append(old_sub, { tool("Read", { file_path = repo .. "/b.txt" }) }) -- history: never jumped to
  write(FAKE .. "/ls.json", vim.json.encode({ terminals = {
    { address = "t1", where = "s / tab", state = "live", agent = "nvim" },
    { address = "t2", where = "s / tab", state = "live", agent = "claude-code", cwd = repo },
    { address = "t3", where = "s / tab", state = "live", agent = "claude-code", cwd = repo } } }))
  write(FAKE .. "/get-t1.json", vim.json.encode({ labels = { ["herdr.tab"] = "tab1" } }))
  write(FAKE .. "/get-t2.json", vim.json.encode({ labels = { ["herdr.tab"] = "tab1" }, pid = 1, foreground = { pid = 4242 } }))
  write(FAKE .. "/get-t3.json", vim.json.encode({ labels = { ["herdr.tab"] = "tab2" }, pid = 1, foreground = { pid = 4343 } }))
  local list = JN.agents()
  check("agents: same tab only", list and #list == 1 and list[1].address == "t2", list)
  local F = T.follow
  local function tick() F.checked = -1e9 T.follow_tick() end
  tick()
  check("old sub-agent log: not jumped to", F.last == nil or F.last.path ~= repo .. "/b.txt", F.last)
  -- a sub-agent started after: its Read is followed
  local sub = proj .. "/" .. sid .. "/subagents/agent-new.jsonl"
  write(sub, "")
  tick()
  append(sub, { tool("Read", { file_path = repo .. "/a.txt", offset = 1 }) })
  tick()
  check("new sub-agent log: followed", F.last and F.last.path == repo .. "/a.txt", F.last)
  -- 8: a Bash edit with a snapshot, file opened for the first time: marked against the snapshot, not HEAD
  sh("cd '" .. repo .. "' && printf '1\\n2\\n3\\n4\\n5\\n' > c.txt && git add c.txt && git commit -qm c")
  write(repo .. "/c.txt", "1\nTWO\n3\n4\n5\n") -- an older uncommitted change
  local c = repo .. "/c.txt"
  write(HOME .. "/.cache/nvim-jay/snap/toolu_s1/" .. vim.fn.sha256(c), "1\nTWO\n3\n4\n5\n")
  append(log, { bash("toolu_s1", "sed -i s/4/FOUR/ " .. c) })
  tick()
  write(c, "1\nTWO\n3\nFOUR\n5\n")
  append(log, { result("toolu_s1", repo, { stdout = "", stderr = "" }) })
  tick()
  local b = vim.fn.bufnr(c)
  local marks = b > 0 and vim.api.nvim_buf_get_extmarks(b, vim.api.nvim_create_namespace("nvim-jay-changes"), 0, -1, { details = true }) or {}
  local rows = {}
  for _, m in ipairs(marks) do if m[4].line_hl_group then rows[#rows + 1] = m[2] + 1 end end
  check("snapshot is the base: only line 4 marked (not line 2 from before)", vim.deep_equal(rows, { 4 }), { rows, F.last, vim.api.nvim_buf_get_name(0) })
  check("cursor on the change", vim.api.nvim_win_get_cursor(0)[1] == 4, vim.api.nvim_win_get_cursor(0))
  -- 4: a stuck hc doesn't freeze nvim
  write(FAKE .. "/slow", "")
  local t0 = vim.uv.now()
  local got, err = JN.agents()
  os.remove(FAKE .. "/slow")
  check("stuck hc (sleeps 30s): nvim gives up after 2s (killed; a few seconds at most)", got == nil and vim.uv.now() - t0 < 4000 and tostring(err):find("沒回應"), { got, err, vim.uv.now() - t0 })
  -- review 2: after a timeout, no hc call for 30 s (follow re-finds agents every 3 s, root check every 1 s)
  local h0 = vim.uv.hrtime()
  local got2, err2 = JN.agents()
  local quiet_ms = (vim.uv.hrtime() - h0) / 1e6
  check("after a stuck hc: no hc call for 30 s (answers at once)", got2 == nil and quiet_ms < 300 and tostring(err2):find("30 秒"), { got2, err2, quiet_ms })
  T.hc_quiet.till = 0
  -- 15: our own tab unknown: no agents rather than another tab's
  write(FAKE .. "/get-t1.json", "not json")
  local l2 = JN.agents()
  check("own tab unknown: no agent", l2 == nil, l2)
end)

-- review 4: a timeout kills what the program started too (it would hold the pipe), and returns at about the limit
test("run_wait", function()
  local r = T.run_wait({ "sh", "-c", "echo hi" }, { text = true }, 2000)
  check("run_wait: a quick program's output", r.code == 0 and r.stdout == "hi\n", r)
  check("run_wait: a missing program is 127", T.run_wait({ ROOT .. "/no-such-program" }, {}, 2000).code == 127)
  local pidf = ROOT .. "/grandchild.pid"
  local h0 = vim.uv.hrtime()
  r = T.run_wait({ "sh", "-c", "sleep 37 & echo $! > '" .. pidf .. "'; sleep 38" }, { text = true }, 500)
  local ms = (vim.uv.hrtime() - h0) / 1e6
  check("run_wait: timeout is 124, at about the limit (not twice)", r.code == 124 and ms < 1200, { r, ms })
  local gc = tonumber(vim.trim(table.concat(vim.fn.readfile(pidf), "")))
  local gone = vim.wait(2000, function() return vim.uv.kill(gc, 0) ~= 0 end, 50)
  check("run_wait: what it started is killed too (no child left holding the pipe)", gc and gone, gc)
end)

-- review 3: a background Bash ends only by its own task notification, never by a tool result quoting one
test("background notification source", function()
  local log = ROOT .. "/s5.jsonl"
  write(log, "")
  local s = T.new_state(log, 0)
  append(log, { bash("toolu_b2", "sleep 9; echo > " .. repo .. "/a.txt", { run_in_background = true }),
    result("toolu_b2", repo, { stdout = "", stderr = "", backgroundTaskId = "bt2" }),
    bash("toolu_b3", "sleep 9; echo > " .. repo .. "/b.txt", { run_in_background = true }),
    result("toolu_b3", repo, { stdout = "", stderr = "", backgroundTaskId = "bt3" }) })
  check("background: nothing at start", T.scan(s) == nil)
  write(repo .. "/a.txt", "a5\n")
  local quoted = "<task-notification>\n<task-id>bt2</task-id>\n<tool-use-id>toolu_b2</tool-use-id>\n<status>completed</status>"
  append(log, { tool("Read", { file_path = ROOT .. "/old.jsonl" }, "toolu_r1"),
    { type = "user", cwd = repo, message = { content = { { type = "tool_result", tool_use_id = "toolu_r1", content = quoted } } },
      toolUseResult = { type = "text", file = { content = quoted } } } })
  T.scan(s)
  check("a tool result quoting a notification: the call keeps running", s.calls.toolu_b2 and s.calls.toolu_b2.bg, s.calls)
  append(log, { { type = "user", message = { role = "user", content = { { type = "text", text = quoted } } } } })
  local it = T.scan(s)
  check("the notification itself (a user text block): followed", it and it.path == repo .. "/a.txt" and s.calls.toolu_b2 == nil, { it, s.calls })
  write(repo .. "/b.txt", "b5\n")
  append(log, { { type = "user", message = { role = "user", content = (quoted:gsub("b2", "b3")) } } })
  it = T.scan(s)
  check("the notification itself (user string content): followed", it and it.path == repo .. "/b.txt" and next(s.calls) == nil, { it, s.calls })
end)

-- review 1: HEAD is read only up to 4 MB; removed lines are capped per change
test("marks against HEAD", function()
  local big = repo .. "/big.log"
  local f = assert(io.open(big, "wb"))
  local line = string.rep("x", 99) .. "\n"
  for _ = 1, 52429 do f:write(line) end -- ~5 MB
  f:close()
  sh("cd '" .. repo .. "' && git add big.log && git commit -qm big")
  write(big, "short\n") -- the agent truncated it
  vim.cmd.edit(big)
  local b = vim.fn.bufnr(big)
  local head, too_big = T.head_lines(b)
  check("HEAD over 4 MB: not read (in a repo, not marked)", head == nil and too_big == true, { head and #head, too_big })
  local ns = vim.api.nvim_create_namespace("nvim-jay-changes")
  check("HEAD over 4 MB: no marks", #vim.api.nvim_buf_get_extmarks(b, ns, 0, -1, {}) == 0)
  local long, lines = repo .. "/long.txt", {}
  for i = 1, 200 do lines[i] = "line " .. i end
  write(long, table.concat(lines, "\n") .. "\n")
  sh("cd '" .. repo .. "' && git add long.txt && git commit -qm long")
  write(long, "x\n")
  vim.cmd.edit(long)
  local rows = {}
  for _, m in ipairs(vim.api.nvim_buf_get_extmarks(vim.fn.bufnr(long), ns, 0, -1, { details = true })) do
    for _, r in ipairs(m[4].virt_lines or {}) do rows[#rows + 1] = r[1][1] end
  end
  check("200 removed lines: 50 shown, then one line for the rest", #rows == 51 and rows[50]:find("line 50", 1, true)
    and rows[51]:find("…還有 150 行", 1, true), { #rows, rows[50], rows[51] })
  head = T.head_lines(vim.fn.bufnr(long))
  check("HEAD under 4 MB: read", head and head[200] == "line 200", head and #head)
  write(repo .. "/untracked.txt", "u\n")
  vim.cmd.edit(repo .. "/untracked.txt")
  head = T.head_lines(vim.fn.bufnr(repo .. "/untracked.txt"))
  check("untracked in a repo: all new", head and #head == 0, head)
  write(ROOT .. "/outside.txt", "o\n")
  vim.cmd.edit(ROOT .. "/outside.txt")
  local h2, b2 = T.head_lines(vim.fn.bufnr(ROOT .. "/outside.txt"))
  check("outside a repo: nothing", h2 == nil and b2 == nil, { h2, b2 })
end)

-- review 5: the snap hook never copies keys or credentials (also through a link)
test("snap hook secrets", function()
  local hook = HOME .. "/.config/nvim-jay/snap_hook.lua"
  check("snap hook written", vim.uv.fs_stat(hook) ~= nil)
  for _, p in ipairs({ "/.ssh/config", "/.aws/credentials", "/.gnupg/x", "/.config/gh/hosts.yml", "/.kube/config", "/.netrc",
    "/.git-credentials", "/.docker/config.json", "/.docker/other.txt", "/notes.txt" }) do write(HOME .. p, "data\n") end
  vim.uv.fs_symlink(HOME .. "/.ssh/config", ROOT .. "/innocent.txt")
  local cmd = "cat ~/.ssh/config $HOME/.aws/credentials ${HOME}/.gnupg/x ~/.config/gh/hosts.yml ~/.kube/config ~/.netrc "
    .. "~/.git-credentials ~/.docker/config.json " .. ROOT .. "/innocent.txt ~/.docker/other.txt ~/notes.txt"
  local r = vim.system({ vim.v.progpath, "--clean", "-l", hook },
    { stdin = vim.json.encode({ tool_use_id = "toolu_snap1", tool_input = { command = cmd } }), text = true }):wait(20000)
  check("snap hook: prints nothing, exit 0", r.code == 0 and r.stdout == "", r)
  local got = {}
  for name in vim.fs.dir(HOME .. "/.cache/nvim-jay/snap/toolu_snap1") do got[#got + 1] = name end
  table.sort(got)
  local want = { vim.fn.sha256(HOME .. "/.docker/other.txt"), vim.fn.sha256(HOME .. "/notes.txt") }
  table.sort(want)
  check("snap hook: only the ordinary files copied (no ~/.ssh, ~/.aws, ..., nor a link to one)", vim.deep_equal(got, want), got)
end)

-- review 2: git budget per round (a hung mount: one 5 s wait, not one per folder) and only the last Bash of a chunk
test("git budget", function()
  local hung = ROOT .. "/hung"
  sh("mkdir -p '" .. hung .. "/a' '" .. hung .. "/b' '" .. hung .. "/c' && cd '" .. hung .. "' && git init -q && mkfifo '"
    .. ROOT .. "/fifo' && git config include.path '" .. ROOT .. "/fifo'") -- reading the config blocks forever
  local log = ROOT .. "/s6.jsonl"
  write(log, "")
  local s = T.new_state(log, 0)
  append(log, { bash("toolu_g1", "make"), result("toolu_g1", hung, { stdout = "", stderr = "" }),
    bash("toolu_g2", "touch a.txt"), result("toolu_g2", repo, { stdout = "", stderr = "" }) })
  write(repo .. "/a.txt", "a6\n")
  local h0 = vim.uv.hrtime()
  local it = T.scan(s)
  local ms = (vim.uv.hrtime() - h0) / 1e6
  check("a chunk of Bash results: only the last one is looked at (the hung repo of the first: never asked)",
    it and it.path == repo .. "/a.txt" and ms < 3000, { it, ms })
  h0 = vim.uv.hrtime()
  local p = T.bash_changed(hung, os.time() - 1, "make -C " .. hung .. "/a -C " .. hung .. "/b -C " .. hung .. "/c")
  ms = (vim.uv.hrtime() - h0) / 1e6
  check("hung git: one timeout, then no more git this round (not 5 s per folder)", p == nil and ms < 8000 and T.git_stuck.on, { p, ms })
  check("hung git, same round: other repos skipped too", T.git(repo, { "rev-parse", "--show-toplevel" }):wait().code ~= 0)
  vim.wait(50, function() return not T.git_stuck.on end) -- nvim idle again: the next round may use git
  check("next round: git again", not T.git_stuck.on and T.git(repo, { "rev-parse", "--show-toplevel" }):wait().code == 0)
end)

-- Finding a Claude Code's session, each source: sessions/<pid>.json (older Claude Code), the daemon's roster
-- (background / remote-control sessions), the transcript folder of the agent's cwd (Claude Code 2.1.322+).
test("session sources", function()
  local S = T.session
  local sess, proj = HOME .. "/.claude/sessions", HOME .. "/.claude/projects"
  local me, child = vim.fn.getpid(), vim.system({ "sleep", "30" }) -- a process under this nvim, as under a pane
  local nobody = { pid = 999999, foreground = { pid = 999998 } }
  -- 1
  write(sess .. "/5151.json", vim.json.encode({ sessionId = "old-1", pid = 5151 }))
  local s = S({ pid = 1, foreground = { pid = 5151 } }, {})
  check("sessions/<pid>.json of the foreground", s and s.sessionId == "old-1", s)
  write(sess .. "/" .. child.pid .. ".json", vim.json.encode({ sessionId = "old-2", pid = child.pid }))
  s = S({ pid = me }, {})
  check("sessions/<pid>.json of a process under the pane", s and s.sessionId == "old-2", s)
  os.remove(sess .. "/" .. child.pid .. ".json")
  -- 2
  local roster = HOME .. "/.claude/daemon/roster.json"
  write(roster, "{not json")
  check("roster malformed: no error, nothing", S(nobody, {}) == nil)
  write(roster, vim.json.encode({ workers = {
    a = { pid = 7001, replPid = 7002, sessionId = "ros-1", cwd = "/x", token = "SECRET" },
    b = { pid = child.pid, sessionId = "ros-2", cwd = "/y", authToken = "SECRET" },
    c = "junk" } }))
  s = S({ pid = 1, foreground = { pid = 7002 } }, {})
  check("roster: worker whose replPid is the foreground; only its sessionId kept", s and s.sessionId == "ros-1"
    and vim.tbl_count(s) == 1, s)
  s = S({ pid = me, foreground = { pid = 999998 } }, {})
  check("roster: worker under the pane", s and s.sessionId == "ros-2", s)
  check("roster: no worker of this pane: nothing", S(nobody, {}) == nil)
  os.remove(roster)
  -- 3: the transcript folder: every character but A-Z a-z 0-9 is "-" (ü: one)
  local work = ROOT .. "/my proj.ü"
  vim.fn.mkdir(work, "p")
  local folder = proj .. "/" .. ROOT:gsub("[^A-Za-z0-9]", "-") .. "-my-proj--"
  local now = os.time()
  local function log(name, age)
    write(folder .. "/" .. name, "")
    vim.uv.fs_utime(folder .. "/" .. name, now - age, now - age)
  end
  local at_work = { pid = 999999, foreground = { pid = 999998, cwd = work } }
  log("aaa-old.jsonl", 2 * 86400)
  check("folder: only a log older than 24 h: nothing", S(at_work, {}) == nil)
  log("bbb-1.jsonl", 100)
  log("ccc-2.jsonl", 50)
  s = S(at_work, {})
  check("folder: the newest log", s and s.sessionId == "ccc-2" and s.log == folder .. "/ccc-2.jsonl", s)
  log("ddd-3.jsonl", 0)
  s = S(at_work, {})
  check("folder: /clear's new log wins", s and s.sessionId == "ddd-3", s)
  s = S({ pid = 999999, foreground = { pid = 999998 } }, { cwd = work })
  check("folder: the pane's cwd when the foreground's is unknown", s and s.sessionId == "ddd-3", s)
  check("folder: no foreground (unix: an agent under sudo, the root view's case): nothing",
    S({ pid = 999999 }, { cwd = work }) == nil)
  vim.uv.fs_symlink(work, ROOT .. "/worklink")
  s = S({ foreground = { cwd = ROOT .. "/worklink" } }, {})
  check("folder: a linked cwd is looked up by its real path too", s and s.sessionId == "ddd-3", s)
  write(ROOT .. "/outside.jsonl", "")
  vim.uv.fs_symlink(ROOT .. "/outside.jsonl", folder .. "/eee-4.jsonl")
  log("bad name.jsonl", 0)
  vim.uv.fs_utime(folder .. "/bad name.jsonl", now + 5, now + 5)
  s = S(at_work, {})
  check("folder: a link or a name that is no id is never picked", s and s.sessionId == "ddd-3", s)
  -- only logs changed since that Claude Code started (its <pid>.<x>.key: a date, never read)
  for _, f in ipairs({ "bbb-1.jsonl", "ccc-2.jsonl", "ddd-3.jsonl" }) do log(f, 100) end
  write(sess .. "/" .. child.pid .. ".abc.key", "x")
  local started = T.started({ child.pid }, child.pid)
  check("start from <pid>.<x>.key", started and math.abs(started - os.time()) <= 2, started)
  local mine = { pid = 999999, foreground = { pid = child.pid, cwd = work } }
  check("folder: logs from before the agent started: nothing", S(mine, {}) == nil)
  vim.uv.fs_utime(folder .. "/ccc-2.jsonl", now + 1, now + 1)
  s = S(mine, {})
  check("folder: a log changed since the start", s and s.sessionId == "ccc-2", s)
  os.remove(sess .. "/" .. child.pid .. ".abc.key")
  if vim.uv.fs_stat("/proc/self/stat") then
    started = T.started({}, child.pid)
    check("start from /proc (Linux)", started and math.abs(started - os.time()) <= 5, started)
  end
  -- session_log end to end (fake hc): the file itself; a linked folder out of projects and a glob id are refused
  write(FAKE .. "/get-t9.json", vim.json.encode({ pid = 999999, foreground = { pid = 999998, cwd = work } }))
  local t9 = { address = "t9", agent = "claude-code" }
  check("session_log: the folder's log", T.session_log(t9) == folder .. "/ccc-2.jsonl", T.session_log(t9))
  write(ROOT .. "/outproj/sess-x.jsonl", "")
  vim.uv.fs_symlink(ROOT .. "/outproj", proj .. "/linked")
  write(sess .. "/6161.json", vim.json.encode({ sessionId = "sess-x" }))
  write(FAKE .. "/get-t9.json", vim.json.encode({ pid = 999999, foreground = { pid = 6161 } }))
  check("session_log: a log reached through a linked folder: refused", T.session_log(t9) == nil, T.session_log(t9))
  write(sess .. "/6262.json", vim.json.encode({ sessionId = "*" }))
  write(FAKE .. "/get-t9.json", vim.json.encode({ pid = 999999, foreground = { pid = 6262 } }))
  check("session_log: an id that is no id (*): nothing", T.session_log(t9) == nil, T.session_log(t9))
  child:kill(9)
end)

-- agent-files opens a file here: nvim --server ~/.cache/nvim-jay/sock/<pid> --remote-expr "v:lua.JN.open_hex('<hex>')"
test("open from outside", function()
  local dir = HOME .. "/.cache/nvim-jay/sock"
  local addr = dir .. "/" .. vim.fn.getpid()
  check("server: listens on sock/<pid>", vim.tbl_contains(vim.fn.serverlist(), addr), vim.fn.serverlist())
  check("server: its folder is only yours", bit.band(vim.uv.fs_stat(dir).mode, 511) == 448, vim.uv.fs_stat(dir).mode)
  local p = ROOT .. "/odd name's \"q\" #1.txt"
  write(p, "x\n")
  local hex = (p:gsub(".", function(c) return ("%02x"):format(c:byte()) end))
  local got
  vim.system({ vim.v.progpath, "--server", addr, "--remote-expr", ("v:lua.JN.open_hex('%s')"):format(hex) }, { text = true },
    function(r) got = r end)
  vim.wait(10000, function() return got ~= nil and vim.api.nvim_buf_get_name(0) == p end, 20)
  check("open_hex: a client gets ok", got and vim.trim(got.stdout) == "ok", got)
  check("open_hex: the file is open", vim.api.nvim_buf_get_name(0) == p, vim.api.nvim_buf_get_name(0))
  check("open_hex: not hex: refused", JN.open_hex("zz") == "bad path")
  check("open_hex: odd length: refused", JN.open_hex("abc") == "bad path")
  check("open_hex: a newline in the path: refused", JN.open_hex("2f610a62") == "bad path")
  vim.cmd("silent! %bwipeout!")
end)

print(("%d checks, %d failed"):format(n, fails))
write(ROOT .. "/result", fails == 0 and "pass" or "fail")
vim.cmd("qa!")
