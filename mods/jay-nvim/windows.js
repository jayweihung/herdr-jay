import { appHome, readTextFile, run, writeTextFile } from "herdr";
import { NVIM_INIT } from "./nvim.js";
import { MARK } from "./mark.js";

// Windows, a pane on this computer: no /bin/sh, and a command line holds at most 32767 characters (the Lua is
// longer). So the Lua goes to a hidden file in this mod's folder (it exists; hidden files don't hot-reload the mod),
// and nvim sources it. nvim.exe must be on PATH (winget / scoop / the zip); Herdr's core finds it there.
// :source with fnameescape, not -S (which reads "#" and "%" in the path as specials) and not Lua's dofile (which opens
// the file through the ANSI code page, so a non-English user name could break it).
// jay-nvim-pick finds this pane by the argv item MARK.
export async function openWindows() {
  const sep = appHome().includes("\\") ? "\\" : "/";
  const file = [appHome(), "mods", "jay-nvim", ".init.lua"].join(sep);
  const old = await readTextFile(file);
  if (old !== NVIM_INIT) await writeTextFile(file, NVIM_INIT, old);
  run("terminal.open", {
    argv: ["nvim", "--cmd", MARK, "-c", `lua vim.cmd("source " .. vim.fn.fnameescape([==[${file}]==]))`],
    place: "right",
    name: "nvim",
  });
}
