import { appHome, exec, readTextFile } from "herdr";
import { NVIM_INIT } from "./nvim.js";
import { makeWhere } from "./send.js";

// macOS and Linux (this computer or another machine): nvim-jay's Lua and the file tree (nvim-tree, in ./nvim-tree,
// GPL-3.0) go to the machine the pane opens on, as files under ~/.cache/nvim-jay there, once per version:
//   init-<hash>/init.lua        NVIM_INIT
//   nvim-tree-<hash>/lua/...    the files ./nvim-tree/files.txt lists
// The other machine has no copy of this mod, and the Lua can't ride on nvim's command line: Linux takes at most
// 131072 bytes per argument (the Lua is longer), so the files go over `exec` in arguments of at most 100000 bytes,
// into a folder of their own that is renamed into place when whole (two panes opening at once can't mix halves).
// Each start touches the folders it uses; ones unused for 30 days are removed.
// -> where(machine) gives the two folders, under $HOME as nvim reads it there

// The mod's own folder on this computer, and a file in it (Windows: nvim reads the tree from there)
export function modFile(rel) {
  const home = appHome();
  const sep = home.includes("\\") ? "\\" : "/";
  return [home, "mods", "nvim-jay", ...rel.split("/")].join(sep);
}
export const where = makeWhere({ exec, readTextFile, modFile, init: () => NVIM_INIT });
