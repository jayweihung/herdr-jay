// Tests for herdr-app/mods/kit without Herdr: node tests/kit/run.js (macOS, Linux, Windows; Node 18+).
// The mod's imports (gpui-kit, gpui-base, herdr) are replaced by stubs, and exec by a fake that answers kit's
// commands from a table and records every call. At the end a real kit is asked kit api: the one in KIT if set
// (KIT=~/src/agentkit/unix/kit node tests/kit/run.js), else the one on PATH (skipped, with the reason, when there is none).
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, mkdirSync, rmSync, existsSync, realpathSync } from "node:fs";
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
  texts: [], strings: [], panes: [], spaces: [], tasks: [], clicks: {}, lastId: null, files: null, writes: [],
  machines: [], hcAnswer: null, reads: [], clipboard: [], drags: [], afters: [], writeFail: null,
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
      if (String(k) === "on_drag") H.drags.push([H.lastId, ...args]);   // a newer Herdr: what the element carries when dragged
      return el;
    };
  },
  apply: () => el,
});
const inputState = () => { let v = ""; return { value: () => v, set_value: (x) => { v = x; }, focus() {}, on() {}, release() {} }; };
const unescape = (md) => md.replace(/\\\n/g, "\n").replace(/\\(.)/g, "$1").replace(/\u00a0/g, " ");
// a path: every builder call chains, build() gives a token; window.paint_path (a global, as in Herdr) records it
const pathOps = [];
const pathB = () => { const ops = []; const b = new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : (...a) => { ops.push([k, ...a]); return k === "build" ? { ops } : b; }) }); return b; };
globalThis.window = { paint_path: (p, color) => { if (color == null) throw new Error("paint_path: no color"); pathOps.push(p.ops); return el; } };
globalThis.__stubs = {
  PathBuilder: { fill: () => pathB(), stroke: (w) => { const b = pathB(); b.width(w); return b; } },
  View: class {}, div: () => el, svg: () => el, image: () => el, v_flex: () => el, h_flex: () => el,
  InputState: { new: inputState }, Input: { new: () => el }, Editor: { new: () => el }, EditorState: { new: inputState },
  TextareaState: { new: inputState }, Textarea: { new: () => el },
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
  hc: async (args) => {
    H.calls.push({ argv: ["hc", ...args], on: null });
    const r = H.hcAnswer?.(args);
    if (r instanceof Error) throw r;
    return r ?? { code: 0, stdout: JSON.stringify({ pid: 4242 }), stderr: "" };
  },
  run: (name, args) => { H.runs.push([name, args]); const e = H.runFail?.(name, args); if (e) throw e; return H.runAnswer?.(name, args); }, layout: () => H.layout,
  shared: (k) => H.store[k], setShared: (k, v) => { H.store[k] = v; return null; }, props: () => H.props,
  // files: path -> text a test gives (others read as ""); writes: every [path, text, expected] written
  // (another machine's files are "<machine>:<path>" in H.files; with H.files, a file not in it is absent: null).
  // With H.files, as Herdr: a write whose expected isn't what is there is refused, and the text is stored as UTF-8
  // (a lone surrogate comes back as U+FFFD); H.writeFail(path, text): refuse this one
  readTextFile: async (p, o) => { H.reads.push([p, o?.on ?? null]); const k = o?.on ? `${o.on}:${p}` : p; return H.files ? (k in H.files ? H.files[k] : null) : ""; },
  writeTextFile: async (p, text, expected) => {
    H.writes.push([p, text, expected]);
    if (H.writeFail?.(p, text)) throw new Error("Permission denied (os error 13)");
    if (!H.files) return null;
    if ((p in H.files ? H.files[p] : null) !== expected) throw new Error("The file changed outside Herdr. Reload before saving; your draft is still here.");
    H.files[p] = text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
    return null;
  },
  appHome: () => H.appHome ?? "/Users/amy/.config/herdr-app",
  openOverlay: (o) => { H.overlays.push(o); return "o1"; }, closeOverlay: () => {}, notify: (n) => H.notes.push(n),
  panes: () => H.panes, spaces: () => H.spaces, machines: () => H.machines, agents: () => H.agents ?? [], terminals: () => H.terminals ?? [], focused: () => null,
};

