// Tests for herdr-app/mods/agent-page without Herdr: node tests/agent-page/run.js (macOS, Linux, Windows; Node 18+).
// The mod's imports (gpui-kit, gpui-base, herdr) are replaced by stubs; fs/promises is Node's own, on a temporary
// Herdr home. watchFolder is a fake the test answers by hand.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, statSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const MOD = join(here, "..", "..", "herdr-app", "mods", "agent-page");

// ---------- stubs ----------
const H = {};
const el = new Proxy(function () {}, {
  get(_t, k) {
    if (k === "then") return undefined;
    return (...args) => {
      if (String(k) === "when") { if (args[0]) args[1](el); return el; }
      if (String(k) === "child" && args[0] === undefined) throw new Error("child(value) expects an element or a string");
      if (String(k) === "child" && typeof args[0] === "string") H.strings.push(args[0]);
      return el;
    };
  },
  apply: () => el,
});
globalThis.__stubs = {
  View: class {}, div: () => el, v_flex: () => el, h_flex: () => el, TextView: { html: (_id, h) => { H.strings.push(h.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")); return el; } },
  theme: () => H.theme ?? new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : "#334455") }),
  settings: () => H.settings ?? { ui_font_size: 13 }, appHome: () => H.home,
  props: () => H.props, panes: () => H.panes, run: (name, args) => { H.runs.push([name, args]); }, notify: (n) => { H.notes.push(n); },
  shared: (k) => H.shared[k], setShared: (k, v) => { H.shared[k] = v; },
  nextWebEvent: () => new Promise((resolve) => { H.event = resolve; }),
  watchFolder: (dir) => new Promise((resolve, reject) => { H.watching.push(dir); H.wake = resolve; H.fail = reject; }),
  web: { new: (id, p) => { H.web.push([id, p.src, p.persist]); return el; } },
  webCall: (id, action) => { H.calls.push([id, action]); return null; },
  window: () => ({ platform: "macos" }),
  // exec: the other machine's listing (H.remote: name -> text), scp copies those files into the local folder; a script
  // there other than the listing (order.json's write) is only recorded. sh here really runs (order.json's write).
  exec: async (cmd, args, opts) => {
    H.execs.push([cmd, args, opts?.on ?? null]);
    if (cmd === "sh" && opts?.on) {
      if (!args[1].includes("cksum")) return H.remoteFails ? { code: 1, stdout: "", stderr: "sh: permission denied" } : { code: 0, stdout: "", stderr: "" };
      const lines = Object.entries(H.remote ?? {}).map(([n, t]) => `${t.length}_${[...t].reduce((a, c) => a + c.charCodeAt(0), 0)} ${n}`);
      return { code: 0, stdout: lines.map((l) => l + "\n").join(""), stderr: "" };
    }
    if (cmd === "sh") { const r = spawnSync(cmd, args, { encoding: "utf8" }); return { code: r.status, stdout: r.stdout, stderr: r.stderr }; }
    if (cmd === "scp") {
      if (H.scpFails) return { code: 1, stdout: "", stderr: "ssh: connect to host box: Connection refused" };
      const dest = args[args.length - 1];
      for (const src of args.slice(3, -1)) { const n = src.split("/").pop(); writeFileSync(join(dest, n), H.remote[n]); }
      return { code: 0, stdout: "", stderr: "" };
    }
    if (cmd === "stat") { // macOS's: -f %m <file> (H.statFails: a stat that fails)
      if (H.statFails) return { code: 1, stdout: "", stderr: "stat: illegal option" };
      return { code: 0, stdout: `${Math.floor((H.mtime ?? statSync(args[2]).mtimeMs) / 1000)}\n`, stderr: "" };
    }
    return { code: 0, stdout: "", stderr: "" };
  },
  hc: async (args) => ({ code: 0, stdout: JSON.stringify({ machines: [{ name: "box", target: "box-alias" }] }), stderr: "" }),
};
const cx = { notify() {}, stop_propagation() {}, timer: { every: (ms, f) => { H.every = f; } }, spawn: (f) => { H.tasks.push(Promise.resolve().then(() => f(cx))); } };
async function settle() {
  // The mod's watch loop never ends, so don't wait for the tasks: let them run until they wait.
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));
}

