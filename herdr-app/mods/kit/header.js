// Roles "header" and "context" of the kit mod.
//
// header: a pane's header (the layout's pane frame: "header": { "content": { "mod": "kit", "props": { "role":
// "header" } } }; Herdr adds { pane, terminal } to those props). Like Herdr's own header ("mod": "pane") it shows the
// program's icon, the name, the folder and the agent's status, with split / zoom / close on hover (always laid out,
// shown only on hover, so nothing in the header moves). On an agent's pane it adds kit's button (what this agent uses:
// rules, skills, MCP; one click opens the "agent" popup, agent.js) and how full its context is.
// This header is the one place that asks kit about an agent:
//   kit list --json --dir <its folder> --pid <its process>      on the pane's machine
// and keeps the answer in shared state (AGENT_CACHE, AGENT_DATA in common.js) for the popup to show; the popup's ⟳
// and anything that changed what the agent uses ask for a fresh one (AGENT_WANT).
// How full the context is comes from
//   kit context --pid <the agent's process> --tool <claude|codex|omp> --dir <its folder>
// kept in CTX, asked again every 15 s while it works. A failed ask keeps the numbers it had. With kit api 1.4 the same
// ask also gets what the agent wrote about where it is (kit note --pid <pid> --json, in NOTE), shown after the folder;
// a narrow header gives it room first (headerFit in context.js: the folder, then the chips' numbers give way).
//
// context (props { role, target }): the popup the context chip opens, where the tokens go, like Claude Code's own
// /context:  kit context ... --detail [--fresh]  on the agent's machine (kit keeps it a minute; ⟳ asks again). Its
// buttons type the tool's own command into that agent (hc send, only while it waits: idle or done): 壓縮 (/compact,
// with what to keep where the tool takes it) and 清空重來 (Claude /clear, Codex and omp /new), each confirmed first;
// 拿掉 takes off what kit manages (the popup's kit rm), 開檔 opens a memory / instruction file in kit's editor window
// (this computer only), 複製 copies the summary. Nothing is asked while kit there can't be used (kit api).
// What it computes (the bar, the numbers, the tips) is in context.js.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { panes, spaces, agents, props, run, theme, hc, shared, setShared, openOverlay, closeOverlay, notify, settings } from "herdr";
import { AGENT_CACHE, AGENT_DATA, AGENT_WANT, CTX, NOTE, EDITORS, fs, stop, slash, shortDir, clean, spin, waiting, icon, textBlock,
  copyOnRight, btn, busyNow, takeBusy, giveBusy, markChanged, kit, kitJson, apiState, apiKnown, apiAtLeast, checkApi, apiCard, num, kfmt } from "./common.js";
import { toolOf, ctxArgs, sendText, sendArgs, removal, ctxTips, summaryText, chipNumbers, level, howCounted, ago, catColorKey, barSegments,
  catShare, compactLine, noteArgs, noteView, headerFit, kitChipW, CTX_FULL, CTX_SHORT } from "./context.js";

const CTX_STALE = 15000, CTX_IDLE = 60000;   // how often to ask how full the context is: working / not
const STALE = 60000, LOAD_TTL = 90000;   // look again after a minute; a load longer than this is taken as lost
const SHORT = 120000;
const CTX_W = 480, CTX_H = 640;   // the context popup
export const POPUP_W = 440, POPUP_H = 560;    // the "agent" popup (agent.js draws it this tall)

// where a pane lives: its machine (its space's), and the key its answers are kept under
function placeOf(p) {
  const sp = spaces().find((s) => (s.tabs ?? []).some((t) => t.id === p.tab));
  const machine = sp?.machine ?? null;
  return { machine, space: sp?.id ?? null, key: `${machine ?? ""}|${p.cwd ?? ""}|${p.terminal}` };
}
const agentPanes = () => panes().filter((p) => p.terminal && p.program?.agent);
// only the keys of panes that still exist (each folder change makes a new key)
function pruned(obj) {
  const live = new Set(agentPanes().map((p) => placeOf(p).key));
  return Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => live.has(k)));
}

// kit list for one agent; never this computer's list in place of another machine's
async function loadAgent(machine, cwd, term) {
  const args = ["list", "--json"];
  if (cwd) args.push("--dir", cwd);
  const g = term ? await hc(["get", term, "--json"]).catch(() => null) : null;
  try { const pid = JSON.parse(g?.stdout ?? "{}").pid; if (pid) args.push("--pid", String(pid)); } catch {}
  const { data, error } = kitJson(await kit(args, 60000, machine), "kit list --json"), at = Date.now();
  return error ? { error: error.message, code: error.code, machine, at } : { ...data, machine, at };
}
// the button's words: how many rules / skills / MCP this agent reads (kit's for the account, its folder's own,
// and the set kit run started it with), each name counted once
function summary(d) {
  if (!d) return { text: "…", level: "dim" };
  if (d.error) return { text: "出錯了", level: "bad", why: d.error };
  if (d.here?.user) return { text: `${d.here.user} 唯讀`, level: "dim" };
  const names = { rule: new Set(), skill: new Set(), mcp: new Set() };
  for (const i of d.items ?? []) if ((i.status === "used" || i.status === "required") && names[i.kind]) names[i.kind].add(i.name);
  for (const i of d.here?.items ?? []) names[i.kind]?.add(`${i.scope}:${i.path ?? i.name}`);
  const ag = d.here?.agent;
  if (ag) for (const [k, key] of [["rule", "rules"], ["skill", "skills"], ["mcp", "mcp"]]) for (const n of ag[key] ?? []) names[k].add(n);
  const news = (d.items ?? []).filter((i) => i.new && i.kind !== "agent").length;
  const counts = [["規則", names.rule.size], ["skill", names.skill.size], ["MCP", names.mcp.size]];
  return { text: counts.map(([l, n]) => `${l} ${n}`).join(" · "), level: news ? "new" : "ok", news, counts, agent: ag?.name ?? null };
}

