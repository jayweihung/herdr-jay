// Tests for mods/gerrit/main.js without Herdr and without a real Gerrit: node tests/gerrit/run.js
// (macOS, Linux, Windows; Node 18+). The mod's imports (gpui-kit, gpui-base, herdr) are replaced by stubs, and
// fetch by a fake Gerrit that answers from the tables below and records every request.
// The render checks fail the way Herdr does: input state made while drawing, or a color that isn't one.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const MOD = join(here, "..", "..", "mods", "gerrit", "main.js");

// ---------- stubs for gpui-kit / gpui-base / herdr ----------
const H = (globalThis.__H = {
  rendering: false, store: {}, notes: [], runs: [], home: "", props: {}, layout: { id: "root", children: [] },
  colors: [],
});
const COLOR_METHODS = /(^bg$|color|^border_color$|^text_color$)/;
const el = new Proxy(function () {}, {
  get(_t, k) {
    if (k === "then") return undefined;
    return (...args) => {
      if (COLOR_METHODS.test(String(k))) for (const a of args) {
        if (typeof a === "string" && !/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(a))
          throw new Error(`${String(k)}(${JSON.stringify(a)}): not a color value`);
        if (a == null) throw new Error(`${String(k)}(${a}): not a color value`);
      }
      if (String(k) === "when") { if (args[0]) args[1](el); return el; }
      if (String(k) === "child" && args[0] === undefined) throw new Error("child(value) expects an element or a string");
      return el;
    };
  },
  apply: () => el,
});
const textState = (o) => {
  if (H.rendering) throw new Error("TextareaState.new() called while drawing");
  let v = o?.value ?? "";
  return { value: () => v, set_value: (x) => { v = x; }, set_auto_grow() {}, set_soft_wrap() {}, focus() {} };
};
globalThis.__stubs = {
  View: class {}, div: () => el, svg: () => el, v_flex: () => el, h_flex: () => el,
  Textarea: { new: () => el }, TextareaState: { new: textState },
  // theme colors as Herdr gives them: #rrggbb
  theme: () => new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : "#334455") }),
  settings: () => ({}), window: () => ({ platform: "macos" }),
  notify: (n) => H.notes.push(n), home: () => H.home,
  readTextFile: async (p) => readFileSync(p, "utf8"),
  run: (name, args) => H.runs.push([name, args]), layout: () => H.layout,
  shared: (k) => H.store[k], setShared: (k, v) => { H.store[k] = v; }, props: () => H.props,
};

// Load the mod with its imports swapped for the stubs.
function loadMod() {
  let src = readFileSync(MOD, "utf8");
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*"(gpui-kit|gpui-base|herdr)";\s*$/gm, (_m, names) =>
    `const {${names.replace(/\s+as\s+/g, ": ")}} = globalThis.__stubs;`);
  const dir = mkdtempSync(join(tmpdir(), "gerrit-test-"));
  const f = join(dir, "main.mjs");
  writeFileSync(f, src);
  return import(pathToFileURL(f).href).then((m) => { rmSync(dir, { recursive: true, force: true }); return m.default; });
}

// ---------- a fake Gerrit ----------
const P = ")]}'\n";
let routes = [], seen = [];
function gerrit(table) { routes = table; seen = []; }
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url), method = init.method ?? "GET";
  const req = { method, path: u.pathname, query: u.searchParams, raw: url, headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined };
  seen.push(req);
  for (const [m, re, reply] of routes) {
    if (m === method && re.test(u.pathname + u.search)) {
      const [status, body] = typeof reply === "function" ? reply(req) : reply;
      return { ok: status < 300, status, text: async () => (status >= 300 ? String(body) : P + JSON.stringify(body)) }; // errors come as plain text, answers as )]}' + JSON
    }
  }
  return { ok: false, status: 404, text: async () => `Not found: ${u.pathname}` };
};

// ---------- helpers ----------
const cx = { notify() {}, spawn: (f) => f(cx), sleep: async () => {}, viewport_size: () => ({ width: 1600 }) };
function setConfig(obj) {
  H.home = mkdtempSync(join(tmpdir(), "gerrit-home-"));
  mkdirSync(join(H.home, ".config", "herdr-app"), { recursive: true });
  if (obj !== undefined) writeFileSync(join(H.home, ".config", "herdr-app", "gerrit.json"), typeof obj === "string" ? obj : JSON.stringify(obj));
}
const LOGIN = { url: "https://gerrit.test/", user: "jay", http_password: "pw" };
const ME = { _account_id: 1000002, name: "Jay", username: "jay" };
const ALICE = { _account_id: 1000003, name: "Alice", username: "alice" };
const change = (n, extra = {}) => ({ id: `tools%2Fbuild~${n}`, _number: n, project: "tools/build", branch: "master", subject: `change ${n}`,
  owner: ALICE, updated: "2026-11-10 01:00:00.000000000", status: "NEW", labels: {}, ...extra });
