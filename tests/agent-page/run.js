// Tests for herdr-app/mods/agent-page without Herdr: node tests/agent-page/run.js (macOS, Linux, Windows; Node 18+).
// The mod's imports (gpui-kit, gpui-base, herdr) are replaced by stubs; fs/promises is Node's own, on a temporary
// Herdr home. watchFolder is a fake the test answers by hand.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
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
  View: class {}, div: () => el, v_flex: () => el, h_flex: () => el,
  theme: () => new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : "#334455") }),
  settings: () => ({ ui_font_size: 13 }), appHome: () => H.home,
  props: () => H.props, panes: () => H.panes, run: (name, args) => { H.runs.push([name, args]); },
  shared: (k) => H.shared[k], setShared: (k, v) => { H.shared[k] = v; },
  nextWebEvent: () => new Promise((resolve) => { H.event = resolve; }),
  watchFolder: (dir) => new Promise((resolve, reject) => { H.watching.push(dir); H.wake = resolve; H.fail = reject; }),
  web: { new: (id, p) => { H.web.push([id, p.src]); return el; } },
  webCall: (id, action) => { H.calls.push([id, action]); return null; },
};
const cx = { notify() {}, stop_propagation() {}, spawn: (f) => { H.tasks.push(Promise.resolve().then(() => f(cx))); } };
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
    home, props, shared, runs: [], calls: [], web: [], tasks: [], strings: [], watching: [], wake: null,
    panes: panes ?? [{ pane: "pA", terminal: "t63", tab: "tb1" }, { pane: "pM", terminal: null, mod: "agent-page", tab: "tb1" }],
  });
  return join(home, "mods", "agent-page", "pages", "t63");
}
const write = (folder, name, text = `<p>${name}</p>`) => { mkdirSync(folder, { recursive: true }); writeFileSync(join(folder, name), text); };
async function open(V) { const v = new V(); v.init({}, cx); await settle(); return v; }
function render(v) { H.strings = []; H.web = []; v.render(cx); return H.strings.join("\n"); }
async function changed(folder, names) { H.wake(names.map((n) => join(folder, n))); await settle(); }

// ---------- tests ----------
const tests = [];
const test = (name, f) => tests.push([name, f]);

test("first copy: claims its dir, gives the keyboard back to the agent, watches the mod's folder, says it's empty", async (V) => {
  const folder = world();
  const v = await open(V);
  assert.equal(H.shared["agent-page/t63"], "pM");
  assert.deepEqual(H.runs, [["pane.focus", { pane: "pA" }]]);
  assert.deepEqual(H.watching, [`${H.home}/mods/agent-page`]);
  assert.match(render(v), /還沒有頁面/);
  assert.equal(H.web.length, 0);
});

test("shows the newest page by name, and file:// of it", async (V) => {
  const folder = world();
  write(folder, "2026-11-16-0400-a.html");
  write(folder, "2026-11-16-0430-b.html");
  write(folder, "notes.txt");
  const v = await open(V);
  assert.match(render(v), /2026-11-16-0430-b\.html {2}· {2}2\/2/);
  assert.equal(H.web.length, 1);
  assert.equal(H.web[0][0], "page");
  assert.ok(H.web[0][1].startsWith("file://"), H.web[0][1]);
  assert.ok(H.web[0][1].endsWith("/mods/agent-page/pages/t63/2026-11-16-0430-b.html"), H.web[0][1]);
});

test("a page written while open is shown; one rewritten in place reloads", async (V) => {
  const folder = world();
  write(folder, "2026-11-16-0400-a.html");
  write(folder, "2026-11-16-0430-b.html");
  const v = await open(V);
  write(folder, "2026-11-16-0400-a.html", "<p>again</p>");
  await changed(folder, ["2026-11-16-0400-a.html"]);
  assert.match(render(v), /0400-a\.html {2}· {2}1\/2/);
  assert.deepEqual(H.calls, [], "a different page loads by src, no reload");
  await changed(folder, ["2026-11-16-0400-a.html"]);
  assert.deepEqual(H.calls, [["page", "reload"]]);
  assert.equal(H.watching.length, 3, "keeps watching");
});

test("events naming where a linked mod really is still count", async (V) => {
  const folder = world();
  write(folder, "1.html");
  write(folder, "2.html");
  const v = await open(V);
  H.wake(["/Users/amy/src/jay/herdr-app/mods/agent-page/pages/t63/1.html", "/elsewhere/agent-page/pages/t9/3.html"]);
  await settle();
  assert.match(render(v), /1\.html {2}· {2}1\/2/);
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

test("a change that isn't a page (or the folder itself) keeps the page shown", async (V) => {
  const folder = world();
  write(folder, "2026-11-16-0400-a.html");
  write(folder, "2026-11-16-0430-b.html");
  const v = await open(V);
  v.step(-1);
  write(folder, "pic.png", "x");
  await changed(folder, ["pic.png"]);
  assert.match(render(v), /0400-a\.html/);
  H.wake([folder]);
  await settle();
  assert.match(render(v), /0400-a\.html/);
});

test("◀ ▶ step through the folder and stop at its ends", async (V) => {
  const folder = world();
  for (const n of ["1.html", "2.html", "3.html"]) write(folder, n);
  const v = await open(V);
  v.step(1);
  assert.match(render(v), /3\.html {2}· {2}3\/3/);
  v.step(-1); v.step(-1); v.step(-1);
  assert.match(render(v), /1\.html {2}· {2}1\/3/);
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

test("Windows paths become file:///C:/…", async (V) => {
  world();
  const v = new V();
  v.init({}, cx);
  await settle();
  v.folder = "C:\\Users\\amy\\.config\\herdr-app\\mods\\agent-page\\pages\\t63";
  v.name = "a b#1.html";
  v.names = ["a b#1.html"];
  render(v);
  assert.equal(H.web[0][1], "file:///C:/Users/amy/.config/herdr-app/mods/agent-page/pages/t63/a%20b%231.html");
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