// how full an agent's context is: kit context on the agent's machine, for its foreground process.
// { numbers }, or null (this ask failed)
async function agentPid(term) {
  const g = term ? await hc(["get", term, "--json"]).catch(() => null) : null;
  try { const j = JSON.parse(g?.stdout ?? "{}"); return j.foreground?.pid ?? j.pid ?? null; } catch { return null; }
}
// With withNote (kit api 1.4) also what it wrote about where it is (kit note --pid --json): note { text, at } | null (none),
// undefined when not asked or the ask failed (the old one stays). -> { ctx, note }
async function loadContext(machine, cwd, term, tool, withNote) {
  const pid = await agentPid(term);
  if (!pid) return { ctx: null, note: undefined };
  const r = await kit(ctxArgs(pid, tool, cwd), 60000, machine);
  let ctx = null, note;
  if (r.code === 0) try { const d = JSON.parse(r.out); ctx = d && typeof d === "object" ? d : null; } catch {}
  if (withNote) {
    const n = await kit(noteArgs(pid), 30000, machine);
    if (n.code === 0) try { const d = JSON.parse(n.out); if (d && typeof d === "object") note = d.text ? { text: d.text, at: d.at } : null; } catch {}
  }
  return { ctx, note };
}
// a category's color in the bar and its dot
const catColor = (t, id) => t[catColorKey(id)] ?? t.dim;
const levelColor = (t, pct) => ({ full: t.blocked, high: t.working })[level(pct)] ?? t.foreground;

export class Header {
  constructor(role) { this.role = role; }

  init(_p, cx) {
    if (this.role === "context") return this.initContext(cx);
    this.hovered = false;
    // leftovers of older versions
    for (const k of ["kit.data.v1", "kit.target"]) if (shared(k) != null) setShared(k, null);
    cx.timer.every(1500, (cx) => this.tick(cx));
    this.tick(cx);
  }

  async close(_cx) {
    if (this.role !== "context") return;
    giveBusy(this.mine);
    this.mine = null;
    this.keep?.release();
    this.keep = null;
  }

  me() { return panes().find((p) => p.pane === props()?.pane); }

  // ask kit when there is no answer, it is a minute old, or someone asked for a fresh one; one ask at a time per agent.
  // First whether kit there is new enough (kit api): until it is, nothing else is asked.
  tick(cx) {
    const p = this.me();
    if (!p?.terminal || !p.program?.agent) return;
    const w = placeOf(p), api = apiKnown(w.machine);
    if (!api) { checkApi(w.machine, cx); return; }
    if (!api.ok) return;
    this.tickContext(p, cx);
    const c = (shared(AGENT_CACHE) ?? {})[w.key], want = (shared(AGENT_WANT) ?? {})[w.key] ?? 0;
    if (c?.busy && Date.now() - (c.started ?? 0) < LOAD_TTL) return;
    if (c && !c.busy && Date.now() - c.at < STALE && (c.started ?? 0) >= want) return;
    const started = Date.now();
    setShared(AGENT_CACHE, { ...pruned(shared(AGENT_CACHE)), [w.key]: { ...summary(null), ...(c ?? {}), busy: true, started } });
    cx.spawn(async (cx) => {
      let d;
      try { d = await loadAgent(w.machine, p.cwd, p.terminal); }
      catch (e) { d = { error: String(e?.message ?? e), machine: w.machine, at: Date.now() }; }
      setShared(AGENT_DATA, { ...pruned(shared(AGENT_DATA)), [w.key]: d });
      setShared(AGENT_CACHE, { ...pruned(shared(AGENT_CACHE)), [w.key]: { ...summary(d), started, at: Date.now(), busy: false } });
      cx.notify();
    });
  }

  // ask how full the context is: every 15 s while the agent works (and once when it stops), else every minute
  tickContext(p, cx) {
    const w = placeOf(p), all = shared(CTX) ?? {}, c = all[w.key];
    if (c?.busy && Date.now() - (c.started ?? 0) < LOAD_TTL) return;
    const age = Date.now() - (c?.at ?? 0), moved = c && c.status !== p.status;
    if (c && !moved && age < (p.status === "working" ? CTX_STALE : CTX_IDLE)) return;
    const started = Date.now();
    setShared(CTX, { ...pruned(all), [w.key]: { ...(c ?? {}), busy: true, started, status: p.status } });
    cx.spawn(async (cx) => {
      let d = null, note;
      try { ({ ctx: d, note } = await loadContext(w.machine, p.cwd, p.terminal, toolOf(p.app, p.program?.key), apiAtLeast(w.machine, 4))); } catch {}
      if (note !== undefined) setShared(NOTE, { ...pruned(shared(NOTE)), [w.key]: note });
      // a failed ask (no answer, kit busy, the machine away) keeps the numbers it had: only when it asked changes
      const before = (shared(CTX) ?? {})[w.key] ?? c ?? {};
      const now = d ? { ...d } : { ...before };
      setShared(CTX, { ...pruned(shared(CTX)), [w.key]: { ...now, busy: false, started, at: Date.now(), status: p.status } });
      cx.notify();
    });
  }

