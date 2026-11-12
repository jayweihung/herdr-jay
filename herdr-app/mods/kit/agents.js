// Roles "agents" and "agents-toggle" of the kit mod (see main.js): the agents kit's sources define
// (agents/<name>.md: which rules, skills and MCP it gets, which tools, its prompt). See them, change what each one
// uses, open one in a new tab.
//   agents          the panel ("kit-agents-panel" beside the work area, hidden until its button is pressed; or a window)
//   agents-toggle   the tab-bar button next to Kit's that shows or hides it
// Beside the repository panel (role "repo"), not inside it. This computer only: the sources are the same on every
// machine, kit push sends the change and kit sync brings it everywhere.
// Shared state (keys in common.js): AGENTS_DATA is kit agents --json (AGENTS_LOAD its load); AGENTS_MSG is kit's words
// after an action; the one-action-at-a-time lock (BUSY) is the whole mod's. A change here marks the repository's data out of date,
// so the panel reads it again. Everything goes through kit:
//   kit agents --json                              every agent and what it uses, what there is to add
//   kit agent <name> add|rm rule|skill|mcp <item>  change an agent (its file in the source)
//   kit run <name> --tool claude|codex|omp         open it (in a new tab)
// Each agent has a logo (bots.js): a cute animal-robot head, `bot: <animal>` or `bot: <animal> <color>` in its file's
// frontmatter (written here, not by kit; kit keeps the line and kit push sends it), or one its name picks. In the list
// a still picture; in its page drawn live (it says hello).
import { div } from "gpui-kit";
import { v_flex, h_flex, Editor } from "gpui-base";
import { theme, run, shared, setShared, readTextFile, writeTextFile, closeOverlay, openOverlay, props, spaces, focused, layout } from "herdr";
import { AGENTS_DATA, AGENTS_LOAD, AGENTS_MSG, NODES, fs, stop, isWindows, shortDir, spin, waiting, find, textBlock, copyOnRight, btn,
  busyNow, dropStaleBusy, giveBusy, markRepoStale, kit, kitJson, localKit, apiState, apiKnown, checkApi, apiCard, messageBox, problemCard, newEditor,
  localGet, localSet, kitAction, loadNewest, loadingNow } from "./common.js";
import { ANIMALS, COLORS } from "./bot-models.js";
import { readBot, withBot, pickBot, botIcon, botProblem, LiveBot } from "./bots.js";

const PANEL = NODES.agents;
const SHORT = 120000, STALE = 50000;
const KINDS = [["rule", "rules", "規則"], ["skill", "skills", "Skills"], ["mcp", "mcp", "MCP"]];
const TOOL_NAMES = { claude: "Claude", codex: "Codex", omp: "omp" };
const GIT = { new: "新的，還沒送出", changed: "改過" };

// kit agents --json, and each agent's logo from its file (bot, null: none named there)
async function loadAgents() {
  const { data, error } = kitJson(await kit(["agents", "--json"], 60000), "kit agents --json");
  if (error) return { error: error.message, code: error.code, at: Date.now() };
  const agents = await Promise.all((data.agents ?? []).map(async (a) => ({ ...a, bot: readBot(await readTextFile(a.path).catch(() => null)) })));
  return { ...data, agents, at: Date.now() };
}
// its logo: the one its file names, else the one its name picks
const botOf = (a) => a.bot ?? pickBot(a.name);

export class Agents {
  constructor(role) { this.role = role; }

  init(_p, cx) {
    if (this.role === "agents-toggle") return;   // the button only reads what the panel loaded
    this.open = null;      // the agent shown in detail (its name)
    this.adding = {};      // kind -> the "加上…" list is unfolded
    this.edit = null;      // { path, orig, dirty, err } while its file is open; this.code is the editor
    this.tool = localGet("kit.agents.tool") || "claude";
    this.mine = null;      // the id of the action this window started in kit.busy (shared with Kit: one kit action at a time)
    dropStaleBusy();
    // first whether kit is new enough (kit api), then kit agents --json; again when it is older than STALE
    const stale = () => !this.data || Date.now() - (this.data.at ?? 0) > STALE;
    const tick = (cx) => {
      const a = apiKnown(null);
      if (!a) return checkApi(null, cx);
      if (a.ok && (this.first || stale()) && !this.busy && !this.loading) this.refresh(cx);
    };
    this.first = true;     // loads once when it opens, whatever is in AGENTS_DATA
    tick(cx);
    cx.timer.every(2000, tick);
  }

