// Tests for herdr-app/mods/agent-files without Herdr: node tests/agent-files/run.js (macOS, Linux, Windows; Node 18+).
// The mod's imports (gpui-kit, gpui-base, herdr) are replaced by stubs; exec and hc are fakes that answer from a
// table and record every call. The two shell scripts the mod runs on the agent's machine (find the editor, reach
// nvim-jay) also run for real in /bin/sh (macOS / Linux).
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, realpathSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const MOD = join(here, "..", "..", "herdr-app", "mods", "agent-files");

// ---------- stubs ----------
const H = {};
const el = new Proxy(function () {}, {
  get(_t, k) {
    if (k === "then") return undefined;
    return (...args) => {
      if (String(k) === "when") { if (args[0]) args[1](el); return el; }
      if (String(k) === "child" && args[0] === undefined) throw new Error("child(value) expects an element or a string");
      if (String(k) === "child" && typeof args[0] === "string") H.strings.push(args[0]);
      if (String(k) === "on_key_down") H.keydown = args[0];
      return el;
    };
  },
  apply: () => el,
});
const inputState = () => { let v = ""; const on = {}; return { value: () => v, set_value: (x) => { v = x; }, focus() {}, on: (n, f) => { on[n] = f; }, fire: (n) => on[n]?.({}, cx), type(x) { v = x; on.change?.({}, cx); } }; };
globalThis.__stubs = {
  View: class {}, div: () => el, v_flex: () => el, h_flex: () => el,
  InputState: { new: (...a) => (H.input = inputState(...a)) }, Input: { new: () => el },
  theme: () => new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : "#334455") }),
  settings: () => ({ zoom: 1 }), window: () => H.window, home: () => H.home, appHome: () => `${H.home}/.config/herdr-app`,
  exec: async (cmd, args, opts) => {
    const c = { argv: [cmd, ...(args ?? [])], on: opts?.on ?? null };
    H.calls.push(c);
    const r = H.answer(c);
    if (r instanceof Error) throw r;
    return r;
  },
  hc: async (args) => {
    H.calls.push({ argv: ["hc", ...args], on: null });
    if (args[0] === "get") return { code: 0, stdout: JSON.stringify({ pid: 1, foreground: { pid: H.pids[args[1]] } }), stderr: "" };
    return { code: 0, stdout: "{}", stderr: "" };
  },
  run: (name, args) => { H.runs.push([name, args]); },
  props: () => ({ overlay: "o1" }), closeOverlay: (o) => { H.closed.push(o); H.calls.push({ argv: ["closeOverlay"], on: null }); }, notify: (n) => H.notes.push(n),
  readTextFile: async (p) => (p.endsWith("agent-files.json") ? H.config : null),
  agents: () => H.agents, panes: () => H.panes, spaces: () => H.spaces, terminals: () => H.terms, focused: () => H.focused,
};
const cx = { notify() {}, stop_propagation() {}, focus_handle: () => ({}), timer: { after() {} }, spawn: (f) => { H.tasks.push(Promise.resolve().then(() => f(cx))); } };
async function settle() {
  for (let i = 0; i < 30; i++) { const t = H.tasks.splice(0); await Promise.all(t); await new Promise((r) => setImmediate(r)); }
}

async function loadMod() {
  const dir = mkdtempSync(join(tmpdir(), "agent-files-test-"));
  let src = readFileSync(join(MOD, "main.js"), "utf8");
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*"(gpui-kit|gpui-base|herdr)";\s*$/gm, (_m, names) => `const {${names}} = globalThis.__stubs;`);
  assert.doesNotMatch(src, /from\s+"(gpui-kit|gpui-base|herdr)"/);
  writeFileSync(join(dir, "main.js"), src);
  const m = await import(pathToFileURL(join(dir, "main.js")).href);
  rmSync(dir, { recursive: true, force: true });
  return m.default;
}

