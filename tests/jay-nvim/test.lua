-- Run by run.js inside a headless nvim that has just run jay-nvim's Lua (JN.test holds the follow pieces).
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
  write(HOME .. "/.cache/jay-nvim/snap/toolu_s1/" .. vim.fn.sha256(c), "1\nTWO\n3\n4\n5\n")
  append(log, { bash("toolu_s1", "sed -i s/4/FOUR/ " .. c) })
  tick()
  write(c, "1\nTWO\n3\nFOUR\n5\n")
  append(log, { result("toolu_s1", repo, { stdout = "", stderr = "" }) })
  tick()
  local b = vim.fn.bufnr(c)
  local marks = b > 0 and vim.api.nvim_buf_get_extmarks(b, vim.api.nvim_create_namespace("jay-nvim-changes"), 0, -1, { details = true }) or {}
  local rows = {}
  for _, m in ipairs(marks) do if m[4].line_hl_group then rows[#rows + 1] = m[2] + 1 end end
  check("snapshot is the base: only line 4 marked (not line 2 from before)", vim.deep_equal(rows, { 4 }), { rows, F.last, vim.api.nvim_buf_get_name(0) })
  check("cursor on the change", vim.api.nvim_win_get_cursor(0)[1] == 4, vim.api.nvim_win_get_cursor(0))
  -- 4: a stuck hc doesn't freeze nvim
  write(FAKE .. "/slow", "")
  local t0 = vim.uv.now()
  local got, err = JN.agents()
  os.remove(FAKE .. "/slow")
  check("stuck hc (sleeps 30s): nvim gives up after 2s (killed; a few seconds at most)", got == nil and vim.uv.now() - t0 < 8000 and tostring(err):find("沒回應"), { got, err, vim.uv.now() - t0 })
  -- 15: our own tab unknown: no agents rather than another tab's
  write(FAKE .. "/get-t1.json", "not json")
  local l2 = JN.agents()
  check("own tab unknown: no agent", l2 == nil, l2)
end)

print(("%d checks, %d failed"):format(n, fails))
write(ROOT .. "/result", fails == 0 and "pass" or "fail")
vim.cmd("qa!")