  async close(_cx) {
    giveBusy(this.mine);
    this.code?.release();
    this.code = null;
    this.live?.release();
    this.live = null;
  }

  get data() { return shared(AGENTS_DATA) ?? null; }
  get busy() { return busyNow(); }
  get loading() { return loadingNow(AGENTS_LOAD); }

  refresh(cx) {
    if (apiState(null)?.ok === false) return checkApi(null, cx, true);   // ⟳ while kit can't be used: ask kit api again
    this.first = false;
    cx.spawn(async (cx) => { await loadNewest(AGENTS_LOAD, AGENTS_DATA, loadAgents); this.liveBot(); cx.notify(); });
  }
  // the agent page's logo, drawn live: one view, made on the first agent opened (cx: an event's), told when the agent
  // shown or its logo changes
  liveBot(cx = null) {
    const a = this.open && (this.data?.agents ?? []).find((x) => x.name === this.open);
    if (!a) return;
    const p = { ...botOf(a), size: 84 };
    if (this.live) this.live.set_props(p);
    else if (cx) this.live = cx.new(LiveBot, p);
  }
  // an agent file changed: this list and the repository's (改過 / 送出) are out of date
  changed(cx) {
    markRepoStale();
    this.refresh(cx);
  }

  // kit agent <name> add|rm ...: one at a time, kit's own words shown above
  act(label, args, cx) { kitAction(this, cx, { label, args, msg: AGENTS_MSG, ttl: SHORT, after: (cx) => this.changed(cx) }); }

  // where kit run starts: kit here is this computer's, so a space on this computer (the shown one if it is,
  // else the first), in the folder of the pane you were in when that is on this computer too
  place() {
    const f = focused(), all = spaces() ?? [];
    const local = all.filter((s) => !s.machine);
    const sp = local.find((s) => s.id === f?.space) ?? local.find((s) => s.active) ?? local[0] ?? null;
    const folder = sp && f?.space === sp.id && f?.cwd ? f.cwd : sp?.folder || null;
    return { ...(sp ? { space: sp.id } : {}), ...(folder ? { folder } : {}) };
  }

  // kit run <agent> in a new tab (kit syncs first, then starts the tool)
  openAgent(name, cx) {
    if (this.opening) return;
    const where = this.place();
    if (!where.space) {
      setShared(AGENTS_MSG, { ok: false, label: "開啟", text: "這台電腦沒有開著的 space：先在這台開一個 space，再按開啟。", at: Date.now() });
      cx.notify();
      return;
    }
    this.opening = true;
    cx.spawn(async (cx) => {
      try {
      const argv = [localKit()];
      const tools = this.data?.tools ?? ["claude"];
      const tool = tools.includes(this.tool) ? this.tool : "claude";
      const kitArgs = [...argv, "run", name, "--tool", tool];
      // kit.cmd is a batch file: start it through cmd so the terminal can run it
      const full = isWindows() && /\.(cmd|bat)$/i.test(argv[0]) ? ["cmd.exe", "/d", "/c", ...kitArgs] : kitArgs;
      try {
        await run("tab.new", { name: `${name}（${TOOL_NAMES[tool] ?? tool}）`, argv: full, ...where });
        setShared(AGENTS_MSG, { ok: true, label: "開啟", text: `在新分頁開了 ${name}（${TOOL_NAMES[tool] ?? tool}）`, at: Date.now() });
      } catch (e) {
        setShared(AGENTS_MSG, { ok: false, label: "開啟", text: `開不起來：${e?.message ?? e}`, at: Date.now() });
      }
      } finally { this.opening = false; cx.notify(); }
    });
  }

  // its file (frontmatter + prompt) in an editor, saved only if nobody changed it meanwhile
  async editFile(a, cx) {
    const text = await readTextFile(a.path).catch(() => null);
    if (text === null) { setShared(AGENTS_MSG, { ok: false, label: "打開", text: `讀不到 ${shortDir(a.path)}`, at: Date.now() }); return; }
    this.code?.release();
    this.code = newEditor(text, "md");
    this.edit = { path: a.path, name: a.name, orig: text, dirty: false, err: null };
    this.code.on("change", (_e, cx) => {
      const dirty = this.code.value() !== this.edit?.orig;
      if (this.edit && dirty !== this.edit.dirty) { this.edit.dirty = dirty; cx.notify(); }
    });
  }
  closeFile(cx) { this.code?.release(); this.code = null; this.edit = null; cx.notify(); }
  saveFile(cx) {
    const e = this.edit;
    if (!e?.dirty) return;
    const text = this.code.value();
    cx.spawn(async (cx) => {
      try {
        await writeTextFile(e.path, text, e.orig);
        e.orig = text; e.dirty = false; e.err = null;
        this.changed(cx);
      } catch { e.err = "這個檔案在別的地方被改過了。先複製你改的，按「重新讀取」，再貼回去。"; }
      cx.notify();
    });
  }

