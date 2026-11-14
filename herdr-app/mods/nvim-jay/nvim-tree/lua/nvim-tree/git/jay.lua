-- Not part of nvim-tree: nvim-jay's one change to it (herdr-jay mods/nvim-jay/nvim-tree/README.md).
-- Every git command nvim-tree runs starts with what nvim-jay gives for that folder: git by its full path (never a
-- git.exe in the project folder) and the switches nvim-jay's own git calls use (the repo's fsmonitor, filters and
-- hooks off, no fetch, no submodules). nil: no git for that folder. Without nvim-jay: plain "git".
local M = {}
---@param dir string
---@return string[]|nil
function M.argv(dir)
  local f = _G.JN and _G.JN.tree_git
  if not f then return { "git" } end
  return f(dir)
end
return M
