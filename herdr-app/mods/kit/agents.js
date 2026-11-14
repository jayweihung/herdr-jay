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
//   kit place <name> <folder> --json               give it its own folder in a space, then a tab there (place.js):
//                                                  its card dragged onto a space (a newer Herdr), or 放到 space… (only an
//                                                  older Herdr, which can't drag: the drag says where better)
// Each agent has a logo (bots.js): a cute animal-robot head, `bot: <animal>` or `bot: <animal> <color>` in its file's
// frontmatter (written here, not by kit; kit keeps the line and kit push sends it), or one its name picks. In the list
// a still picture; in its page drawn live (it says hello).
// Two tabs: 定義 (the above) and 關係 (graph.js): the agents running now and who talks to whom, as a drawing or a
// timeline (timeline.js, from the event log events.js that the Agents button keeps while Herdr runs).
import { div } from "gpui-kit";
import { v_flex, h_flex, Editor } from "gpui-base";
import { theme, run, shared, setShared, readTextFile, writeTextFile, closeOverlay, openOverlay, props, spaces, focused, layout, agents, terminals, settings, panes, hc } from "herdr";
import { AGENTS_DATA, AGENTS_LOAD, AGENTS_MSG, CTX, NOTE, NODES, fs, stop, isWindows, shortDir, spin, waiting, find, textBlock, copyOnRight, btn,
  busyNow, dropStaleBusy, giveBusy, markRepoStale, kit, kitJson, localKit, apiState, apiKnown, checkApi, apiCard, messageBox, problemCard, newEditor,
  localGet, localSet, kitAction, loadNewest, loadingNow } from "./common.js";
import { ANIMALS, COLORS } from "./bot-models.js";
import { readBot, withBot, pickBot, botIcon, botProblem, LiveBot } from "./bots.js";
import { canDrag, draggable, dropLoop, requestPlace, takeAsks, placeClosed, placeDir, liveNow } from "./place.js";
import { graphData, graphView, edgeList, alertsView, legendView, layoutOf, nudgeText, LONG_WAIT } from "./graph.js";
import { logTick, eventLog, downMachines } from "./events.js";
import { SAID, SUBS, BG, STEPS, saidTick } from "./said.js";
import { timelineView, timelineHeight, SPANS } from "./timeline.js";
import { sidebarNames } from "./names.js";
import { loadMachines, machinesDue, machinesData, pendingRows } from "./machines.js";

const PANEL = NODES.agents;
const WHO_TTL = 120000;   // how long a pending's agent (found by its pid) is kept
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