// Load the mod (every .js in its folder, side by side in a temp folder) with its imports swapped for the stubs.
async function loadMod() {
  const dir = mkdtempSync(join(tmpdir(), "kit-mod-test-"));
  for (const f of readdirSync(MOD).filter((f) => f.endsWith(".js"))) {
    let src = readFileSync(join(MOD, f), "utf8");
    src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*"(gpui-kit|gpui-base|herdr)";\s*$/gm, (_m, names) =>
      `const {${names.replace(/\s+as\s+/g, ": ")}} = globalThis.__stubs;`);
    // import * as host from "herdr": the stubs object itself (a test adds nextDrop to it for a newer Herdr)
    src = src.replace(/^import\s*\*\s*as\s+(\w+)\s+from\s*"(gpui-kit|gpui-base|herdr)";\s*$/gm, (_m, name) => `const ${name} = globalThis.__stubs;`);
    assert.doesNotMatch(src, /from\s+"(gpui-kit|gpui-base|herdr)"/, `${f}: an import the test can't swap (keep them on one line each)`);
    writeFileSync(join(dir, f), src);
  }
  const at = (f) => import(pathToFileURL(join(dir, f)).href);
  const m = { main: await at("main.js"), common: await at("common.js"), layout: await at("layout.js"), context: await at("context.js"), bots: await at("bots.js"),
    machines: await at("machines.js"), place: await at("place.js"), repo: await at("repo.js"), graph: await at("graph.js"),
    events: await at("events.js"), timeline: await at("timeline.js"), said: await at("said.js") };
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
  notify() {}, stop_propagation() {}, write_to_clipboard(text) { H.clipboard.push(text); },
  spawn: (f) => { const p = Promise.resolve().then(() => f(cx)); H.tasks.push(p); return p; },
  timer: { every: (_ms, f) => timers.push(f), after: (_ms, f) => H.afters.push(f) },   // H.afters: run by a test
  new: (_Class, props) => ({ props, set_props(p) { this.props = p; }, release() { return true; } }),
};
async function settle() { for (let i = 0; i < 20 && H.tasks.length; i++) { const t = H.tasks.splice(0); await Promise.all(t); } }
// an agent's tab icon SVG (the logo cropped tight), under Herdr's folder (the one its name picks: these test agents'
// files name none)
function logoPath(M, name) {
  const b = M.bots.pickBot(name);
  return `data/kit/bots/v${M.bots.BOT_VERSION}/${b.animal}${b.color ? `-${b.color}` : ""}.icon.svg`;
}
function fresh() {
  H.store = {}; H.calls = []; H.runs = []; H.overlays = []; H.notes = []; H.texts = []; H.strings = []; H.tasks = []; H.timeouts = []; H.files = null; H.writes = []; H.runFail = null; H.runAnswer = null; H.agents = null; H.terminals = null;
  H.props = {}; H.layout = { id: "root", children: [] }; H.window = { platform: "macos" }; H.panes = []; H.spaces = [];
  H.machines = []; H.hcAnswer = null; H.reads = []; H.clipboard = []; H.appHome = null; H.drags = []; H.afters = []; H.writeFail = null;
  delete globalThis.__stubs.nextDrop;   // an older Herdr: no drag API
  timers.length = 0; skew = 0;
}
// a fake kit, answering as kit 0.3.0 does (kit's README, "給程式讀的介面"): argv after the program -> answer.
// api: what kit api prints (null: an older kit, "kit: 沒有這個指令：api"); missing: no kit anywhere (exec can't start
// one: on PATH or in kit's install folder); list / agents: their JSON, or kitError(code, message); push(args): an answer
const kitError = (code, message) => ({ code: 1, stdout: `${JSON.stringify({ error: { code, message } })}\n`, stderr: `kit：${message}\n` });
const KIT_LIST = { kit: "0.3.0", sources: [], tools: ["claude"], items: [], kit_version_wanted: "" };
function fakeKit({ api = "1.0", missing = false, list = KIT_LIST, agents = { kit: "0.3.0", tools: ["claude"], available: {}, agents: [] }, push = null } = {}) {
  const answer = (x) => (x && typeof x.code === "number" && "stdout" in x ? x : { code: 0, stdout: `${JSON.stringify(x)}\n`, stderr: "" });
  H.answer = (argv) => {
    if (missing && /(^|[\/\\])kit(\.cmd)?$/.test(argv[0])) return new Error(`cannot run ${argv[0]}: No such file or directory`);
    const a = argv[0] === "sh" ? argv.slice(4) : argv.slice(1);
    if (a[0] === "api") return api == null ? { code: 1, stdout: "", stderr: "kit: 沒有這個指令：api（打 kit help）\n" } : { code: 0, stdout: `${api}\n`, stderr: "" };
    if (a[0] === "list") return answer(list);
    if (a[0] === "agents") return answer(agents);
    if (a[0] === "push" && push) return push(a);
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
  // kit note (kit api 1.4): the header's line, tooltip, copy, dim after two hours
  assert.deepEqual(X.noteArgs(4321), ["note", "--pid", "4321", "--json"]);
  assert.equal(X.noteView(null), null); assert.equal(X.noteView({ text: null }), null); assert.equal(X.noteView({ text: "  " }), null);
  const nv = X.noteView({ text: "改好 parser；下一步跑測試\n目標：修 #12", at: 1000 }, 1000000 + 90000);
  assert.deepEqual(nv, { line: "改好 parser；下一步跑測試", tip: "改好 parser；下一步跑測試\n目標：修 #12\n（1 分鐘前寫的；右鍵複製）", copy: "改好 parser；下一步跑測試\n目標：修 #12", old: false });
  assert.equal(X.noteView({ text: "x", at: 1000 }, 1000000 + 7200000).old, true);
  assert.match(X.noteView({ text: "x", at: 1000 }, 1000000 + 3 * 86400000).tip, /3 天前寫的/);
  // the header gives the note room first (seen: "Claude Code ~/proj [進度 …8 字] [Kit 規則 54 skill 3 MCP 1] [context …]")
  const kw = X.kitChipW({ counts: [["規則", 54], ["skill", 3], ["MCP", 1]] }), long = "herdr-jay 拉到最新；下一步重開 Herdr 看標題列的進度欄位顯示";
  const fit = (w, o = {}) => X.headerFit(w, { name: "Claude Code", dir: "~/proj", note: long, kitW: kw, ctx: true, ...o });
  assert.ok(kw > 120 && kw < 200, `Kit chip ${kw}`);
  assert.deepEqual(fit(0), { dir: true, nameMax: 260, kit: "full", ctx: "full", noteW: null }, "not measured yet: all shown");
  assert.deepEqual(fit(700, { note: "" }), { dir: true, nameMax: 260, kit: "full", ctx: "full", noteW: null }, "no note: the folder takes the room");
  const wide = fit(1600); assert.ok(wide.dir && wide.kit === "full" && wide.ctx === "full" && wide.noteW >= 360, "wide: all of it");
  const mid = fit(940); assert.ok(!mid.dir && mid.noteW >= 360, `mid: the folder goes first ${JSON.stringify(mid)}`);
  const narrow = fit(760); assert.ok(!narrow.dir && narrow.ctx === "short" && narrow.kit === "short" && narrow.noteW > 300, `narrow ${JSON.stringify(narrow)}`);
  const tiny = fit(500); assert.equal(tiny.nameMax, 120); assert.ok(tiny.noteW >= 0);
  const short = fit(760, { note: "跑測試" }); assert.ok(short.dir && short.kit === "full" && short.ctx === "full", "a short note needs no room taken");
  for (let w = 300; w <= 1800; w += 20) { const f = fit(w), g = fit(w + 20); assert.ok(g.noteW >= f.noteW || g.noteW >= 360, `wider never less note room at ${w}`); }
  assert.equal(X.textW("ab", 10), 12); assert.equal(X.textW("中文", 10), 20);
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
  for (const e of readdirSync(MOD, { withFileTypes: true }).filter((e) => e.isFile() && !/^jsconfig\.json$|\.d\.ts$/.test(e.name))) {   // not what herdr-app check writes
    const f = e.name, s = readFileSync(join(MOD, f), "utf8");
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
// the 關係 tab (graph.js): agents running now and who talks to whom
const AGS = [
  { address: "t1", space: "s1", space_name: "web", tab_name: "前端", app: "claude-code", status: "working", program: { key: "claude" } },
  { address: "t2", space: "s1", space_name: "web", tab_name: "review", app: "omp", status: "idle", program: { key: "omp" } },
  { address: "box/t7", space: "s1", space_name: "web", tab_name: "server", app: "codex", status: "blocked", program: { key: "codex" } },
  { address: "t9", space: "s2", space_name: "other", tab_name: "docs", app: null, status: "idle", program: { key: "agent" } },
];
const TERMS = [
  { address: "t1", sent: [{ to: "t2", count: 4, last_ms: 1000, text: "看一下 parser" }, { to: "box/t7", count: 1, last_ms: 500, text: "deploy?" }] },
  { address: "t2", sent: [{ to: "t1", count: 1, last_ms: 2000, text: "好了" }, { to: "t9", count: 2, last_ms: 900, text: "docs" }] },
  { address: "box/t7", parent: "t1", created_ms: 100 },
  { address: "t3", sent: [{ to: "t1", count: 1, last_ms: 1, text: "a shell" }] },
];
test("關係: a column per space as the Agents list groups them, its names (sidebarNames); lines between shown agents, the rest listed; CLI and model from the header's ask", (M) => {
  const { graphData, modelOf, cliOf, agoText } = M.graph;
  const ctx = { "|/w|t1": { model: "claude-opus-5-5" }, "|/w|t2": { model: "anthropic/claude-sonnet-5-5" }, "box|/srv|box/t7": { model: "gpt-5.5-codex" } };
  const notes = { "|/w|t1": { text: "改 parser；下一步跑測試\n第二行", at: 2000 } };
  const g = graphData({ agents: AGS, terms: TERMS, space: "s1", ctx, notes, now: 2001000 });
  assert.deepEqual(g.cols.map((c) => [c.space, c.machine, c.nodes.map((n) => n.address)]), [["web", null, ["t1", "t2", "box/t7"]]], "a mix of machines: no machine in the title");
  const all = graphData({ agents: AGS.map((a) => a.address === "box/t7" ? { ...a, space: "s3", space_name: "srv" } : a), terms: TERMS, space: null });
  assert.deepEqual(all.cols.map((c) => [c.space, c.machine]), [["web", null], ["srv", "box"], ["other", null]], "the list's order");
  assert.equal(graphData({ agents: AGS, terms: TERMS, space: "s1", names: { t1: "laptop" } }).nodes[0].name, "laptop", "the list's name first");
  const n1 = g.nodes[0];
  assert.deepEqual([n1.name, n1.cli, n1.model, n1.note], ["前端", "claude", "Opus 5.5", "改 parser；下一步跑測試"]);
  assert.deepEqual(g.nodes.map((n) => [n.cli, n.model]), [["claude", "Opus 5.5"], ["omp", "Sonnet 5.5"], ["codex", "gpt-5.5-codex"]]);
  const e = (x) => `${x.from}>${x.to}:${x.kind}${x.both ? ":both" : ""}`;
  assert.deepEqual(g.edges.map(e), ["t1>t2:send:both", "t1>box/t7:send", "t2>t1:send:both", "t1>box/t7:parent"]);
  assert.deepEqual(g.outside.map(e), ["t2>t9:send", "t3>t1:send"], "the other space's agent, a terminal that isn't an agent");
  assert.equal(graphData({ agents: AGS, terms: TERMS, space: null }).nodes.length, 4, "every space");
  assert.equal(cliOf(null, "agent"), "?");
  assert.equal(modelOf("claude-haiku-5-5-20261001"), "Haiku 5.5");
  assert.deepEqual([agoText(1000, 1000), agoText(0, 5 * 60000), agoText(0, 3 * 3600000)], ["剛剛", "5 分前", "3 小時前"]);
});
test("關係: lines leave the facing side, loop out on the right in one column, arrowheads point at the receiver", (M) => {
  const { curveOf, arrowOf, layoutOf, COL_W, NODE_H } = M.graph;
  const { at, w } = layoutOf([{ nodes: [{ address: "a" }, { address: "b" }] }, { nodes: [{ address: "c" }] }]);
  const ac = curveOf(at.a, at.c), ca = curveOf(at.c, at.a), ab = curveOf(at.a, at.b);
  assert.equal(ac.a[0], at.a.x + COL_W, "to the right: from a's right side");
  assert.equal(ac.b[0], at.c.x, "into c's left side");
  assert.equal(ca.b[0], at.a.x + COL_W, "back: into a's right side");
  assert.ok(ab.c1[0] > at.a.x + COL_W && ab.mid[0] < w, "one column: out on the right, inside the drawing");
  assert.notEqual(curveOf(at.a, at.c, true).a[1], ac.a[1], "both ways: apart");
  // past a column: around the card on the way (along the gap between rows), not over it
  const three = layoutOf([{ nodes: [{ address: "a" }] }, { nodes: [{ address: "m" }] }, { nodes: [{ address: "z" }] }]).at;
  const far = curveOf(three.a, three.z), m = three.m;
  assert.ok(far.via && far.via.length === 4, "corners");
  const hits = [far.a, ...far.via, far.b].slice(1).some((pt, i, all) => {
    const from = [far.a, ...far.via][i], [x0, x1] = [Math.min(from[0], pt[0]), Math.max(from[0], pt[0])], [y0, y1] = [Math.min(from[1], pt[1]), Math.max(from[1], pt[1])];
    return x1 > m.x && x0 < m.x + m.w && y1 > m.y && y0 < m.y + NODE_H;
  });
  assert.ok(!hits, "no stretch crosses the middle card");
  assert.ok(far.mid[0] > m.x && far.mid[0] < m.x + m.w && (far.mid[1] > m.y + NODE_H || far.mid[1] < m.y), "the label under or over it");
  // a narrow panel: the columns go on below in bands that fit it (nothing to scroll sideways), lines between bands
  // go around the cards too
  const cols3 = [{ nodes: [{ address: "a" }, { address: "b" }] }, { nodes: [{ address: "m" }] }, { nodes: [{ address: "z" }] }];
  const narrow = layoutOf(cols3, 420);
  assert.ok(narrow.w <= 420, `fits: ${narrow.w}`);
  assert.deepEqual(["a", "b", "m", "z"].map((k) => narrow.at[k].band), [0, 0, 1, 2]);
  assert.ok(narrow.at.m.y > narrow.at.b.y + NODE_H && narrow.heads[1].y > narrow.at.b.y + NODE_H, "the next column's title under the last card");
  const mid = layoutOf(cols3, 700);
  assert.deepEqual(["a", "m", "z"].map((k) => mid.at[k].band), [0, 0, 1]);
  const cross = curveOf(mid.at.m, mid.at.z);
  assert.ok(cross.via, "between bands: around");
  assert.equal(layoutOf(cols3, 0).heads.length, 3);
  const [tip, l, r] = arrowOf([0, 0], [10, 0]);
  assert.deepEqual(tip, [10, 0]);
  assert.ok(l[0] < 10 && r[0] < 10 && l[1] * r[1] < 0, "behind the tip, one on each side");
});
test("關係 tab: the cards and lines drawn, a click says one card's lines in words, the scope and the tab remembered", async (M) => {
  fresh(); fakeKit(); localStorage.removeItem("kit.agent-events");
  H.spaces = [{ id: "s1", name: "web", active: true, tabs: [] }, { id: "s2", name: "other", tabs: [] }];
  H.agents = AGS; H.terminals = TERMS;
  const v = view(M, { role: "agents" }); await settle();
  render(v); H.clicks["kit-agents-tab-rel"]({}, cx);
  pathOps.length = 0;
  let out = render(v);
  assert.match(out, /這個 space（web）/);
  for (const s of ["前端", "review", "server", "box", "web", "claude", "4 次"]) assert.ok(out.includes(s), s);
  assert.ok(!out.includes("docs"), "another space's agent: not drawn");
  assert.equal(pathOps.length, 8, "4 lines, each a stroke and its arrowhead");
  assert.ok(pathOps.some((ops) => ops.some(([k]) => k === "dash_array")), "who started whom: dashed");
  H.clicks["kit-graph-t2"]({ click_count: 1 }, cx);
  assert.deepEqual(H.runs.at(-1), ["pane.focus", { terminal: "t2" }], "one click: to its pane, like the Agents list");
  out = render(v);
  assert.match(out, /→ 傳給 前端（t1） · 1 次/);
  assert.match(out, /→ 傳給 t9（不在這裡） · 2 次/);
  assert.match(out, /最後一則：好了/);
  H.clicks["kit-graph"]({}, cx);
  // 提醒它回 from the panel: hc send --if idle (not run(): that takes the app's commands only), said on top
  H.agents = [ag("t1", "idle", { tab_name: "問" }), ag("t2", "idle", { tab_name: "答" })];
  H.terminals = [{ address: "t1", sent: [{ to: "t2", count: 1, last_ms: Date.now() - 600000, text: "看一下" }], status_ms: Date.now() - 590000 },
    { address: "t2", status_ms: Date.now() - 300000 }];
  out = render(v);
  const nudge = Object.keys(H.clicks).find((k) => k.startsWith("kit-graph-nudge-"));
  assert.ok(nudge, "a 提醒它回 button");
  H.calls = [];
  H.clicks[nudge]({}, cx); await settle();
  const sendCall = H.calls.find((c) => c.argv[1] === "send");
  assert.deepEqual(sendCall?.argv.slice(0, 6), ["hc", "send", "--if", "idle", "--json", "t2"]);
  assert.match(sendCall.argv[6], /^\[Herdr 提醒\] 你還沒回 問 傳給你的訊息（開頭：「看一下」）/);
  out = render(v);
  assert.match(out, /已提醒 答 回覆，等它回/);
  assert.match(out, /已提醒/);
  H.agents = AGS; H.terminals = TERMS;
  assert.ok(!/最後一則：好了/.test(render(v)), "a click on the empty part: nothing selected");
  H.clicks["kit-graph-scope-all"]({}, cx);
  assert.ok(render(v).includes("docs"));
  const again = view(M, { role: "agents" }); await settle();
  assert.ok(render(again).includes("docs"), "the tab and the scope kept");
  localStorage.removeItem("kit.agents.tab"); localStorage.removeItem("kit.agents.scope"); localStorage.removeItem("kit.agent-events");
});
const ag = (address, status, extra = {}) => ({ address, space: "s1", tab_name: address, app: "claude-code", status, program: { key: "claude" }, ...extra });
test("關係: who waits for whom: still on it, no answer, needs you; chains to the end, loops; a reply ends the wait", (M) => {
  const { graphData } = M.graph;
  const msg = (to, at) => ({ to, count: 1, last_ms: at, text: "x" });
  // a asked b (b stopped after it: no answer); c asked d (d works on it); e asked f, f asked g, g needs you
  const agents = ["a:idle", "b:idle", "c:idle", "d:working", "e:idle", "f:idle", "g:blocked", "h:idle"].map((x) => ag(...x.split(":")));
  const terms = [
    { address: "a", sent: [msg("b", 1000)] }, { address: "b", status_ms: 9000 },
    { address: "c", sent: [msg("d", 1000)] }, { address: "d", status_ms: 500 },
    { address: "e", sent: [msg("f", 1000)] }, { address: "f", sent: [msg("g", 2000)], status_ms: 2100 }, { address: "g", status_ms: 5000 },
    { address: "h", sent: [msg("a", 900)] },   // h asked a before a asked b: h waits for a, a for b
  ];
  const g = graphData({ agents, terms, space: null, now: 60000 });
  const w = (from, to) => g.waits.find((x) => x.from === from && x.to === to)?.state;
  assert.deepEqual([w("a", "b"), w("c", "d"), w("e", "f"), w("f", "g"), w("h", "a")], ["silent", "working", "working", "blocked", "working"]);
  assert.deepEqual(g.chains.map((c) => [c.path.join(">"), c.why]), [["h>a>b", "silent"], ["e>f>g", "blocked"]]);
  // b answers a: no wait any more
  const answered = graphData({ agents, terms: [...terms.filter((r) => r.address !== "b"), { address: "b", sent: [msg("a", 9500)], status_ms: 9600 }], space: null, now: 60000 });
  assert.equal(answered.waits.some((x) => x.from === "a" && x.to === "b"), false);
  // a message that says it wants no answer: nobody waits
  for (const text of ["收到，不用再回。", "[FYI] deploy done", "報告如下（不必回）"]) {
    const fyi = terms.map((r) => (r.address === "a" ? { ...r, sent: [{ ...msg("b", 1000), text }] } : r));
    assert.equal(graphData({ agents, terms: fyi, space: null, now: 60000 }).waits.some((x) => x.from === "a" && x.to === "b"), false, text);
  }
  assert.equal(M.graph.noReply("你要回我嗎"), false);
  // 提醒它回: on a no-answer line, typed into the one that stopped, only while idle, once
  {
    fresh();
    const th = new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : "#334455") });
    const alerts = (o) => { H.texts = []; H.strings = []; H.clicks = {}; M.graph.alertsView(th, 13, g, 60000, null, o); return [...H.texts, ...H.strings].join("\n"); };
    const sent = [];
    let out = alerts({ onNudge: (w) => sent.push(w) });
    assert.match(out, /提醒它回/);
    H.clicks["kit-graph-nudge-chain-h-a-b"]({}, cx);
    assert.deepEqual(sent.map((w) => `${w.from}>${w.to}`), ["a>b"], "the chain's last link");
    assert.match(M.graph.nudgeText(g, sent[0]), /^\[Herdr 提醒\] 你還沒回 a 傳給你的訊息（開頭：「x」）。要回就用 hc send/);
    assert.ok(!M.graph.nudgeText(g, sent[0]).includes("<hc"), "no tag: not taken for an agent's message");
    out = alerts({ onNudge: () => {}, nudged: new Set([`a>b@1000`]) });
    assert.match(out, /已提醒/);
    assert.ok(!/提醒它回/.test(alerts({})), "no button without onNudge");
  }
  // Herdr's list kept b's status_ms from before; the log knows b stopped after the message
  const stale = terms.map((r) => (r.address === "b" ? { ...r, status_ms: 10 } : r));
  assert.equal(graphData({ agents, terms: stale, space: null, now: 60000 }).waits.find((x) => x.from === "a").state, "working", "without the log: can't tell");
  assert.equal(graphData({ agents, terms: stale, space: null, now: 60000, log: [{ at: 9000, k: "status", a: "b", v: "idle" }] }).waits.find((x) => x.from === "a").state, "silent");
  // a question and its answer: the one who answered waits for nothing; asking again waits again
  const qa = [{ address: "p", sent: [{ to: "q", count: 1, last_ms: 1000 }], status_ms: 20000 }, { address: "q", sent: [{ to: "p", count: 1, last_ms: 9000 }], status_ms: 9500 }];
  const pq = [ag("p", "idle"), ag("q", "idle")];
  assert.deepEqual(graphData({ agents: pq, terms: qa, space: null }).waits, [], "answered: nobody waits");
  qa[0].sent[0] = { to: "q", count: 2, last_ms: 21000 };
  assert.deepEqual(graphData({ agents: pq, terms: qa, space: null }).waits.map((x) => `${x.from}>${x.to}`), ["p>q"], "asked again");
  // a got its answer some other way: it worked again after b stopped (or messaged someone), so it isn't waiting
  // (b answered on its own screen, a read it there and told c)
  {
    const moved = terms.map((r) => (r.address === "a" ? { ...r, status_ms: 12000 } : r));
    assert.equal(graphData({ agents, terms: moved, space: null, now: 60000 }).waits.some((x) => x.from === "a" && x.to === "b"), false, "worked after b stopped");
    const told = terms.map((r) => (r.address === "a" ? { ...r, sent: [msg("b", 1000), msg("zz", 12000)] } : r));
    assert.equal(graphData({ agents, terms: told, space: null, now: 60000 }).waits.some((x) => x.from === "a" && x.to === "b"), false, "messaged someone (even off this list) after b stopped");
    const early = terms.map((r) => (r.address === "a" ? { ...r, status_ms: 9000 } : r));
    assert.equal(graphData({ agents, terms: early, space: null, now: 60000 }).waits.find((x) => x.from === "a" && x.to === "b")?.state, "silent", "stopped the same moment as b: still waits");
  }
  // a sent, but works on something else now: not waiting
  assert.equal(graphData({ agents: agents.map((x) => (x.address === "a" ? { ...x, status: "working" } : x)), terms, space: null }).waits.some((x) => x.from === "a"), false);
  // x and y wait for each other
  const loop = graphData({ agents: [ag("x", "idle"), ag("y", "idle")], terms: [{ address: "x", sent: [msg("y", 1000)], status_ms: 3000 }, { address: "y", sent: [msg("x", 1000)], status_ms: 3000 }], space: null });
  assert.deepEqual(loop.waits.length, 0, "the same moment both ways: each answered the other");
  const loop2 = graphData({ agents: [ag("x", "idle"), ag("y", "idle"), ag("z", "idle")],
    terms: [{ address: "x", sent: [msg("y", 1000)], status_ms: 5000 }, { address: "y", sent: [msg("z", 1100)], status_ms: 5000 }, { address: "z", sent: [msg("x", 1200)], status_ms: 5000 }], space: null });
  assert.deepEqual(loop2.chains.map((c) => c.why), ["loop"], "one loop, shown once");
});
test("關係: two agents working at once in one folder (or one inside the other); home folders, worktrees, other machines don't count", (M) => {
  const { clashesOf } = M.graph;
  const n = (address, cwd, status = "working", machine = "") => ({ address, cwd, status, machine });
  assert.deepEqual(clashesOf([n("a", "/w/app"), n("b", "/w/app/src"), n("c", "/w/app-wt"), n("d", "/w/app", "idle")]), [{ nodes: ["a", "b"], dir: "/w/app" }]);
  assert.deepEqual(clashesOf([n("a", "/Users/amy"), n("b", "/Users/amy"), n("c", "C:\\Users\\amy\\"), n("d", "c:/users/amy")]), [], "home");
  assert.deepEqual(clashesOf([n("a", "/srv/x"), n("b", "/srv/x", "working", "box")]), [], "another machine");
  assert.deepEqual(clashesOf([n("a", "C:\\w\\App"), n("b", "c:/w/app/lib")]).map((c) => c.nodes), [["a", "b"]], "Windows paths");
});
test("關係: waiting for you warms up then goes red (with what it waits for); stopped long ago and nobody waits: 可以關了; an offline machine greys out", (M) => {
  const { graphData, cardState, spanText } = M.graph;
  const MIN = 60000, now = 100 * MIN;
  const agents = [ag("t1", "blocked"), ag("t2", "blocked"), ag("t3", "blocked"), ag("t4", "idle"), ag("t5", "done"), ag("t6", "idle"),
    ag("t7", "idle"), ag("box/t8", "idle"), ag("t9", "idle", { focused: true })];
  const terms = [
    { address: "t1", status_ms: now - 1 * MIN, report: { kind: "permission" } }, { address: "t2", status_ms: now - 5 * MIN, report: { kind: "question" } },
    { address: "t3", status_ms: now - 15 * MIN }, { address: "t4", status_ms: now - 40 * MIN }, { address: "t5", status_ms: now - 45 * MIN },
    { address: "t6", status_ms: now - 50 * MIN }, { address: "t7", status_ms: now - 50 * MIN, sent: [{ to: "t6", count: 1, last_ms: now - 60 * MIN }] },
    { address: "box/t8", status_ms: now - 90 * MIN }, { address: "t9", status_ms: now - 90 * MIN },
  ];
  const g = graphData({ agents, terms, space: null, down: { box: now - 3 * MIN }, now });
  const st = (a) => cardState(g, g.nodes.find((n) => n.address === a), now);
  assert.deepEqual([st("t1").text, st("t1").warm], ["等你允許 1 分", false]);
  assert.deepEqual([st("t2").text, st("t2").warm, st("t2").hot], ["在問你 5 分", true, false]);
  assert.deepEqual([st("t3").text, st("t3").hot], ["等你 15 分", true]);
  assert.deepEqual(g.longWaits.map((x) => x.address), ["t3"]);
  assert.deepEqual(g.idle.map((x) => x.address), ["t4", "t7"], "t5: done, not looked at yet (news, not 可以關了); t6: someone waits for it (t7 asked); t8: offline; t9: you're on it");
  assert.deepEqual(g.done.map((x) => x.address), ["t5"]);
  assert.equal(st("t5").text, "做完 · 等你看");
  // context: from the pane header's kit context; 80 % or more: said
  const ctx = { "|/w|t1": { pct: 54 }, "|/w|t2": { pct: 85 }, "|/w|t3": { pct: 97.4 } };
  const gc = graphData({ agents, terms, space: null, ctx, now });
  assert.deepEqual(gc.full, [{ address: "t2", pct: 85 }, { address: "t3", pct: 97 }]);
  assert.equal(gc.nodes[0].pct, 54);
  {
    const th = new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : "#334455") });
    H.texts = []; H.strings = []; M.graph.alertsView(th, 13, gc, now);
    const out = [...H.texts, ...H.strings].join("\n");
    assert.match(out, /做完等你看：t5/);
    assert.match(out, /t3 的 context 用了 97%，快滿了：先請它寫 HANDOFF\.md/);
    assert.ok(!/t1 的 context/.test(out), "54 %: nothing");
  }
  assert.equal(st("t4").text, "閒置 40 分 · 可以關了");
  assert.equal(st("box/t8").text, "連不到");
  assert.equal(g.nodes.find((n) => n.address === "box/t8").down, now - 3 * MIN);
  const g2 = graphData({ agents: [ag("box/t8", "idle", { space: "s9", space_name: "srv" })], terms, space: null, down: { box: now - 3 * MIN }, now });
  assert.deepEqual([g2.cols[0].machine, g2.cols[0].down], ["box", now - 3 * MIN], "a space on an offline machine");
  assert.deepEqual([spanText(30000), spanText(90 * MIN), spanText(50 * 3600000)], ["30 秒", "1 小時", "2 天"]);
});
test("關係: an agent done and not looked at says what it said when it stopped (its card, its own alert line); cards waiting for you are colored", (M) => {
  const { graphData, cardState, alertsView, tint } = M.graph, { parseSaid, saidNow } = M.said;
  const MIN = 60000, now = 100 * MIN;
  assert.equal(parseSaid("{bad"), null);
  assert.equal(parseSaid(JSON.stringify({ at: 5, text: "  " })), null, "nothing said");
  assert.deepEqual(parseSaid(JSON.stringify({ at: 5, text: "a\n b" })), { at: 5, text: "a b" });
  assert.equal([...parseSaid(JSON.stringify({ at: 5, text: "字".repeat(300) })).text].length, 200, "kept short");
  const said = { t5: { at: now - 45 * MIN + 2000, text: "srv root 要不要升到 0.6.3？" }, t6: { at: now - 3 * 3600000, text: "old words" } };
  assert.equal(saidNow(said, "t6", now - 45 * MIN), "", "said before this stop (no hook there): nothing");
  const agents = [ag("t5", "done"), ag("t6", "done"), ag("t7", "blocked"), ag("t8", "done", { focused: true })];
  const terms = [{ address: "t5", status_ms: now - 45 * MIN }, { address: "t6", status_ms: now - 45 * MIN }, { address: "t7", status_ms: now - 30000 }, { address: "t8", status_ms: now - MIN }];
  const g = graphData({ agents, terms, space: null, said: { ...said, t8: { at: now, text: "seen" } }, now });
  const st = (a) => cardState(g, g.nodes.find((n) => n.address === a), now);
  assert.deepEqual([st("t5").text, st("t5").you], ["做完：srv root 要不要升到 0.6.3？", true]);
  assert.deepEqual([st("t6").text, st("t6").you], ["做完 · 等你看", true]);
  assert.deepEqual([st("t7").text, st("t7").you, st("t7").warm], ["等你 30 秒", true, false], "blocked: colored from the start");
  assert.equal(st("t8"), null, "you're on it: nothing");
  const th = new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : "#334455") });
  H.texts = []; H.strings = []; alertsView(th, 13, g, now);
  const out = [...H.texts, ...H.strings].join("\n");
  assert.match(out, /t5 做完等你看：「srv root 要不要升到 0\.6\.3？」/);
  assert.match(out, /做完等你看：t6/);
  assert.ok(!/t8/.test(out));
  assert.equal(tint("#000000", "#ffffff", 0.5), "#808080");
  // no hook there: the line the program reported with its status (status.msg in the core's record)
  const gm = graphData({ agents: [ag("box/t9", "done")], terms: [{ address: "box/t9", status_ms: now - MIN, status: "done", report: { state: "done", msg: "要不要升到  0.6.3？" } }], space: null, now });
  assert.equal(gm.done[0].said, "要不要升到 0.6.3？");
  assert.equal(cardState(gm, gm.nodes[0], now).text, "做完：要不要升到 0.6.3？");
  assert.equal(tint("rgb(1,2,3)", "#ffffff"), "rgb(1,2,3)", "not #rrggbb: as it is");
});
test("關係: an agent's own sub-agents (the reply hook's subs file): 子 N on its card, each one when it is selected", (M) => {
  const { graphData, runningSubs, edgeList } = M.graph, { parseSubs, subsNow } = M.said;
  const MIN = 60000, now = 100 * MIN;
  assert.equal(parseSubs("{bad"), null);
  assert.equal(parseSubs(JSON.stringify({ at: 0, list: [] })), null);
  const file = parseSubs(JSON.stringify({ at: now - MIN, list: [{ id: "a1", type: "Explore", desc: "find  the parser", done: false, start: now - 2 * MIN, last: now - MIN },
    { id: "a2", type: "general-purpose", desc: "review", done: true, start: now - 9 * MIN, last: now - 3 * MIN }, { desc: "no id" }, "x"] }));
  assert.deepEqual(file.list.map((x) => [x.id, x.desc, x.done]), [["a1", "find the parser", false], ["a2", "review", true]]);
  const all = { t1: file, t2: { ...file, at: now - 40 * MIN } };
  assert.equal(subsNow(all, "t2", now).length, 0, "an old file of an agent not working: nothing");
  assert.equal(subsNow(all, "t2", now, true).length, 2, "working: a long sub-agent may write nothing for a while");
  const g = graphData({ agents: [ag("t1", "working"), ag("t2", "idle")], terms: [], space: null, subs: all, now });
  assert.deepEqual([runningSubs(g.nodes[0]), runningSubs(g.nodes[1])], [1, 0]);
  const th = new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : "#334455") });
  H.texts = []; H.strings = []; edgeList(th, 13, g, "t1", now);
  const out = [...H.texts, ...H.strings].join("\n");
  assert.match(out, /子 agent：find the parser（Explore） · 在跑 · 開始 2 分前/);
  assert.match(out, /子 agent：review（general-purpose） · 做完 · 3 分前/);
  // its latest step: the last tool call (or words) in its own transcript's tail
  const { lastStep } = M.said;
  const rec = (c) => JSON.stringify({ type: "assistant", message: { content: c } });
  const tail = ["half a line", rec([{ type: "text", text: "Let me look.\nmore" }]), JSON.stringify({ type: "user", message: { content: "x" } }),
    rec([{ type: "tool_use", name: "Bash", input: { command: "ls ~/.codex/sessions\nsecond line", description: "list" } }])].join("\n");
  assert.equal(lastStep(tail), "Bash：ls ~/.codex/sessions");
  assert.equal(lastStep(rec([{ type: "tool_use", name: "Read", input: { file_path: "/w/a.rs" } }])), "Read：/w/a.rs");
  assert.equal(lastStep("garbage"), "");
  const gs = graphData({ agents: [ag("t1", "working")], terms: [], space: null, subs: all, steps: { "t1|a1": { at: now, text: "Read：/w/a.rs" } }, now });
  assert.equal(M.graph.subLine(gs.nodes[0].subs[0], now), "find the parser（Explore） · 在跑 · 開始 2 分前 · 正在：Read：/w/a.rs");
  assert.equal(M.graph.subsText(gs.nodes[0], now).split("\n").length, 2, "the hover: one line each");
  assert.equal(parseSubs(JSON.stringify({ at: 1, list: [{ id: "a", path: "/etc/passwd" }] })).list[0].path, "", "only a sub-agent transcript path is kept");
});
test("關係: done but its own work still runs (a background shell, a sub-agent): 背景工作中 (as working), not 做完等你看", (M) => {
  const { graphData, cardState } = M.graph, { bgJobs } = M.said;
  const MIN = 60000, now = 100 * MIN;
  const ps = [
    `  700 /bin/zsh -c source /Users/amy/.claude/shell-snapshots/snapshot-zsh-1.sh 2>/dev/null || true && eval 'pwsh tests/run.ps1 2>&1 | tail -5' < /dev/null && pwd -P >| /tmp/x`,
    `  700 /bin/zsh -c source /Users/amy/.claude/shell-snapshots/snapshot-zsh-1.sh && eval 'echo '"'"'hi'"'"'' < /dev/null && pwd -P`,
    "  700 /opt/homebrew/bin/python3 /Users/amy/tools/mcp.py", "  700 caffeinate -i -t 300", "  701 /bin/zsh -c source x/shell-snapshots/s.sh && eval 'other' < /dev/null",
  ].join("\n");
  assert.deepEqual(bgJobs(ps, 700), ["pwsh tests/run.ps1 2>&1 | tail -5", "echo 'hi'"], "only its own shells; not MCP servers, caffeinate, another's");
  const agents = [ag("t1", "done"), ag("t2", "done"), ag("t3", "done")];
  const terms = [{ address: "t1", status_ms: now - MIN }, { address: "t2", status_ms: now - MIN }, { address: "t3", status_ms: now - MIN }];
  const bg = { t1: { at: now - 30000, jobs: ["pwsh tests/run.ps1"] }, t3: { at: now - 2 * MIN, jobs: ["old"] } };
  const subs = { t2: { at: now - MIN, list: [{ id: "a", type: "Explore", desc: "x", done: false, start: now - 2 * MIN, last: now }] } };
  const g = graphData({ agents, terms, space: null, bg, subs, now });
  const st = (a) => cardState(g, g.nodes.find((n) => n.address === a), now);
  assert.deepEqual([st("t1").text, st("t1").you], ["背景工作中：pwsh tests/run.ps1", undefined]);
  assert.equal(st("t2").text, "背景工作中：子 agent 1 個");
  assert.equal(st("t3").text, "做完 · 等你看", "a shell seen before it stopped doesn't count");
  assert.deepEqual(g.done.map((x) => x.address), ["t3"]);
  // the same for Herdr's own Agents list (agents.busy)
  assert.deepEqual(M.said.busyOf(agents, terms, bg, subs, now), { t1: "pwsh tests/run.ps1", t2: "子 agent 1 個" });
});
test("關係 log: a machine going offline and back, once each; still loading isn't offline", (M) => {
  const { diffMachines } = M.events;
  let r = diffMachines(null, [{ name: null, layout: "ready" }, { name: "box", layout: "loading" }], 10);
  assert.deepEqual([r.now, r.events], [{}, []]);
  r = diffMachines(r.now, [{ name: "box", layout: "ready" }], 20);
  assert.deepEqual([r.now, r.events], [{ box: { down: false, since: 20 } }, []]);
  r = diffMachines(r.now, [{ name: "box", layout: "unavailable" }], 30);
  assert.deepEqual([r.now.box, r.events], [{ down: true, since: 30 }, [{ at: 30, k: "down", m: "box" }]]);
  r = diffMachines(r.now, [{ name: "box", layout: "loading" }], 40);
  assert.deepEqual([r.now.box, r.events], [{ down: true, since: 30 }, []], "reconnecting: still offline");
  r = diffMachines(r.now, [{ name: "box", layout: "ready" }], 50);
  assert.deepEqual([r.now.box, r.events.map((e) => e.k)], [{ down: false, since: 50 }, ["up"]]);
  assert.deepEqual(diffMachines(null, [{ name: "box", layout: "unavailable" }], 5).events.map((e) => e.k), ["down"], "offline when first seen");
});
test("關係 log: status changes, new messages, new notes, agents coming and going; the first look sets where they stand", (M) => {
  const { diffEvents, notesByAddr } = M.events;
  const ags = [ag("t1", "idle"), ag("t2", "working")];
  let { last, events } = diffEvents(null, ags, [{ address: "t1", status_ms: 100, sent: [{ to: "t2", count: 3, last_ms: 90 }] }, { address: "t2", status_ms: 200 }], {}, 1000);
  assert.deepEqual(events.map((e) => [e.k, e.a, e.v, e.at]), [["status", "t1", "idle", 100], ["status", "t2", "working", 200]], "messages before: not new");
  ({ last, events } = diffEvents(last, [ag("t1", "working"), ag("t3", "idle")],
    [{ address: "t1", status_ms: 1500, sent: [{ to: "t2", count: 5, last_ms: 1400, text: "again" }] }, { address: "t3", status_ms: 1200 }],
    notesByAddr({ "|/w|t1": { text: "改 parser\n細節", at: 1 } }), 2000));
  assert.deepEqual(events.map((e) => [e.k, e.a, e.at]), [["start", "t3", 1200], ["send", "t1", 1400], ["status", "t1", 1500], ["note", "t1", 2000], ["gone", "t2", 2000]]);
  assert.equal(events.find((e) => e.k === "send").n, 2);
  assert.equal(events.find((e) => e.k === "note").text, "改 parser");
  // a status_ms Herdr kept from long ago: the change is now
  assert.equal(diffEvents(last, [ag("t1", "done"), ag("t3", "idle")], [{ address: "t1", status_ms: 5 }, { address: "t3" }], {}, 9000).events.find((e) => e.k === "status").at, 9000);
  assert.equal(diffEvents(last, [ag("t1", "working"), ag("t3", "idle")], [{ address: "t1", sent: [{ to: "t2", count: 5 }] }], notesByAddr({ "|/w|t1": { text: "改 parser" } }), 3000).events.length, 0, "nothing new: nothing");
});
test("關係 timeline: a lane's stretches from its status events, cut to the span; gone ends it", (M) => {
  const { stretches } = M.timeline;
  const log = [{ at: 0, k: "status", a: "t1", v: "idle" }, { at: 50, k: "status", a: "t1", v: "working" }, { at: 80, k: "status", a: "t1", v: "done" },
    { at: 90, k: "gone", a: "t1" }, { at: 60, k: "status", a: "t2", v: "blocked" }];
  assert.deepEqual(stretches(log, "t1", 40, 100), [{ x0: 40, x1: 50, v: "idle" }, { x0: 50, x1: 80, v: "working" }, { x0: 80, x1: 90, v: "done" }]);
  assert.deepEqual(stretches(log, "t2", 40, 100), [{ x0: 60, x1: 100, v: "blocked" }]);
});
test("關係 tab: what needs a look on top (stuck, no answer, one folder); the timeline from the log the Agents button keeps", async (M) => {
  fresh(); fakeKit(); localStorage.removeItem("kit.agent-events");
  H.spaces = [{ id: "s1", name: "web", active: true, tabs: [] }];
  const now = Date.now();
  H.agents = [ag("t1", "idle", { tab_name: "前端" }), ag("t2", "idle", { tab_name: "review" }), ag("t4", "working"), ag("t5", "working")];
  H.terminals = [{ address: "t1", sent: [{ to: "t2", count: 1, last_ms: now - 600000, text: "看一下" }], status_ms: now - 590000 },
    { address: "t2", status_ms: now - 300000 }, { address: "t4", cwd: "/w/app" }, { address: "t5", cwd: "/w/app/src" }];
  localStorage.setItem("kit.agents.tab", "rel");
  const v = view(M, { role: "agents" }); await settle();
  let out = render(v);
  assert.match(out, /卡住：前端 → review，review 停了但沒回/);
  assert.match(out, /同一個資料夾：t4、t5 同時在 \/w\/app 裡改東西/);
  assert.match(out, /還沒回 · 5 分/);
  // offline: the column says so
  H.machines = [{ name: null, layout: "ready" }, { name: "box", layout: "unavailable" }];
  H.agents = [...H.agents, ag("box/t7", "working", { space: "s9", space_name: "srv" })];
  for (const f of [...timers]) f(cx);
  // (全部 space: the remote space is another column)
  H.clicks["kit-graph-scope-all"]({}, cx);
  assert.match(render(v), /srv · box 斷線 0 秒/);
  H.machines = [];
  // the Agents button logs; the timeline draws it
  const btnView = view(M, { role: "agents-toggle" });
  for (const f of [...timers]) f(cx);
  assert.ok(H.store["kit.events.v1"]?.log?.length >= 4, "one status per agent");
  H.clicks["kit-graph-view-time"]({}, cx);
  pathOps.length = 0;
  out = render(v);
  assert.match(out, /色條是狀態/);
  for (const s of ["前端", "review", "現在"]) assert.ok(out.includes(s), s);
  localStorage.removeItem("kit.agents.tab"); localStorage.removeItem("kit.agents.view"); localStorage.removeItem("kit.agents.scope"); localStorage.removeItem("kit.agent-events");
  void btnView;
});
test("agent logo: bot: in the frontmatter is read, set after description, replaced, taken out; line ends and the prompt kept", (M) => {
  const { readBot, withBot } = M.bots;
  const file = "---\nname: hi\ndescription: 測試\nrules: [zh-tw]\n---\nbot: not this one\n";
  assert.equal(readBot(file), null);
  const set = withBot(file, { animal: "fox", color: "amber" });
  assert.equal(set, "---\nname: hi\ndescription: 測試\nbot: fox amber\nrules: [zh-tw]\n---\nbot: not this one\n");
  assert.deepEqual(readBot(set), { animal: "fox", color: "amber" });
  assert.equal(withBot(set, { animal: "owl", color: "sky" }), set.replace("bot: fox amber", "bot: owl sky"));
  assert.equal(withBot(set, null), file);
  const crlf = file.replace(/\n/g, "\r\n");
  assert.equal(withBot(crlf, { animal: "cat", color: "mint" }), set.replace("fox amber", "cat mint").replace(/\n/g, "\r\n"));
  assert.equal(readBot("---\nname: x\nbot: fox purple\n---\n"), null, "a color there isn't");
  assert.deepEqual(readBot("---\nname: x\nbot: fox\n---\n"), { animal: "fox", color: null }, "an animal alone: its own colors");
  assert.equal(withBot(file, { animal: "fox", color: null }), set.replace("fox amber", "fox"));
  assert.equal(withBot("no frontmatter\n", { animal: "cat", color: "mint" }), null);
});
test("agents: 換 logo — an animal / color click writes bot: into the agent's file (as it was read) and shows it at once; 照名字 takes it out", async (M) => {
  fresh();
  const path = "/s/agents/reviewer.md", orig = "---\nname: reviewer\ndescription: 看 PR\n---\nprompt\n";
  H.files = { [path]: orig };
  fakeKit({ agents: { kit: "0.3.0", tools: ["claude"], available: {}, agents: [{ name: "reviewer", description: "看 PR", rules: [], skills: [], mcp: [], source: "team", path }] } });
  const v = view(M, { role: "agents" }); await settle(); await tick();
  const agent = () => H.store["kit.agents.data.v1"].agents[0];
  assert.equal(agent().bot, null, "no bot: line: its name picks one");
  const mine = () => H.writes.filter((w) => w[0] === path);   // (the logos' SVGs are written too)
  render(v); H.clicks["ag-reviewer"]({}, cx);
  render(v); H.clicks["bot-pick"]({}, cx);
  render(v); H.clicks["bot-animal-owl"]({}, cx); await settle();
  assert.deepEqual(mine(), [[path, "---\nname: reviewer\ndescription: 看 PR\nbot: owl\n---\nprompt\n", orig]], "its name's pick is in its own colors: the animal alone");
  assert.deepEqual(agent().bot, { animal: "owl", color: null });
  render(v); H.clicks["bot-color-teal"]({}, cx); await settle();
  assert.match(H.files[path], /^bot: owl teal$/m);
  render(v); H.clicks["bot-reset"]({}, cx); await settle();
  assert.equal(H.files[path], orig);
  assert.equal(agent().bot, null);
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

// kit's JSON (kit 0.3.0: list --json changed, push --json, error codes)
test("kit's JSON: data on exit 0; {error:{code,message}} on failure, an unknown code is error; no JSON, a missing kit, a timeout said apart", ({ common: C }) => {
  assert.deepEqual(C.kitJson({ code: 0, out: '{"kit":"0.3.0","items":[]}\n' }, "x"), { data: { kit: "0.3.0", items: [] } });
  assert.deepEqual(C.kitJson({ code: 1, out: '{"error": {"code": "not_init", "message": "還沒設定：先打  kit init <網址或資料夾>"}}\n', err: "kit：還沒設定" }, "x"),
    { error: { code: "not_init", message: "還沒設定：先打  kit init <網址或資料夾>" } });
  assert.equal(C.kitJson({ code: 1, out: '{"error": {"code": "brand_new", "message": "m"}}' }, "x").error.code, "error");
  assert.deepEqual(C.kitJson({ code: 0, out: "abc" }, "kit list --json").error, { code: "error", message: "kit list --json 的輸出讀不懂（kit 太舊？請打 kit self-update）" });
  assert.deepEqual(C.kitJson({ code: 2, out: "", err: "kit: 壞了" }, "x").error, { code: "error", message: "壞了" });
  assert.deepEqual(C.kitJson({ code: 0, out: '{"error": {"code": "busy", "message": "b"}}' }, "x").error, { code: "busy", message: "b" });
  assert.equal(C.kitJson({ code: -1, out: "", err: "找不到 kit", missing: true }, "x").error.code, "missing");
  assert.equal(C.kitJson({ code: -1, out: "", err: "kit 沒在 60 秒內回應", timedOut: true }, "x").error.code, "timeout");
  for (const code of ["usage", "not_init", "busy", "no_source", "not_git", "check_failed", "no_git_identity", "author_not_allowed", "bad_push_mode",
    "no_origin", "no_remote", "not_on_branch", "out_of_sync", "host_not_allowed", "push_failed", "not_maintainer", "not_allowed", "download_failed", "no_skill", "error"])
    assert.ok(C.KIT_ERRORS.includes(code), code);
});
const TEAM = { name: "team", source: "https://git.example.org/acme/team", dir: "C:\\Users\\amy\\.agentkit\\team", push: "pr",
  changed: ["rules/security.md", "skills/quote/SKILL.md", "skills/quote/notes.md", "agents/reviewer.md"] };
const TEAM_LIST = { kit: "0.3.0", tools: ["claude"], kit_version_wanted: "", sources: [TEAM, { name: "mine", source: "/x", dir: "/x", push: "direct", changed: [] }],
  items: [{ kind: "rule", name: "security", status: "required", new: false, changed: true, source: "team", description: "", path: "C:\\Users\\amy\\.agentkit\\team\\rules\\security.md" },
    { kind: "skill", name: "quote", status: "used", new: false, changed: true, source: "team", description: "quotes", path: "C:\\Users\\amy\\.agentkit\\team\\skills\\quote\\SKILL.md" },
    { kind: "skill", name: "calm", status: "unused", new: true, changed: false, source: "mine", description: "", path: "/x/skills/calm/SKILL.md" },
    { kind: "agent", name: "reviewer", status: "agent", new: false, changed: true, source: "team", description: "", path: "C:\\Users\\amy\\.agentkit\\team\\agents\\reviewer.md" }] };
test("repository: what is unsent comes from kit list --json (sources[].changed, items[].changed); git is never run", async (M) => {
  fresh(); fakeKit({ list: TEAM_LIST }); H.window = { platform: "windows" };
  const v = view(M, { role: "repo" }); await settle(); await tick();
  const d = H.store["kit.data.v2"];
  assert.deepEqual(d.dirty, [{ name: "team", push: "pr", items: 3, agents: 1 }]);
  assert.deepEqual(d.items.map((i) => [i.name, i.changed, i.rel]), [["security", true, "rules/security.md"], ["quote", true, "skills/quote/SKILL.md"], ["calm", false, "skills/calm/SKILL.md"]]);
  const shown = render(v);
  assert.match(shown, /有改動還沒送出/); assert.match(shown, /team：security、quote、agent 1 個（4 個檔案）/);
  assert.equal(H.calls.filter((c) => c.argv[0] === "git").length, 0, "no git status of our own");
  for (const f of readdirSync(MOD).filter((f) => f.endsWith(".js"))) {
    const src = readFileSync(join(MOD, f), "utf8");
    assert.doesNotMatch(src, /exec\("git"|ITEM_FILE|sendList|沒有要送的\/|\/PR\||\/kit init\//, f);
  }
});
test("repository: kit's errors by code: not_init says kit init; another code shows kit's words", async (M) => {
  fresh(); fakeKit({ list: kitError("not_init", "還沒設定：先打  kit init <網址或資料夾>") });
  let v = view(M, { role: "repo" }); await settle(); await tick();
  let shown = render(v);
  assert.match(shown, /kit 出錯了/); assert.match(shown, /還沒設定/); assert.match(shown, /第一次用要先在終端機打  kit init/);
  fresh(); fakeKit({ list: kitError("busy", "另一個 kit 正在跑，等一下再試（會提到 kit init 也不算）") });
  v = view(M, { role: "repo" }); await settle(); await tick();
  shown = render(v);
  assert.match(shown, /另一個 kit 正在跑/); assert.doesNotMatch(shown, /第一次用要先/);
});
test("送出: kit push --dry-run --json lists the files; 確定送出 checks the list again (as JSON), then kit push --json; a PR says where the files went", async (M) => {
  const dry = { source: "team", dir: "/s/team", push: "pr", dry_run: true, files: ["rules/security.md", "skills/quote/SKILL.md"], skipped: ["notes.txt"],
    commit: "kit: update rule:security, skill:quote", branch: "kit/security-quote-20261113", into: "main", remotes: ["origin"], sent: false, pr_url: null, compare_url: null };
  let files = dry.files, pushed = 0;
  const say = "kit：要送的檔案（team）：\n  rules/security.md\n  skills/quote/SKILL.md\nkit：分支：kit/security-quote-20261113（PR 到 main）\n";
  fresh(); fakeKit({ list: { ...TEAM_LIST, sources: [TEAM] }, push: (a) => {
    if (a.includes("--dry-run")) return { code: 0, stdout: `${JSON.stringify({ ...dry, files })}\n`, stderr: say };
    pushed++;
    return { code: 0, stdout: `${JSON.stringify({ ...dry, files, dry_run: false, sent: true, pr_url: "https://git.example.org/acme/team/pulls/7" })}\n`, stderr: "kit：已送出分支 kit/security-quote-20261113\n" };
  } });
  const v = view(M, { role: "repo" }); await settle(); await tick();
  render(v); H.clicks.push({}, cx); await settle();
  const runs = kitCalls("push");
  assert.deepEqual(runs[0].argv.slice(1), ["push", "--to", "team", "--dry-run", "--json"]);
  let shown = render(v);
  assert.match(shown, /送出前看一下/); assert.match(shown, /rules\/security\.md/); assert.match(shown, /確定送出/);
  // someone saved meanwhile: the second dry run lists other files: nothing sent
  files = [...dry.files, "mcp/x.yaml"];
  H.clicks["push-team"]({}, cx); await settle();
  assert.equal(pushed, 0); assert.match(render(v), /跟剛才列的不一樣了/);
  // the same list twice: sent
  render(v); H.clicks["push-team"]({}, cx); await settle();
  assert.equal(pushed, 1);
  assert.deepEqual(kitCalls("push").at(-1).argv.slice(1), ["push", "--to", "team", "--json"]);
  shown = render(v);
  assert.match(shown, /已送出分支/); assert.match(shown, /pulls\/7/); assert.match(shown, /改的檔案現在在送出的分支上/);
});
test("送出: nothing to send (files []) has no 確定送出; a failure shows kit's words (stderr), not the JSON", async (M) => {
  fresh(); fakeKit({ list: { ...TEAM_LIST, sources: [TEAM] }, push: () => ({ code: 0, stdout: `${JSON.stringify({ source: "team", dir: "/s", push: "pr", dry_run: true,
    files: [], skipped: ["notes.txt"], commit: null, branch: null, into: null, remotes: [], sent: false, pr_url: null, compare_url: null })}\n`, stderr: "kit：沒有要送的（team 裡沒有改過的 rule、skill、mcp、agent）\n" }) });
  let v = view(M, { role: "repo" }); await settle(); await tick();
  render(v); H.clicks.push({}, cx); await settle();
  let shown = render(v);
  assert.match(shown, /沒有要送的/); assert.ok(!("push-team" in H.clicks), "no 確定送出");
  fresh(); fakeKit({ list: { ...TEAM_LIST, sources: [TEAM] }, push: () => kitError("check_failed", "kit check 有問題，什麼都沒送（改好再 kit push）") });
  v = view(M, { role: "repo" }); await settle(); await tick();
  render(v); H.clicks.push({}, cx); await settle();
  shown = render(v);
  assert.match(shown, /kit check 有問題/); assert.doesNotMatch(shown, /"error"/); assert.ok(!("push-team" in H.clicks));
});
test("下載看看: kit collect --look's JSON is shown; its error JSON shows kit's words", async (M) => {
  const look = { url: "https://git.example.org/a/r@abc", source: "mine", id: "git.example.org/a", allowed: true, can_allow: false,
    skills: [{ name: "pdf", path: "skills/pdf", description: "PDFs", license: "MIT", scripts: "", skipped: 0, valid: true, exists: "", dest: "/x/skills/pdf/SKILL.md" }] };
  let answer = { code: 0, stdout: `${JSON.stringify(look)}\n`, stderr: "kit：下載中…\n" };
  fresh(); fakeKit({ list: TEAM_LIST });
  const base = H.answer;
  H.answer = (argv) => (argv[1] === "collect" ? answer : base(argv));
  const v = view(M, { role: "repo" }); await settle(); await tick();
  render(v); H.clicks.new({}, cx); render(v); H.clicks["mode-collect"]({}, cx);
  v.part.newUrl.set_value("https://git.example.org/a/r");
  render(v); H.clicks.look({}, cx); await settle();
  assert.match(render(v), /授權：MIT/);
  answer = kitError("not_allowed", "git.example.org/a 不在 collect_sources");
  render(v); H.clicks.look({}, cx); await settle();
  const shown = render(v);
  assert.match(shown, /不在 collect_sources/); assert.doesNotMatch(shown, /"error"/);
});

// ---------- an agent in a space (place.js, agents.js): kit place, then a tab there ----------
const AGENTS = { kit: "0.5.0", tools: ["claude", "codex"], available: {}, agents: [{ name: "reviewer", description: "看 PR", rules: [], skills: [], mcp: [], source: "team", path: "/s/agents/reviewer.md" }] };
const PLACED = (dir, command = ["claude"], warnings = []) => ({ code: 0, stdout: `${JSON.stringify({ dir, agent: "reviewer", tool: command[0], command, warnings })}\n`, stderr: "" });
// a fake kit that also answers kit place (answer(args) -> an answer, or null for the usual)
function placeKit(answer) {
  fakeKit({ api: "1.3", agents: AGENTS });
  const base = H.answer;
  H.answer = (argv, on) => { const a = argv[0] === "sh" ? argv.slice(4) : argv.slice(1); return (a[0] === "place" && answer(a, on)) || base(argv, on); };
}
// a newer Herdr: nextDrop hands out these drops, then stops (as when the panel closes: the loop ends)
function dropping(drops) {
  const q = [...drops];
  globalThis.__stubs.nextDrop = async () => { if (!q.length) throw new Error("closed"); return q.shift(); };
}
test("place: what a card carries, what a drop is read as; the folder kit place makes, written as that machine writes paths", ({ place: P }) => {
  assert.equal(P.dragPayload({ name: "reviewer", source: "team" }, "codex"), '{"agent":"reviewer","source":"team","tool":"codex"}');
  assert.deepEqual(P.readPayload(P.dragPayload({ name: "reviewer" })), { agent: "reviewer", tool: "claude" });
  assert.deepEqual(P.readPayload('{"agent":"a-1","tool":"vim"}'), { agent: "a-1", tool: "claude" });
  for (const bad of ["x", "", null, '{"agent":"../x"}', '{"agent":"Big"}', '{"name":"a"}', "[1]"]) assert.equal(P.readPayload(bad), null, String(bad));
  fresh();
  assert.equal(P.placeDir({ folder: "/Users/amy/work/" }, "reviewer"), "/Users/amy/work/reviewer");
  assert.equal(P.placeDir({ folder: "" }, "reviewer"), "/Users/amy/reviewer", "no folder: this computer's home");
  assert.equal(P.placeDir({ folder: "", machine: "box" }, "reviewer"), "reviewer", "another machine's home: kit starts there");
  assert.equal(P.placeDir({ folder: "/home/amy/p", machine: "box" }, "reviewer"), "/home/amy/p/reviewer");
  assert.equal(P.placeDir({ folder: "C:\\work\\", machine: "winbox" }, "reviewer"), "C:\\work\\reviewer");
  assert.equal(P.placeDir({ folder: "D:/x y", machine: "winbox" }, "reviewer"), "D:\\x y\\reviewer");
  H.window = { platform: "windows" }; H.home = "C:\\Users\\amy";
  assert.equal(P.placeDir({ folder: "C:/w" }, "reviewer"), "C:\\w\\reviewer");
  assert.equal(P.placeDir({ folder: "" }, "reviewer"), "C:\\Users\\amy\\reviewer");
  H.home = "/Users/amy";
});
test("agents, a newer Herdr: cards are draggable (payload, its name as the label), no 放到 space… button; a drop runs kit place on the space's machine, then tab.new there with kit's command", async (M) => {
  fresh();
  const space = { id: "box/s2", machine: "box", name: "proj", folder: "/home/amy/proj" };
  dropping([{ payload: "not one of ours", space }, { payload: M.place.dragPayload({ name: "reviewer", source: "team" }, "codex"), space }]);
  placeKit(() => PLACED("/home/amy/proj/reviewer", ["codex"], ["Codex 不能只開某些內建工具：tools.only 不套用"]));
  const v = view(M, { role: "agents" }); await settle(); await tick();
  const place = kitCalls("place");
  assert.equal(place.length, 1, "the payload that isn't an agent card does nothing");
  assert.deepEqual(place[0].argv.slice(-6), ["place", "reviewer", "/home/amy/proj/reviewer", "--tool", "codex", "--json"]);
  assert.equal(place[0].on, "box");
  assert.deepEqual(H.runs.filter((r) => r[0] === "tab.new"), [["tab.new", { name: "reviewer", space: "box/s2", folder: "/home/amy/proj/reviewer", argv: ["codex"], icon: logoPath(M, "reviewer") }]]);
  assert.ok(H.writes.some(([p]) => p === `/Users/amy/.config/herdr-app/${logoPath(M, "reviewer")}`), "its logo's SVG is written first");
  const done = H.notes.at(-1);
  assert.equal(done.level, "success"); assert.match(done.title, /reviewer 放到 proj 了/); assert.match(done.body, /⚠ Codex 不能只開/);
  assert.equal(H.notes[0].level, "info", "progress first");
  assert.equal(H.store["kit.busy"] ?? null, null, "the lock is given back");
  render(v);
  assert.deepEqual(H.drags.map((d) => d.slice(1)), [['{"agent":"reviewer","source":"team","tool":"claude"}', "reviewer"]], "one card, its payload and label");
  assert.match(render(v), /拖到 Agents 或 Spaces 面板的 space 上/);
  assert.doesNotMatch(render(v), /放到 space…/, "dragging says where: no 放到 space… button");
});
test("bots: a tab's icon is the logo cropped to a square just around the drawing (as big as the programs' icons); the page's logo keeps its room", ({ bots: B }) => {
  const box = (svg) => /viewBox="([^"]+)"/.exec(svg)[1].split(" ").map(Number);
  const b = { animal: "bear", color: null };
  assert.deepEqual(box(B.botSvg(b)), [0, 0, 128, 128]);
  const [x, y, w, h] = box(B.botSvg(b, true));
  assert.equal(w, h, "square");
  assert.ok(w < 110 && w > 60, `about the drawing: ${w}`);
  const pts = [...B.botSvg(b, true).matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(pts.every(([px, py]) => px >= x - 0.2 && px <= x + w + 0.2 && py >= y - 0.2 && py <= y + h + 0.2), "all of it inside");
  assert.equal(B.botSvg(b, true).replace(/viewBox="[^"]+"/, ""), B.botSvg(b).replace(/viewBox="[^"]+"/, ""), "the same drawing");
});
test("place: the tab's own icon is the agent's logo; an older Herdr that doesn't know icon opens it without; other errors stay", ({ place: P }) => {
  fresh();
  P.openTab({ name: "a", space: "s1" }, "data/kit/bots/v2/fox.svg");
  assert.deepEqual(H.runs, [["tab.new", { name: "a", space: "s1", icon: "data/kit/bots/v2/fox.svg" }]]);
  fresh();
  H.runFail = (_n, a) => (a.icon ? new Error("tab.new: unknown argument(s): icon; valid arguments: name, space, folder, argv, task, mod, props") : null);
  P.openTab({ name: "a", space: "s1" }, "data/kit/bots/v2/fox.svg");
  assert.deepEqual(H.runs.map((r) => r[1]), [{ name: "a", space: "s1", icon: "data/kit/bots/v2/fox.svg" }, { name: "a", space: "s1" }]);
  fresh();
  H.runFail = () => new Error("no space \"s9\"");
  assert.throws(() => P.openTab({ name: "a", space: "s9" }, "data/kit/bots/v2/fox.svg"), /no space/);
  assert.equal(H.runs.length, 1, "not tried again: icon wasn't the trouble");
  fresh();
  P.openTab({ name: "a", space: "s1" }, null);
  assert.deepEqual(H.runs, [["tab.new", { name: "a", space: "s1" }]], "no logo: no icon");
  H.runFail = null;
});
test("place: one of each agent per space: dropped again where it already runs, its tab is shown, no kit place, no new tab, no toast", async (M) => {
  const P = M.place;
  fresh();
  const s1 = { id: "s1", machine: null, name: "web", folder: "/Users/amy/web" };
  H.agents = [{ address: "t9", space: "s1", tab: "tb9" }, { address: "t8", space: "s2", tab: "tb8" }];
  H.terminals = [{ address: "t9", cwd: "/Users/amy/web/reviewer" }, { address: "t8", cwd: "/Users/amy/web/reviewer" }];
  assert.deepEqual(P.openHere(s1, "/Users/amy/web/reviewer"), { tab: "tb9", address: "t9" });
  assert.equal(P.openHere(s1, "/Users/amy/web/writer"), null, "another agent's folder");
  assert.equal(P.openHere({ ...s1, id: "s3" }, "/Users/amy/web/reviewer"), null, "another space");
  H.terminals = [{ address: "t9", cwd: "/Users/amy/web/reviewer/src" }];
  assert.ok(P.openHere(s1, "/Users/amy/web/reviewer"), "under its folder counts");
  H.terminals = [{ address: "t9", cwd: "/Users/amy/web/reviewer2" }];
  assert.equal(P.openHere(s1, "/Users/amy/web/reviewer"), null, "a folder that only starts the same doesn't");
  H.agents = [{ address: "w/t1", space: "w/s1", tab: "w/tb1" }]; H.terminals = [{ address: "w/t1", cwd: "C:\\Src\\Reviewer" }];
  assert.ok(P.openHere({ id: "w/s1", machine: "w" }, "C:\\src\\reviewer"), "Windows paths: either slash, any case");
  H.agents = [{ address: "b/t1", space: "b/s1", tab: "b/tb1" }]; H.terminals = [{ address: "b/t1", cwd: "/home/amy/reviewer" }];
  assert.ok(P.openHere({ id: "b/s1", machine: "b", folder: "" }, "reviewer"), "a remote space without a folder: the agent's name");
  // through placeAgent: shown, nothing else
  H.agents = [{ address: "t9", space: "s1", tab: "tb9" }]; H.terminals = [{ address: "t9", cwd: "/Users/amy/web/reviewer" }];
  assert.equal(P.placeAgent("reviewer", s1, "claude", cx), true);
  await settle();
  assert.deepEqual(H.runs, [["tab.select", { id: "tb9" }]]);
  assert.equal(kitCalls("place").length, 0); assert.deepEqual(H.notes, []);
  assert.match(H.store["kit.agents.msg"].text, /reviewer 已經在 web 開著了（t9）/);
  assert.equal(H.store["kit.busy"] ?? null, null, "no lock taken");
  // with a first message (the Gerrit panel's question): it goes to the one already there
  H.runs = [];
  H.hcAnswer = (a) => (a[0] === "send" ? { code: 0, stdout: "", stderr: "" } : null);
  assert.equal(P.placeAgent("reviewer", s1, "claude", cx, "Gerrit 面板", {}, "/gerrit-review 7"), true);
  await settle();
  assert.deepEqual(H.calls.filter((c) => c.argv[1] === "send").map((c) => c.argv), [["hc", "send", "t9", "/gerrit-review 7"]]);
  assert.deepEqual(H.notes, [], "sent: nothing to say");
});
test("place: while dragging, the spaces where that agent already runs are refused (ids one per line, and the chip's text there)", async (M) => {
  const P = M.place;
  fresh();
  H.spaces = [{ id: "s1", name: "web", folder: "/Users/amy/web" }, { id: "s2", name: "api", folder: "/Users/amy/api" },
    { id: "b/s3", machine: "b", name: "ops", folder: "/home/amy/ops" }];
  H.agents = [{ address: "t9", space: "s1", tab: "tb9" }, { address: "b/t2", space: "b/s3", tab: "b/tb2" }, { address: "t7", space: "s2", tab: "tb7" }];
  H.terminals = [{ address: "t9", cwd: "/Users/amy/web/reviewer" }, { address: "b/t2", cwd: "/home/amy/ops/reviewer/src" },
    { address: "t7", cwd: "/Users/amy/api/writer" }];
  assert.deepEqual(P.openSpaces("reviewer"), ["s1", "b/s3"], "where it runs; another agent's folder doesn't count");
  assert.deepEqual(P.openSpaces("tester"), []);
  dropping([]);   // a newer Herdr
  const el = (args) => ({ on_drag: (...a) => { args.push(a); return "dragged"; } });
  let got = [];
  assert.equal(P.draggable(el(got), { name: "reviewer", source: "team" }, "claude"), "dragged");
  assert.deepEqual(got, [['{"agent":"reviewer","source":"team","tool":"claude"}', "reviewer", "s1\nb/s3", "reviewer 已經在這個 space 開著了"]]);
  got = [];
  P.draggable(el(got), { name: "tester" }, "claude");
  assert.deepEqual(got, [['{"agent":"tester","source":"","tool":"claude"}', "tester"]], "nowhere yet: payload and label only");
});
test("agents: dropped at a place among the space's tabs (a newer Herdr's index), the new tab is moved there; without one it stays last", async (M) => {
  for (const [index, moves] of [[2, [["tab.move", { id: "tb7", index: 2 }]]], [null, []]]) {
    fresh();
    const space = { id: "s1", machine: null, name: "web", folder: "/Users/amy/web", index: 4 };
    H.runAnswer = (n) => (n === "tab.new" ? { space: "s1", tab: "tb7", terminal: "t7" } : null);
    dropping([{ payload: M.place.dragPayload({ name: "reviewer" }), space, index }]);
    placeKit(() => PLACED("/Users/amy/web/reviewer", ["claude"], []));
    view(M, { role: "agents" }); await settle(); await tick();
    assert.equal(H.runs[0][0], "tab.new");
    assert.deepEqual(H.runs.slice(1), moves, "the space's own index (its place among spaces) isn't the tab's");
  }
});
test("agents: a drop kit refuses (another agent's folder, an older kit): said in plain words, no tab opened", async (M) => {
  const space = { id: "s1", machine: null, name: "web", folder: "/Users/amy/web" };
  for (const [answer, want] of [[kitError("other_agent", "/Users/amy/web/reviewer 已經是 agent writer 的資料夾"), /另一個 agent 的資料夾[\s\S]*agent writer/],
    [kitError("not_empty", "x"), /不是 kit 放的/], [{ code: 1, stdout: "", stderr: "kit: 沒有這個指令：place（打 kit help）\n" }, /kit 太舊，沒有 kit place：要 kit 0\.5\.0/]]) {
    fresh();
    dropping([{ payload: M.place.dragPayload({ name: "reviewer" }), space }]);
    placeKit(() => answer);
    view(M, { role: "agents" }); await settle();
    assert.equal(kitCalls("place")[0].on, null);
    assert.equal(kitCalls("place")[0].argv.at(-4), "/Users/amy/web/reviewer");
    assert.equal(H.runs.filter((r) => r[0] === "tab.new").length, 0);
    const n = H.notes.at(-1);
    assert.equal(n.level, "error"); assert.match(n.body, want);
  }
});
test("agents, an older Herdr (no nextDrop): nothing draggable, no drop loop; 放到 space… lists the spaces, a click places it there", async (M) => {
  fresh();
  H.spaces = [{ id: "s1", name: "web", machine: null, folder: "/Users/amy/web" }, { id: "w/s3", name: "win", machine: "winbox", folder: "C:\\src" }];
  placeKit((a) => PLACED(a[2]));
  const v = view(M, { role: "agents" }); await settle(); await tick();
  let shown = render(v);
  assert.deepEqual(H.drags, []);
  assert.match(shown, /按「放到 space…」/); assert.doesNotMatch(shown, /拖到/);
  H.clicks["place-reviewer"]({}, cx);
  shown = render(v);
  assert.match(shown, /web/); assert.match(shown, /winbox · C:\\src\\reviewer/);
  H.clicks["place-reviewer-w/s3"]({}, cx); await settle();
  const c = kitCalls("place");
  assert.equal(c.length, 1); assert.equal(c[0].on, "winbox"); assert.ok(c[0].argv.includes("C:\\src\\reviewer"));
  assert.deepEqual(H.runs.find((r) => r[0] === "tab.new")[1], { name: "reviewer", space: "w/s3", folder: "C:\\src\\reviewer", argv: ["claude"], icon: logoPath(M, "reviewer") });
  assert.ok(!ids(v).includes("place-reviewer-s1"), "the picker closes");
  render(v); H.clicks["place-reviewer"]({}, cx); render(v); H.clicks["place-cancel-reviewer"]({}, cx);
  assert.ok(!ids(v).includes("place-reviewer-s1"));
});
// a kit place that answers only when the test says (release), or never: the task waits on it as long as it likes
function slowPlace() {
  const s = { release: null };
  placeKit((a) => new Promise((r) => { s.release = () => r(PLACED(a[2])); }));
  return s;
}
const runTimers = async () => { for (const f of [...timers]) f(cx); await new Promise((r) => setTimeout(r, 20)); };
test("agents: the panel closed while kit place runs (the task cancelled, no finally): its close gives the lock back and says the tab wasn't opened", async (M) => {
  fresh();
  H.spaces = [{ id: "s1", name: "web", machine: null, folder: "/Users/amy/web" }];
  placeKit(() => never());
  const v = view(M, { role: "agents" }); await settle(); await tick();
  render(v); H.clicks["place-reviewer"]({}, cx); render(v); H.clicks["place-reviewer-s1"]({}, cx);
  await cancelTasks();
  assert.equal(kitCalls("place").length, 1);
  assert.equal(H.store["kit.busy"].label, "放 reviewer");
  assert.ok(v.part.mine, "its lock id kept by the copy");
  await v.close(cx);
  assert.equal(H.store["kit.busy"] ?? null, null, "not grey for 3 minutes");
  assert.equal(H.store["kit.agents.msg"].text, M.place.CLOSED_TEXT);
  assert.equal(H.store["kit.agents.msg"].ok, false);
  assert.equal(H.notes.at(-1).level, "error"); assert.equal(H.notes.at(-1).body, "視窗關了，分頁沒開：再放一次（kit place 可以重跑）");
  assert.equal(H.runs.filter((r) => r[0] === "tab.new").length, 0);
});
test("agents window: a place is handed to the tab-bar button, so closing the window doesn't cancel it; no button: the window runs it itself; closed before anyone took it: said", async (M) => {
  fresh();
  const space = { id: "s1", name: "web", machine: null, folder: "/Users/amy/web" };
  H.spaces = [space];
  let s = slowPlace();
  const button = view(M, { role: "agents-toggle" });
  const win = view(M, { role: "agents", overlay: "o1" }); await settle(); await tick();
  render(win); H.clicks["place-reviewer"]({}, cx); render(win); H.clicks["place-reviewer-s1"]({}, cx);
  assert.equal(kitCalls("place").length, 0, "handed over, not run in the window");
  assert.equal(H.store["kit.place.ask"].length, 1);
  await runTimers();   // the button takes it
  assert.equal(kitCalls("place").length, 1); assert.deepEqual(H.store["kit.place.ask"], []);
  assert.equal(win.part.mine ?? null, null); assert.ok(button.part.mine, "the button holds the lock");
  await win.close(cx);
  assert.equal(H.store["kit.agents.msg"] ?? null, null, "nothing to say: the button has it");
  assert.equal(H.store["kit.busy"].label, "放 reviewer");
  s.release(); await settle();
  assert.deepEqual(H.runs.find((r) => r[0] === "tab.new")[1], { name: "reviewer", space: "s1", folder: "/Users/amy/web/reviewer", argv: ["claude"], icon: logoPath(M, "reviewer") });
  assert.equal(H.store["kit.busy"] ?? null, null);
  assert.match(H.store["kit.agents.msg"].text, /在 \/Users\/amy\/web\/reviewer 開了 reviewer/);
  H.afters.splice(0).forEach((f) => f(cx)); await settle();
  assert.equal(kitCalls("place").length, 1, "the window's fallback finds it taken");
  // the button closed while it runs it: the same as any copy
  fresh(); H.spaces = [space]; placeKit(() => never());
  const b2 = view(M, { role: "agents-toggle" });
  const w2 = view(M, { role: "agents", overlay: "o1" }); await settle(); await tick();
  render(w2); H.clicks["place-reviewer"]({}, cx); render(w2); H.clicks["place-reviewer-s1"]({}, cx);
  await runTimers(); await cancelTasks();
  await b2.close(cx);
  assert.equal(H.store["kit.busy"] ?? null, null); assert.equal(H.store["kit.agents.msg"].text, M.place.CLOSED_TEXT);
  // no button (a layout without it): after ASK_WAIT the window runs it itself
  fresh(); H.spaces = [space]; placeKit((a) => PLACED(a[2]));
  const w3 = view(M, { role: "agents", overlay: "o1" }); await settle(); await tick();
  render(w3); H.clicks["place-reviewer"]({}, cx); render(w3); H.clicks["place-reviewer-s1"]({}, cx);
  assert.equal(kitCalls("place").length, 0);
  H.afters.splice(0).forEach((f) => f(cx)); await settle();
  assert.equal(kitCalls("place").length, 1); assert.equal(H.runs.filter((r) => r[0] === "tab.new").length, 1);
  assert.deepEqual(H.store["kit.place.ask"], []);
  // closed before anyone took it: taken back, said
  fresh(); H.spaces = [space]; placeKit((a) => PLACED(a[2]));
  const w4 = view(M, { role: "agents", overlay: "o1" }); await settle(); await tick();
  render(w4); H.clicks["place-reviewer"]({}, cx); render(w4); H.clicks["place-reviewer-s1"]({}, cx);
  await w4.close(cx);
  assert.deepEqual(H.store["kit.place.ask"], []); assert.equal(H.store["kit.agents.msg"].text, M.place.CLOSED_TEXT);
  const late = view(M, { role: "agents-toggle" }); await runTimers();
  assert.equal(kitCalls("place").length, 0, "nobody runs it later");
  // an ask too old (Herdr quit before anyone took it) is dropped, never run
  H.store["kit.place.ask"] = [{ id: "x", agent: "reviewer", space, tool: "claude", label: "放到 space", at: Date.now() - M.place.ASK_OLD - 1 }];
  await runTimers();
  assert.equal(kitCalls("place").length, 0); assert.deepEqual(H.store["kit.place.ask"], []);
  void late;
});
test("another mod's place ask (the Gerrit panel's) with a first message: the tab-bar button runs it, tab.new carries it as task", async (M) => {
  fresh();
  const space = { id: "s1", name: "web", machine: null, folder: "/Users/amy/web" };
  H.spaces = [space]; placeKit((a) => PLACED(a[2]));
  view(M, { role: "agents-toggle" }); await settle(); await tick();
  H.store["kit.place.ask"] = [{ id: "g1", agent: "gerrit", space, tool: "claude", label: "Gerrit 面板", at: Date.now(), task: "/gerrit-review 7 2 https://g/c/p/+/7" }];
  await runTimers(); await settle();
  assert.equal(kitCalls("place")[0].argv.at(-5), "gerrit");
  assert.deepEqual(H.runs.find((r) => r[0] === "tab.new")[1],
    { name: "gerrit", space: "s1", folder: "/Users/amy/web/gerrit", argv: ["claude"], task: "/gerrit-review 7 2 https://g/c/p/+/7", icon: logoPath(M, "gerrit") });
  assert.deepEqual(H.store["kit.place.ask"], []);
});
test("FEATURES: kit 0.5.0 (api 1.3) adds 貼上 MCP 設定, 各機器的核准和來源, 把 agent 放到 space", ({ machines: X }) => {
  assert.deepEqual(X.FEATURES.filter((f) => f.api === "1.3").map((f) => [f.name, f.kit]),
    [["貼上 MCP 設定", "0.5.0"], ["各機器的核准和來源", "0.5.0"], ["把 agent 放到 space", "0.5.0"]]);
  assert.deepEqual(X.missing({ api: "1.2" }, { api: [1, 3] }).lacks.map((f) => f.name), ["貼上 MCP 設定", "各機器的核准和來源", "把 agent 放到 space"]);
});

// ---------- 倉庫 → MCP → ＋ 新增 → 貼上設定 (kit new mcp --config <file>) ----------
const PASTE = '{"mcpServers": {"github": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_secret123"}}}}';
const LOOK = { name: "github", source: "team", path: "/x/mcp/github.yaml", exists: false, type: "stdio",
  yaml: "command: npx\nargs: [-y, \"@modelcontextprotocol/server-github@2025.4.8\"]\nenv:\n  GITHUB_PERSONAL_ACCESS_TOKEN: ${GITHUB_PERSONAL_ACCESS_TOKEN}\n",
  secrets: [{ where: "env.GITHUB_PERSONAL_ACCESS_TOKEN", var: "GITHUB_PERSONAL_ACCESS_TOKEN" }], vars: ["GITHUB_PERSONAL_ACCESS_TOKEN"], requires: ["node"],
  packages: [{ kind: "npm", package: "@modelcontextprotocol/server-github", version: "2025.4.8", bad: "" }], warnings: ["略過了 timeout"] };
const MCP_LIST = { ...TEAM_LIST, kit: "0.5.0", items: [...TEAM_LIST.items, { kind: "mcp", name: "github", status: "unused", new: true, changed: true, source: "team", description: "", path: "/x/mcp/github.yaml" }] };
async function pastePanel(M, newAnswer, { api = "1.3" } = {}) {
  fresh(); fakeKit({ api, list: MCP_LIST }); H.files = { "/x/mcp/github.yaml": LOOK.yaml };
  const base = H.answer;
  H.answer = (argv, on) => (argv[1] === "new" ? newAnswer(argv.slice(1)) : base(argv, on));
  const v = view(M, { role: "repo" }); await settle(); await tick();
  render(v); H.clicks["tab-mcp"]({}, cx); render(v); H.clicks.new({}, cx); render(v); H.clicks["mode-paste"]({}, cx);
  return v;
}
const FILE = "/Users/amy/.config/herdr-app/kit-tmp/mcp-paste.txt";
test("MCP 貼上設定: the paste goes to kit in a file under the app's home (never an argument), blanked right after; --look shows the yaml, the variable names, the pinned package, needs, warnings", async (M) => {
  const asked = [];
  const v = await pastePanel(M, (a) => { asked.push([...a, H.files[FILE]]); return { code: 0, stdout: `${JSON.stringify(LOOK)}\n`, stderr: "" }; });
  render(v); H.clicks["paste-look"]({}, cx); await settle();
  assert.equal(kitCalls("new").length, 0, "nothing pasted: kit isn't asked");
  assert.match(render(v), /先把設定貼在上面的框裡/);
  v.part.pasteCode().set_value(PASTE);
  render(v); H.clicks["paste-look"]({}, cx); await settle();
  assert.deepEqual(asked, [["new", "mcp", "--config", FILE, "--to", "team", "--look", PASTE]], "kit read the paste from the file while it ran");
  for (const c of H.calls) assert.ok(!c.argv.some((x) => String(x).includes("ghp_secret123") || String(x).includes("mcpServers")), "never an argument");
  assert.deepEqual(H.writes.filter((w) => w[0] === FILE), [[FILE, PASTE, null], [FILE, "", PASTE]], "written (a new file: it must not be there), then blanked");
  const shown = render(v);
  assert.match(shown, /GITHUB_PERSONAL_ACCESS_TOKEN: \$\{GITHUB_PERSONAL_ACCESS_TOKEN\}/);
  assert.match(shown, /每台電腦要先設定環境變數（只有名字，值各自設）：GITHUB_PERSONAL_ACCESS_TOKEN/);
  assert.match(shown, /套件 @modelcontextprotocol\/server-github 固定在 2025\.4\.8 版/);
  assert.match(shown, /它要的程式：node/); assert.match(shown, /⚠ 略過了 timeout/);
  assert.match(shown, /kit install-deps mcp github/); assert.match(shown, /送出/);
  assert.doesNotMatch(shown, /ghp_secret123/);
  assert.ok(ids(v).includes("paste-make"));
});
test("MCP 貼上設定: 建立 runs it without --look (the same paste and name), then opens the file; changed since: look again first", async (M) => {
  const asked = [];
  const v = await pastePanel(M, (a) => { asked.push(a); return a.includes("--look") ? { code: 0, stdout: `${JSON.stringify(LOOK)}\n`, stderr: "" } : { code: 0, stdout: "", stderr: "kit：已建立 mcp/github.yaml（在 team）\n" }; });
  v.part.pasteCode().set_value(PASTE);
  render(v); H.clicks["paste-look"]({}, cx); await settle();
  v.part.pasteCode().set_value(PASTE + " ");
  render(v); H.clicks["paste-make"]({}, cx); await settle();
  assert.equal(asked.length, 1, "changed after the look: not created");
  assert.match(render(v), /再按一次「看看會變成什麼」/);
  v.part.pasteCode().set_value(PASTE);
  render(v); H.clicks["paste-look"]({}, cx); await settle();
  render(v); H.clicks["paste-make"]({}, cx); await settle();
  assert.deepEqual(asked.at(-1), ["new", "mcp", "--config", FILE, "--to", "team"]);
  assert.deepEqual(H.writes.filter((w) => w[0] === FILE).at(-1), [FILE, "", PASTE]);
  assert.equal(v.part.making, null); assert.equal(v.part.pasteCode().value(), "", "the paste box is emptied");
  assert.ok(H.reads.some((r) => r[0] === "/x/mcp/github.yaml"), "the new file is opened");
  assert.match(H.store["kit.msg.repo"].text, /已建立 mcp:github（在 team）/);
});
test("MCP 貼上設定: several servers / a name not in it: pick one (re-looked with that name); bad_config, bad_name, exists in plain words; Windows: the file with \\", async (M) => {
  let answer = kitError("several_servers", "設定裡有好幾個 server，要寫名字：github、notion");
  answer.stdout = `${JSON.stringify({ error: { code: "several_servers", message: "設定裡有好幾個 server，要寫名字：github、notion", servers: ["github", "notion"] } })}\n`;
  const asked = [];
  const v = await pastePanel(M, (a) => { asked.push(a); return answer; });
  v.part.pasteCode().set_value(PASTE);
  render(v); H.clicks["paste-look"]({}, cx); await settle();
  assert.match(render(v), /有好幾個 server：點一個/);
  answer = { code: 0, stdout: `${JSON.stringify({ ...LOOK, name: "notion" })}\n`, stderr: "" };
  render(v); H.clicks["paste-server-notion"]({}, cx); await settle();
  assert.deepEqual(asked.at(-1), ["new", "mcp", "notion", "--config", FILE, "--to", "team", "--look"]);
  assert.equal(v.part.newName.value(), "notion");
  for (const [code, want] of [["bad_config", /kit 看不懂貼上的設定[^\n]*JSON 讀不懂/], ["bad_name", /只能用小寫英文/], ["no_name", /在上面寫一個名字/]]) {
    answer = kitError(code, code === "bad_config" ? "JSON 讀不懂（是不是少了括號、逗號或引號？）" : "m");
    render(v); H.clicks["paste-look"]({}, cx); await settle();
    assert.match(render(v), want, code);
  }
  answer = { code: 0, stdout: `${JSON.stringify({ ...LOOK, exists: true })}\n`, stderr: "" };
  render(v); H.clicks["paste-look"]({}, cx); await settle();
  assert.match(render(v), /已經有同名的/); assert.ok(!ids(v).includes("paste-make"), "exists: nothing to create");
  fresh();
  const w = await pastePanel(M, (a) => { asked.push(a); return { code: 0, stdout: `${JSON.stringify(LOOK)}\n`, stderr: "" }; });
  H.window = { platform: "windows" }; H.appHome = "C:\\Users\\amy\\AppData\\Roaming\\herdr-app\\";
  w.part.pasteCode().set_value(PASTE);
  render(w); H.clicks["paste-look"]({}, cx); await settle();
  assert.equal(asked.at(-1)[asked.at(-1).indexOf("--config") + 1], "C:\\Users\\amy\\AppData\\Roaming\\herdr-app\\kit-tmp\\mcp-paste.txt");
});
// a task Herdr cancels (its copy closed): what it awaits never settles, so neither does the rest of it (no finally)
const never = () => new Promise(() => {});
const cancelTasks = async () => { H.tasks.splice(0); await new Promise((r) => setTimeout(r, 20)); };
const shCalls = (re) => H.calls.filter((c) => c.argv[0] === "sh" && re.test(c.argv[2] ?? ""));
test("MCP 貼上設定: its folder made private first (Mac / Linux: umask 077, 0700, the file 0600); refused, nothing is written", async (M) => {
  const v = await pastePanel(M, () => ({ code: 0, stdout: `${JSON.stringify(LOOK)}\n`, stderr: "" }));
  v.part.pasteCode().set_value(PASTE);
  render(v); H.clicks["paste-look"]({}, cx); await settle();
  const [mk] = shCalls(/umask 077/);
  assert.ok(mk, "kit-tmp made by sh");
  assert.match(mk.argv[2], /umask 077 && mkdir -p "\$1" && chmod 700 "\$1" && touch "\$2" && chmod 600 "\$2"/);
  assert.deepEqual(mk.argv.slice(3), ["sh", "/Users/amy/.config/herdr-app/kit-tmp", FILE], "paths as arguments, never in the script");
  assert.ok(H.calls.indexOf(mk) < H.calls.findIndex((c) => c.argv[1] === "new"), "before kit runs");
  // sh refuses: the paste is not written, and kit isn't run
  const base = H.answer;
  H.answer = (argv, on) => (argv[0] === "sh" && /umask/.test(argv[2]) ? { code: 1, stdout: "", stderr: "chmod: Operation not permitted" } : base(argv, on));
  H.writes = []; const n = kitCalls("new").length;
  render(v); H.clicks["paste-look"]({}, cx); await settle();
  assert.deepEqual(H.writes.filter((w) => w[1] === PASTE), [], "not written");
  assert.equal(kitCalls("new").length, n);
  assert.match(render(v), /沒辦法設成只有自己能讀，貼上的設定沒寫進去[\s\S]*Operation not permitted/);
  // Windows: the profile is the user's already: no sh
  const w = await pastePanel(M, () => ({ code: 0, stdout: `${JSON.stringify(LOOK)}\n`, stderr: "" }));
  H.window = { platform: "windows" };
  w.part.pasteCode().set_value(PASTE);
  render(w); H.clicks["paste-look"]({}, cx); await settle();
  assert.equal(H.calls.filter((c) => c.argv[0] === "sh").length, 0);
  assert.ok(H.writes.some((x) => x[1] === PASTE));
});
test("MCP 貼上設定: the panel closed while kit reads the paste (the task cancelled, no finally): close() empties it (sh : >), blanks it over what it reads, gives the lock back", async (M) => {
  const v = await pastePanel(M, () => never());
  v.part.pasteCode().set_value(PASTE);
  render(v); H.clicks["paste-look"]({}, cx);
  await cancelTasks();
  assert.equal(H.files[FILE], PASTE, "kit has it");
  assert.equal(H.store["kit.busy"].label, "看設定");
  await v.close(cx);
  const [cut] = shCalls(/^: > "\$1"$/);
  assert.deepEqual(cut?.argv.slice(3), ["sh", FILE], "emptied by exec (at quit only exec is sure to run)");
  assert.deepEqual(H.writes.at(-1), [FILE, "", PASTE], "and blanked over what was read");
  assert.equal(H.files[FILE], "");
  assert.equal(H.store["kit.busy"] ?? null, null, "the lock given back");
  // 建立 cancelled the same way
  const w = await pastePanel(M, (a) => (a.includes("--look") ? { code: 0, stdout: `${JSON.stringify(LOOK)}\n`, stderr: "" } : never()));
  w.part.pasteCode().set_value(PASTE);
  render(w); H.clicks["paste-look"]({}, cx); await settle();
  render(w); H.clicks["paste-make"]({}, cx);
  await cancelTasks();
  assert.equal(H.files[FILE], PASTE);
  await w.close(cx);
  assert.equal(H.files[FILE], ""); assert.equal(H.store["kit.busy"] ?? null, null);
  // nothing in use: close leaves the file alone
  const u = await pastePanel(M, () => ({ code: 0, stdout: "{}", stderr: "" }));
  const n = H.writes.length, cuts = shCalls(/^: >/).length;
  await u.close(cx);
  assert.equal(H.writes.length, n); assert.equal(shCalls(/^: >/).length, cuts);
});
test("MCP 貼上設定: a paste left from a task that never finished (Herdr quit) is blanked when the panel starts, unless a paste is under way elsewhere", async (M) => {
  fresh(); fakeKit({ api: "1.3", list: MCP_LIST }); H.files = { [FILE]: PASTE };
  view(M, { role: "repo" }); await settle();
  assert.equal(H.files[FILE], ""); assert.deepEqual(H.writes, [[FILE, "", PASTE]]);
  fresh(); fakeKit({ api: "1.3", list: MCP_LIST }); H.files = { [FILE]: "" };
  view(M, { role: "repo" }); await settle();
  assert.deepEqual(H.writes, [], "blank already: nothing written");
  fresh(); fakeKit({ api: "1.3", list: MCP_LIST }); H.files = { [FILE]: PASTE };
  H.store["kit.busy"] = { label: "看設定", at: Date.now(), ttl: 120000, id: "other" };
  view(M, { role: "repo" }); await settle();
  assert.equal(H.files[FILE], PASTE, "another copy's kit is reading it");
  fresh(); fakeKit({ api: "1.3", list: MCP_LIST }); H.files = { [FILE]: PASTE };
  view(M, { role: "repo-toggle" }); view(M, { role: "editor" }); await settle();
  assert.equal(H.files[FILE], PASTE, "only the panel does it");
});
test("MCP 貼上設定: blanked over what the file holds now (a lone surrogate comes back as U+FFFD); a blank that fails is said, never swallowed", async (M) => {
  const v = await pastePanel(M, () => ({ code: 0, stdout: `${JSON.stringify(LOOK)}\n`, stderr: "" }));
  v.part.pasteCode().set_value(PASTE + "\uD800");
  render(v); H.clicks["paste-look"]({}, cx); await settle();
  assert.equal(H.files[FILE], "", "blank, though it didn't read back as written");
  assert.deepEqual(H.writes.at(-1), [FILE, "", PASTE + "�"]);
  assert.ok(!H.notes.some((n) => n.level === "error"));
  H.writeFail = (p, text) => p === FILE && text === "";
  render(v); H.clicks["paste-look"]({}, cx); await settle();
  const n = H.notes.at(-1);
  assert.equal(n.level, "error"); assert.match(n.body, /沒能從 \/Users\/amy\/\.config\/herdr-app\/kit-tmp\/mcp-paste\.txt 清掉（Permission denied[^）]*）：裡面可能有 token，請自己刪掉這個檔案/);
  assert.match(H.store["kit.msg.repo"].text, /請自己刪掉這個檔案/);
  assert.equal(H.store["kit.busy"] ?? null, null);
});
test("MCP 貼上設定: a server picked from the paste is shown as written there and sent as kit's name (MCP_DOCKER -> mcp-docker)", async (M) => {
  const R = M.repo;
  assert.deepEqual(["MCP_DOCKER", "github", "--My  Server--", "a.b_c", "ÉX", "数"].map(R.serverName), ["mcp-docker", "github", "my-server", "a-b-c", "x", "数"]);
  let answer = { code: 1, stdout: `${JSON.stringify({ error: { code: "several_servers", message: "m", servers: ["MCP_DOCKER", "notion"] } })}\n`, stderr: "" };
  const asked = [];
  const v = await pastePanel(M, (a) => { asked.push(a); return answer; });
  v.part.pasteCode().set_value(PASTE);
  render(v); H.clicks["paste-look"]({}, cx); await settle();
  assert.match(render(v), /MCP_DOCKER/);
  answer = { code: 0, stdout: `${JSON.stringify({ ...LOOK, name: "mcp-docker" })}\n`, stderr: "" };
  render(v); H.clicks["paste-server-MCP_DOCKER"]({}, cx); await settle();
  assert.deepEqual(asked.at(-1).slice(0, 3), ["new", "mcp", "mcp-docker"]);
  assert.equal(v.part.newName.value(), "mcp-docker");
});
test("MCP 貼上設定: an older kit (api 1.2) says kit self-update", async (M) => {
  const v = await pastePanel(M, () => ({ code: 1, stdout: "", stderr: "" }), { api: "1.2" });
  assert.match(render(v), /貼上設定要 kit 0\.5\.0 以上/);
});
test("agent popup: an MCP's unset variables (names only) and its package downloaded each start; 裝套件 → kit install-deps mcp <name>", async (M) => {
  fresh(); fakeKit();
  const target = { key: "|/x|t1", term: "t1", machine: null, cwd: "/x", title: "Claude Code" };
  H.store["kit.agent.data.v1"] = { [target.key]: { items: [{ kind: "mcp", name: "github", status: "used", type: "stdio",
    vars: [{ name: "GITHUB_TOKEN", set: false }, { name: "HOME_URL", set: true }], needs: [],
    packages: [{ kind: "npm", package: "@x/server", version: "1.2.3", ok: false, had: false, install: "npm install --ignore-scripts", bad: "" }] }], here: { items: [] } } };
  H.store["kit.agent.v1"] = { [target.key]: { started: Date.now(), at: Date.now() } };
  const v = view(M, { role: "agent", target }); await settle();
  const shown = render(v);
  assert.match(shown, /這台沒設環境變數：GITHUB_TOKEN（/); assert.doesNotMatch(shown, /HOME_URL/);
  assert.match(shown, /每次啟動時下載 @x\/server@1\.2\.3/);
  H.clicks["need-github-mcp"]({}, cx); render(v); H.clicks["need-go-github-mcp"]({}, cx); await settle();
  assert.deepEqual(kitCalls("install-deps").map((c) => c.argv.slice(-3)), [["install-deps", "mcp", "github"]]);
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
// ---------- 各機器 (machines.js) ----------
const SHA = (c) => c.repeat(40).slice(0, 40);
const STATUS = (o = {}) => ({ kit: "0.4.1", api: "1.2", user: "amy", at: Math.floor(Date.now() / 1000) - 720,
  self: { name: "agentkit", commit: SHA("a"), approved: null }, approvals: null,
  sources: [{ name: "team", source: "https://git.example.org/team", dir: "/x/team", commit: SHA("b"), approved: null }], ...o });
// kit on each machine ("" = this computer): { status } (kit status --json), else an older kit { kit, api }, or an Error
function fleet(by) {
  H.answer = (argv, on) => {
    const a = argv[0] === "sh" ? argv.slice(4) : argv.slice(1), m = by[on ?? ""];
    if (m instanceof Error) return m;
    if (!m) return new Error(`machine ${on} is not connected`);
    if (a[0] === "list") return { code: 0, stdout: JSON.stringify(KIT_LIST), stderr: "" };
    if (a[0] === "status") return m.status ? { code: 0, stdout: `${JSON.stringify(m.status)}\n`, stderr: "" }
      : { code: 1, stdout: "", stderr: "kit: 沒有這個指令：status（打 kit help）\n" };
    if (a[0] === "api") return { code: 0, stdout: `${m.status?.api ?? m.api}\n`, stderr: "" };
    if (a[0] === "--version") return { code: 0, stdout: `kit ${m.status?.kit ?? m.kit}\n`, stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
}
const SETTINGS = "/Users/amy/.config/herdr-app/kit-machines.json";
const machineRows = () => H.store["kit.machines.v1"]?.rows ?? [];
const rowOf = (key) => machineRows().find((r) => r.key === key);
// a repository panel with the 各機器 tab not yet opened; then open it
async function machinesPanel(M) {
  localStorage.setItem("kit.kind", "skill");
  const v = view(M, { role: "repo" }); await settle(); await tick();
  return { v, open: async () => { render(v); H.clicks["tab-machines"]({}, cx); await settle(); return render(v); } };
}
const machinesTest = (name, fn) => test(name, async (M) => { try { await fn(M); } finally { localStorage.setItem("kit.kind", "skill"); } });

machinesTest("各機器: plain values — api and kit versions compared, kit status JSON read field by field, report and settings files checked", ({ machines: X }) => {
  assert.deepEqual([X.apiOf("1.2"), X.apiOf("1"), X.apiOf(" 2.10\n"), X.apiOf("x"), X.apiOf(null)], [[1, 2], [1, 0], [2, 10], null, null]);
  assert.ok(X.verCmp("0.4.1", "0.4.0") > 0 && X.verCmp("0.10.0", "0.9.9") > 0 && X.verCmp("0.4", "0.4.0") === 0 && X.verCmp("dev", "0.1.0") < 0);
  const now = 1e12;
  assert.deepEqual([5e3, 12 * 6e4, 5 * 36e5, 3 * 864e5].map((d) => X.agoText(now - d, now)), ["剛剛", "12 分鐘前", "5 小時前", "3 天前"]);
  const s = X.readStatus({ ...STATUS({ at: 100, approvals: { serial: 7, used: 6, valid: true, extra: 1 } }), run: "rm -rf /", hosts: ["x"],
    sources: [{ name: "team", commit: "not a sha", approved: SHA("c"), dir: "/x", evil: true }, { commit: SHA("d") }, "x"] });
  assert.deepEqual(s, { kit: "0.4.1", api: "1.2", user: "amy", at: 100000, self: { name: "agentkit", commit: SHA("a"), approved: null },
    approvals: { serial: 7, used: 6, valid: true }, sources: [{ name: "team", commit: null, approved: SHA("c") }], pending: [] });
  // kit api 1.6's pending: each field checked; root's report too; 關係 says them, where they were read
  const pend = X.readStatus({ ...STATUS(), pending: [
    { kind: "sign", name: "agentkit", what: "agentkit 有 3 個新 commit 等核准", commits: 3, head: SHA("e"), since: 5e11, machine: "srv", run: "x" },
    { kind: "owner", id: "deploy", what: "要上線 web", since: "soon", machine: "srv", pid: 9 }, { kind: "sign" }, "x"] }).pending;
  assert.deepEqual(pend, [
    { kind: "sign", what: "agentkit 有 3 個新 commit 等核准", name: "agentkit", commits: 3, since: 5e11, machine: "srv", id: null },
    { kind: "owner", what: "要上線 web", name: null, commits: null, since: null, machine: "srv", id: "deploy" }]);
  const rows = [{ here: true, state: "ok", pending: [] }, { reported: true, label: "srv root", state: "ok", pending: pend }, { machine: "x", state: "down", pending: pend }];
  const pr = X.pendingRows(rows);
  assert.deepEqual(pr.map((p) => p.where), ["srv root", "srv root"], "only rows that answered");
  {
    const th = new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : "#334455") });
    const g0 = M.graph.graphData({ agents: [], terms: [], space: null, now: 5e11 + 7200000 });
    H.texts = []; H.strings = []; H.clicks = {}; M.graph.alertsView(th, 13, g0, 5e11 + 7200000, () => assert.fail("no agent to go to"), { pending: pr });
    const out = [...H.texts, ...H.strings].join("\n");
    assert.match(out, /等你簽：agentkit 有 3 個新 commit 等核准（srv root，等了 2 小時）。簽章在 Mac 親手做/);
    assert.match(out, /等站長同意：要上線 web（srv root）/);
    H.clicks["kit-graph-alert-pending-0"]({}, cx);
  }
  for (const bad of [null, [], "x", { kit: "0.4.1" }, { kit: "0.4.1", api: "one" }, { api: "1.2" }]) assert.equal(X.readStatus(bad), null, JSON.stringify(bad));
  assert.match(X.readReport(null, "/r.json").why, /還沒有回報檔/);
  assert.match(X.readReport(" ".repeat(X.REPORT_MAX + 1), "/r.json").why, /太大/);
  assert.match(X.readReport("{nope", "/r.json").why, /不是 JSON/);
  assert.match(X.readReport('{"error": {"code": "x"}}', "/r.json").why, /不是 kit status --json/);
  assert.equal(X.readReport(JSON.stringify(STATUS()), "/r.json").status.kit, "0.4.1");
  assert.deepEqual(X.readSettings(null), { reported: [], error: null });
  assert.match(X.readSettings("[1]").error, /"reported"/);
  assert.match(X.readSettings("{").error, /不是 JSON/);
  const st = X.readSettings(JSON.stringify({ reported: [{ label: "box root", machine: "box", file: "/r.json", run: "x" }, { label: "here", file: "C:\\r.json" }, { label: "no file" }, { file: "/f" }] }));
  assert.deepEqual(st.reported, [{ label: "box root", machine: "box", file: "/r.json" }, { label: "here", machine: null, file: "C:\\r.json" }]);
  assert.match(st.error, /2 筆/);
  assert.deepEqual([X.upgradeFor("sh"), X.upgradeFor("cmd"), X.upgradeFor(undefined)], ["kit self-update && kit sync", "kit self-update; if ($?) { kit sync }", "kit self-update && kit sync"]);
});

machinesTest("各機器: what a row lacks is named (no counts), from the api table; the newest kit and approval serial; ✓ only when every commit is the approved one", ({ machines: X }) => {
  const rows = [{ state: "ok", kit: "0.4.1", api: "1.2", approvals: { serial: 7, valid: true } }, { state: "ok", kit: "0.4.0", api: "1.1", approvals: { serial: 9, valid: false } },
    { state: "down", kit: "0.9.0", api: "9.0" }];
  const top = X.newest(rows);
  assert.deepEqual(top, { kit: "0.4.1", api: [1, 2], serial: 7, serialReported: false });
  assert.deepEqual(X.missing(rows[0], top), { lacks: [], kit: null });
  assert.deepEqual(X.missing(rows[1], top), { lacks: [{ name: "按輪分段", kit: "0.4.1" }], kit: "0.4.1" });
  assert.deepEqual(X.missing({ api: "1.0" }, top).lacks.map((f) => f.name), ["agent-files 清單", "按輪分段"]);
  assert.deepEqual(X.missing({ api: null }, top).lacks.map((f) => f.name), ["Kit 面板", "agent-files 清單", "按輪分段"]);
  // a kit newer than the table knows: said as that kit's new things
  const t2 = X.newest([...rows, { state: "ok", kit: "0.6.0", api: "1.4" }]);
  assert.deepEqual(X.missing({ api: "1.3" }, t2), { lacks: [{ name: "kit 0.6.0 的新功能", kit: "0.6.0" }], kit: "0.6.0" });
  assert.deepEqual(X.missing(rows[0], t2).lacks.map((f) => f.name), ["貼上 MCP 設定", "各機器的核准和來源", "把 agent 放到 space", "kit 0.6.0 的新功能"]);
  assert.equal(X.atApproved({ self: { commit: SHA("a"), approved: SHA("a") }, sources: [{ commit: SHA("b"), approved: SHA("b") }, { commit: SHA("c"), approved: null }] }), true);
  assert.equal(X.atApproved({ self: { commit: SHA("a"), approved: SHA("e") }, sources: [] }), false);
  assert.equal(X.atApproved({ self: { commit: SHA("a"), approved: null }, sources: [] }), null);
  const ref = X.approvedRef([{ state: "ok", approvals: { serial: 3, valid: true }, self: { name: "agentkit", approved: SHA("3") } },
    { state: "ok", approvals: { serial: 7, valid: true }, self: { name: "agentkit", approved: SHA("7") }, sources: [{ name: "team", approved: SHA("t") }] },
    { state: "ok", approvals: { serial: 9, valid: false }, self: { name: "agentkit", approved: SHA("9") } }]);
  assert.deepEqual([ref.row.approvals.serial, ref.of("agentkit"), ref.of("team"), ref.of("other")], [7, SHA("7"), SHA("t"), null]);
  assert.equal(X.approvedRef([{ state: "ok", approvals: null }]), null);
});

machinesTest("各機器: nothing is asked until the tab is opened; then this computer and every machine Herdr knows, at once; one that is away is not asked", async (M) => {
  fresh();
  fleet({ "": { status: STATUS() }, box: { status: STATUS({ user: "amy" }) }, winbox: { kit: "0.4.0", api: "1.1" } });
  H.spaces = [{ id: "s1", machine: null, tabs: [] }, { id: "box/s2", machine: "box", tabs: [] }];
  H.machines = [{ name: null, layout: "ready" }, { name: "box", layout: "ready" }];
  H.hcAnswer = (a) => (a[0] === "machine" ? { code: 0, stderr: "", stdout: JSON.stringify({ machines: [{ name: "box", state: "connected" }, { name: "winbox", state: "connected" }, { name: "away", state: "disconnected" }] }) } : null);
  const { v, open } = await machinesPanel(M);
  await tick(); await tick();
  assert.equal(kitCalls("status").length, 0, "no kit status before the tab is opened");
  assert.equal(H.calls.filter((c) => c.argv[0] === "hc" && c.argv[1] === "machine").length, 0);
  const text = await open();
  assert.deepEqual(kitCalls("status").map((c) => c.on).sort(), [null, "box", "winbox"].sort());
  assert.ok(!H.calls.some((c) => c.on === "away"), "a machine that isn't connected is not asked");
  assert.deepEqual(machineRows().map((r) => [r.key, r.state]), [["here", "ok"], ["m:away", "down"], ["m:box", "ok"], ["m:winbox", "ok"]]);
  assert.match(text, /最新：kit 0\.4\.1/);
  assert.doesNotMatch(text, /核准簽到/, "no approval serial known");
  assert.match(text, /齊全/);
  assert.match(text, /沒有：按輪分段/); assert.match(text, /升到 kit 0\.4\.1 就有/);
  assert.doesNotMatch(text, /少 \d|api/i, "no counts, no api column");
  assert.match(text, /沒連上（disconnected）/);
  // an older kit (no kit status): kit api and kit --version, and nothing about approvals
  assert.equal(rowOf("m:winbox").kit, "0.4.0"); assert.equal(rowOf("m:winbox").hasStatus, false);
  assert.equal(kitCalls("api").filter((c) => c.on === "winbox").length, 1);
  // kept: opening the tab again doesn't ask again; ⟳ does
  const n = kitCalls("status").length;
  render(v); H.clicks["tab-skill"]({}, cx); render(v); H.clicks["tab-machines"]({}, cx); await settle(); await tick();
  assert.equal(kitCalls("status").length, n);
  render(v); H.clicks["machines-reload"]({}, cx); await settle();
  assert.equal(kitCalls("status").length, n + 3);
});

machinesTest("各機器: 複製升級指令 copies (Mac / Linux, or PowerShell where kit runs as kit.cmd) and runs nothing", async (M) => {
  fresh();
  // winbox: sh can't find kit (127), kit.cmd answers: a Windows machine
  const old = { status: STATUS({ kit: "0.4.0", api: "1.1" }) };
  fleet({ "": { status: STATUS() }, box: old, winbox: old });
  const answer = H.answer;
  H.answer = (argv, on) => (on === "winbox" && argv[0] === "sh" ? { code: 127, stdout: "", stderr: "sh: kit: not found" } : answer(argv, on));
  H.spaces = [{ machine: "box", tabs: [] }, { machine: "winbox", tabs: [] }];
  const { v, open } = await machinesPanel(M);
  await open();
  assert.equal(rowOf("m:winbox").via, "cmd"); assert.equal(rowOf("m:box").via, "sh");
  const before = H.calls.length;
  render(v); H.clicks["upgrade-m:box"]({}, cx); H.clicks["upgrade-m:winbox"]({}, cx);
  assert.deepEqual(H.clipboard, ["kit self-update && kit sync", "kit self-update; if ($?) { kit sync }"]);
  assert.equal(H.calls.length, before, "nothing run");
  assert.match(H.notes.at(-1).body, /只複製，沒有執行/);
  assert.equal(H.clicks["upgrade-here"], undefined, "a complete row has no button");
});

machinesTest("各機器: self-reported accounts (kit-machines.json): read, never run, only on machines this Herdr knows; only kit status's fields used", async (M) => {
  fresh();
  fleet({ "": { status: STATUS() }, box: { status: STATUS() } });
  H.spaces = [{ machine: "box", tabs: [] }];
  const root = STATUS({ user: "root", at: Math.floor(Date.now() / 1000) - 720, approvals: { serial: 7, used: 7, valid: true },
    self: { name: "agentkit", commit: SHA("a"), approved: SHA("a") }, sources: [{ name: "team", commit: SHA("c"), approved: SHA("c") }], command: "touch /tmp/pwned" });
  H.files = { [SETTINGS]: JSON.stringify({ reported: [
    { label: "box root", machine: "box", file: "/var/report.json" }, { label: "elsewhere", machine: "stranger", file: "/r.json" },
    { label: "gone", machine: "box", file: "/none.json" }, { label: "big", machine: "box", file: "/big.json" }] }),
    "box:/var/report.json": JSON.stringify(root), "box:/big.json": " ".repeat(70000) };
  const { open } = await machinesPanel(M);
  const text = await open();
  assert.deepEqual(H.reads.filter(([p]) => p !== SETTINGS && !p.endsWith("mcp-paste.txt")).map(([p, on]) => `${on}:${p}`).sort(), ["box:/big.json", "box:/none.json", "box:/var/report.json"]);
  assert.ok(!H.calls.some((c) => c.on === "stranger"), "a machine this Herdr doesn't know: nothing asked");
  assert.ok(!H.calls.some((c) => c.argv.join(" ").includes("pwned") || c.argv.includes("sudo")), "nothing from a report is run");
  const r = rowOf("r:0");
  assert.equal(r.state, "ok"); assert.equal(r.user, "root"); assert.deepEqual(r.approvals, { serial: 7, used: 7, valid: true }); assert.equal(r.command, undefined);
  assert.match(rowOf("r:1").why, /不認得 stranger/); assert.match(rowOf("r:2").why, /還沒有回報檔/); assert.match(rowOf("r:3").why, /太大/);
  assert.match(text, /最新：kit 0\.4\.1 · 核准簽到第 7 號（自報）/, "only a report file has approvals: labelled so");
  assert.match(text, /#7 ✓/); assert.match(text, /12 分鐘前（自己回報）/);
  // this computer's sources against root's approved commits
  assert.match(text, /核准紀錄：第 7 號（box root root 回報的）（自報）/);
  assert.match(text, /agentkit[\s\S]*✓ 跟核准的一樣/);
  assert.match(text, /⚠ 跟核准的不一樣（核准的是 ccccccc）/);
});

machinesTest("各機器: this computer's kit without kit status: 核准 and 來源 say —; a machine whose kit doesn't answer is grey with why", async (M) => {
  fresh();
  fleet({ "": { kit: "0.4.1", api: "1.2" }, slow: new Error("kit took longer than 20 s on slow and was stopped") });
  H.spaces = [{ machine: "slow", tabs: [] }];
  const { open } = await machinesPanel(M);
  const text = await open();
  assert.equal(rowOf("here").hasStatus, false);
  assert.match(text, /還沒有 kit status/);
  assert.equal(rowOf("m:slow").state, "down"); assert.match(rowOf("m:slow").why, /沒在 20 秒內回應/);
  assert.equal(kitCalls("status").filter((c) => c.on === "slow").length, 1, "no second try after a timeout");
});

machinesTest("各機器: a broken kit-machines.json says so and the other rows still load (Windows: the settings file by appHome's own separator)", async (M) => {
  fresh();
  fleet({ "": { status: STATUS() } });
  H.files = { [SETTINGS]: "{ not json" };
  const { open } = await machinesPanel(M);
  const text = await open();
  assert.match(text, /kit-machines\.json 不是 JSON/); assert.equal(rowOf("here").state, "ok");
  fresh(); fleet({ "": { status: STATUS() } });
  H.window = { platform: "windows" }; H.home = "C:\\Users\\amy"; H.appHome = "C:\\Users\\amy\\.config\\herdr-app"; H.files = {};
  try {
    const w = await machinesPanel(M);
    await w.open();
    assert.ok(H.reads.some(([p]) => p === "C:\\Users\\amy\\.config\\herdr-app\\kit-machines.json"), JSON.stringify(H.reads));
    assert.deepEqual(kitCalls("status").map((c) => c.argv[0]), ["kit.cmd"]);
    render(w.v);
    assert.equal(H.clicks["upgrade-here"], undefined);
  } finally { H.home = "/Users/amy"; }
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

machinesTest("各機器: the approvals come from machines asked directly; a self-reported file (anyone who can write it) only when there is none, labelled （自報）", async (M) => {
  const X = M.machines;
  const here = { here: true, state: "ok", approvals: null, self: { name: "agentkit", commit: SHA("a"), approved: null }, sources: [] };   // Windows: kit has no approvals
  const box = { key: "m:box", machine: "box", state: "ok", approvals: { serial: 3, valid: true }, self: { name: "agentkit", approved: SHA("3") } };
  const fake = { key: "r:0", reported: true, label: "root", state: "ok", approvals: { serial: 99, valid: true }, self: { name: "agentkit", approved: SHA("9") } };
  assert.deepEqual(X.newest([here, fake, box]).serial, 3);
  assert.equal(X.newest([here, fake, box]).serialReported, false);
  assert.equal(X.approvedRef([here, fake, box]).row, box, "the asked row, though the report's serial is higher");
  assert.equal(X.approvedRef([here, fake, box]).of("agentkit"), SHA("3"));
  assert.deepEqual([X.newest([here, fake]).serial, X.newest([here, fake]).serialReported], [99, true]);
  assert.equal(X.approvedRef([here, fake]).row, fake, "no asked row has approvals: the report, labelled");
  assert.equal(X.approvedRef([here, { ...box, approvals: { serial: 5, valid: false } }, fake]).row, fake, "an asked row with a bad signature doesn't count");
  // on screen
  fresh();
  fleet({ "": { status: STATUS() }, box: { status: STATUS({ approvals: { serial: 3, used: 3, valid: true }, self: { name: "agentkit", commit: SHA("a"), approved: SHA("a") } }) } });
  H.spaces = [{ machine: "box", tabs: [] }];
  H.files = { [SETTINGS]: JSON.stringify({ reported: [{ label: "root", machine: "box", file: "/r.json" }] }),
    "box:/r.json": JSON.stringify(STATUS({ approvals: { serial: 99, used: 99, valid: true }, self: { name: "agentkit", commit: SHA("a"), approved: SHA("e") } })) };
  const { open } = await machinesPanel(M);
  const text = await open();
  assert.match(text, /核准簽到第 3 號/); assert.doesNotMatch(text, /第 99 號|自報）/);
  assert.match(text, /核准紀錄：第 3 號（box amy 回報的）/);
  assert.match(text, /agentkit[\s\S]*✓ 跟核准的一樣/);
});
machinesTest("各機器: a slow load (hc machine ls, a kit by sh then kit.cmd, an older kit's fallbacks) still counts as loading: the tab doesn't start it again", ({ machines: X }) => {
  fresh();
  const worst = 30000 + 2 * 20000 + 2 * 15000;
  assert.ok(X.LOAD_TTL > worst, `LOAD_TTL ${X.LOAD_TTL} > ${worst}`);
  H.store["kit.machines.v1"] = { seq: 1, started: Date.now(), done: false, rows: [{ key: "here", state: "loading" }] };
  skew = worst;
  assert.equal(X.machinesLoading(), true); assert.equal(X.machinesDue(), false);
  skew = X.LOAD_TTL + 1;
  assert.equal(X.machinesLoading(), false, "older than that: it never finished (Herdr quit)"); assert.equal(X.machinesDue(), true);
  skew = 0;
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
  let json = "";
  if (a.ok) {
    // a kit the mod can read: its JSON commands, read the mod's way, in an empty home (nothing of yours is read or
    // written): each one either answers JSON or fails with {"error": {"code": "not_init", ...}}
    // its real path: on a Mac the temp folder is behind a link (/var → /private/var), and kit 0.3.0 then sees the
    // source twice (kit check: 名字重複)
    const home = realpathSync(mkdtempSync(join(tmpdir(), "kit-home-")));
    try {
      writeFileSync(join(home, ".gitconfig"), "[user]\n\tname = t\n\temail = t@example.org\n[init]\n\tdefaultBranch = main\n");
      var env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local", "share"),
        GIT_CONFIG_GLOBAL: join(home, ".gitconfig"), GIT_CONFIG_NOSYSTEM: "1" };
      H.answer = (argv) => {
        const cmd = /^kit(\.cmd)?$/.test(argv[0]) ? exe : argv[0];
        const r = spawnSync(cmd, argv.slice(1), { encoding: "utf8", timeout: 40000, shell: win, cwd: home, env });
        return r.error ? r.error : { code: r.status, stdout: r.stdout, stderr: r.stderr };
      };
      const said = [];
      for (const args of [["list", "--json"], ["agents", "--json"], ["push", "--dry-run", "--json"]]) {
        const r = await M.common.kit(args);
        const j = M.common.kitJson(r, `kit ${args[0]}`);
        if (j.data) assert.ok(typeof j.data === "object", args.join(" "));
        else {
          assert.ok(M.common.KIT_ERRORS.includes(j.error.code), `${args.join(" ")}: ${j.error.code}`);
          assert.doesNotThrow(() => JSON.parse(r.out), `${args.join(" ")}: stdout is JSON`);
          assert.notEqual(j.error.message, "", args.join(" "));
        }
        said.push(`kit ${args.join(" ")} -> ${j.data ? "JSON" : j.error.code}`);
      }
      json = `; in an empty home: ${said.join(", ")}`;
      if (!win) json += await realRepo(M, exe, home, env);
    } finally { rmSync(home, { recursive: true, force: true }); }
  }
  return `ok    real kit (${process.env.KIT ? `KIT=${process.env.KIT}` : exe}): kit api -> ${JSON.stringify(direct.stdout.trim() || direct.stderr.trim())}, the mod says: ${a.ok ? "ok" : a.title}${json}`;
}

// The repository panel with that real kit, all in the empty home: a source of your own (push: direct, a bare repo
// beside it as its remote), one rule changed; the panel lists it as unsent, 送出 → 確定送出 sends it, then nothing is.
async function realRepo(M, exe, home, env) {
  const git = (cwd, ...a) => { const r = spawnSync("git", a, { cwd, env, encoding: "utf8" }); assert.equal(r.status, 0, `git ${a.join(" ")}: ${r.stderr}`); return r.stdout; };
  const src = join(home, "mine"), remote = join(home, "remote.git");
  mkdirSync(join(src, "rules"), { recursive: true });
  writeFileSync(join(src, "rules", "hello.md"), "---\nname: hello\ndescription: hi\n---\nbe nice\n");
  writeFileSync(join(src, "kit.yaml"), "push: direct\n");
  git(home, "init", "-q", "--bare", remote);
  git(src, "init", "-q"); git(src, "add", "."); git(src, "commit", "-qm", "init");
  git(src, "remote", "add", "one", remote); git(src, "push", "-q", "one", "HEAD:refs/heads/main");
  const init = spawnSync(exe, ["init", src], { cwd: home, env, encoding: "utf8" });
  assert.equal(init.status, 0, `kit init: ${init.stderr}`);
  writeFileSync(join(src, "rules", "hello.md"), "---\nname: hello\ndescription: hi\n---\nbe nicer\n");
  const answer = H.answer;
  fresh(); H.answer = answer;
  const v = view(M, { role: "repo" }); await settle(); await tick();
  const d = H.store["kit.data.v2"];
  assert.ok(!d.error, d.error);
  assert.deepEqual(d.dirty, [{ name: "mine", push: "direct", items: 1, agents: 0 }]);
  assert.deepEqual(d.items.filter((i) => i.changed).map((i) => [i.name, i.rel]), [["hello", "rules/hello.md"]]);
  render(v); H.clicks.push({}, cx); await settle();
  assert.match(render(v), /rules\/hello\.md/);
  H.clicks["push-mine"]({}, cx); await settle();
  const msg = H.store["kit.msg.repo"];
  assert.equal(msg.ok, true, msg.text);
  assert.match(git(remote, "log", "--format=%s", "-1", "main"), /^kit: update rule:hello/);
  await tick();
  assert.deepEqual(H.store["kit.data.v2"].dirty, [], "nothing unsent after 送出");
  return "; a source of its own: listed as unsent, sent by 送出 → 確定送出";
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
