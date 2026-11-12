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
// Herdr gives each copy its own localStorage; Node 22+ warns about its own unless replaced
const mem = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) } });
const H = (globalThis.__H = {
  rendering: false, store: {}, notes: [], runs: [], home: "", props: {}, layout: { id: "root", children: [] },
  colors: [], right: [], texts: [],
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
      if (String(k) === "on_mouse_down" && args[0] === "right") H.right.push(args[1]); // right-click copies: kept to press them
      if (String(k) === "on_mouse_down" && typeof args[1] !== "function") throw new Error("on_mouse_down(button, handler) expects a handler");
      if (String(k) === "child" && args[0] === undefined) throw new Error("child(value) expects an element or a string");
      return el;
    };
  },
  apply: () => el,
});
const textState = (o) => {
  if (H.rendering) throw new Error("TextareaState.new() called while drawing");
  let v = o?.value ?? "";
  const handlers = {};
  return { value: () => v, set_value: (x) => { v = x; }, set_auto_grow() {}, set_soft_wrap() {}, focus() {},
    on: (ev, fn) => { handlers[ev] = fn; return true; }, fire: (ev) => handlers[ev]?.({}, cx) };
};
globalThis.__stubs = {
  View: class {}, div: () => el, svg: () => el, v_flex: () => el, h_flex: () => el,
  Textarea: { new: () => el }, TextareaState: { new: textState }, Input: { new: () => el }, InputState: { new: textState },
  // a TextView: its id, its HTML and whether it was made selectable
  TextView: { html: (id, html) => { const v = { id, html, selectable: false }; H.texts.push(v); return { selectable: (on = true) => { v.selectable = on; return el; } }; } },
  // theme colors as Herdr gives them: #rrggbb
  theme: () => new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : "#334455") }),
  settings: () => ({}), window: () => H.window ?? { platform: "macos" },
  notify: (n) => H.notes.push(n), home: () => H.home,
  readTextFile: async (p) => readFileSync(p, "utf8"),
  run: (name, args) => H.runs.push([name, args]), layout: () => H.layout,
  process: { run: async (cmd, args) => { H.opened.push([cmd, ...args]); return { code: 0, stdout: "", stderr: "" }; } },
  agents: () => H.agents ?? [],
  hc: async (args) => { H.opened.push(["hc", ...args]); return { code: 0, stdout: "", stderr: "" }; },
  shared: (k) => H.store[k], setShared: (k, v) => { H.store[k] = v; }, props: () => H.props,
};

// Load the mod with its imports swapped for the stubs.
function loadMod() {
  let src = readFileSync(MOD, "utf8");
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*"(gpui-kit|gpui-base|herdr)";\s*$/gm, (_m, names) =>
    `const {${names.replace(/\s+as\s+/g, ": ")}} = globalThis.__stubs;`);
  src = src.replace(/^import process from "process";$/m, "const process = globalThis.__stubs.process;");
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

test("drafts: loaded with the change, shown in their thread, sent with 送出回覆, deletable", async (G) => {
  setConfig(LOGIN); const g = freshView(G);
  const t = "2026-11-10 01:00:00.000000000", later = "2026-11-10 02:00:00.000000000";
  const root = { id: "c1", patch_set: 1, author: ALICE, message: "What if price is None?", unresolved: true, updated: t, line: 4 };
  const draft = { id: "d1", patch_set: 1, in_reply_to: "c1", message: "Done in patch set 2", unresolved: false, updated: later, line: 4 };
  gerrit([["GET", /^\/a\/changes\/6\/detail/, [200, change(6, { revisions: {} })]],
    ["GET", /^\/a\/changes\/6\/comments$/, [200, { "src/cart.py": [root] }]],
    ["GET", /^\/a\/changes\/6\/drafts$/, [200, { "src/cart.py": [draft] }]],
    ["POST", /^\/a\/changes\/6\/revisions\/current\/review$/, [200, {}]],
    ["DELETE", /^\/a\/changes\/6\/revisions\/1\/drafts\/d1$/, [204, ""]]]);
  await g.openChange(change(6), cx);
  assert.equal(g.draftCount(), 1);
  const x = g.thread(g.withDrafts()["src/cart.py"]);
  assert.equal(x.root.id, "c1"); assert.equal(x.draft.id, "d1", "the draft sits in the thread it answers");
  assert.equal(x.unresolved, true, "still open until the draft is sent");
  render(g); // change page
  g.diff = { path: "src/cart.py", open: new Set(), data: { content: [{ ab: ["a", "b", "c", "d"] }] } }; render(g); g.diff = null; // diff
  await g.sendReply(g.detail.change, cx); // nothing typed, no score: the draft alone is worth sending
  assert.equal(g.actErr, null);
  assert.deepEqual(seen.find((r) => r.method === "POST").body, { drafts: "PUBLISH_ALL_REVISIONS" });
  await g.deleteDraft(g.detail.change, x.draft, cx);
  assert.ok(seen.some((r) => r.method === "DELETE" && r.path === "/a/changes/6/revisions/1/drafts/d1"));
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
  g.detail.change.actions = { abandon: { enabled: true }, wip: { enabled: true } }; g.detail.change.revisions.abc.actions = { rebase: { enabled: true } };
  g.diff = null; g.detail.change.reviewers = { REVIEWER: [ME], CC: [ALICE] }; g.addingPeople = true; g.found = [ALICE]; render(g); // people box open
  g.detail.change = { ...g.detail.change, status: "ABANDONED", actions: { restore: { enabled: true } } }; render(g); // abandoned: 恢復
  H.props = { role: "toggle" }; const t = new G(); t.init({}, { timer: { every() {} }, spawn: () => {} }); render(t);
});

