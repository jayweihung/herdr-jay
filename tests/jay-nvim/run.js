// Tests for herdr-app/mods/jay-nvim/nvim.js (the follow feature) without Herdr: node tests/jay-nvim/run.js
// (macOS, Linux; needs Node 18+, Neovim 0.11+ and git on PATH). The Lua runs in a headless nvim with HOME in a temp
// folder and a fake hc (a /bin/sh script answering ls / get from files), so nothing of yours is read or changed.
// Not on Windows yet: the fake hc is a shell script.
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, realpathSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

if (process.platform === "win32") { console.log("skipped: the fake hc is a shell script (macOS / Linux only)"); process.exit(0); }
const here = dirname(fileURLToPath(import.meta.url));
const { NVIM_INIT } = await import(pathToFileURL(join(here, "..", "..", "herdr-app", "mods", "jay-nvim", "nvim.js")));
const nvim = spawnSync("sh", ["-c", "command -v nvim"], { encoding: "utf8" }).stdout.trim();
const git = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
if (!nvim || !git) { console.log("needs nvim and git on PATH"); process.exit(1); }

const root = realpathSync(mkdtempSync(join(tmpdir(), "jay-nvim-test-")));
try {
  const home = join(root, "home"), bin = join(root, "bin"), fake = join(root, "fake");
  for (const d of [home, bin, fake]) mkdirSync(d, { recursive: true });
  writeFileSync(join(bin, "hc"), `#!/bin/sh
[ -f "${fake}/slow" ] && exec sleep 30
case "$1" in
  ls) cat "${fake}/ls.json" ;;
  get) cat "${fake}/get-$2.json" ;;
esac
`);
  chmodSync(join(bin, "hc"), 0o755);
  writeFileSync(join(root, "init.lua"), NVIM_INIT);
  const env = {
    HOME: home, HC_TERMINAL_ID: "t1", JN_TEST_ROOT: root, JN_FAKE: fake,
    PATH: [bin, dirname(nvim), dirname(git), "/usr/bin", "/bin"].join(":"),
    GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  };
  const r = spawnSync(nvim, ["--headless", "--clean", "-i", "NONE", "-n",
    "-c", `luafile ${join(root, "init.lua")}`, "-c", `luafile ${join(here, "test.lua")}`], { cwd: root, env, encoding: "utf8", timeout: 120000 });
  const out = (r.stdout || "") + (r.stderr || "");
  process.stdout.write(out.endsWith("\n") ? out : out + "\n");
  let result = "";
  try { result = readFileSync(join(root, "result"), "utf8"); } catch {}
  if (r.status !== 0 || result.trim() !== "pass") { console.log(`failed (exit ${r.status}${r.error ? ", " + r.error.message : ""})`); process.exitCode = 1; }
} finally {
  rmSync(root, { recursive: true, force: true });
}
