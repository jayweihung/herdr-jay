// Tests for herdr-app/mods/kit without Herdr: node tests/kit/run.js (macOS, Linux, Windows; Node 18+).
// The mod's imports (gpui-kit, gpui-base, herdr) are replaced by stubs, and exec by a fake that answers kit's
// commands from a table and records every call. At the end a real kit is asked kit api: the one in KIT if set
// (KIT=~/src/agentkit/unix/kit node tests/kit/run.js), else the one on PATH (skipped, with the reason, when there is none).
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const MODS = join(ROOT, "herdr-app", "mods");
const MOD = join(MODS, "kit");

// ---------- stubs for gpui-kit / gpui-base / herdr ----------
const mem = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) } });
const H = (globalThis.__H = {
  store: {}, props: {}, layout: { id: "root", children: [] }, window: { platform: "macos" }, home: "/Users/amy",
  calls: [], answer: () => ({ code: 0, stdout: "", stderr: "" }), overlays: [], runs: [], notes: [], timeouts: [],
  texts: [], strings: [], panes: [], spaces: [], tasks: [], clicks: {}, lastId: null,
});
const COLOR_METHODS = /(^bg$|color|^border_color$|^text_color$)/;
const el = new Proxy(function () {}, {
  get(_t, k) {
    if (k === "then") return undefined;
    return (...args) => {
      if (COLOR_METHODS.test(String(k))) for (const a of args) if (a == null) throw new Error(`${String(k)}(${a}): not a color value`);
      if (String(k) === "when") { if (args[0]) args[1](el); return el; }
      if (String(k) === "child" && args[0] === undefined) throw new Error("child(value) expects an element or a string");
      if (String(k) === "child" && typeof args[0] === "string") H.strings.push(args[0]);
      if (String(k) === "on_mouse_down" && typeof args[1] !== "function") throw new Error("on_mouse_down(button, handler) expects a handler");
      if (String(k) === "id") { H.lastId = args[0]; H.ids?.push(args[0]); }
      if (String(k) === "on_click") H.clicks[H.lastId] = args[0];   // to press a button by its id
      return el;
    };
  },
  apply: () => el,
});
const inputState = () => { let v = ""; return { value: () => v, set_value: (x) => { v = x; }, focus() {}, on() {}, release() {} }; };
const unescape = (md) => md.replace(/\\\n/g, "\n").replace(/\\(.)/g, "$1").replace(/\u00a0/g, " ");
globalThis.__stubs = {
  View: class {}, div: () => el, svg: () => el, image: () => el, v_flex: () => el, h_flex: () => el,
  InputState: { new: inputState }, Input: { new: () => el }, Editor: { new: () => el }, EditorState: { new: inputState },
  TextView: { markdown: (id, md) => { H.texts.push(unescape(md)); return { selectable: () => el }; } },
  theme: () => new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : "#334455") }),
  settings: () => ({}), window: () => H.window, home: () => H.home,
  exec: async (cmd, args, opts) => {
    H.calls.push({ argv: [cmd, ...(args ?? [])], on: opts?.on ?? null });
    H.timeouts.push(opts?.timeout);
    const r = H.answer([cmd, ...(args ?? [])], opts?.on ?? null);
    if (r instanceof Error) throw r;
    return r;
  },
  hc: async (args) => { H.calls.push({ argv: ["hc", ...args], on: null }); return { code: 0, stdout: JSON.stringify({ pid: 4242 }), stderr: "" }; },
  run: (name, args) => { H.runs.push([name, args]); }, layout: () => H.layout,
  shared: (k) => H.store[k], setShared: (k, v) => { H.store[k] = v; return null; }, props: () => H.props,
  readTextFile: async () => "", writeTextFile: async () => {}, appHome: () => "/Users/amy/.config/herdr-app",
  openOverlay: (o) => { H.overlays.push(o); return "o1"; }, closeOverlay: () => {}, notify: (n) => H.notes.push(n),
  panes: () => H.panes, spaces: () => H.spaces, agents: () => [], focused: () => null,
};

// Load the mod (every .js in its folder, side by side in a temp folder) with its imports swapped for the stubs.
async function loadMod() {
  const dir = mkdtempSync(join(tmpdir(), "kit-mod-test-"));
  for (const f of readdirSync(MOD).filter((f) => f.endsWith(".js"))) {
    let src = readFileSync(join(MOD, f), "utf8");
    src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*"(gpui-kit|gpui-base|herdr)";\s*$/gm, (_m, names) =>
      `const {${names.replace(/\s+as\s+/g, ": ")}} = globalThis.__stubs;`);
    assert.doesNotMatch(src, /from\s+"(gpui-kit|gpui-base|herdr)"/, `${f}: an import the test can't swap (keep them on one line each)`);
    writeFileSync(join(dir, f), src);
  }
  const at = (f) => import(pathToFileURL(join(dir, f)).href);
  const m = { main: await at("main.js"), common: await at("common.js"), layout: await at("layout.js"), context: await at("context.js") };
  rmSync(dir, { recursive: true, force: true });
  return m;
}

