// nvim-jay's hooks for omp (it loads a plugin's hooks/pre/*.js as hook modules): the module nvim-jay writes on this
// machine, ~/.config/nvim-jay/omp_hook.js (it runs the snap and reply hooks with nvim, never blocks a tool). Not
// there yet (nvim-jay never ran here): nothing.
// Only files that are yours run (omp may run as root: a file another account can write must not run as root): the
// module and the Lua hooks it runs, each with links followed to the real file, under your home, it and its folder
// owned by you and not group- or world-writable (Windows: no link or junction on the way). Otherwise: nothing.
import { lstatSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { pathToFileURL } from "node:url";

const win = process.platform === "win32";
// a file of yours (see above); throws when it isn't there
function yours(file, home) {
  const real = realpathSync(file);
  if (!real.startsWith(realpathSync(home) + sep)) return false;
  if (win) return ![file, dirname(file), dirname(dirname(file))].some((p) => lstatSync(p).isSymbolicLink()); // junctions too
  const uid = process.getuid();
  return [real, dirname(real)].every((p) => { const s = statSync(p); return s.uid === uid && (s.mode & 0o022) === 0; });
}

export default async function nvimJay(pi) {
  try {
    const home = homedir(), dir = join(home, ".config", "nvim-jay"), file = join(dir, "omp_hook.js");
    try { lstatSync(file); } catch { return; } // nvim-jay never ran here
    if (!yours(file, home)) return;
    for (const lua of ["snap_hook.lua", "reply_hook.lua"]) {
      let there = true;
      try { lstatSync(join(dir, lua)); } catch { there = false; }
      if (there && !yours(join(dir, lua), home)) return;
    }
    (await import(pathToFileURL(realpathSync(file)).href)).default(pi);
  } catch {}
}