async function loadMod() {
  const dir = mkdtempSync(join(tmpdir(), "agent-page-test-"));
  let src = readFileSync(join(MOD, "main.js"), "utf8");
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*"(gpui-kit|gpui-base|herdr)";\s*$/gm, (_m, names) => `const {${names}} = globalThis.__stubs;`);
  assert.doesNotMatch(src, /from\s+"(gpui-kit|gpui-base|herdr)"/);
  writeFileSync(join(dir, "main.js"), src);
  const m = await import(pathToFileURL(join(dir, "main.js")).href);
  rmSync(dir, { recursive: true, force: true });
  return m.default;
}

// ---------- the world ----------
function world({ props = { dir: "t63", beside: "pA", pane: "pM" }, panes, shared = {} } = {}) {
  const home = mkdtempSync(join(tmpdir(), "agent-page-home-"));
  Object.assign(H, {
    home, props, shared, runs: [], calls: [], web: [], tasks: [], strings: [], watching: [], wake: null, execs: [], remote: null, scpFails: false, every: null, mtime: null, statFails: false, notes: [], remoteFails: false,
    panes: panes ?? [{ pane: "pA", terminal: "t63", tab: "tb1" }, { pane: "pM", terminal: null, mod: "agent-page", tab: "tb1" }],
  });
  return join(home, "mods", "agent-page", ".pages", "t63");
}
const write = (folder, name, text = `<p>${name}</p>`) => { mkdirSync(folder, { recursive: true }); writeFileSync(join(folder, name), text); };
async function open(V) { const v = new V(); v.init({}, cx); await settle(); return v; }
function render(v) { H.strings = []; H.web = []; v.render(cx); return H.strings.join("\n"); }
async function changed(folder, names) { H.wake(names.map((n) => join(folder, n))); await settle(); }

// ---------- tests ----------
const tests = [];
const test = (name, f) => tests.push([name, f]);

const STATUS = (o) => JSON.stringify({ title: "t63 · demo", updated: new Date().toISOString(), ...o });
const today = (n = 0) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

test("first copy: claims its dir, gives the keyboard back to the agent, watches the mod's folder; 進度 says nothing yet", async (V) => {
  world();
  const v = await open(V);
  assert.equal(H.shared["agent-page/t63"], "pM");
  assert.deepEqual(H.runs, [["pane.focus", { pane: "pA" }]]);
  assert.deepEqual(H.watching, [`${H.home}/mods/agent-page`]);
  assert.equal(v.tab, "status");
  assert.match(render(v), /還沒有進度/);
  assert.equal(H.web.length, 0);
});

test("進度: waiting (with its command), doing, to do, done of the last 3 days by day; older counted, not listed", async (V) => {
  const folder = world();
  write(folder, "status.json", STATUS({
    waiting: [{ text: "sign kit", cmd: "! kit approve" }], doing: [{ text: "the panel", project: "herdr-jay" }], todo: ["upgrade"],
    done: [{ text: "today's", date: today() }, { text: "two days ago", date: today(2) }, { text: "old one", date: today(3) }, { text: "" }],
  }));
  const v = await open(V);
  const s = render(v);
  for (const x of ["t63 · demo", "等你（1）", "sign kit", "! kit approve", "正在做（1）", "the panel", "herdr-jay", "還沒做（1）", "upgrade", "（今天）", "today's", "two days ago", "更早的還有 1 項"]) assert.ok(s.includes(x), x);
  assert.ok(!s.includes("old one"));
  assert.ok(s.indexOf("today's") < s.indexOf("two days ago"), "newest day first");
});

test("進度: status.json rewritten is read again; broken JSON keeps the last good one and says so", async (V) => {
  const folder = world();
  write(folder, "status.json", STATUS({ doing: ["first"] }));
  const v = await open(V);
  write(folder, "status.json", STATUS({ doing: ["second"] }));
  await changed(folder, ["status.json"]);
  assert.match(render(v), /second/);
  write(folder, "status.json", "{ half");
  await changed(folder, ["status.json"]);
  const s = render(v);
  assert.match(s, /second/);
  assert.match(s, /status\.json 讀不了/);
  assert.equal(v.tab, "status", "a status change doesn't move the tab");
});

