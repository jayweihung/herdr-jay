// Role "agent" of the kit mod (see main.js): a popup for one agent, opened by the Kit button in its pane header (role
// "header", header.js): what it uses (the set kit run started it with, kit's for the account, its folder's own), what
// kit has that it doesn't use yet, and the buttons that change that (kit add / rm, --dir for its folder; kit
// install-tool / install-deps for what a skill or an MCP needs; an MCP's unset ${VAR}s; what kit sync blocked and 收進
// kit: kit collect / kit new --from, then kit add). All on the agent's machine.
// The header is the one that asks kit (kit list --json --dir --pid); this popup shows that answer (AGENT_DATA) and asks
// the header for a fresh one (AGENT_WANT).
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, shared, setShared, closeOverlay, props, agents } from "herdr";
import { AGENT_CACHE, AGENT_DATA, AGENT_WANT, MSG, fs, mono, stop, shortDir, spin, waiting, icon, textBlock, copyOnRight, btn,
  busyNow, dropStaleBusy, giveBusy, apiState, checkApi, apiCard, messageBox, problemCard, versionCard, localGet, localSet,
  kitAction, markChanged, squeeze, groupRows, kit, apiAtLeast, partsLine, RELAUNCH_AUTO, RELAUNCH_ASK, reloadOne } from "./common.js";
import { POPUP_H, agentPid, loadAgent } from "./header.js";
import { toolOf, usedArgs, usedOf, usedLine, KIND_NAME, RELOAD_TEXT } from "./context.js";
import { offerRelaunch, agentName } from "./relaunch.js";
import { versionText, oldReason, oldSummary } from "./versions.js";

const LONG = 600000, SHORT = 120000; // how long kit sync and install, and the other actions, may take
const LOAD_TTL = 90000;
// what this agent reads of kit's: the account's (used, required) and its folder's (kit add --dir)
const usingOf = (d) => {
  const dir = new Set(d?.here?.folder?.items ?? []);
  return (d?.items ?? []).filter((i) => i.kind !== "agent" && (i.status === "used" || i.status === "required" || dir.has(`${i.kind}:${i.name}`)));
};

export class AgentPopup {
  constructor(role) { this.role = role; }

  init(_p, cx) {
    this.mine = null;    // the id of the action this copy started in kit.busy
    this.asking = null;  // the 安裝 waiting for 確定安裝
    try { this.folded = JSON.parse(localGet("kit.folded") || "{}"); } catch { this.folded = {}; }
    this.shown = new Set();   // rows whose whole description is shown (descCol)
    dropStaleBusy();
    this.target = props()?.target ?? { key: "" };
    this.where = `agent:${this.target.key}`;
    const c = (shared(AGENT_CACHE) ?? {})[this.target.key];
    if (!c || Date.now() - (c.started ?? 0) > 10000) this.want();
    this.openedAt = Date.now();
    // 找: one box over the whole list (name, what it is, where it came from)
    this.filter = "";
    this.input = InputState.new({ placeholder: "找：名字、說明、從哪收的" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value().trim().toLowerCase(); cx.notify(); });
    checkApi(this.target.machine ?? null, cx);
    this.used = undefined;   // what this conversation used (kit used): undefined not asked yet, null asking or no answer
    cx.timer.every(2000, (cx) => { if (!this.data) cx.notify(); if (this.used === undefined) this.loadUsed(cx); });   // (also: kit api known later)
    this.loadUsed(cx);
    // 收進 kit (a blocked row): which row's form is open ({ key, source: picked or null }) and its original URL
    this.taking = null;
    this.takeUrl = InputState.new({ placeholder: "原本的網址（不知道就留白）" });
    this.takeUrl.on("change", (_e, cx) => cx.notify());
  }

  // kit used (kit api 1.10) on the agent's machine: when the popup opens and on ⟳
  loadUsed(cx) {
    const tg = this.target ?? {}, machine = tg.machine ?? null;
    if (this.usedBusy || !tg.term || !apiAtLeast(machine, 10)) return;
    this.usedBusy = true; this.used = null;
    cx.spawn(async (cx) => {
      let u = null;
      try {
        const pid = await agentPid(tg.term);
        if (pid) {
          const r = await kit(usedArgs(pid, toolOf(tg.app, tg.program?.key), tg.cwd), 60000, machine);
          if (r.code === 0) { const d = JSON.parse(r.out); if (d && typeof d === "object" && !d.note) u = d; }
        }
      } catch {}
      this.used = u; this.usedBusy = false; cx.notify();
    });
  }

  async close(_cx) { giveBusy(this.mine); this.mine = null; }