  // its logo: `bot:` in its file set to b (null: taken out, its name picks again); shown at once, saved only if
  // nobody changed the file meanwhile
  setBot(a, b, cx) {
    if (this.savingBot) return;
    this.savingBot = true;
    cx.spawn(async (cx) => {
      const fail = (text) => setShared(AGENTS_MSG, { ok: false, label: "Logo", text, at: Date.now() });
      try {
        const text = await readTextFile(a.path);
        const next = text === null ? null : withBot(text, b);
        if (next === null) fail(`${shortDir(a.path)} 讀不到，或開頭沒有 --- 區塊：logo 沒改`);
        else if (next !== text) {
          await writeTextFile(a.path, next, text);
          const d = this.data;
          if (d?.agents) setShared(AGENTS_DATA, { ...d, agents: d.agents.map((x) => (x.name === a.name ? { ...x, bot: b } : x)) });
          this.liveBot();
          this.changed(cx);
        }
      } catch (e) { fail(`logo 存不進去：${e?.message ?? e}`); }
      finally { this.savingBot = false; cx.notify(); }
    });
  }

  // The tab-bar button: "Agents", with how many agent files are changed and not sent; click shows / hides the panel
  // (no panel in this layout: the Agents window).
  renderToggle() {
    const t = theme(), node = find(layout(), PANEL), on = Boolean(node && !node.hidden);
    const d = this.data, changed = (d?.agents ?? []).filter((a) => a.git === "new" || a.git === "changed").length;
    const bad = Boolean(d?.error) || apiState(null)?.ok === false;   // kit can't be used, or its list failed: open it to see why
    return h_flex().size_full().pr(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("toggle-kit-agents").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover((st) => st.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => { if (node) run("layout.toggle", { id: PANEL }); else openOverlay({ mod: "kit", props: { role: "agents" }, kind: "window", key: "kit-agents", width: 520, height: 640 }); })
        .child("Agents")
        .when(bad, (el) => el.child(div().text_color(t.ansi1).child("!")))
        .when(!bad && changed > 0, (el) => el.child(div().size(6).rounded(3).bg(t.working))));
  }

  render(_cx) {
    if (this.role === "agents-toggle") return this.renderToggle();
    const t = theme(), z = fs(), d = this.data, msg = shared(AGENTS_MSG);
    const root = v_flex().id("kit-agents-root").size_full().bg(t.surface).text_size(z).text_color(t.foreground);
    const a = this.open && (d?.agents ?? []).find((x) => x.name === this.open);
    root.child(this.header(t, z, d, a));
    const api = apiState(null);
    if (api?.kind && !api.ok) return root.child(apiCard(t, z, api, null, "agents"));
    if (msg) root.child(this.message(t, z, msg));
    if (!d) return root.child(div().p(14).child(waiting(t, z, "讀取中…")));
    if (d.error) return root.child(problemCard(t, z, "agents", d.error, d.code));
    if (this.edit) return root.child(this.editor(t, z));
    if (a) return root.child(this.detail(t, z, d, a));
    return root.child(this.list(t, z, d));
  }