// ---------- the world ----------
const MARK = "let g:nvim_jay = 1";
const FILES = { tool: "claude", log: "/h/.claude/projects/x/s.jsonl", dir: "/w/app", files: [
  { path: "/w/app/src/a.js", tag: "edit", exists: true },
  { path: "/w/app/README.md", tag: "read", exists: true },
  { path: "/w/app/gone.txt", tag: "write", exists: false },
  { path: "/etc/hosts", tag: "read", exists: true },
  { path: "/w/app/b.js", tag: "git", exists: true },
] };
function world({ machine = null, nvim = false, two = false, files = FILES, kit = "files", platform = "macos", config = null, nvimOk = true, editor = "/usr/bin/hx" } = {}) {
  const m = machine ? `${machine}/` : "";
  Object.assign(H, {
    window: { platform }, home: platform === "windows" ? "C:\\Users\\amy" : "/Users/amy", calls: [], runs: [], notes: [], closed: [], tasks: [], strings: [],
    config, pids: { [`${m}t1`]: 501, [`${m}t2`]: 502, [`${m}t9`]: 909 },
    spaces: [{ id: "sp1", machine }],
    agents: [{ address: `${m}t1`, pane: "p1", space: "sp1", tab: "tb1", seq: 5, app: "claude-code", program: { name: "Claude Code" } },
      ...(two ? [{ address: `${m}t2`, pane: "p2", space: "sp1", tab: "tb1", seq: 9, app: "codex", program: { name: "Codex" } }] : [])],
    panes: [{ pane: "p1", tab: "tb1", terminal: `${m}t1`, cwd: "/w/app" }, ...(two ? [{ pane: "p2", tab: "tb1", terminal: `${m}t2`, cwd: "/w/other" }] : []),
      ...(nvim ? [{ pane: "p9", tab: "tb1", terminal: `${m}t9`, cwd: "/w/app" }] : [])],
    terms: [{ address: `${m}t1`, argv: ["claude"] }, ...(nvim ? [{ address: `${m}t9`, argv: ["/bin/sh", "-c", "x", "nvim", "--cmd", MARK] }] : [])],
    focused: { space: "sp1", tab: "tb1", pane: "p1", terminal: `${m}t1`, agent: null, cwd: "/w/app" },
  });
  H.answer = (c) => {
    const a = c.argv;
    const kitArgs = a[0] === "sh" ? a.slice(4) : /kit(\.cmd)?$/.test(a[0]) ? a.slice(1) : null;
    if (kitArgs) {
      if (kit === "missing") return new Error("cannot run kit: No such file or directory");
      if (kitArgs[0] === "api") return { code: 0, stdout: kit === "old" ? "1.0\n" : "1.1\n", stderr: "" };
      if (kitArgs[0] === "files") return kit === "old" ? { code: 1, stdout: "", stderr: "kit: 沒有這個指令：files\n" } : { code: 0, stdout: JSON.stringify(typeof files === "function" ? files(kitArgs) : files) + "\n", stderr: "" };
    }
    if (a[0] === "/bin/sh" && a[3] === "sh" && /command -v "\$1"/.test(a[2])) return editor ? { code: 0, stdout: [editor, ...a.slice(4).slice(1)].join("\n") + "\n", stderr: "" } : { code: 127, stdout: "", stderr: "找不到編輯器 vi\n" };
    if ((a[0] === "/bin/sh" && /--remote-expr/.test(a[2])) || (a[0] === "nvim" && a[1] === "--server")) return nvimOk ? { code: 0, stdout: "ok", stderr: "" } : { code: 1, stdout: "", stderr: "E247: Failed to connect" };
    return { code: 0, stdout: "", stderr: "" };
  };
}
async function open(V) { const v = new V(); v.init({}, cx); await settle(); return v; }
function render(v) { H.strings = []; v.render(cx); return H.strings.join("\n"); }
const kitCalls = () => H.calls.filter((c) => c.argv[0] === "kit" || c.argv[0] === "sh" || /kit\.cmd$/.test(c.argv[0]));
const press = (v, key) => { render(v); H.keydown({ key, modifiers: {} }, cx); };