  // read once per render (this.rs): a shared() read is a host call that copies the whole value (every agent's list),
  // and reading it per row took ~15 ms a row in Herdr, past its 50 ms render budget ("could not be re-rendered")
  get data() { return this.rs ? this.rs.data : (shared(AGENT_DATA) ?? {})[this.target?.key] ?? null; }
  get busy() { return this.rs ? this.rs.busy : busyNow(); }
  get loading() {
    if (this.rs) return this.rs.loading;
    const c = (shared(AGENT_CACHE) ?? {})[this.target?.key]; return Boolean(c?.busy && Date.now() - (c.started ?? 0) < LOAD_TTL);
  }
  get msg() { return shared(MSG(this.where)) ?? null; }
  // ask its pane header to look again
  want() {
    if (!this.target?.key) return;
    setShared(AGENT_WANT, { ...(shared(AGENT_WANT) ?? {}), [this.target.key]: Date.now() });
  }
  // add / rm / sync / install on the agent's machine: one at a time, kit's words above the list; then every Kit button
  // on that machine looks again
  act(label, args, cx, ttl = SHORT, okText = null) {
    kitAction(this, cx, { label, args, ttl, okText, machine: this.target?.machine ?? null, msg: MSG(this.where) });
  }
  // 同步: kit sync for the machine (reloadAfter: the open agents, for what it changed), then THIS agent up to date: its
  // list read again, and for each old row (versions.js oldReason) what 同步 can do: a reload gets /reload-plugins,
  // one read only when a conversation starts (rules, MCP …) the relaunch ask (relaunch.js offerRelaunch); each once,
  // also when reloadAfter already did it for this agent (did). Said in the line over kit's words.
  sync(cx) {
    const machine = this.target?.machine ?? null, msg = MSG(this.where), did = {};
    kitAction(this, cx, { label: "同步", args: ["sync"], ttl: LONG, machine, msg, did, after: (cx) => {
      markChanged(machine);
      if (shared(msg)?.ok !== true) return;
      this.syncing = true;
      cx.spawn(async (cx) => {
        let line;
        try { line = await this.catchUp(did); } catch (e) { line = `同步好了；這個 agent 沒有跟上：${e?.message ?? e}`; }
        const m = shared(msg);
        if (m) setShared(msg, { ...m, text: [line, m.text].filter(Boolean).join("\n") });
        this.syncing = false;
        cx.notify();
      });
    } });
  }
  async catchUp(did) {
    const tg = this.target ?? {}, tool = toolOf(tg.app, tg.program?.key);
    const a = (agents() ?? []).find((x) => x.address === tg.term);
    if (!a || !tool) return "同步好了；讀不到這個 agent（它可能已經關掉）";
    const d = await loadAgent(tg.machine ?? null, tg.cwd, tg.term, tool);
    if (d?.error) return `同步好了；讀不到這個 agent 的清單：${d.error}`;
    const old = usingOf(d).map((i) => [i, oldReason(i, tool, d.claude_mcp)]).filter(([, r]) => r);
    if (!old.length) return "同步好了，這個 agent 全部最新";
    const of = (k) => old.filter(([, r]) => r.kind === k).map(([i]) => i), prev = did[a.address] ?? {}, parts = [];
    // a relaunch reads everything again: no /reload-plugins before it
    if (of("reload").length && !of("relaunch").length) {
      const status = a.status === "done" && (shared("agents.busy") ?? {})[a.address] ? "working" : a.status;
      const done = prev.done ?? await reloadOne(a.address, status);
      parts.push({ sent: `送了 ${RELOAD_TEXT}`, queued: `排隊送 ${RELOAD_TEXT}（它停下來就送）` }[done] ?? `沒送出 ${RELOAD_TEXT}`);
    }
    const rl = of("relaunch");
    if (rl.length) {
      const what = [...new Set(rl.map((i) => KIND_NAME[i.kind] ?? i.kind))].join("、");
      const how = prev.relaunch ?? (await offerRelaunch([{ address: a.address, tool, name: agentName(a), what }]))[a.address];
      parts.push(how === "asked" ? "要重開接回（在跳出的視窗選）" : how === "queued" ? "停下來時自動重開接回" : `要自己重開（${how}）`);
    }
    if (of("new").length) parts.push(`${of("new").length} 項要開新對話才會讀到`);
    if (of("sync").length) parts.push(`${of("sync").length} 項同步後還是舊的（同步沒帶來：可能被擋著或還沒核准）`);
    return `同步好了；${a.address}：${parts.join("，")}`;
  }
  // a row's add / rm: its button says 加入中… while kit runs, then ✓ 已… until the list (asked again) shows it, so it
  // never looks like it can be pressed again. want: "used" | "unused" (the account), "dir" | "nodir" (this folder)
  rowAct(i, want, label, args, cx, okText) {
    const k = `${i.kind}:${i.name}`, machine = this.target?.machine ?? null;
    const started = kitAction(this, cx, { label, args, ttl: SHORT, okText, machine, msg: MSG(this.where), after: () => {
      const ok = shared(MSG(this.where))?.ok === true;
      this.pend = { ...(this.pend ?? {}), [k]: ok ? { done: want, at: Date.now() } : null };
      markChanged(machine);
    } });
    if (started) this.pend = { ...(this.pend ?? {}), [k]: { doing: want } };
  }
  // a row's add / rm in progress or done but not yet in the list: { doing } / { done }; null once the list shows it
  // (or a minute later)
  pendOf(i, inDir) {
    const k = `${i.kind}:${i.name}`, p = this.pend?.[k];
    if (!p) return null;
    if (p.done) {
      const now = { used: i.status === "used", unused: i.status !== "used", dir: inDir, nodir: !inDir }[p.done];
      // ✓ stays until a list read AFTER the action says otherwise: kit list can take longer than a minute, and the row
      // went back to 加到… though kit had added it (jay: "按下去不理我")
      if (now || ((this.data?.at ?? 0) > p.at && Date.now() - p.at > 60000)) { this.pend[k] = null; return null; }
    }
    return p;
  }