  header(t, z, d, a) {
    const busy = this.busy, n = (d?.agents ?? []).length;
    const sub = a ? `${a.source} · ${shortDir(a.path)}` : d && !d.error ? `${n} 個 agent · 用 kit run 開` : "Kit 來源裡定義好的 agent";
    const overlay = props()?.overlay;
    return h_flex().flex_none().px(10).py(8).gap(8).items_center().border_b(1).border_color(t.border)
      .when(Boolean(a) && !this.edit, (el) => el.child(btn(t, z, "back", "← 回去", { small: true, on: (cx) => { this.open = null; this.adding = {}; cx.notify(); } })))
      .when(!a, (el) => el.child(div().size(32).flex_none().rounded(8).bg(t.raised).flex().items_center().justify_center().font_semibold().text_size(z - 4).child("agent")))
      .child(v_flex().flex_1().min_w(0)
        .child(a ? copyOnRight(div().truncate().font_semibold().child(a.name), a.name) : div().truncate().font_semibold().child("Agents"))
        .child(a ? copyOnRight(div().truncate().text_size(z - 1.5).text_color(t.muted).child(sub), a.path) : div().truncate().text_size(z - 1.5).text_color(t.muted).child(sub)))
      .when(Boolean(busy), (el) => el.child(h_flex().flex_none().gap(5).items_center().text_size(z - 1.5).text_color(t.muted).child(spin(z - 2, t.muted)).child(`${busy}…`)))
      .child(btn(t, z, "reload", this.loading ? spin(z - 2, t.dim) : "⟳", { small: true, off: Boolean(this.loading), on: (cx) => this.refresh(cx) }))
      .when(Boolean(overlay), (el) => el.child(btn(t, z, "close", "✕", { small: true, on: () => closeOverlay(overlay) })))
      .when(!overlay && Boolean(find(layout(), PANEL)), (el) => el.child(btn(t, z, "hide", "✕", { small: true, on: () => run("layout.hide", { id: PANEL }) })));
  }

  message(t, z, msg) { return messageBox(t, z, "agents", msg, () => setShared(AGENTS_MSG, null)); }

  badge(t, z, text, color) {
    return div().flex_none().px(5).rounded(4).text_size(z - 2.5).text_color(t.background).bg(color).child(text);
  }