// ---------- helpers ----------
const timers = [];
// the clock, moved forward by a test (kit api's answers grow old)
const realNow = Date.now;
let skew = 0;
Date.now = () => realNow() + skew;
const cx = {
  notify() {}, stop_propagation() {}, write_to_clipboard() {},
  spawn: (f) => { const p = Promise.resolve().then(() => f(cx)); H.tasks.push(p); return p; },
  timer: { every: (_ms, f) => timers.push(f) },
};
async function settle() { for (let i = 0; i < 20 && H.tasks.length; i++) { const t = H.tasks.splice(0); await Promise.all(t); } }
function fresh() {
  H.store = {}; H.calls = []; H.runs = []; H.overlays = []; H.notes = []; H.texts = []; H.strings = []; H.tasks = []; H.timeouts = [];
  H.props = {}; H.layout = { id: "root", children: [] }; H.window = { platform: "macos" }; H.panes = []; H.spaces = [];
  timers.length = 0; skew = 0;
}
// a fake kit: argv after the program -> answer; api: what kit api prints (null: an older kit, "kit: 沒有這個指令：api");
// missing: no kit anywhere (exec can't start one: on PATH or in kit's install folder)
function fakeKit({ api = "1.0", missing = false, list = { items: [], sources: [] }, agents = { agents: [] } } = {}) {
  H.answer = (argv) => {
    if (missing && /(^|[\/\\])kit(\.cmd)?$/.test(argv[0])) return new Error(`cannot run ${argv[0]}: No such file or directory`);
    const a = argv[0] === "sh" ? argv.slice(4) : argv.slice(1);
    if (a[0] === "api") return api == null ? { code: 1, stdout: "", stderr: "kit: 沒有這個指令：api（打 kit help）\n" } : { code: 0, stdout: `${api}\n`, stderr: "" };
    if (a[0] === "list") return { code: 0, stdout: JSON.stringify(list), stderr: "" };
    if (a[0] === "agents") return { code: 0, stdout: JSON.stringify(agents), stderr: "" };
    if (a[0] === "context") return { code: 0, stdout: JSON.stringify({ tool: "claude", used: 1000, window: 200000, pct: 1 }), stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
}
const kitCalls = (sub) => H.calls.filter((c) => /kit(\.cmd)?$/.test(c.argv[0]) || c.argv[0] === "sh").filter((c) => (c.argv[0] === "sh" ? c.argv[4] : c.argv[1]) === sub);
function view(M, props) {
  H.props = props;
  const v = new M.main.default();
  v.init(props, cx);
  return v;
}
function render(v) { H.texts = []; H.strings = []; H.clicks = {}; H.ids = []; v.render(cx); return [...H.texts, ...H.strings].join("\n"); }
const ids = (v) => { render(v); return H.ids; };
const tick = async () => { for (const f of [...timers]) f(cx); await settle(); };

// ---------- tests ----------
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// the context window's buttons and words (context.js, run as it is)
const CMDS = {
  claude: { compact: "/compact", with_text: true, clear: "/clear" },
  codex: { compact: "/compact", with_text: false, clear: "/new" },
  omp: { compact: "/compact", with_text: true, clear: "/new" },
};
test("context window: what is typed in for each tool (Claude /compact <keep>, /clear; Codex /compact alone, /new; omp /compact <keep>, /new)", ({ context: X }) => {
  const C = CMDS.claude;
  assert.deepEqual([X.sendText(C, "compact", "  keep the\n plan "), X.sendText(C, "compact", ""), X.sendText(C, "clear")], ["/compact keep the plan", "/compact", "/clear"]);
  assert.deepEqual([X.sendText(CMDS.codex, "compact", "keep it"), X.sendText(CMDS.codex, "clear")], ["/compact", "/new"]);
  assert.deepEqual([X.sendText(CMDS.omp, "compact", "keep it"), X.sendText(CMDS.omp, "clear")], ["/compact keep it", "/new"]);
  assert.equal(X.sendText(C, "other"), null); assert.equal(X.sendText({}, "clear"), null); assert.equal(X.sendText(null, "compact"), null);
});
test("context window: sent only while the agent waits (idle: --if idle; done), never while it works or needs you", ({ context: X }) => {
  assert.deepEqual(X.sendArgs("t7", "idle", "/clear"), ["send", "--if", "idle", "t7", "/clear"]);
  assert.deepEqual(X.sendArgs("m1/t7", "done", "/compact x"), ["send", "m1/t7", "/compact x"]);
  for (const a of [["t7", "working", "/clear"], ["t7", "blocked", "/clear"], ["t7", null, "/clear"], ["", "idle", "/clear"], ["t7", "idle", null]])
    assert.equal(X.sendArgs(...a), null, JSON.stringify(a));
});
test("context window: kit context's arguments, the tool from what the agent reports", ({ context: X }) => {
  assert.deepEqual(X.ctxArgs(42, "claude", "/x y", true, true), ["context", "--pid", "42", "--tool", "claude", "--dir", "/x y", "--detail", "--fresh"]);
  assert.deepEqual(X.ctxArgs(42, null, "", false, true), ["context", "--pid", "42"]);
  assert.equal(X.toolOf("pi", "x"), "omp"); assert.equal(X.toolOf(null, "claude"), "claude"); assert.equal(X.toolOf("claude-code"), "claude");
  assert.equal(X.toolOf("Codex"), "codex"); assert.equal(X.toolOf("bash", "shell"), null);
});
test("context window: 拿掉 only what kit manages (folder: kit rm --dir; home: the account; required never)", ({ context: X }) => {
  const items = [{ kind: "skill", name: "a", status: "used" }, { kind: "rule", name: "sec", status: "required", path: "C:\\s\\rules\\sec.md" },
    { kind: "rule", name: "style", status: "used", path: "/s/rules/style.md" }, { kind: "mcp", name: "gerrit", status: "used" }, { kind: "skill", name: "b", status: "unused" }];
  const home = { items, here: { folder: { dir: "/h", why: "家目錄就是整個帳號", items: [] } } };
  const inDir = { items, here: { folder: { dir: "/p", why: "", items: ["skill:a", "skill:b"] } } };
  assert.deepEqual(X.removal(home, "skills", "a").args, ["rm", "skill", "a"]);
  assert.deepEqual(X.removal(home, "mcp", "mcp__gerrit").args, ["rm", "mcp", "gerrit"]);
  assert.deepEqual(X.removal(home, "memory", "~/s/rules/style.md", "/s/rules/style.md").args, ["rm", "rule", "style"]);
  assert.equal(X.removal(home, "memory", "x", "C:/s/rules/sec.md").required, true);
  assert.equal(X.removal(home, "skills", "b"), null); assert.equal(X.removal(home, "msgs", "a"), null);
  assert.deepEqual(X.removal(inDir, "skills", "a").args, ["rm", "--dir", "/p", "skill", "a"]);
  assert.deepEqual(X.removal(inDir, "skills", "b").args, ["rm", "--dir", "/p", "skill", "b"]);
  assert.equal(X.removal(inDir, "mcp", "gerrit"), null);
  assert.equal(X.removal({ ...home, here: { user: "root" } }, "skills", "a"), null); assert.equal(X.removal({ error: "x" }, "skills", "a"), null);
});
test("context window: 怎麼省 only from the numbers; the 複製 summary", ({ context: X }) => {
  const full = { tool: "claude", used: 330000, window: 400000, compact_at: 367000, commands: CMDS.claude, categories: [{ id: "mcp_tools", tokens: 30000 }, { id: "skills", tokens: 800 }],
    groups: [{ id: "tool_results", items: [{ name: "Read", tokens: 90000 }, { name: "Bash", tokens: 1000 }] }, { id: "mcp", items: [{ name: "gerrit", tokens: 25000 }, { name: "other", tokens: 5000 }] },
      { id: "memory", items: [{ name: "~/.claude/CLAUDE.md", tokens: 2500 }] }] };
  const tips = X.ctxTips(full, (g, n) => g === "mcp" && n === "gerrit");
  assert.equal(tips.length, 4);
  assert.ok(tips[0].startsWith("快滿了（到 367k 會自動壓縮）"), tips[0]);
  assert.ok(tips[1].includes("「Read」的呼叫和結果約 90.0k（27%）"), tips[1]);
  assert.ok(tips[2].includes("用不到的（gerrit）可以在下面「MCP」拿掉"), tips[2]);
  assert.ok(tips[3].startsWith("~/.claude/CLAUDE.md 有 2.5k"), tips[3]);
  assert.equal(X.ctxTips({ ...full, used: 20000, compact_at: 0, categories: [], groups: [] }).length, 0);
  assert.equal(X.ctxTips(null).length, 0);
  const d = { tool: "claude", used: 130000, window: 400000, pct: 33, model: "claude-opus-5-5", exact: true, compact_at: 367000, commands: CMDS.claude,
    categories: [{ id: "system_tools", name: "系統工具（延後載入）", kind: "deferred", tokens: 13000 }, { id: "other", name: "其他／自上次更新以來", kind: "used", tokens: 15000 }],
    groups: [{ id: "mcp", name: "MCP", tokens: 2500, items: [{ name: "gerrit", tokens: 2500, note: "2 個工具" }] }] };
  const sum = X.summaryText(d, "Claude Code", "這台電腦 · ~/x").split("\n");
  assert.equal(sum[0], "Claude Code 的 context · 這台電腦 · ~/x");
  assert.equal(sum[1], "已使用 33% · 130,000 / 400,000 tokens · claude-opus-5-5");
  for (const l of ["  系統工具（延後載入）：用到才載入（13,000）", "  其他／自上次更新以來：15,000（3.8%）", "  gerrit：2,500（2 個工具）"]) assert.ok(sum.includes(l), l);
  assert.equal(sum.at(-1), "距自動壓縮還有 237,000");
});
test("context window: the bar, the shares, the footer line, the chip's numbers (context.js, from plain values)", ({ context: X, common: C }) => {
  const d = { used: 150000, window: 200000, compact_at: 167000, categories: [
    { id: "system_prompt", kind: "used", tokens: 20000 }, { id: "messages", kind: "used", tokens: 130000 }, { id: "tiny", kind: "used", tokens: 50 },
    { id: "system_tools", kind: "deferred", tokens: 9000 }, { id: "free", kind: "free", tokens: 17000 }, { id: "buffer", kind: "buffer", tokens: 33000 }] };
  assert.deepEqual(X.barSegments(d), { used: [{ id: "system_prompt", pct: 10 }, { id: "messages", pct: 65 }], buffer: 16.5 });
  // never past 100 % in all
  const over = X.barSegments({ used: 300, window: 100, categories: [{ id: "a", kind: "used", tokens: 80 }, { id: "b", kind: "used", tokens: 80 }, { kind: "buffer", tokens: 50 }] });
  assert.deepEqual(over, { used: [{ id: "a", pct: 80 }, { id: "b", pct: 20 }], buffer: null });
  assert.equal(X.catShare({ kind: "used", tokens: 20000 }, 200000), "10.0%");
  assert.equal(X.catShare({ kind: "deferred", tokens: 9000 }, 200000), "—"); assert.equal(X.catShare({ kind: "used", tokens: 1 }, 0), "—");
  assert.deepEqual(X.compactLine(d), { left: 17000, line: "距自動壓縮還有 17.0k（到 167k 會自動壓縮）" });
  assert.deepEqual(X.compactLine({ used: 10000, window: 400000 }), { left: 390000, line: "還有 390k 可用" });
  assert.deepEqual(X.compactLine({ used: 10 }), { left: null, line: "" });
  assert.deepEqual(X.chipNumbers({ pct: 35, used: 139000, window: 400000 }), { has: true, pct: 35, nums: "139k/400k", copy: "35% 139000 / 400000" });
  assert.equal(X.chipNumbers({ pct: 120, used: 1500000, window: 1000000 }).nums, "1.5M/1M");
  assert.equal(X.chipNumbers({ pct: 120 }).pct, 100);
  assert.equal(X.chipNumbers(null).nums, "…"); assert.equal(X.chipNumbers({ busy: true }).nums, "…"); assert.equal(X.chipNumbers({}).nums, "—");
  assert.deepEqual([X.level(null), X.level(69), X.level(70), X.level(90)], ["", "", "high", "full"]);
  assert.equal(X.howCounted({ exact: true, tool: "claude" }), "Claude Code 自己算的"); assert.equal(X.howCounted({ tool: "codex" }), "總數是 Codex 記的，細項估算");
  assert.equal(X.ago(1000, 1030000), "30 秒前"); assert.equal(X.ago(1000, 1000000 + 180000), "3 分鐘前");
  assert.equal(X.catColorKey("skills"), "ansi5"); assert.equal(X.catColorKey("whatever"), "dim");
  // one place for the number formats
  assert.deepEqual([C.num(1234567), C.kfmt(13500), C.kfmt(139000), C.kfmt(1250000), C.kShort(13500), C.kShort(1000000)], ["1,234,567", "13.5k", "139k", "1.25M", "14k", "1M"]);
});

// roles
test("roles: each part by props.role, the older names too; no role: a header on a pane, else the repository; a misspelled one: a card", async (M) => {
  const { main } = M;
  for (const r of ["repo", "repo-toggle", "agent", "editor", "agents", "agents-toggle", "header", "context"]) assert.equal(main.roleOf({ role: r }), r);
  assert.deepEqual(["panel", "toggle", "pane"].map((r) => main.roleOf({ role: r })), ["repo", "repo-toggle", "agent"]);
  assert.equal(main.roleOf({ pane: "p1", terminal: "t1" }), "header");
  assert.equal(main.roleOf({ role: "header", pane: "p1", terminal: "t1" }), "header");
  assert.equal(main.roleOf({}), "repo"); assert.equal(main.roleOf(null), "repo"); assert.equal(main.roleOf({ role: "" }), "repo");
  for (const r of ["toString", "nope", "Repo", 7]) assert.equal(main.roleOf({ role: r }), "unknown", String(r));
  fresh(); fakeKit();
  const v = view(M, { role: "agnets" }); render(v); await settle();
  assert.match(render(v), /不認得的 role「agnets」/);
  assert.equal(H.calls.length, 0, "a card, nothing run");
});

// kit api
test("kit api: 1.x is ok (a plain 1 is 1.0); 2.x: update herdr-jay's kit mod; failing, 0.x or not a number: kit self-update; no kit: install it; no answer: wait", ({ common: C }) => {
  assert.deepEqual(C.KIT_API, { major: 1, minor: 0 });
  for (const out of ["1\n", "1.0\n", "1.3", " 1.12 "]) assert.equal(C.readApi({ code: 0, out }).ok, true, out);
  assert.equal(C.readApi({ code: 0, out: "1" }).api, "1.0");
  for (const out of ["2\n", "2.0", "10.1"]) {
    const newer = C.readApi({ code: 0, out });
    assert.equal(newer.kind, "newer", out); assert.match(newer.text, /herdr-jay/); assert.match(newer.text, /herdr-app\/mods\/kit/); assert.match(newer.text, /只認得 1\.x/);
  }
  assert.match(C.readApi({ code: 0, out: "2" }).text, /kit api 是 2\.0/);
  for (const r of [{ code: 1, out: "", err: "kit: 沒有這個指令：api（打 kit help）" }, { code: 0, out: "0" }, { code: 0, out: "0.9" }, { code: 0, out: "abc" },
    { code: 0, out: "" }, { code: 0, out: "1.0.1" }, { code: 0, out: "v1" }, { code: 3, out: "1.0" }]) {
    const a = C.readApi(r);
    assert.equal(a.kind, "old", JSON.stringify(r)); assert.match(a.text, /kit self-update/); assert.match(a.title, /kit 太舊/); assert.match(a.text, /kit 0\.3\.0 以上/);
  }
  assert.match(C.readApi({ code: 0, out: "0.9" }).text, /kit api 是 0\.9，這個 mod 要 1\.0 以上/);
  const slow = C.readApi({ code: -1, out: "", err: "kit 沒在 40 秒內回應", timedOut: true });
  assert.equal(slow.kind, "timeout"); assert.match(slow.title, /沒回應/); assert.match(slow.text, /40 秒/); assert.doesNotMatch(slow.text, /裝好 kit/);
  const none = C.readApi({ code: -1, out: "", err: "找不到 kit：這台電腦的 PATH 上沒有 kit", missing: true });
  assert.equal(none.kind, "missing"); assert.match(none.title, /找不到 kit/); assert.match(none.text, /PATH/);
  const away = C.readApi({ code: -1, out: "", err: "連不到 box，或那台沒裝 kit", missing: true }, "box");
  assert.match(away.title, /box/); assert.match(away.text, /在 box/);
  assert.match(C.readApi({ code: 1, out: "" }, "box").text, /在 box 的終端機/);
});
test("running kit: kit from PATH here (kit.cmd on Windows), else kit's install folder; another machine: sh (PATH, ~/.local/bin), then kit.cmd", async ({ common: C }) => {
  fresh(); fakeKit();
  await C.kit(["api"]);
  assert.deepEqual(H.calls[0], { argv: ["kit", "api"], on: null });
  H.window = { platform: "windows" }; H.calls = [];
  await C.kit(["api"]);
  assert.deepEqual(H.calls[0].argv, ["kit.cmd", "api"]);
  H.window = { platform: "macos" }; H.calls = [];
  await C.kit(["list", "--json"], 1000, "box");
  assert.equal(H.calls[0].argv[0], "sh"); assert.equal(H.calls[0].on, "box"); assert.deepEqual(H.calls[0].argv.slice(4), ["list", "--json"]);
  H.answer = (argv) => (argv[0] === "sh" ? { code: 127, stdout: "", stderr: "sh: kit: not found" } : { code: 0, stdout: "1\n", stderr: "" });
  H.calls = [];
  const r = await C.kit(["api"], 1000, "winbox");
  assert.deepEqual(H.calls.map((c) => c.argv[0]), ["sh", "kit.cmd"]); assert.equal(r.out, "1\n");
  fakeKit({ missing: true }); H.calls = [];
  const m = await C.kit(["api"]);
  assert.equal(m.missing, true); assert.match(m.err, /PATH 上沒有 kit/);
  assert.deepEqual(H.calls.map((c) => c.argv[0]), ["kit", "/Users/amy/.local/bin/kit"]);
  H.window = { platform: "windows" }; H.home = "C:\\Users\\amy"; H.calls = [];
  await C.kit(["api"]);
  assert.deepEqual(H.calls.map((c) => c.argv[0]), ["kit.cmd", "C:\\Users\\amy\\AppData\\Local\\Programs\\agentkit\\kit.cmd"]);
  H.window = { platform: "macos" }; H.home = "/Users/amy";
});
test("running kit, when it fails: only a kit that can't start is missing; kit's own exit codes are kit's; a timeout is said apart", async ({ common: C }) => {
  fresh();
  // not on PATH (a Linux desktop launcher): ~/.local/bin/kit
  H.answer = (argv) => (argv[0] === "kit" ? new Error("cannot run kit: No such file or directory (os error 2)") : { code: 0, stdout: "1.0\n", stderr: "" });
  let r = await C.kit(["api"]);
  assert.equal(r.out, "1.0\n"); assert.deepEqual(H.calls.map((c) => c.argv[0]), ["kit", "/Users/amy/.local/bin/kit"]);
  // here, a kit that ran and said 127 (or 9009) is kit's answer, not "no kit"
  for (const code of [127, 9009, 2]) {
    H.calls = []; H.answer = () => ({ code, stdout: "", stderr: "kit: 出錯了" });
    r = await C.kit(["list", "--json"]);
    assert.equal(r.code, code); assert.ok(!r.missing, String(code)); assert.equal(H.calls.length, 1, "no second way");
  }
  // another machine: kit.cmd that cmd can't find (9009) is missing; one that ran and failed is kit's answer
  H.calls = []; H.answer = (argv) => (argv[0] === "sh" ? new Error("cannot start sh") : { code: 9009, stdout: "", stderr: "'kit.cmd' is not recognized" });
  r = await C.kit(["api"], 1000, "winbox");
  assert.equal(r.missing, true); assert.match(r.err, /winbox/); assert.deepEqual(H.calls.map((c) => c.argv[0]), ["sh", "kit.cmd"]);
  H.answer = (argv) => (argv[0] === "sh" ? new Error("cannot start sh") : { code: 1, stdout: "", stderr: "kit: 不行" });
  r = await C.kit(["api"], 1000, "winbox");
  assert.equal(r.code, 1); assert.ok(!r.missing);
  // the machine can't be reached: missing, with why
  H.answer = () => new Error("machine box is not connected");
  r = await C.kit(["api"], 1000, "box");
  assert.equal(r.missing, true); assert.match(r.err, /連不到 box/); assert.match(r.err, /not connected/);
  // too slow: not "no kit", no second way, its own words
  for (const machine of [null, "box"]) {
    H.calls = []; H.answer = () => new Error(`kit took longer than 40 s${machine ? ` on ${machine}` : ""} and was stopped`);
    r = await C.kit(["api"], 40000, machine);
    assert.equal(r.timedOut, true); assert.ok(!r.missing); assert.match(r.err, /kit 沒在 40 秒內回應/); assert.equal(H.calls.length, 1);
    assert.equal(C.readApi(r, machine).kind, "timeout");
  }
});
test("kit api: the first ask waits 40 s (a slow virus scan), later ones 15 s; an answer is asked again once it is old", async (M) => {
  fresh(); fakeKit();
  const v = view(M, { role: "repo" }); await settle();
  assert.equal(kitCalls("api").length, 1); assert.equal(H.timeouts[0], 40000);
  await tick();
  assert.equal(kitCalls("api").length, 1, "a fresh answer is reused");
  // five minutes later the answer is old: asked again, with the shorter wait
  skew += 300001;
  await tick();
  assert.equal(kitCalls("api").length, 2);
  assert.equal(H.timeouts[H.calls.indexOf(kitCalls("api")[1])], 15000);
  // a bad answer is asked again sooner (30 s)
  fakeKit({ api: null });
  skew += 300001;
  await tick();
  assert.equal(M.common.apiState(null).kind, "old");
  fakeKit();
  skew += 20000;
  await tick();
  assert.equal(M.common.apiState(null).kind, "old", "within 30 s: not asked again");
  skew += 10001;
  await tick();
  assert.equal(M.common.apiState(null).ok, true);
  render(v);
});
test("no config.json, no kit herdr-panel: nothing in the mod reads one or tells you to run it", () => {
  for (const f of readdirSync(MOD).filter((f) => !/^jsconfig\.json$|\.d\.ts$/.test(f))) {   // not what herdr-app check writes
    const s = readFileSync(join(MOD, f), "utf8");
    assert.doesNotMatch(s, /herdr-panel/, f); assert.doesNotMatch(s, /config\.json/, f); assert.doesNotMatch(s, /\/usr\/bin\/env/, f);
  }
});

test("repository: kit api first; an older kit: the panel says kit self-update and runs nothing else; ⟳ asks again", async (M) => {
  fresh(); fakeKit({ api: null });
  const v = view(M, {});
  await settle();
  assert.equal(kitCalls("api").length, 1);
  await tick(); await tick();
  assert.equal(kitCalls("list").length, 0, "no kit list while kit is too old");
  const shown = render(v);
  assert.match(shown, /kit 太舊/); assert.match(shown, /kit self-update/);
  // updated: the ⟳ in the card asks kit api again, then the panel loads
  fakeKit();
  H.clicks["api-again-repo"]({}, cx); await settle();
  assert.equal(M.common.apiState(null).ok, true);
  await tick();
  assert.equal(kitCalls("list").length, 1);
  assert.doesNotMatch(render(v), /kit 太舊/);
});
test("repository: no kit on PATH: 找不到 kit, how to get it; a newer kit api: update herdr-jay's kit mod", async (M) => {
  fresh(); fakeKit({ missing: true });
  let v = view(M, {}); await settle();
  let shown = render(v);
  assert.match(shown, /找不到 kit/); assert.match(shown, /PATH/);
  fresh(); fakeKit({ api: "2.0" });
  v = view(M, { role: "panel" }); await settle(); await tick();
  shown = render(v);
  assert.match(shown, /Herdr 的 kit mod 太舊/); assert.match(shown, /herdr-jay/);
  assert.equal(kitCalls("list").length, 0);
});
test("one kit api for many copies starting together; both tab-bar buttons show ! while kit can't be used", async (M) => {
  fresh(); fakeKit({ api: null });
  view(M, {}); view(M, { role: "agents" }); view(M, { role: "repo" });
  await settle();
  assert.equal(kitCalls("api").length, 1);
  for (const role of ["repo-toggle", "toggle", "agents-toggle"]) assert.match(render(view(M, { role })), /^!$/m, role);
  fresh(); fakeKit();
  view(M, {}); await settle();
  for (const role of ["repo-toggle", "agents-toggle"]) assert.doesNotMatch(render(view(M, { role })), /^!$/m, role);
});
test("agents: kit api first; ok: kit agents --json; too old: the card, no kit agents", async (M) => {
  fresh(); fakeKit({ agents: { agents: [{ name: "reviewer", rules: [], skills: ["a"], mcp: [], source: "team", path: "/s/agents/reviewer.md" }] } });
  let v = view(M, { role: "agents" }); await settle(); await tick();
  assert.equal(kitCalls("agents").length, 1);
  assert.match(render(v), /reviewer/);
  fresh(); fakeKit({ api: null });
  v = view(M, { role: "agents" }); await settle(); await tick();
  assert.equal(kitCalls("agents").length, 0);
  assert.match(render(v), /kit self-update/);
});
test("agents toggle: shows / hides the Agents panel; without one in the layout, opens the Agents window (mod kit, role agents)", async (M) => {
  fresh(); fakeKit();
  const v = view(M, { role: "agents-toggle" });
  render(v);
  H.clicks["toggle-kit-agents"]({}, cx);
  assert.equal(H.overlays.length, 1);
  assert.equal(H.overlays[0].mod, "kit"); assert.deepEqual(H.overlays[0].props, { role: "agents" }); assert.equal(H.overlays[0].kind, "window");
  H.layout = { id: "root", children: [{ id: "kit-agents-panel", type: "column", hidden: true, children: [] }] };
  render(v);
  H.clicks["toggle-kit-agents"]({}, cx);
  assert.deepEqual(H.runs.at(-1), ["layout.toggle", { id: "kit-agents-panel" }]);
  await settle();
  assert.equal(H.calls.length, 0, "the button never runs kit");
});
test("header: an agent pane asks kit api, then kit list --dir --pid and kit context; too old: 'kit 太舊' on the button, nothing else asked", async (M) => {
  fresh(); fakeKit({ list: { items: [{ kind: "skill", name: "a", status: "used" }], here: { items: [] } } });
  H.spaces = [{ id: "s1", tabs: [{ id: "tab1" }] }];
  H.panes = [{ pane: "p1", terminal: "t1", tab: "tab1", cwd: "/Users/amy/x", status: "idle", program: { agent: true, name: "Claude Code", key: "claude" }, app: "claude-code" }];
  let v = view(M, { role: "header", pane: "p1", terminal: "t1" }); await settle(); await tick();
  const list = kitCalls("list")[0];
  assert.ok(list, "kit list asked");
  assert.deepEqual(list.argv.slice(1), ["list", "--json", "--dir", "/Users/amy/x", "--pid", "4242"]);
  assert.equal(kitCalls("context").length, 1);
  assert.match(render(v), /skill/);
  fresh(); fakeKit({ api: null });
  H.spaces = [{ id: "s1", tabs: [{ id: "tab1" }] }];
  H.panes = [{ pane: "p1", terminal: "t1", tab: "tab1", cwd: "/x", status: "idle", program: { agent: true, name: "Claude Code" } }];
  v = view(M, { pane: "p1", terminal: "t1" }); await settle(); await tick();
  assert.equal(kitCalls("list").length + kitCalls("context").length, 0);
  assert.match(render(v), /kit 太舊/);
});
test("header: a pane on another machine asks that machine's kit api", async (M) => {
  fresh(); fakeKit({ api: null });
  H.spaces = [{ id: "s2", machine: "box", tabs: [{ id: "tab2" }] }];
  H.panes = [{ pane: "p2", terminal: "box/t3", tab: "tab2", cwd: "/home/amy", status: "idle", program: { agent: true, name: "Codex" } }];
  const v = view(M, { role: "header", pane: "p2", terminal: "box/t3" }); await settle();
  const api = kitCalls("api")[0];
  assert.equal(api.on, "box");
  assert.equal(M.common.apiState("box").kind, "old");
  assert.equal(M.common.apiState(null), null, "this computer not asked");
  assert.match(render(v), /kit 太舊/);
});
test("header: the Kit button opens the agent popup and the context chip the context popup, both mod kit; its ids are kit-head-*", async (M) => {
  fresh(); fakeKit();
  H.spaces = [{ id: "s1", tabs: [{ id: "tab1" }] }];
  H.panes = [{ pane: "p1", terminal: "t1", tab: "tab1", cwd: "/x", status: "idle", program: { agent: true, name: "Claude Code" }, app: "claude-code" }];
  const v = view(M, { role: "header", pane: "p1", terminal: "t1" }); await settle(); await tick();
  v.part.openContext(H.panes[0]);
  assert.equal(H.overlays[0].mod, "kit"); assert.equal(H.overlays[0].props.role, "context");
  render(v);
  H.clicks["kit-btn-p1"]({}, cx);
  assert.equal(H.overlays[1].mod, "kit"); assert.equal(H.overlays[1].props.role, "agent"); assert.equal(H.overlays[1].props.target.key, "|/x|t1");
  for (const id of ["kit-head-p1", "kit-head-r-p1", "kit-head-d-p1", "kit-head-z-p1", "kit-head-x-p1"]) assert.ok(ids(v).includes(id), id);
  for (const src of readdirSync(MOD).filter((f) => f.endsWith(".js"))) {
    const s = readFileSync(join(MOD, src), "utf8");
    assert.doesNotMatch(s, /kit-pane-head|kph-|kitag/, src);
    for (const m of s.matchAll(/openOverlay\(\{ mod: "([^"]+)"/g)) assert.equal(m[1], "kit", `${src}: openOverlay of ${m[1]}`);
    for (const m of s.matchAll(/role: "([a-z-]+)"/g)) assert.notEqual(M.main.roleOf({ role: m[1] }), "unknown", `${src}: role ${m[1]}`);
  }
});
test("agent popup (and its old name pane): shows what the header's kit list said; kit there too old: the card, nothing run", async (M) => {
  fresh(); fakeKit();
  const target = { key: "|/x|t1", term: "t1", machine: null, cwd: "/x", title: "Claude Code" };
  H.store["kit.agent.data.v1"] = { [target.key]: { items: [{ kind: "skill", name: "pdf", status: "used" }], here: { items: [] } } };
  H.store["kit.agent.v1"] = { [target.key]: { started: Date.now(), at: Date.now() } };
  for (const role of ["agent", "pane"]) {
    const v = view(M, { role, target }); await settle();
    assert.match(render(v), /pdf/, role);
  }
  fresh(); fakeKit({ api: null });
  const v = view(M, { role: "agent", target: { ...target, machine: "box" } }); await settle();
  assert.match(render(v), /kit 太舊/); assert.match(render(v), /在 box 的終端機/);
  assert.equal(kitCalls("list").length, 0);
});
test("context popup: kit context --detail only once kit api says ok there; too old: the card, no --detail; ⟳ asks kit api again", async (M) => {
  fresh(); fakeKit({ api: null });
  H.panes = [{ pane: "p1", terminal: "t1", tab: "tab1", cwd: "/x", status: "idle", program: { agent: true, name: "Claude Code" }, app: "claude-code" }];
  const target = { key: "|/x|t1", pane: "p1", term: "t1", machine: null, cwd: "/x", tool: "claude", title: "Claude Code" };
  const v = view(M, { role: "context", target }); await settle(); await tick();
  assert.equal(kitCalls("context").length, 0, "no --detail while kit is too old");
  assert.match(render(v), /kit 太舊/);
  fakeKit();
  H.clicks["ctx-reload"]({}, cx); await settle();
  assert.equal(M.common.apiState(null).ok, true);
  await tick();
  const c = kitCalls("context");
  assert.equal(c.length, 1); assert.ok(c[0].argv.includes("--detail"));
});

// placing the panel in a layout of your own (放進上排)
const userLayout = (paneHeader = { content: { mod: "pane" } }) => ({ id: "root", type: "column", children: [
  { id: "bar", type: "row", children: [{ id: "tabs", type: "block", content: { mod: "tabs" }, size: { weight: 1 } }], size: { px: 42 } },
  { id: "body", type: "row", children: [{ id: "main", type: "block", content: { tab: "active", pane: { header: paneHeader } } },
    { id: "old-agents", type: "column", children: [{ id: "x", type: "block", content: { mod: "kit-agents" } }] }] }] });
test("放進上排: Agents and Kit buttons after the tab bar (Mac) or before it (window buttons in the bar); kit's pane headers; old mods gone", ({ layout: panel }) => {
  let t = panel.placed(userLayout(), false);
  const bar = t.children[0], body = t.children[1];
  assert.deepEqual(bar.children.map((c) => c.id), ["tabs", "kit-agents-toggle", "kit-toggle"]);
  assert.deepEqual(bar.children.slice(1).map((c) => c.content), [{ mod: "kit", props: { role: "agents-toggle" } }, { mod: "kit", props: { role: "repo-toggle" } }]);
  assert.deepEqual(body.children.map((c) => c.id), ["main", "kit-panel", "kit-agents-panel"]);
  assert.deepEqual(body.children[2].children[0].content, { mod: "kit", props: { role: "agents" } });
  assert.equal(body.children[2].hidden, true);
  assert.deepEqual(body.children[0].content.pane.header.content, { mod: "kit", props: { role: "header" } });
  assert.doesNotMatch(JSON.stringify(t), /kit-pane"|"kit-agents"\}/);
  t = panel.placed(userLayout({ content: { mod: "kit-pane" } }), true);
  assert.deepEqual(t.children[0].children.map((c) => c.id), ["kit-agents-toggle", "kit-toggle", "tabs"]);
  assert.deepEqual(t.children[1].children[0].content.pane.header.content, { mod: "kit", props: { role: "header" } });
  // a tab bar in a column (Herdr's own layouts): a row around it, its size kept
  const col = { id: "root", type: "column", children: [{ id: "status", type: "block", content: { mod: "status" } },
    { id: "tabs", type: "block", content: { mod: "tabs" }, size: { px: 42 } }, { id: "main", type: "block", content: { tab: "active" } }] };
  t = panel.placed(col, false);
  const row = t.children[1];
  assert.equal(row.id, "kit-tabs-row"); assert.deepEqual(row.size, { px: 42 });
  assert.deepEqual(row.children.map((c) => c.id), ["tabs", "kit-agents-toggle", "kit-toggle"]);
  // placed again: not twice
  const again = panel.placed(t, false);
  assert.equal(JSON.stringify(again).split('"kit-toggle"').length - 1, 1);
  assert.equal(panel.placed({ id: "root", children: [] }), null);
  assert.equal(panel.layoutNeeds(t), null, "placed: nothing more to do");
});
test("更新版面: a layout with Kit's button but an older kit's kit-pane / kit-agents (or Herdr's pane header) says so; the button puts it right", async (M) => {
  const { layoutNeeds, placed } = M.layout;
  assert.equal(layoutNeeds(userLayout()), "missing");
  const current = placed(userLayout(), false);
  assert.equal(layoutNeeds(current), null);
  // Kit's button there, and an older kit's pieces beside it
  const old = JSON.parse(JSON.stringify(current));
  old.children[1].children[0].content.pane.header.content = { mod: "kit-pane" };
  old.children[1].children.push({ id: "old-agents", type: "column", children: [{ id: "x", type: "block", content: { mod: "kit-agents" } }] });
  assert.equal(layoutNeeds(old), "old");
  const herdrs = JSON.parse(JSON.stringify(current));
  herdrs.children[1].children[0].content.pane.header.content = { mod: "pane" };
  assert.equal(layoutNeeds(herdrs), "old");
  const agentsOnly = JSON.parse(JSON.stringify(current));
  agentsOnly.children[0].children[1].content = { mod: "kit-agents", props: { role: "toggle" } };
  assert.equal(layoutNeeds(agentsOnly), "old");
  // the repository panel: 更新版面, and pressing it sets the layout placed() makes
  fresh(); fakeKit(); H.layout = old; H.window = { platform: "macos" };
  H.store.layout = "mine";
  const v = view(M, { role: "repo" }); await settle(); await tick();
  const shown = render(v);
  assert.match(shown, /更新版面/); assert.doesNotMatch(shown, /放進上排/);
  H.clicks.move({}, cx); await settle();
  const set = H.runs.find(([name]) => name === "layout.set");
  assert.ok(set, "layout.set");
  assert.equal(layoutNeeds(set[1].layout), null);
  assert.doesNotMatch(JSON.stringify(set[1].layout), /"mod":"kit-pane"|"mod":"kit-agents"|"old-agents"/);
  // not in the bar yet: 放進上排
  H.layout = userLayout();
  assert.match(render(v), /放進上排/);
});

// the files around the mod
test("layouts: jay.json and jay-win.json are JSON, use mod kit with its roles; buttons right of the tabs (Mac), left (Windows)", () => {
  for (const [f, order] of [["jay.json", ["tabs", "kit-agents-toggle", "kit-toggle", "gerrit-toggle"]], ["jay-win.json", ["kit-agents-toggle", "kit-toggle", "gerrit-toggle", "tabs"]]]) {
    const text = readFileSync(join(ROOT, "herdr-app", "layouts", f), "utf8");
    const l = JSON.parse(text);
    assert.doesNotMatch(text, /"mod": "kit-(agents|pane|panel)"/, f);
    const nodes = [];
    const walk = (n) => { if (n && typeof n === "object") { if (n.id) nodes.push(n); Object.values(n).forEach(walk); } };
    walk(l);
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    assert.deepEqual(byId["kit-agents-toggle"].content, { mod: "kit", props: { role: "agents-toggle" } }, f);
    assert.deepEqual(byId["kit-toggle"].content, { mod: "kit", props: { role: "repo-toggle" } }, f);
    assert.deepEqual(byId.kit.content, { mod: "kit" }, f);
    assert.deepEqual(byId["kit-agents"].content, { mod: "kit", props: { role: "agents" } }, f);
    assert.deepEqual(byId.main.content.pane.header.content, { mod: "kit", props: { role: "header" } }, f);
    assert.deepEqual(byId["tabs-row"].children.map((c) => c.id), order, f);
  }
});
test("every mod has a mod.json (JSON) and a main.js; no .ts or jsconfig.json is tracked", () => {
  for (const m of readdirSync(MODS)) {
    const json = JSON.parse(readFileSync(join(MODS, m, "mod.json"), "utf8"));
    assert.ok(json.place, `${m}: place`);
    assert.ok(existsSync(join(MODS, m, "main.js")), `${m}: main.js`);
  }
  const git = spawnSync("git", ["-C", ROOT, "ls-files", "herdr-app"], { encoding: "utf8" });
  if (git.status === 0) assert.doesNotMatch(git.stdout, /\.ts$|jsconfig\.json$/m);
});

// ---------- the real kit (KIT, else the one on PATH) ----------
async function realKit(M) {
  const win = process.platform === "win32";
  let exe = process.env.KIT ? process.env.KIT.replace(/^~(?=$|[\/\\])/, homedir()) : "";
  if (exe && !existsSync(exe)) throw new Error(`KIT=${process.env.KIT}: no such file`);
  if (!exe) {
    const which = win ? spawnSync("where", ["kit.cmd"], { encoding: "utf8" }) : spawnSync("sh", ["-c", "command -v kit"], { encoding: "utf8" });
    if (which.status !== 0 || !which.stdout.trim()) return "skipped: no kit on PATH (install kit, or KIT=<path to kit> node tests/kit/run.js)";
    exe = which.stdout.trim().split(/\r?\n/)[0];
  }
  // the mod's own runner, with exec running that kit for real
  fresh();
  H.window = { platform: win ? "windows" : "macos" };
  H.answer = (argv) => {
    const cmd = /^kit(\.cmd)?$/.test(argv[0]) ? exe : argv[0];
    const r = spawnSync(cmd, argv.slice(1), { encoding: "utf8", timeout: 40000, shell: win });
    return r.error ? r.error : { code: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  const r = await M.common.kit(["api"]);
  const direct = spawnSync(exe, ["api"], { encoding: "utf8", shell: win });
  const a = M.common.readApi(r);
  assert.equal(r.code, direct.status); assert.equal(r.out, direct.stdout);
  const m = direct.status === 0 ? direct.stdout.trim().match(/^(\d+)(?:\.(\d+))?$/) : null;
  const want = !m ? "old" : Number(m[1]) > 1 ? "newer" : Number(m[1]) === 1 ? "ok" : "old";
  assert.equal(a.kind, want);
  return `ok    real kit (${process.env.KIT ? `KIT=${process.env.KIT}` : exe}): kit api -> ${JSON.stringify(direct.stdout.trim() || direct.stderr.trim())}, the mod says: ${a.ok ? "ok" : a.title}`;
}

// ---------- run ----------
const M = await loadMod();
let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(M); console.log(`ok    ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${String(e.stack ?? e).split("\n").slice(0, 14).join("\n      ")}`); }
}
let skipped = 0;
try { const said = await realKit(M); if (said.startsWith("skipped")) skipped++; console.log(said); }
catch (e) { fail++; console.log(`FAIL  real kit\n      ${String(e.stack ?? e).split("\n").slice(0, 8).join("\n      ")}`); }
console.log(`\n${tests.length + 1 - fail - skipped} ok, ${fail} failed${skipped ? `, ${skipped} skipped` : ""}`);
process.exit(fail ? 1 : 0);