  // [context 35% 139k/400k]: like the Kit chip, one width whatever it says (the header never moves); yellow from
  // 70 %, red from 90 %; a click opens where the tokens go, a right-click copies the numbers
  // short (a narrow header with a note): [context 35%], the numbers in the tooltip
  contextChip(t, p, short) {
    const { has, pct, nums, copy, loading } = chipNumbers((shared(CTX) ?? {})[placeOf(p).key]);
    const color = pct == null ? t.dim : levelColor(t, pct);
    const chip = h_flex().id(`kit-ctx-${p.pane}`).flex_none().w(short ? CTX_SHORT : CTX_FULL).h(22).pl(2).pr(6).gap(5).items_center().rounded(6)
      .bg(t.surface).border_1().border_color(pct != null && pct >= 90 ? t.blocked : t.border).text_size(11).cursor_pointer()
      .hover((st) => st.bg(t.hover).border_color(t.accent))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); this.openContext(p); }).tooltip(short && has ? `context 用了 ${nums}，按一下看細項` : "context 用了多少，按一下看細項")
      .child(div().h(16).px(5).flex().flex_none().items_center().rounded(4).bg(t.raised).font_semibold().text_color(t.foreground).child("context"))
      .when(pct != null, (el) => el.child(div().flex_none().font_semibold().text_color(color).child(`${pct}%`)))
      // no number yet: "-" (short) or "讀取中", breathing like a card at work
      .when(pct == null, (el) => el.child(div().id(`kit-ctx-wait-${p.pane}`).flex_none().min_w(0).truncate().text_color(t.dim)
        .child(short ? "-" : nums).when(loading, (d) => d.loop("opacity", { from: 0.3, to: 1, period: 1400 }))))
      .when(!short && pct != null, (el) => el.child(div().min_w(0).truncate().text_color(t.dim).child(nums)));
    return has ? copyOnRight(chip, copy) : chip;
  }

  // [進度 改好 parser；下一步跑測試]: the first line of what the agent wrote (kit note), all of it in the tooltip, dim
  // after two hours; a right-click copies it
  noteChip(t, p, nv, dirHidden) {
    const tip = dirHidden && p.cwd ? `${nv.tip}\n資料夾：${shortDir(p.cwd)}` : nv.tip;
    const el = h_flex().id(`kit-note-${p.pane}`).flex_1().min_w(0).gap(5).items_center().text_size(11).tooltip(tip)
      .child(div().h(16).px(5).flex().flex_none().items_center().rounded(4).bg(t.raised).font_semibold().text_color(t.foreground).child("進度"))
      .child(div().min_w(0).truncate().text_color(nv.old ? t.dim : t.foreground).child(nv.line));
    return copyOnRight(el, nv.copy);
  }

  openContext(p) {
    const w = placeOf(p);
    const target = { key: w.key, pane: p.pane, term: p.terminal, machine: w.machine, cwd: p.cwd ?? null, tool: toolOf(p.app, p.program?.key),
      title: ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || "", program: p.program ?? null };
    openOverlay({ mod: "kit", props: { role: "context", target }, kind: "popup", width: CTX_W, height: CTX_H });
  }

  // split / zoom / close: always laid out (so nothing moves), seen and clickable only while the header is hovered
  button(t, id, name, command, args, live) {
    const b = div().id(id).flex_none().p(3).rounded(4).text_color(t.dim).child(svg(`mods/pane/${name}.svg`).size(14));
    if (!live) return b.invisible();
    return b.hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); run(command, args); });
  }

  // short (a narrow header with a note): just [Kit] (and its news), the counts in the tooltip; a problem always in words
  // what the Kit chip says: kit there can't be used (none, too old, newer than this mod): which, in red (the popup says
  // what to do); else this agent's counts
  kitSummary(p) {
    const w = placeOf(p), c = (shared(AGENT_CACHE) ?? {})[w.key], a = apiState(w.machine);
    return a?.kind && !a.ok ? { text: { missing: "沒有 kit", timeout: "kit 沒回應", old: "kit 太舊", newer: "mod 太舊" }[a.kind] ?? "kit 不能用", level: "bad" }
      : c?.text ? c : summary(null);
  }

  kitButton(t, p, short) {
    const w = placeOf(p), s = this.kitSummary(p);
    const color = s.level === "bad" ? t.blocked : t.dim, brief = short && Boolean(s.counts);
    // [kit | 規則 1  skill 3  MCP 1]: the word kit says what it is, the numbers stand out from their labels
    const body = s.counts
      ? s.counts.map(([label, n]) => h_flex().gap(3).items_center()
        .child(div().text_color(t.dim).child(label))
        .child(div().font_semibold().text_color(n ? t.foreground : t.dim).child(String(n))))
      : [div().text_color(color).child(s.text)];
    return h_flex().id(`kit-btn-${p.pane}`).flex_none().h(22).pl(2).pr(8).gap(7).items_center().rounded(6)
      .bg(t.surface).border_1().border_color(s.level === "bad" ? t.blocked : t.border).text_size(11)
      .hover((st) => st.bg(t.hover).border_color(t.accent))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        cx.stop_propagation();
        const target = { key: w.key, term: p.terminal, machine: w.machine, space: w.space, cwd: p.cwd ?? null,
          title: ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || "", program: p.program ?? null };
        openOverlay({ mod: "kit", props: { role: "agent", target }, kind: "popup", width: POPUP_W, height: POPUP_H });
      })
      .when(brief, (el) => el.tooltip(`${s.agent ? `${s.agent} · ` : ""}${s.text}，按一下看細項`))
      .child(div().h(16).px(5).flex().items_center().rounded(4).bg(t.raised).font_semibold().text_color(t.foreground).child("Kit"))
      .when(Boolean(s.agent) && !brief, (el) => el.child(div().text_color(t.accent).child(s.agent)))
      .children(brief ? [] : body)
      .when(Boolean(s.news), (el) => el.child(div().px(4).rounded(4).bg(t.done).text_color(t.background).child(`${s.news} 新`)));
  }

  render(cx) {
    if (this.role === "context") return this.renderContext(cx);
    const t = theme(), p = this.me();
    if (!p) return div();
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const pic = icon(p.program, 14, t.dim), st = p.status, pane = p.pane, agent = Boolean(p.terminal && p.program?.agent), live = this.hovered;
    const nv = agent ? noteView((shared(NOTE) ?? {})[placeOf(p).key]) : null;   // what the agent wrote about where it is
    const ctxOn = agent && apiState(placeOf(p).machine)?.ok !== false;
    // the note comes first: in a narrow header the folder, then the numbers, give way (headerFit)
    const fit = headerFit(this.width ?? 0, { name, dir: shortDir(p.cwd), note: nv?.line ?? "", kitW: agent ? kitChipW(this.kitSummary(p)) : 0, ctx: ctxOn });
    // the status in a small box of one width (a red "!" for Needs you, a dot when done, else nothing): the header never moves
    const status = div().flex_none().w(16).h(22).flex().items_center().justify_center()
      .when(st === "blocked", (el) => el.child(div().flex_none().size(14).flex().items_center().justify_center().rounded(7).bg(t.blocked)
        .text_size(10).font_bold().text_color(t.background).tooltip("Needs you：在等你回答").child("!")))
      .when(st === "done", (el) => el.child(div().size(7).flex_none().rounded(4).bg(t.done)));
    // split / zoom / close: always laid out (nothing moves; not over the chips, which a hover must reach), seen on hover
    const buttons = h_flex().flex_none().gap(2).items_center()
      .child(this.button(t, `kit-head-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }, live))
      .child(this.button(t, `kit-head-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }, live))
      .child(this.button(t, `kit-head-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }, live))
      .child(this.button(t, `kit-head-x-${pane}`, "close", "pane.close", { pane }, live));
    return h_flex().id(`kit-head-${pane}`).size_full().px(10).gap(8).items_center()
      .bg(t.background).border_b(1).border_color(t.border).text_size(12)
      .on_size_change((size, cx) => {
        const w = Math.round(size.width / (Number(settings()?.zoom) || 1));
        if (w !== this.width) { this.width = w; cx.notify(); }
      })
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(fit.nameMax).font_medium().text_color(t.foreground).child(name))
      .when(!nv || fit.dir, (el) => el.child(div().when(Boolean(nv), (el) => el.flex_none().max_w(200)).when(!nv, (el) => el.flex_1()).min_w(0).truncate().text_color(t.dim).child(shortDir(p.cwd))))
      .when(Boolean(nv), (el) => el.child(this.noteChip(t, p, nv, !fit.dir)))
      .when(agent, (el) => el.child(this.kitButton(t, p, fit.kit === "short")).when(ctxOn, (el) => el.child(this.contextChip(t, p, fit.ctx === "short"))))
      .child(status)
      .child(buttons);
  }

  // ---------- the context popup (role "context") ----------
  initContext(cx) {
    this.role = "context";
    this.target = props()?.target ?? {};
    this.d = null;          // kit context --detail's answer
    this.err = null;        // why the last ask failed (an older answer stays)
    this.loading = false;
    this.open = { msgs: true };   // which lists are open (group id, "group|name")
    this.more = {};         // lists shown in full
    this.ask = null;        // what waits for 確定: "compact", "clear", "clear2", "rm:<group>|<name>"
    this.msg = null;        // { ok, text } after a button
    this.sending = false;
    this.mine = null;       // the id of the kit.busy this window holds
    this.keep = InputState.new({ placeholder: "壓縮時要保留什麼（可空白）" });
    this.keep.on("submit", (_e, cx) => this.send("compact", cx));
    // kit context --detail only once kit api says kit there can be used (the header asks it; asked here too in case)
    const m = this.target.machine ?? null;
    const tick = (cx) => {
      const api = apiKnown(m);
      if (!api) checkApi(m, cx);
      else if (api.ok && !this.d && !this.err && !this.loading) this.loadDetail(false, cx);
      cx.notify();   // the agent's status (which buttons work) and "n 秒前"
    };
    tick(cx);
    cx.timer.every(2000, tick);
  }

  paneNow() { return panes().find((p) => p.pane === this.target.pane) ?? null; }
  agentNow() { try { return (agents() ?? []).find((a) => a.pane === this.target.pane) ?? null; } catch { return null; } }
  statusNow() { return this.agentNow()?.status ?? this.paneNow()?.status ?? null; }
  addrNow() { return this.agentNow()?.address ?? this.paneNow()?.terminal ?? this.target.term ?? null; }
  kitList() { return (shared(AGENT_DATA) ?? {})[this.target.key] ?? null; }
  get busy() { return busyNow(); }

  loadDetail(fresh, cx) {
    const m = this.target.machine ?? null;
    if (apiState(m)?.ok !== true) return checkApi(m, cx, true);   // ⟳ while kit can't be used: ask kit api again
    if (this.loading) return;
    this.loading = true;
    this.err = null;
    const tg = this.target, seq = (this.seq = (this.seq ?? 0) + 1);
    cx.spawn(async (cx) => {
      let d = null, err = null;
      try {
        const p = this.paneNow(), pid = await agentPid(p?.terminal ?? tg.term);
        if (!pid) err = "找不到這個 agent 的程式（它可能已經關掉了）。";
        else {
          const r = await kit(ctxArgs(pid, tg.tool, p?.cwd ?? tg.cwd, true, fresh), 60000, tg.machine ?? null);
          if (r.code !== 0) err = clean(r.err || r.out) || `kit context 失敗（${r.code}）`;
          else {
            try { d = JSON.parse(r.out); } catch { d = null; }
            if (!d || !Array.isArray(d.categories)) { d = null; err = "kit context --detail 的輸出讀不懂（kit 太舊？打 kit self-update）"; }
          }
        }
      } catch (e) { err = String(e?.message ?? e); }
      if (seq === this.seq) { if (d) this.d = d; this.err = err; this.loading = false; }
      cx.notify();
    });
  }

  // 壓縮 / 清空重來: the tool's own command, typed into this agent by hc send, only while it waits for you
  send(what, cx) {
    if (this.sending) return;
    const text = sendText(this.d?.commands, what, what === "compact" ? this.keep?.value() : "");
    const args = sendArgs(this.addrNow(), this.statusNow(), text);
    this.ask = null;
    if (!args) { this.msg = { ok: false, text: "沒送出：要等 agent 停下來（閒置或剛做完）才能送。" }; cx.notify(); return; }
    this.sending = true;
    this.msg = null;
    cx.notify();
    cx.spawn(async (cx) => {
      let err = null;
      try { const r = await hc(args); if (r?.code !== 0) err = String(r?.stderr || r?.stdout || `exit ${r?.code}`).trim().slice(0, 300); }
      catch (e) { err = String(e?.message ?? e); }
      this.sending = false;
      if (err) this.msg = { ok: false, text: `沒送出：${err}` };
      else {
        this.msg = { ok: true, text: what === "compact" ? `已送出 ${text}。壓縮要一點時間，好了按 ⟳ 再看。` : `已送出 ${text}：這段對話清掉了，按 ⟳ 再看。` };
        this.keep?.set_value("");
      }
      cx.notify();
    });
  }

  // 拿掉: kit rm (--dir for the folder's), as the Kit popup does; it counts from the agent's next conversation
  remove(rm, cx) {
    if (!rm?.args || this.busy) return;
    this.mine = takeBusy(`拿掉 ${rm.name}`, SHORT);
    if (!this.mine) return;
    this.ask = null;
    this.msg = null;
    cx.notify();
    const tg = this.target, clear = this.d?.commands?.clear || "/clear";
    cx.spawn(async (cx) => {
      try {
        const r = await kit(rm.args, 60000, tg.machine ?? null);
        const where = rm.where === "folder" ? ` ${shortDir(rm.dir)} ` : "整個帳號";
        this.msg = r.code === 0
          ? { ok: true, text: [`已從${where}拿掉 ${rm.name}。這個 agent 要清空重來（${clear}）或重開才不會再讀它。`, clean(r.err)].filter(Boolean).join("\n") }
          : { ok: false, text: `沒拿掉 ${rm.name}：${clean(r.err || r.out) || `失敗（${r.code}）`}` };
      } catch (e) {
        this.msg = { ok: false, text: `沒拿掉 ${rm.name}：${e?.message ?? e}` };
      } finally {
        giveBusy(this.mine);
        this.mine = null;
        // every Kit button on that machine looks again (kit list), and the repository when it is this computer
        markChanged(tg.machine ?? null);
        cx.notify();
      }
    });
  }

  // 開檔: a memory / instruction file in kit's editor window (this computer's files only)
  openFile(g, it, cx) {
    const path = it.path, open = (shared(EDITORS) ?? {})[path];
    if (open?.dirty && Date.now() - (open.at ?? 0) < 120000) {
      this.msg = { ok: false, text: "這個檔案已經開在大視窗裡，還沒存檔：先去那裡存檔或關掉。" };
      cx.notify();
      return;
    }
    const name = slash(path).split("/").pop() || path;
    openOverlay({ mod: "kit", kind: "window", key: `kit-editor:${path}`, width: 0.7, height: 0.85,
      props: { role: "editor", item: { path, name, kind: "file", plain: true, source: [g.name, it.note].filter(Boolean).join(" · "), rel: shortDir(path) } } });
  }

  copySummary(cx) {
    const tg = this.target, text = summaryText(this.d, tg.title, [tg.machine ?? "這台電腦", shortDir(tg.cwd)].filter(Boolean).join(" · "));
    if (!text) return;
    cx.write_to_clipboard(text);
    notify({ title: "已複製", body: "context 的細項", level: "success", timeout: 1500 });
  }

  renderContext(_cx) {
    const t = theme(), z = fs(), d = this.d, p = this.paneNow();
    const root = v_flex().id("ctx-root").size_full().h(CTX_H).rounded(8).bg(t.surface).text_size(z).text_color(t.foreground)
      .child(this.ctxHeader(t, z));
    if (this.msg) root.child(this.ctxMessage(t, z));
    const api = apiState(this.target.machine ?? null);
    if (api?.kind && !api.ok) return root.child(apiCard(t, z, api, this.target.machine ?? null, "ctx"));
    const body = v_flex().flex_1().min_h(0).overflow_y_scrollbar().px(12).py(10).gap(10);
    if (!p) body.child(div().text_color(t.dim).child("這個 agent 已經關掉了。"));
    if (this.err) body.child(v_flex().p(8).rounded(6).bg(t.raised).text_size(z - 1).text_color(t.blocked)
      .child(textBlock("ctx-err", d ? `沒更新到（下面是上一次的）：${this.err}` : this.err)));
    if (!d) {
      if (!this.err) body.child(waiting(t, z, this.target.tool === "claude" ? "正在問 Claude Code（最多 30 秒）…" : "讀取中…", t.dim));
      return root.child(body);
    }
    body.child(this.ctxTop(t, z, d));
    if (d.error) body.child(v_flex().p(8).rounded(6).bg(t.raised).text_size(z - 1.5).text_color(t.working)
      .child(textBlock("ctx-derr", d.categories?.length ? `${d.error}\n所以下面是估算的。` : d.error)));
    if (d.categories?.length) body.child(this.ctxBar(t, d)).child(this.ctxCats(t, z, d));
    const list = this.kitList(), can = (g, name) => Boolean(removal(list, g, name)?.args);
    const tips = ctxTips(d, can);
    if (tips.length) body.child(v_flex().gap(4).p(8).rounded(6).bg(t.raised)
      .child(div().font_semibold().child("怎麼省"))
      .children(tips.map((x, i) => h_flex().gap(6).items_start().text_size(z - 1.5)
        .child(div().flex_none().text_color(t.dim).child("•"))
        .child(div().flex_1().min_w(0).child(textBlock(`ctx-tip-${i}`, x))))));
    for (const g of d.groups ?? []) body.child(this.ctxGroup(t, z, g, list));
    if (d.note) body.child(div().text_size(z - 2.5).text_color(t.dim).child(textBlock("ctx-note", `${d.note}${d.exact ? "" : "\n≈ 是估算的數字。"}`)));
    return root.child(body).child(this.ctxFooter(t, z, d));
  }

  ctxHeader(t, z) {
    const tg = this.target, pic = icon(tg.program, 18, t.foreground);
    const where = [tg.machine ?? "這台電腦", shortDir(tg.cwd)].filter(Boolean).join(" · ");
    return h_flex().flex_none().px(10).py(8).gap(6).items_center().border_b(1).border_color(t.border)
      .child(div().size(32).flex_none().rounded(16).bg(t.raised).flex().items_center().justify_center().child(pic ?? div().text_color(t.dim).child("•")))
      .child(v_flex().flex_1().min_w(0)
        .child(copyOnRight(div().truncate().font_semibold().child(`${tg.title || "agent"} 的 context`), tg.title || "agent"))
        .child(copyOnRight(div().truncate().text_size(z - 1.5).text_color(t.dim).child(where), tg.cwd ?? where)))
      .child(btn(t, z, "ctx-copy", "複製", { tiny: true, off: !this.d, on: (cx) => this.copySummary(cx) }))
      .child(btn(t, z, "ctx-reload", this.loading ? spin(z - 2, t.dim) : "⟳", { tiny: true, off: this.loading, on: (cx) => this.loadDetail(true, cx) }))
      .child(btn(t, z, "ctx-close", "✕", { tiny: true, on: () => closeOverlay(props()?.overlay) }));
  }

  ctxMessage(t, z) {
    const m = this.msg;
    return h_flex().flex_none().mx(10).mt(8).p(8).gap(8).items_start().rounded(6).bg(t.raised).border_1().border_color(m.ok ? t.border : t.blocked)
      .child(div().flex_1().min_w(0).text_size(z - 1).text_color(m.ok ? t.foreground : t.blocked).child(textBlock("ctx-msg", m.text)))
      .child(div().id("ctx-msg-x").flex_none().px(4).cursor_pointer().text_color(t.dim).hover((s) => s.text_color(t.foreground))
        .on_mouse_down("left", stop).on_click((_e, cx) => { this.msg = null; cx.notify(); }).child("✕"));
  }

  // 已使用 61% · 243k / 400k, and whose count it is
  ctxTop(t, z, d) {
    const pct = d.pct == null ? null : Math.min(100, d.pct);
    const color = levelColor(t, pct);
    const how = howCounted(d);
    return v_flex().gap(2)
      .child(h_flex().gap(6).items_end()
        .child(div().text_color(t.dim).child("已使用"))
        .child(copyOnRight(div().text_size(z + 8).font_semibold().text_color(color).child(pct == null ? "—" : `${pct}%`), pct == null ? "" : `${pct}%`))
        .child(copyOnRight(div().pb(2).font_semibold().child(`· ${num(d.used)} / ${d.window != null ? num(d.window) : "?"}`), `${d.used ?? ""} / ${d.window ?? ""}`)))
      .child(div().text_size(z - 2).text_color(t.dim).child([d.model, how, d.at ? ago(d.at) : ""].filter(Boolean).join(" · ")));
  }

  // the stacked bar: what is used (by category), then what is free, Claude's auto-compact reserve at the end
  ctxBar(t, d) {
    const { used, buffer } = barSegments(d), seg = (pct, color) => div().h(10).flex_none().w(`${pct}%`).bg(color);
    return h_flex().h(10).w_full().rounded(5).overflow_hidden().bg(t.raised)
      .children(used.map((s) => seg(s.pct, catColor(t, s.id))))
      .child(div().flex_1())
      .when(buffer != null, (el) => el.child(seg(buffer, t.border)));
  }

  ctxCats(t, z, d) {
    const w = Number(d.window) || 0, list = v_flex().gap(3);
    for (const c of d.categories ?? []) {
      const deferred = c.kind === "deferred", free = c.kind === "free", buffer = c.kind === "buffer";
      const dot = div().size(9).flex_none().rounded(5);
      if (deferred) dot.border_1().border_color(t.dim);
      else if (free) dot.bg(t.raised).border_1().border_color(t.border);
      else dot.bg(buffer ? t.border : catColor(t, c.id));
      list.child(h_flex().gap(8).items_center().text_size(z - 1)
        .child(dot)
        .child(div().flex_1().min_w(0).truncate().text_color(deferred || free ? t.dim : t.foreground).child(deferred ? `${c.name} · 用到才載入（${kfmt(c.tokens)}）` : c.name))
        .child(copyOnRight(div().flex_none().w(70).text_right().text_color(deferred ? t.dim : t.foreground).child(deferred ? "—" : `${c.est ? "≈" : ""}${kfmt(c.tokens)}`), String(c.tokens)))
        .child(div().flex_none().w(48).text_right().text_color(t.dim).child(catShare(c, w))));
    }
    return list;
  }

  // one list (memory files, skills, MCP by server, what was said by kind and by tool, …): click to open; most first
  ctxGroup(t, z, g, list) {
    const items = g.items ?? [], open = Boolean(this.open[g.id]);
    const head = h_flex().id(`g-${g.id}`).gap(6).items_center().cursor_pointer().on_mouse_down("left", stop)
      .on_click((_e, cx) => { this.open[g.id] = !open; cx.notify(); })
      .child(div().w(12).text_color(t.dim).child(open ? "▾" : "▸"))
      .child(div().flex_1().min_w(0).truncate().font_semibold().child(`${g.name}（${items.length}）`))
      .child(div().flex_none().text_color(t.dim).child(g.tokens == null ? "" : `${g.est ? "≈" : ""}${kfmt(g.tokens)}`));
    if (!open) return head;
    const shown = this.more[g.id] ? items : items.slice(0, 40);
    const rows = v_flex().gap(1).pl(12).children(shown.map((it) => this.ctxItem(t, z, g, it, `${g.id}|${it.name}`, 0, list)));
    if (shown.length < items.length) rows.child(div().id(`more-${g.id}`).px(4).py(2).cursor_pointer().text_size(z - 1.5).text_color(t.accent)
      .on_mouse_down("left", stop).on_click((_e, cx) => { this.more[g.id] = true; cx.notify(); }).child(`還有 ${items.length - shown.length} 個…`));
    return v_flex().gap(4).child(head).child(rows);
  }

  ctxItem(t, z, g, it, key, depth, list) {
    const kids = it.items ?? [], open = Boolean(this.open[key]);
    const rm = depth === 0 ? removal(list, g.id, it.name, it.path) : null;
    const canOpen = depth === 0 && Boolean(it.path) && (g.id === "memory" || g.id === "instructions") && !this.target.machine;
    const asking = this.ask === `rm:${key}`, est = g.est ? "≈" : "";
    const row = h_flex().id(`it-${key}`).gap(6).items_center().px(4).py(2).rounded(4).hover((s) => s.bg(t.hover)).text_size(z - 1);
    if (kids.length) row.cursor_pointer().on_mouse_down("left", stop).on_click((_e, cx) => { this.open[key] = !open; cx.notify(); });
    row.child(div().w(10).flex_none().text_color(t.dim).child(kids.length ? (open ? "▾" : "▸") : ""))
      .child(v_flex().flex_1().min_w(0)
        .child(copyOnRight(div().truncate().child(it.name), it.path || it.name))
        .when(Boolean(it.note), (el) => el.child(copyOnRight(div().truncate().text_size(z - 2.5).text_color(t.dim).child(it.note), it.note))))
      .child(copyOnRight(div().flex_none().text_color(t.dim).child(it.tokens == null ? "" : `${est}${kfmt(it.tokens)}`), it.tokens == null ? "" : String(it.tokens)));
    if (canOpen) row.child(btn(t, z, `open-${key}`, "開檔", { tiny: true, on: (cx) => this.openFile(g, it, cx) }));
    if (rm?.required) row.child(div().flex_none().text_size(z - 2.5).text_color(t.dim).child("團隊必備"));
    else if (rm?.args && !asking) row.child(btn(t, z, `rm-${key}`, "拿掉", { tiny: true, off: Boolean(this.busy), on: (cx) => { this.ask = `rm:${key}`; cx.notify(); } }));
    const out = v_flex().gap(1).child(row);
    if (asking) out.child(v_flex().ml(16).p(6).gap(6).rounded(6).bg(t.raised).text_size(z - 1.5)
      .child(textBlock(`rm-ask-${key}`, rm.where === "folder" ? `從 ${shortDir(rm.dir)} 拿掉 ${rm.name}？（kit rm --dir）` : `從整個帳號拿掉 ${rm.name}？（kit rm：每個資料夾的 agent 都不會再有）`))
      .child(h_flex().gap(6)
        .child(btn(t, z, `rm-yes-${key}`, "確定拿掉", { tiny: true, kind: "danger", off: Boolean(this.busy), on: (cx) => this.remove(rm, cx) }))
        .child(btn(t, z, `rm-no-${key}`, "取消", { tiny: true, on: (cx) => { this.ask = null; cx.notify(); } }))));
    if (open && kids.length) out.child(v_flex().pl(14).gap(1).children(kids.map((k) => this.ctxItem(t, z, g, k, `${key}|${k.name}`, depth + 1, list))));
    return out;
  }

  // how far to the auto-compaction, and 壓縮 / 清空重來 (each asks first; only while the agent waits for you)
  ctxFooter(t, z, d) {
    const st = this.statusNow(), ready = (st === "idle" || st === "done") && !this.sending, c = d.commands ?? {};
    const { left, line } = compactLine(d);
    const foot = v_flex().flex_none().px(12).py(8).gap(6).border_t(1).border_color(t.border);
    if (line) foot.child(copyOnRight(div().text_size(z - 1).text_color(t.dim).child(line), String(left)));
    const why = this.sending ? "送出中…" : st === "working" ? "它在工作中：停下來才能按" : st === "blocked" ? "它在等你回答：先處理它" : !st ? "看不到它的狀態" : "";
    const cancel = btn(t, z, "ask-no", "取消", { tiny: true, on: (cx) => { this.ask = null; cx.notify(); } });
    if (this.ask === "compact") {
      foot.child(div().font_semibold().child("確定壓縮？"));
      if (c.with_text) foot.child(Input.new(this.keep).h(28).px(8).rounded(6).border_1().border_color(t.accent).bg(t.background).text_size(z - 1).text_color(t.foreground));
      else foot.child(div().text_size(z - 2).text_color(t.dim).child(`${c.compact} 在這裡不能帶文字，會照它自己的方式壓縮。`));
      return foot.child(h_flex().gap(6).items_center()
        .child(btn(t, z, "compact-yes", "確定壓縮", { tiny: true, kind: "primary", off: !ready, on: (cx) => this.send("compact", cx) }))
        .child(cancel).child(div().flex_1().text_size(z - 2).text_color(t.dim).child(why)));
    }
    if (this.ask === "clear" || this.ask === "clear2") {
      const second = this.ask === "clear2";
      foot.child(div().text_size(z - 1).text_color(t.ansi1).child(textBlock(`clear-ask-${second}`, second
        ? `再確認一次：會送出 ${c.clear}，這段對話就回不來了。`
        : "會清掉這段對話的內容，確定？")));
      return foot.child(h_flex().gap(6).items_center()
        .child(btn(t, z, "clear-yes", second ? "清空重來" : "確定", { tiny: true, kind: "danger", off: !ready,
          on: (cx) => { if (second) this.send("clear", cx); else { this.ask = "clear2"; cx.notify(); } } }))
        .child(cancel).child(div().flex_1().text_size(z - 2).text_color(t.dim).child(why)));
    }
    return foot.child(h_flex().gap(6).items_center()
      .child(btn(t, z, "compact", this.sending ? "送出中…" : "壓縮", { tiny: true, off: !ready || !c.compact,
        on: (cx) => { this.ask = "compact"; if (c.with_text) this.keep?.focus(); cx.notify(); } }))
      .child(btn(t, z, "clear", "清空重來", { tiny: true, kind: "danger", off: !ready || !c.clear, on: (cx) => { this.ask = "clear"; cx.notify(); } }))
      .child(div().flex_1().min_w(0).truncate().text_size(z - 2).text_color(t.dim)
        .child(why || (c.compact ? `會打 ${c.compact} 或 ${c.clear} 到這個 agent` : ""))));
  }
}
