// Tests for herdr-app/mods/nvim-jay/nvim.js (the follow feature) without Herdr: node tests/nvim-jay/run.js
// (macOS, Linux; needs Node 18+, Neovim 0.11+ and git on PATH). The Lua runs in a headless nvim with HOME in a temp
// folder and a fake hc (a /bin/sh script answering ls / get from files), so nothing of yours is read or changed.
// Not on Windows yet: the fake hc is a shell script.
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, realpathSync, rmSync, readFileSync, readdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
// nvim-jay's launchers and agent-files must agree on MARK (mods can't import from each other)
{
  const mods = join(here, "..", "..", "herdr-app", "mods");
  const { MARK } = await import(pathToFileURL(join(mods, "nvim-jay", "mark.js")));
  const files = readFileSync(join(mods, "agent-files", "main.js"), "utf8");
  const theirs = files.match(/^const MARK = "([^"]*)";$/m)?.[1];
  if (theirs !== MARK) { console.log(`MARK differs: mark.js ${JSON.stringify(MARK)}, agent-files ${JSON.stringify(theirs)}`); process.exit(1); }
  console.log("ok    MARK is the same in nvim-jay/mark.js and agent-files");
  // a review tab: shell: false (the tab closes with nvim); an app that refuses it: the same tab without it
  const { openPane } = await import(pathToFileURL(join(mods, "nvim-jay", "mark.js")));
  const calls = [];
  openPane((n, a) => { calls.push([n, a]); }, ["nvim"], "/w", { review: "/r.json", name: "review 7", space: "s1" });
  openPane((n, a) => { calls.push([n, a]); if (a.shell === false) throw new Error("tab.new: unknown argument(s): shell"); }, ["nvim"], "/w", { review: "/r.json" });
  openPane((n, a) => { calls.push([n, a]); }, ["nvim"], "/w");
  const want = JSON.stringify([
    ["tab.new", { name: "review 7", space: "s1", folder: "/w", argv: ["nvim"], shell: false }],
    ["tab.new", { name: "review", folder: "/w", argv: ["nvim"], shell: false }],
    ["tab.new", { name: "review", folder: "/w", argv: ["nvim"] }],
    ["terminal.open", { folder: "/w", argv: ["nvim"], place: "right", name: "nvim" }]]);
  if (JSON.stringify(calls) !== want) { console.log(`openPane: ${JSON.stringify(calls)}`); process.exit(1); }
  console.log("ok    a review tab opens with shell: false, and without it on an app that refuses it");
}
// the bundled tree: files.txt lists exactly its files, and its sum is theirs (tree-files.js rewrites it)
{
  const { list, sum, dir } = await import(pathToFileURL(join(here, "tree-files.js")));
  const lines = readFileSync(join(dir, "files.txt"), "utf8").split("\n").filter(Boolean);
  const paths = list();
  const ok = JSON.stringify(lines.slice(1)) === JSON.stringify(paths) && lines[0].split(" ")[2] === sum(paths);
  console.log(`${ok ? "ok  " : "FAIL"}  nvim-tree/files.txt lists its ${paths.length} files with their sum${ok ? "" : " (run tests/nvim-jay/tree-files.js)"}`);
  if (!ok) process.exitCode = 1;
}
// sending: pieces never split a character and stay under the limit
{
  const { bytes, pieces } = await import(pathToFileURL(join(here, "..", "..", "herdr-app", "mods", "nvim-jay", "send.js")));
  const s = "ab中文😀".repeat(50);
  const ps = pieces(s, 7);
  const ok = ps.join("") === s && ps.every((p) => bytes(p) <= 7 && bytes(p) === Buffer.byteLength(p)) && bytes(s) === Buffer.byteLength(s);
  console.log(`${ok ? "ok  " : "FAIL"}  pieces: under the limit, whole characters, nothing lost`);
  if (!ok) process.exitCode = 1;
}
if (process.platform === "win32") { console.log("skipped: the fake hc is a shell script (macOS / Linux only)"); process.exit(0); }
// the kit plugin (herdr-app/kit-plugins/nvim-jay) runs a hook file only if it is yours: its sh command (macOS, Linux),
// its PowerShell commandWindows (run with pwsh when there is one) and its omp module, with a fake nvim on PATH that
// says what it was given. Owned by another account can't be made without root: a folder outside the home stands in.
{
  const plugin = join(here, "..", "..", "herdr-app", "kit-plugins", "nvim-jay");
  const hook = JSON.parse(readFileSync(join(plugin, "hooks", "hooks.json"), "utf8")).hooks.Stop[0].hooks[0];
  const t = realpathSync(mkdtempSync(join(tmpdir(), "nvim-jay-plugin-")));
  const bin = join(t, "bin"); mkdirSync(bin);
  writeFileSync(join(bin, "nvim"), "#!/bin/sh\nprintf 'ran %s' \"$3\"\n", { mode: 0o755 });
  const pwsh = spawnSync("sh", ["-c", "command -v pwsh"], { encoding: "utf8" }).stdout.trim();
  let n = 0;
  // a fresh home with ~/.config/nvim-jay (0755) holding reply_hook.lua and omp_hook.js (0644); how() changes it
  const cases = {
    "yours (0644 in a 0755 folder)": [() => {}, true],
    "group-writable file (g+w)": [(d) => chmodSync(join(d, "reply_hook.lua"), 0o664), false],
    "world-writable file (o+w)": [(d) => chmodSync(join(d, "reply_hook.lua"), 0o646), false],
    "group-writable folder": [(d) => chmodSync(d, 0o775), false],
    "folder linked to one outside your home": [(d, h) => {
      const o = join(t, `other${n}`, "nvim-jay"); mkdirSync(o, { recursive: true, mode: 0o755 });
      for (const f of ["reply_hook.lua", "omp_hook.js"]) writeFileSync(join(o, f), readFileSync(join(d, f)), { mode: 0o644 });
      rmSync(d, { recursive: true }); symlinkSync(o, join(h, ".config", "nvim-jay"));
    }, false],
    "file linked to one outside your home": [(d) => {
      const o = join(t, `other${n}.lua`); writeFileSync(o, "", { mode: 0o644 });
      rmSync(join(d, "reply_hook.lua")); symlinkSync(o, join(d, "reply_hook.lua"));
    }, false],
  };
  for (const [name, [how, runs]] of Object.entries(cases)) {
    n++;
    const h = join(t, `home${n}`), d = join(h, ".config", "nvim-jay");
    mkdirSync(d, { recursive: true, mode: 0o755 }); chmodSync(d, 0o755);
    writeFileSync(join(d, "reply_hook.lua"), "", { mode: 0o644 }); chmodSync(join(d, "reply_hook.lua"), 0o644);
    writeFileSync(join(d, "omp_hook.js"), "export default (pi) => { pi.ran = true; };\n", { mode: 0o644 }); chmodSync(join(d, "omp_hook.js"), 0o644);
    how(d, h);
    const env = { HOME: h, PATH: `${bin}:/usr/bin:/bin` };
    const want = runs ? `ran ${join(d, "reply_hook.lua")}` : "";
    const r = spawnSync("sh", ["-c", hook.command], { env, input: "{}", encoding: "utf8" });
    let ok = r.status === 0 && r.stdout === want && r.stderr === "";
    let said = `sh: exit ${r.status} ${JSON.stringify(r.stdout + r.stderr)}`;
    const o = spawnSync(process.execPath, ["--input-type=module", "-e",
      `const pi = {}; await (await import(${JSON.stringify(pathToFileURL(join(plugin, "hooks", "pre", "nvim-jay.js")).href)})).default(pi); process.stdout.write(String(pi.ran === true));`],
      { env, encoding: "utf8" });
    ok = ok && o.status === 0 && o.stdout === String(runs);
    said += `; omp: ${JSON.stringify(o.stdout + o.stderr)}`;
    if (pwsh && !/writable/.test(name)) { // Windows has no group / world bits: the PowerShell check is links only
      const p = spawnSync(pwsh, ["-NoProfile", "-Command", hook.commandWindows], { env: { ...env, USERPROFILE: h }, input: "{}", encoding: "utf8" });
      ok = ok && p.status === 0 && p.stdout === want;
      said += `; pwsh: exit ${p.status} ${JSON.stringify(p.stdout + p.stderr)}`;
    }
    console.log(`${ok ? "ok  " : "FAIL"}  kit plugin: ${name} → ${runs ? "runs" : "skipped, exit 0"}${pwsh || /writable/.test(name) ? "" : " (no pwsh: PowerShell not run)"}${ok ? "" : `: ${said}`}`);
    if (!ok) process.exitCode = 1;
  }
  rmSync(t, { recursive: true, force: true });
}
const { NVIM_INIT } = await import(pathToFileURL(join(here, "..", "..", "herdr-app", "mods", "nvim-jay", "nvim.js")));
const nvim = spawnSync("sh", ["-c", "command -v nvim"], { encoding: "utf8" }).stdout.trim();
const git = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
if (!nvim || !git) { console.log("needs nvim and git on PATH"); process.exit(1); }