  render(cx) {
    this.rs = null; this.rs = { data: this.data, busy: this.busy, loading: this.loading };
    try { return this.draw(cx); } finally { this.rs = null; }
  }
  draw(_cx) {
    // the 要重開才讀得到 window opened after this popup (its own add / rm did it, once that is over): Herdr keeps windows
    // under popups, and a popup's first click outside only closes it, so this popup steps aside (kit's words stay in MSG)
    if (!this.mine && !this.syncing && (shared(RELAUNCH_ASK)?.at ?? 0) > this.openedAt) closeOverlay(props()?.overlay);
    const t = theme(), z = fs(), msg = this.msg;
    // a popup is as tall as its content, and the list (flex_1) has none of its own: give the popup a height
    const root = v_flex().id("kit-agent-root").size_full().h(POPUP_H).rounded(8).bg(t.surface).text_size(z).text_color(t.foreground)
      .child(this.paneHeader(t, z));
    // kit there can't be used (none, too old, newer than this mod, no answer): what to do, in place of everything else
    const machine = this.target?.machine ?? null, api = apiState(machine);
    if (api?.kind && !api.ok) return root.child(apiCard(t, z, api, machine, this.where));
    if (msg) root.child(messageBox(t, z, this.where, msg, () => setShared(MSG(this.where), null), squeeze));
    const d = this.data;
    if (!d && !this.loading && Date.now() - (this.openedAt ?? 0) > 8000)
      return root.child(div().p(14).text_color(t.muted).child("讀不到這個 agent（它可能換了資料夾，或已經關掉）。關掉這個視窗，再按一次它上面的 Kit 按鈕。"));
    if (!d) return root.child(div().p(14).child(waiting(t, z, "讀取中…")));
    if (d.error) return root.child(problemCard(t, z, this.where, d.error, d.code));
    // root's list as root's cron last wrote it (ROOT_VIEW): look only, no button anywhere
    if (d.here?.user && d.view?.list) {
      this.ro = true;
      const mins = Math.max(1, Math.round(d.view.age / 60));
      return root.child(div().flex_none().px(14).py(8).border_b(1).border_color(t.border).text_size(z - 1).text_color(t.muted)
        .child(`${d.here.user} 的清單（${mins} 分鐘前更新，每 10 分鐘更新），只能看；要換請在 Mac 簽 kit approve，再請它 kit sync`))
        .child(this.agentList(t, z, d.view.list));
    }
    this.ro = false;
    if (d.here?.user) return root.child(v_flex().p(14).gap(6)
      .child(div().font_semibold().child(`這個 agent 用 ${d.here.user} 帳號跑，kit 照常能用`))
      .child(div().text_size(z - 1).text_color(t.muted).child(d.here.user === "root"
        ? "這個視窗用你的帳號跑，看不到也不能改 root 的 kit。root 只用簽過的版本（kit approve）；要換版本：簽一個新的 kit approve，再請它 kit sync。"
        : `這個視窗用你的帳號跑，看不到也不能改 ${d.here.user} 的 kit。`))
      .when(d.here.user === "root", (el) => el.child(div().text_size(z - 1).text_color(d.view === undefined ? t.muted : t.blocked)
        // not asked yet (an answer kept from before, or still reading): no red words until the read says so
        .child(d.view === undefined ? "讀取 root 的清單中…" : d.view.age ? `清單沒有更新（上次 ${Math.round(d.view.age / 60)} 分鐘前）`
          : `清單沒有更新（這台讀不到 root 的清單檔：${d.view.none}）`))));
    if (d.kit_version_wanted) root.child(versionCard(t, z, this.where, d));
    return root.child(this.agentList(t, z, d));
  }

  paneHeader(t, z) {
    const d = this.data, busy = this.busy, tg = this.target ?? {};
    const pic = icon(tg.program, 18, t.foreground), canSync = d && !d.error && !d.here?.user;
    return h_flex().flex_none().px(10).py(8).gap(6).items_center().border_b(1).border_color(t.border)
      .child(div().size(32).flex_none().rounded(16).bg(t.raised).flex().items_center().justify_center().child(pic ?? div().text_color(t.muted).child("•")))
      .child(v_flex().flex_1().min_w(0)
        // only the name: where it runs is in its own pane already (jay); ⟳ turns while reading
        .child(copyOnRight(div().truncate().font_semibold().child(tg.title || "agent"), tg.title || "agent")))
      .when(Boolean(canSync), (el) => el.child(btn(t, z, "sync", busy === "同步" || this.syncing ? "同步中…" : "同步", { small: true, off: Boolean(busy || this.syncing), on: (cx) => this.sync(cx) })))
      // pressable while it reads too: a newer read takes over one that hangs
      .child(btn(t, z, "reload", this.loading ? spin(z - 2, t.dim) : "⟳", { small: true, on: (cx) => { this.want(); this.loadUsed(cx); } }))
      .child(btn(t, z, "close", "✕", { small: true, on: () => closeOverlay(props()?.overlay) }));
  }

