// Writes herdr-app/mods/nvim-jay/nvim-tree/files.txt after nvim-tree is updated: node tests/nvim-jay/tree-files.js <tag> <commit>
// Line 1: the tag, the commit and a sum of every file (run.js checks it); then each file nvim-jay sends to a machine.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "herdr-app", "mods", "nvim-jay", "nvim-tree");
const { hash } = await import(pathToFileURL(join(dir, "..", "send.js")));
export function list() {
  const out = [];
  const walk = (rel) => {
    for (const n of readdirSync(join(dir, rel))) {
      const p = rel ? `${rel}/${n}` : n;
      if (statSync(join(dir, p)).isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk("lua");
  walk("plugin");
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
export const sum = (paths) => hash(paths.map((p) => p + "\0" + readFileSync(join(dir, p), "utf8")).join("\0"));
export { dir };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [tag, commit] = process.argv.slice(2);
  if (!tag || !commit) { console.log("usage: node tests/nvim-jay/tree-files.js <tag> <commit>"); process.exit(1); }
  const paths = list();
  writeFileSync(join(dir, "files.txt"), [`${tag} ${commit} ${sum(paths)}`, ...paths].join("\n") + "\n");
  console.log(`${paths.length} files`);
}