function freshView(G) {
  H.store = {}; H.notes = []; H.runs = []; H.props = {};
  const g = new G();
  g.init({}, { timer: { every() {} }, spawn: () => {} });
  return g;
}
function render(g) {
  H.rendering = true;
  try { return g.render(cx); } finally { H.rendering = false; }
}

// ---------- tests ----------
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("readConfig: missing file, bad JSON, no url, trailing slash trimmed, auth only with both fields", async (G) => {
  setConfig(undefined); let g = freshView(G);
  assert.equal((await g.readConfig()).missing, true);
  setConfig("{ not json"); assert.match((await g.readConfig()).error, /格式不對/);
  setConfig({ user: "x" }); assert.match((await g.readConfig()).error, /沒有 url/);
  setConfig({ url: "https://g.test///", user: "jay" }); const c = await g.readConfig();
  assert.equal(c.url, "https://g.test"); assert.equal(c.auth, false);
  setConfig(LOGIN); assert.equal((await g.readConfig()).auth, true);
});

test("req: /a/ + Basic auth, strips )]}', 401 and 403 in words, no writes without a login", async (G) => {
  setConfig(LOGIN); const g = freshView(G); g.cfg = await g.readConfig();
  gerrit([["GET", /^\/a\/accounts\/self$/, [200, ME]], ["GET", /^\/a\/bad/, [401, "Unauthorized"]], ["GET", /^\/a\/deny/, [403, "no"]]]);
  assert.deepEqual(await g.get("/accounts/self"), ME);
  assert.equal(seen[0].headers.Authorization, `Basic ${Buffer.from("jay:pw").toString("base64")}`);
  await assert.rejects(g.get("/bad"), /帳號或 HTTP 密碼不對（401）/);
  await assert.rejects(g.get("/deny"), /沒有權限（403）/);
  setConfig({ url: "https://g.test" }); g.cfg = await g.readConfig();
  await assert.rejects(g.req("POST", "/changes/1/submit", {}), /HTTP 密碼/);
});

test("change ids in URLs: the number, never an already-escaped id escaped again", async (G) => {
  setConfig(LOGIN); const g = freshView(G); g.cfg = await g.readConfig();
  gerrit([["GET", /^\/a\/changes\/7\/detail/, [200, change(7, { revisions: {} })]], ["GET", /^\/a\/changes\/7\/comments$/, [200, {}]],
    ["GET", /^\/a\/changes\/tools%2Fbuild~8\/detail/, [200, change(8, { revisions: {} })]], ["GET", /^\/a\/changes\/tools%2Fbuild~8\/comments/, [200, {}]]]);
  await g.openChange(change(7), cx);
  assert.equal(g.detail.error, undefined); assert.equal(seen[0].path, "/a/changes/7/detail");
  await g.openChange({ id: "tools%2Fbuild~8" }, cx); // only an id (no number): escaped exactly once
  assert.equal(g.detail.error, undefined, g.detail.error);
  assert.ok(!seen.some((r) => r.raw.includes("%252F")), "id escaped twice");
});

test("poll: one batched request, each change in one section, version shown, data shared", async (G) => {
  setConfig(LOGIN); const g = freshView(G);
  gerrit([["GET", /^\/a\/accounts\/self$/, [200, ME]], ["GET", /^\/a\/config\/server\/version$/, [200, "3.14.2"]],
    ["GET", /^\/a\/changes\/\?q=/, (r) => [200, r.query.getAll("q").map((q, i) => (i === 0 ? [change(6)] : i === 3 ? [change(7)] : []))]]]);
  await g.poll(cx);
  const d = H.store["gerrit.data.v1"];
  assert.equal(d.err, null); assert.equal(d.version, "3.14.2"); assert.equal(d.self._account_id, ME._account_id);
  const qs = seen.find((r) => r.path === "/a/changes/").query.getAll("q");
  assert.equal(qs.length, 6, "one request for every section");
  qs.slice(2, 5).forEach((q) => assert.match(q, /-attention:self/, `"${q}" repeats 輪到你`));
  assert.ok(!qs.some((q) => /is:ignored/.test(q)), "is:ignored is gone in Gerrit 3.14");
  assert.deepEqual(d.sections.map((s) => s.items.length), [1, 0, 0, 1, 0, 0]);
});