test("進度: its time is the file's own, not the agent's updated (a date only, or old)", async (V) => {
  const folder = world();
  write(folder, "status.json", STATUS({ updated: "2026-01-01", doing: ["x"] }));
  const v = await open(V);
  assert.match(render(v), /更新 剛剛/);
  H.mtime = Date.now() - 3 * 3600000;
  write(folder, "status.json", STATUS({ updated: new Date().toISOString(), doing: ["y"] }));
  await changed(folder, ["status.json"]);
  assert.match(render(v), /更新 3 小時前/, "written 3 hours ago, though it says now");
  H.statFails = true;
  write(folder, "status.json", STATUS({ updated: new Date(Date.now() - 2 * 3600000).toISOString(), doing: ["z"] }));
  await changed(folder, ["status.json"]);
  assert.match(render(v), /更新 2 小時前/, "no file time: the agent's own");
});

test("等你: what Kit sees the agent wait for comes first (agents.waiting's why), unless its own list says it; also with no status.json", async (V) => {
  const folder = world({ shared: { "agents.waiting": { t63: { since: 1, hot: false, why: "要推的話跟我說。" }, t9: { why: "other" } } } });
  let v = await open(V);
  let s = render(v);
  assert.ok(s.includes("等你（1）") && s.includes("Kit 看到：要推的話跟我說。") && /還沒有進度/.test(s), s);
  assert.ok(!s.includes("other"));
  write(folder, "status.json", STATUS({ waiting: [{ text: "sign kit" }] }));
  await changed(folder, ["status.json"]);
  s = render(v);
  assert.ok(s.includes("等你（2）") && s.indexOf("Kit 看到") < s.indexOf("sign kit"), s);
  write(folder, "status.json", STATUS({ waiting: [{ text: "要推的話跟我說。（herdr-jay ahead 1）" }] }));
  await changed(folder, ["status.json"]);
  s = render(v);
  assert.ok(s.includes("等你（1）") && !s.includes("Kit 看到"), "its own list says it already");
  // an agent on another machine: by machine/term
  world({ props: { dir: "box_t1p", beside: "pA", pane: "pM", machine: "box", term: "t1p" }, shared: { "agents.waiting": { "box/t1p": { why: "要你同意：升 kit" } } } });
  v = await open(V);
  assert.ok(render(v).includes("Kit 看到：要你同意：升 kit"));
});

test("tabs: 進度 first, then pages newest first, titled without the time; a page is file:// of it", async (V) => {
  const folder = world();
  write(folder, "2026-11-16-0400-a.html");
  write(folder, "2026-11-16-0430-比較.html");
  write(folder, "notes.txt");
  const v = await open(V);
  assert.deepEqual(v.names, ["2026-11-16-0430-比較.html", "2026-11-16-0400-a.html"]);
  const s = render(v);
  assert.ok(s.indexOf("進度") < s.indexOf("比較") && s.indexOf("比較") < s.indexOf("\na"), s);
  assert.equal(v.tab, "status", "opens on 進度");
  v.tab = v.names[0];
  render(v);
  assert.equal(H.web[0][0], "page");
  assert.equal(H.web[0][2], true, "the page keeps its localStorage (persist): our own local file");
  const [url, hash] = H.web[0][1].split("#");
  assert.ok(url.startsWith("file://") && url.endsWith("/mods/agent-page/.pages/t63/2026-11-16-0430-%E6%AF%94%E8%BC%83.html"), url);
  assert.equal(hash, "mode=dark&bg=%23334455&panel=%23334455&fg=%23334455&muted=%23334455&line=%23334455&accent=%23334455",
    "Herdr's look goes to the page in its hash");
  // A light theme: mode from the surface's brightness, whatever the theme's name.
  H.theme = { surface: "#faf4ed", raised: "#fffaf3", foreground: "#575279", muted: "#797593", border: "#dfdad9", accent: "#286983" };
  H.settings = { ui_font_size: 13, ui_font_family: "Inter", font_family: "JetBrains Mono" };
  render(v);
  H.theme = null;
  H.settings = null;
  assert.ok(H.web[0][1].endsWith("#mode=light&bg=%23faf4ed&panel=%23fffaf3&fg=%23575279&muted=%23797593&line=%23dfdad9&accent=%23286983&font=Inter&mono=JetBrains%20Mono"), H.web[0][1]);
});