// ---------- tests ----------
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("asks kit files on this computer for the focused agent's process, tool and folder", async (V) => {
  world();
  const v = await open(V);
  const k = kitCalls();
  assert.deepEqual(k[0].argv, ["kit", "files", "--pid", "501", "--tool", "claude", "--dir", "/w/app", "--git", "--json"]);
  assert.equal(k[0].on, null);
  const text = render(v);
  for (const s of ["改", "src/a.js", "讀", "README.md", "gone.txt（已不在）", "/etc/hosts", "git", "b.js"]) assert.match(text, new RegExp(s.replace(/[()（）./]/g, "\\$&")), s);
});

test("an agent on another machine: kit runs there (sh, PATH or ~/.local/bin)", async (V) => {
  world({ machine: "box" });
  await open(V);
  const k = kitCalls()[0];
  assert.equal(k.on, "box");
  assert.deepEqual(k.argv.slice(0, 2), ["sh", "-c"]);
  assert.deepEqual(k.argv.slice(4), ["files", "--pid", "501", "--tool", "claude", "--dir", "/w/app", "--git", "--json"]);
});

test("typing filters; Enter opens the selected one", async (V) => {
  world();
  const v = await open(V);
  H.input.type("readme");
  assert.deepEqual(v.rows().map((r) => r.path), ["/w/app/README.md"]);
  H.input.fire("submit");
  await settle();
  assert.ok(H.runs.some(([n, a]) => n === "terminal.open" && a.argv.at(-1) === "/w/app/README.md"));
});

test("no nvim-jay pane: a new pane right of the agent with the editor found on that machine", async (V) => {
  world({ machine: "box" });
  const v = await open(V);
  press(v, "down");
  v.pick(v.rows()[v.at], cx);
  await settle();
  const res = H.calls.find((c) => c.argv[0] === "/bin/sh" && /command -v/.test(c.argv[2]));
  assert.equal(res.on, "box");
  assert.deepEqual(res.argv.slice(3), ["sh"]); // no editor set: the script picks $VISUAL / $EDITOR / vi
  const at = (f) => H.calls.findIndex(f);
  assert.ok(at((x) => /command -v/.test(x.argv[2] ?? "")) < at((x) => x.argv[0] === "closeOverlay"), "closed before the editor was found");
  assert.deepEqual(H.runs.slice(-2), [["pane.focus", { terminal: "box/t1" }],
    ["terminal.open", { argv: ["/usr/bin/hx", "/w/app/README.md"], folder: "/w/app", place: "right", name: "editor" }]]);
  assert.deepEqual(H.closed, ["o1"]);
});

test("an nvim-jay pane in the tab: the file goes to it through its server, and it gets the focus", async (V) => {
  world({ nvim: true, machine: "box" });
  const v = await open(V);
  v.pick(v.rows()[0], cx);
  await settle();
  const c = H.calls.find((x) => x.argv[0] === "/bin/sh" && /--remote-expr/.test(x.argv[2]));
  assert.equal(c.on, "box");
  assert.equal(c.argv[4], "909");
  const hex = c.argv[5].match(/^v:lua\.JN\.open_hex\('([0-9a-f]+)'\)$/)[1];
  assert.equal(Buffer.from(hex, "hex").toString("utf8"), "/w/app/src/a.js");
  // the popup closes only after nvim answered: Herdr drops a closed popup's unfinished work
  const at = (f) => H.calls.findIndex(f);
  assert.ok(at((x) => /--remote-expr/.test(x.argv[2] ?? "")) < at((x) => x.argv[0] === "closeOverlay"), "closed before nvim was asked");
  // non-ASCII, quotes, spaces: the UTF-8 bytes
  H.calls = [];
  v.pick({ path: "/w/資料 'x' \"y\" ~.md", tag: "read", exists: true }, cx);
  await settle();
  const hex2 = H.calls.find((x) => /--remote-expr/.test(x.argv[2] ?? "")).argv[5].match(/'([0-9a-f]+)'/)[1];
  assert.equal(Buffer.from(hex2, "hex").toString("utf8"), "/w/資料 'x' \"y\" ~.md");
  assert.deepEqual(H.runs, [["pane.focus", { pane: "p9" }], ["pane.focus", { pane: "p9" }]]);
});