test("poll on a Gerrit without attention (older than 3.3): 輪到你 says so, the rest still list", async (G) => {
  setConfig(LOGIN); const g = freshView(G);
  const old = (r) => { const q = r.query.getAll("q"); return q.some((x) => /attention/.test(x)) ? [400, "Unsupported operator attention:self"] : [200, q.length > 1 ? q.map(() => []) : [change(9)]]; };
  gerrit([["GET", /^\/a\/accounts\/self$/, [200, ME]], ["GET", /^\/a\/config\/server\/version$/, [200, "3.2.0"]], ["GET", /^\/a\/changes\/\?q=/, old]]);
  await g.poll(cx);
  const d = H.store["gerrit.data.v1"];
  assert.equal(d.err, null);
  assert.match(d.sections[0].error, /attention/);
  assert.deepEqual(d.sections.slice(1).map((s) => s.error), [null, null, null, null, null]);
  assert.equal(d.sections[2].items.length, 1, "my changes still listed without -attention:self");
});

test("notifications: none on the first check; a new turn and someone else's reply notify; my own reply doesn't; at most 3", async (G) => {
  setConfig(LOGIN); const g = freshView(G); g.cfg = await g.readConfig();
  const sec = (turn, rest) => [{ title: "輪到你", turn: true, items: turn }, { title: "我在 review（等對方）", items: rest }];
  const msgs = { 6: [{ author: ALICE, message: "Patch Set 1: Code-Review-1\n\nWhat about None?" }], 7: [{ author: ME, message: "Done" }] };
  gerrit([["GET", /^\/a\/changes\/(\d+)\/messages$/, (r) => [200, msgs[r.path.split("/")[3]] ?? []]]]);
  await g.tell(sec([], [change(6), change(7)]), ME);
  assert.equal(H.notes.length, 0, "first check only learns");
  await g.tell(sec([change(6, { updated: "2026-11-10 02:00:00.000000000", attention_set: { [ME._account_id]: { reason: "<GERRIT_ACCOUNT_1000003> replied" } } })],
    [change(7, { updated: "2026-11-10 02:00:00.000000000" })]), ME);
  assert.equal(H.notes.length, 1, JSON.stringify(H.notes.map((n) => n.title)));
  assert.match(H.notes[0].title, /^輪到你：#6/); assert.match(H.notes[0].body, /Alice/);
  const many = Array.from({ length: 6 }, (_, i) => change(20 + i, { updated: "2026-11-10 03:00:00.000000000" }));
  await g.tell(sec([], many), ME); await g.tell(sec([], many.map((c) => ({ ...c, updated: "2026-11-10 04:00:00.000000000" }))), ME);
  assert.ok(H.notes.length <= 1 + 3, "at most three per check");
  const g2 = freshView(G); g2.cfg = g.cfg; await g2.tell(sec([], [change(6)]), null); await g2.tell(sec([change(6)], []), null);
  assert.equal(H.notes.length, 0, "no login: nothing to tell");
});

test("reply: message + picked scores + drafts in one review; nothing to send → no request", async (G) => {
  setConfig(LOGIN); const g = freshView(G);
  gerrit([["POST", /^\/a\/changes\/7\/revisions\/current\/review$/, [200, {}]], ["GET", /^\/a\/changes\/7\//, [200, {}]]]);
  g.detail = { change: change(7) }; g.openId = g.detail.change.id;
  await g.sendReply(change(7), cx);
  assert.match(g.actErr, /沒有要送的/); assert.equal(seen.length, 0);
  g.replyState().set_value("  看過了  "); g.picked = { "Code-Review": 2, Verified: 1 };
  await g.sendReply(change(7), cx);
  const post = seen.find((r) => r.method === "POST");
  assert.deepEqual(post.body, { message: "看過了", labels: { "Code-Review": 2, Verified: 1 }, drafts: "PUBLISH_ALL_REVISIONS" });
  assert.equal(g.replyState().value(), ""); assert.deepEqual(g.picked, {});
  assert.ok(H.store["gerrit.refresh"], "lists asked to refresh");
});

test("thread reply: on the last comment's patch set and spot, resolved for Done", async (G) => {
  setConfig(LOGIN); const g = freshView(G);
  gerrit([["POST", /^\/a\/changes\/7\/revisions\/2\/review$/, [200, {}]], ["GET", /^\/a\/changes\/7\//, [200, {}]]]);
  g.detail = { change: change(7) }; g.openId = g.detail.change.id;
  const root = { id: "c1", path: "Makefile", line: 7, patch_set: 1 }, last = { id: "c2", path: "Makefile", line: 7, patch_set: 2, in_reply_to: "c1", side: "REVISION" };
  await g.replyThread(change(7), { root, msgs: [root, last] }, "Done", true, cx);
  assert.equal(g.actErr, null);
  assert.deepEqual(seen.find((r) => r.method === "POST").body, { comments: { Makefile: [{ in_reply_to: "c2", message: "Done", unresolved: false, line: 7, side: "REVISION" }] } });
});

test("submit: the first press only arms, the second submits", async (G) => {
  setConfig(LOGIN); const g = freshView(G);
  gerrit([["POST", /^\/a\/changes\/7\/submit$/, [200, change(7, { status: "MERGED" })]], ["GET", /^\/a\/changes\/7\//, [200, {}]]]);
  g.detail = { change: change(7) }; g.openId = g.detail.change.id;
  await g.submit(change(7), cx);
  assert.equal(seen.length, 0); assert.equal(g.armed, `submit-${change(7).id}`);
  await g.submit(change(7), cx);
  assert.equal(seen.filter((r) => r.method === "POST").length, 1);
});

test("diff rows: line numbers, long unchanged runs folded around changes, unfold, skip", async (G) => {
  const g = freshView(G);
  const ab = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i}`);
  const d = { content: [{ ab: ab(30, "x") }, { a: ["old"], b: ["new", "new2"] }, { ab: ab(30, "y") }, { skip: 5 }] };
  const rows = g.diffRows(d, new Set());
  // no context kept at the file's start; 3 lines kept on each side of a change (the run before skip isn't the end)
  assert.deepEqual(rows.map((r) => r.kind), ["fold", "ctx", "ctx", "ctx", "del", "add", "add", "ctx", "ctx", "ctx", "fold", "ctx", "ctx", "ctx", "skip"]);
  assert.equal(rows[0].n, 27); assert.equal(rows[10].n, 24); assert.equal(rows[14].n, 5);
  assert.deepEqual([rows[1].a, rows[4].a, rows[5].b, rows[6].b, rows[7].a, rows[7].b], [28, 31, 31, 32, 32, 33]);
  assert.equal(g.diffRows(d, new Set([0])).filter((r) => r.kind === "ctx").length, 30 + 6);
  const end = g.diffRows({ content: [{ a: ["x"] }, { ab: ab(30, "z") }] }, new Set());
  assert.deepEqual(end.map((r) => r.kind).slice(0, 5), ["del", "ctx", "ctx", "ctx", "fold"], "nothing kept at the file's end");
});

test("render: list, setup, change page, diff and the tab-bar button draw without Herdr's errors", async (G) => {
  setConfig(LOGIN);
  const g = freshView(G);
  H.layout = { id: "root", children: [{ id: "gerrit-toggle", content: { mod: "gerrit", props: { role: "toggle" } } }, { id: "gerrit-panel", size: { px: 460 } }] };
  H.store["gerrit.cfg.v1"] = { missing: true }; render(g);
  H.store["gerrit.cfg.v1"] = { url: "https://gerrit.test", auth: true };
  H.store["gerrit.data.v1"] = { at: Date.now(), err: null, version: "3.14.2", self: ME,
    sections: [{ title: "輪到你", turn: true, items: [change(6, { labels: { "Code-Review": { all: [{ ...ALICE, value: -1 }] } } })], error: null }, { title: "CC 我的", items: [], error: null }] };
  render(g);
  const rev = { _number: 2, files: { Makefile: { lines_inserted: 6, lines_deleted: 1 } }, commit: { message: "Makefile\n\nChange-Id: I1" }, kind: "REWORK", uploader: ALICE, created: "2026-11-10 01:00:00.000000000" };
  g.openId = "x"; g.detail = { change: { id: "x" }, loading: true }; render(g); // still loading: only an id
  g.detail = { change: change(7, { current_revision: "abc", revisions: { abc: rev }, submittable: true,
    permitted_labels: { "Code-Review": ["-2", "-1", " 0", "+1", "+2"] }, attention_set: { 1: { account: ME } }, messages: [{ author: ALICE, date: "2026-11-10 01:00:00.000000000", message: "hi" }] }),
    comments: { Makefile: [{ id: "c1", line: 7, patch_set: 2, author: ALICE, message: "q?", unresolved: true, updated: "2026-11-10 01:00:00.000000000" }] } };
  render(g);
  g.diff = { path: "Makefile", open: new Set(), data: { content: [{ ab: ["a"] }, { a: ["b"], b: ["c"] }] } }; render(g);
  g.lineBox = { key: "b:2", side: "b", line: 2, state: textState() }; render(g);
  H.props = { role: "toggle" }; const t = new G(); t.init({}, { timer: { every() {} }, spawn: () => {} }); render(t);
});

// ---------- run ----------
const G = await loadMod();
let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(G); console.log(`ok    ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${String(e.stack ?? e).split("\n").slice(0, 3).join("\n      ")}`); }
}
console.log(`\n${tests.length - fail} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