// 等站長同意's agent: kit pending add keeps the agent's pid; the terminal on that machine whose program (Herdr's
// foreground pid, else its own) is that pid. hc get on that machine's agents, the same folder first; each answer kept
// WHO_TTL in shared WHO ("host|pid" -> { address, at }; none found too: asked again then)
const WHO = "kit.who.v1";
let whoBusy = false;
export const whoOf = (p) => (p?.pid ? (shared(WHO) ?? {})[`${p.host ?? ""}|${p.pid}`]?.address || null : null);
function whoTick(cx) {
  if (whoBusy) return;
  const known = shared(WHO) ?? {};
  const want = pendingRows(machinesData()?.rows).filter((p) => p.kind === "owner" && p.pid)
    .filter((p) => { const w = known[`${p.host ?? ""}|${p.pid}`]; return !w || Date.now() - w.at > WHO_TTL; });
  if (!want.length) return;
  whoBusy = true;
  cx.spawn(async (cx) => {
    try {
      const ags = agents(), terms = new Map((terminals() ?? []).map((r) => [r?.address, r]));
      const got = {};
      for (const p of want) {
        const on = ags.filter((x) => (String(x.address).includes("/") ? String(x.address).split("/")[0] : null) === (p.host ?? null));
        const cwd = (x) => String(terms.get(x.address)?.foreground?.cwd || terms.get(x.address)?.cwd || "");
        on.sort((x, y) => (cwd(y) === p.dir) - (cwd(x) === p.dir));
        let found = "";
        for (const x of on) {
          const r = await hc(["get", x.address, "--json"]).catch(() => null);
          let j = {};
          try { j = JSON.parse(r?.stdout ?? "{}"); } catch {}
          if (Number(j.foreground?.pid) === p.pid || Number(j.pid) === p.pid) { found = x.address; break; }
        }
        got[`${p.host ?? ""}|${p.pid}`] = { address: found, at: Date.now() };
      }
      setShared(WHO, { ...(shared(WHO) ?? {}), ...got });
    } finally { whoBusy = false; cx.notify(); }
  });
}
// For Herdr's own Agents list (app patch 0010): shared "agents.waiting" (address -> { since, hot }): an agent waiting
// for the owner's OK (kit pending add, its agent found above), and one waiting for you LONG_WAIT or more (hot: red).
// Written only when it changes.
export function waitingNow(pending, terms, now = Date.now()) {
  const out = {};
  for (const r of terms ?? []) {
    const st = typeof r?.status === "object" ? r.status?.state ?? r.status?.status : r?.status;
    const since = Number(r?.status_ms) || 0;
    if (st === "blocked" && since && now - since >= LONG_WAIT) out[r.address] = { since, hot: true };
  }
  for (const p of pending ?? []) {
    if (p.kind !== "owner" || !p.who) continue;
    const since = p.since ?? 0, hot = Boolean(since) && now - since >= LONG_WAIT;
    out[p.who] = { since, hot: hot || Boolean(out[p.who]?.hot) };
  }
  return out;
}
function publishWaiting() {
  const pending = pendingRows(machinesData()?.rows).map((p) => ({ ...p, who: whoOf(p) }));
  const next = waitingNow(pending, terminals());
  const was = shared("agents.waiting") ?? {};
  const key = (m) => JSON.stringify(Object.keys(m).sort().map((k) => [k, Boolean(m[k].hot)]));
  if (key(next) !== key(was)) setShared("agents.waiting", next);
}

export class Agents {
  constructor(role) { this.role = role; }

  init(_p, cx) {
    // the Agents window (an overlay, closed whenever people like) hands its places to the tab-bar button, which
    // starts them: closing the window then doesn't cancel one (place.js)
    this.handOff = this.role === "agents" && Boolean(props()?.overlay);
    // an agent card dropped on a space (newer Herdr): the panel and its button both wait for drops, so one is waiting
    // while the panel is shown (place.js)
    dropLoop(this, cx);
    if (this.role === "agents-toggle") {   // the button only reads what the panel loaded, and runs the window's places
      cx.timer.every(400, (cx) => takeAsks(this, cx));
      cx.timer.every(2000, () => { try { logTick(); } catch {} });   // the 關係 timeline's log, while Herdr runs
      // background work of done agents for Herdr's Agents list (agents.busy), and what they said, while Herdr runs
      cx.timer.every(2000, (cx) => { try { saidTick(agents(), terminals(), cx); } catch {} });
      // who waits for the owner's OK, for Herdr's own Agents list too (agents.waiting): kit status every 10 minutes
      cx.timer.every(5000, (cx) => {
        try { if (machinesDue()) loadMachines(cx); whoTick(cx); publishWaiting(); } catch {}
      });
      return;
    }
    this.open = null;      // the agent shown in detail (its name)
    this.placing = null;   // the agent whose 放到 space… list of spaces is open (its name)
    this.adding = {};      // kind -> the "加上…" list is unfolded
    this.edit = null;      // { path, orig, dirty, err } while its file is open; this.code is the editor
    this.tool = localGet("kit.agents.tool") || "claude";
    this.tab = props()?.big || localGet("kit.agents.tab") === "rel" ? "rel" : "defs";   // 定義 | 關係
    this.scope = (props()?.scope ?? localGet("kit.agents.scope")) === "all" ? "all" : "space";   // 關係: the shown space, or every space
    this.sel = null;       // 關係: the selected card (an address)
    this.view = localGet("kit.agents.view") === "time" ? "time" : "graph";   // 關係: 圖 | 時間軸
    this.span = SPANS.some(([k]) => k === localGet("kit.agents.span")) ? localGet("kit.agents.span") : "1h";
    this.mine = null;      // the id of the action this window started in kit.busy (shared with Kit: one kit action at a time)
    dropStaleBusy();
    // first whether kit is new enough (kit api), then kit agents --json; again when it is older than STALE
    const stale = () => !this.data || Date.now() - (this.data.at ?? 0) > STALE;
    const tick = (cx) => {
      try { logTick(); } catch {}
      if (this.tab === "rel") cx.notify();   // its "3 分前" move on
      // 等你簽 / 等站長同意: kit status on every machine and root's report (the 各機器 load), every 10 minutes
      if (this.tab === "rel" && machinesDue()) { try { loadMachines(cx); } catch {} }
      // 做完等你看: what each agent said when it stopped; each one's sub-agents (said.js)
      if (this.tab === "rel") { try { saidTick(agents(), terminals(), cx); } catch {} }
      if (this.tab === "rel") whoTick(cx);
      const a = apiKnown(null);
      if (!a) return checkApi(null, cx);
      if (a.ok && (this.first || stale()) && !this.busy && !this.loading) this.refresh(cx);
    };
    this.first = true;     // loads once when it opens, whatever is in AGENTS_DATA
    tick(cx);
    cx.timer.every(2000, tick);
  }