  // every agent: name, git state, what it is, where from, how much it uses; click for its detail
  list(t, z, d) {
    const body = v_flex().flex_1().min_h(0).overflow_y_scrollbar().px(10).py(8).gap(2);
    const ags = [...(d.agents ?? [])].sort((x, y) => x.name.localeCompare(y.name));
    if (!ags.length) return body.child(div().p(8).text_color(t.muted).child("來源裡還沒有 agent。在終端機打  kit new agent <名字>  寫一個。"));
    for (const a of ags) {
      const counts = `規則 ${(a.rules ?? []).length} · skill ${(a.skills ?? []).length} · MCP ${(a.mcp ?? []).length}`;
      body.child(h_flex().id(`ag-${a.name}`).gap(10).items_center().px(8).py(6).rounded(6).cursor_pointer()
        .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click((_e, cx) => { this.open = a.name; this.adding = {}; this.picking = false; this.liveBot(cx); setShared(AGENTS_MSG, null); cx.notify(); })
        .child(botIcon(t, botOf(a), 44))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(h_flex().gap(5).items_center().min_w(0)
            .child(copyOnRight(div().min_w(0).truncate().font_semibold().child(a.name), a.name))
            .when(Boolean(GIT[a.git]), (el) => el.child(this.badge(t, z, GIT[a.git], a.git === "new" ? t.done : t.working))))
          .child(copyOnRight(div().min_w(0).truncate().text_size(z - 1.5).text_color(t.muted).child([a.description, a.source].filter(Boolean).join(" · ") || "（還沒寫說明）"),
            a.description || a.path))
          .child(div().text_size(z - 2).text_color(t.dim).child(counts)))
        .child(div().flex_none().text_color(t.dim).child("›")));
    }
    return body;
  }

  // one agent: what it is, its tools, what it uses (拿掉) and could use (加上…), open it, edit its file
  detail(t, z, d, a) {
    const busy = Boolean(this.busy), avail = d.available ?? {};
    const body = v_flex().flex_1().min_h(0).overflow_y_scrollbar().px(10).py(8).gap(8);
    body.child(h_flex().gap(10).items_center()
      .child(this.live ?? botIcon(t, botOf(a), 84))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(a.description ? textBlock(`kit-agents-desc-${a.name}`, a.description) : div().child("（還沒寫說明）"))
        .when(Boolean(GIT[a.git]), (el) => el.child(div().text_size(z - 1.5).text_color(a.git === "new" ? t.done : t.working)
          .child(`${GIT[a.git]}：改好按倉庫的「送出」，或在終端機打  kit push`)))
        .child(h_flex().id("bot-pick").gap(6).items_center().cursor_pointer().text_size(z - 1.5).text_color(t.muted)
          .hover((s) => s.text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { this.picking = !this.picking; cx.notify(); })
          .child(div().w(12).child(this.picking ? "▾" : "▸")).child("換 logo…"))));
    if (this.picking) body.child(this.botPicker(t, z, a));
    // open: pick the tool, then kit run in a new tab
    const tools = d.tools ?? ["claude"], cur = tools.includes(this.tool) ? this.tool : "claude";
    body.child(h_flex().gap(4).items_center().flex_wrap()
      .children(tools.length > 1 ? tools.map((tool) => div().id(`tool-${tool}`).px(8).py(2).rounded(5).text_size(z - 1.5).cursor_pointer()
        .bg(tool === cur ? t.selected : t.raised).text_color(tool === cur ? t.foreground : t.muted)
        .border_1().border_color(tool === cur ? t.accent : t.raised)
        .on_mouse_down("left", stop).on_click((_e, cx) => { this.tool = tool; localSet("kit.agents.tool", tool); cx.notify(); })
        .child(TOOL_NAMES[tool] ?? tool)) : [])
      .child(div().flex_1())
      .child(btn(t, z, "edit", "編輯檔案", { small: true, on: (cx) => cx.spawn(async (cx) => { await this.editFile(a, cx); cx.notify(); }) }))
      .child(btn(t, z, "run", "開啟", { small: true, kind: "primary", on: (cx) => this.openAgent(a.name, cx) })));
    // tools it may use
    const only = a.tools_only ?? [], deny = a.tools_deny ?? [];
    body.child(v_flex().gap(2).p(8).rounded(6).bg(t.raised).text_size(z - 1.5)
      .child(div().font_semibold().text_size(z - 1).child("可以用的工具"))
      .child(div().text_color(t.muted).child(only.length ? textBlock(`kit-agents-only-${a.name}`, `只能用：${only.join("、")}`) : "不限（照工具本身的設定）"))
      .when(deny.length > 0, (el) => el.child(div().text_color(t.muted).child(textBlock(`kit-agents-deny-${a.name}`, `不准用：${deny.join("、")}`)))));
    // what it uses, per kind
    for (const [kind, key, title] of KINDS) {
      const used = a[key] ?? [], more = (avail[kind] ?? []).filter((x) => !used.includes(x)).sort();
      body.child(div().mt(4).font_semibold().child(`${title}（${used.length}）`));
      if (!used.length) body.child(div().pl(8).text_size(z - 1.5).text_color(t.dim).child("沒有"));
      for (const name of used) body.child(h_flex().id(`use-${kind}-${name}`).gap(8).items_center().px(8).py(4).rounded(6).hover((s) => s.bg(t.hover))
        .child(copyOnRight(div().flex_1().min_w(0).truncate().child(name), name))
        .child(btn(t, z, `rm-${kind}-${name}`, "拿掉", { small: true, off: busy, on: (cx) => this.act(`拿掉 ${name}`, ["agent", a.name, "rm", kind, name], cx) })));
      if (!more.length) continue;
      const open = Boolean(this.adding[kind]);
      body.child(h_flex().id(`more-${kind}`).gap(6).items_center().pl(8).cursor_pointer().text_size(z - 1.5).text_color(t.muted)
        .hover((s) => s.text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click((_e, cx) => { this.adding[kind] = !open; cx.notify(); })
        .child(div().w(12).child(open ? "▾" : "▸")).child(`加上…（${more.length}）`));
      if (open) for (const name of more) body.child(h_flex().id(`add-${kind}-${name}`).gap(8).items_center().px(8).py(4).rounded(6).hover((s) => s.bg(t.hover))
        .child(copyOnRight(div().flex_1().min_w(0).truncate().text_color(t.muted).child(name), name))
        .child(btn(t, z, `add-${kind}-${name}-b`, "加上", { small: true, kind: "primary", off: busy, on: (cx) => this.act(`加上 ${name}`, ["agent", a.name, "add", kind, name], cx) })));
    }
    if (a.prompt) body.child(v_flex().mt(4).gap(4)
      .child(div().font_semibold().child("Prompt"))
      .child(div().p(8).rounded(6).bg(t.raised).text_size(z - 1.5).text_color(t.muted).child(textBlock(`kit-agents-prompt-${a.name}`, a.prompt))));
    return body;
  }

  // the logo's animal (each in the colors chosen) and color (原色: the animal's own); each click saves it in the
  // file; a random one, or back to the one its name picks
  botPicker(t, z, a) {
    const cur = botOf(a), off = Boolean(this.savingBot), problem = botProblem();
    const set = (b) => (cx) => { if (!off) this.setBot(a, b, cx); };
    const animal = ANIMALS.find((x) => x.key === cur.animal), color = COLORS.find((c) => c.key === cur.color);
    const any = (list) => list[Math.floor(Math.random() * list.length)];
    const random = () => {
      let b;
      do b = { animal: any(ANIMALS).key, color: Math.random() < 0.5 ? null : any(COLORS).key };
      while (b.animal === cur.animal && b.color === cur.color);
      return b;
    };
    const ring = (on) => (on ? t.foreground : t.surface);
    return v_flex().gap(8).p(8).rounded(6).border_1().border_color(t.border).text_size(z - 1.5)
      .child(h_flex().gap(6).items_center()
        .child(div().flex_1().min_w(0).text_color(t.muted).child(`${animal?.name ?? cur.animal} · ${color?.name ?? "原色"}`
          + (a.bot ? "（寫在檔案的 bot: 裡）" : "（照名字挑的：選一個就寫進檔案）")))
        .child(btn(t, z, "bot-random", "隨機", { small: true, off, on: set(random()) }))
        .when(Boolean(a.bot), (el) => el.child(btn(t, z, "bot-reset", "照名字", { small: true, off, on: set(null) }))))
      .child(h_flex().gap(2).flex_wrap().children(ANIMALS.map((x) => {
        const on = x.key === cur.animal;
        return v_flex().id(`bot-animal-${x.key}`).items_center().px(3).py(2).rounded(8).cursor_pointer()
          .bg(on ? t.selected : t.surface).border_1().border_color(on ? t.accent : t.surface).hover((s) => s.bg(t.hover))
          .on_mouse_down("left", stop).on_click((_e, cx) => set({ animal: x.key, color: cur.color })(cx))
          .child(botIcon(t, { animal: x.key, color: cur.color }, 40))
          .child(div().text_size(z - 2.5).text_color(on ? t.foreground : t.muted).child(x.name));
      })))
      .child(h_flex().gap(6).flex_wrap().items_center()
        .child(div().id("bot-color-own").h(22).px(8).rounded(11).flex().items_center().cursor_pointer().bg(animal?.main ?? t.raised)
          .text_size(z - 2.5).text_color("#262a33").border_2().border_color(ring(!cur.color))
          .on_mouse_down("left", stop).on_click((_e, cx) => set({ animal: cur.animal, color: null })(cx)).child("原色"))
        .children(COLORS.map((c) => div().id(`bot-color-${c.key}`).size(22).rounded(11).cursor_pointer().bg(c.hex)
          .border_2().border_color(ring(c.key === cur.color))
          .on_mouse_down("left", stop).on_click((_e, cx) => set({ animal: cur.animal, color: c.key })(cx)))))
      .when(Boolean(problem), (el) => el.child(div().text_color(t.blocked).child(textBlock("kit-bots-problem", problem ?? ""))));
  }

  editor(t, z) {
    const e = this.edit;
    return v_flex().flex_1().min_h(0)
      .child(h_flex().flex_none().px(10).py(8).gap(6).items_center().border_b(1).border_color(t.border)
        .child(btn(t, z, "file-back", e.dirty ? "← 不存，回去" : "← 回去", { small: true, on: (cx) => this.closeFile(cx) }))
        .child(copyOnRight(div().flex_1().min_w(0).truncate().font_semibold().child(`${e.name}.md`), e.path))
        .child(btn(t, z, "file-save", e.dirty ? "存檔" : "已存", { small: true, kind: "primary", off: !e.dirty, on: (cx) => this.saveFile(cx) })))
      .when(Boolean(e.err), (el) => el.child(div().flex_none().mx(10).mt(8).p(8).rounded(6).bg(t.raised).text_size(z - 1).text_color(t.blocked).child(textBlock("kit-agents-edit-err", e.err))))
      .child(Editor.new(this.code).flex_1().min_h(0))
      .child(h_flex().flex_none().px(10).py(6).gap(6).items_center().border_t(1).border_color(t.border)
        .child(div().flex_1().text_size(z - 2).text_color(t.dim).child(e.dirty ? "還沒存檔" : "上面 --- 之間是設定（rules、skills、mcp、tools），下面是 prompt"))
        .child(btn(t, z, "file-reload", "重新讀取", { small: true, on: (cx) => cx.spawn(async (cx) => { const a = (this.data?.agents ?? []).find((x) => x.name === e.name); if (a) await this.editFile(a, cx); cx.notify(); }) })));
  }
}