test("a page written while open opens in its tab; one rewritten in place reloads; one deleted goes back to 進度", async (V) => {
  const folder = world();
  write(folder, "2026-11-16-0400-a.html");
  const v = await open(V);
  write(folder, "2026-11-16-0500-b.html");
  await changed(folder, ["2026-11-16-0500-b.html"]);
  assert.equal(v.tab, "2026-11-16-0500-b.html");
  assert.deepEqual(H.calls, [], "a different page loads by src, no reload");
  await changed(folder, ["2026-11-16-0500-b.html"]);
  assert.deepEqual(H.calls, [["page", "reload"]]);
  rmSync(join(folder, "2026-11-16-0500-b.html"));
  await changed(folder, [""]);
  assert.equal(v.tab, "status");
  assert.equal(H.watching.length, 4, "keeps watching");
});

test("the tab shown is kept for the dir: a copy opened again (reload, reopen, restart) shows it; a page gone falls back to 進度", async (V) => {
  const folder = world();
  write(folder, "2026-11-16-0400-a.html");
  write(folder, "2026-11-16-0500-b.html");
  const v = await open(V);
  assert.equal(v.tab, "status");
  write(folder, "2026-11-16-0600-c.html");
  await changed(folder, ["2026-11-16-0600-c.html"]);
  assert.equal(H.shared["agent-page/t63/tab"], "2026-11-16-0600-c.html", "a page that opened by itself is kept too");
  H.shared["agent-page/t63/tab"] = "2026-11-16-0400-a.html"; // as a click on its tab leaves it
  const w = await open(V);
  assert.equal(w.tab, "2026-11-16-0400-a.html");
  rmSync(join(folder, "2026-11-16-0400-a.html"));
  const x = await open(V);
  assert.equal(x.tab, "status");
  assert.equal(H.shared["agent-page/t63/tab"], "status");
});

test("order.json: pages it doesn't list (new) first, newest first, then its order, names gone skipped; a new page still opens; broken: newest first", async (V) => {
  const folder = world();
  for (const n of ["2026-11-16-0400-a.html", "2026-11-16-0500-b.html", "2026-11-16-0600-c.html", "2026-11-16-0700-d.html"]) write(folder, n);
  write(folder, "order.json", JSON.stringify({ order: ["2026-11-16-0400-a.html", "gone.html", "2026-11-16-0500-b.html", "2026-11-16-0400-a.html"], updated: "2026-11-20T10:00:00+08:00" }));
  const v = await open(V);
  assert.deepEqual(v.names, ["2026-11-16-0700-d.html", "2026-11-16-0600-c.html", "2026-11-16-0400-a.html", "2026-11-16-0500-b.html"]);
  assert.deepEqual(render(v).split("\n").slice(0, 5), ["進度", "d", "c", "a", "b"], "進度 stays first");
  write(folder, "2026-11-16-0800-e.html");
  await changed(folder, ["2026-11-16-0800-e.html"]);
  assert.equal(v.tab, "2026-11-16-0800-e.html", "a page just written opens by itself");
  assert.equal(v.names[0], "2026-11-16-0800-e.html", "right after 進度");
  write(folder, "order.json", "{");
  await changed(folder, ["order.json"]);
  assert.deepEqual(v.names, ["2026-11-16-0800-e.html", "2026-11-16-0700-d.html", "2026-11-16-0600-c.html", "2026-11-16-0500-b.html", "2026-11-16-0400-a.html"]);
});