  async close(_cx) {
    placeClosed(this);   // a place it was running, or one no button took yet: the lock back, and people told
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
    if (!a && !this.edit) root.child(this.tabs(t, z));
    if (!a && !this.edit && this.tab === "rel") {   // 關係 says its own news too (提醒它回 went out or didn't)
      if (msg && msg.label === "提醒") root.child(this.message(t, z, msg));
      return root.child(this.relations(t, z));
    }
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

  tabs(t, z) {
    const tab = (id, label) => div().id(`kit-agents-tab-${id}`).px(10).py(5).text_size(z - 1).cursor_pointer()
      .border_b_2().border_color(this.tab === id ? t.accent : t.surface).text_color(this.tab === id ? t.foreground : t.muted)
      .hover((s) => s.text_color(t.foreground)).on_mouse_down("left", stop)
      .on_click((_e, cx) => { this.tab = id; localSet("kit.agents.tab", id); cx.notify(); }).child(label);
    return h_flex().flex_none().px(6).gap(2).border_b(1).border_color(t.border).child(tab("defs", "定義")).child(tab("rel", "關係"));
  }

  // 關係: the agents running in the shown space (or all), who talks to whom (graph.js)
  relations(t, z) {
    const f = focused(), shownSpace = f?.space ?? (spaces() ?? []).find((s) => s.active)?.id ?? null, now = Date.now();
    // waiting for the owner's OK: each pending's agent (its pid's terminal, whoTick), on the card and in the line
    const pending = pendingRows(machinesData()?.rows).map((p) => ({ ...p, who: whoOf(p) }));
    const owner = {};
    for (const p of pending) if (p.kind === "owner" && p.who) owner[p.who] = { since: p.since, what: p.what, here: Boolean(p.here) };
    const ags = agents(), g = graphData({ agents: ags, terms: terminals(), names: sidebarNames(ags, panes(), spaces()), space: this.scope === "space" ? shownSpace : null, ctx: shared(CTX), notes: shared(NOTE), log: eventLog(), down: downMachines(), said: shared(SAID), subs: shared(SUBS), bg: shared(BG), steps: shared(STEPS), owner, now });
    if (this.sel && !g.nodes.some((n) => n.address === this.sel)) this.sel = null;
    const scope = (id, label) => btn(t, z, `kit-graph-scope-${id}`, label, { tiny: true, kind: this.scope === id ? "primary" : undefined,
      on: (cx) => { this.scope = id; localSet("kit.agents.scope", id); cx.notify(); } });
    const pick = (key, field, id, label) => btn(t, z, `kit-graph-${field}-${id}`, label, { tiny: true, kind: this[field] === id ? "primary" : undefined,
      on: (cx) => { this[field] = id; localSet(key, id); cx.notify(); } });
    const spName = (spaces() ?? []).find((s) => s.id === shownSpace)?.name;
    const select = (a, cx) => { this.sel = a; this.view = "graph"; localSet("kit.agents.view", "graph"); cx.notify(); };
    const body = v_flex().id("kit-graph-body").flex_1().min_h(0).overflow_y_scrollbar()
      .on_size_change((size, cx) => {   // the drawing and the timeline fill the panel's width
        const w = Math.round(size.width / (Number(settings()?.zoom) || 1));
        if (w !== this.width) { this.width = w; cx.notify(); }
      })
      .child(h_flex().px(10).py(6).gap(6).items_center()
        .child(scope("space", spName ? `這個 space（${spName}）` : "這個 space")).child(scope("all", "全部 space"))
        .child(div().flex_1())
        .child(pick("kit.agents.view", "view", "graph", "圖")).child(pick("kit.agents.view", "view", "time", "時間軸"))
        // a bigger look: the same tab in its own window, most of the screen (not from that window itself)
        .when(!props()?.big, (el) => el.child(btn(t, z, "kit-graph-big", "放大", { tiny: true,
          on: () => openOverlay({ mod: "kit", props: { role: "agents", big: true, scope: this.scope }, kind: "window", key: "kit-agents-big", width: 0.9, height: 0.85 }) }))))
      .child(alertsView(t, z, g, now, select, { nudged: this.nudged, onNudge: (w, cx) => this.nudge(g, w, cx), pending }) ?? div());
    if (this.view === "time") {
      const span = SPANS.find(([k]) => k === this.span) ?? SPANS[1];
      return body
        .child(h_flex().px(10).pb(4).gap(6).items_center().child(div().text_size(z - 2.5).text_color(t.dim).child("最近"))
          .children(SPANS.map(([k, , label]) => pick("kit.agents.span", "span", k, label))))
        .child(div().id("kit-timeline-scroll").flex_none().w_full().h(timelineHeight(g.nodes.length) + 12).px(10).overflow_x_scrollbar().child(timelineView(t, z, g.nodes, eventLog(), span[1], now, this.width ?? 0)))
        .child(div().px(12).py(6).text_size(z - 2.5).text_color(t.dim)
          .child("色條是狀態（工作中、等你、做完、閒著），箭頭是一次傳話，白點是寫了進度（游標停上去看）。只有 Herdr 開著時記得到，留一天。"));
    }
    return body
      .child(legendView(t, z))
      .child(div().id("kit-graph-scroll").flex_none().w_full().h(layoutOf(g.cols, this.width ?? 0).h + 12).overflow_x_scrollbar()
        .child(graphView(t, z, g, this.sel, { now, width: this.width ?? 0, onSelect: (a, cx) => { this.sel = a; cx.notify(); } })))
      .child(edgeList(t, z, g, this.sel, now));
  }

  // 提醒它回: typed into the agent that stopped without answering, only while it is idle (never into one at work or
  // waiting on a dialog); once per message (this.nudged); a failure is said in the panel
  nudge(g, w, cx) {
    this.nudged ??= new Set();
    const key = `${w.from}>${w.to}@${w.at}`;
    if (this.nudged.has(key)) return;
    this.nudged.add(key);
    const who = g.nodes.find((n) => n.address === w.to)?.name ?? w.to;
    // hc send, not run(): run() takes the app's commands only. No HC_TERMINAL_ID here, so herdr-core neither tags it
    // as an agent's message nor counts it as a line in the graph.
    // the answer comes later: only the cx that cx.spawn hands over may be used then
    const fail = (why) => { this.nudged.delete(key); setShared(AGENTS_MSG, { ok: false, label: "提醒", text: `提醒沒送出（${who} 可能又在忙了）：${why}`, at: Date.now() }); };
    cx.spawn(async (cx) => {
      try {
        // only while it sits stopped: idle, or done (stopped, not looked at yet: what a silent one usually is). hc's
        // --if takes idle or working only, so done is let through on a second try that names it. Never while it
        // works (that would queue) or is blocked (hc refuses that anyway).
        const text = nudgeText(g, w), says = (r) => String(r?.stderr || r?.stdout || r?.code).trim();
        let r = await hc(["send", "--if", "idle", "--json", w.to, text]);
        if (r && r.code !== 0 && /status_mismatch/.test(says(r)) && /\bis done\b/.test(says(r))) r = await hc(["send", "--json", w.to, text]);
        if (r && r.code !== 0) fail(says(r));
        else setShared(AGENTS_MSG, { ok: true, label: "提醒", text: `已提醒 ${who} 回覆，等它回`, at: Date.now() });
      } catch (e) { fail(e?.message ?? e); }
      cx.notify();
    });
    cx.notify();
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
    // giving an agent its own folder in a space: drag (a newer Herdr), or the button (an older one only)
    body.child(div().px(8).pb(4).text_size(z - 2).text_color(t.dim).child(canDrag()
      ? "把 agent 拖到 Agents 或 Spaces 面板的 space 上（放在哪一列就排在那裡）：在那個 space 的資料夾裡建它自己的資料夾，開一個分頁跑它。"
      : "按「放到 space…」：在那個 space 的資料夾裡建 agent 自己的資料夾，開一個分頁跑它。"));
    const tool = this.curTool(), live = liveNow();
    for (const a of ags) {
      const counts = `規則 ${(a.rules ?? []).length} · skill ${(a.skills ?? []).length} · MCP ${(a.mcp ?? []).length}`;
      body.child(draggable(h_flex().id(`ag-${a.name}`).gap(10).items_center().px(8).py(6).rounded(6).cursor_pointer()
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
        .when(!canDrag(), (el) => el.child(btn(t, z, `place-${a.name}`, "放到 space…", { small: true, on: (cx) => this.toggleSpaces(a.name, cx) })))
        .child(div().flex_none().text_color(t.dim).child("›")), a, tool, live));
      if (this.placing === a.name) body.child(this.spacePicker(t, z, a));
    }
    return body;
  }

  // the tool chosen for opening (one this computer's kit writes for), the same for kit run and kit place
  curTool() { const tools = this.data?.tools ?? ["claude"]; return tools.includes(this.tool) ? this.tool : "claude"; }
  toggleSpaces(name, cx) { this.placing = this.placing === name ? null : name; cx.notify(); }

  // 放到 space…: every space (any machine); a click gives the agent its own folder there and opens it (place.js)
  spacePicker(t, z, a) {
    const all = spaces() ?? [], busy = Boolean(this.busy), tool = this.curTool();
    const box = v_flex().gap(2).p(8).rounded(6).border_1().border_color(t.border).text_size(z - 1.5)
      .child(div().text_color(t.muted).child(`選一個 space：在它的資料夾裡建 ${a.name} 自己的資料夾（它的規則、skill、MCP、prompt、工具限制），開一個新分頁跑 ${TOOL_NAMES[tool] ?? tool}。`));
    if (!all.length) box.child(div().text_color(t.dim).child("沒有開著的 space。"));
    for (const s of all) {
      const where = placeDir(s, a.name);
      box.child(h_flex().id(`place-${a.name}-${s.id}`).gap(8).items_center().px(6).py(4).rounded(5)
        .when(!busy, (el) => el.cursor_pointer().hover((st) => st.bg(t.hover)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { this.placing = null; requestPlace(a.name, s, tool, cx, "放到 space", this); cx.notify(); }))
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().text_color(busy ? t.dim : t.foreground).child(s.name || s.id))
          .child(div().truncate().text_size(z - 2).text_color(t.dim).child(`${s.machine ?? "這台電腦"} · ${s.machine ? where : shortDir(where)}`))));
    }
    return box.child(h_flex().child(btn(t, z, `place-cancel-${a.name}`, "取消", { small: true, on: (cx) => { this.placing = null; cx.notify(); } })));
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
      .when(!canDrag(), (el) => el.child(btn(t, z, `place-${a.name}`, "放到 space…", { small: true, on: (cx) => this.toggleSpaces(a.name, cx) })))
      .child(btn(t, z, "run", "開啟", { small: true, kind: "primary", on: (cx) => this.openAgent(a.name, cx) })));
    if (this.placing === a.name) body.child(this.spacePicker(t, z, a));
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
