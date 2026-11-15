// An agent's HTML pages (an explanation, a diagram, a report) in a pane beside the agent.
// The agent writes <Herdr home>/mods/agent-page/pages/<dir>/<time>-<topic>.html and opens this pane once:
//   herdr-app do pane.split --direction right --pane <its pane> --mod agent-page --props '{"dir":"t63","beside":"<its pane>"}'
// (docs/agent-page.md has the steps for agents.) The pane shows the newest page (names sort by time), and then
// whichever page in the folder was written last; ◀ ▶ step through the folder.
// Only local files in this mod's folder: mod.json allows no site, so web links open in the system browser.
// Opening it again for the same dir while one is open closes the new copy (props.pane is the copy's own pane,
// shared "agent-page/<dir>" the one that's open). Either way the keyboard goes back to the agent's pane.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { appHome, nextWebEvent, panes, props, run, settings, setShared, shared, theme, watchFolder, web, webCall } from "herdr";
import * as fs from "fs/promises";

const CELL = "page";
const stop = (_e, cx) => cx.stop_propagation();
const size = () => Number(settings().ui_font_size) || 13;
// A dir is a folder name: a terminal id ("t63"); "/" of a remote terminal's id becomes "_".
const clean = (d) => String(d ?? "").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "") || "default";
const isPage = (n) => /\.html?$/i.test(n) && !n.startsWith(".");
// file:// URL of a local path (macOS /Users/..., Windows C:\Users\...).
const fileUrl = (p) => {
  const s = p.replace(/\\/g, "/");
  return "file://" + (/^[A-Za-z]:/.test(s) ? "/" : "") + encodeURI(s).replace(/#/g, "%23").replace(/\?/g, "%3F");
};

export default class AgentPage extends View {
  init(_p, cx) {
    const p = props() ?? {};
    this.dir = clean(p.dir);
    this.me = p.pane;
    this.beside = p.beside;
    // The agent makes the folder (a mod may not write here); the mod's own folder is watched, which on macOS and
    // Windows includes everything under it.
    this.root = `${appHome()}/mods/agent-page`;
    this.folder = `${this.root}/pages/${this.dir}`;
    this.names = [];
    this.name = null;
    this.alive = true;
    cx.spawn(async (cx) => {
      if (this.duplicate()) {
        this.alive = false;
        run("pane.close", { pane: this.me });
        this.giveBack();
        return;
      }
      if (this.me) setShared(`agent-page/${this.dir}`, this.me);
      this.giveBack();
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
      await this.list(null);
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
        // The page written last; a batch naming the folder itself means "look again".
        const sep = (s) => s.replace(/\\/g, "/");
        // By the end of the path: a linked mod's events may name the folder the link points to.
        const mine = `/agent-page/pages/${this.dir}/`;
        const written = changed.map(sep).filter((f) => f.includes(mine) && isPage(f.split("/").pop()));
        await this.list(written.length ? written[written.length - 1].split("/").pop() : null);
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

  // pane.split focuses the new pane; the person was typing to the agent.
  giveBack() {
    if (this.beside && panes().some((x) => x.pane === this.beside)) run("pane.focus", { pane: this.beside });
  }

  // Reads the folder; shows `written` if given, else keeps the page shown, else the newest.
  async list(written) {
    let names = [];
    try {
      names = (await fs.readdir(this.folder)).filter(isPage);
    } catch {
      names = [];
    }
    this.names = names;
    const before = this.name;
    if (written && names.includes(written)) this.name = written;
    else if (!names.includes(this.name)) this.name = names[names.length - 1] ?? null;
    // The same src never loads again: a page rewritten in place needs a reload.
    if (written && written === before) webCall(CELL, "reload");
  }

  step(by) {
    const i = this.names.indexOf(this.name) + by;
    if (i >= 0 && i < this.names.length) this.name = this.names[i];
  }

  render() {
    const t = theme(), z = size();
    const i = this.names.indexOf(this.name);
    const bar = h_flex().h(30).px(6).gap(2).flex_none().items_center().bg(t.chrome).border_b(1).border_color(t.border).text_size(z - 1)
      .child(this.tool(t, "ap-prev", "◀", () => this.step(-1), i > 0))
      .child(this.tool(t, "ap-next", "▶", () => this.step(1), i >= 0 && i < this.names.length - 1))
      .child(div().flex_1().min_w(0).px(6).truncate().text_color(t.muted)
        .child(this.name ? `${this.name}  ·  ${i + 1}/${this.names.length}` : this.dir))
      .child(this.tool(t, "ap-reload", "⟳", () => webCall(CELL, "reload"), Boolean(this.name)));
    const body = this.name
      ? web.new(CELL, { src: fileUrl(`${this.folder}/${this.name}`) })
      : div().p(14).text_color(t.muted).child(this.note ?? `還沒有頁面。agent 把 .html 寫進 ${this.folder} 就會顯示在這裡。`);
    return v_flex().id("agent-page").size_full().bg(t.surface).text_size(z).text_color(t.foreground)
      .child(bar)
      .when(Boolean(this.note && this.name), (el) => el.child(div().px(8).py(4).text_size(z - 1).text_color(t.muted).child(this.note)))
      .child(div().flex_1().min_h(0).child(body));
  }

  tool(t, id, label, on, enabled) {
    return div().id(id).h(22).px(7).flex_none().flex().items_center().rounded(5)
      .text_color(enabled ? t.muted : t.dim)
      .when(enabled, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { if (enabled) { on(); cx.notify(); } })
      .child(label);
  }
}