test("drag: a tab dropped on another takes its place, on 進度 goes first; order.json gets every page, through a temp file renamed", async (V) => {
  if (process.platform === "win32") return; // the write needs sh (a shortcut in the mod too)
  const folder = world();
  for (const n of ["1-a.html", "2-b.html", "3-比較.html"]) write(folder, n);
  const v = await open(V);
  assert.deepEqual(v.names, ["3-比較.html", "2-b.html", "1-a.html"]);
  v.move("3-比較.html", "1-a.html", cx);
  assert.deepEqual(v.names, ["2-b.html", "1-a.html", "3-比較.html"], "shown at once");
  await settle();
  const o = JSON.parse(readFileSync(join(folder, "order.json"), "utf8"));
  assert.deepEqual(o.order, ["2-b.html", "1-a.html", "3-比較.html"]);
  assert.ok(Date.parse(o.updated) > 0, o.updated);
  assert.deepEqual(readdirSync(folder).filter((n) => n.includes("order")), ["order.json"], "no temp file left");
  const w = H.execs.find(([c, a]) => c === "sh" && a[1].includes("mv -f"));
  assert.equal(w[1][3], folder);
  assert.equal(w[2], null, "here");
  await changed(folder, ["order.json"]);
  assert.deepEqual(v.names, ["2-b.html", "1-a.html", "3-比較.html"], "read back the same");
  v.move("1-a.html", "status", cx);
  await settle();
  assert.deepEqual(JSON.parse(readFileSync(join(folder, "order.json"), "utf8")).order, ["1-a.html", "2-b.html", "3-比較.html"]);
  H.execs = [];
  v.move("1-a.html", "1-a.html", cx);
  v.move("gone.html", "status", cx);
  await settle();
  assert.deepEqual(H.execs.filter(([c]) => c === "sh"), [], "dropped on itself, or a page gone: nothing written");
});

test("drag, an agent on another machine: order.json written there (under the home Herdr connects as) and here; failing there: back as it was", async (V) => {
  if (process.platform === "win32") return;
  world({ props: { dir: "box_t3", beside: "pA", pane: "pM", machine: "box", term: "t3" } });
  const [x, y] = ["2026-11-16-0500-x.html", "2026-11-16-0600-y.html"];
  H.remote = { [x]: "<p>x</p>", [y]: "<p>y</p>" };
  const v = await open(V);
  assert.deepEqual(v.names, [y, x]);
  H.execs = [];
  v.move(y, x, cx);
  await settle();
  const there = H.execs.find(([c, a, on]) => c === "sh" && on === "box" && a[1].includes("mv -f"));
  assert.equal(there[1][3], ".config/herdr-app/mods/agent-page/pages/t3");
  assert.deepEqual(JSON.parse(there[1][4]).order, [x, y]);
  const here = join(H.home, "mods", "agent-page", ".pages", "box_t3", "order.json");
  assert.deepEqual(JSON.parse(readFileSync(here, "utf8")).order, [x, y]);
  // the next sync lists order.json there and copies it like a page
  H.remote["order.json"] = there[1][4];
  H.every(cx); await settle();
  assert.ok(H.execs.find(([c]) => c === "scp")[1].some((a) => a.endsWith("/pages/t3/order.json")));
  assert.deepEqual(v.names, [x, y]);
  H.remoteFails = true;
  v.move(x, y, cx);
  await settle();
  assert.deepEqual(v.names, [x, y], "back as it was");
  assert.equal(H.notes.length, 1);
  assert.match(H.notes[0].body, /permission denied/);
  assert.deepEqual(JSON.parse(readFileSync(here, "utf8")).order, [x, y], "nothing written here");
});

test("events naming where a linked mod really is still count; other agents' folders don't", async (V) => {
  const folder = world();
  write(folder, "1.html");
  const v = await open(V);
  write(folder, "2.html");
  H.wake(["/elsewhere/agent-page/.pages/t9/3.html", "/Users/amy/src/jay/herdr-app/mods/agent-page/.pages/t63/2.html"]);
  await settle();
  assert.equal(v.tab, "2.html");
  H.wake(["/elsewhere/agent-page/.pages/t9/4.html"]);
  await settle();
  assert.equal(v.tab, "2.html");
});


test("web events: a failed load says why, the next load clears it", async (V) => {
  world();
  H.events = [];
  const v = await open(V);
  H.event({ id: "page", kind: "failed", error: "no such file" });
  await settle();
  assert.equal(v.note, "載入失敗：no such file");
  H.event({ id: "page", kind: "loaded" });
  await settle();
  assert.equal(v.note, null);
});

test("opened again while one is open: the new copy closes itself and gives the keyboard back", async (V) => {
  world({
    props: { dir: "t63", beside: "pA", pane: "pN" }, shared: { "agent-page/t63": "pM" },
    panes: [{ pane: "pA", terminal: "t63" }, { pane: "pM", terminal: null, mod: "agent-page" }, { pane: "pN", terminal: null, mod: "agent-page" }],
  });
  await open(V);
  assert.deepEqual(H.runs, [["pane.close", { pane: "pN" }], ["pane.focus", { pane: "pA" }]]);
  assert.equal(H.shared["agent-page/t63"], "pM");
  assert.deepEqual(H.watching, []);
});

