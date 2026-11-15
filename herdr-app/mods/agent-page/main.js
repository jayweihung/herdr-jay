// An agent's pages in a pane beside it: the first tab, 進度, is where the agent's work stands (waiting for you, doing,
// to do, done in the last DAYS days), from .pages/<dir>/status.json; the other tabs are the HTML pages it wrote for you
// (.pages/<dir>/<time>-<topic>.html), newest first. The folder is hidden (a dot) because Herdr reloads a mod when a
// file in its folder changes, except under hidden folders: each page written would reload every copy of this mod.
// A new page opens in its tab by itself; status.json is re-read.
// Opened from the ⎙ button in an agent pane's header (the kit mod), or by the agent:
//   herdr-app do pane.split '{"direction":"right","pane":"<its pane>","mod":"agent-page","props":{"dir":"t63","beside":"<its pane>"}}'
// (docs/agent-page.md: steps and status.json for agents.)
// An agent on another machine (props.machine, props.term): it writes the same folder there, under the home of the
// user Herdr connects as (~/.config/herdr-app/mods/agent-page/pages/<term>/); every SYNC ms this copy lists it there
// (through Herdr's connection) and, when something changed, copies the changed files here with scp over the machine's
// ssh target (hc machine ls), into .pages/<dir>/. Files gone there stay here.
// Only local files in this mod's folder: mod.json allows no site, so web links open in the system browser.
// Opening it again for the same dir while one is open closes the new copy (props.pane is the copy's own pane,
// shared "agent-page/<dir>" the one that's open). Either way the keyboard goes back to the agent's pane.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { appHome, exec, hc, nextWebEvent, panes, props, run, settings, setShared, shared, theme, watchFolder, web, webCall, window } from "herdr";
import * as fs from "fs/promises";