test("people: find by name, add as reviewer or CC (moving is the same call), remove", async (G) => {
  setConfig(LOGIN); const g = freshView(G);
  gerrit([["GET", /^\/a\/accounts\/\?suggest/, (r) => [200, r.query.get("q") === "ali" ? [ALICE] : []]],
    ["POST", /^\/a\/changes\/7\/reviewers$/, [200, {}]], ["POST", /^\/a\/changes\/7\/reviewers\/1000003\/delete$/, [204, ""]], ["GET", /^\/a\/changes\/7\//, [200, {}]]]);
  g.detail = { change: change(7) }; g.openId = g.detail.change.id;
  g.peopleState().set_value(" ali "); await g.findPeople(cx);
  assert.deepEqual(g.found, [ALICE]); assert.equal(seen[0].query.get("q"), "ali");
  await g.addPerson(change(7), ALICE, "CC", cx);
  assert.deepEqual(seen.find((r) => r.method === "POST").body, { reviewer: "1000003", state: "CC" });
  assert.deepEqual(g.found, []); assert.equal(g.peopleState().value(), "", "box cleared after adding");
  await g.removePerson(change(7), ALICE, cx);
  assert.ok(seen.some((r) => r.method === "POST" && r.path === "/a/changes/7/reviewers/1000003/delete"));
  g.peopleState().set_value("nobody"); await g.findPeople(cx); assert.match(g.actErr, /找不到「nobody」/);
});

test("search: a number or a Gerrit link opens the change; other text is a Gerrit search; Enter searches", async (G) => {
  setConfig(LOGIN); const g = freshView(G);
  gerrit([["GET", /^\/a\/changes\/\d+\/detail/, (r) => [200, change(Number(r.path.split("/")[3]), { revisions: {} })]], ["GET", /^\/a\/changes\/\d+\/comments/, [200, {}]],
    ["GET", /^\/a\/changes\/\?q=/, (r) => [200, /owner:alice/.test(r.query.get("q")) ? [change(1), change(6)] : []]]]);
  const opens = { "7": 7, "#12": 12, "https://gerrit.test/c/tools/build/+/345": 345, "https://gerrit.test/c/tools/build/+/345/2#message-x": 345,
    "https://gerrit.test/#/c/77/": 77, "https://gerrit.test/88": 88, "https://gerrit.test/88/3": 88 };
  for (const [text, n] of Object.entries(opens)) {
    g.searchState().set_value(text); await g.runSearch(cx);
    assert.equal(g.detail?.change?._number, n, text); assert.equal(g.search, null, text);
  }
  g.openId = null; g.detail = null;
  g.searchState().set_value("owner:alice is:open"); g.searchState().fire("submit");
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(g.search.items.map((c) => c._number), [1, 6]);
  assert.equal(seen.at(-1).query.get("q"), "owner:alice is:open limit:50");
  render(g); // the results draw
  g.searchState().set_value("2024"); await g.runSearch(cx); assert.equal(g.detail?.change?._number, 2024, "a bare number is a change number");
  g.openId = null; g.detail = null;
  g.searchState().set_value("nothing:here"); await g.runSearch(cx); assert.deepEqual(g.search.items, []); render(g);
  g.searchState().set_value(""); await g.runSearch(cx); assert.equal(g.search, null, "empty search goes back to the sections");
});

test("change actions: rebase / ready / wip / restore post once, abandon only on the second press", async (G) => {
  setConfig(LOGIN); const g = freshView(G);
  gerrit([["POST", /^\/a\/changes\/7\/(abandon|restore|wip|ready|revisions\/current\/rebase)$/, [200, {}]], ["GET", /^\/a\/changes\/7\//, [200, {}]]]);
  g.detail = { change: change(7) }; g.openId = g.detail.change.id;
  for (const what of ["rebase", "ready", "wip", "restore"]) await g.changeAction(change(7), what, cx);
  assert.deepEqual(seen.filter((r) => r.method === "POST").map((r) => r.path),
    ["/a/changes/7/revisions/current/rebase", "/a/changes/7/ready", "/a/changes/7/wip", "/a/changes/7/restore"]);
  seen.length = 0;
  await g.changeAction(change(7), "abandon", cx); assert.equal(seen.length, 0, "first press only arms");
  await g.changeAction(change(7), "abandon", cx); assert.equal(seen.filter((r) => r.path === "/a/changes/7/abandon").length, 1);
});

test("compare patch sets: files and diff of the picked pair, comments on the right revision", async (G) => {
  setConfig(LOGIN); const g = freshView(G);
  gerrit([["GET", /^\/a\/changes\/6\/revisions\/\d+\/files\?base=\d+$/, [200, { "/COMMIT_MSG": { lines_inserted: 1 }, "src/cart.py": { lines_inserted: 28, lines_deleted: 1 } }]],
    ["GET", /^\/a\/changes\/6\/revisions\/1\/files$/, [200, { "/COMMIT_MSG": {}, "src/cart.py": {} }]],
    ["GET", /^\/a\/changes\/6\/revisions\/\w+\/files\/src%2Fcart\.py\/diff/, [200, { content: [{ a: ["x"], b: ["y"] }] }]],
    ["POST", /^\/a\/changes\/6\/revisions\/\d+\/review$/, [200, {}]], ["GET", /^\/a\/changes\/6\//, [200, {}]]]);
  const c6 = change(6, { current_revision: "s2", revisions: { s1: { _number: 1, files: {} }, s2: { _number: 2, files: { "src/cart.py": {} } } } });
  g.detail = { change: c6, comments: {} }; g.openId = c6.id;
  assert.equal(g.comparing(), false); assert.deepEqual(Object.keys(g.shownFiles()), ["src/cart.py"]);
  await g.setCompare(1, 2, cx);
  assert.equal(seen.at(-1).raw.endsWith("/a/changes/6/revisions/2/files?base=1"), true);
  assert.deepEqual(Object.keys(g.shownFiles()), ["/COMMIT_MSG", "src/cart.py"], "commit message counts between two patch sets");
  await g.openDiff("src/cart.py", cx);
  assert.ok(seen.at(-1).raw.endsWith("/revisions/2/files/src%2Fcart.py/diff?base=1"), seen.at(-1).raw);
  // a comment on the left side goes to patch set 1 (no PARENT); on the right to 2
  for (const [side, rev, extra] of [["a", 1, {}], ["b", 2, {}]]) {
    g.lineBox = { key: `${side}:1`, side, line: 1, state: textState({ value: "hm" }) };
    await g.sendLineComment(c6, "src/cart.py", true, cx);
    const post = seen.filter((r) => r.method === "POST").at(-1);
    assert.equal(post.path, `/a/changes/6/revisions/${rev}/review`, `${side} side`);
    assert.deepEqual(post.body, { comments: { "src/cart.py": [{ line: 1, message: "hm", unresolved: true, ...extra }] } });
  }
  g.detail = { change: c6, comments: {} }; // sending reloads the change from the fake Gerrit: put it back
  // Base → 1: no commit message, and Base → latest is the normal view again
  await g.setCompare(null, 1, cx); assert.deepEqual(Object.keys(g.shownFiles()), ["src/cart.py"]);
  await g.setCompare(2, 1, cx); assert.deepEqual(g.cmp, { base: null, to: 1 }, "from must be older than to");
  await g.setCompare(null, 2, cx); assert.equal(g.comparing(), false); assert.equal(g.cmpFiles, null);
  // draws: picker and a compared diff with a thread from patch set 1 on the left
  g.detail.comments = { "src/cart.py": [{ id: "k", line: 1, patch_set: 1, author: ALICE, message: "?", unresolved: true, updated: "2026-11-10 01:00:00.000000000" }] };
  await g.setCompare(1, 2, cx); g.diff = null; render(g); await g.openDiff("src/cart.py", cx); render(g);
});

test("topic: other changes of the topic, whole-topic submit warning, set / clear, click searches it", async (G) => {
  setConfig(LOGIN); const g = freshView(G);
  const t6 = change(6, { topic: "cart total", revisions: {}, actions: { topic: { enabled: true } }, submittable: true });
  gerrit([["GET", /^\/a\/changes\/6\/detail/, [200, t6]], ["GET", /^\/a\/changes\/6\/comments/, [200, {}]],
    ["GET", /^\/a\/changes\/6\/submitted_together/, [200, { changes: [t6, change(7), change(4)], non_visible_changes: 1 }]],
    ["GET", /^\/a\/changes\/\?q=/, (r) => [200, r.query.get("q").startsWith('topic:"cart total"') ? [t6, change(7), change(4)] : []]],
    ["PUT", /^\/a\/changes\/6\/topic$/, [200, "\"x\""]], ["DELETE", /^\/a\/changes\/6\/topic$/, [204, ""]]]);
  await g.openChange(change(6), cx);
  assert.deepEqual(g.detail.topic.map((c) => c._number), [7, 4], "the others, not this one");
  assert.equal(g.detail.together.changes.length, 3);
  render(g);
  g.topicState().set_value(" next "); await g.setTopic(g.detail.change, cx);
  assert.deepEqual(seen.find((r) => r.method === "PUT").body, { topic: "next" });
  g.editTopic = true; render(g); // the edit box draws
  g.topicState().set_value(""); await g.setTopic(g.detail.change, cx);
  assert.ok(seen.some((r) => r.method === "DELETE" && r.path === "/a/changes/6/topic"), "empty = remove the topic");
  g.searchFor('topic:"cart total"', cx); await new Promise((r) => setTimeout(r, 0));
  assert.equal(g.detail, null); assert.equal(g.search.q, 'topic:"cart total"'); assert.equal(g.search.items.length, 3);
});

test("← 返回 goes back one page: list → change → its topic → another change → a file, and back again", async (G) => {
  setConfig(LOGIN); const g = freshView(G);
  const full = (n) => change(n, { topic: "t", current_revision: "s", revisions: { s: { _number: 1, files: { "a.py": {} } } } });
  gerrit([["GET", /^\/a\/changes\/(\d+)\/detail/, (r) => [200, full(Number(r.path.split("/")[3]))]], ["GET", /^\/a\/changes\/\d+\/(comments|submitted_together)/, [200, {}]],
    ["GET", /^\/a\/changes\/\d+\/revisions\/\w+\/files\/a\.py\/diff/, [200, { content: [{ b: ["x"] }] }]],
    ["GET", /^\/a\/changes\/\?q=/, [200, [full(6), full(7)]]]]);
  const where = () => g.diff ? `diff ${g.detail.change._number}` : g.detail ? `change ${g.detail.change._number}` : g.search ? `search ${g.search.q}` : "list";
  g.remember(); await g.openChange(change(6), cx);                 // click a row in the list
  g.searchFor('topic:"t"', cx); await new Promise((r) => setTimeout(r, 0)); // click the topic
  assert.equal(where(), 'search topic:"t"'); render(g);
  g.remember(); await g.openChange(change(7), cx);                 // click #7 in the results
  g.remember(); await g.openDiff("a.py", cx);                      // click a file
  const back = [];
  for (let i = 0; i < 5; i++) { back.push(where()); g.goBack(cx); render(g); }
  assert.deepEqual(back, ["diff 7", "change 7", 'search topic:"t"', "change 6", "list"]);
  assert.equal(g.searchState().value(), "", "the search box shows the page's own text");
  assert.equal(where(), "list");
  // started on a change (its own tab): nothing remembered, back still goes up a level
  const h = freshView(G); await h.openChange(change(6), cx); await h.openDiff("a.py", cx);
  h.goBack(cx); assert.equal(h.diff, null); h.goBack(cx); assert.equal(h.detail, null);
});

test("submit requirements: missing first, votes from the labels in the expression, many passed ones fold", async (G) => {
  setConfig(LOGIN); const g = freshView(G);
  H.store["gerrit.cfg.v1"] = { url: "https://gerrit.test", auth: true };
  H.layout = { id: "root", children: [{ id: "gerrit-toggle" }] };
  const req = (name, status, expr = `label:${name}=MAX AND -label:${name}=MIN`) => ({ name, status, submittability_expression_result: { expression: expr } });
  const names = ["Code-Review", "Lint-Review", "Verified", "Test", "Build", "Commit-Check", "Coverage-Check", "Style-Check"];
  const c = change(9, { revisions: {}, labels: { "Code-Review": { all: [{ ...ALICE, value: 1 }] }, Test: { all: [{ ...ME, value: 2 }, { ...ALICE, value: -2 }] }, Build: { all: [] } },
    submit_requirements: [...names.map((n, i) => req(n, i < 3 ? "UNSATISFIED" : "SATISFIED")), req("Mandatory-Review", "ERROR"), req("Old", "NOT_APPLICABLE"),
      req("Non-Author-Code-Review", "UNSATISFIED", "label:Code-Review=MAX,user=non_uploader")] });
  g.openId = c.id; g.detail = { change: c, comments: {} };
  const rows = g.requirementRows(globalThis.__stubs.theme(), 13, c, c.submit_requirements.filter((r) => r.status !== "NOT_APPLICABLE"));
  assert.equal(rows.length, 1 + 5 + 1, "title, 5 not passed (3 missing, ERROR, non-author), one folded line for 5 passed");
  render(g);
  g.showPassed = c.id;
  assert.equal(g.requirementRows(globalThis.__stubs.theme(), 13, c, c.submit_requirements.filter((r) => r.status !== "NOT_APPLICABLE")).length, 1 + 10);
  render(g);
});

test("check systems: bot messages on the current patch set under the requirement they vote on, links open", async (G) => {
  setConfig(LOGIN); const g = freshView(G);
  H.store["gerrit.cfg.v1"] = { url: "https://gerrit.test", auth: true };
  H.layout = { id: "root", children: [{ id: "gerrit-toggle" }] };
  H.opened = [];
  const bot = (id, name) => ({ _account_id: id, name, username: name });
  const CI = bot(50, "ci_build"), TEST = bot(51, "ci_test"), LINT = bot(52, "ci_lint");
  const m = (author, ps, message, date = "2026-11-10 01:00:00.000000000") => ({ author, _revision_number: ps, date, message });
  const req = (name, status) => ({ name, status, submittability_expression_result: { expression: `label:${name}=MAX` } });
  const c = change(11, { current_revision: "b", revisions: { a: { _number: 1 }, b: { _number: 2 } },
    labels: { Build: { all: [{ ...CI, value: 2 }] }, Test: { all: [] } },
    submit_requirements: [req("Build", "SATISFIED"), req("Test", "UNSATISFIED")],
    messages: [
      m(TEST, 1, "Patch Set 1: Test+2\n\n[Test Farm] Test result : PASS"),
      m(ALICE, 2, "Patch Set 2:\n\nlooks fine"),
      m(CI, 2, "Patch Set 2:\n\n. [Preflight(Linux)][PF_ID: X-1] ... Starts ... Details: https://ci.example.com/pf/change.html?change=11"),
      m(CI, 2, "Patch Set 2: Build+2\n\n[Preflight(Linux)][PF_ID: X-1]<< Build PASS >>\nDashboard url: https://ci.example.com/pf/change.html?change=11"),
      m(TEST, 2, "Patch Set 2:\n\n[PF_ID: X-1]Here is a new job with this change registered to test"),
      m(LINT, 2, "Patch Set 2:\n\n[Lint] Started https://lint.example.com/run/7"),
    ] });
  g.openId = c.id; g.detail = { change: c, comments: {} };
  const sys = g.systemsOf(c);
  const by = Object.fromEntries(sys.map((s) => [s.name, s]));
  assert.deepEqual(Object.keys(by).sort(), ["ci_build", "ci_lint", "ci_test"], "Alice's comment is no system");
  assert.equal(by.ci_build.state, "pass"); assert.equal(by.ci_build.tag, "Preflight(Linux)");
  assert.deepEqual(by.ci_build.links, ["https://ci.example.com/pf/change.html?change=11"], "the same link once");
  assert.equal(by.ci_test.state, "run", "patch set 1's PASS does not count for patch set 2");
  assert.deepEqual(by.ci_test.labels, ["Test"], "but it says which label the system votes on");
  assert.equal(by.ci_lint.state, "run");
  const rows = g.requirementRows(globalThis.__stubs.theme(), 13, c, c.submit_requirements);
  // title, Test (missing) + its running system, Build (passed; its system is done so hidden), "其他檢查" + lint
  assert.equal(rows.length, 1 + 2 + 1 + 2);
  render(g);
  await g.openLink("https://ci.example.com/x");
  assert.deepEqual(H.opened.at(-1), ["/usr/bin/open", "https://ci.example.com/x"]);
  await g.openLink("file:///etc/passwd");
  assert.equal(H.opened.length, 1, "only web links open");
  g.cfg = { ...g.cfg, bots: "^ci_(build|test)$" };
  assert.deepEqual(g.systemsOf(c).map((s) => s.name).sort(), ["ci_build", "ci_test"], "gerrit.json bots picks the accounts");
});

test("ask an agent: only agents the start button opened are listed; a preset prompt goes by hc send, then focus", async (G) => {
  setConfig(LOGIN); const g = freshView(G); g.cfg = await g.readConfig();
  H.store["gerrit.cfg.v1"] = { url: "https://gerrit.test", auth: true }; delete H.store["gerrit.agents.v1"];
  H.opened = []; H.runs = [];
  const c = change(7, { project: "tools/build", branch: "master", current_revision: "b", revisions: { b: { _number: 3 } } });
  g.openId = c.id; g.detail = { change: c, comments: {} };
  g.cfg = { ...g.cfg, agent: { start: ["claude", "--plugin-dir", "/x/gerrit-mcp-server"], name: "gerrit" } };
  // other agents exist, but none was started here: none is offered, nothing is sent
  H.agents = [{ address: "t9", title: "coding", tab_name: "x" }];
  assert.deepEqual(g.agentList(), [], "an agent the panel didn't start is not offered");
  assert.equal(g.pickedAgent(g.agentList()), null);
  render(g);
  await g.askAgent(c, g.agentCfg().prompts[0], cx);
  assert.match(g.ask.error, /先選/); assert.equal(H.opened.length, 0, "nothing sent without a Gerrit agent");
  // start one: the new address that shows up is remembered (shared, so every copy knows it)
  g.startAgent(cx);
  assert.deepEqual(H.runs.at(-1), ["terminal.open", { argv: ["claude", "--plugin-dir", "/x/gerrit-mcp-server"], name: "gerrit", place: "right", folder: undefined }]);
  assert.equal(g.agentList().length, 0, "still starting");
  H.agents = [...H.agents, { address: "t3w", title: "✳ Claude Code", tab_name: "x" }];
  assert.deepEqual(g.agentList().map((x) => x.address), ["t3w"]);
  assert.deepEqual(H.store["gerrit.agents.v1"], ["t3w"]);
  assert.equal(g.pickedAgent(g.agentList()).address, "t3w", "picked by itself");
  await g.askAgent(c, { label: "R", text: "review {change} ps {patchset} at {url} {nope}" }, cx);
  assert.deepEqual(H.opened.at(-1), ["hc", "send", "t3w", "review 7 ps 3 at https://gerrit.test/c/tools/build/+/7 {nope}"]);
  assert.deepEqual(H.runs.at(-1), ["agent.focus", { terminal: "t3w" }]);
  assert.equal(g.ask.sent, "R");
  render(g);
  // a fresh copy (another tab) sees it too; when its pane is closed it is forgotten
  const kept = H.store; const g2 = freshView(G); H.store = kept; g2.cfg = g.cfg;
  assert.deepEqual(g2.agentList().map((x) => x.address), ["t3w"]);
  H.agents = [{ address: "t9", title: "coding", tab_name: "x" }];
  assert.deepEqual(g2.agentList(), []); assert.deepEqual(H.store["gerrit.agents.v1"], []);
  g.cfg = { ...g.cfg, agent: { prompts: [{ label: "Mine", text: "x {change}" }] } };
  assert.deepEqual(g.agentCfg().prompts.map((p) => p.label), ["Mine"], "gerrit.json prompts replace the presets");
  render(g);
  H.agents = [];
});

test("ask an agent: presets call the gerrit-panel skills; ✎ edits them (saved for every copy), 還原預設 brings the built-in ones back", async (G) => {
  setConfig(LOGIN); const g = freshView(G); g.cfg = await g.readConfig();
  const builtIn = g.agentCfg().prompts;
  assert.ok(builtIn.every((p) => /^\/gerrit-panel:[a-z-]+ \{change\} \{patchset\} \{url\}( \{requirements\})?$/.test(p.text)), "every preset calls a gerrit-panel skill");
  const rv = g.promptVars({ _number: 6, project: "demo", mergeable: false,
    submit_requirements: [{ name: "Code-Review", status: "UNSATISFIED" }, { name: "Verified", status: "SATISFIED" }, { name: "Old", status: "NOT_APPLICABLE" }] });
  assert.equal(rv.requirements, "（面板看到：合併條件未過：Code-Review；合併衝突）", "why-blocked gets what the panel sees");
  assert.equal(g.promptVars({ _number: 6, project: "demo" }).requirements, "", "nothing known: nothing added");
  for (const p of builtIn) {
    const name = p.text.match(/^\/gerrit-panel:([a-z-]+)/)[1];
    const md = readFileSync(new URL(`../../agents/gerrit-panel/skills/${name}/SKILL.md`, import.meta.url), "utf8");
    assert.ok(new RegExp(`^name: ${name}$`, "m").test(md), `skill ${name} exists with that name`);
    assert.ok(/Traditional Chinese/.test(md), `skill ${name} answers in Traditional Chinese`);
  }
  g.editPrompts(cx);
  assert.equal(g.promptEdit.length, builtIn.length);
  g.promptEdit[0].label.set_value("看一下"); g.promptEdit[0].text.set_value("看 {change}，用中文");
  g.promptEdit[1].label.set_value("");                    // an empty one is dropped
  g.promptEdit.push(g.editRow({ label: "新的", text: "x {url}" }));
  render(g);
  // press 儲存 the way the button does
  const rows = g.promptEdit;
  const list = rows.map((r) => ({ label: r.label.value().trim(), text: r.text.value().trim() })).filter((p) => p.label && p.text);
  H.store["gerrit.prompts.v1"] = list; g.promptEdit = null;
  const got = g.agentCfg().prompts.map((p) => p.label);
  assert.deepEqual(got, ["看一下", builtIn[2].label, builtIn[3].label, "新的"]);
  g.cfg = { ...g.cfg, agent: { prompts: [{ label: "json", text: "j" }] } };
  assert.deepEqual(g.agentCfg().prompts.map((p) => p.label)[0], "看一下", "edited in the panel beats gerrit.json");
  H.store["gerrit.prompts.v1"] = null;
  assert.deepEqual(g.agentCfg().prompts.map((p) => p.label), ["json"], "還原: gerrit.json's again");
  render(g);
});

test("Jenkins with only start_job: a ▶ button, no build polling, the POST carries the change", async (G) => {
  setConfig({ ...LOGIN, jenkins: { url: "https://ci.test/jk", user: "me", token: "tk", start_job: "Preflight_Common", start_params: { TRIGGER_BY: "NA" } } });
  const g = freshView(G); g.cfg = await g.readConfig();
  gerrit([]);
  const gfetch = globalThis.fetch, posts = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.host !== "ci.test") return gfetch(url, init);
    posts.push({ path: u.pathname, method: init.method, body: init.body, auth: (init.headers ?? {}).Authorization });
    return { ok: true, status: 201, text: async () => "" };
  };
  try {
    const c7 = change(7, { revisions: {}, status: "NEW" });
    g.detail = { change: c7, comments: {} }; g.openId = c7.id;
    await g.loadJenkins(c7, cx);
    assert.equal(posts.length, 0, "nothing to watch, nothing asked");
    assert.ok(g.jenkinsCard(globalThis.__stubs.theme(), 13, c7), "the card with the button is there");
    assert.equal(g.jenkinsCfg().start_label, undefined);
    g.cfg = { ...g.cfg, jenkins: { ...g.cfg.jenkins, start_label: "Preflight" } };
    const labels = []; const big = g.big; g.big = (t, z, id, label, o) => { labels.push(label); return big.call(g, t, z, id, label, o); };
    g.jenkinsCard(globalThis.__stubs.theme(), 13, c7); g.big = big;
    assert.deepEqual(labels, ["▶ Preflight"], "start_label names the button");
    await g.startJenkins(c7, cx);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].path, "/jk/job/Preflight_Common/buildWithParameters");
    assert.equal(posts[0].method, "POST");
    assert.match(posts[0].body, /GERRIT_CHANGE=7/); assert.match(posts[0].body, /TRIGGER_BY=NA/);
    assert.ok(posts[0].auth?.startsWith("Basic "));
    assert.ok(g.jk.startedAt && !g.jk.error);
    render(g);
    assert.equal(g.jenkinsCard(globalThis.__stubs.theme(), 13, change(8, { revisions: {}, status: "MERGED" })), null, "no button on a merged change");
  } finally { globalThis.fetch = gfetch; }
});

test("Jenkins: builds whose parameter has the change, queue, start, log tail, token only to the Jenkins address", async (G) => {
  setConfig({ ...LOGIN, jenkins: { url: "https://ci.test/jk/", user: "me", token: "tk", jobs: ["Preflight"], start_job: "Preflight_Common" } });
  const g = freshView(G); g.cfg = await g.readConfig();
  const P = (o) => ({ parameters: Object.entries(o).map(([name, value]) => ({ name, value })) });
  const now = Date.now();
  let log = "line 1\nline 2\n";
  gerrit([]);
  const gfetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.host !== "ci.test") return gfetch(url, init);
    seen.push({ method: init.method ?? "GET", raw: url, path: u.pathname, headers: init.headers ?? {}, body: init.body });
    const ok = (body, status = 200) => ({ ok: status < 300, status, text: async () => body });
    if (u.pathname === "/jk/job/Preflight/api/json") return ok(JSON.stringify({ builds: [
      { number: 12, building: true, timestamp: now - 600000, estimatedDuration: 1800000, actions: [P({ GERRIT_CHANGE: "7,66", TRIGGER_BY: "jay" }), {}] },
      { number: 11, building: false, result: "FAILURE", timestamp: now - 7200000, duration: 480000, actions: [P({ GERRIT_CHANGE: "77" })] },
      { number: 10, building: false, result: "SUCCESS", timestamp: now - 9000000, duration: 2700000, actions: [{}, P({ GERRIT_CHANGE: "7" })] }] }));
    if (u.pathname === "/jk/queue/api/json") return ok(JSON.stringify({ items: [{ id: 5, why: "Waiting", inQueueSince: now - 60000, task: { name: "Preflight" }, actions: [P({ GERRIT_CHANGE: "7" })] },
      { id: 6, why: "x", inQueueSince: now, task: { name: "Other" }, actions: [P({ GERRIT_CHANGE: "7" })] }] }));
    if (u.pathname === "/jk/job/Preflight_Common/buildWithParameters") return ok("", 201);
    if (u.pathname === "/jk/job/Preflight/12/consoleText") return ok(log);
    if (u.pathname === "/jk/job/Preflight/12/logText/progressiveText") return ok(Buffer.from(log).subarray(Number(u.searchParams.get("start"))).toString());
    return ok("nope", 404);
  };
  try {
    const c7 = change(7, { revisions: {} });
    g.detail = { change: c7, comments: {} }; g.openId = c7.id;
    await g.loadJenkins(c7, cx);
    assert.equal(g.jk.error, null);
    assert.deepEqual(g.jk.builds.map((b) => b.number), [12, 10], "7 is in \"7,66\" and \"7\", not in \"77\"");
    assert.deepEqual(g.jk.queue.map((q) => q.id), [5], "only the configured jobs' queue");
    assert.ok(seen.filter((r) => r.raw.startsWith("https://ci.test/")).every((r) => r.headers.Authorization === `Basic ${Buffer.from("me:tk").toString("base64")}`));
    assert.ok(!seen.some((r) => !r.raw.startsWith("https://ci.test/jk/") && r.headers.Authorization?.includes(Buffer.from("me:tk").toString("base64"))), "the token goes only to Jenkins");
    await g.startJenkins(c7, cx);
    const post = seen.find((r) => r.method === "POST");
    assert.equal(post.path, "/jk/job/Preflight_Common/buildWithParameters"); assert.equal(post.body, "GERRIT_CHANGE=7");
    const b12 = g.jk.builds[0];
    await g.tailLog(b12, cx); assert.equal(g.jk.logs[b12.path].text, "line 1\nline 2\n"); assert.equal(g.jk.logs[b12.path].bytes, 14);
    log += "第三行\n"; await g.tailLog(b12, cx, true);
    assert.ok(seen.at(-1).raw.endsWith("/logText/progressiveText?start=14"), "only what was added");
    assert.equal(g.jk.logs[b12.path].text, "line 1\nline 2\n第三行\n"); assert.equal(g.jk.logs[b12.path].bytes, 14 + 10, "UTF-8 bytes");
    render(g);
    // the build finishing is told once
    H.notes = []; g.jk.builds[0] = { ...b12, building: true };
    const fin = globalThis.fetch; globalThis.fetch = async (url, init) => (url.includes("/job/Preflight/api/json")
      ? { ok: true, status: 200, text: async () => JSON.stringify({ builds: [{ number: 12, building: false, result: "SUCCESS", timestamp: now - 600000, duration: 900000, actions: [P({ GERRIT_CHANGE: "7" })] }] }) } : fin(url, init));
    await g.loadJenkins(c7, cx); assert.equal(H.notes.length, 1); assert.match(H.notes[0].title, /Preflight 成功：#7/);
    globalThis.fetch = fin;
    // a wrong token says so
    globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => "" });
    g.jk.nextAt = 0; await g.loadJenkins(c7, cx); assert.match(g.jk.error, /API token 不對（401）/); render(g);
  } finally { globalThis.fetch = gfetch; }
});

test("copying: messages, comments, logs and the commit message are selectable text; a right-click copies one value and says 已複製", async (G) => {
  setConfig(LOGIN);
  const g = freshView(G);
  H.store["gerrit.cfg.v1"] = { url: "https://gerrit.test", auth: true };
  H.store["gerrit.data.v1"] = { at: Date.now(), err: null, self: ME, sections: [{ title: "輪到你", turn: true, items: [change(6)], error: null }] };
  // a right-click as Herdr gives it: what reaches the clipboard, and whether it went further
  const press = (fn) => { const got = { text: null, stopped: false }; fn({ button: "right" }, { write_to_clipboard: (x) => { got.text = x; }, stop_propagation: () => { got.stopped = true; } }); return got; };
  const copied = () => H.right.map(press).filter((x) => x.text != null);
  H.right = []; render(g);
  let texts = copied().map((x) => x.text);
  assert.ok(texts.includes("https://gerrit.test/c/tools/build/+/6"), "a list row copies the change's address");
  assert.ok(texts.includes("6"), "its number copies the number");
  const rev = { _number: 2, files: { "src/a.py": { lines_inserted: 1 } }, commit: { message: "Fix a < b\n\nline two & more\n\nChange-Id: I1" }, uploader: ALICE, created: "2026-11-10 01:00:00.000000000" };
  g.openId = "x";
  g.detail = { change: change(7, { current_revision: "abc123", revisions: { abc123: rev }, messages: [{ author: ALICE, date: "2026-11-10 01:00:00.000000000", message: "Patch Set 2:\n\nlooks <ok>" }] }),
    comments: { "src/a.py": [{ id: "c1", line: 7, patch_set: 2, author: ALICE, message: "why\nthis?", unresolved: true, updated: "2026-11-10 01:00:00.000000000" }] } };
  H.right = []; H.texts = []; H.notes = []; render(g);
  const sel = (re) => H.texts.find((v) => re.test(v.html));
  assert.equal(sel(/Change-Id/)?.selectable, true, "the commit message is selectable");
  assert.match(sel(/Change-Id/).html, /Fix a &lt; b<br><br>line two &amp; more<br><br>Change-Id: I1/, "escaped, line breaks kept");
  assert.equal(sel(/why<br>this\?/)?.selectable, true, "a code comment is selectable");
  assert.equal(sel(/looks &lt;ok&gt;/)?.selectable, true, "a change-log message is selectable");
  assert.equal(sel(/^<p>change 7<\/p>$/)?.selectable, true, "the subject is selectable");
  const all = copied();
  texts = all.map((x) => x.text);
  for (const want of ["https://gerrit.test/c/tools/build/+/7", "tools/build", "master", "Alice", "src/a.py", "src/a.py:7", "abc123", rev.commit.message])
    assert.ok(texts.includes(want), `right-click copies ${want}`);
  assert.ok(all.every((x) => x.stopped), "a copying right-click goes no further");
  assert.ok(H.notes.length > 0 && H.notes.every((n) => n.title === "已複製" && n.level === "success"), "each copy says 已複製");
  // a diff: right-click a line copies it; the header copies the file's path
  g.diff = { path: "src/a.py", open: new Set(), base: null, to: 2, data: { content: [{ a: ["old line"], b: ["  new line"] }] } };
  H.right = []; render(g);
  texts = copied().map((x) => x.text);
  for (const want of ["old line", "  new line", "src/a.py"]) assert.ok(texts.includes(want), `diff: right-click copies ${JSON.stringify(want)}`);
  // nothing to copy: no clipboard, and the press goes on (e.g. to Herdr's own menu)
  g.diff = null; g.detail.comments = { "/PATCHSET_LEVEL": [{ id: "c2", patch_set: 2, author: ALICE, message: "", unresolved: true, updated: "2026-11-10 01:00:00.000000000" }] };
  H.right = []; render(g);
  assert.ok(H.right.map(press).some((x) => x.text == null && !x.stopped), "an empty value copies nothing");
});

test("移到上排 on a layout like Herdr's main (tab bar in a column): the button in a row with the bar, not under the status bar", async (G) => {
  const main = () => ({ id: "root", type: "row", children: [{ id: "work", type: "column", children: [
    { id: "tabs", type: "block", size: { px: 42 }, content: { mod: "tabs" } },
    { id: "body", type: "row", children: [{ id: "main", type: "block", content: { tab: "active" } }] },
    { id: "status", type: "block", size: { px: 28 }, content: { mod: "workspace-status" } }] }] });
  const place = async (win) => {
    H.window = win; H.layout = main(); H.store.layout = "mine"; H.runs = [];
    await freshView(G).moveIntoBar(cx);
    const set = H.runs.find(([n]) => n === "layout.set")?.[1]?.layout, work = set.children[0];
    return { work, row: work.children[0] };
  };
  try {
    let { work, row } = await place({ platform: "macos" });
    assert.equal(row.type, "row"); assert.deepEqual(row.size, { px: 42 });
    assert.deepEqual(row.children.map((c) => c.id), ["tabs", "gerrit-toggle"], "Mac: after the bar");
    assert.deepEqual(row.children[0].size, { weight: 1 });
    assert.equal(work.children.at(-1).id, "status", "nothing added under the status bar");
    ({ row } = await place({ platform: "windows", buttons: true }));
    assert.deepEqual(row.children.map((c) => c.id), ["gerrit-toggle", "tabs"], "Windows: before the bar (close stays in the corner)");
  } finally { H.window = undefined; }
});

// ---------- run ----------
const G = await loadMod();
let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(G); console.log(`ok    ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${String(e.stack ?? e).split("\n").slice(0, 14).join("\n      ")}`); }
}
console.log(`\n${tests.length - fail} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