  agentList(t, z, d) {
    const items = d.items ?? [], here = d.here?.items ?? [], ag = d.here?.agent;
    const machine = this.target?.machine ?? "這台電腦";
    // the folder's own (kit add --dir): the folder the agent runs in, or the one above it that already has some
    const f = d.here?.folder, inDir = new Set(f?.items ?? []);
    this.folder = f ? { dir: f.dir, why: f.why, has: inDir } : null;
    const mine = (i) => inDir.has(`${i.kind}:${i.name}`);
    const f0 = this.filter, hit = (i) => !f0 || [i.name, i.description, i.description_zh, i.source, i.from, i.path].some((x) => String(x ?? "").toLowerCase().includes(f0));
    const body = v_flex().id("kit-agent-body").flex_1().min_h(0).overflow_y_scrollbar().px(10).py(8).gap(8);
    body.child(Input.new(this.input).flex_none().h(28).px(8).rounded(6).border_1().border_color(t.border).bg(t.background).text_size(z - 1).text_color(t.foreground));
    // versions (kit api 1.14): what each row is, and over the lists whether all it reads is the newest. root's list
    // (look only) shows its own kit's versions when they are there, never 舊版 (root waits for kit approve)
    const at = this.target?.machine ?? null;
    this.vers = this.ro || apiAtLeast(at, 14);
    this.tool = toolOf(this.target?.app, this.target?.program?.key);
    const using = usingOf(d);
    if (this.ro) { /* no 舊版 */ } else if (!this.vers) {
      if (apiState(at)?.ok) body.child(div().text_size(z - 1.5).text_color(t.muted).child(`${at ? "那台" : "這台"}的 kit 太舊，更新後才看得到版本`));
    } else if (using.some((i) => i.version)) {
      const line = oldSummary(using.map((i) => oldReason(i, this.tool, d?.claude_mcp)));
      body.child(div().text_size(z - 1.5).text_color(line === "全部最新" ? t.muted : t.foreground).child(line));
    }
    // 以後都直接做 (relaunch.js): said here, with the way back to being asked
    if (shared(RELAUNCH_AUTO) === true) body.child(h_flex().gap(6).items_center().text_size(z - 1.5)
      .child(div().flex_1().min_w(0).text_color(t.muted).child("kit 的改動要重開才讀得到時：直接自動重開接回，不問"))
      .child(btn(t, z, "rl-ask", "改回先問", { tiny: true, on: (cx) => { setShared(RELAUNCH_AUTO, null); cx.notify(); } })));
    const kindName = { rule: "規則", skill: "技能", mcp: "MCP", plugin: "外掛" };
    // 1. what kit run started it with: only this agent has it, for this run
    if (ag) {
      body.child(div().font_semibold().child(`這次啟動帶的（agent ${ag.name}）`));
      body.child(div().text_size(z - 1.5).text_color(t.muted).child(`用 kit run 開的：只有這個 agent 有，關掉就沒了。要改它，到 Agents 改 ${ag.name}。`));
      for (const [kind, key] of [["rule", "rules"], ["skill", "skills"], ["mcp", "mcp"]]) {
        const names = ag[key] ?? [];
        if (names.length) body.child(h_flex().gap(6).flex_wrap().pl(8).text_size(z - 1)
          .child(div().text_color(t.dim).child(`${kindName[kind]}：`))
          .children(names.map((n) => copyOnRight(div().px(6).rounded(4).bg(t.raised).child(n), n))));
      }
      body.child(div().mt(4).border_t(1).border_color(t.border));
    }
    // 2. what it reads besides: kit's for the whole account (can be taken off) and its folder's / account's own (look only)
    body.child(div().font_semibold().child(ag ? "另外也讀到的" : "這個 agent 在用的"));
    // what this conversation used so far (kit used): rules are always read, so only skills and MCP
    if (!this.ro && apiAtLeast(this.target?.machine ?? null, 10)) body.child(div().text_size(z - 1.5).text_color(t.muted)
      .child(this.usedBusy ? "這次對話用了：讀取中…" : this.used ? `${usedLine(this.used)}。規則每次對話都會帶。` : "這次對話用了什麼：讀不到（這個 agent 的對話紀錄找不到）"));
    for (const kind of ["rule", "skill", "mcp", "plugin"]) {
      const kitRows = items.filter((i) => i.kind === kind && (i.status === "used" || i.status === "required" || mine(i)) && hit(i));
      const ownRows = here.filter((i) => i.kind === kind && hit(i));
      const n = kitRows.length + ownRows.length;
      if (f0 && !n) continue;   // searching: only the parts with something found
      const folded = !f0 && (this.folded[`use-${kind}`] ?? n > 8);
      body.child(this.secHead(t, z, `use-${kind}`, `${kindName[kind]}（${n}）`, folded, ""));
      if (folded) continue;
      if (!n) { body.child(div().pl(18).text_size(z - 1.5).text_color(t.dim).child("沒有")); continue; }
      body.child(v_flex().gap(2).children([...kitRows.map((i) => this.row(t, z, i)), ...ownRows.map((i) => this.hereRow(t, z, i))]));
    }
    // what kit sync blocked (kit 0.7.0 list --json "blocked"; an older kit has no such key: nothing here)
    const blocked = (d.blocked ?? []).filter(hit);
    if (blocked.length) {
      const folded = !f0 && (this.folded.blocked ?? false);
      body.child(div().mt(6).border_t(1).border_color(t.border));
      body.child(this.secHead(t, z, "blocked", `被擋下的（${blocked.length}）`, folded, ""));
      if (!folded) body.child(div().pl(18).text_size(z - 1.5).text_color(t.muted).child("不是公司的，也不是 kit 放的，所以工具不載入它們；收進 kit、再加到要用的地方才會用"))
        .child(v_flex().gap(2).children(blocked.map((b) => this.blockedRow(t, z, b, d.sources ?? []))));
    }
    if (d.here?.error) body.child(div().text_size(z - 1.5).text_color(t.muted).child(textBlock(`here-error-${this.where}`, `${shortDir(d.here.dir)}：${d.here.error}`)));
    // 3. what kit has that the account does not use yet
    //    kit's own first, then what kit collect took, one group per URL it came from (closed until clicked; open while
    //    searching); a URL with one thing is a plain row
    if (this.ro) return body;
    const more = items.filter((i) => i.kind !== "agent" && i.status === "unused" && !mine(i) && hit(i));
    const news = more.filter((i) => i.new).length;
    if (more.length) {
      const folded = !f0 && (this.folded.paneMore ?? more.length > 8);   // closed when long, like the lists above: each row costs render time
      body.child(div().mt(6).border_t(1).border_color(t.border));
      body.child(this.secHead(t, z, "paneMore", `還沒用的（${more.length}）`, folded, news ? `${news} 個新的` : ""));
      if (!folded) {
        // 20 at a time: ~100 rows built in one render passed Herdr's 50 ms and the popup froze ("could not be re-rendered")
        const groups = groupRows(more), own = groups[0].rows, shown = this.moreShown ?? 20;
        const list = v_flex().gap(2).children(own.slice(0, shown).map((i) => this.row(t, z, i)));
        if (own.length > shown) list.child(btn(t, z, "more-rows", `再顯示 ${Math.min(20, own.length - shown)} 個（還有 ${own.length - shown} 個）`, { small: true, on: (cx) => { this.moreShown = shown + 20; cx.notify(); } }));
        for (const g of groups.slice(1)) {
          if (g.rows.length === 1) { list.child(this.row(t, z, g.rows[0], true)); continue; }
          const shut = !f0 && (this.folded[`from-${g.from}`] ?? true);
          list.child(this.secHead(t, z, `from-${g.from}`, `收自 ${g.from}（${g.rows.length}）`, shut, g.rows.some((i) => i.new) ? "有新的" : ""));
          if (!shut) list.child(v_flex().pl(14).gap(2).children(g.rows.map((i) => this.row(t, z, i))));
        }
        body.child(list);
      }
    } else if (f0) body.child(div().text_size(z - 1.5).text_color(t.dim).child("還沒用的裡面找不到符合的。"));
    const where = f ? shortDir(f.dir) : "這個資料夾";
    body.child(v_flex().mt(6).p(8).gap(4).rounded(6).bg(t.raised).text_size(z - 1.5).text_color(t.muted)
      .children(f && !f.why
        ? [`這裡只改 ${where}：加的東西只有在 ${where}（含子資料夾）開的 agent 讀得到，整個帳號和別的資料夾都不受影響。會寫進 ${where} 的 .agentkit、CLAUDE.md、AGENTS.md、.claude/、.agents/ 等檔案。omp 只在這個資料夾本身開時讀得到資料夾的 MCP（子資料夾裡開的讀不到）。`,
           "標「整個帳號」「團隊必備」的是整個帳號的，這裡不能改：要改，請在家目錄（~）開的 agent 改。"]
        : [`這裡改的是整個帳號：${machine} 上你這個帳號的 Claude Code、Codex、omp（有裝的）和每個 agent、每個資料夾都會有或都沒有。`,
           "只想給某個資料夾：請在那個資料夾開的 agent 改。"])
      .child("正在跑的要開新的對話才會讀到。"));
    if (!items.length && !here.length && !ag) body.child(div().text_color(t.muted).child("來源裡還沒有東西。"));
    return body;
  }