const CELL = "page";
const STATUS = "status.json";
// Done items shown: the last DAYS days (older ones stay in the file, counted, not listed).
const DAYS = 3;
const SYNC = 15000;
const REMOTE = ".config/herdr-app/mods/agent-page/pages";
// On the other machine: "<cksum> <name>" per page and status.json, nothing when the folder isn't there.
const LIST = 'cd "$HOME/$1" 2>/dev/null || exit 0; for f in *.html *.htm status.json; do [ -f "$f" ] && printf "%s %s\\n" "$(cksum < "$f" | tr " " _)" "$f"; done; exit 0';
const stop = (_e, cx) => cx.stop_propagation();
const size = () => Number(settings().ui_font_size) || 13;
// A dir is a folder name: a terminal id ("t63"); "/" of a remote terminal's id becomes "_". (kit's header.js has the same.)
const clean = (d) => String(d ?? "").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "") || "default";
const isPage = (n) => /\.html?$/i.test(n) && !n.startsWith(".");
// A tab's title: the name without the time in front and without .html.
const title = (n) => n.replace(/\.html?$/i, "").replace(/^\d{4}-\d{2}-\d{2}-\d{4}-?/, "") || n;
// file:// URL of a local path (macOS /Users/..., Windows C:\Users\...).
const fileUrl = (p) => {
  const s = p.replace(/\\/g, "/");
  return "file://" + (/^[A-Za-z]:/.test(s) ? "/" : "") + encodeURI(s).replace(/#/g, "%23").replace(/\?/g, "%3F");
};
const day = (d) => {
  const x = new Date(d);
  return isNaN(x) ? null : new Date(x.getFullYear(), x.getMonth(), x.getDate());
};
const text = (x) => (typeof x === "string" ? x : String(x?.text ?? ""));
const list = (x) => (Array.isArray(x) ? x.filter((i) => text(i)) : []);
const ago = (iso, now) => {
  const m = Math.round((now - new Date(iso)) / 60000);
  if (isNaN(m)) return "";
  return m < 1 ? "剛剛" : m < 60 ? `${m} 分鐘前` : m < 1440 ? `${Math.round(m / 60)} 小時前` : `${Math.round(m / 1440)} 天前`;
};

export default class AgentPage extends View {
  init(_p, cx) {
    const p = props() ?? {};
    this.dir = clean(p.dir);
    this.me = p.pane;
    this.beside = p.beside;
    this.remote = p.machine ? { machine: String(p.machine), term: clean(p.term ?? String(p.dir ?? "").split("/").pop()) } : null;
    // The agent makes the folder (a mod may not write here); the mod's own folder is watched, which on macOS and
    // Windows includes everything under it.
    this.root = `${appHome()}/mods/agent-page`;
    this.folder = `${this.root}/.pages/${this.dir}`;
    this.names = [];
    this.tab = "status";
    this.status = null;
    this.alive = true;
    cx.spawn(async (cx) => {
      if (this.duplicate()) {
        this.alive = false;
        run("pane.close", { pane: this.me });
        this.giveBack();
        return;
      }
      // Only when this pane is new: a copy made again for the same pane (a machine's layout coming back from its
      // core rebuilds the copies of that space) neither claims nor moves the focus, or each focus would rebuild it.
      if (!this.me || shared(`agent-page/${this.dir}`) !== this.me) {
        if (this.me) setShared(`agent-page/${this.dir}`, this.me);
        this.giveBack();
      }
      if (this.remote) {
        this.sync(cx);
        cx.timer.every(SYNC, (cx) => this.sync(cx));
      }
      cx.spawn(async (cx) => {
        while (this.alive) {
          const e = await nextWebEvent();
          if (e.kind === "loading" || e.kind === "loaded") this.note = null;
          else if (e.kind === "failed") this.note = `載入失敗：${e.error ?? ""}`;
          else if (e.kind === "blocked") this.note = e.url ? `已用瀏覽器開：${e.url}` : "這個連結不能在這裡開";
          else if (e.kind === "crashed") this.note = "頁面當掉了，已重新載入";
          else continue;
          cx.notify();
        }
      });
      await this.read(null);
      cx.notify();
      while (this.alive) {
        let changed;
        try {
          changed = await watchFolder(this.root);
        } catch (e) {
          this.note = `沒辦法看著 ${this.root}：${e}`;
          cx.notify();
          return;
        }
        if (!this.alive) return;
        // By the end of the path: a linked mod's events may name the folder the link points to.
        const mine = `/agent-page/.pages/${this.dir}/`;
        const files = changed.map((s) => s.replace(/\\/g, "/")).filter((f) => f.includes(mine)).map((f) => f.split("/").pop());
        const pages = files.filter(isPage);
        await this.read(pages.length ? pages[pages.length - 1] : null);
        cx.notify();
      }
    });
  }

  async close() {
    this.alive = false;
  }

  // Another copy for this dir is still open: this one isn't needed.
  duplicate() {
    const other = shared(`agent-page/${this.dir}`);
    return Boolean(this.me && other && other !== this.me && panes().some((x) => x.pane === other && x.mod === "agent-page"));
  }

  // The other machine's folder, copied here when it changed (one sync at a time).
  sync(cx) {
    if (!this.alive || this.syncing) return;
    this.syncing = true;
    cx.spawn(async (cx) => {
      const { machine, term } = this.remote, rel = `${REMOTE}/${term}`;
      try {
        const r = await exec("sh", ["-c", LIST, "sh", rel], { on: machine, timeout: SYNC });
        if (r.code !== 0) throw new Error(String(r.stderr || `exit ${r.code}`).trim());
        const now = new Map(String(r.stdout).split("\n").filter(Boolean).map((l) => { const i = l.indexOf(" "); return [l.slice(i + 1), l.slice(0, i)]; }));
        const before = this.listed ?? new Map();
        const changed = [...now].filter(([n, sum]) => before.get(n) !== sum).map(([n]) => n);
        if (changed.length) {
          const target = await this.target(machine);
          await this.makeFolder();
          const c = await exec("scp", ["-q", "-o", "BatchMode=yes", ...changed.map((n) => `${target}:${rel}/${n}`), `${this.folder}/`], { timeout: 60000 });
          if (c.code !== 0) throw new Error(String(c.stderr || `scp exit ${c.code}`).trim());
          const pages = changed.filter(isPage).sort();
          await this.read(this.listed ? pages[pages.length - 1] ?? null : null);
        }
        this.listed = now;
        this.syncNote = null;
      } catch (e) {
        this.syncNote = `從 ${machine} 拿頁面失敗：${e.message ?? e}`;
      } finally {
        this.syncing = false;
        cx.notify();
      }
    });
  }

  // The machine's ssh target (what Herdr connects with), else its name.
  async target(machine) {
    if (this.sshTarget) return this.sshTarget;
    try {
      const r = await hc(["machine", "ls", "--json"]);
      const m = (JSON.parse(String(r.stdout)).machines ?? []).find((x) => x?.name === machine);
      this.sshTarget = m?.target || machine;
    } catch {
      this.sshTarget = machine;
    }
    return this.sshTarget;
  }

  // fs.mkdir may refuse a linked mod's folder (it isn't under Herdr's home once the link is followed): then mkdir.
  async makeFolder() {
    try {
      await fs.mkdir(this.folder, { recursive: true });
    } catch {
      const r = window()?.platform === "windows"
        ? await exec("cmd", ["/c", "mkdir", this.folder.replace(/\//g, "\\")])
        : await exec("mkdir", ["-p", this.folder]);
      if (r.code !== 0) throw new Error(String(r.stderr || "mkdir").trim());
    }
  }

  // pane.split focuses the new pane; the person was typing to the agent.
  giveBack() {
    if (this.beside && panes().some((x) => x.pane === this.beside)) run("pane.focus", { pane: this.beside });
  }

  // Reads the folder and status.json; opens `written` (a page) if given; a tab whose page is gone goes to 進度.
  async read(written) {
    let names = [];
    try {
      names = (await fs.readdir(this.folder)).filter(isPage);
    } catch {
      names = [];
    }
    this.names = names.sort().reverse();
    try {
      const s = await fs.readFile(`${this.folder}/${STATUS}`, "utf8");
      this.status = JSON.parse(s);
      this.statusError = null;
    } catch (e) {
      // Missing: not written yet. Broken JSON (half written, or a mistake): keep the last good one, say so.
      this.statusError = /ENOENT|not found|no such/i.test(String(e)) ? null : `status.json 讀不了：${e.message ?? e}`;
      if (!this.statusError) this.status = null;
    }
    const before = this.tab;
    if (written && this.names.includes(written)) this.tab = written;
    else if (this.tab !== "status" && !this.names.includes(this.tab)) this.tab = "status";
    // The same src never loads again: a page rewritten in place needs a reload.
    if (written && written === before) webCall(CELL, "reload");
  }

  render() {
    const t = theme(), z = size();
    const tabs = h_flex().id("ap-tabs").flex_1().min_w(0).gap(2).items_center().overflow_x_scroll()
      .child(this.tabButton(t, "status", "進度"));
    for (const n of this.names) tabs.child(this.tabButton(t, n, title(n)));
    const page = this.tab !== "status";
    const bar = h_flex().h(30).px(6).gap(4).flex_none().items_center().bg(t.chrome).border_b(1).border_color(t.border).text_size(z - 1)
      .child(tabs)
      .when(page, (el) => el.child(this.tool(t, "ap-reload", "⟳", () => webCall(CELL, "reload"))));
    const body = page ? web.new(CELL, { src: fileUrl(`${this.folder}/${this.tab}`) }) : this.renderStatus(t, z);
    return v_flex().id("agent-page").size_full().bg(t.surface).text_size(z).text_color(t.foreground)
      .child(bar)
      .when(Boolean(this.note && page), (el) => el.child(div().px(8).py(4).text_size(z - 1).text_color(t.muted).child(this.note)))
      .child(div().flex_1().min_h(0).child(body));
  }

  renderStatus(t, z) {
    const s = this.status, now = Date.now();
    const box = v_flex().id("ap-status").size_full().overflow_y_scrollbar().px(14).py(12).gap(14);
    if (this.syncNote) box.child(div().whitespace_normal().text_size(z - 1).text_color(t.blocked).child(this.syncNote));
    if (this.statusError) box.child(div().text_size(z - 1).text_color(t.blocked).child(this.statusError));
    if (!s) {
      const where = this.remote ? `${this.remote.machine} 上的 ~/${REMOTE}/${this.remote.term}/${STATUS}` : `${this.folder}/${STATUS}`;
      return box.child(div().whitespace_normal().text_color(t.muted).child(
        `還沒有進度。agent 把做完的、正在做的、還沒做的寫進 ${where}，就會顯示在這裡（docs/agent-page.md）。`));
    }
    box.child(h_flex().gap(8).items_center()
      .child(div().flex_1().min_w(0).truncate().font_semibold().child(text(s.title) || "進度"))
      .when(Boolean(this.remote), (el) => el.child(div().flex_none().text_size(z - 2).text_color(t.dim).child(`在 ${this.remote.machine}`)))
      .when(Boolean(s.updated), (el) => el.child(div().flex_none().text_size(z - 2).text_color(t.dim).child(`更新 ${ago(s.updated, now)}`))));
    const waiting = list(s.waiting);
    if (waiting.length) {
      const w = v_flex().gap(6).p(10).rounded(8).border_1().border_color(t.blocked)
        .child(div().font_semibold().text_color(t.blocked).child(`等你（${waiting.length}）`));
      for (const i of waiting) {
        w.child(v_flex().gap(2)
          .child(div().whitespace_normal().child(text(i)))
          .when(Boolean(i?.cmd), (el) => el.child(div().px(6).py(3).rounded(4).bg(t.raised).text_size(z - 1)
            .font_family("Menlo").whitespace_normal().child(String(i.cmd)))));
      }
      box.child(w);
    }
    box.child(this.section(t, z, "正在做", list(s.doing), t.accent));
    box.child(this.section(t, z, "還沒做", list(s.todo), t.muted));
    // Done: newest day first, the last DAYS days.
    const today = day(now), from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (DAYS - 1));
    const done = list(s.done), byDay = new Map();
    let older = 0;
    for (const i of done) {
      const d = day(i?.date);
      if (!d || d < from) { older++; continue; }
      const k = `${d.getMonth() + 1}/${d.getDate()}${+d === +today ? "（今天）" : ""}`;
      if (!byDay.has(+d)) byDay.set(+d, { label: k, items: [] });
      byDay.get(+d).items.push(i);
    }
    const d = v_flex().gap(6).child(div().font_semibold().child("做完的"));
    if (!byDay.size) d.child(div().text_color(t.dim).child(`最近 ${DAYS} 天沒有`));
    for (const k of [...byDay.keys()].sort((a, b) => b - a)) {
      const g = byDay.get(k);
      d.child(div().pt(2).text_size(z - 1).text_color(t.dim).child(g.label));
      for (const i of g.items) d.child(this.item(t, z, i, t.done, "✓"));
    }
    if (older) d.child(div().text_size(z - 1).text_color(t.dim).child(`更早的還有 ${older} 項（沒列出）`));
    box.child(d);
    return box;
  }

  section(t, z, label, items, color) {
    const v = v_flex().gap(6).child(div().font_semibold().child(`${label}${items.length ? `（${items.length}）` : ""}`));
    if (!items.length) return v.child(div().text_color(t.dim).child("沒有"));
    for (const i of items) v.child(this.item(t, z, i, color, "•"));
    return v;
  }

  // One line: a mark, the text, and its project (if the agent named one).
  item(t, z, i, color, mark) {
    return h_flex().gap(8).items_start()
      .child(div().flex_none().w(12).text_color(color).child(mark))
      .child(div().flex_1().min_w(0).whitespace_normal().child(text(i)))
      .when(Boolean(i?.project), (el) => el.child(div().flex_none().px(5).rounded(4).bg(t.raised).text_size(z - 2).text_color(t.muted).child(String(i.project))));
  }

  tabButton(t, id, label) {
    const on = this.tab === id;
    return div().id(`ap-tab-${id}`).h(22).px(8).flex_none().max_w(180).truncate().flex().items_center().rounded(5)
      .bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
      .cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { this.tab = id; cx.notify(); })
      .child(label);
  }

  tool(t, id, label, on) {
    return div().id(id).h(22).px(7).flex_none().flex().items_center().rounded(5).text_color(t.muted)
      .cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { on(); cx.notify(); })
      .child(label);
  }
}