test("an nvim-jay pane that doesn't answer (opened before the update): a note, then the editor pane", async (V) => {
  world({ nvim: true, nvimOk: false });
  const v = await open(V);
  v.pick(v.rows()[0], cx);
  await settle();
  assert.match(H.notes[0].title, /nvim-jay 沒接到/);
  assert.equal(H.runs.at(-1)[0], "terminal.open");
});

test("agent-files.json: editor and gui (a window app, no pane); nvim_jay false skips the nvim pane", async (V) => {
  world({ nvim: true, config: JSON.stringify({ editor: ["code", "-g"], gui: true, nvim_jay: false }), editor: "/usr/local/bin/code" });
  const v = await open(V);
  v.pick(v.rows()[0], cx);
  await settle();
  assert.ok(!H.calls.some((c) => /--remote-expr/.test(c.argv[2] ?? "")));
  const res = H.calls.find((c) => c.argv[0] === "/bin/sh" && /command -v/.test(c.argv[2]));
  assert.deepEqual(res.argv.slice(3), ["sh", "code", "-g"]);
  assert.deepEqual(H.calls.at(-2).argv, ["/usr/local/bin/code", "-g", "/w/app/src/a.js"]);
  assert.deepEqual(H.calls.at(-1).argv, ["closeOverlay"]);
  assert.ok(!H.runs.some(([n]) => n === "terminal.open"));
});

test("a broken agent-files.json: a warning, the defaults", async (V) => {
  world({ config: "{ nope" });
  const v = await open(V);
  v.pick(v.rows()[0], cx);
  await settle();
  assert.match(H.notes[0].title, /agent-files\.json/);
  assert.equal(H.runs.at(-1)[0], "terminal.open");
});

test("Windows, this computer: kit.cmd; nvim-jay through its named pipe; editor nvim by default", async (V) => {
  world({ platform: "windows", nvim: true });
  let v = await open(V);
  assert.equal(kitCalls()[0].argv[0], "kit.cmd");
  v.pick(v.rows()[0], cx);
  await settle();
  const c = H.calls.find((x) => x.argv[0] === "nvim");
  assert.deepEqual(c.argv.slice(1, 3), ["--server", "\\\\.\\pipe\\nvim-jay-909"]);
  world({ platform: "windows" });
  v = await open(V);
  v.pick(v.rows()[0], cx);
  await settle();
  assert.deepEqual(H.runs.at(-1)[1].argv, ["nvim", "/w/app/src/a.js"]);
});

test("two agents in the tab: the focused one first, Tab moves to the next", async (V) => {
  world({ two: true, files: (a) => ({ ...FILES, files: [{ path: `/w/${a[2]}.txt`, tag: "edit", exists: true }] }) });
  const v = await open(V);
  assert.equal(v.rows()[0].path, "/w/501.txt");
  assert.match(render(v), /Tab 換下一個，共 2 個/);
  press(v, "tab");
  await settle();
  assert.deepEqual(kitCalls().at(-1).argv.slice(0, 6), ["kit", "files", "--pid", "502", "--tool", "codex"]);
  assert.equal(v.rows()[0].path, "/w/502.txt");
});

test("kit without kit files: says kit 0.4.0; with an nvim-jay pane, nvim-jay's own list instead", async (V) => {
  world({ kit: "old" });
  let v = await open(V);
  assert.match(render(v), /kit 0\.4\.0/);
  assert.deepEqual(H.closed, []);
  world({ kit: "old", nvim: true });
  v = await open(V);
  assert.deepEqual(H.closed, ["o1"]);
  assert.deepEqual(H.runs, [["pane.focus", { pane: "p9" }]]);
  assert.ok(H.calls.some((c) => c.argv.join(" ") === "hc keys t9 alt+o"));
  assert.match(H.notes[0].title, /nvim-jay 的清單/);
});

