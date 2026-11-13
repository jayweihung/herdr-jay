// Roles "repo", "repo-toggle" and "editor" of the kit mod (see main.js).
//   repo (default)  the repository (倉庫): the sources' rules / skills / MCP on this computer, to read, edit, add
//                   (kit new, kit collect) and send (kit push, after a --dry-run you confirm). The sources are the same
//                   on every machine: what is sent reaches the others with kit sync.
//   repo-toggle     the tab-bar button that shows or hides the panel (reads the panel's data, never loads)
//   editor          one file of the repository in its own big window (放大)
//   The fourth tab, 各機器 (every machine's kit, what it lacks, the approved commits), is machines.js.
// Everything goes through the kit command (common.js: kit from PATH, after kit api said it is new enough), and only
// its JSON is read (kit list --json, kit push --json, kit collect --look); its words for people are shown as they are. Where
// the panel sits in the layout, and 放進上排 / 更新版面: layout.js. The shared state keys are in common.js.
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Editor, TextareaState, Textarea } from "gpui-base";
import { theme, exec, run, layout, shared, setShared, window, readTextFile, writeTextFile, closeOverlay, openOverlay, appHome, notify, props as blockProps } from "herdr";
import { DATA, LOAD, EDITORS, NODES, MSG, fs, mono, stop, slash, shortDir, clean, spin, waiting, find, textBlock, copyOnRight, btn,
  busyNow, dropStaleBusy, takeBusy, giveBusy, markChanged, kit, kitJson, apiState, apiKnown, apiAtLeast, checkApi, apiCard, messageBox, problemCard, versionCard,
  squeeze, newEditor, liveEditors, localGet, localSet, kitAction, loadNewest, loadingNow, isWindows } from "./common.js";
import { layoutNeeds, moveIntoBar } from "./layout.js";
import { machinesTab, loadMachines, machinesDue, machinesLoading } from "./machines.js";

const LONG = 600000, SHORT = 120000; // how long kit sync / push, and the other actions, may take
const STALE = 60000, LOAD_TTL = 90000;
const PUSH_KIND = { pr: "團隊 · 送出要審", direct: "自己的 · 直接推" };