  secHead(t, z, id, title, folded, note) {
    return h_flex().id(`sec-${id}`).gap(6).items_center().rounded(4).cursor_pointer().hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
      .on_click((_e, cx) => { this.folded[id] = !folded; localSet("kit.folded", JSON.stringify(this.folded)); cx.notify(); })
      .child(div().w(12).text_color(t.muted).child(folded ? "▸" : "▾"))
      .child(div().text_size(z - 0.5).child(title))
      .when(Boolean(note), (el) => el.child(div().px(5).rounded(4).text_size(z - 3).bg(t.done).text_color(t.background).child(note)));
  }

  // something the agent reads that kit doesn't manage: its folder's (CLAUDE.md, .claude/…, .mcp.json) or the account's own
  hereRow(t, z, i) {
    const badge = (text) => div().flex_none().px(5).rounded(4).text_size(z - 2.5).text_color(t.background).bg(t.muted).child(text);
    const head = h_flex().gap(5).items_center().min_w(0)
      .child(copyOnRight(div().min_w(0).truncate().font_semibold().child(shortDir(i.name)), i.name))
      .child(badge(i.scope === "user" ? "這個帳號（不是 kit 的）" : "這個資料夾"));
    if (i.tools && i.tools !== "claude") head.child(badge(i.tools === "codex omp" ? "Codex／omp" : i.tools));
    this.usedBadge(t, z, head, i);
    const sub = i.description || shortDir(i.path);
    return this.descCol(t, z, `here-${i.scope}-${i.kind}-${i.path}-${i.name}`, head, sub, i.description || i.path)
      .px(8).py(4).rounded(6).hover((s) => s.bg(t.hover));
  }