test("no kit at all, no agent in the tab", async (V) => {
  world({ kit: "missing" });
  let v = await open(V);
  assert.match(render(v), /找不到 kit/);
  world();
  H.agents = [];
  v = await open(V);
  assert.match(render(v), /這個分頁沒有 agent/);
});

test("Esc closes; ↑/↓ wrap", async (V) => {
  world();
  const v = await open(V);
  press(v, "up");
  assert.equal(v.at, FILES.files.length - 1);
  press(v, "down");
  assert.equal(v.at, 0);
  press(v, "escape");
  assert.deepEqual(H.closed, ["o1"]);
});

// the scripts themselves, in a real /bin/sh with a temp HOME
test("the scripts run on the agent's machine: find the editor; reach nvim-jay's server", async (V) => {
  if (process.platform === "win32") return "skipped on Windows";
  world({ nvim: true });
  const v = await open(V);
  v.pick(v.rows()[0], cx);
  await settle();
  const client = H.calls.find((x) => /--remote-expr/.test(x.argv[2] ?? "")).argv[2];
  world({ config: JSON.stringify({ editor: ["fake-ed", "--wait"] }) });
  const v2 = await open(V);
  v2.pick(v2.rows()[0], cx);
  await settle();
  const resolve = H.calls.find((x) => /command -v/.test(x.argv[2] ?? "")).argv[2];
  const root = realpathSync(mkdtempSync(join(tmpdir(), "agent-files-sh-")));
  try {
    const bin = join(root, "bin"), home = join(root, "home");
    mkdirSync(bin); mkdirSync(join(home, ".local", "bin"), { recursive: true });
    for (const n of ["fake-ed", "vi-ish"]) { writeFileSync(join(bin, n), "#!/bin/sh\n"); chmodSync(join(bin, n), 0o755); }
    // a fake nvim in ~/.local/bin that prints what it was given
    writeFileSync(join(home, ".local", "bin", "nvim"), '#!/bin/sh\nprintf "%s|" "$@"\n'); chmodSync(join(home, ".local", "bin", "nvim"), 0o755);
    const env = { PATH: `${bin}:/usr/bin:/bin`, HOME: home };
    const sh = (script, args, extra = {}) => spawnSync("/bin/sh", ["-c", script, "sh", ...args], { env: { ...env, ...extra }, encoding: "utf8" });
    let r = sh(resolve, ["fake-ed", "--wait"]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.stdout.split("\n").slice(0, -1), [join(bin, "fake-ed"), "--wait"]);
    r = sh(resolve, [], { EDITOR: "vi-ish -x" });
    assert.deepEqual(r.stdout.split("\n").slice(0, -1), [join(bin, "vi-ish"), "-x"]);
    r = sh(resolve, [], { VISUAL: "fake-ed", EDITOR: "vi-ish" });
    assert.deepEqual(r.stdout.split("\n").slice(0, -1), [join(bin, "fake-ed")]);
    r = sh(resolve, ["no-such-editor"]);
    assert.equal(r.status, 127);
    assert.match(r.stderr, /找不到編輯器 no-such-editor/);
    r = sh(client, ["909", "v:lua.JN.open_hex('2f61')"]);
    assert.equal(r.stdout, `--server|${home}/.cache/nvim-jay/sock/909|--remote-expr|v:lua.JN.open_hex('2f61')|`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------- run ----------
const V = await loadMod();
let fails = 0;
for (const [name, fn] of tests) {
  try {
    const r = await fn(V);
    console.log(`ok    ${name}${typeof r === "string" ? ` (${r})` : ""}`);
  } catch (e) {
    fails++;
    console.log(`FAIL  ${name}\n      ${String(e?.stack ?? e).split("\n").slice(0, 4).join("\n      ")}`);
  }
}
console.log(`${tests.length} tests, ${fails} failed`);
process.exitCode = fails ? 1 : 0;
