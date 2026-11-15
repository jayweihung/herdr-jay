// What's trending on the social sites now, beside your agents, and a trend agent to ask about it (like Gerrit's
// panel and its 問 agent). The data costs no tokens: launchd runs fetch.js every hour (last30days --discover, no
// model), which writes <Herdr home>/trend/trends.json and status.json; this mod only reads them (docs/trend.md).
// Asking costs tokens, only when you ask: the question goes to a kit trend agent (agents/trend.md in a kit source,
// skills: last30days) in this space with `hc send`; none here: the Kit panel places one (kit place) and it starts on
// the question.
// Roles (props.role): the panel (default) and "toggle", the tab-bar button that shows or hides the layout's
// "trend-panel": a number for topics you haven't seen, a ring while fetch.js runs, a red ! when its last run failed.
// 熱門：launchd 每小時跑 fetch.js（不花 token）寫 trend/；這個 mod 只讀。問問題才叫 trend agent（花 token）。
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, settings, notify, appHome, readTextFile, exec, run, layout, shared, setShared, agents, terminals, focused, spaces, window, hc as herdrHc, props as blockProps } from "herdr";
import process from "process";

const TOGGLE = "trend-toggle", PANEL = "trend-panel";
const JOB = "com.herdr-jay.trend";   // the launchd job that runs fetch.js (docs/trend.md)
const TASK = "herdr-jay-trend";      // the same on Windows: a Task Scheduler task
const HOUR = 3600000;                // its StartInterval
const SEEN = "trend.seen.v1";        // the topics shown when the panel was last opened: the button counts the others
// The Kit panel's (mods/kit): the agents its sources have, and the places it is asked to make. A kit trend agent
// placed in a space is a folder whose .agentkit says agent:trend (kit place).
const KIT_AGENTS = "kit.agents.data.v1", KIT_PLACE_ASK = "kit.place.ask", KIT_TAKEN_WAIT = 8000;
const TOOLS = ["claude", "codex", "omp"], TOOL_NAMES = { claude: "Claude", codex: "Codex", omp: "omp" };
const toolOf = (x) => {
  const n = String(x ?? "").replace(/\\/g, "/").split("/").pop().replace(/\.(exe|cmd|ps1)$/i, "").toLowerCase();
  return n === "codex" ? "codex" : n === "omp" || n === "pi" ? "omp" : "claude";
};
// Written the Claude way (/last30days …); each tool calls a skill its own way
const skillFor = (text, tool) => String(text).replace(/^\/last30days\b/, tool === "codex" ? "$last30days" : tool === "omp" ? "/skill:last30days" : "/last30days");
const isTrendKit = (text) => /^agent:trend[ \t]*$/m.test(String(text ?? ""));
const PRESETS = [
  { label: "🔎 深入查", text: (r) => `/last30days ${r.topic}` },
  { label: "三句話說明", text: (r) => `用繁體中文三句話說明「${r.topic}」最近發生什麼事、為什麼大家在討論。這一題的來源在 ~/.config/herdr-app/trend/trends.json（topic 是 ${JSON.stringify(r.topic)}），先看那些連結，不夠再查。` },
];
const MOMENTUM = { "new-this-week": "本週新", building: "升溫中" };
const SOURCE = { hackernews: "HN", reddit: "Reddit", digg: "Digg", x: "X", grounding: "網頁", youtube: "YouTube", polymarket: "Polymarket", github: "GitHub" };
const STATE = { "rate-limited": "被限流", "auth-failed": "登入失效", "payment-required": "額度用完", unreachable: "連不到", timeout: "逾時",
  "schema-drift": "讀不到（常是被擋）", "skipped-unconfigured": "沒設定", error: "出錯", partial: "部分", "no-results": "沒結果" };
// why_spiking without the engine's own counting sentence (the line above shows the numbers): the headline that's left
const why = (r) => String(r.why_spiking ?? "").replace(/^\d+ evidence items? on .*? generated [\d,]+ native interactions?\.\s*/, "") || String(r.why_spiking ?? "");