// /tmp, not the macOS temp folder: nvim-jay listens on $HOME/.cache/nvim-jay/sock/<pid>, and a socket path has at
// most 104 bytes
const root = realpathSync(mkdtempSync(join(existsSync("/tmp") ? "/tmp" : tmpdir(), "nvim-jay-test-")));
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
  // what a pane on a machine gets: ship.js's work (send.js) with exec as a local /bin/sh in this HOME, in small pieces
  // so long files take several arguments and several calls; nvim below starts from those files
  const { makeWhere } = await import(pathToFileURL(join(here, "..", "..", "herdr-app", "mods", "nvim-jay", "send.js")));
  const modDir = join(here, "..", "..", "herdr-app", "mods", "nvim-jay");
  let calls = 0;
  const where = makeWhere({
    exec: async (cmd, args) => { calls++; const x = spawnSync(cmd, args, { env: { HOME: home, PATH: "/usr/bin:/bin" }, encoding: "utf8" }); return { code: x.status, stdout: x.stdout, stderr: x.stderr }; },
    readTextFile: async (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } },
    modFile: (rel) => join(modDir, ...rel.split("/")),
    init: () => NVIM_INIT,
  }, { maxArg: 30000, maxCall: 120000 });
  const at = await where(null);
  const cache = join(home, ".cache", "nvim-jay");
  const { list } = await import(pathToFileURL(join(here, "tree-files.js")));
  const same = readFileSync(join(cache, at.init, "init.lua"), "utf8") === NVIM_INIT
    && list().every((p) => readFileSync(join(cache, at.tree, p), "utf8") === readFileSync(join(modDir, "nvim-tree", p), "utf8"));
  const first = calls;
  const again = await where(null);
  const ok = at.sent && same && first > 4 && !again.sent && calls === first + 1 && !readdirSync(cache).some((n) => n.includes(".part."));
  console.log(`${ok ? "ok  " : "FAIL"}  sent in ${first} calls: the Lua and the tree arrive whole; the next start sends nothing`);
  if (!ok) process.exitCode = 1;
  const nvimArgs = ["--cmd", "let g:loaded_netrw = 1 | let g:loaded_netrwPlugin = 1", "--cmd", `let g:nvim_jay_tree = '${join(cache, at.tree)}'`,
    "-c", `source ${join(cache, at.init, "init.lua")}`];
  const env = {
    HOME: home, HC_TERMINAL_ID: "t1", JN_TEST_ROOT: root, JN_FAKE: fake,
    PATH: [bin, dirname(nvim), dirname(git), "/usr/bin", "/bin"].join(":"),
    GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  };
  const r = spawnSync(nvim, ["--headless", "--clean", "-i", "NONE", "-n", ...nvimArgs, "-c", `luafile ${join(here, "test.lua")}`], { cwd: root, env, encoding: "utf8", timeout: 120000 });
  const out = (r.stdout || "") + (r.stderr || "");
  process.stdout.write(out.endsWith("\n") ? out : out + "\n");
  let result = "";
  try { result = readFileSync(join(root, "result"), "utf8"); } catch {}
  if (r.status !== 0 || result.trim() !== "pass") { console.log(`failed (exit ${r.status}${r.error ? ", " + r.error.message : ""})`); process.exitCode = 1; }

  // omp's hook module, as omp loads it (a stub pi): a bash call keeps a copy, an unanswered message blocks the stop once,
  // a sub-agent's stop never does
  {
    const hookFile = join(home, ".config", "nvim-jay", "omp_hook.js");
    const sess = join(root, "omp-hook-session.jsonl"), named = join(root, "omp-hook-file.txt");
    writeFileSync(named, "keep me\n");
    writeFileSync(sess, JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text: '<hc from="t4 ops">deploy?</hc>' }] } }) + "\n");
    const script = `
      const on = {};
      const { default: hook } = await import(${JSON.stringify(pathToFileURL(hookFile).href)});
      hook({ on: (n, f) => { on[n] = f; } });
      await on.tool_call({ toolName: "bash", toolCallId: "call_1|fc_1", input: { command: "rm ${named}" } }, {});
      const sub = await on.session_stop({ session_id: "s", session_file: ${JSON.stringify(sess)}, stop_hook_active: false }, { agent: { kind: "sub" } });
      const main = await on.session_stop({ session_id: "s", session_file: ${JSON.stringify(sess)}, stop_hook_active: false,
        last_assistant_message: { role: "assistant", content: [{ type: "text", text: "all done" }] } }, { agent: { kind: "main" } });
      const bad = await on.session_stop(null, null);
      console.log(JSON.stringify({ events: Object.keys(on).sort(), sub: sub ?? null, main: main ?? null, bad: bad ?? null }));`;
    const x = spawnSync(process.execPath, ["--input-type=module", "-e", script],
      { env: { ...env, HC_TERMINAL_ID: "t9" }, encoding: "utf8", timeout: 60000 });
    let got = {};
    try { got = JSON.parse(x.stdout.trim().split("\n").pop()); } catch {}
    const copy = join(home, ".cache", "nvim-jay", "snap", "call_1_fc_1");
    let said = null;
    try { said = JSON.parse(readFileSync(join(home, ".cache", "nvim-jay", "said", "t9"), "utf8")); } catch {}
    const ok = JSON.stringify(got.events) === JSON.stringify(["agent_end", "session_start", "session_stop", "tool_call"])
      && existsSync(copy) && readdirSync(copy).length === 1 && got.sub === null && got.bad === null
      && got.main?.decision === "block" && /t4 ops/.test(got.main.reason) && said?.text === "all done";
    console.log(`${ok ? "ok  " : "FAIL"}  omp hook module: bash keeps a copy, an unanswered message keeps the agent going once, a sub-agent's stop never`);
    if (!ok) { console.log(JSON.stringify({ got, said, stderr: x.stderr })); process.exitCode = 1; }
  }

  // review mode: a Gerrit change opened from the panel (g:nvim_jay_review = its review.json)
  const wt = join(root, "wt"), rdir = join(root, "rv");
  mkdirSync(rdir, { recursive: true });
  const g = (cmd) => { const x = spawnSync("sh", ["-c", cmd], { cwd: wt, env, encoding: "utf8" }); if (x.status !== 0) throw new Error(cmd + ": " + x.stderr); return x.stdout.trim(); };
  mkdirSync(wt, { recursive: true });
  g("git init -q && printf 'one\\ntwo\\nthree\\n' > a.txt && echo bye > gone.txt && echo same > old.txt && echo t > t_test.txt && git add . && git commit -qm base");
  const base = g("git rev-parse HEAD");
  g("printf 'one\\nTWO\\nthree\\n' > a.txt && printf 'n1\\nn2\\n' > n.txt && git rm -q gone.txt && git mv old.txt new.txt && echo t2 > t_test.txt && git add . && git commit -qm head");
  const head = g("git rev-parse HEAD");
  writeFileSync(join(rdir, "review.json"), JSON.stringify({ v: 1, change: 7, ps: 2, subject: "fix two", dir: wt, base, head,
    files: [{ path: "a.txt", status: "M", ins: 1, del: 1 }, { path: "n.txt", status: "A", ins: 2, del: 0 }, { path: "gone.txt", status: "D", ins: 0, del: 1 },
      { path: "new.txt", status: "R", old_path: "old.txt", ins: 0, del: 0 }, { path: "t_test.txt", status: "M", ins: 1, del: 1 }],
    comments: { "a.txt": [{ line: 2, author: "Alice", message: "why TWO?", unresolved: true }] } }));
  const r2 = spawnSync(nvim, ["--headless", "--clean", "-i", "NONE", "-n", "--cmd", `let g:nvim_jay_review = '${join(rdir, "review.json")}'`,
    ...nvimArgs, "-c", `luafile ${join(here, "review.lua")}`], { cwd: wt, env: { ...env, JN_REVIEW_DIR: wt }, encoding: "utf8", timeout: 120000 });
  const out2 = (r2.stdout || "") + (r2.stderr || "");
  process.stdout.write(out2.endsWith("\n") ? out2 : out2 + "\n");
  let result2 = "";
  try { result2 = readFileSync(join(root, "result-review"), "utf8"); } catch {}
  if (r2.status !== 0 || result2.trim() !== "pass") { console.log(`review failed (exit ${r2.status}${r2.error ? ", " + r2.error.message : ""})`); process.exitCode = 1; }
} finally {
  rmSync(root, { recursive: true, force: true });
}
