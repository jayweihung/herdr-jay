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
  check("no file tree (the list is on the left instead)", #vim.tbl_filter(function(w) local ft = vim.bo[api.nvim_win_get_buf(w)].filetype return ft == "netrw" or ft == "NvimTree" end, api.nvim_tabpage_list_wins(0)) == 0)
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
  -- one click on a row of the list opens that file (nvim moved the cursor there first)
  for _, w in ipairs(api.nvim_tabpage_list_wins(0)) do
    if api.nvim_win_get_buf(w) == R.list then
      api.nvim_set_current_win(w)
      for i, e in pairs(R.rows) do if e.path == "n.txt" then api.nvim_win_set_cursor(w, { i, 0 }) end end
    end
  end
  JN.click_open("list")
  check("one click on the list opens that file", cur_rel() == "n.txt" and api.nvim_get_current_buf() ~= R.list, cur_rel())
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

-- the last request nvim wrote for the panel
local function last_rec()
  local f = io.open(R.home .. "/from-nvim.jsonl", "r")
  local text = f and f:read("*a") or ""
  if f then f:close() end
  local ls = vim.tbl_filter(function(l) return l ~= "" end, vim.split(text, "\n"))
  return ls[#ls] and vim.json.decode(ls[#ls]) or nil
end
local function with_ui(input, choose, fn)
  local oi, os_, om = vim.ui.input, vim.ui.select, JN.menu.open
  local seen = {}
  JN.menu.open = function(items, o)
    seen.labels, seen.at, seen.lines = {}, o and o.at, o and o.lines
    local pick
    local function walk(list, pre)
      for _, it in ipairs(JN.menu.clean(list)) do
        if it ~= "-" then
          seen.labels[#seen.labels + 1] = pre .. it.label
          if it.sub then walk(type(it.sub) == "function" and it.sub() or it.sub, pre .. it.label .. " ▸ ")
          elseif not pick and choose and it.label:find(choose, 1, true) then pick = it end
        end
      end
    end
    walk(items, "")
    if pick then pick.fn() end
  end
  vim.ui.input = function(o, cb) seen.prompt = o.prompt seen.default = o.default cb(input) end
  vim.ui.select = function(items, o, cb)
    seen.asked = o.prompt
    seen.labels = vim.tbl_map(function(x) return o.format_item and o.format_item(x) or x end, items)
    local pick
    for _, x in ipairs(items) do if (o.format_item and o.format_item(x) or x):find(choose or "\0", 1, true) then pick = x break end end
    cb(pick)
  end
  local ok, e = pcall(fn)
  vim.ui.input, vim.ui.select, JN.menu.open = oi, os_, om
  if not ok then error(e) end
  return seen
end

test("threads, the menu, replies and your drafts", function()
  local d = vim.json.decode(table.concat(vim.fn.readfile(R.file), "\n"))
  d.jump = vim.NIL
  d.comments = { ["a.txt"] = {
    { id = "c1", thread = "c1", line = 2, author = "Alice", message = "why TWO?", unresolved = true, at = "1" },
    { id = "c2", thread = "c1", reply_to = "c1", line = 2, author = "Bob", message = "me too", unresolved = true, at = "2" },
    { id = "d9", thread = "d9", line = 3, author = "你", message = "mine", unresolved = true, draft = true, at = "3" },
  } }
  vim.fn.writefile({ vim.json.encode(d) }, R.file)
  vim.uv.sleep(20) R.stamp = nil R.tick()
  R.open(RV.ordered()[1], 2)
  local th = RV.threads("a.txt")
  check("two threads: Alice's with Bob's reply under it, your draft", #th == 2 and #th[1].items == 2 and th[1].last.id == "c2" and th[1].open and th[2].draft ~= nil, th)
  local shown = vim.inspect(api.nvim_buf_get_extmarks(0, cmt, 0, -1, { details = true }))
  check("drawn as a thread: the reply indented", shown:find("↳ Bob", 1, true) ~= nil and shown:find("Alice（未解決）", 1, true) ~= nil, shown)
  check("Enter is the right-click menu in a file of the change", vim.fn.maparg("<CR>", "n", false, true).desc == "這裡能做的事（跟右鍵一樣）")
  local seen = with_ui(nil, nil, function() R.menu() end)
  local all = table.concat(seen.labels or {}, "\n")
  check("the menu: comment, a suggested edit, Alice's thread ▸ reply / Done / Ack, ask the agent", all:find("留言（寫意見）", 1, true)
    and all:find("直接改給作者看", 1, true) and all:find("Alice「why TWO?」 ▸ 回覆", 1, true) and all:find("▸ Done", 1, true)
    and all:find("▸ Ack", 1, true) and all:find("問 agent 這一行", 1, true) and not all:find("草稿", 1, true) and seen.at == "cursor", seen.labels)
  check("no comments for the agent, no pasting in a change", not all:find("註解", 1, true) and not all:find("貼上", 1, true), seen.labels)
  with_ui(nil, "Done", function() R.menu() end)
  local rec = last_rec()
  check("Done: a resolving reply to the thread's last comment", rec.reply and rec.reply.in_reply_to == "c2" and rec.reply.message == "Done" and rec.reply.unresolved == false, rec)
  local now = vim.inspect(api.nvim_buf_get_extmarks(0, cmt, 0, -1, { details = true }))
  check("shown at once in the thread, as your draft", now:find("↳ 📝 你的草稿", 1, true) ~= nil and now:find("Done", 1, true) ~= nil, now)
  vim.uv.sleep(20) R.stamp = nil R.load()  -- the panel's review.json again (without the pending one)
  with_ui("  yes, see line 4 ", "回覆", function() R.menu() end)
  rec = last_rec()
  check("a typed reply keeps the thread open", rec.reply and rec.reply.message == "yes, see line 4" and rec.reply.unresolved == true, rec)
  vim.uv.sleep(20) R.stamp = nil R.load()
  api.nvim_win_set_cursor(0, { 3, 0 })
  seen = with_ui("better", "改草稿", function() R.menu() end)
  rec = last_rec()
  check("edit your draft: its text offered, then saved", seen.default == "mine" and rec.edit and rec.edit.id == "d9" and rec.edit.message == "better", { seen, rec })
  vim.uv.sleep(20) R.stamp = nil R.load()
  seen = with_ui(nil, "刪掉", function() R.menu() end)
  rec = last_rec()
  check("delete your draft (asked first)", rec.delete and rec.delete.id == "d9" and (seen.asked or ""):find("刪掉這則草稿", 1, true), { rec, seen })
end)

test("a newer patch set: switch, only what it changed", function()
  vim.uv.sleep(20) R.stamp = nil R.load()
  R.data.latest = 3
  R.render()
  check("the list says there is a newer one", list_text():find("有第 3 版了", 1, true) ~= nil, list_text())
  local v = RV.versions()
  check("offered: 2→3 only, or all of 3", #v == 2 and v[1].to == 3 and v[1].base == 2 and v[2].to == 3 and v[2].base == nil, v)
  R.open(RV.ordered()[1], 2)
  with_ui(nil, "只看第 2→3", function() R.menu() end)
  local rec = last_rec()
  check("asks the panel for patch set 3 against 2", rec.update and rec.update.to == 3 and rec.update.base == 2, rec)
  check("shows the download meanwhile", list_text():find("下載第 3 版中", 1, true) ~= nil, list_text())
end)

test("ask the Gerrit agent about lines", function()
  check("hunks: only the selected lines", R.hunks("diff --git a/x b/x\n@@ -1,2 +1,2 @@\n-a\n+A\n b\n@@ -10 +10,2 @@\n z\n+y", 11, 11) == "@@ -10,0 +11,1 @@\n+y")
  local big = "@@ -1,2 +1,8 @@\n+.PHONY: test lint\n+\n test:\n-\tpython3 -m pytest\n+\tpython3 -m pytest -q\n+\n+lint:\n+\truff check .\n+check: lint test"
  local got = R.hunks(big, 4, 4)
  check("hunks: only the selected line (and what it replaced), not the whole hunk", got == "@@ -2,1 +4,1 @@\n-\tpython3 -m pytest\n+\tpython3 -m pytest -q", got)
  got = R.hunks(big, 8, 8)
  check("hunks: the last line", got == "@@ -2,0 +8,1 @@\n+check: lint test", got)
  R.data.updating = nil
  R.open(RV.ordered()[1], 2)
  with_ui("is this right?", nil, function() R.ask(2, 2) end)
  local rec = last_rec()
  check("the question, the lines and their change", rec.ask and rec.ask.path == "a.txt" and rec.ask.line == 2 and rec.ask["end"] == 2
    and rec.ask.question == "is this right?" and rec.ask.diff:find("+TWO", 1, true) ~= nil, rec)
  R.open({ path = "new.txt", status = "R", old_path = "old.txt" }, 1)  -- renamed, its text unchanged
  with_ui("", nil, function() R.ask(1, 1) end)
  rec = last_rec()
  check("unchanged lines: the lines themselves", rec.ask.path == "new.txt" and rec.ask.diff:find("沒有改動", 1, true) ~= nil and rec.ask.diff:find("same", 1, true) ~= nil, rec)
end)

test("a suggested edit, threads from an older patch set, your own change", function()
  local F = string.rep(string.char(96), 3)
  check("a suggestion block shows as the lines it suggests", R.shown("better:\n\n" .. F .. "suggestion\nx = 1\ny = 2\n" .. F)
    == "better:\n\n✏️ 建議改成：\n  x = 1\n  y = 2", R.shown("better:\n\n" .. F .. "suggestion\nx = 1\ny = 2\n" .. F))
  R.data.updating = nil
  R.open(RV.ordered()[1], 2)
  local file_win, line2 = api.nvim_get_current_win(), api.nvim_buf_get_lines(0, 1, 2, false)[1]
  -- selected lines + Enter: the menu has 建議改法; it opens a small window with those lines
  local seen = with_ui(nil, "直接改給作者看", function() R.sel_menu(2, 2) end)
  check("selected lines: ask, suggest, copy", table.concat(seen.labels, "|") == "問 agent 這幾行|直接改給作者看（作者一鍵套用）|複製" and seen.lines[1] == 2, seen.labels)
  local sw = api.nvim_get_current_win()
  check("a window with the line to edit", sw ~= file_win and api.nvim_buf_get_lines(0, 0, -1, false)[1] == line2, api.nvim_buf_get_lines(0, 0, -1, false))
  local sl = table.concat(vim.tbl_map(function(it) return it == "-" and "-" or it.label end,
    JN.menu.clean(JN.menu.items({ buf = api.nvim_get_current_buf(), win = sw, line = 1 }))), "|")
  check("its menu: save it or never mind", sl == "存成建議（作者按一下就套用）|不要了", sl)
  api.nvim_buf_set_lines(0, 0, -1, false, { "two, fixed", "and one more" })
  with_ui("simpler", nil, function() vim.cmd("write") end)
  local rec = last_rec()
  check("saved as a suggestion of line 2", rec.suggest and rec.suggest.path == "a.txt" and rec.suggest.start == 2 and rec.suggest.line == 2
    and rec.suggest.text == "two, fixed\nand one more" and rec.suggest.message == "simpler" and rec.suggest.end_char == vim.fn.strchars(line2), rec)
  check("the window closed, back in the file", not api.nvim_win_is_valid(sw) and cur_rel() == "a.txt")
  -- threads ported from patch set 1, and your own change
  local d = vim.json.decode(table.concat(vim.fn.readfile(R.file), "\n"))
  d.jump, d.updating, d.mine = vim.NIL, vim.NIL, true
  d.comments = { ["a.txt"] = {
    { id = "p1", thread = "p1", line = 2, author = "Alice", message = "rename it", unresolved = true, at = "1", from_ps = 1 },
    { id = "p2", thread = "p2", line = 3, author = "Bob", message = "and this", unresolved = true, at = "2" },
  } }
  vim.fn.writefile({ vim.json.encode(d) }, R.file)
  vim.uv.sleep(20) R.stamp = nil R.tick()
  local texts = {}
  for _, m in ipairs(api.nvim_buf_get_extmarks(0, cmt, 0, -1, { details = true })) do
    for _, vl in ipairs(m[4].virt_lines or {}) do for _, chunk in ipairs(vl) do texts[#texts + 1] = chunk[1] end end
  end
  check("a thread from patch set 1 says so", table.concat(texts, "\n"):find("第 1 版留的", 1, true) ~= nil, texts)
  check("your change: the list says the agent can fix", list_text():find("請 agent 照留言改", 1, true) ~= nil, list_text())
  api.nvim_win_set_cursor(0, { 1, 0 })
  R.next_open(1)
  check("]u: the next unresolved thread", api.nvim_win_get_cursor(0)[1] == 2, api.nvim_win_get_cursor(0))
  R.next_open(1)
  check("]u again: the one after", api.nvim_win_get_cursor(0)[1] == 3, api.nvim_win_get_cursor(0))
  api.nvim_win_set_cursor(0, { 2, 0 })
  seen = with_ui(nil, "請 agent 照這則改", function() R.menu() end)
  rec = last_rec()
  check("the menu: ask the agent to fix it", rec.fix and rec.fix.path == "a.txt" and rec.fix.line == 2 and rec.fix.thread[1].message == "rename it", rec)
  check("the menu has 直接改給作者看 and 看還沒推的改動", table.concat(seen.labels, "|"):find("直接改給作者看", 1, true) ~= nil
    and table.concat(seen.labels, "|"):find("看還沒推的改動", 1, true) ~= nil, seen.labels)
end)

print(("%d review checks, %d failed"):format(n, fails))
local out = io.open(ROOT .. "/result-review", "w")
out:write(fails == 0 and "pass" or "fail")
out:close()
vim.cmd("qa!")
