-- Run by run.js in a second headless nvim, started with g:nvim_jay_review (a Gerrit change opened from the panel).
local RV = JN.test.review
for _, t in ipairs(JN.timers) do pcall(function() t:stop() end) end
local ROOT = vim.env.JN_TEST_ROOT
local R = RV.R
local fails, n = 0, 0
local function check(name, ok, detail)
  n = n + 1
  if ok then print("ok    review: " .. name) else fails = fails + 1 print("FAIL  review: " .. name .. (detail and ("\n      " .. vim.inspect(detail)) or "")) end
end
local function test(name, fn)
  local ok, e = pcall(fn)
  if not ok then fails, n = fails + 1, n + 1 print("FAIL  review: " .. name .. "\n      " .. tostring(e)) end
end
local api = vim.api
local wt = vim.env.JN_REVIEW_DIR
local changes = api.nvim_create_namespace("nvim-jay-changes")
local cmt = api.nvim_create_namespace("nvim-jay-review-comments")
local function cur_rel() return R and JN.test.review.rel(api.nvim_buf_get_name(0)) end
local function list_text() return table.concat(api.nvim_buf_get_lines(R.list, 0, -1, false), "\n") end

test("start", function()
  check("review mode on, the list on the left", R ~= nil and vim.bo[R.list].filetype == "nvim-jay-review")
  check("no netrw tree", #vim.tbl_filter(function(w) return vim.bo[api.nvim_win_get_buf(w)].filetype == "netrw" end, api.nvim_tabpage_list_wins(0)) == 0)
  check("the list names the change and every file", list_text():find("#7 第 2 版", 1, true) and list_text():find("a.txt", 1, true)
    and list_text():find("n.txt 新增", 1, true) and list_text():find("gone.txt 刪除", 1, true), list_text())
  check("opened the first file not seen", cur_rel() == "a.txt", cur_rel())
  check("a.txt is marked against the base (its change: line 2)", #api.nvim_buf_get_extmarks(0, changes, 0, -1, {}) > 0)
  check("the review's base for this file", JN.review_spec(wt .. "/a.txt") == R.data.base .. ":./a.txt", JN.review_spec(wt .. "/a.txt"))
  check("a renamed file: its old path in the base", JN.review_spec(wt .. "/new.txt") == R.data.base .. ":old.txt")
  check("a file outside the change: HEAD as usual", JN.review_spec(ROOT .. "/elsewhere/x.txt") == nil)
  local marks = api.nvim_buf_get_extmarks(0, cmt, 0, -1, { details = true })
  check("Alice's comment under line 2", #marks == 1 and marks[1][2] == 1 and vim.inspect(marks[1][4].virt_lines):find("Alice", 1, true), marks)
  check("seen.json has a.txt", (RV.seen())["a.txt"] == true)
  check("the list ticks it", list_text():find("✓ a.txt", 1, true) ~= nil, list_text())
end)

test("next file, deleted file, hunks", function()
  RV.step(1)
  check("]f: the next file", cur_rel() == "n.txt", cur_rel())
  check("a new file: all lines marked +", #api.nvim_buf_get_extmarks(0, changes, 0, -1, {}) >= 2)
  RV.step(1)
  check("]f: the deleted file shows the base's lines as removed", vim.b.nvim_jay_review_path == "gone.txt"
    and #api.nvim_buf_get_extmarks(0, changes, 0, -1, { details = true }) == 1)
  R.order = "tests"
  check("o: tests first", RV.ordered()[1].path == "t_test.txt")
  R.order = "gerrit"
  R.open(RV.ordered()[1])
  api.nvim_win_set_cursor(0, { 1, 0 })
  RV.hunk(1)
  check("]c: the next change (line 2)", api.nvim_win_get_cursor(0)[1] == 2, api.nvim_win_get_cursor(0))
end)

test("draft", function()
  R.open(RV.ordered()[1], 1)
  local orig = vim.ui.input
  vim.ui.input = function(_, cb) cb("  why this?  ") end
  R.draft()
  vim.ui.input = orig
  local f = io.open(R.home .. "/from-nvim.jsonl", "r")
  local text = f and f:read("*a") or ""
  if f then f:close() end
  local rec = vim.json.decode(vim.split(text, "\n")[1])
  check("space r c writes a draft for the panel", rec.draft.path == "a.txt" and rec.draft.line == 1 and rec.draft.message == "why this?" and rec.draft.head == R.data.head, rec)
  check("shown at once as a draft", vim.inspect(api.nvim_buf_get_extmarks(0, cmt, 0, -1, { details = true })):find("你的草稿", 1, true) ~= nil)
end)

test("the panel's jump", function()
  local d = vim.json.decode(table.concat(vim.fn.readfile(R.file), "\n"))
  d.jump = { path = "n.txt", line = 2, seq = 5 }
  d.comments["n.txt"] = { { line = 1, author = "Bob", message = "nice", unresolved = false }, { line = 1, author = "Amy", message = "thanks", unresolved = false } }
  d.base_ps = vim.NIL -- written as null
  vim.fn.writefile({ vim.json.encode(d) }, R.file)
  vim.uv.sleep(20)
  R.stamp = nil
  R.tick()
  check("jumped to n.txt line 2", cur_rel() == "n.txt" and api.nvim_win_get_cursor(0)[1] == 2, { cur_rel(), api.nvim_win_get_cursor(0) })
  local ms = api.nvim_buf_get_extmarks(0, cmt, 0, -1, { details = true })
  local shown = #ms == 1 and vim.inspect(ms[1][4].virt_lines) or ""
  check("its comments drawn, one mark per line, oldest first", #ms == 1 and shown:find("Bob", 1, true) and shown:find("Bob", 1, true) < shown:find("Amy", 1, true), ms)
  check("null base_ps: against the parent", R.data.base_ps == nil and list_text():find("跟上一個 commit 比", 1, true) ~= nil, list_text())
  R.stamp = nil R.tick()
  check("the same jump only once", R.jump == 5)
end)

print(("%d review checks, %d failed"):format(n, fails))
local out = io.open(ROOT .. "/result-review", "w")
out:write(fails == 0 and "pass" or "fail")
out:close()
vim.cmd("qa!")