  // something kit sync keeps the tool from loading: not the company's and not placed by kit. 收進 kit: with its original
  // URL kit collect, without kit new skill --from its folder, into one of your own sources (push: direct); then kit add
  blockedRow(t, z, b, sources) {
    const busy = Boolean(this.busy), key = `${b.tool}-${b.kind}-${b.name}-${b.path}`, pk = `blocked:${b.kind}:${b.name}`;
    const badge = (text, color) => div().flex_none().px(5).rounded(4).text_size(z - 2.5).text_color(t.background).bg(color).child(text);
    const tool = { claude: "Claude Code", codex: "Codex", omp: "omp" }[b.tool] ?? b.tool;
    const name = b.name || String(b.path ?? "").split(/[\\/]/).filter(Boolean).pop() || "（沒有名字）";
    const head = h_flex().gap(5).items_center().min_w(0)
      .child(copyOnRight(div().min_w(0).truncate().font_semibold().text_color(t.muted).child(name), name))
      .child(badge(tool, t.dim));
    let p = this.pend?.[pk];
    if (p?.done && Date.now() - p.at > 60000) { this.pend[pk] = null; p = null; }
    const action = h_flex().flex_none().gap(4).items_center();
    if (this.ro) { /* look only */ } else if (p) action.child(p.doing
      ? h_flex().gap(4).items_center().px(8).h(24).rounded(6).bg(t.raised).text_size(z - 1.5).text_color(t.muted).child(spin(z - 3, t.muted)).child("收進中…")
      : div().text_size(z - 1.5).text_color(t.done).child("✓ 已收進 kit"));
    else if (b.kind === "mcp") action.child(div().text_size(z - 1.5).text_color(t.dim).child("到倉庫貼上設定"));
    else if (this.taking?.key !== key) action.child(btn(t, z, `take-${key}`, "收進 kit", { small: true, kind: "primary", off: busy,
      on: (cx) => { this.taking = { key, source: null }; this.takeUrl.set_value(""); cx.notify(); } }));
    const why = [b.scope === "folder" ? shortDir(b.dir ?? b.path) : "這個帳號", shortDir(b.path)].join(" · ");
    const row = v_flex().id(`blocked-${key}`).gap(4).px(8).py(5).rounded(6).hover((s) => s.bg(t.hover))
      .child(h_flex().gap(8).items_center()
        .child(v_flex().flex_1().min_w(0).child(this.descCol(t, z, `blocked-${key}`, head, why, b.path)))
        .child(action));
    if (p || b.kind === "mcp" || this.taking?.key !== key) return row;
    // the form: the URL (optional) and which own source; others' (a URL) go to agentkit-library, your own (none) to
    // another own source (your personal one)
    const url = this.takeUrl.value().trim(), own = sources.filter((s) => s.push === "direct");
    const lib = (s) => s.name === "agentkit-library";
    const source = this.taking.source ?? (own.find((s) => (url ? lib(s) : !lib(s))) ?? own[0])?.name ?? null;
    const note = (text, color) => div().text_size(z - 1.5).text_color(color ?? t.muted).child(text);
    const form = v_flex().gap(4).pl(2)
      .child(note(b.kind === "plugin" ? "外掛要原本的網址（kit collect 連同 LICENSE 收）。可以貼它資料夾的網頁網址。"
        : "知道原本的網址：kit collect 連同 LICENSE 收（可以貼技能資料夾的網頁網址）。不知道：kit new 照這台的這份收。"))
      .child(Input.new(this.takeUrl).flex_none().h(28).px(8).rounded(6).border_1().border_color(t.border).bg(t.background).text_size(z - 1).text_color(t.foreground));
    if (!own.length) return row.child(form.child(note("沒有自己的來源（push: direct）可以收：只收進自己的，不收進團隊的。", t.ansi1)));
    form.child(h_flex().gap(4).items_center().flex_wrap().child(note("收進："))
      .children(own.map((s) => btn(t, z, `take-to-${s.name}`, s.name, { small: true, kind: s.name === source ? "primary" : undefined,
        on: (cx) => { this.taking = { key, source: s.name }; cx.notify(); } }))));
    return row.child(form.child(h_flex().gap(6)
      .child(btn(t, z, `take-go-${key}`, "確定收進 kit", { small: true, kind: "primary", off: busy || (b.kind === "plugin" && !url),
        on: (cx) => { this.taking = null; this.takeIn(b, url, source, cx); } }))
      .child(btn(t, z, `take-no-${key}`, "取消", { small: true, off: busy, on: (cx) => { this.taking = null; cx.notify(); } }))));
  }
  // 收進 kit: kit collect <url> --to <source> --allow (an own source may add the author to collect_sources), or kit new
  // skill <name> --from <its folder> --to <source>. Only collected: adding it is the row's own 加到… under 還沒用的 (jay:
  // collecting and adding are separate steps)
  takeIn(b, url, source, cx) {
    const pk = `blocked:${b.kind}:${b.name}`, machine = this.target?.machine ?? null, msg = MSG(this.where);
    const first = url ? ["collect", url, "--to", source, "--allow"] : ["new", "skill", b.name, "--from", b.path, "--to", source];
    const started = kitAction(this, cx, { label: `收進 kit ${b.name}`, args: first, ttl: LONG, machine, msg,
      okText: `已收進 ${source}：${b.name}。還沒有 agent 會用：要用，在下面「還沒用的」按加到…；要給別台用，到倉庫按「送出」。`,
      after: () => { this.pend = { ...(this.pend ?? {}), [pk]: shared(msg)?.ok === true ? { done: true, at: Date.now() } : null }; markChanged(machine); } });
    if (started) this.pend = { ...(this.pend ?? {}), [pk]: { doing: true } };
  }

  // 這個對話用了 N 次 (・剛剛: in the conversation's last turn) after a row's name, when this conversation used it
  usedBadge(t, z, head, i) {
    const u = usedOf(this.used, i.kind, i.name);
    if (u) head.child(div().flex_none().px(5).rounded(4).text_size(z - 2.5).text_color(t.background).bg(u.recent ? t.accent : t.dim)
      .child(`這個對話用了 ${u.count} 次${u.recent ? "・剛剛" : ""}`));
  }

  // a row's name and its one-line description; a click shows the whole description (wrapped, selectable) and, under
  // it, the original when the line shown is kit describe's Chinese one; another click hides it
  descCol(t, z, key, head, sub, full, orig = "") {
    const open = this.shown.has(key);
    return v_flex().id(`desc-${key}`).min_w(0).gap(1).cursor_pointer().on_mouse_down("left", stop)
      .on_click((_e, cx) => { if (open) this.shown.delete(key); else this.shown.add(key); cx.notify(); })
      .child(head)
      .when(Boolean(sub) && !open, (el) => el.child(copyOnRight(div().min_w(0).truncate().text_size(z - 1.5).text_color(t.muted).child(sub), full)))
      .when(Boolean(sub) && open, (el) => el.child(div().text_size(z - 1.5).text_color(t.muted).child(textBlock(`desc-text-${key}`, orig ? `${sub}\n\n原文：${orig}` : sub))));
  }