// The repository: kit list --json on this computer. kit says what kit push would send: per source (changed: its
// files, agents/… being agents) and per item (changed). An item's place in its source (rel) is only shown.
async function loadRepo() {
  const { data: d, error } = kitJson(await kit(["list", "--json"], 60000), "kit list --json"), at = Date.now();
  if (error) return { key: "repo", error: error.message, code: error.code, at };
  const sources = (d.sources ?? []).map((s) => ({ ...s, changed: Array.isArray(s.changed) ? s.changed : [] }));
  const items = (d.items ?? []).filter((i) => i.kind !== "agent").map((i) => {
    // Windows paths come with \; compared as /. Only for showing where the file is: nothing depends on it
    const s = sources.find((x) => x.name === i.source), dir = s?.dir ? slash(s.dir) + "/" : "", p = slash(i.path);
    return { ...i, rel: dir && p.startsWith(dir) ? p.slice(dir.length) : "", changed: i.changed === true, src: i.source };
  });
  const dirty = sources.map((s) => ({ name: s.name, push: s.push ?? null,
    items: s.changed.filter((f) => !f.startsWith("agents/")).length, agents: s.changed.filter((f) => f.startsWith("agents/")).length }))
    .filter((x) => x.items + x.agents > 0);
  return { ...d, key: "repo", at, items, sources, dirty };
}
// kit push --to <source> [--dry-run] --json -> { ok, files (what it sends, as one string to compare), sent, push,
// text (kit's own words, stderr), code (kit's error code, when it failed) }
async function pushJson(name, dry, ttl) {
  const r = await kit(["push", "--to", name, ...(dry ? ["--dry-run"] : []), "--json"], ttl);
  const { data, error } = kitJson(r, "kit push --json"), said = clean(r.err ?? "");
  if (error) return { ok: false, files: "", sent: false, code: error.code, text: said || error.message };
  const files = Array.isArray(data.files) ? data.files : [];
  return { ok: files.length > 0, files: JSON.stringify(files), sent: data.sent === true, push: data.push, prUrl: data.pr_url ?? null,
    text: said || (files.length ? files.join("\n") : "沒有要送的") };
}
// 貼上設定 (kit new mcp --config): the kinds of server, kit's error codes in plain words, and what comes after
const TYPE_NAME = { stdio: "在這台跑的程式（stdio）", http: "網址（http）", sse: "網址（sse）" };
function pasteError(e) {
  const plain = {
    several_servers: "貼上的設定裡有好幾個 server：點一個（只會建那一個）。",
    not_found: "上面寫的名字不在貼上的設定裡：點設定裡有的一個，或把名字清掉。",
    bad_config: "kit 看不懂貼上的設定（或裡面有 kit 不收的東西）：",
    no_name: "設定裡沒有 server 的名字：在上面寫一個名字（小寫英文、數字和 -）。",
    bad_name: "名字只能用小寫英文、數字和 -。",
    exists: "已經有同名的 mcp 了：換一個名字。",
    not_init: "這台還沒設定 kit。",
    no_source: "沒有可以放的來源。",
  }[e.code];
  if (!plain) return e.message;
  return e.code === "bad_config" ? `${plain}${e.message}` : `${plain}\n（kit：${e.message}）`;
}
// after 建立: the file is only in this computer's source until it is sent; then each place that wants it adds it
function pasteNext(x) {
  return ["接下來：",
    `1. 檢查上面的檔案，在「待送出」按「送出」：送進來源（${x.source}），其他電腦 kit sync 後才有。`,
    "2. 要用它的地方按「加進來」（整個帳號，或在某個資料夾的 Kit 清單按「加到這個資料夾」）。",
    ...((x.packages ?? []).some((p) => p.version && !p.bad) ? [`3. 每台電腦在 MCP 清單按「裝套件」（kit install-deps mcp ${x.name}）：裝好之後不用每次啟動時下載。`] : []),
    ...((x.vars ?? []).length ? [`${(x.packages ?? []).some((p) => p.version && !p.bad) ? 4 : 3}. 每台電腦設好環境變數 ${x.vars.join("、")}（值不會進來源）。`] : [])];
}
// The paste goes to kit in a file, never as an argument (kit.cmd on Windows mangles quotes in arguments): one file in
// this app's own folder, written just before kit runs and blanked as soon as kit has read it (it may hold a token until
// kit has replaced it with ${VAR}). A task is cancelled when its copy closes (Herdr quits, another layout, the window
// closed): then its finally never runs, so close() blanks it too, and the next start blanks one left over.
export const PASTE_LABELS = ["看設定", "建立"];   // the actions (the lock's label) that use the paste file
export function pastePath() {
  const sep = isWindows() ? "\\" : "/";
  return `${String(appHome()).replace(/[\\/]+$/, "")}${sep}kit-tmp${sep}mcp-paste.txt`;
}
// Blank the paste file: what is in it now, read again (what was written may not read back the same, e.g. a lone
// surrogate comes back as U+FFFD), replaced by "". -> null: blank, or not there; else why it couldn't be
export async function blankPaste(file) {
  let why = "";
  for (let i = 0; i < 3; i++) {
    try {
      const now = await readTextFile(file);
      if (!now) return null;
      await writeTextFile(file, "", now);
      return null;
    } catch (e) { why = String(e?.message ?? e); }
  }
  return why || "不知道為什麼";
}
// Mac / Linux: kit-tmp only its owner can open (0700) and the file only its owner can read (0600), before anything is
// written in it (writeTextFile keeps a file's permissions when it replaces it). Windows: appHome is in the user's
// profile (AppData\Roaming), which only that user (and the administrators) can open already: nothing to do.
async function privatePaste(file) {
  if (isWindows()) return;
  const dir = file.slice(0, file.lastIndexOf("/"));
  const r = await exec("sh", ["-c", 'umask 077 && mkdir -p "$1" && chmod 700 "$1" && touch "$2" && chmod 600 "$2"', "sh", dir, file], { timeout: 10000 });
  if (r.code !== 0) throw new Error(`${dir} 沒辦法設成只有自己能讀，貼上的設定沒寫進去（${clean(r.stderr || `結束碼 ${r.code}`)}）`);
}
// kit's name for one of the paste's servers (kit's mcp.awk norm: lowercase, every run of other characters one -, no -
// at either end: MCP_DOCKER -> mcp-docker), which kit takes for that server; the name as it is when nothing is left
export function serverName(s) {
  const n = String(s).replace(/[A-Z]/g, (c) => c.toLowerCase()).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return n || String(s);
}
// open a file in this computer's own program for it (explorer: no cmd.exe parsing of & or ^ in the path)
function openOutside(path) {
  const w = window()?.platform;
  if (w === "windows") return exec("explorer.exe", [String(path).replace(/\//g, "\\")]);
  if (w === "macos") return exec("open", ["-t", path]);
  return exec("xdg-open", [path]);
}

export class Repo {
  constructor(role) { this.role = role; }

  init(_p, cx) {
    this.filter = "";
    this.kind = localGet("kit.kind") || "skill";
    this.edit = null;    // { item, orig, dirty, err } while a file is open; this.code is its editor
    this.code = null;
    this.making = null;  // { source } while adding a new one
    this.plan = null;    // 送出: [{ name, push, ok, text }] what kit push --dry-run said, waiting for 確定送出
    this.mine = null;    // the id of the action this copy started in kit.busy
    this.moveErr = null; // why 放進上排 / 更新版面 didn't work (layout.js)
    dropStaleBusy();

    if (this.role === "editor") {
      const p = blockProps() ?? {};
      this.where = `editor:${p.item?.path ?? ""}`;
      if (p.item) cx.spawn(async (cx) => { await this.openItem(p.item, cx, p.value, p.orig); cx.notify(); });
      cx.timer.every(30000, () => this.mark());
      return;
    }
    this.where = "repo";
    if (this.role === "repo-toggle") return;   // it only shows what the panel loaded (and kit api's answer)
    // a paste left in its file by a task that never finished (Herdr quit while kit read it): blank it, unless a paste
    // is under way in another copy
    if (!PASTE_LABELS.includes(this.busy)) cx.spawn(async (cx) => { await this.blankPasteFile(pastePath()); cx.notify(); });
    this.input = InputState.new({ placeholder: "找：名字、說明、來源" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value().trim().toLowerCase(); cx.notify(); });
    this.newName = InputState.new({ placeholder: "名字：小寫英文、數字和 -" });
    this.newName.on("submit", (_e, cx) => (this.kind === "mcp" && this.making?.mode === "paste" ? this.lookPaste(cx) : this.make(cx)));
    this.newName.on("change", (_e, cx) => cx.notify());   // the path it will make follows the name
    this.newUrl = InputState.new({ placeholder: "網址，例如 https://git.example.org/作者/repo" });
    this.newUrl.on("submit", (_e, cx) => this.look(cx));
    this.newUrl.on("change", (_e, cx) => { if (this.making?.look || this.making?.urlErr) { this.making.look = null; this.making.urlErr = null; cx.notify(); } });
    // first whether kit is new enough (kit api); then load when there is nothing, it is a minute old, or someone
    // marked it out of date (at: 0)
    const due = () => !this.loading && (!this.data || this.data.at === 0 || Date.now() - (this.data.at ?? 0) > STALE);
    const tick = (cx) => {
      // 各機器: only while its tab is the one shown (and the panel isn't hidden), then kept 10 minutes
      if (this.kind === "machines" && !find(layout(), NODES.repo)?.hidden && machinesDue()) loadMachines(cx);
      const a = apiKnown(null);
      if (!a) return checkApi(null, cx);
      if (a.ok && due() && !this.busy) this.refresh(cx);
    };
    tick(cx);
    cx.timer.every(2000, tick);
  }

  async close(_cx) {
    // a paste kit was given whose task is cancelled with this copy (no finally): blank it, then the lock
    if (this.pasteFile) {
      // at quit only exec is sure to run: on Mac / Linux empty it that way first; then (and on Windows) blank it as usual
      if (!isWindows()) await exec("sh", ["-c", ': > "$1"', "sh", this.pasteFile], { timeout: 5000 }).catch(() => {});
      await this.blankPasteFile(this.pasteFile);
    }
    this.endBusy();
    if (this.role === "editor" && this.edit) {
      const ed = { ...(shared(EDITORS) ?? {}) };
      delete ed[this.edit.item.path];
      setShared(EDITORS, ed);
    }
    this.code?.release();
    this.code = null;
    this.paste?.release();
    this.paste = null;
  }

  get data() { return shared(DATA) ?? null; }
  get busy() { return busyNow(); }
  get loading() { return loadingNow(LOAD, LOAD_TTL); }
  get msg() { return shared(MSG(this.where)) ?? null; }
  setMsg(m) { setShared(MSG(this.where), m); }

  // the repository's data, newest load wins (a slower older load can't put back what an action changed)
  refresh(cx) {
    if (apiState(null)?.ok === false) return checkApi(null, cx, true);   // ⟳ while kit can't be used: ask kit api again
    cx.spawn(async (cx) => { await loadNewest(LOAD, DATA, loadRepo); cx.notify(); });
  }
  // after a change on this computer: the repository and every agent header here are out of date
  changed() { markChanged(null); }

  // one action at a time across every copy of every part; only the copy that took the lock gives it back
  startBusy(label, ttl) { this.mine = takeBusy(label, ttl); return Boolean(this.mine); }
  endBusy() { giveBusy(this.mine); this.mine = null; }

  // kit sync: one at a time, the result (kit's own words) shown above the list
  act(label, args, cx, ttl = SHORT) { kitAction(this, cx, { label, args, ttl, msg: MSG(this.where) }); }

  // 送出, step 1: what kit push would send from each changed source (--dry-run), shown for 確定送出
  planPush(cx) {
    const dirty = this.data?.dirty ?? [];
    if (!dirty.length || !this.startBusy("檢查", SHORT * dirty.length)) return;
    this.setMsg(null);
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const plan = [];
        for (const x of dirty) {
          const j = await pushJson(x.name, true, SHORT);
          plan.push({ name: x.name, push: j.push ?? x.push, ok: j.ok, files: j.files, text: j.text });
        }
        this.plan = plan;
      } finally { this.endBusy(); cx.notify(); }
    });
  }
  // 送出, step 2: kit push for one source
  push(p, cx) {
    if (!this.startBusy("送出", LONG)) return;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        // the files must still be the ones you were shown (two dry runs' lists, compared as kit gave them)
        const again = await pushJson(p.name, true, SHORT);
        if (!again.ok || again.files !== p.files) {
          const np = { ...p, ok: again.ok, files: again.files, text: again.text };
          this.plan = (this.plan ?? []).map((x) => (x.name === p.name ? np : x));
          this.setMsg({ ok: false, label: `送出 ${p.name}`, text: "要送的檔案跟剛才列的不一樣了（剛剛有存檔或改過），什麼都沒送。請再看一次下面的清單。", at: Date.now() });
          return;
        }
        const r = await pushJson(p.name, false, LONG);
        let text = r.text || (r.sent ? "送出了" : "失敗");
        if (r.sent && r.push === "pr") text += `\n\n${r.prUrl ? `PR：${r.prUrl}\n` : ""}改的檔案現在在送出的分支上：PR 合併、kit sync 之後才會回到這裡。`;
        this.setMsg({ ok: !r.code, label: `送出 ${p.name}`, text, at: Date.now() });
        this.plan = (this.plan ?? []).filter((x) => x.name !== p.name);
        if (!this.plan.length) this.plan = null;
      } finally { this.endBusy(); this.changed(); cx.notify(); }
    });
  }

  render(_cx) {
    if (this.role === "repo-toggle") return this.renderToggle();
    const t = theme(), z = fs(), msg = this.msg;
    const root = v_flex().id("kit-root").size_full().bg(t.surface).text_size(z).text_color(t.foreground);
    if (this.role === "editor") {
      if (msg) root.child(this.message(t, z, msg));
      return root.child(this.edit ? this.editor(t, z) : this.openErr ? div().p(14).text_color(t.muted).child("打不開這個檔案（看上面的原因）。關掉這個視窗，再試一次。")
        : div().p(14).child(waiting(t, z, "讀取中…")));
    }
    root.child(this.repoHeader(t, z));
    // the layout: no Kit button yet (放進上排), or an older kit's pieces still in it (更新版面)
    const needs = this.role === "repo" ? layoutNeeds(layout()) : null;
    if (needs) root.child(this.moveBanner(t, z, needs));
    // kit can't be used (none, too old, newer than this mod, no answer): what to do, in place of everything else
    const api = apiState(null);
    if (api?.kind && !api.ok) return root.child(apiCard(t, z, api, null, this.where));
    if (msg) root.child(this.message(t, z, msg));
    const d = this.data;
    if (!d) return root.child(div().p(14).child(waiting(t, z, "讀取中…")));
    if (d.error) return root.child(problemCard(t, z, this.where, d.error, d.code));
    if (d.kit_version_wanted) root.child(versionCard(t, z, this.where, d));
    if (this.plan) root.child(this.planCard(t, z));
    return root.child(this.edit ? this.editor(t, z) : this.repo(t, z, d));
  }

  // ---------- the repository ----------
  repoHeader(t, z) {
    const d = this.data, busy = this.busy, inBar = Boolean(find(layout(), NODES.repoToggle));
    const dirty = d?.dirty ?? [], nItems = dirty.reduce((a, x) => a + x.items, 0), nAgents = dirty.reduce((a, x) => a + x.agents, 0);
    const what = [nItems ? `規則／skill／MCP ${nItems} 個檔案` : "", nAgents ? `agent ${nAgents} 個` : ""].filter(Boolean).join("、");
    const sub = what ? `改過${what}，還沒送出` : d && !d.error ? `${(d.items ?? []).length} 樣` : "規則、skill、MCP 都在這裡";
    const head = h_flex().px(10).py(8).gap(6).items_center()
      .child(div().size(32).flex_none().rounded(8).bg(t.raised).flex().items_center().justify_center().font_semibold().text_size(z - 1).child("Kit"))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().font_semibold().child("倉庫"))
        .child(h_flex().gap(5).items_center().min_w(0).when(this.loading, (el) => el.child(spin(z - 3, t.muted)))
          .child(div().truncate().text_size(z - 1.5).text_color(what ? t.working : t.muted).child(this.loading ? `${sub} · 讀取中…` : sub))))
      .child(btn(t, z, "sync", busy === "同步" ? "同步中…" : "同步", { small: true, off: Boolean(busy), on: (cx) => this.act("同步", ["sync"], cx, LONG) }))
      .child(btn(t, z, "reload", this.loading ? spin(z - 2, t.dim) : "⟳", { small: true, off: this.loading, on: (cx) => this.refresh(cx) }))
      .when(inBar, (el) => el.child(btn(t, z, "hide", "✕", { small: true, on: () => run("layout.hide", { id: NODES.repo }) })));
    const v = v_flex().flex_none().border_b(1).border_color(t.border).child(head);
    // each source and what 送出 does with it
    const srcs = d?.sources ?? [];
    if (srcs.length) v.child(h_flex().px(10).pb(8).gap(4).flex_wrap().items_center().text_size(z - 2)
      .children(srcs.map((s) => h_flex().gap(4).px(6).py(1).rounded(5).bg(t.raised).items_center()
        .child(copyOnRight(div().text_color(t.foreground).child(s.name), s.name))
        .when(Boolean(PUSH_KIND[s.push]), (el) => el.child(div().text_color(s.push === "pr" ? t.accent : t.dim).child(PUSH_KIND[s.push]))))));
    return v;
  }

  // 送出: what each source would send, and 確定送出 per source
  planCard(t, z) {
    const busy = Boolean(this.busy);
    const card = v_flex().flex_none().mx(10).mt(8).p(10).gap(8).rounded(8).bg(t.raised).border_1().border_color(t.accent)
      .child(h_flex().items_center().child(div().flex_1().font_semibold().child("送出前看一下"))
        .child(btn(t, z, "plan-cancel", "取消", { small: true, on: (cx) => { this.plan = null; cx.notify(); } })));
    for (const p of this.plan) card.child(v_flex().gap(4)
      .child(h_flex().gap(6).items_center()
        .child(copyOnRight(div().flex_1().font_semibold().child(p.name), p.name))
        .when(Boolean(PUSH_KIND[p.push]), (el) => el.child(div().text_size(z - 2).text_color(t.muted).child(PUSH_KIND[p.push])))
        .when(p.ok, (el) => el.child(btn(t, z, `push-${p.name}`, this.busy === "送出" ? "送出中…" : "確定送出", { small: true, kind: "primary", off: busy, on: (cx) => this.push(p, cx) }))))
      .child(div().p(6).rounded(6).bg(t.background).font_family(mono()).text_size(z - 2).text_color(p.ok ? t.foreground : t.ansi1).child(textBlock(`plan-${p.name}`, squeeze(p.text) || "（kit 沒說什麼）"))));
    return card;
  }

  // tabs per kind, + 新增, a search, the list; a row opens the file in the editor
  repo(t, z, d) {
    const items = d.items ?? [], f = this.filter;
    const tabs = [["rule", "規則"], ["skill", "Skills"], ["mcp", "MCP"], ["machines", "各機器"]];
    const kind = tabs.some(([k]) => k === this.kind) ? this.kind : "skill";
    const box = v_flex().flex_1().min_h(0);
    box.child(h_flex().flex_none().px(10).pt(8).gap(4).items_center().children(tabs.map(([k, label]) => {
      const on = k === kind, n = items.filter((i) => i.kind === k).length, ch = items.filter((i) => i.kind === k && i.changed).length;
      return h_flex().id(`tab-${k}`).h(28).px(10).gap(5).items_center().rounded(6).cursor_pointer()
        .bg(on ? t.selected : t.surface).text_color(on ? t.foreground : t.muted).font_semibold()
        .hover((st) => st.bg(t.hover)).on_mouse_down("left", stop)
        .on_click((_e, cx) => {
          this.kind = k; localSet("kit.kind", k); this.making = null;
          if (k === "machines" && machinesDue()) loadMachines(cx);
          cx.notify();
        })
        .child(label).when(k !== "machines", (el) => el.child(div().text_size(z - 2).text_color(t.dim).child(String(n))))
        .when(ch > 0, (el) => el.child(div().size(6).rounded(3).bg(t.working)));
    })).child(div().flex_1())
      .when(kind === "machines", (el) => el.child(btn(t, z, "machines-reload", machinesLoading() ? spin(z - 2, t.dim) : "⟳", { small: true,
        off: machinesLoading(), on: (cx) => loadMachines(cx) })))
      .when(kind !== "machines", (el) => el.child(btn(t, z, "new", "＋ 新增", { small: true, on: (cx) => {
        this.making = this.making ? null : { source: (d.sources ?? [])[0]?.name ?? null, mode: "write", look: null, pick: 0 };
        if (this.making) this.newName.focus();
        cx.notify();
      } }))));
    if (kind === "machines") return box.child(machinesTab(t, z));
    box.child(div().flex_none().px(10).pt(8).child(Input.new(this.input).h(30).px(8).rounded(6).border_1().border_color(t.border)
      .bg(t.background).text_size(z - 1).text_color(t.foreground)));
    const hit = (...xs) => !f || xs.some((x) => String(x ?? "").toLowerCase().includes(f));
    const rows = items.filter((i) => i.kind === kind && hit(i.name, i.description, i.source))
      .sort((a, b) => (b.changed - a.changed) || (b.new - a.new) || a.name.localeCompare(b.name));
    const body = v_flex().flex_1().min_h(0).overflow_y_scrollbar().px(10).py(8).gap(2);
    if (!this.plan && (d.dirty ?? []).length) body.child(this.unsent(t, z, d));
    if (this.making) body.child(this.maker(t, z, d, kind));   // in the scroll area: a long one (a skill looked at) can be scrolled
    for (const i of rows) body.child(this.repoRow(t, z, i));
    if (!rows.length) body.child(div().p(8).text_color(t.muted).child(f ? "找不到符合的。" : "這一類還沒有東西，按「＋ 新增」寫一個。"));
    return box.child(body);
  }

  // changes not sent yet: one yellow strip above the list, per source what changed, and the one button that sends
  unsent(t, z, d) {
    const busy = this.busy, items = d.items ?? [];
    const lines = (d.dirty ?? []).map((x) => {
      const names = items.filter((i) => i.changed && i.src === x.name).map((i) => i.name);
      const what = [names.length ? names.slice(0, 3).join("、") + (names.length > 3 ? ` 等 ${names.length} 樣` : "") : "", x.agents ? `agent ${x.agents} 個` : ""].filter(Boolean).join("、");
      return div().text_size(z - 1).text_color(t.foreground).child(textBlock(`unsent-${x.name}`, `${x.name}：${what || "改過的檔案"}（${x.items + x.agents} 個檔案）`));
    });
    return v_flex().flex_none().mb(8).p(10).gap(6).rounded(8).bg(t.raised).border_1().border_color(t.working)
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().font_semibold().text_color(t.working).child("有改動還沒送出"))
        .child(btn(t, z, "push", busy === "檢查" ? "檢查中…" : "送出", { small: true, kind: "primary", off: Boolean(busy), on: (cx) => this.planPush(cx) })))
      .children(lines)
      .child(div().text_size(z - 1.5).text_color(t.dim).child("按了會先列出要上傳的檔案，再按「確定送出」才真的送。"));
  }

  // + 新增: write a new one from scratch (a name, which source; kit new makes the file and the editor opens it),
  // or, for skills, collect someone else's from a URL (kit collect --look shows what it would take, then kit collect),
  // or, for MCP, paste someone's setup (kit new mcp --config --look shows the yaml it would write, then kit new mcp).
  // Every step says where the file goes and what comes next.
  maker(t, z, d, kind) {
    const srcs = d.sources ?? [], m = this.making, cur = m.source, src = srcs.find((x) => x.name === cur);
    const what = { rule: "規則", skill: "skill", mcp: "MCP" }[kind];
    const mode = kind === "skill" ? (m.mode === "collect" ? "collect" : "write") : kind === "mcp" ? (m.mode === "paste" ? "paste" : "write") : "write";
    const note = (text, color) => div().text_size(z - 1.5).text_color(color ?? t.muted).child(text);
    const chip = (id, label, on, click) => div().id(id).px(8).py(3).rounded(5).text_size(z - 1.5).cursor_pointer()
      .bg(on ? t.selected : t.surface).text_color(on ? t.foreground : t.muted).border_1().border_color(on ? t.accent : t.border)
      .on_mouse_down("left", stop).on_click((_e, cx) => click(cx)).child(label);
    const box = v_flex().flex_none().mb(8).p(10).gap(8).rounded(8).bg(t.raised)
      .child(div().font_semibold().child(`新增${what}`));
    if (kind === "skill") box.child(h_flex().gap(4)
      .child(chip("mode-write", "自己從頭寫", mode === "write", (cx) => { m.mode = "write"; this.newName.focus(); cx.notify(); }))
      .child(chip("mode-collect", "從網址收別人的", mode === "collect", (cx) => { m.mode = "collect"; this.newUrl.focus(); cx.notify(); })));
    if (kind === "mcp") box.child(h_flex().gap(4)
      .child(chip("mode-write", "自己從頭寫", mode === "write", (cx) => { m.mode = "write"; this.newName.focus(); cx.notify(); }))
      .child(chip("mode-paste", "貼上設定", mode === "paste", (cx) => { m.mode = "paste"; this.pasteCode(); cx.notify(); })));
    if (mode === "collect") box.child(v_flex().gap(3).child(note("網址（公司內請用自己 Git 伺服器的網址）", t.dim))
      .child(Input.new(this.newUrl).h(30).px(8).rounded(6).border_1().border_color(t.accent).bg(t.background).text_size(z - 1).text_color(t.foreground))
      .child(note("kit 會下載這個 repo，找出裡面的 skill（有 SKILL.md 的資料夾），連同原作者的 LICENSE 收進你的倉。", t.dim)));
    else if (mode === "paste") {
      if (!apiAtLeast(null, 3)) box.child(note("貼上設定要 kit 0.5.0 以上：在終端機打  kit self-update，好了再按上面的 ⟳。", t.ansi1));
      box.child(v_flex().gap(3)
        .child(note("把別人給的 MCP 設定整段貼在這裡：README 上的 JSON（mcpServers）、claude mcp add …、codex mcp add …，或 Codex config.toml 的 [mcp_servers.名字]。", t.dim))
        .child(Textarea.new(this.pasteCode()).w_full().px(8).py(6).rounded(6).border_1().border_color(t.accent).bg(t.background)
          .font_family(mono()).text_size(z - 2).text_color(t.foreground))
        .child(note("token、密碼不會寫進倉裡：kit 換成 ${變數名}，每台電腦自己設環境變數。貼上的內容只交給這台的 kit 讀，讀完就清掉。", t.dim))
        .child(note("名字（可以不寫：用設定裡的名字）", t.dim))
        .child(Input.new(this.newName).h(30).px(8).rounded(6).border_1().border_color(t.border).bg(t.background).text_size(z - 1).text_color(t.foreground)));
    } else {
      const hint = { skill: "之後在 Claude 打 /名字、Codex 打 $名字 叫它", rule: "只是用來認它的名字；規則的內容每次都會給 agent", mcp: "MCP server 的名字" }[kind];
      box.child(v_flex().gap(3).child(note("名字（小寫英文、數字和 -）", t.dim))
        .child(Input.new(this.newName).h(30).px(8).rounded(6).border_1().border_color(t.accent).bg(t.background).text_size(z - 1).text_color(t.foreground))
        .child(note(hint, t.dim)));
    }
    if (srcs.length) box.child(v_flex().gap(4)
      .child(note("放在哪個倉", t.dim))
      .child(h_flex().gap(4).flex_wrap().children(srcs.map((x) => chip(`to-${x.name}`, PUSH_KIND[x.push] ? `${x.name}（${PUSH_KIND[x.push]}）` : x.name,
        x.name === cur, (cx) => { m.source = x.name; m.look = null; m.pasted = null; cx.notify(); })))));
    if (mode === "paste") return this.pasteSteps(t, z, box, m, note, chip);
    if (mode === "write") {
      const name = this.newName.value().trim() || "名字";
      const rel = { rule: `rules/${name}.md`, skill: `skills/${name}/SKILL.md`, mcp: `mcp/${name}.yaml` }[kind];
      if (src?.dir) box.child(note(`會建立 ${shortDir(src.dir)}/${rel}，然後在這裡打開讓你寫。`, t.foreground));
      box.child(note(`寫完存檔 → 清單上面黃色那條按「送出」送上去 → 要用它就在 agent 視窗上的 Kit 清單按「加到這個資料夾」（在家目錄開的 agent 是「加到整個帳號」）。`));
      return box.child(h_flex().gap(6)
        .child(btn(t, z, "make", "建立並打開", { small: true, kind: "primary", off: Boolean(this.busy), on: (cx) => this.make(cx) }))
        .child(btn(t, z, "make-cancel", "取消", { small: true, on: (cx) => { this.making = null; cx.notify(); } })));
    }
    const lk = m.look;
    box.child(h_flex().gap(6)
      .child(btn(t, z, "look", this.busy === "下載" ? "下載中…" : lk ? "重新下載" : "下載看看", { small: true, kind: lk ? undefined : "primary", off: Boolean(this.busy), on: (cx) => this.look(cx) }))
      .child(btn(t, z, "make-cancel", "取消", { small: true, on: (cx) => { this.making = null; cx.notify(); } })));
    if (m.urlErr) box.child(note(m.urlErr, t.ansi1));
    if (!lk && this.busy === "下載") return box.child(this.working(t, z, "下載中：大的 repo 可能要一兩分鐘…"));
    if (!lk) return box.child(note("先下載看看：kit 只會列出找到什麼，還不會放進你的倉。", t.dim));
    const sk = lk.skills ?? [], i = Math.min(m.pick ?? 0, Math.max(sk.length - 1, 0)), x = sk[i];
    const card = v_flex().gap(5).p(8).rounded(6).bg(t.background);
    if (sk.length > 1) card.child(note(`這個 repo 有 ${sk.length} 個 skill，選一個：`, t.foreground))
      .child(h_flex().gap(4).flex_wrap().children(sk.map((y, j) => chip(`pick-${j}`, y.name, j === i, (cx) => { m.pick = j; cx.notify(); }))));
    if (!x) return box.child(card.child(note("找不到 skill。", t.ansi1)));
    // every line first, then the head with its button: an element can be added to a parent only once
    const scripts = String(x.scripts ?? "").split(" ").filter(Boolean), desc = String(x.description ?? "");
    const lines = [];
    let block = null, label = "收進來", allow = false;
    if (desc) lines.push(div().text_size(z - 1.5).text_color(t.muted).child(textBlock(`look-desc-${x.name}`, desc.length > 180 ? desc.slice(0, 180).trimEnd() + " …" : desc)));
    lines.push(note(x.license ? `授權：${x.license}${x.license === "unknown" ? "（認不出種類，收進來後請自己看 LICENSE）" : x.license === "GPL" ? "（改了再發布要公開原始碼）" : ""}` : "沒有 LICENSE：不知道能不能用，kit 不收。",
      x.license ? t.foreground : t.ansi1));
    if (!x.license) block = "沒有 LICENSE";
    if (scripts.length) lines.push(note(`⚠ 有 ${scripts.length} 個會執行的程式（${scripts.slice(0, 3).join("、")}${scripts.length > 3 ? " …" : ""}），送出前請看過。`, t.working));
    if (x.skipped) lines.push(note(`${x.skipped} 個圖片、捷徑之類的非文字檔不會收。`, t.dim));
    if (!x.valid) { block = "名字不行"; lines.push(note(`名字 ${x.name} 不能用（只能小寫英文、數字和 -）：請用指令 kit collect … --name 換名字。`, t.ansi1)); }
    if (x.exists === "own") { block = "已經有同名的"; lines.push(note(`${lk.source} 已經有你自己的 ${x.name}，不會蓋掉它。要收請用指令 kit collect … --name 換名字。`, t.ansi1)); }
    if (x.exists === "collected") lines.push(note(`之前收過 ${x.name}：會整份換成這次下載的版本。`, t.working));
    lines.push(copyOnRight(note(`會放到 ${shortDir(slash(x.dest).replace(/\/SKILL\.md$/, "/"))}`, t.foreground), slash(x.dest).replace(/\/SKILL\.md$/, "")));
    if (!lk.allowed && lk.can_allow) { allow = true; label = "加進清單並收進來";
      lines.push(note(`${lk.id} 還不在 ${lk.source} 的允許清單（kit.yaml 的 collect_sources）。按下去會一起加進清單，之後這個作者的東西就能收。`, t.working)); }
    else if (!lk.allowed) { block = block ?? "不在允許清單";
      lines.push(note(`${lk.id} 不在 ${lk.source} 的允許清單。這是團隊的倉，要請維護者把它加進 kit.yaml 的 collect_sources 才能收。`, t.ansi1)); }
    lines.push(note("收進來後：用 git diff 看收了哪些檔案 → 清單上面黃色那條按「送出」送上去 → 要用它就在 agent 視窗上的 Kit 清單按「加到這個資料夾」（在家目錄開的 agent 是「加到整個帳號」）。"));
    const act = block ? div().flex_none().text_size(z - 2).text_color(t.ansi1).child(`不能收：${block}`)
      : btn(t, z, "collect", this.busy === "收" ? "收進來中…" : label, { small: true, kind: "primary", off: Boolean(this.busy), on: (cx) => this.collect(x, allow, cx) });
    card.child(h_flex().gap(6).items_center()
        .child(copyOnRight(div().font_semibold().child(x.name), x.name))
        .child(copyOnRight(div().flex_1().text_size(z - 2).text_color(t.dim).child(x.path === "." ? "（在 repo 最外層）" : `（在 ${x.path}/）`), x.path))
        .child(act))
      .children(lines);
    if (this.busy === "收") card.child(this.working(t, z, "收進來中：下載、複製檔案…"));
    return box.child(card);
  }

  // ---------- 貼上設定 (MCP): kit new mcp [name] --config <file> [--to source] [--look] ----------
  // the box the setup is pasted in (made the first time it is shown)
  pasteCode() {
    if (!this.paste) this.paste = TextareaState.new({ placeholder: "例如 {\"mcpServers\": {\"github\": {\"command\": \"npx\", …}}}，或 claude mcp add …", rows: 7 });
    return this.paste;
  }
  // The paste to kit in its file (pastePath(), private first), blanked when kit is done with it, whatever happened;
  // this.pasteFile says it is in use, so close() blanks it when this task is cancelled
  async withPasteFile(text, fn) {
    const file = pastePath();
    await privatePaste(file);
    const before = await readTextFile(file).catch(() => null);
    this.pasteFile = file;
    try {
      await writeTextFile(file, text, before);
      return await fn(file);
    } finally { await this.blankPasteFile(file); }
  }
  // blank the paste file; when that fails, say so (a toast, and this panel's message): it may still hold a token (and
  // it stays in use: close() tries again)
  async blankPasteFile(file) {
    const why = await blankPaste(file);
    if (why == null) { if (this.pasteFile === file) this.pasteFile = null; return true; }
    const text = `貼上的設定沒能從 ${file} 清掉（${clean(why)}）：裡面可能有 token，請自己刪掉這個檔案。`;
    notify({ title: "貼上的設定還在暫存檔裡", body: text, level: "error", timeout: 20000 });
    this.setMsg({ ok: false, plain: true, label: "貼上設定", text, at: Date.now() });
    return false;
  }
  pasteArgs(name, file, look) {
    const to = this.making?.source;
    return ["new", "mcp", ...(name ? [name] : []), "--config", file, ...(to ? ["--to", to] : []), ...(look ? ["--look"] : [])];
  }
  // 看看會變成什麼: --look (kit writes nothing; it says the yaml, the variables, the packages). server: a name picked
  // from the paste's servers (several_servers / not_found; shown as written there, sent as kit's name: serverName),
  // which becomes the name
  lookPaste(cx, server = null) {
    const m = this.making;
    if (!m) return;
    if (server) this.newName.set_value(server);
    const text = this.pasteCode().value();
    if (!text.trim()) { m.pasted = { err: "先把設定貼在上面的框裡。" }; cx.notify(); return; }
    if (!this.startBusy("看設定", SHORT)) return;
    m.pasted = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const name = this.newName.value().trim();
        const r = await this.withPasteFile(text, (f) => kit(this.pasteArgs(name, f, true), SHORT));
        const { data, error } = kitJson(r, "kit new mcp --look");
        m.pasted = error ? { err: pasteError(error), servers: error.servers ?? [] } : { data, text, name };
      } catch (e) {
        m.pasted = { err: `沒辦法把設定交給 kit：${e?.message ?? e}` };
      } finally { this.endBusy(); cx.notify(); }
    });
  }
  // 建立: the same without --look (only what was just looked at: the paste and the name unchanged), then open the file
  createPaste(cx) {
    const m = this.making, p = m?.pasted, x = p?.data;
    if (!x) return;
    const name = this.newName.value().trim(), text = this.pasteCode().value();
    if (text !== p.text || name !== p.name) { m.pasted = { err: "貼上的內容或名字改過了：再按一次「看看會變成什麼」。" }; cx.notify(); return; }
    if (!this.startBusy("建立", SHORT + LOAD_TTL)) return;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await this.withPasteFile(text, (f) => kit(this.pasteArgs(name, f, false), SHORT));
        if (r.code !== 0) { m.pasted = { ...p, err: clean(r.err || r.out) || `建立失敗（${r.code}）` }; return; }
        this.making = null;
        this.newName.set_value("");
        this.paste?.set_value("");
        this.setMsg({ ok: true, plain: true, label: "建立", text: [`已建立 mcp:${x.name}（在 ${x.source}）。`, ...pasteNext(x)].join("\n"), at: Date.now() });
        const d = await loadNewest(LOAD, DATA, loadRepo);
        const it = (d.items ?? []).find((i) => i.kind === "mcp" && i.name === x.name);
        if (it) await this.openItem(it, cx);
      } catch (e) {
        m.pasted = { ...p, err: `沒辦法把設定交給 kit：${e?.message ?? e}` };
      } finally { this.endBusy(); cx.notify(); }
    });
  }
  // what kit said it would write, and the button that writes it
  pasteSteps(t, z, box, m, note, chip) {
    const p = m.pasted, busy = this.busy;
    box.child(h_flex().gap(6)
      .child(btn(t, z, "paste-look", busy === "看設定" ? "讀取中…" : p?.data ? "再看一次" : "看看會變成什麼", { small: true, kind: p?.data ? undefined : "primary",
        off: Boolean(busy), on: (cx) => this.lookPaste(cx) }))
      .child(btn(t, z, "make-cancel", "取消", { small: true, on: (cx) => { this.making = null; cx.notify(); } })));
    if (p?.err) box.child(v_flex().gap(4).p(8).rounded(6).bg(t.background)
      .child(div().text_size(z - 1.5).text_color(t.ansi1).child(textBlock("paste-err", p.err)))
      .when((p.servers ?? []).length > 0, (el) => el.child(h_flex().gap(4).flex_wrap()
        .children(p.servers.map((s) => chip(`paste-server-${s}`, s, false, (cx) => this.lookPaste(cx, serverName(s))))))));
    const x = p?.data;
    if (!x) return box.child(note("先按「看看會變成什麼」：kit 只列出會寫成什麼，還不會放進你的倉。", t.dim));
    const card = v_flex().gap(5).p(8).rounded(6).bg(t.background);
    card.child(h_flex().gap(6).items_center()
      .child(copyOnRight(div().font_semibold().child(x.name), x.name))
      .child(div().text_size(z - 2).text_color(t.muted).child(TYPE_NAME[x.type] ?? x.type))
      .child(copyOnRight(div().flex_1().min_w(0).truncate().text_size(z - 2).text_color(t.dim).child(`→ ${shortDir(x.path)}`), x.path))
      .child(x.exists ? div().flex_none().text_size(z - 2).text_color(t.ansi1).child("已經有同名的")
        : btn(t, z, "paste-make", busy === "建立" ? "建立中…" : "建立", { small: true, kind: "primary", off: Boolean(busy), on: (cx) => this.createPaste(cx) })));
    if (x.exists) card.child(note(`${x.source} 已經有 mcp:${x.name}（就是上面這個檔案），不會蓋掉它：在上面寫另一個名字，再看一次。`, t.ansi1));
    card.child(div().p(6).rounded(6).bg(t.raised).font_family(mono()).text_size(z - 2).child(textBlock(`paste-yaml-${x.name}`, String(x.yaml ?? "").trimEnd())));
    for (const s of x.secrets ?? []) card.child(note(`${s.where} 像是密碼或 token：檔案裡寫成 \${${s.var}}，值沒有寫進去。`, t.foreground));
    if ((x.vars ?? []).length) card.child(note(`每台電腦要先設定環境變數（只有名字，值各自設）：${x.vars.join("、")}`, t.working));
    for (const pk of x.packages ?? []) card.child(note(pk.version
      ? `套件 ${pk.package} 固定在 ${pk.version} 版${pk.bad ? `；kit 不幫它裝（${pk.bad}），每次啟動時下載` : ""}`
      : `套件 ${pk.package} 查不到最新版本，沒有固定版本${pk.bad ? `；kit 不幫它裝（${pk.bad}）` : ""}`, pk.bad || !pk.version ? t.working : t.foreground));
    if ((x.requires ?? []).length) card.child(note(`它要的程式：${x.requires.join("、")}（這台沒有的話，MCP 清單上會說，按「安裝」）`, t.muted));
    for (const w of x.warnings ?? []) card.child(note(`⚠ ${w}`, t.working));
    card.child(note(pasteNext(x).join("\n"), t.muted));
    return box.child(card);
  }

  // 下載看看: kit collect --look (only looks; nothing is written)
  look(cx) {
    const m = this.making, url = this.newUrl.value().trim();
    if (!m) return;
    if (!url) { m.urlErr = "先在上面貼上網址（灰字只是例子）"; this.newUrl.focus(); cx.notify(); return; }
    if (!this.startBusy("下載", SHORT)) return;
    m.look = null; m.pick = 0;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await kit(["collect", url, "--look", ...(m.source ? ["--to", m.source] : [])], SHORT);
        const { data, error } = kitJson(r, "kit collect --look");
        if (error) { this.setMsg({ ok: false, label: "下載看看", text: clean(r.err ?? "") || error.message, at: Date.now() }); return; }
        m.look = data;
        this.setMsg(null);
      } finally { this.endBusy(); cx.notify(); }
    });
  }

  // 收進來: kit collect at the commit just looked at's URL, the folder picked, --allow when it was offered; then open it
  collect(x, allow, cx) {
    const m = this.making, lk = m?.look;
    if (!lk) return;
    if (!this.startBusy("收", LONG)) return;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await kit(["collect", lk.url, "--to", lk.source, "--path", x.path, ...(allow ? ["--allow"] : [])], LONG);
        if (r.code !== 0) { this.setMsg({ ok: false, label: "收進來", text: clean(r.err || r.out), at: Date.now() }); return; }
        this.making = null;
        this.newUrl.set_value("");
        this.setMsg({ ok: true, label: "收進來", text: clean([r.out, r.err].filter(Boolean).join("\n")), at: Date.now() });
        const d = await loadNewest(LOAD, DATA, loadRepo);
        const it = (d.items ?? []).find((i) => i.kind === "skill" && i.name === x.name);
        if (it) await this.openItem(it, cx);
      } finally { this.endBusy(); cx.notify(); }
    });
  }

  make(cx) {
    const name = this.newName.value().trim(), kind = this.kind, to = this.making?.source;
    if (!name) return;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) { this.setMsg({ ok: false, label: "新增", text: "名字只能用小寫英文、數字和 -", at: Date.now() }); cx.notify(); return; }
    if (!this.startBusy("新增", SHORT + LOAD_TTL)) return;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await kit(["new", kind, name, ...(to ? ["--to", to] : [])], SHORT);
        if (r.code !== 0) { this.setMsg({ ok: false, label: "新增", text: clean(r.err || r.out), at: Date.now() }); return; }
        this.making = null;
        this.newName.set_value("");
        this.setMsg(null);
        const d = await loadNewest(LOAD, DATA, loadRepo);
        const it = (d.items ?? []).find((i) => i.kind === kind && i.name === name);
        if (it) await this.openItem(it, cx);
      } finally { this.endBusy(); cx.notify(); }
    });
  }

  // a row: name, marks (改過 / 新 / 團隊必備), what it is and where from; click to open it
  repoRow(t, z, i) {
    const badge = (text, color) => div().flex_none().px(5).rounded(4).text_size(z - 2.5).text_color(t.background).bg(color).child(text);
    return h_flex().id(`repo-${i.kind}-${i.name}`).gap(8).items_center().px(8).py(6).rounded(6).cursor_pointer()
      .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
      .on_click((_e, cx) => cx.spawn(async (cx) => { await this.openItem(i, cx); cx.notify(); }))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(h_flex().gap(5).items_center().min_w(0)
          .child(copyOnRight(div().min_w(0).truncate().font_semibold().child(i.name), i.name))
          .when(Boolean(i.changed), (el) => el.child(badge("改過", t.working)))
          .when(Boolean(i.new), (el) => el.child(badge("新", t.done)))
          .when(i.status === "required", (el) => el.child(badge("團隊必備", t.accent))))
        .child(copyOnRight(div().min_w(0).truncate().text_size(z - 1.5).text_color(t.muted).child([i.description, i.src].filter(Boolean).join(" · ") || "（還沒寫說明）"),
          i.description || i.path)))
      .child(div().flex_none().text_color(t.dim).child("›"));
  }

  // ---------- one file in the editor (in the panel, or its own window) ----------
  async openItem(i, cx, value, orig) {
    const text = orig ?? await readTextFile(i.path).catch(() => null);
    if (text === null) { this.openErr = true; this.setMsg({ ok: false, label: "打開", text: `讀不到 ${shortDir(i.path)}`, at: Date.now() }); return; }
    this.openErr = false;
    this.code?.release();
    this.code = newEditor(value ?? text, i.kind === "mcp" ? "yaml" : "md");
    this.edit = { item: i, orig: text, dirty: value != null && value !== text, err: null, saved: false };
    this.mark();
    this.code.on("change", (_e, cx) => {
      const dirty = this.code.value() !== this.edit?.orig;
      if (this.edit && dirty !== this.edit.dirty) { this.edit.dirty = dirty; this.mark(); cx.notify(); }
    });
  }
  // a big window says which file it holds and whether it has unsaved edits (so 放大 never replaces those)
  mark() {
    if (this.role !== "editor" || !this.edit) return;
    setShared(EDITORS, { ...(shared(EDITORS) ?? {}), [this.edit.item.path]: { dirty: this.edit.dirty, at: Date.now() } });
  }

  // the open file moves to a big window (what you typed goes along, saved or not); the panel goes back to its list
  enlarge(cx) {
    const e = this.edit;
    if (!e) return;
    if (liveEditors()[e.item.path]?.dirty) {
      this.setMsg({ ok: false, label: "放大", text: "這個檔案已經開在大視窗裡，還沒存檔。先去那裡存檔或關掉。", at: Date.now() });
      cx.notify();
      return;
    }
    openOverlay({ mod: "kit", kind: "window", key: `kit-editor:${e.item.path}`, width: 0.7, height: 0.85,
      props: { role: "editor", item: e.item, orig: e.orig, value: this.code.value() } });
    this.closeItem(cx);
  }

  closeItem(cx) {
    this.code?.release();
    this.code = null;
    this.edit = null;
    cx.notify();
  }

  saveItem(cx) {
    const e = this.edit;
    if (!e?.dirty) return;
    const text = this.code.value();
    cx.spawn(async (cx) => {
      try {
        await writeTextFile(e.item.path, text, e.orig);
        e.orig = text; e.dirty = false; e.err = null; e.saved = true;
        this.mark();
        if (!e.item.plain) this.changed();   // a file of a source: the repository's list (改過 / 送出) is out of date
      } catch {
        e.err = "這個檔案在別的地方被改過了。先複製你改的，按「重新讀取」，再貼回去。";
      }
      cx.notify();
    });
  }

  // its name and place, 存檔 / 放大 / 重新讀取 / 用編輯器開, then the editor
  editor(t, z) {
    const e = this.edit, i = e.item, big = this.role === "editor";
    const leave = big
      ? btn(t, z, "back", e.dirty ? "✕ 不存，關掉" : "✕ 關掉", { small: true, on: () => closeOverlay(blockProps()?.overlay) })
      : btn(t, z, "back", e.dirty ? "← 不存，回去" : "← 回去", { small: true, on: (cx) => this.closeItem(cx) });
    const unsent = e.saved || i.changed;
    // a plain file (an agent's memory / instruction file, opened from its context popup): nothing to send
    const saidAfter = i.plain ? (e.saved ? "存好了。正在跑的 agent 要開新的對話（/clear）或重開才會讀到。" : "")
      : unsent ? "存好了，還沒送出（倉庫清單上面黃色那條）" : "";
    return v_flex().flex_1().min_h(0)
      .child(h_flex().flex_none().px(10).py(8).gap(6).items_center().border_b(1).border_color(t.border)
        .child(leave)
        .child(v_flex().flex_1().min_w(0)
          .child(copyOnRight(div().truncate().font_semibold().child(i.name), i.name))
          .child(copyOnRight(div().truncate().text_size(z - 2).text_color(t.muted).child(`${i.src ?? i.source} · ${i.rel || shortDir(i.path)}`), i.path)))
        .when(!big, (el) => el.child(btn(t, z, "bigger", "⤢ 放大", { small: true, on: (cx) => this.enlarge(cx) })))
        .child(btn(t, z, "save", e.dirty ? "存檔" : "已存", { small: true, kind: "primary", off: !e.dirty, on: (cx) => this.saveItem(cx) })))
      .when(Boolean(e.err), (el) => el.child(div().flex_none().mx(10).mt(8).p(8).rounded(6).bg(t.raised).text_size(z - 1).text_color(t.blocked).child(textBlock(`edit-err-${i.path}`, e.err))))
      .child(Editor.new(this.code).flex_1().min_h(0))
      .child(h_flex().flex_none().px(10).py(6).gap(6).items_center().border_t(1).border_color(t.border)
        .child(div().flex_1().text_size(z - 2).text_color(t.dim).child(e.dirty ? "還沒存檔" : saidAfter))
        .child(btn(t, z, "reload-file", "重新讀取", { small: true, on: (cx) => cx.spawn(async (cx) => { await this.openItem(i, cx); cx.notify(); }) }))
        .child(btn(t, z, "outside", "用編輯器開", { small: true, on: () => { openOutside(i.path).catch(() => {}); } })));
  }

  // ---------- shared pieces ----------
  // needs: "missing" (放進上排) or "old" (更新版面), from layoutNeeds
  moveBanner(t, z, needs) {
    const say = needs === "old"
      ? "這個版面還有舊版 kit 的東西（kit-agents、kit-pane，或不是 kit 的 pane 標題列）。按下面的按鈕換成現在的：Agents、Kit 兩顆按鈕留在上排，每個 agent 視窗上是 Kit 按鈕。"
      : "這個面板還在版面最外面。按下面的按鈕，會放進上排（Agents、Kit 兩顆按鈕，按了開關面板），每個 agent 視窗上也會有 Kit 按鈕。";
    return v_flex().flex_none().px(12).py(10).gap(6).bg(t.raised).border_b(1).border_color(t.border)
      .child(div().text_size(z - 1).text_color(this.moveErr ? t.blocked : t.muted).child(this.moveErr ?? say))
      .child(h_flex().child(btn(t, z, "move", needs === "old" ? "更新版面" : "放進上排", { kind: "primary", on: (cx) => cx.spawn(async (cx) => moveIntoBar(this, cx)) })));
  }

  message(t, z, msg) { return messageBox(t, z, this.where, msg, () => this.setMsg(null), squeeze); }

  // working on it: a bar with a piece sliding through it (Herdr animates it; no timer) and what is going on
  working(t, z, text) {
    return v_flex().gap(4)
      .child(div().relative().h(4).w_full().rounded(2).overflow_hidden().bg(t.surface)
        .child(div().absolute().top(0).h(4).w(90).rounded(2).bg(t.accent).loop("left", { from: -90, to: 460, period: 1400 })))
      .child(div().text_size(z - 1.5).text_color(t.muted).child(text));
  }

  // The tab-bar button: "kit" plus how many new things there are; click shows / hides the panel.
  renderToggle() {
    const t = theme(), node = find(layout(), NODES.repo), on = node && !node.hidden;
    const d = this.data;
    const news = (d?.items ?? []).filter((i) => i.new).length;
    const badge = d?.error || apiState(null)?.ok === false ? div().text_color(t.ansi1).child("!")
      : news ? div().px(5).rounded(8).text_size(11).font_semibold().bg(t.done).text_color(t.background).child(String(news)) : null;
    return h_flex().size_full().pr(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("toggle-kit").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover((st) => st.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => run("layout.toggle", { id: NODES.repo }))
        .child("Kit")
        .when(Boolean(badge), (el) => el.child(badge)));
  }
}