test("the one it remembers was closed: the new copy takes over", async (V) => {
  world({ props: { dir: "t63", beside: "pA", pane: "pN" }, shared: { "agent-page/t63": "pM" },
    panes: [{ pane: "pA", terminal: "t63" }, { pane: "pN", terminal: null, mod: "agent-page" }] });
  await open(V);
  assert.equal(H.shared["agent-page/t63"], "pN");
  assert.deepEqual(H.runs, [["pane.focus", { pane: "pA" }]]);
});

test("dir is a plain folder name; beside gone or missing: no focus", async (V) => {
  world({ props: { dir: "../server/t1p", pane: "pM" } });
  const v = await open(V);
  assert.equal(v.dir, "_server_t1p");
  assert.deepEqual(H.runs, []);
  world({ props: { dir: "..", beside: "gone", pane: "pM" } });
  const w = await open(V);
  assert.equal(w.dir, "default");
  assert.deepEqual(H.runs, []);
});

test("an agent on another machine: lists its folder there, copies what changed with scp over the machine's ssh target, shows it", async (V) => {
  world({ props: { dir: "box_t3", beside: "pA", pane: "pM", machine: "box", term: "t3" } });
  H.remote = { "status.json": STATUS({ doing: ["remote work"] }), "2026-11-16-0500-x.html": "<p>x</p>" };
  const v = await open(V);
  const list = H.execs.find(([c, , on]) => c === "sh" && on === "box");
  assert.ok(list, "listed there");
  assert.equal(list[1].at(-1), ".config/herdr-app/mods/agent-page/pages/t3");
  const scp = H.execs.find(([c]) => c === "scp");
  assert.deepEqual(scp[1].slice(0, 3), ["-q", "-o", "BatchMode=yes"]);
  assert.ok(scp[1].includes("box-alias:.config/herdr-app/mods/agent-page/pages/t3/status.json"), scp[1].join(" "));
  assert.equal(scp[1].at(-1), `${H.home}/mods/agent-page/.pages/box_t3/`);
  const s = render(v);
  assert.match(s, /remote work/);
  assert.match(s, /在 box/);
  assert.equal(v.tab, "status", "the first copy doesn't jump to a page");
  // nothing changed there: no scp; a new page there: copied and opened
  H.execs = [];
  H.every(cx); await settle();
  assert.ok(!H.execs.some(([c]) => c === "scp"));
  H.remote["2026-11-16-0600-y.html"] = "<p>y</p>";
  H.every(cx); await settle();
  const again = H.execs.find(([c]) => c === "scp");
  assert.deepEqual(again[1].slice(3, -1), ["box-alias:.config/herdr-app/mods/agent-page/pages/t3/2026-11-16-0600-y.html"], "only what changed");
  assert.equal(v.tab, "2026-11-16-0600-y.html");
  // scp fails: says so on 進度
  H.scpFails = true;
  H.remote["status.json"] = STATUS({ doing: ["changed"] });
  H.every(cx); await settle();
  v.tab = "status";
  assert.match(render(v), /從 box 拿頁面失敗：ssh: connect to host box: Connection refused/);
});

test("Windows paths become file:///C:/…", async (V) => {
  world();
  const v = await open(V);
  v.folder = "C:\\Users\\amy\\.config\\herdr-app\\mods\\agent-page\\pages\\t63";
  v.names = ["a b#1.html"];
  v.tab = "a b#1.html";
  render(v);
  assert.equal(H.web[0][1].split("#")[0], "file:///C:/Users/amy/.config/herdr-app/mods/agent-page/pages/t63/a%20b%231.html");
});

// ---------- run ----------
const V = await loadMod();
let failed = 0;
for (const [name, f] of tests) {
  try {
    await f(V);
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${e.stack?.split("\n").slice(0, 12).join("\n     ")}`);
  } finally {
    if (H.home) rmSync(H.home, { recursive: true, force: true });
  }
}
console.log(failed ? `${failed} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);