  // one of kit's things: for this folder (加到這個資料夾 / 從資料夾拿掉) and for the account (加到整個帳號 / 從帳號拿掉;
  // required ones cannot be taken off)
  row(t, z, i, from = false) {
    const busy = Boolean(this.busy), f = this.folder, inDir = Boolean(f?.has.has(`${i.kind}:${i.name}`));
    const canDir = Boolean(f && !f.why);
    const badge = (text, color) => div().flex_none().px(5).rounded(4).text_size(z - 2.5).text_color(t.background).bg(color).child(text);
    const head = h_flex().gap(5).items_center().min_w(0)
      .child(copyOnRight(div().min_w(0).truncate().font_semibold().text_color(i.status === "unused" && !inDir ? t.muted : t.foreground).child(i.name), i.name));
    if (i.status === "required") head.child(badge("Kit · 團隊必備", t.accent));
    if (i.status === "used") head.child(badge("Kit · 整個帳號", t.working));
    if (inDir) head.child(badge("Kit · 這個資料夾", t.done));
    if (i.new) head.child(badge("新", t.done));
    // its version, and 舊版 with why under the row (only what this agent reads; never in root's look-only list)
    const ver = this.vers ? versionText(i) : null;
    const old = this.vers && !this.ro && (i.status === "used" || i.status === "required" || inDir) ? oldReason(i, this.tool, this.data?.claude_mcp) : null;
    if (old) head.child(badge("舊版", t.muted));
    this.usedBadge(t, z, head, i);
    if (ver) head.child(div().id(`ver-${i.kind}-${i.name}`).flex_none().text_size(z - 2.5).text_color(t.muted).tooltip(ver.tip || ver.text).child(ver.text));
    const dirArgs = (verb) => [verb, "--dir", f.dir, i.kind, i.name];
    const fd = f ? shortDir(f.dir) : "";
    const action = h_flex().flex_none().gap(4).items_center();
    const pend = this.pendOf(i, inDir);
    const WORDS = { used: ["加入中…", "✓ 已加到整個帳號"], unused: ["拿掉中…", "✓ 已從帳號拿掉"], dir: ["加入中…", "✓ 已加到這個資料夾"], nodir: ["拿掉中…", "✓ 已從資料夾拿掉"] };
    if (pend) action.child(pend.doing
      ? h_flex().gap(4).items_center().px(8).h(24).rounded(6).bg(t.raised).text_size(z - 1.5).text_color(t.muted).child(spin(z - 3, t.muted)).child(WORDS[pend.doing][0])
      : div().text_size(z - 1.5).text_color(t.done).child(WORDS[pend.done][1]));
    // An agent started in a folder only changes that folder; the account is changed only from one started in the home
    // folder (there the folder buttons make no sense: the home folder is the account). No button that reaches further
    // than the folder the agent runs in.
    // not added before what it needs is installed (jay): kit can install it, so 安裝／裝套件 under the row comes first
    const first = i.status === "unused" && !inDir && [...(i.needs ?? []), ...(i.packages ?? [])].some((x) => !x.ok && x.install && !x.bad);
    if (pend || this.ro) { /* its 加入中… / ✓ above; look only: nothing */ } else if (first) {
      action.child(div().text_size(z - 1.5).text_color(t.dim).child("先裝好才能加"));
    } else if (canDir && i.kind === "plugin") {   // a plugin: the whole account only
      action.child(div().text_size(z - 1.5).text_color(t.dim).child(i.status === "unused" ? "只能加到整個帳號" : "整個帳號的"));
    } else if (canDir) {
      if (inDir) action.child(btn(t, z, `rmdir-${i.kind}-${i.name}`, "從資料夾拿掉", { small: true, off: busy, on: (cx) => this.rowAct(i, "nodir", `從資料夾拿掉 ${i.name}`, dirArgs("rm"), cx, `已從 ${fd} 拿掉 ${i.name}。在 ${fd} 開新的對話就不會有了。`) }));
      else if (i.status === "unused") action.child(btn(t, z, `adddir-${i.kind}-${i.name}`, "加到這個資料夾", { small: true, kind: "primary", off: busy, on: (cx) => this.rowAct(i, "dir", `加到這個資料夾 ${i.name}`, dirArgs("add"), cx, `已加到 ${fd}：${i.name}。在 ${fd}（含子資料夾）開新的對話才會讀到，別的地方不受影響。`) }));
    } else if (i.status === "required") action.child(div().text_size(z - 1.5).text_color(t.dim).child("拿不掉"));
    else if (i.status === "used") action.child(btn(t, z, `rm-${i.kind}-${i.name}`, "從帳號拿掉", { small: true, off: busy, on: (cx) => this.rowAct(i, "unused", `從帳號拿掉 ${i.name}`, ["rm", i.kind, i.name], cx, `已從整個帳號拿掉 ${i.name}。開新的對話就不會有了。`) }));
    else if (!inDir) action.child(btn(t, z, `add-${i.kind}-${i.name}`, "加到整個帳號", { small: true, kind: "primary", off: busy, on: (cx) => this.rowAct(i, "used", `加到整個帳號 ${i.name}`, ["add", i.kind, i.name], cx, `已加到整個帳號：${i.name}。每個資料夾開新的對話都會讀到。`) }));
    const sub = [from && i.from ? `收自 ${i.from}` : "", i.description_zh || i.description, i.source].filter(Boolean).join(" · ");
    const row = h_flex().gap(8).items_center()
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(this.descCol(t, z, `${i.kind}-${i.name}`, head, sub, i.description_zh || i.description || i.source || sub, i.description_zh ? i.description : ""))
        .when(Boolean(partsLine(i.parts)), (el) => el.child(copyOnRight(div().min_w(0).truncate().text_size(z - 1.5).text_color(t.dim).child(partsLine(i.parts)), partsLine(i.parts)))))
      .child(action);
    // what is missing for it to run: programs (node, python ...), then its own npm packages
    const missing = (i.needs ?? []).filter((x) => !x.ok).map((x) => ({
      key: `${i.name}-${x.tool}`, install: x.install, label: x.have ? "升級" : "安裝", title: x.title,
      what: `需要 ${x.title}${x.min ? ` ${x.min} 以上` : ""}（${x.have ? `這台是 ${x.have}，太舊` : "這台沒有"}）`,
      none: "請自己裝：這台沒有 kit 可以用的安裝方式",
      args: ["install-tool", x.tool, ...(x.min ? ["--min", x.min] : [])],
    }));
    for (const pk of (i.packages ?? []).filter((x) => !x.ok)) {
      const py = pk.kind === "pip", lang = py ? "Python" : "npm";
      // an MCP's one pinned package (kit list --json, api 1.3): not installed = downloaded each time it starts
      if (i.kind === "mcp") {
        const what = `${pk.package}${pk.version ? `@${pk.version}` : ""}`;
        missing.push({
          key: `${i.name}-mcp`, install: pk.bad ? "" : pk.install, label: "裝套件", title: `MCP ${i.name} 的套件`,
          what: pk.had ? `套件 ${what} 要重裝（版本改過了）：現在每次啟動時下載` : `每次啟動時下載 ${what}`,
          note: "裝在 kit 自己的資料夾，固定這個版本，不跑套件自己的安裝程式；裝好後 kit sync 改成直接跑裝好的",
          none: pk.bad ? `kit 不幫它裝：${pk.bad}` : (py ? "要先有 Python 才能裝" : "要先有 Node.js（npm）才能裝"),
          args: ["install-deps", "mcp", i.name],
        });
        continue;
      }
      missing.push({
        key: `${i.name}-${pk.kind}`, install: pk.bad ? "" : pk.install, label: pk.had ? "更新" : "安裝", title: `${i.name} 的 ${lang} 套件`,
        what: pk.had ? `它的 ${lang} 套件要更新（技能改過了）` : `需要先裝它自己的 ${lang} 套件`,
        note: py ? "裝在 kit 自己的 venv，只裝現成的 wheel，不跑套件自己的安裝程式" : "裝在 kit 自己的資料夾，只裝 npm registry 上的版本，不跑套件自己的安裝程式",
        none: !pk.bad ? (py ? "要先有 Python 才能裝" : "要先有 Node.js（npm）才能裝")
          : py ? `kit 不裝：requirements.txt 第 ${pk.bad}（只能寫套件名和版本）`
          : `kit 不裝：${pk.bad}（只能裝 npm registry 上的版本，不能是 git、網址、檔案或連結）`,
        args: ["install-deps", i.name, pk.kind],
      });
    }
    // an MCP's ${VAR}s that this machine has not set (names only; the values are never read here)
    const unset = (i.vars ?? []).filter((v) => v && v.set === false && typeof v.name === "string").map((v) => v.name);
    return v_flex().id(`row-${i.kind}-${i.name}`).gap(4).px(8).py(5).rounded(6).hover((s) => s.bg(t.hover))
      .child(row)
      .when(Boolean(old), (el) => el.child(div().pl(2).text_size(z - 1.5).text_color(t.muted).child(old?.why ?? "")))
      .when(unset.length > 0, (el) => el.child(div().pl(2).text_size(z - 1.5).text_color(t.working)
        .child(`⚠ 這台沒設環境變數：${unset.join("、")}（設好再開新的對話；值不會進倉）`)))
      .children(missing.map((x) => this.needLine(t, z, x)));
  }

  // something a skill needs that this machine lacks (a program, or too old; its own packages): 安裝 shows kit's
  // command first, 確定安裝 runs it
  needLine(t, z, x) {
    const busy = Boolean(this.busy), asking = this.asking === x.key;
    const line = h_flex().gap(6).items_center().flex_wrap().pl(2).text_size(z - 1.5)
      .child(div().text_color(t.working).child(`⚠ ${x.what}`));
    if (!x.install) return line.child(div().text_color(t.muted).child(x.none));
    // while kit installs it: said on its own row (jay: the greyed buttons alone did not say anything was happening)
    if (this.busy === `安裝 ${x.title}`) return line.child(h_flex().gap(4).items_center().text_color(t.muted).child(spin(z - 3, t.muted))
      .child("安裝中…（大的套件要幾分鐘）"));
    if (!asking) return line.child(btn(t, z, `need-${x.key}`, x.label, { small: true, off: busy, on: (cx) => { this.asking = x.key; cx.notify(); } }));
    return v_flex().gap(4).pl(2).text_size(z - 1.5)
      .child(div().text_color(t.working).child(`⚠ ${x.what}`))
      .child(h_flex().gap(6).items_center().flex_wrap()
        .child(div().text_color(t.muted).child("會執行："))
        .child(copyOnRight(div().px(5).rounded(4).bg(t.raised).font_family(mono()).child(x.install), x.install)))
      .when(Boolean(x.note), (el) => el.child(div().text_color(t.muted).child(x.note)))
      .child(h_flex().gap(6)
        .child(btn(t, z, `need-go-${x.key}`, "確定安裝", { small: true, kind: "primary", off: busy, on: (cx) => { this.asking = null; this.act(`安裝 ${x.title}`, x.args, cx, LONG); } }))
        .child(btn(t, z, `need-no-${x.key}`, "取消", { small: true, off: busy, on: (cx) => { this.asking = null; cx.notify(); } })));
  }
}

