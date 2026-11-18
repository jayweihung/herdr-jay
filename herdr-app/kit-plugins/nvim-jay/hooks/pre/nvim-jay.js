// nvim-jay's hooks for omp (it loads a plugin's hooks/pre/*.js as hook modules): the module nvim-jay writes on this
// machine, ~/.config/nvim-jay/omp_hook.js (it runs the snap and reply hooks with nvim, never blocks a tool). Not
// there yet (nvim-jay never ran here): nothing.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const FILE = join(homedir(), ".config", "nvim-jay", "omp_hook.js");

export default async function nvimJay(pi) {
  if (!existsSync(FILE)) return;
  try { (await import(pathToFileURL(FILE).href)).default(pi); } catch {}
}