const fs = () => Number(settings().ui_font_size) || 13;
const stop = (_e, cx) => cx.stop_propagation();
const spin = (size, color) => svg("mods/workspace-chrome/spinner.svg").size(size).flex_none().text_color(color).spin(900);
const ago = (ms) => { const m = Math.max(0, Math.floor((Date.now() - ms) / 60000)); return m < 1 ? "剛剛" : m < 60 ? `${m} 分前` : m < 1440 ? `${Math.floor(m / 60)} 小時前` : `${Math.floor(m / 1440)} 天前`; };
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const num = (n) => (n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
// "HN 4.7k 分 · 3.5k 留言 · Reddit 1.2k 分": each source's own counters, the ones people know
function engagementText(e) {
  return Object.entries(e ?? {}).map(([src, c]) => {
    const n = (k) => (typeof c?.[k] === "number" ? c[k] : null);
    const parts = [[n("points") ?? n("score") ?? n("likes") ?? n("digg_score"), "分"], [n("comments") ?? n("num_comments") ?? n("replies"), "留言"]]
      .filter(([v]) => v != null).map(([v, w]) => `${num(v)} ${w}`);
    return parts.length ? `${SOURCE[src] ?? src} ${parts.join(" · ")}` : null;
  }).filter(Boolean).join("　");
}
const copyOn = (value) => (_e, cx) => {
  const text = String(value ?? "");
  if (!text) return;
  cx.stop_propagation();
  cx.write_to_clipboard(text);
  notify({ title: "已複製", body: text.length > 120 ? `${text.slice(0, 120)}…` : text, level: "success", timeout: 1500 });
};
// Only web links, with the system's own opener
async function openLink(url) {
  if (!/^https?:\/\//i.test(url)) return;
  const p = window()?.platform;
  if (p === "windows") await process.run("C:\\Windows\\System32\\rundll32.exe", ["url.dll,FileProtocolHandler", url]).catch(() => {});
  else await process.run(p === "macos" ? "/usr/bin/open" : "xdg-open", [url]).catch(() => {});
}
const shortLink = (url) => { try { const u = new URL(url); return `${u.hostname}${u.pathname.length > 1 ? u.pathname.slice(0, 40) : ""}`; } catch { return url.slice(0, 60); } };
function find(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = find(c, id); if (f) return f; }
  return null;
}

export default class Trend extends View {
  init(_p, cx) {
    this.role = blockProps()?.role ?? "panel";
    if (this.role !== "toggle") {
      this.box = InputState.new({ placeholder: "問 trend agent，例如：這週 AI 圈最大的事是什麼？" });
      this.box.on("submit", (_e, cx) => cx.spawn(async (cx) => this.askFree(cx))); // Enter
    }
    this.load(cx);
    cx.timer.every(15000, (cx) => this.load(cx)); // fetch.js writes once an hour; this also keeps 「幾分前」 fresh
    cx.timer.every(1000, (cx) => { if (this.kitChanged) { this.kitChanged = false; cx.notify(); } }); // a trend agent's folder found
  }

  get dir() { return `${appHome().replace(/\\/g, "/")}/trend`; }
  async load(cx) {
    const [t, s] = await Promise.all([readTextFile(`${this.dir}/trends.json`).catch(() => null), readTextFile(`${this.dir}/status.json`).catch(() => null)]);
    try { this.data = t ? JSON.parse(t) : null; this.bad = null; } catch (e) { this.bad = `trends.json 讀不懂：${e.message ?? e}`; }
    try { this.status = s ? JSON.parse(s) : null; } catch { this.status = null; }
    cx.notify();
  }
  get results() { return Array.isArray(this.data?.results) ? this.data.results : []; }
  // a run killed midway (the Mac slept, shut down) never writes finished: after 30 minutes it isn't running
  get running() { return Boolean(this.status?.started && !this.status?.finished && Date.now() - Date.parse(this.status.started) < 1800000); }
  get failed() { return this.status?.ok === false ? this.status.error || "上次沒抓成功" : null; }

  // ↻: run the scheduled job now (launchd on macOS, Task Scheduler on Windows); it writes status.json at once
  async kick(cx) {
    this.msg = null;
    try {
      const r = window()?.platform === "windows"
        ? await exec("C:\\Windows\\System32\\schtasks.exe", ["/Run", "/TN", TASK])
        : await exec("/bin/launchctl", ["kickstart", `gui/${(await exec("/usr/bin/id", ["-u"])).stdout.trim()}/${JOB}`]);
      if (r.code !== 0) this.msg = `排程還沒裝（docs/trend.md「安裝」）：${(r.stderr || r.stdout).trim().slice(0, 120)}`;
    } catch (e) { this.msg = `沒跑起來：${e?.message ?? e}`; }
    cx.timer.after(1500, (cx) => this.load(cx));
    cx.notify();
  }

  // ---- asking the trend agent (as Gerrit's panel asks its gerrit agent)
  // Only kit trend agents (folder's .agentkit says agent:trend): another agent may lack last30days. This space's first.
  agentList() {
    let all = [];
    try { all = (agents() ?? []).filter((x) => x?.address); } catch {}
    const kit = this.kitAgents(all), here = this.currentSpace()?.id;
    return all.filter((x) => kit.has(x.address)).sort((a, b) => Number(b.space === here) - Number(a.space === here));
  }
  // The agents whose folder (or one up to 3 above) has an .agentkit saying agent:trend; each folder read once a minute
  kitAgents(all) {
    this.kitDirs ??= new Map();
    let cwds = new Map();
    try { cwds = new Map((terminals() ?? []).map((t) => [t?.address, t?.cwd])); } catch {}
    const found = new Set();
    for (const x of all) {
      const cwd = cwds.get(x.address);
      if (!cwd || x.address.includes("/")) continue;   // another machine's folder can't be read from here
      const dirs = [];
      for (let d = String(cwd).replace(/[\\/]+$/, ""), i = 0; d && i < 4; i++) {
        dirs.push(d);
        const up = d.replace(/[\\/][^\\/]*$/, "");
        if (up === d) break;
        d = up;
      }
      if (dirs.some((d) => this.kitDirs.get(d)?.trend)) found.add(x.address);
      for (const d of dirs) {
        const k = this.kitDirs.get(d);
        if (k && (k.reading || Date.now() - k.at < 60000)) continue;
        this.kitDirs.set(d, { trend: k?.trend ?? false, at: Date.now(), reading: true });
        readTextFile(`${d}/.agentkit`).then(isTrendKit, () => false).then((trend) => {
          this.kitDirs.set(d, { trend, at: Date.now() });
          if (trend !== Boolean(k?.trend)) this.kitChanged = true;
        });
      }
    }
    return found;
  }
  currentSpace() {
    let f = null, all = [];
    try { f = focused(); all = spaces() ?? []; } catch {}
    return all.find((s) => s.id === f?.space) ?? null;
  }
  kitHasTrend() { return (shared(KIT_AGENTS)?.agents ?? []).some((a) => a?.name === "trend"); }
  openTool() { const t = localStorage.getItem("tool"); return TOOLS.includes(t) ? t : "claude"; }
  picked(list) { const want = this.agentAddr ?? localStorage.getItem("agent"); return list.find((x) => x.address === want) ?? list[0] ?? null; }

  async ask(label, text, cx) {
    const target = this.picked(this.agentList());
    if (!target) return this.openAndAsk(label, text, cx);
    this.asked = { sending: label };
    cx.notify();
    let err = null;
    try {
      // Herdr's own hc(): it reaches the running core
      const out = await herdrHc(["send", target.address, skillFor(text, toolOf(target.app))]);
      if (out?.code !== 0) err = String(out?.stderr || out?.stdout || `exit ${out?.code}`).trim().slice(0, 200);
    } catch (e) { err = String(e?.message ?? e); }
    this.asked = err ? { error: `沒送出：${err}` } : { sent: label, to: target.title || target.tab_name || target.address };
    if (!err) try { run("agent.focus", { terminal: target.address }); } catch {}
    cx.notify();
  }
  // None here: the Kit panel puts a trend agent in this space (kit place) with the question as its first message
  openAndAsk(label, text, cx) {
    const space = this.currentSpace();
    if (!space) { this.asked = { error: "沒有開著的 space" }; cx.notify(); return; }
    if (!this.kitHasTrend()) { this.asked = { error: "kit 來源還沒有 trend agent（docs/trend.md「安裝」）" }; cx.notify(); return; }
    const id = `trend-${Date.now()}-${Math.random()}`, tool = this.openTool();
    const plain = { id: space.id, name: space.name ?? "", machine: space.machine ?? null, folder: space.folder ?? "" };
    const asks = Array.isArray(shared(KIT_PLACE_ASK)) ? shared(KIT_PLACE_ASK) : [];
    setShared(KIT_PLACE_ASK, [...asks, { id, agent: "trend", space: plain, tool, label: "熱門面板", at: Date.now(), task: skillFor(text, tool) }]);
    this.asked = { opening: label, to: `trend（在 ${space.name || "這個 space"} 開一個）` };
    cx.timer.after(KIT_TAKEN_WAIT, (cx) => {
      const left = Array.isArray(shared(KIT_PLACE_ASK)) ? shared(KIT_PLACE_ASK) : [];
      if (!left.some((x) => x?.id === id)) return;
      setShared(KIT_PLACE_ASK, left.filter((x) => x?.id !== id));
      this.asked = { error: "Kit 面板沒有接手：版面裡要有 Kit 的按鈕（或從 Agents 面板把 trend 拖到 space）" };
      cx.notify();
    });
    cx.notify();
  }
  async askFree(cx) {
    const q = this.box.value().trim();
    if (!q) return;
    this.box.set_value("");
    await this.ask("你的問題", q, cx);
  }

  render(cx) {
    if (this.role === "toggle") return this.renderToggle();
    const t = theme(), z = fs();
    return v_flex().id("trend").size_full().bg(t.surface).text_size(z).text_color(t.foreground)
      .child(this.header(t, z))
      .child(this.list(t, z))
      .child(this.askCard(t, z));
  }

  // The tab-bar button: 熱門, how many topics you haven't seen, a ring while fetching, ! when the last run failed
  renderToggle() {
    const t = theme(), node = find(layout(), PANEL), on = node && !node.hidden;
    const seen = new Set(Array.isArray(shared(SEEN)) ? shared(SEEN) : []);
    const fresh = this.results.filter((r) => !seen.has(r.topic)).length;
    const badge = this.running ? spin(12, t.muted)
      : this.failed ? div().text_color(t.ansi1).child("!")
      : fresh ? div().px(5).rounded(8).text_size(11).font_semibold().bg(t.blocked).text_color(t.background).child(String(fresh)) : null;
    return h_flex().size_full().pr(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("toggle-trend").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover((st) => st.bg(t.hover)).on_mouse_down("left", stop)
        .on_click((_e, cx) => {
          if (!on) setShared(SEEN, this.results.map((r) => r.topic)); // opening it: what it shows now counts as seen
          run("layout.toggle", { id: PANEL });
          cx.notify();
        })
        .child("熱門")
        .when(Boolean(badge), (el) => el.child(badge)));
  }

  header(t, z) {
    const btn = (id, label, fn) => div().id(id).h(28).px(10).flex().items_center().rounded(6).cursor_pointer().bg(t.raised).text_color(t.foreground)
      .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop).on_click(fn).child(label);
    const done = Date.parse(this.status?.finished ?? this.data?.generated_at ?? "");
    const next = Date.parse(this.status?.started ?? "") + HOUR;
    const line = this.running ? `更新中…（${ago(Date.parse(this.status.started)).replace("前", "開始")}，通常幾分鐘）`
      : this.bad ?? this.failed ?? (Number.isFinite(done) ? `更新於 ${ago(done)}${Number.isFinite(next) && next > Date.now() ? ` · 下次約 ${hhmm(next)}` : ""} · 不花 token` : "還沒有資料：排程還沒跑過（docs/trend.md「安裝」）");
    const red = Boolean(this.bad || (this.failed && !this.running));
    const sources = Object.entries(this.data?.source_status ?? {});
    return v_flex().flex_none().border_b(1).border_color(t.border)
      .child(h_flex().px(10).py(6).gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().font_semibold().child("熱門"))
        .child(btn("refresh", this.running ? "更新中…" : "↻ 現在更新", (_e, cx) => cx.spawn(async (cx) => this.kick(cx))))
        .when(Boolean(find(layout(), TOGGLE)), (el) => el.child(btn("hide", "✕", () => run("layout.hide", { id: PANEL })))))
      .child(h_flex().px(12).pb(4).gap(5).items_center().min_w(0)
        .when(this.running, (el) => el.child(spin(z - 3, t.muted)))
        .child(div().id("status").flex_1().min_w(0).text_size(z - 1.5).truncate().text_color(red ? t.ansi1 : t.muted)
          .on_mouse_down("right", copyOn(line)).child(line)))
      .when(Boolean(this.msg), (el) => el.child(div().id("msg").px(12).pb(4).text_size(z - 1.5).text_color(t.ansi1).whitespace_normal()
        .on_mouse_down("right", copyOn(this.msg)).child(this.msg)))
      // which sites answered this run: a site that didn't isn't "nothing happened there"
      .when(sources.length > 0, (el) => el.child(h_flex().px(12).pb(6).gap(8).flex_wrap().text_size(z - 2).children(sources.map(([k, v]) =>
        div().text_color(v === "ok" ? t.ansi2 : t.dim).child(`${SOURCE[k] ?? k} ${v === "ok" ? "✓" : `✗ ${STATE[v] ?? v}`}`)))));
  }

  list(t, z) {
    const list = v_flex().id("list").flex_1().min_h(0).overflow_y_scrollbar();
    if (!this.results.length) {
      const why = this.data?.outcome === "nothing-solid" ? `這一輪沒有夠強的熱門${this.data.weak_signal ? `（最接近的：${this.data.weak_signal}）` : ""}` : "還沒有主題";
      return list.child(div().p(14).text_color(t.muted).child(why));
    }
    const seen = new Set(Array.isArray(shared(SEEN)) ? shared(SEEN) : []);
    for (const r of this.results) list.child(this.row(t, z, r, !seen.has(r.topic)));
    return list;
  }

  row(t, z, r, fresh) {
    const open = this.open === r.topic;
    const chip = (text, color) => div().px(6).rounded(4).text_size(z - 2.5).flex_none().bg(t.raised).text_color(color).child(text);
    const row = v_flex().id(`r-${r.rank}`).px(12).py(8).gap(3).border_b(1).border_color(t.border).cursor_pointer()
      .when(open, (el) => el.bg(t.selected)).hover((s) => (open ? s : s.bg(t.hover)))
      .on_click((_e, cx) => { this.open = open ? null : r.topic; this.asked = null; cx.notify(); })
      .child(h_flex().gap(6).items_center().min_w(0)
        .child(div().w(18).flex_none().text_color(t.dim).child(String(r.rank)))
        .child(div().flex_1().min_w(0).truncate().font_semibold().on_mouse_down("right", copyOn(r.topic)).child(r.topic))
        .when(fresh, (el) => el.child(div().w(6).h(6).rounded(3).flex_none().bg(t.accent)))
        .when(Boolean(MOMENTUM[r.momentum]), (el) => el.child(chip(MOMENTUM[r.momentum], r.momentum === "new-this-week" ? t.ansi2 : t.ansi3))))
      .child(div().pl(24).text_size(z - 1.5).text_color(t.muted).truncate().child(engagementText(r.engagement) || (r.sources ?? []).map((s) => SOURCE[s] ?? s).join("、")));
    if (!open) return row.child(div().pl(24).text_size(z - 1.5).text_color(t.dim).truncate().child(why(r)));
    row.child(div().pl(24).text_size(z - 1).whitespace_normal().child(why(r)));
    if (r.top_comment) row.child(div().ml(24).pl(8).border_l(2).border_color(t.border).text_size(z - 1.5).text_color(t.muted).whitespace_normal().child(r.top_comment));
    (r.evidence_urls ?? []).slice(0, 6).forEach((u, i) => row.child(div().id(`u-${r.rank}-${i}`).pl(24).text_size(z - 1.5).text_color(t.accent).truncate()
      .hover((s) => s.underline()).on_mouse_down("left", stop).on_mouse_down("right", copyOn(u))
      .on_click((_e, cx) => { cx.stop_propagation(); openLink(u); }).child(`↗ ${shortLink(u)}`)));
    row.child(h_flex().pl(24).pt(4).gap(6).flex_wrap().children(PRESETS.map((p, i) =>
      div().id(`p-${r.rank}-${i}`).h(30).px(12).flex().items_center().rounded(6).cursor_pointer().font_semibold().text_size(z - 0.5)
        .bg(i === 0 ? t.solid : t.background).text_color(i === 0 ? t.solid_foreground : t.foreground).border_1().border_color(i === 0 ? t.solid : t.border).hover((s) => s.opacity(0.88))
        .on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); cx.spawn(async (cx) => this.ask(`${p.label}：${r.topic}`, p.text(r), cx)); })
        .child(this.asked?.sending === `${p.label}：${r.topic}` ? "送出中…" : p.label))));
    return row;
  }

  // 問 agent: which trend agent (this space's first), the tool a new one opens with, a free question, what happened
  askCard(t, z) {
    const list = this.agentList(), picked = this.picked(list);
    const card = v_flex().id("ask").flex_none().gap(6).p(10).bg(t.chrome).border_t(1).border_color(t.border);
    card.child(div().text_size(z - 1).font_semibold().text_color(t.muted).child(picked ? `問 agent：${picked.title || picked.tab_name}（花 token）` : "問 agent（花 token）"));
    if (list.length > 1) card.child(h_flex().gap(6).flex_wrap().children(list.slice(0, 8).map((x, i) => {
      const on = picked?.address === x.address;
      return div().id(`ag-${i}`).px(8).py(3).rounded(5).text_size(z - 1.5).cursor_pointer()
        .bg(on ? t.accent : t.raised).text_color(on ? t.background : t.foreground).hover((h) => (on ? h : h.bg(t.hover)))
        .on_click((_e, cx) => { this.agentAddr = x.address; localStorage.setItem("agent", x.address); cx.notify(); })
        .child(`${x.title || x.tab_name || x.address}${x.space_name ? ` · ${x.space_name}` : ""}`);
    })));
    if (!list.length) card.child(div().text_size(z - 1.5).text_color(t.dim).whitespace_normal()
      .child(this.kitHasTrend() ? "還沒有 trend agent：問了會先在這個 space 開一個，開好就回答。" : "kit 來源還沒有 trend agent（docs/trend.md「安裝」）。"));
    if (!list.length && this.kitHasTrend()) card.child(h_flex().gap(6).items_center()
      .child(div().text_size(z - 1.5).text_color(t.dim).child("用"))
      .children(TOOLS.map((k) => {
        const on = this.openTool() === k;
        return div().id(`tool-${k}`).px(8).py(2).rounded(5).text_size(z - 1.5).cursor_pointer()
          .bg(on ? t.accent : t.raised).text_color(on ? t.background : t.foreground).hover((h) => (on ? h : h.bg(t.hover)))
          .on_click((_e, cx) => { localStorage.setItem("tool", k); cx.notify(); }).child(TOOL_NAMES[k]);
      }))
      .child(div().text_size(z - 1.5).text_color(t.dim).child("開")));
    card.child(h_flex().gap(6).items_center()
      .child(div().id("ask-box").flex_1().min_w(0).h(34).px(6).flex().items_center().rounded(6).bg(t.background).border_1().border_color(t.input)
        .cursor_text().child(Input.new(this.box).w_full().text_size(z).text_color(t.foreground)))
      .child(div().id("ask-send").h(34).px(14).flex().items_center().rounded(7).cursor_pointer().font_semibold().bg(t.solid).text_color(t.solid_foreground)
        .hover((s) => s.opacity(0.88)).on_click((_e, cx) => cx.spawn(async (cx) => this.askFree(cx))).child("送出")));
    const s = this.asked;
    if (s?.error) card.child(div().id("ask-err").text_size(z - 1).text_color(t.ansi1).whitespace_normal().on_mouse_down("right", copyOn(s.error)).child(s.error));
    else if (s?.sent) card.child(div().text_size(z - 1).text_color(t.ansi2).whitespace_normal().child(`✓「${s.sent}」已送給 ${s.to}，在它的分頁回答`));
    else if (s?.opening) card.child(div().text_size(z - 1).text_color(t.ansi2).whitespace_normal().child(`✓ ${s.to}，開好就回答「${s.opening}」`));
    return card;
  }
}
